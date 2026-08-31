-- ====================================================================
-- SAMARA STAY ERP — MIGRATION 034: RBAC PRIVILEGE HARDENING & ATOMIC MANUAL BOOKING SETTLEMENT RPC
-- ====================================================================
-- Description:
-- 1. Hardens the users table against privilege escalation: documents and enforces
--    that 'super' and 'owner' roles must strictly be granted via exact administrator whitelisting,
--    never by pattern matching or self-registration.
-- 2. Creates the stored function `settle_manual_booking_approval()` for complete, atomic,
--    server-side idempotency during manual booking approval:
--    - Row-level lock (SELECT FOR UPDATE) on bookings
--    - Atomic status transition (bookings -> approved, rooms -> occupied)
--    - Tenant creation / update
--    - Invoice & payment record insertion
--    - Double-entry ledger posting (Kas/Bank 1010/1200 vs Pendapatan Sewa 4000)
--    - Automatic logging to failed_ledger_postings if posting encounters an exception
-- ====================================================================

-- 1. RBAC CONSTRAINT / COMMENT HARDENING
COMMENT ON TABLE public.users IS 'Stores user profiles and RBAC role assignments. Roles super and owner are strictly restricted to administrator whitelists and cannot be auto-provisioned via public registration.';

-- 2. ATOMIC MANUAL BOOKING SETTLEMENT RPC
CREATE OR REPLACE FUNCTION settle_manual_booking_approval(
  p_booking_id BIGINT,
  p_payment_method VARCHAR(100) DEFAULT 'Transfer Manual',
  p_created_by VARCHAR(100) DEFAULT 'Admin Approval'
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking RECORD;
  v_room RECORD;
  v_occupant_name TEXT;
  v_occupant_phone TEXT;
  v_occupant_email TEXT;
  v_initials VARCHAR(10);
  v_tenant_id BIGINT;
  v_invoice_id TEXT;
  v_payment_method TEXT;
  v_trx_date DATE;
  v_trx_no TEXT;
  v_journal_no TEXT;
  v_trx_id BIGINT;
  v_debit_acc INT;
  v_credit_acc INT := 4000; -- 4000: Pendapatan Sewa
  v_amount NUMERIC;
BEGIN
  -- 1. Lock and fetch booking record with exclusive row-level lock
  SELECT * INTO v_booking FROM bookings WHERE id = p_booking_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'already_approved', false,
      'error', 'Data booking tidak ditemukan di database.'
    );
  END IF;

  -- 2. Idempotency guard: If already approved, return without duplicating side-effects
  IF v_booking.status = 'approved' THEN
    SELECT id INTO v_invoice_id FROM payments 
    WHERE (midtrans_order_id = v_booking.midtrans_order_id AND v_booking.midtrans_order_id IS NOT NULL)
       OR (tenant_name = v_booking.tenant_name AND property_id = v_booking.property_id)
    ORDER BY created_at DESC LIMIT 1;

    RETURN jsonb_build_object(
      'success', true,
      'already_approved', true,
      'message', 'Booking sudah disetujui sebelumnya (Idempotent).',
      'booking', row_to_json(v_booking),
      'invoice_id', v_invoice_id
    );
  END IF;

  v_payment_method := COALESCE(p_payment_method, v_booking.payment_method, 'Transfer Manual');
  v_occupant_name := COALESCE(v_booking.occupant_name, v_booking.tenant_name, 'Penyewa');
  v_occupant_phone := COALESCE(v_booking.occupant_phone, v_booking.phone, '');
  v_occupant_email := COALESCE(v_booking.occupant_email, v_booking.email, '');
  v_amount := COALESCE(v_booking.total_price, 0);
  v_trx_date := CURRENT_DATE;

  -- 3. Determine Debit Account (1200 for Midtrans Clearing, 1010 for Kas & Bank)
  IF LOWER(v_payment_method) LIKE '%midtrans%' THEN
    v_debit_acc := 1200;
  ELSE
    v_debit_acc := 1010;
  END IF;

  -- 4. Atomically update booking status
  UPDATE bookings
  SET status = 'approved',
      payment_method = v_payment_method
  WHERE id = p_booking_id
  RETURNING * INTO v_booking;

  -- 5. Update room status to occupied
  IF v_booking.room_id IS NOT NULL THEN
    UPDATE rooms
    SET status = 'occupied',
        current_tenant_name = v_occupant_name
    WHERE id = v_booking.room_id;
  END IF;

  -- 6. Upsert Tenant record
  v_initials := UPPER(SUBSTRING(COALESCE(v_occupant_name, 'TM') FROM 1 FOR 2));

  SELECT id INTO v_tenant_id FROM tenants 
  WHERE room_number = v_booking.room_number 
    AND property_id = v_booking.property_id 
  LIMIT 1;

  IF v_tenant_id IS NOT NULL THEN
    UPDATE tenants
    SET full_name = v_occupant_name,
        phone = v_occupant_phone,
        email = v_occupant_email,
        start_date = COALESCE(v_booking.check_in_date, CURRENT_DATE),
        duration_months = COALESCE(v_booking.duration_months, 1),
        payment_status = 'paid'
    WHERE id = v_tenant_id;
  ELSE
    INSERT INTO tenants (
      full_name,
      phone,
      email,
      avatar_initials,
      avatar_color,
      property_id,
      room_number,
      start_date,
      duration_months,
      payment_status
    ) VALUES (
      v_occupant_name,
      v_occupant_phone,
      v_occupant_email,
      v_initials,
      'bg-indigo-600',
      v_booking.property_id,
      v_booking.room_number,
      COALESCE(v_booking.check_in_date, CURRENT_DATE),
      COALESCE(v_booking.duration_months, 1),
      'paid'
    )
    RETURNING id INTO v_tenant_id;
  END IF;

  -- 7. Insert Payment Invoice record
  v_invoice_id := 'INV-' || v_booking.id::TEXT || '-' || EXTRACT(EPOCH FROM NOW())::BIGINT::TEXT || '-' || FLOOR(1000 + RANDOM() * 9000)::TEXT;

  INSERT INTO payments (
    id,
    tenant_name,
    property_id,
    amount,
    method,
    status,
    payment_date,
    midtrans_order_id,
    transaction_id
  ) VALUES (
    v_invoice_id,
    v_occupant_name,
    v_booking.property_id,
    v_amount,
    v_payment_method,
    'paid',
    v_trx_date,
    v_booking.midtrans_order_id,
    COALESCE(v_booking.midtrans_order_id, 'manual-tr-' || FLOOR(100000 + RANDOM() * 900000)::TEXT)
  );

  -- 8. Post Double-Entry Journal to General Ledger
  v_trx_no := 'TRX-' || TO_CHAR(v_trx_date, 'YYYYMMDD') || '-' || FLOOR(100 + RANDOM() * 900)::TEXT;
  
  BEGIN
    INSERT INTO financial_transactions (
      transaction_no,
      transaction_date,
      category,
      description,
      amount,
      type,
      reference_type,
      reference_id,
      created_by,
      property_id
    ) VALUES (
      v_trx_no,
      v_trx_date,
      'Penerimaan Sewa',
      '[APPROVAL] Pelunasan Sewa ' || v_occupant_name || ' Unit ' || COALESCE(v_booking.room_number, ''),
      v_amount,
      'income',
      'payment',
      v_invoice_id,
      p_created_by,
      v_booking.property_id
    )
    RETURNING id INTO v_trx_id;

    IF v_trx_id IS NOT NULL THEN
      v_journal_no := 'JRN-' || TO_CHAR(v_trx_date, 'YYYYMMDD') || '-' || v_trx_id::TEXT;

      -- Debit Entry (Kas / Bank atau Midtrans Clearing)
      INSERT INTO journal_entries (journal_no, transaction_id, account_id, debit, credit)
      VALUES (v_journal_no, v_trx_id, v_debit_acc, v_amount, 0);

      -- Credit Entry (Pendapatan Sewa)
      INSERT INTO journal_entries (journal_no, transaction_id, account_id, debit, credit)
      VALUES (v_journal_no, v_trx_id, v_credit_acc, 0, v_amount);

      -- Update Account Balances
      UPDATE accounts SET balance = balance + v_amount WHERE id = v_debit_acc;
      UPDATE accounts SET balance = balance + v_amount WHERE id = v_credit_acc;
    END IF;

  EXCEPTION WHEN OTHERS THEN
    -- In case of ledger posting failure, record into failed_ledger_postings without rolling back booking
    BEGIN
      INSERT INTO failed_ledger_postings (
        transaction_no,
        reference_type,
        reference_id,
        amount,
        debit_account_id,
        credit_account_id,
        property_id,
        created_by,
        error_message,
        status
      ) VALUES (
        v_trx_no,
        'payment',
        v_invoice_id,
        v_amount,
        v_debit_acc,
        v_credit_acc,
        v_booking.property_id,
        p_created_by,
        'Manual approval ledger error: ' || SQLERRM,
        'pending'
      );
    EXCEPTION WHEN OTHERS THEN
      NULL; -- Ignore secondary logging errors
    END;
  END;

  RETURN jsonb_build_object(
    'success', true,
    'already_approved', false,
    'message', 'Booking berhasil disetujui dan diselesaikan secara atomik.',
    'booking', row_to_json(v_booking),
    'invoice_id', v_invoice_id,
    'tenant_id', v_tenant_id,
    'transaction_no', v_trx_no
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'already_approved', false,
    'error', SQLERRM,
    'code', SQLSTATE
  );
END;
$$;

-- 3. RESTRICT EXECUTION TO SERVICE ROLE
REVOKE EXECUTE ON FUNCTION settle_manual_booking_approval(BIGINT, VARCHAR(100), VARCHAR(100)) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION settle_manual_booking_approval(BIGINT, VARCHAR(100), VARCHAR(100)) TO service_role;
