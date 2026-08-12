-- Migration: 021_add_property_id_to_extension_journal.sql
-- Description: Updates RPC settle_contract_extension() to pass v_tenant.property_id
-- to post_financial_transaction() when recording contract extension revenue.

CREATE OR REPLACE FUNCTION settle_contract_extension(
  p_tenant_id BIGINT,
  p_extension_months INT,
  p_total_amount NUMERIC,
  p_payment_method VARCHAR(100),
  p_order_id VARCHAR(100),
  p_transaction_id VARCHAR(100),
  p_notes TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant RECORD;
  v_property_name VARCHAR(255);
  v_invoice_id VARCHAR(50);
  v_ext_id BIGINT;
  v_new_duration INT;
  v_trx_no VARCHAR(50);
BEGIN
  -- 1. Fetch & lock tenant record
  SELECT * INTO v_tenant FROM tenants WHERE id = p_tenant_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Tenant record not found');
  END IF;

  -- Get property name
  IF v_tenant.property_id IS NOT NULL THEN
    SELECT name INTO v_property_name FROM properties WHERE id = v_tenant.property_id;
  END IF;

  v_new_duration := COALESCE(v_tenant.duration_months, 1) + p_extension_months;

  -- 2. Update tenant duration & payment status
  UPDATE tenants
  SET duration_months = v_new_duration,
      payment_status = 'paid',
      status = 'active'
  WHERE id = p_tenant_id;

  -- 3. Generate Invoice ID
  v_invoice_id := 'INV-EXT-' || FLOOR(1000 + RANDOM() * 9000)::TEXT;

  -- 4. Upsert Contract Extension Record
  INSERT INTO contract_extensions (
    tenant_id,
    tenant_name,
    property_id,
    property_name,
    room_number,
    old_start_date,
    old_duration_months,
    extension_months,
    monthly_rate,
    total_amount,
    payment_method,
    status,
    midtrans_order_id,
    invoice_id,
    notes,
    paid_at
  ) VALUES (
    v_tenant.id,
    v_tenant.full_name,
    v_tenant.property_id,
    COALESCE(v_property_name, 'Properti Kos'),
    v_tenant.room_number,
    COALESCE(v_tenant.start_date, CURRENT_DATE),
    COALESCE(v_tenant.duration_months, 1),
    p_extension_months,
    ROUND(p_total_amount / GREATEST(p_extension_months, 1)),
    p_total_amount,
    COALESCE(p_payment_method, 'Midtrans'),
    'paid',
    p_order_id,
    v_invoice_id,
    p_notes,
    NOW()
  )
  ON CONFLICT (midtrans_order_id) DO UPDATE SET
    status = 'paid',
    invoice_id = v_invoice_id,
    payment_method = EXCLUDED.payment_method,
    paid_at = NOW()
  RETURNING id INTO v_ext_id;

  -- 5. Insert Invoice into payments table
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
    v_tenant.full_name,
    v_tenant.property_id,
    p_total_amount,
    COALESCE(p_payment_method, 'Midtrans'),
    'paid',
    CURRENT_DATE,
    p_order_id,
    COALESCE(p_transaction_id, 'mid-tr-ext-' || FLOOR(100000 + RANDOM() * 900000)::TEXT)
  )
  ON CONFLICT (id) DO NOTHING;

  -- 6. Post double-entry accounting journal with property_id (Kas & Bank / Pendapatan Sewa Kamar)
  BEGIN
    v_trx_no := 'TRX-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || FLOOR(100 + RANDOM() * 900)::TEXT;
    PERFORM post_financial_transaction(
      v_trx_no,
      CURRENT_DATE,
      'Penerimaan Sewa',
      'Perpanjangan Kontrak ' || v_tenant.full_name || ' Kamar ' || v_tenant.room_number || ' (' || p_extension_months || ' Bulan)',
      p_total_amount,
      'income',
      'payment',
      v_invoice_id,
      'System (Contract Extension)',
      1010,
      4000,
      v_tenant.property_id
    );
  EXCEPTION WHEN OTHERS THEN
    -- Catat peringatan di notes
    UPDATE contract_extensions SET notes = COALESCE(notes, '') || ' [PERINGATAN: posting jurnal otomatis gagal, cek manual]' WHERE id = v_ext_id;
  END;

  RETURN jsonb_build_object(
    'success', true,
    'extension_id', v_ext_id,
    'tenant_id', p_tenant_id,
    'invoice_id', v_invoice_id,
    'tenant_name', v_tenant.full_name,
    'property_name', COALESCE(v_property_name, 'Properti Kos'),
    'room_number', v_tenant.room_number,
    'new_duration_months', v_new_duration,
    'extended_months', p_extension_months,
    'total_amount', p_total_amount
  );
END;
$$;
