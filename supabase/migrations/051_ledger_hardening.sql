-- ============================================================================
-- MIGRATION 051: LEDGER HARDENING, ATOMIC SETTLEMENT, RECONCILIATION & SURVEY DP
-- Covers R3, R4, R5, R6. Forward-only, idempotent, transactional migration.
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. ENSURE CRITICAL COA ACCOUNTS EXIST (1000, 1010, 1020, 1200, 1300, 2100, 4000, 4200, 5030, 5100)
-- ============================================================================
INSERT INTO public.accounts (id, name, type, balance)
VALUES
  (1000, 'Kas Kecil (Petty Cash)', 'asset', 0),
  (1010, 'Kas dan Bank Mandiri', 'asset', 0),
  (1020, 'Midtrans Escrow Clearing', 'asset', 0),
  (1100, 'Piutang Usaha Sewa Kamar', 'asset', 0),
  (1200, 'Piutang Kliring Midtrans (Settlement Clearing)', 'asset', 0),
  (1300, 'Uang Muka / DP Survey', 'liability', 0),
  (2100, 'Hutang Pajak PBJT Daerah (10%) & Deposit', 'liability', 0),
  (3000, 'Modal Pemilik & Ekuitas', 'equity', 0),
  (4000, 'Pendapatan Sewa Kamar', 'revenue', 0),
  (4200, 'Pendapatan DP Survey Hangus', 'revenue', 0),
  (5000, 'Beban Pemeliharaan Gedung', 'expense', 0),
  (5030, 'Beban Biaya Transaksi Payment Gateway (Midtrans Fee)', 'expense', 0),
  (5100, 'Beban Operasional Lain-lain', 'expense', 0)
ON CONFLICT (id) DO NOTHING;

-- Ensure financial_transactions has debit_account_id, credit_account_id, status, transaction_date, property_id
ALTER TABLE public.financial_transactions ADD COLUMN IF NOT EXISTS debit_account_id INTEGER;
ALTER TABLE public.financial_transactions ADD COLUMN IF NOT EXISTS credit_account_id INTEGER;
ALTER TABLE public.financial_transactions ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'posted';
ALTER TABLE public.financial_transactions ADD COLUMN IF NOT EXISTS transaction_date DATE DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Jakarta')::DATE;
ALTER TABLE public.financial_transactions ADD COLUMN IF NOT EXISTS property_id BIGINT;

-- Ensure conditional unique index for idempotency on (reference_type, reference_id, category, debit_account_id, credit_account_id)
-- Only created if no active duplicates exist in live DB
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.financial_transactions
    WHERE reference_type IS NOT NULL
      AND reference_id IS NOT NULL
      AND status = 'posted'
    GROUP BY reference_type, reference_id, category, debit_account_id, credit_account_id
    HAVING COUNT(*) > 1
  ) THEN
    CREATE UNIQUE INDEX IF NOT EXISTS idx_ft_idempotent_ref
      ON public.financial_transactions (reference_type, reference_id, category, debit_account_id, credit_account_id)
      WHERE reference_type IS NOT NULL AND reference_id IS NOT NULL AND status = 'posted';
  ELSE
    RAISE NOTICE 'Skipped creating idx_ft_idempotent_ref until duplicate active financial_transactions are remediated by owner.';
  END IF;
END $$;

-- ============================================================================
-- 2. R3 — SINGLE ATOMIC JOURNAL ENTRY POINT: post_financial_transaction
--    - Locks accounts in deterministic order (ORDER BY id FOR UPDATE)
--    - Populates debit_account_id, credit_account_id, status='posted', property_id
--    - Removes GREATEST(0, ...) clamping on accounts.balance
--    - Enforces idempotency on (reference_type, reference_id, category, debit_account_id, credit_account_id)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.post_financial_transaction(
  p_category TEXT,
  p_description TEXT,
  p_amount NUMERIC,
  p_type TEXT,
  p_debit_account_id INTEGER,
  p_credit_account_id INTEGER,
  p_reference_type TEXT DEFAULT 'manual',
  p_reference_id TEXT DEFAULT NULL,
  p_created_by TEXT DEFAULT 'System',
  p_transaction_date DATE DEFAULT NULL,
  p_property_id BIGINT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tx_id BIGINT;
  v_journal_no TEXT;
  v_debit_exists BOOLEAN := FALSE;
  v_credit_exists BOOLEAN := FALSE;
  v_debit_type TEXT;
  v_credit_type TEXT;
  v_debit_before NUMERIC;
  v_credit_before NUMERIC;
  v_debit_after NUMERIC;
  v_credit_after NUMERIC;
  v_effective_date DATE;
  v_existing_tx RECORD;
  v_acc RECORD;
BEGIN
  v_effective_date := COALESCE(p_transaction_date, (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Jakarta')::DATE);

  -- 1. Validate inputs
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Nominal transaksi harus lebih besar dari 0 (diterima: %)', p_amount;
  END IF;

  IF p_debit_account_id IS NULL OR p_credit_account_id IS NULL THEN
    RAISE EXCEPTION 'Akun Debit dan Akun Kredit wajib diisi untuk Double-Entry Bookkeeping';
  END IF;

  IF p_debit_account_id = p_credit_account_id THEN
    RAISE EXCEPTION 'Akun Debit (%) dan Akun Kredit (%) tidak boleh sama', p_debit_account_id, p_credit_account_id;
  END IF;

  -- 2. Idempotency check when reference_type and reference_id are provided
  IF p_reference_type IS NOT NULL AND TRIM(p_reference_type) <> ''
     AND p_reference_id IS NOT NULL AND TRIM(p_reference_id) <> '' THEN
    SELECT id, description, amount, debit_account_id, credit_account_id
      INTO v_existing_tx
      FROM public.financial_transactions
     WHERE reference_type = p_reference_type
       AND reference_id = p_reference_id
       AND COALESCE(category, '') = COALESCE(p_category, '')
       AND COALESCE(debit_account_id, 0) = p_debit_account_id
       AND COALESCE(credit_account_id, 0) = p_credit_account_id
       AND COALESCE(status, 'posted') = 'posted'
     ORDER BY id ASC
     LIMIT 1;

    IF FOUND THEN
      SELECT journal_no INTO v_journal_no
        FROM public.journal_entries
       WHERE transaction_id = v_existing_tx.id
       LIMIT 1;

      RETURN jsonb_build_object(
        'success', true,
        'idempotent', true,
        'transaction_id', v_existing_tx.id,
        'journal_no', COALESCE(v_journal_no, 'JRN-IDEMPOTENT-' || v_existing_tx.id::TEXT),
        'amount', v_existing_tx.amount,
        'debit_account', p_debit_account_id,
        'credit_account', p_credit_account_id,
        'property_id', p_property_id
      );
    END IF;
  END IF;

  -- 3. Lock both COA accounts in deterministic order (ORDER BY id FOR UPDATE) to prevent deadlocks & lost updates
  FOR v_acc IN
    SELECT id, type, COALESCE(balance, 0) AS balance
      FROM public.accounts
     WHERE id IN (p_debit_account_id, p_credit_account_id)
     ORDER BY id ASC
     FOR UPDATE
  LOOP
    IF v_acc.id = p_debit_account_id THEN
      v_debit_exists := TRUE;
      v_debit_type := v_acc.type;
      v_debit_before := v_acc.balance;
    ELSIF v_acc.id = p_credit_account_id THEN
      v_credit_exists := TRUE;
      v_credit_type := v_acc.type;
      v_credit_before := v_acc.balance;
    END IF;
  END LOOP;

  IF NOT v_debit_exists THEN
    RAISE EXCEPTION 'Akun COA Debit (%) tidak ditemukan di tabel accounts', p_debit_account_id;
  END IF;

  IF NOT v_credit_exists THEN
    RAISE EXCEPTION 'Akun COA Kredit (%) tidak ditemukan di tabel accounts', p_credit_account_id;
  END IF;

  -- 4. Insert into financial_transactions with debit_account_id, credit_account_id, status='posted', property_id
  INSERT INTO public.financial_transactions (
    category,
    description,
    amount,
    type,
    date,
    transaction_date,
    reference_type,
    reference_id,
    created_by,
    property_id,
    debit_account_id,
    credit_account_id,
    status
  ) VALUES (
    p_category,
    p_description,
    p_amount,
    p_type,
    v_effective_date,
    v_effective_date,
    p_reference_type,
    p_reference_id,
    p_created_by,
    p_property_id,
    p_debit_account_id,
    p_credit_account_id,
    'posted'
  ) RETURNING id INTO v_tx_id;

  -- 5. Generate unique journal number
  v_journal_no := 'JRN-' || TO_CHAR(v_effective_date, 'YYYYMMDD') || '-' || LPAD(v_tx_id::TEXT, 5, '0');

  -- 6. Insert balanced double-entry rows into journal_entries
  INSERT INTO public.journal_entries (
    journal_no,
    transaction_id,
    account_id,
    debit,
    credit,
    property_id
  ) VALUES
  (
    v_journal_no,
    v_tx_id,
    p_debit_account_id,
    p_amount,
    0,
    p_property_id
  ),
  (
    v_journal_no,
    v_tx_id,
    p_credit_account_id,
    0,
    p_amount,
    p_property_id
  );

  -- 7. Insert into ledger_entries if table exists
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'ledger_entries') THEN
    INSERT INTO public.ledger_entries (
      journal_no,
      transaction_id,
      account_id,
      debit,
      credit,
      description,
      reference_type,
      reference_id,
      transaction_date,
      created_by,
      property_id
    ) VALUES
    (
      v_journal_no,
      v_tx_id,
      p_debit_account_id,
      p_amount,
      0,
      p_description,
      p_reference_type,
      p_reference_id,
      v_effective_date,
      p_created_by,
      p_property_id
    ),
    (
      v_journal_no,
      v_tx_id,
      p_credit_account_id,
      0,
      p_amount,
      p_description,
      p_reference_type,
      p_reference_id,
      v_effective_date,
      p_created_by,
      p_property_id
    );
  END IF;

  -- 8. Update COA account balances WITHOUT GREATEST(0, ...) clamping
  --    Normal Debit accounts: asset, expense (+ on Debit, - on Credit)
  --    Normal Credit accounts: liability, revenue, equity (- on Debit, + on Credit)
  UPDATE public.accounts
  SET balance = COALESCE(balance, 0) +
    CASE
      WHEN LOWER(type) IN ('asset', 'expense') THEN p_amount
      ELSE -p_amount
    END
  WHERE id = p_debit_account_id
  RETURNING balance INTO v_debit_after;

  UPDATE public.accounts
  SET balance = COALESCE(balance, 0) +
    CASE
      WHEN LOWER(type) IN ('liability', 'revenue', 'equity') THEN p_amount
      ELSE -p_amount
    END
  WHERE id = p_credit_account_id
  RETURNING balance INTO v_credit_after;

  -- 9. Record audit trail
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'financial_audit_logs') THEN
    INSERT INTO public.financial_audit_logs (
      event_type,
      transaction_id,
      journal_no,
      reference_type,
      reference_id,
      amount,
      actor,
      metadata
    ) VALUES (
      'POST_TRANSACTION',
      v_tx_id,
      v_journal_no,
      p_reference_type,
      p_reference_id,
      p_amount,
      p_created_by,
      jsonb_build_object(
        'category', p_category,
        'type', p_type,
        'property_id', p_property_id,
        'debit_account', p_debit_account_id,
        'debit_before', v_debit_before,
        'debit_after', v_debit_after,
        'credit_account', p_credit_account_id,
        'credit_before', v_credit_before,
        'credit_after', v_credit_after
      )
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'idempotent', false,
    'transaction_id', v_tx_id,
    'journal_no', v_journal_no,
    'amount', p_amount,
    'debit_account', p_debit_account_id,
    'debit_balance', v_debit_after,
    'credit_account', p_credit_account_id,
    'credit_balance', v_credit_after,
    'property_id', p_property_id
  );
EXCEPTION WHEN OTHERS THEN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'failed_ledger_postings') THEN
    INSERT INTO public.failed_ledger_postings (
      reference_type,
      reference_id,
      category,
      description,
      amount,
      debit_account_id,
      credit_account_id,
      error_message,
      payload,
      status
    ) VALUES (
      p_reference_type,
      p_reference_id,
      p_category,
      p_description,
      COALESCE(p_amount, 0),
      p_debit_account_id,
      p_credit_account_id,
      SQLERRM,
      jsonb_build_object(
        'type', p_type,
        'created_by', p_created_by,
        'transaction_date', v_effective_date,
        'property_id', p_property_id
      ),
      'failed'
    );
  END IF;

  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM,
    'detail', SQLSTATE
  );
END;
$$;

-- ============================================================================
-- 3. R4 — ATOMIC SETTLEMENT RPCs (NO SILENT SWALLOW, STRICT FOR UPDATE LOCKING)
-- ============================================================================

-- 3A. settle_booking_payment: Atomic Midtrans / Server Booking Settlement
CREATE OR REPLACE FUNCTION public.settle_booking_payment(
  p_midtrans_order_id TEXT,
  p_payment_method TEXT DEFAULT 'Midtrans SNAP',
  p_midtrans_transaction_id TEXT DEFAULT NULL,
  p_gross_amount NUMERIC DEFAULT NULL,
  p_fee_amount NUMERIC DEFAULT 0
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking RECORD;
  v_room RECORD;
  v_existing_payment RECORD;
  v_invoice_id TEXT;
  v_amount NUMERIC;
  v_fee NUMERIC;
  v_net NUMERIC;
  v_effective_name TEXT;
  v_effective_phone TEXT;
  v_effective_email TEXT;
  v_effective_nik TEXT;
  v_existing_tenant_id BIGINT;
  v_tenant_id BIGINT;
  v_start_date DATE;
  v_duration_months INTEGER;
  v_lease_end_date DATE;
  v_credit_acc INTEGER;
  v_tx_category TEXT;
  v_tx_desc TEXT;
  v_journal_res JSONB;
  v_fee_journal_res JSONB;
  v_total_rooms INTEGER := 0;
  v_avail_rooms INTEGER := 0;
  v_today_wib DATE := (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Jakarta')::DATE;
BEGIN
  IF p_midtrans_order_id IS NULL OR TRIM(p_midtrans_order_id) = '' THEN
    RAISE EXCEPTION 'p_midtrans_order_id wajib diisi';
  END IF;

  -- 1. Lock booking row FOR UPDATE
  SELECT * INTO v_booking
    FROM public.bookings
   WHERE midtrans_order_id = TRIM(p_midtrans_order_id)
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking dengan Order ID "%" tidak ditemukan di database', p_midtrans_order_id;
  END IF;

  -- 2. Lock room row FOR UPDATE & verify room is not occupied by another tenant
  IF v_booking.room_id IS NOT NULL THEN
    SELECT * INTO v_room FROM public.rooms WHERE id = v_booking.room_id FOR UPDATE;
  ELSE
    SELECT * INTO v_room
      FROM public.rooms
     WHERE property_id = v_booking.property_id
       AND room_number = v_booking.room_number
     LIMIT 1
     FOR UPDATE;
  END IF;

  v_effective_name := CASE
    WHEN v_booking.is_for_other = TRUE AND COALESCE(TRIM(v_booking.occupant_name), '') <> '' THEN TRIM(v_booking.occupant_name)
    ELSE TRIM(v_booking.tenant_name)
  END;
  v_effective_phone := CASE
    WHEN v_booking.is_for_other = TRUE AND COALESCE(TRIM(v_booking.occupant_phone), '') <> '' THEN TRIM(v_booking.occupant_phone)
    ELSE v_booking.phone
  END;
  v_effective_email := CASE
    WHEN v_booking.is_for_other = TRUE AND COALESCE(TRIM(v_booking.occupant_email), '') <> '' THEN TRIM(v_booking.occupant_email)
    ELSE v_booking.email
  END;
  v_effective_nik := CASE
    WHEN v_booking.is_for_other = TRUE AND COALESCE(TRIM(v_booking.occupant_nik), '') <> '' THEN TRIM(v_booking.occupant_nik)
    ELSE v_booking.nik
  END;

  IF v_room.id IS NOT NULL THEN
    IF LOWER(COALESCE(v_room.status, '')) = 'occupied'
       AND COALESCE(LOWER(TRIM(v_room.current_tenant_name)), '') <> ''
       AND LOWER(TRIM(v_room.current_tenant_name)) <> LOWER(v_effective_name)
       AND LOWER(TRIM(v_room.current_tenant_name)) <> LOWER(TRIM(v_booking.tenant_name)) THEN
      RAISE EXCEPTION 'CONFLICT_ROOM_OCCUPIED: Kamar % sudah terisi oleh penghuni lain (%)', v_room.room_number, v_room.current_tenant_name
        USING ERRCODE = '23505';
    END IF;
  END IF;

  v_amount := COALESCE(NULLIF(p_gross_amount, 0), v_booking.total_price, 0);
  IF v_amount <= 0 THEN
    RAISE EXCEPTION 'Nominal pembayaran booking tidak valid (%)', v_amount;
  END IF;
  v_fee := GREATEST(0, COALESCE(p_fee_amount, 0));
  v_net := GREATEST(0, v_amount - v_fee);

  -- 3. Update booking status to approved
  UPDATE public.bookings
     SET status = 'approved',
         payment_method = COALESCE(p_payment_method, v_booking.payment_method, 'Midtrans SNAP')
   WHERE id = v_booking.id;

  -- 4. Lock and mark room as occupied + clear hold columns
  IF v_room.id IS NOT NULL THEN
    UPDATE public.rooms
       SET status = 'occupied',
           current_tenant_name = v_effective_name,
           hold_expires_at = NULL,
           hold_by_booking_id = NULL
     WHERE id = v_room.id;

    SELECT COUNT(*),
           COUNT(*) FILTER (WHERE status IN ('available', 'reserved') OR status IS NULL)
      INTO v_total_rooms, v_avail_rooms
      FROM public.rooms
     WHERE property_id = v_booking.property_id;

    UPDATE public.properties
       SET total_rooms = v_total_rooms,
           available_rooms = v_avail_rooms
     WHERE id = v_booking.property_id;
  END IF;

  -- 5. Upsert tenant record (only for monthly bookings or when not daily)
  v_start_date := COALESCE(v_booking.check_in_date, v_booking.booking_date, v_today_wib);
  v_duration_months := GREATEST(1, COALESCE(v_booking.duration_months, 1));
  v_lease_end_date := (v_start_date + (v_duration_months || ' months')::INTERVAL)::DATE;

  IF COALESCE(v_booking.booking_type, 'monthly') <> 'daily' THEN
    SELECT id INTO v_existing_tenant_id
      FROM public.tenants
     WHERE property_id = v_booking.property_id
       AND room_number = v_booking.room_number
       AND LOWER(TRIM(full_name)) = LOWER(v_effective_name)
     LIMIT 1
     FOR UPDATE;

    IF v_existing_tenant_id IS NOT NULL THEN
      UPDATE public.tenants
         SET payment_status = 'paid',
             status = 'active',
             start_date = v_start_date,
             duration_months = v_duration_months,
             lease_end_date = v_lease_end_date,
             phone = COALESCE(v_effective_phone, phone),
             email = COALESCE(v_effective_email, email),
             nik = COALESCE(v_effective_nik, nik),
             is_married = COALESCE(v_booking.is_married, is_married),
             marriage_certificate_url = COALESCE(v_booking.marriage_certificate_url, marriage_certificate_url),
             spouse_name = COALESCE(v_booking.spouse_name, spouse_name),
             spouse_nik = COALESCE(v_booking.spouse_nik, spouse_nik),
             spouse_phone = COALESCE(v_booking.spouse_phone, spouse_phone),
             spouse_relation = COALESCE(v_booking.spouse_relation, spouse_relation)
       WHERE id = v_existing_tenant_id
       RETURNING id INTO v_tenant_id;
    ELSE
      INSERT INTO public.tenants (
        full_name, phone, email, nik, property_id, room_number,
        start_date, duration_months, lease_end_date, payment_status, status,
        created_at, is_married, marriage_certificate_url, spouse_name,
        spouse_nik, spouse_phone, spouse_relation
      ) VALUES (
        v_effective_name, v_effective_phone, v_effective_email, v_effective_nik,
        v_booking.property_id, v_booking.room_number,
        v_start_date, v_duration_months, v_lease_end_date, 'paid', 'active',
        v_today_wib, COALESCE(v_booking.is_married, false), v_booking.marriage_certificate_url,
        v_booking.spouse_name, v_booking.spouse_nik, v_booking.spouse_phone, v_booking.spouse_relation
      ) RETURNING id INTO v_tenant_id;
    END IF;
  END IF;

  -- 6. Upsert payment invoice
  SELECT * INTO v_existing_payment
    FROM public.payments
   WHERE midtrans_order_id = TRIM(p_midtrans_order_id)
   LIMIT 1
   FOR UPDATE;

  IF FOUND THEN
    v_invoice_id := v_existing_payment.id;
    UPDATE public.payments
       SET status = 'paid',
           method = COALESCE(p_payment_method, v_existing_payment.method, 'Midtrans SNAP'),
           transaction_id = COALESCE(p_midtrans_transaction_id, v_existing_payment.transaction_id),
           amount = v_amount,
           payment_date = COALESCE(v_existing_payment.payment_date, v_today_wib)
     WHERE id = v_invoice_id;
  ELSE
    v_invoice_id := 'INV-' || UPPER(REGEXP_REPLACE(TRIM(p_midtrans_order_id), '[^A-Za-z0-9]', '', 'g'));
    INSERT INTO public.payments (
      id, tenant_name, property_id, amount, method, status, payment_date, midtrans_order_id, transaction_id
    ) VALUES (
      v_invoice_id,
      v_effective_name,
      v_booking.property_id,
      v_amount,
      COALESCE(p_payment_method, 'Midtrans SNAP'),
      'paid',
      v_today_wib,
      TRIM(p_midtrans_order_id),
      COALESCE(p_midtrans_transaction_id, 'mid-' || TRIM(p_midtrans_order_id))
    )
    ON CONFLICT (id) DO UPDATE
      SET status = 'paid',
          amount = EXCLUDED.amount,
          method = EXCLUDED.method,
          transaction_id = EXCLUDED.transaction_id;
  END IF;

  -- 7. Upsert Midtrans Clearing Transaction (COA 1200)
  INSERT INTO public.midtrans_clearing_transactions (
    midtrans_order_id,
    midtrans_transaction_id,
    reference_type,
    reference_id,
    invoice_id,
    tenant_name,
    property_id,
    payment_method,
    gross_amount,
    fee_amount,
    net_amount,
    reconciled_amount,
    outstanding_amount,
    clearing_status,
    settled_at
  ) VALUES (
    TRIM(p_midtrans_order_id),
    COALESCE(p_midtrans_transaction_id, 'mid-' || TRIM(p_midtrans_order_id)),
    'booking',
    v_booking.id::TEXT,
    v_invoice_id,
    v_effective_name,
    v_booking.property_id,
    COALESCE(p_payment_method, 'Midtrans SNAP'),
    v_amount,
    v_fee,
    v_net,
    0,
    v_net,
    'pending',
    NOW()
  )
  ON CONFLICT (midtrans_order_id) DO UPDATE
    SET midtrans_transaction_id = COALESCE(EXCLUDED.midtrans_transaction_id, public.midtrans_clearing_transactions.midtrans_transaction_id),
        gross_amount = EXCLUDED.gross_amount,
        fee_amount = EXCLUDED.fee_amount,
        net_amount = EXCLUDED.net_amount,
        outstanding_amount = GREATEST(0, EXCLUDED.net_amount - COALESCE(public.midtrans_clearing_transactions.reconciled_amount, 0)),
        settled_at = COALESCE(public.midtrans_clearing_transactions.settled_at, NOW()),
        updated_at = NOW();

  -- 8. Post Atomic Double-Entry Journal: DR 1200 / CR 4000 (or 1300 if DP booking)
  --    STRICT: If post_financial_transaction returns success != true, RAISE EXCEPTION to rollback everything!
  v_credit_acc := CASE WHEN v_booking.is_dp = TRUE THEN 1300 ELSE 4000 END;
  v_tx_category := CASE WHEN v_booking.is_dp = TRUE THEN 'DP Booking' ELSE 'Penerimaan Sewa' END;
  v_tx_desc := CASE
    WHEN v_booking.is_dp = TRUE THEN
      'DP Booking Kamar ' || v_booking.room_number || ' - ' || v_effective_name || ' (Order ' || TRIM(p_midtrans_order_id) || ')'
    ELSE
      'Pelunasan Sewa Kamar ' || v_booking.room_number || ' (' ||
      CASE WHEN v_booking.booking_type = 'daily' THEN COALESCE(v_booking.duration_days, 1)::TEXT || ' Hari'
           ELSE v_duration_months::TEXT || ' Bulan'
      END || ') - ' || v_effective_name || ' (Order ' || TRIM(p_midtrans_order_id) || ')'
  END;

  v_journal_res := public.post_financial_transaction(
    p_category := v_tx_category,
    p_description := v_tx_desc,
    p_amount := v_amount,
    p_type := CASE WHEN v_booking.is_dp = TRUE THEN 'dp_booking' ELSE 'income' END,
    p_debit_account_id := 1200,
    p_credit_account_id := v_credit_acc,
    p_reference_type := 'booking',
    p_reference_id := v_booking.id::TEXT,
    p_created_by := 'Midtrans Settlement Engine',
    p_transaction_date := v_today_wib,
    p_property_id := v_booking.property_id
  );

  IF COALESCE((v_journal_res->>'success')::BOOLEAN, FALSE) IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'Gagal mencatat jurnal akuntansi booking %: %', p_midtrans_order_id, COALESCE(v_journal_res->>'error', 'Unknown ledger error');
  END IF;

  -- 9. If gateway fee > 0, post DR 5030 / CR 1200 atomically
  IF v_fee > 0 THEN
    v_fee_journal_res := public.post_financial_transaction(
      p_category := 'Biaya Layanan Payment Gateway',
      p_description := 'Potongan Biaya Transaksi Midtrans - Order ' || TRIM(p_midtrans_order_id),
      p_amount := v_fee,
      p_type := 'expense',
      p_debit_account_id := 5030,
      p_credit_account_id := 1200,
      p_reference_type := 'midtrans_fee',
      p_reference_id := TRIM(p_midtrans_order_id),
      p_created_by := 'Midtrans Settlement Engine',
      p_transaction_date := v_today_wib,
      p_property_id := v_booking.property_id
    );

    IF COALESCE((v_fee_journal_res->>'success')::BOOLEAN, FALSE) IS DISTINCT FROM TRUE THEN
      RAISE EXCEPTION 'Gagal mencatat jurnal biaya gateway booking %: %', p_midtrans_order_id, COALESCE(v_fee_journal_res->>'error', 'Unknown fee ledger error');
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'idempotent', COALESCE((v_journal_res->>'idempotent')::BOOLEAN, FALSE),
    'booking_id', v_booking.id,
    'tenant_id', v_tenant_id,
    'invoice_id', v_invoice_id,
    'order_id', TRIM(p_midtrans_order_id),
    'journal', v_journal_res
  );
END;
$$;

-- 3B. settle_manual_booking_approval: Remove EXCEPTION WHEN OTHERS THEN NULL & enforce atomic rollback
CREATE OR REPLACE FUNCTION public.settle_manual_booking_approval(
  p_booking_id BIGINT,
  p_actor_name TEXT DEFAULT 'Admin'
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking RECORD;
  v_room RECORD;
  v_effective_name TEXT;
  v_effective_phone TEXT;
  v_effective_email TEXT;
  v_effective_nik TEXT;
  v_existing_tenant_id BIGINT;
  v_new_tenant_id BIGINT;
  v_invoice_id TEXT;
  v_order_id TEXT;
  v_existing_payment_id TEXT;
  v_journal_res JSONB;
  v_total_rooms INTEGER := 0;
  v_avail_rooms INTEGER := 0;
  v_start_date DATE;
  v_duration_months INTEGER;
  v_lease_end_date DATE;
  v_today_wib DATE := (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Jakarta')::DATE;
BEGIN
  -- 1. Lock booking row FOR UPDATE
  SELECT * INTO v_booking
    FROM public.bookings
   WHERE id = p_booking_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking ID % tidak ditemukan', p_booking_id;
  END IF;

  v_effective_name := CASE
    WHEN v_booking.is_for_other = TRUE AND COALESCE(TRIM(v_booking.occupant_name), '') <> '' THEN TRIM(v_booking.occupant_name)
    ELSE TRIM(v_booking.tenant_name)
  END;
  v_effective_phone := CASE
    WHEN v_booking.is_for_other = TRUE AND COALESCE(TRIM(v_booking.occupant_phone), '') <> '' THEN TRIM(v_booking.occupant_phone)
    ELSE v_booking.phone
  END;
  v_effective_email := CASE
    WHEN v_booking.is_for_other = TRUE AND COALESCE(TRIM(v_booking.occupant_email), '') <> '' THEN TRIM(v_booking.occupant_email)
    ELSE v_booking.email
  END;
  v_effective_nik := CASE
    WHEN v_booking.is_for_other = TRUE AND COALESCE(TRIM(v_booking.occupant_nik), '') <> '' THEN TRIM(v_booking.occupant_nik)
    ELSE v_booking.nik
  END;

  -- 2. Lock room row FOR UPDATE & reject if occupied by another tenant
  IF v_booking.room_id IS NOT NULL THEN
    SELECT * INTO v_room FROM public.rooms WHERE id = v_booking.room_id FOR UPDATE;
  ELSE
    SELECT * INTO v_room
      FROM public.rooms
     WHERE property_id = v_booking.property_id
       AND room_number = v_booking.room_number
     LIMIT 1
     FOR UPDATE;
  END IF;

  IF v_room.id IS NOT NULL THEN
    IF LOWER(COALESCE(v_room.status, '')) = 'occupied'
       AND COALESCE(LOWER(TRIM(v_room.current_tenant_name)), '') <> ''
       AND LOWER(TRIM(v_room.current_tenant_name)) <> LOWER(v_effective_name)
       AND LOWER(TRIM(v_room.current_tenant_name)) <> LOWER(TRIM(v_booking.tenant_name)) THEN
      RAISE EXCEPTION 'CONFLICT_ROOM_OCCUPIED: Kamar % sudah ditempati oleh penghuni lain (%)', v_room.room_number, v_room.current_tenant_name
        USING ERRCODE = '23505';
    END IF;
  END IF;

  -- 3. Ensure booking status is approved
  UPDATE public.bookings
     SET status = 'approved'
   WHERE id = p_booking_id;

  v_order_id := COALESCE(NULLIF(TRIM(v_booking.midtrans_order_id), ''), 'BOOK-MANUAL-' || p_booking_id::TEXT);
  v_start_date := COALESCE(v_booking.check_in_date, v_booking.booking_date, v_today_wib);
  v_duration_months := GREATEST(1, COALESCE(v_booking.duration_months, 1));
  v_lease_end_date := (v_start_date + (v_duration_months || ' months')::INTERVAL)::DATE;

  -- 4. Lock & update room to occupied
  IF v_room.id IS NOT NULL THEN
    UPDATE public.rooms
       SET status = 'occupied',
           current_tenant_name = v_effective_name,
           hold_expires_at = NULL,
           hold_by_booking_id = NULL
     WHERE id = v_room.id;

    SELECT COUNT(*),
           COUNT(*) FILTER (WHERE status IN ('available', 'reserved') OR status IS NULL)
      INTO v_total_rooms, v_avail_rooms
      FROM public.rooms
     WHERE property_id = v_booking.property_id;

    UPDATE public.properties
       SET total_rooms = v_total_rooms,
           available_rooms = v_avail_rooms
     WHERE id = v_booking.property_id;
  END IF;

  -- 5. Upsert tenant record
  SELECT id INTO v_existing_tenant_id
    FROM public.tenants
   WHERE property_id = v_booking.property_id
     AND room_number = v_booking.room_number
     AND LOWER(TRIM(full_name)) = LOWER(v_effective_name)
   LIMIT 1
   FOR UPDATE;

  IF v_existing_tenant_id IS NOT NULL THEN
    UPDATE public.tenants
       SET payment_status = 'paid',
           status = 'active',
           start_date = v_start_date,
           duration_months = v_duration_months,
           lease_end_date = v_lease_end_date,
           phone = COALESCE(v_effective_phone, phone),
           email = COALESCE(v_effective_email, email),
           nik = COALESCE(v_effective_nik, nik),
           is_married = COALESCE(v_booking.is_married, is_married),
           marriage_certificate_url = COALESCE(v_booking.marriage_certificate_url, marriage_certificate_url),
           spouse_name = COALESCE(v_booking.spouse_name, spouse_name),
           spouse_nik = COALESCE(v_booking.spouse_nik, spouse_nik),
           spouse_phone = COALESCE(v_booking.spouse_phone, spouse_phone),
           spouse_relation = COALESCE(v_booking.spouse_relation, spouse_relation)
     WHERE id = v_existing_tenant_id
     RETURNING id INTO v_new_tenant_id;
  ELSE
    INSERT INTO public.tenants (
      full_name, phone, email, nik, property_id, room_number,
      start_date, duration_months, lease_end_date, payment_status, status,
      created_at, is_married, marriage_certificate_url, spouse_name,
      spouse_nik, spouse_phone, spouse_relation
    ) VALUES (
      v_effective_name, v_effective_phone, v_effective_email, v_effective_nik,
      v_booking.property_id, v_booking.room_number,
      v_start_date, v_duration_months, v_lease_end_date,
      'paid', 'active', v_today_wib,
      COALESCE(v_booking.is_married, false), v_booking.marriage_certificate_url,
      v_booking.spouse_name, v_booking.spouse_nik, v_booking.spouse_phone, v_booking.spouse_relation
    ) RETURNING id INTO v_new_tenant_id;
  END IF;

  -- 6. Upsert payment invoice
  SELECT id INTO v_existing_payment_id
    FROM public.payments
   WHERE midtrans_order_id = v_order_id
   LIMIT 1
   FOR UPDATE;

  IF v_existing_payment_id IS NOT NULL THEN
    v_invoice_id := v_existing_payment_id;
    UPDATE public.payments
       SET status = 'paid',
           amount = COALESCE(v_booking.total_price, amount)
     WHERE id = v_invoice_id;
  ELSE
    v_invoice_id := 'INV-MAN-' || p_booking_id::TEXT;
    INSERT INTO public.payments (
      id, tenant_name, property_id, amount, method, status, payment_date, midtrans_order_id, transaction_id
    ) VALUES (
      v_invoice_id,
      v_effective_name,
      v_booking.property_id,
      COALESCE(v_booking.total_price, 0),
      COALESCE(v_booking.payment_method, 'Manual Approval (Admin)'),
      'paid',
      v_today_wib,
      v_order_id,
      'manual-' || p_booking_id::TEXT
    )
    ON CONFLICT (id) DO UPDATE
      SET status = 'paid',
          amount = EXCLUDED.amount;
  END IF;

  -- 7. Post double-entry journal (NO silent exception swallow!)
  IF COALESCE(v_booking.total_price, 0) > 0 THEN
    v_journal_res := public.post_financial_transaction(
      p_category := 'Penerimaan Sewa',
      p_description := 'Pelunasan Sewa Kamar ' || v_booking.room_number || ' (' || v_duration_months || ' Bulan) - ' || v_effective_name || ' [Invoice #' || v_invoice_id || ']',
      p_amount := v_booking.total_price,
      p_type := 'income',
      p_debit_account_id := CASE WHEN LOWER(COALESCE(v_booking.payment_method, '')) LIKE '%midtrans%' THEN 1200 ELSE 1010 END,
      p_credit_account_id := 4000,
      p_reference_type := 'booking',
      p_reference_id := p_booking_id::TEXT,
      p_created_by := p_actor_name,
      p_transaction_date := v_today_wib,
      p_property_id := v_booking.property_id
    );

    IF COALESCE((v_journal_res->>'success')::BOOLEAN, FALSE) IS DISTINCT FROM TRUE THEN
      RAISE EXCEPTION 'Gagal memposting jurnal akuntansi persetujuan booking #% : %', p_booking_id, COALESCE(v_journal_res->>'error', 'Unknown ledger error');
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'booking_id', p_booking_id,
    'tenant_id', v_new_tenant_id,
    'invoice_id', v_invoice_id,
    'journal', v_journal_res
  );
END;
$$;

-- 3C. settle_contract_extension: Remove EXCEPTION WHEN OTHERS THEN NULL & enforce atomic rollback
CREATE OR REPLACE FUNCTION public.settle_contract_extension(
  p_extension_id BIGINT DEFAULT NULL,
  p_midtrans_order_id TEXT DEFAULT NULL,
  p_tenant_id BIGINT DEFAULT NULL,
  p_extension_months INTEGER DEFAULT 1,
  p_total_amount NUMERIC DEFAULT 0,
  p_payment_method TEXT DEFAULT 'Midtrans SNAP',
  p_notes TEXT DEFAULT NULL,
  p_fee_amount NUMERIC DEFAULT 0,
  p_midtrans_transaction_id TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ext RECORD;
  v_tenant RECORD;
  v_invoice_id TEXT;
  v_new_duration INTEGER;
  v_new_lease_end DATE;
  v_journal_res JSONB;
  v_fee_journal_res JSONB;
  v_prop_name TEXT;
  v_order_id TEXT;
  v_debit_acc INTEGER;
  v_fee NUMERIC := GREATEST(0, COALESCE(p_fee_amount, 0));
  v_net NUMERIC;
  v_today_wib DATE := (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Jakarta')::DATE;
BEGIN
  -- 1. Locate existing contract_extension row and lock FOR UPDATE
  IF p_extension_id IS NOT NULL THEN
    SELECT * INTO v_ext FROM public.contract_extensions WHERE id = p_extension_id FOR UPDATE;
  ELSIF p_midtrans_order_id IS NOT NULL THEN
    SELECT * INTO v_ext FROM public.contract_extensions WHERE midtrans_order_id = p_midtrans_order_id FOR UPDATE;
  END IF;

  -- 2. Locate and lock tenant row FOR UPDATE
  IF v_ext IS NOT NULL AND v_ext.tenant_id IS NOT NULL THEN
    SELECT * INTO v_tenant FROM public.tenants WHERE id = v_ext.tenant_id FOR UPDATE;
  ELSIF p_tenant_id IS NOT NULL THEN
    SELECT * INTO v_tenant FROM public.tenants WHERE id = p_tenant_id FOR UPDATE;
  END IF;

  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'Data penghuni (tenant) tidak ditemukan untuk perpanjangan kontrak';
  END IF;

  -- Idempotency: if extension is already paid AND journal exists, return existing result
  IF v_ext IS NOT NULL AND v_ext.status = 'paid' THEN
    IF EXISTS (
      SELECT 1 FROM public.financial_transactions
       WHERE reference_type = 'contract_extension'
         AND reference_id = v_ext.id::TEXT
         AND status = 'posted'
    ) THEN
      RETURN jsonb_build_object(
        'success', true,
        'idempotent', true,
        'extension_id', v_ext.id,
        'invoice_id', v_ext.invoice_id,
        'new_duration_months', v_tenant.duration_months
      );
    END IF;
  END IF;

  v_invoice_id := COALESCE(v_ext.invoice_id, 'INV-EXT-' || TO_CHAR(NOW(), 'YYMMDD') || '-' || FLOOR(1000 + RANDOM() * 9000)::TEXT);
  v_order_id := COALESCE(v_ext.midtrans_order_id, p_midtrans_order_id, 'EXT-MANUAL-' || FLOOR(EXTRACT(EPOCH FROM NOW()))::TEXT);
  v_new_duration := COALESCE(v_tenant.duration_months, 1) + COALESCE(v_ext.extension_months, p_extension_months, 1);

  IF v_tenant.start_date IS NOT NULL THEN
    v_new_lease_end := (v_tenant.start_date::DATE + (v_new_duration || ' months')::INTERVAL)::DATE;
  ELSE
    v_new_lease_end := (v_today_wib + (v_new_duration || ' months')::INTERVAL)::DATE;
  END IF;

  SELECT name INTO v_prop_name FROM public.properties WHERE id = v_tenant.property_id;

  -- 3. Insert or update contract_extensions record
  IF v_ext IS NULL THEN
    INSERT INTO public.contract_extensions (
      tenant_id, tenant_name, property_id, property_name, room_number,
      old_start_date, old_duration_months, extension_months, monthly_rate,
      total_amount, payment_method, status, midtrans_order_id, invoice_id, notes
    ) VALUES (
      v_tenant.id, v_tenant.full_name, v_tenant.property_id, COALESCE(v_prop_name, 'Samara Stay'), v_tenant.room_number,
      v_tenant.start_date, COALESCE(v_tenant.duration_months, 1), p_extension_months,
      CASE WHEN p_extension_months > 0 THEN p_total_amount / p_extension_months ELSE p_total_amount END,
      p_total_amount, p_payment_method, 'paid', v_order_id, v_invoice_id,
      COALESCE(p_notes, 'Perpanjangan Kontrak ' || p_extension_months || ' Bulan')
    ) RETURNING * INTO v_ext;
  ELSE
    UPDATE public.contract_extensions
       SET status = 'paid',
           payment_method = COALESCE(p_payment_method, v_ext.payment_method),
           invoice_id = v_invoice_id
     WHERE id = v_ext.id
     RETURNING * INTO v_ext;
  END IF;

  -- 4. Update tenant duration & lease_end_date
  UPDATE public.tenants
     SET duration_months = v_new_duration,
         lease_end_date = v_new_lease_end,
         payment_status = 'paid',
         status = 'active'
   WHERE id = v_tenant.id;

  -- 5. Ensure room stays occupied
  UPDATE public.rooms
     SET status = 'occupied',
         current_tenant_name = v_tenant.full_name
   WHERE room_number = v_tenant.room_number
     AND (property_id = v_tenant.property_id OR v_tenant.property_id IS NULL);

  -- 6. Upsert payment invoice
  INSERT INTO public.payments (
    id, tenant_name, property_id, amount, method, status, payment_date, midtrans_order_id, transaction_id
  ) VALUES (
    v_invoice_id,
    v_tenant.full_name,
    v_tenant.property_id,
    v_ext.total_amount,
    v_ext.payment_method,
    'paid',
    v_today_wib,
    v_order_id,
    COALESCE(p_midtrans_transaction_id, v_order_id)
  ) ON CONFLICT (id) DO UPDATE
    SET status = 'paid',
        amount = EXCLUDED.amount;

  -- 7. Determine Debit Account: 1200 for Midtrans, 1010 for Manual Bank/Cash
  IF LOWER(COALESCE(v_ext.payment_method, '')) LIKE '%midtrans%'
     OR LOWER(COALESCE(v_ext.payment_method, '')) LIKE '%qris%'
     OR LOWER(COALESCE(v_ext.payment_method, '')) LIKE '%gopay%'
     OR LOWER(COALESCE(v_ext.payment_method, '')) LIKE '%va%' THEN
    v_debit_acc := 1200;
  ELSE
    v_debit_acc := 1010;
  END IF;

  v_net := GREATEST(0, COALESCE(v_ext.total_amount, 0) - v_fee);

  -- 8. Record in midtrans_clearing_transactions if routed via Midtrans (COA 1200)
  IF v_debit_acc = 1200 THEN
    INSERT INTO public.midtrans_clearing_transactions (
      midtrans_order_id, midtrans_transaction_id, reference_type, reference_id,
      invoice_id, tenant_name, property_id, payment_method,
      gross_amount, fee_amount, net_amount, reconciled_amount, outstanding_amount,
      clearing_status, settled_at
    ) VALUES (
      v_order_id,
      COALESCE(p_midtrans_transaction_id, v_order_id),
      'contract_extension',
      v_ext.id::TEXT,
      v_invoice_id,
      v_tenant.full_name,
      v_tenant.property_id,
      v_ext.payment_method,
      v_ext.total_amount,
      v_fee,
      v_net,
      0,
      v_net,
      'pending',
      NOW()
    ) ON CONFLICT (midtrans_order_id) DO UPDATE
      SET gross_amount = EXCLUDED.gross_amount,
          fee_amount = EXCLUDED.fee_amount,
          net_amount = EXCLUDED.net_amount,
          outstanding_amount = GREATEST(0, EXCLUDED.net_amount - COALESCE(public.midtrans_clearing_transactions.reconciled_amount, 0)),
          updated_at = NOW();
  END IF;

  -- 9. Post double-entry journal (STRICT: RAISE EXCEPTION on failure, NO silent swallow!)
  v_journal_res := public.post_financial_transaction(
    p_category := 'Perpanjangan Kontrak Sewa',
    p_description := 'Perpanjangan Kontrak Kos ' || v_ext.extension_months || ' Bulan - Kamar ' || v_tenant.room_number || ' (' || v_tenant.full_name || ')',
    p_amount := v_ext.total_amount,
    p_type := 'income',
    p_debit_account_id := v_debit_acc,
    p_credit_account_id := 4000,
    p_reference_type := 'contract_extension',
    p_reference_id := v_ext.id::TEXT,
    p_created_by := 'Contract Extension Engine',
    p_transaction_date := v_today_wib,
    p_property_id := v_tenant.property_id
  );

  IF COALESCE((v_journal_res->>'success')::BOOLEAN, FALSE) IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'Gagal mencatat jurnal perpanjangan kontrak #% : %', v_ext.id, COALESCE(v_journal_res->>'error', 'Unknown ledger error');
  END IF;

  IF v_debit_acc = 1200 AND v_fee > 0 THEN
    v_fee_journal_res := public.post_financial_transaction(
      p_category := 'Biaya Layanan Payment Gateway',
      p_description := 'Potongan Biaya Transaksi Midtrans Perpanjangan - Order ' || v_order_id,
      p_amount := v_fee,
      p_type := 'expense',
      p_debit_account_id := 5030,
      p_credit_account_id := 1200,
      p_reference_type := 'midtrans_fee',
      p_reference_id := v_order_id,
      p_created_by := 'Contract Extension Engine',
      p_transaction_date := v_today_wib,
      p_property_id := v_tenant.property_id
    );

    IF COALESCE((v_fee_journal_res->>'success')::BOOLEAN, FALSE) IS DISTINCT FROM TRUE THEN
      RAISE EXCEPTION 'Gagal mencatat jurnal biaya gateway perpanjangan %: %', v_order_id, COALESCE(v_fee_journal_res->>'error', 'Unknown fee ledger error');
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'idempotent', COALESCE((v_journal_res->>'idempotent')::BOOLEAN, FALSE),
    'extension_id', v_ext.id,
    'invoice_id', v_invoice_id,
    'new_duration_months', v_new_duration,
    'new_lease_end_date', v_new_lease_end,
    'debit_account', v_debit_acc,
    'journal', v_journal_res
  );
END;
$$;

-- ============================================================================
-- 4. R5 — BANK RECONCILIATION & UNRECONCILE RPCs (FIX DOUBLE-COUNTED REVENUE)
--    - reconcile_bank_statement_entry: DR 1010 / CR 1200 uses p_type := 'transfer' (NOT 'income')
--    - unreconcile_bank_statement_entry: DR 1200 / CR 1010 uses p_type := 'transfer' (NOT 'expense')
--      and fee reversal DR 1200 / CR 5030 uses p_type := 'expense_reversal' (NOT 'income')
-- ============================================================================
CREATE OR REPLACE FUNCTION public.reconcile_bank_statement_entry(
  p_bank_statement_id BIGINT,
  p_clearing_id BIGINT,
  p_reconciled_amount NUMERIC,
  p_fee_amount NUMERIC DEFAULT 0,
  p_notes TEXT DEFAULT NULL,
  p_created_by TEXT DEFAULT 'Finance Admin'
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bank RECORD;
  v_clearing RECORD;
  v_match_id BIGINT;
  v_new_reconciled NUMERIC;
  v_new_outstanding NUMERIC;
  v_new_status TEXT;
  v_ledger_result JSONB;
  v_fee_ledger_result JSONB;
  v_effective_fee NUMERIC;
BEGIN
  IF p_reconciled_amount IS NULL OR p_reconciled_amount <= 0 THEN
    RAISE EXCEPTION 'Nominal rekonsiliasi harus lebih besar dari 0';
  END IF;

  SELECT * INTO v_bank FROM public.bank_statement_items WHERE id = p_bank_statement_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Data mutasi bank (ID: %) tidak ditemukan', p_bank_statement_id;
  END IF;

  SELECT * INTO v_clearing FROM public.midtrans_clearing_transactions WHERE id = p_clearing_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transaksi Midtrans Clearing (ID: %) tidak ditemukan', p_clearing_id;
  END IF;

  IF v_clearing.clearing_status = 'reconciled' THEN
    RETURN jsonb_build_object(
      'success', true,
      'idempotent', true,
      'message', 'Transaksi kliring ini sudah direkonsiliasi sepenuhnya.'
    );
  END IF;

  v_effective_fee := COALESCE(p_fee_amount, v_clearing.fee_amount, 0);

  INSERT INTO public.bank_reconciliation_matches (
    bank_statement_id,
    clearing_transaction_id,
    midtrans_order_id,
    matched_amount,
    fee_amount,
    variance_amount,
    match_type,
    status,
    notes,
    created_by
  ) VALUES (
    p_bank_statement_id,
    p_clearing_id,
    v_clearing.midtrans_order_id,
    p_reconciled_amount,
    v_effective_fee,
    (v_clearing.gross_amount - p_reconciled_amount - v_effective_fee),
    CASE WHEN (v_clearing.gross_amount - p_reconciled_amount - v_effective_fee) = 0 THEN 'exact' ELSE 'partial' END,
    'matched',
    COALESCE(p_notes, 'Rekonsiliasi Settlement Bank Mandiri untuk Order ' || v_clearing.midtrans_order_id),
    p_created_by
  ) RETURNING id INTO v_match_id;

  -- R5: Post Double-Entry Journal: DR 1010 (Bank Mandiri) / CR 1200 (Piutang Kliring Midtrans)
  -- CRITICAL: p_type := 'transfer' (asset reclassification), NEVER 'income'!
  v_ledger_result := public.post_financial_transaction(
    p_category := 'Rekonsiliasi Settlement Midtrans',
    p_description := '[RECONCILE BANK] Pencairan Midtrans Order ' || v_clearing.midtrans_order_id || ' (' || COALESCE(v_clearing.tenant_name, 'Guest') || ')',
    p_amount := p_reconciled_amount,
    p_type := 'transfer',
    p_debit_account_id := 1010,
    p_credit_account_id := 1200,
    p_reference_type := 'bank_reconciliation',
    p_reference_id := v_match_id::TEXT,
    p_created_by := p_created_by,
    p_transaction_date := COALESCE(v_bank.statement_date, (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Jakarta')::DATE),
    p_property_id := v_clearing.property_id
  );

  IF COALESCE((v_ledger_result->>'success')::BOOLEAN, FALSE) IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'Gagal mencatat jurnal rekonsiliasi bank: %', COALESCE(v_ledger_result->>'error', 'Unknown ledger error');
  END IF;

  -- If fee > 0 and not yet recorded at settlement time, post DR 5030 / CR 1200
  IF v_effective_fee > 0 AND COALESCE(v_clearing.fee_amount, 0) = 0 THEN
    v_fee_ledger_result := public.post_financial_transaction(
      p_category := 'Biaya Layanan Payment Gateway',
      p_description := '[FEE MIDTRANS] Potongan MDR/Admin Midtrans Order ' || v_clearing.midtrans_order_id,
      p_amount := v_effective_fee,
      p_type := 'expense',
      p_debit_account_id := 5030,
      p_credit_account_id := 1200,
      p_reference_type := 'bank_reconciliation_fee',
      p_reference_id := v_match_id::TEXT,
      p_created_by := p_created_by,
      p_transaction_date := COALESCE(v_bank.statement_date, (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Jakarta')::DATE),
      p_property_id := v_clearing.property_id
    );

    IF COALESCE((v_fee_ledger_result->>'success')::BOOLEAN, FALSE) IS DISTINCT FROM TRUE THEN
      RAISE EXCEPTION 'Gagal mencatat jurnal biaya gateway rekonsiliasi: %', COALESCE(v_fee_ledger_result->>'error', 'Unknown fee ledger error');
    END IF;
  END IF;

  v_new_reconciled := COALESCE(v_clearing.reconciled_amount, 0) + p_reconciled_amount;
  v_new_outstanding := GREATEST(0, v_clearing.gross_amount - v_new_reconciled - v_effective_fee);
  v_new_status := CASE
    WHEN v_new_outstanding <= 0 THEN 'reconciled'
    ELSE 'partially_cleared'
  END;

  UPDATE public.midtrans_clearing_transactions
     SET reconciled_amount = v_new_reconciled,
         fee_amount = v_effective_fee,
         net_amount = (gross_amount - v_effective_fee),
         outstanding_amount = v_new_outstanding,
         clearing_status = v_new_status,
         reconciled_at = CASE WHEN v_new_status = 'reconciled' THEN NOW() ELSE reconciled_at END,
         updated_at = NOW()
   WHERE id = p_clearing_id;

  UPDATE public.bank_statement_items
     SET matched = TRUE,
         matched_ref = v_clearing.midtrans_order_id,
         reconciled_at = NOW()
   WHERE id = p_bank_statement_id;

  RETURN jsonb_build_object(
    'success', true,
    'match_id', v_match_id,
    'midtrans_order_id', v_clearing.midtrans_order_id,
    'reconciled_amount', p_reconciled_amount,
    'fee_amount', v_effective_fee,
    'clearing_status', v_new_status,
    'outstanding_amount', v_new_outstanding,
    'ledger', v_ledger_result
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.unreconcile_bank_statement_entry(
  p_match_id BIGINT,
  p_reason TEXT DEFAULT 'Pembatalan rekonsiliasi manual oleh Admin Finance',
  p_created_by TEXT DEFAULT 'Finance Admin'
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_match RECORD;
  v_clearing RECORD;
  v_bank RECORD;
  v_new_reconciled NUMERIC;
  v_new_outstanding NUMERIC;
  v_new_status TEXT;
  v_rev_main JSONB;
  v_rev_fee JSONB := NULL;
  v_other_active_matches INTEGER := 0;
  v_today_wib DATE := (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Jakarta')::DATE;
BEGIN
  SELECT * INTO v_match
    FROM public.bank_reconciliation_matches
   WHERE id = p_match_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Data rekonsiliasi (Match ID: %) tidak ditemukan', p_match_id;
  END IF;

  IF v_match.status = 'unmatched' THEN
    RETURN jsonb_build_object(
      'success', true,
      'idempotent', true,
      'message', 'Rekonsiliasi ini sudah dibatalkan sebelumnya (unmatched).'
    );
  END IF;

  SELECT * INTO v_clearing
    FROM public.midtrans_clearing_transactions
   WHERE id = v_match.clearing_transaction_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Data transaksi kliring Midtrans (ID: %) tidak ditemukan', v_match.clearing_transaction_id;
  END IF;

  SELECT * INTO v_bank
    FROM public.bank_statement_items
   WHERE id = v_match.bank_statement_id
   FOR UPDATE;

  -- R5: Reverse Bank Settlement Journal: DR 1200 / CR 1010 with p_type := 'transfer' (NOT 'expense')
  v_rev_main := public.post_financial_transaction(
    p_category := 'Pembatalan Rekonsiliasi Bank',
    p_description := '[UNMATCH REVERSAL] Pembatalan Rekonsiliasi Order ' || v_clearing.midtrans_order_id || ' - ' || COALESCE(p_reason, 'Unmatch'),
    p_amount := v_match.matched_amount,
    p_type := 'transfer',
    p_debit_account_id := 1200,
    p_credit_account_id := 1010,
    p_reference_type := 'bank_unreconcile',
    p_reference_id := p_match_id::TEXT,
    p_created_by := p_created_by,
    p_transaction_date := v_today_wib,
    p_property_id := v_clearing.property_id
  );

  IF COALESCE((v_rev_main->>'success')::BOOLEAN, FALSE) IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'Gagal mencatat jurnal pembalik rekonsiliasi: %', COALESCE(v_rev_main->>'error', 'Unknown ledger error');
  END IF;

  -- Reverse Gateway Fee Journal if it was posted during reconciliation
  IF COALESCE(v_match.fee_amount, 0) > 0 AND EXISTS (
    SELECT 1 FROM public.financial_transactions
     WHERE reference_type = 'bank_reconciliation_fee'
       AND reference_id = p_match_id::TEXT
  ) THEN
    v_rev_fee := public.post_financial_transaction(
      p_category := 'Pembalikan Biaya Gateway Midtrans',
      p_description := '[UNMATCH FEE REVERSAL] Pembalikan Biaya MDR Order ' || v_clearing.midtrans_order_id,
      p_amount := v_match.fee_amount,
      p_type := 'expense_reversal',
      p_debit_account_id := 1200,
      p_credit_account_id := 5030,
      p_reference_type := 'bank_unreconcile_fee',
      p_reference_id := p_match_id::TEXT,
      p_created_by := p_created_by,
      p_transaction_date := v_today_wib,
      p_property_id := v_clearing.property_id
    );

    IF COALESCE((v_rev_fee->>'success')::BOOLEAN, FALSE) IS DISTINCT FROM TRUE THEN
      RAISE EXCEPTION 'Gagal mencatat jurnal pembalik biaya gateway: %', COALESCE(v_rev_fee->>'error', 'Unknown fee reversal error');
    END IF;
  END IF;

  UPDATE public.bank_reconciliation_matches
     SET status = 'unmatched',
         notes = COALESCE(notes, '') || ' | [UNMATCHED: ' || COALESCE(p_reason, 'Manual Unmatch') || ']'
   WHERE id = p_match_id;

  v_new_reconciled := GREATEST(0, COALESCE(v_clearing.reconciled_amount, 0) - v_match.matched_amount);
  v_new_outstanding := GREATEST(0, v_clearing.gross_amount - v_new_reconciled - COALESCE(v_clearing.fee_amount, 0));
  v_new_status := CASE
    WHEN v_new_reconciled <= 0 THEN 'pending'
    WHEN v_new_outstanding > 0 THEN 'partially_cleared'
    ELSE 'reconciled'
  END;

  UPDATE public.midtrans_clearing_transactions
     SET reconciled_amount = v_new_reconciled,
         outstanding_amount = v_new_outstanding,
         clearing_status = v_new_status,
         reconciled_at = CASE WHEN v_new_status = 'reconciled' THEN reconciled_at ELSE NULL END,
         updated_at = NOW()
   WHERE id = v_clearing.id;

  SELECT COUNT(*) INTO v_other_active_matches
    FROM public.bank_reconciliation_matches
   WHERE bank_statement_id = v_match.bank_statement_id
     AND status = 'matched'
     AND id <> p_match_id;

  IF v_other_active_matches = 0 AND v_bank IS NOT NULL THEN
    UPDATE public.bank_statement_items
       SET matched = FALSE,
           matched_ref = NULL,
           reconciled_at = NULL
     WHERE id = v_match.bank_statement_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'match_id', p_match_id,
    'clearing_id', v_clearing.id,
    'bank_statement_id', v_match.bank_statement_id,
    'clearing_status', v_new_status,
    'reconciled_amount', v_new_reconciled,
    'outstanding_amount', v_new_outstanding,
    'reversal_ledger', v_rev_main,
    'reversal_fee_ledger', v_rev_fee
  );
END;
$$;

-- ============================================================================
-- 5. R6 — SURVEY DP ACCOUNTING SINGLE SOURCE OF TRUTH RPCs
--    - settle_survey_dp_payment: DR 1200 / CR 1300 (type='dp_booking', category='DP Survey')
--      + midtrans_clearing_transactions row
--    - forfeit_or_refund_survey_dp:
--      * forfeit / no_show: DR 1300 / CR 4200 (type='income', category='DP Survey Hangus', reference_type='survey_forfeit')
--      * refund: DR 1300 / CR 1010 (type='liability_refund', category='Refund DP Survey', reference_type='survey_refund')
-- ============================================================================
CREATE OR REPLACE FUNCTION public.settle_survey_dp_payment(
  p_reservation_number TEXT DEFAULT NULL,
  p_survey_id BIGINT DEFAULT NULL,
  p_payment_method TEXT DEFAULT 'Midtrans SNAP',
  p_midtrans_transaction_id TEXT DEFAULT NULL,
  p_gross_amount NUMERIC DEFAULT NULL,
  p_fee_amount NUMERIC DEFAULT 0
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_survey RECORD;
  v_room RECORD;
  v_amount NUMERIC;
  v_fee NUMERIC := GREATEST(0, COALESCE(p_fee_amount, 0));
  v_net NUMERIC;
  v_order_id TEXT;
  v_invoice_id TEXT;
  v_debit_acc INTEGER;
  v_journal_res JSONB;
  v_fee_journal_res JSONB;
  v_today_wib DATE := (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Jakarta')::DATE;
BEGIN
  IF p_survey_id IS NOT NULL THEN
    SELECT * INTO v_survey FROM public.surveys WHERE id = p_survey_id FOR UPDATE;
  ELSIF p_reservation_number IS NOT NULL AND TRIM(p_reservation_number) <> '' THEN
    SELECT * INTO v_survey FROM public.surveys WHERE reservation_number = TRIM(p_reservation_number) FOR UPDATE;
  END IF;

  IF NOT FOUND OR v_survey IS NULL THEN
    RAISE EXCEPTION 'Data survey tidak ditemukan untuk penyelesaian pembayaran DP';
  END IF;

  v_amount := COALESCE(NULLIF(p_gross_amount, 0), v_survey.dp_amount, 500000);
  v_net := GREATEST(0, v_amount - v_fee);
  v_order_id := COALESCE(NULLIF(TRIM(v_survey.reservation_number), ''), NULLIF(TRIM(p_reservation_number), ''), 'SRV-' || v_survey.id::TEXT);
  v_invoice_id := COALESCE(NULLIF(TRIM(v_survey.invoice_id), ''), 'INV-SRV-' || v_survey.id::TEXT);

  -- 1. Update survey status to survey_confirmed
  UPDATE public.surveys
     SET status = 'survey_confirmed',
         payment_method = COALESCE(p_payment_method, v_survey.payment_method, 'Midtrans SNAP'),
         invoice_id = v_invoice_id,
         reservation_number = v_order_id
   WHERE id = v_survey.id;

  -- 2. Lock room to reserved if currently available
  SELECT * INTO v_room
    FROM public.rooms
   WHERE property_id = v_survey.property_id
     AND room_number = v_survey.room_number
   LIMIT 1
   FOR UPDATE;

  IF v_room.id IS NOT NULL AND LOWER(COALESCE(v_room.status, 'available')) = 'available' THEN
    UPDATE public.rooms
       SET status = 'reserved',
           current_tenant_name = v_survey.tenant_name
     WHERE id = v_room.id;
  END IF;

  -- 3. If free survey (dp_amount = 0), skip financial journal
  IF COALESCE(v_survey.dp_amount, 0) <= 0 AND COALESCE(p_gross_amount, 0) <= 0 THEN
    RETURN jsonb_build_object(
      'success', true,
      'survey_id', v_survey.id,
      'invoice_id', v_invoice_id,
      'dp_amount', 0
    );
  END IF;

  -- 4. Upsert payment invoice
  INSERT INTO public.payments (
    id, tenant_name, property_id, amount, method, status, payment_date, midtrans_order_id, transaction_id
  ) VALUES (
    v_invoice_id,
    v_survey.tenant_name,
    v_survey.property_id,
    v_amount,
    COALESCE(p_payment_method, 'Midtrans SNAP'),
    'paid',
    v_today_wib,
    v_order_id,
    COALESCE(p_midtrans_transaction_id, 'mid-' || v_order_id)
  ) ON CONFLICT (id) DO UPDATE
    SET status = 'paid',
        amount = EXCLUDED.amount,
        method = EXCLUDED.method,
        transaction_id = EXCLUDED.transaction_id;

  -- 5. Upsert Midtrans Clearing Transaction (COA 1200) so bank reconciliation DR 1010 / CR 1200 matches
  v_debit_acc := 1200;
  INSERT INTO public.midtrans_clearing_transactions (
    midtrans_order_id,
    midtrans_transaction_id,
    reference_type,
    reference_id,
    invoice_id,
    tenant_name,
    property_id,
    payment_method,
    gross_amount,
    fee_amount,
    net_amount,
    reconciled_amount,
    outstanding_amount,
    clearing_status,
    settled_at
  ) VALUES (
    v_order_id,
    COALESCE(p_midtrans_transaction_id, 'mid-' || v_order_id),
    'survey',
    v_survey.id::TEXT,
    v_invoice_id,
    v_survey.tenant_name,
    v_survey.property_id,
    COALESCE(p_payment_method, 'Midtrans SNAP'),
    v_amount,
    v_fee,
    v_net,
    0,
    v_net,
    'pending',
    NOW()
  ) ON CONFLICT (midtrans_order_id) DO UPDATE
    SET gross_amount = EXCLUDED.gross_amount,
        fee_amount = EXCLUDED.fee_amount,
        net_amount = EXCLUDED.net_amount,
        outstanding_amount = GREATEST(0, EXCLUDED.net_amount - COALESCE(public.midtrans_clearing_transactions.reconciled_amount, 0)),
        updated_at = NOW();

  -- 6. Post single authoritative DP Survey journal: DR 1200 / CR 1300 (type='dp_booking', category='DP Survey')
  v_journal_res := public.post_financial_transaction(
    p_category := 'DP Survey',
    p_description := 'Penerimaan Jaminan DP Survey Kamar ' || v_survey.room_number || ' - ' || v_survey.tenant_name || ' (' || v_order_id || ')',
    p_amount := v_amount,
    p_type := 'dp_booking',
    p_debit_account_id := 1200,
    p_credit_account_id := 1300,
    p_reference_type := 'survey',
    p_reference_id := v_survey.id::TEXT,
    p_created_by := 'Survey Settlement Engine',
    p_transaction_date := v_today_wib,
    p_property_id := v_survey.property_id
  );

  IF COALESCE((v_journal_res->>'success')::BOOLEAN, FALSE) IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'Gagal mencatat jurnal DP Survey #% : %', v_survey.id, COALESCE(v_journal_res->>'error', 'Unknown ledger error');
  END IF;

  IF v_fee > 0 THEN
    v_fee_journal_res := public.post_financial_transaction(
      p_category := 'Biaya Layanan Payment Gateway',
      p_description := 'Potongan Biaya Transaksi Midtrans DP Survey - Order ' || v_order_id,
      p_amount := v_fee,
      p_type := 'expense',
      p_debit_account_id := 5030,
      p_credit_account_id := 1200,
      p_reference_type := 'midtrans_fee',
      p_reference_id := v_order_id,
      p_created_by := 'Survey Settlement Engine',
      p_transaction_date := v_today_wib,
      p_property_id := v_survey.property_id
    );

    IF COALESCE((v_fee_journal_res->>'success')::BOOLEAN, FALSE) IS DISTINCT FROM TRUE THEN
      RAISE EXCEPTION 'Gagal mencatat jurnal biaya gateway DP Survey %: %', v_order_id, COALESCE(v_fee_journal_res->>'error', 'Unknown fee error');
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'idempotent', COALESCE((v_journal_res->>'idempotent')::BOOLEAN, FALSE),
    'survey_id', v_survey.id,
    'invoice_id', v_invoice_id,
    'order_id', v_order_id,
    'journal', v_journal_res
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.forfeit_or_refund_survey_dp(
  p_survey_id BIGINT,
  p_action TEXT,
  p_actor TEXT DEFAULT 'Admin'
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_survey RECORD;
  v_room RECORD;
  v_dp_amount NUMERIC;
  v_target_status TEXT;
  v_journal_res JSONB := NULL;
  v_today_wib DATE := (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Jakarta')::DATE;
BEGIN
  IF p_survey_id IS NULL THEN
    RAISE EXCEPTION 'p_survey_id wajib diisi';
  END IF;

  SELECT * INTO v_survey FROM public.surveys WHERE id = p_survey_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Survey ID % tidak ditemukan', p_survey_id;
  END IF;

  v_dp_amount := COALESCE(v_survey.dp_amount, 0);

  IF LOWER(COALESCE(p_action, '')) = 'no_show' THEN
    v_target_status := 'no_show';
  ELSIF LOWER(COALESCE(p_action, '')) IN ('forfeit', 'forfeited') THEN
    v_target_status := 'forfeited';
  ELSIF LOWER(COALESCE(p_action, '')) = 'refund' THEN
    v_target_status := 'expired';
  ELSE
    v_target_status := 'expired';
  END IF;

  UPDATE public.surveys
     SET status = v_target_status
   WHERE id = p_survey_id;

  -- Release room if currently reserved
  SELECT * INTO v_room
    FROM public.rooms
   WHERE property_id = v_survey.property_id
     AND room_number = v_survey.room_number
   LIMIT 1
   FOR UPDATE;

  IF v_room.id IS NOT NULL AND LOWER(COALESCE(v_room.status, '')) = 'reserved' THEN
    UPDATE public.rooms
       SET status = 'available',
           current_tenant_name = NULL
     WHERE id = v_room.id;
  END IF;

  IF v_dp_amount > 0 THEN
    IF LOWER(COALESCE(p_action, '')) IN ('forfeit', 'forfeited', 'no_show') THEN
      -- R6.3: Single journal DR 1300 / CR 4200 (type='income', category='DP Survey Hangus', reference_type='survey_forfeit')
      v_journal_res := public.post_financial_transaction(
        p_category := 'DP Survey Hangus',
        p_description := 'Reklasifikasi DP Survey Hangus (' || UPPER(p_action) || ') - ' || v_survey.tenant_name || ' (Unit ' || v_survey.room_number || ')',
        p_amount := v_dp_amount,
        p_type := 'income',
        p_debit_account_id := 1300,
        p_credit_account_id := 4200,
        p_reference_type := 'survey_forfeit',
        p_reference_id := v_survey.id::TEXT,
        p_created_by := COALESCE(p_actor, 'Admin'),
        p_transaction_date := v_today_wib,
        p_property_id := v_survey.property_id
      );

      IF COALESCE((v_journal_res->>'success')::BOOLEAN, FALSE) IS DISTINCT FROM TRUE THEN
        RAISE EXCEPTION 'Gagal mencatat jurnal DP Survey Hangus #% : %', v_survey.id, COALESCE(v_journal_res->>'error', 'Unknown ledger error');
      END IF;
    ELSIF LOWER(COALESCE(p_action, '')) = 'refund' THEN
      -- R6.4: Refund DP Survey DR 1300 / CR 1010 with type='liability_refund', category='Refund DP Survey' (NOT 'expense')
      v_journal_res := public.post_financial_transaction(
        p_category := 'Refund DP Survey',
        p_description := 'Pengembalian (Refund) Liabilitas DP Survey - ' || v_survey.tenant_name || ' (Unit ' || v_survey.room_number || ')',
        p_amount := v_dp_amount,
        p_type := 'liability_refund',
        p_debit_account_id := 1300,
        p_credit_account_id := 1010,
        p_reference_type := 'survey_refund',
        p_reference_id := v_survey.id::TEXT,
        p_created_by := COALESCE(p_actor, 'Admin'),
        p_transaction_date := v_today_wib,
        p_property_id := v_survey.property_id
      );

      IF COALESCE((v_journal_res->>'success')::BOOLEAN, FALSE) IS DISTINCT FROM TRUE THEN
        RAISE EXCEPTION 'Gagal mencatat jurnal Refund DP Survey #% : %', v_survey.id, COALESCE(v_journal_res->>'error', 'Unknown ledger error');
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'survey_id', v_survey.id,
    'status', v_target_status,
    'action', p_action,
    'dp_amount', v_dp_amount,
    'journal', v_journal_res
  );
END;
$$;

-- Restrict RPC execute grants to authenticated / service_role only (no anon)
REVOKE ALL ON FUNCTION public.post_financial_transaction(TEXT, TEXT, NUMERIC, TEXT, INTEGER, INTEGER, TEXT, TEXT, TEXT, DATE, BIGINT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.post_financial_transaction(TEXT, TEXT, NUMERIC, TEXT, INTEGER, INTEGER, TEXT, TEXT, TEXT, DATE, BIGINT) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.settle_booking_payment(TEXT, TEXT, TEXT, NUMERIC, NUMERIC) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.settle_booking_payment(TEXT, TEXT, TEXT, NUMERIC, NUMERIC) TO service_role;

REVOKE ALL ON FUNCTION public.settle_manual_booking_approval(BIGINT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.settle_manual_booking_approval(BIGINT, TEXT) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.settle_contract_extension(BIGINT, TEXT, BIGINT, INTEGER, NUMERIC, TEXT, TEXT, NUMERIC, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.settle_contract_extension(BIGINT, TEXT, BIGINT, INTEGER, NUMERIC, TEXT, TEXT, NUMERIC, TEXT) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.reconcile_bank_statement_entry(BIGINT, BIGINT, NUMERIC, NUMERIC, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reconcile_bank_statement_entry(BIGINT, BIGINT, NUMERIC, NUMERIC, TEXT, TEXT) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.unreconcile_bank_statement_entry(BIGINT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.unreconcile_bank_statement_entry(BIGINT, TEXT, TEXT) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.settle_survey_dp_payment(TEXT, BIGINT, TEXT, TEXT, NUMERIC, NUMERIC) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.settle_survey_dp_payment(TEXT, BIGINT, TEXT, TEXT, NUMERIC, NUMERIC) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.forfeit_or_refund_survey_dp(BIGINT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.forfeit_or_refund_survey_dp(BIGINT, TEXT, TEXT) TO authenticated, service_role;

COMMIT;
