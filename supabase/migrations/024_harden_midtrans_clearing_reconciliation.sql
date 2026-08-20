-- ====================================================================
-- SAMARA STAY ERP — MIGRATION 024: HARDEN MIDTRANS CLEARING & BANK RECONCILIATION
-- ====================================================================

-- 1. SEED / UPDATE COMPREHENSIVE CHART OF ACCOUNTS (COA)
INSERT INTO public.accounts (id, name, type, balance) VALUES
  (1000, 'Kas Tunai / Cash on Hand', 'asset', 0),
  (1010, 'Kas Utama Bank Mandiri (Operasional)', 'asset', 0),
  (1020, 'Bank Penampung Midtrans Escrow', 'asset', 0),
  (1200, 'Piutang Kliring Midtrans (Gateway Clearing)', 'asset', 0),
  (1300, 'Hutang Titipan Uang Muka / Deposit Survey', 'liability', 0),
  (2000, 'Hutang Usaha / Vendor Payable', 'liability', 0),
  (2100, 'Hutang Deposit Jaminan Sewa (Security Deposit)', 'liability', 0),
  (3000, 'Modal Pemilik / Modal Disetor', 'equity', 0),
  (3100, 'Laba Ditahan / Retained Earnings', 'equity', 0),
  (4000, 'Pendapatan Sewa Kamar Kos', 'revenue', 0),
  (4100, 'Pendapatan Denda & Keterlambatan', 'revenue', 0),
  (4200, 'Pendapatan DP Survey Hangus', 'revenue', 0),
  (4300, 'Pendapatan Laundry & Layanan Tambahan', 'revenue', 0),
  (5000, 'Beban Listrik, Air & Utilitas', 'expense', 0),
  (5010, 'Beban Internet & WiFi', 'expense', 0),
  (5020, 'Beban Kebersihan & Sampah', 'expense', 0),
  (5030, 'Biaya Layanan Midtrans / Payment Gateway', 'expense', 0),
  (5100, 'Beban Pemeliharaan & Perbaikan Gedung', 'expense', 0),
  (5200, 'Beban Gaji Karyawan & Penjaga Kos', 'expense', 0),
  (5300, 'Beban Pemasaran & Iklan Properti', 'expense', 0),
  (5400, 'Beban Perlengkapan & Operasional Kantor', 'expense', 0)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  type = EXCLUDED.type;

-- 2. CREATE FUNCTION unreconcile_bank_statement_entry
CREATE OR REPLACE FUNCTION unreconcile_bank_statement_entry(
  p_match_id BIGINT,
  p_created_by VARCHAR(100) DEFAULT 'Finance Administrator',
  p_reason TEXT DEFAULT 'Pembatalan / Unmatch Rekonsiliasi Bank'
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_match RECORD;
  v_bank_stmt RECORD;
  v_clearing RECORD;
  v_trx_no_reversal VARCHAR(50);
  v_trx_no_fee_reversal VARCHAR(50);
  v_new_reconciled NUMERIC(15, 2);
  v_new_fee NUMERIC(15, 2);
  v_new_outstanding NUMERIC(15, 2);
  v_new_status VARCHAR(50);
BEGIN
  -- 1. Lock and fetch match record
  SELECT * INTO v_match FROM bank_reconciliation_matches WHERE id = p_match_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Data riwayat rekonsiliasi tidak ditemukan');
  END IF;

  IF v_match.status = 'unmatched' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Rekonsiliasi ini sudah dibatalkan sebelumnya');
  END IF;

  -- 2. Lock and fetch bank statement & clearing records
  SELECT * INTO v_bank_stmt FROM bank_statement_items WHERE id = v_match.bank_statement_id FOR UPDATE;
  SELECT * INTO v_clearing FROM midtrans_clearing_transactions WHERE id = v_match.clearing_transaction_id FOR UPDATE;

  -- 3. Calculate restored clearing numbers
  v_new_reconciled := GREATEST(0, COALESCE(v_clearing.reconciled_amount, 0) - v_match.matched_amount);
  v_new_fee := GREATEST(0, COALESCE(v_clearing.fee_amount, 0) - COALESCE(v_match.fee_amount, 0));
  v_new_outstanding := GREATEST(0, v_clearing.gross_amount - v_new_reconciled - v_new_fee);

  IF v_new_reconciled <= 0 THEN
    v_new_status := 'pending';
  ELSE
    v_new_status := 'partially_cleared';
  END IF;

  -- 4. Post Reversal Journal: DR 1200 (Midtrans Clearing) & CR 1010 (Bank Mandiri)
  v_trx_no_reversal := 'TRX-REV-BNK-' || TO_CHAR(CURRENT_DATE, 'YYYYMMDD') || '-' || FLOOR(1000 + RANDOM() * 9000)::TEXT;
  PERFORM post_financial_transaction(
    v_trx_no_reversal,
    CURRENT_DATE,
    'Reversal Rekonsiliasi Bank',
    'Pembatalan Rekonsiliasi Bank Mutasi #' || v_match.bank_statement_id || ' ke Order #' || COALESCE(v_clearing.midtrans_order_id, '') || ' (' || COALESCE(p_reason, 'Unmatch') || ')',
    v_match.matched_amount,
    'expense',
    'reconciliation_reversal',
    COALESCE(v_clearing.midtrans_order_id, v_match.id::TEXT),
    p_created_by,
    1200, -- Debit: Midtrans Clearing (Restoring receivable balance)
    1010, -- Credit: Bank Mandiri (Restoring bank balance)
    v_clearing.property_id
  );

  -- 5. If Fee was recorded, post reversal of Fee: DR 1200 (Midtrans Clearing) & CR 5030 (Biaya Layanan Midtrans)
  IF COALESCE(v_match.fee_amount, 0) > 0 THEN
    v_trx_no_fee_reversal := 'TRX-REV-FEE-' || TO_CHAR(CURRENT_DATE, 'YYYYMMDD') || '-' || FLOOR(1000 + RANDOM() * 9000)::TEXT;
    PERFORM post_financial_transaction(
      v_trx_no_fee_reversal,
      CURRENT_DATE,
      'Reversal Biaya Midtrans',
      'Pembatalan Beban Fee Midtrans - Order #' || COALESCE(v_clearing.midtrans_order_id, ''),
      v_match.fee_amount,
      'income',
      'reconciliation_fee_reversal',
      COALESCE(v_clearing.midtrans_order_id, v_match.id::TEXT),
      p_created_by,
      1200, -- Debit: Midtrans Clearing
      5030, -- Credit: Biaya Payment Gateway
      v_clearing.property_id
    );
  END IF;

  -- 6. Update Clearing Transaction
  IF v_clearing.id IS NOT NULL THEN
    UPDATE midtrans_clearing_transactions
    SET fee_amount = v_new_fee,
        net_amount = gross_amount - v_new_fee,
        reconciled_amount = v_new_reconciled,
        outstanding_amount = v_new_outstanding,
        clearing_status = v_new_status
    WHERE id = v_clearing.id;
  END IF;

  -- 7. Reset Bank Statement Item
  IF v_bank_stmt.id IS NOT NULL THEN
    UPDATE bank_statement_items
    SET matched = false,
        matched_ref = null
    WHERE id = v_bank_stmt.id;
  END IF;

  -- 8. Mark match as cancelled / unmatched
  UPDATE bank_reconciliation_matches
  SET status = 'unmatched',
      notes = COALESCE(notes, '') || ' [DIBATALKAN: ' || p_reason || ' oleh ' || p_created_by || ' pada ' || TO_CHAR(NOW(), 'YYYY-MM-DD HH24:MI:SS') || ']'
  WHERE id = p_match_id;

  RETURN jsonb_build_object(
    'success', true,
    'match_id', p_match_id,
    'message', 'Rekonsiliasi bank berhasil dibatalkan dan jurnal pembalik telah dicatat secara otomatis.'
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM,
    'code', SQLSTATE
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION unreconcile_bank_statement_entry(BIGINT, VARCHAR, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION unreconcile_bank_statement_entry(BIGINT, VARCHAR, TEXT) TO service_role;

-- 3. CREATE FUNCTION adjust_clearing_transaction
CREATE OR REPLACE FUNCTION adjust_clearing_transaction(
  p_clearing_id BIGINT,
  p_adjustment_amount NUMERIC(15, 2),
  p_adjustment_account_id INT DEFAULT 5030,
  p_category VARCHAR(100) DEFAULT 'Adjustment Midtrans',
  p_notes TEXT DEFAULT NULL,
  p_created_by VARCHAR(100) DEFAULT 'Finance Administrator'
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clearing RECORD;
  v_trx_no VARCHAR(50);
BEGIN
  SELECT * INTO v_clearing FROM midtrans_clearing_transactions WHERE id = p_clearing_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Data kliring Midtrans tidak ditemukan');
  END IF;

  -- Post Adjustment Journal: DR p_adjustment_account_id & CR 1200
  v_trx_no := 'TRX-ADJ-' || TO_CHAR(CURRENT_DATE, 'YYYYMMDD') || '-' || FLOOR(1000 + RANDOM() * 9000)::TEXT;
  PERFORM post_financial_transaction(
    v_trx_no,
    CURRENT_DATE,
    p_category,
    COALESCE(p_notes, 'Penyesuaian Kliring Midtrans #' || v_clearing.midtrans_order_id),
    p_adjustment_amount,
    'expense',
    'clearing_adjustment',
    v_clearing.midtrans_order_id,
    p_created_by,
    p_adjustment_account_id, -- Debit: Biaya/Beban Penyesuaian
    1200, -- Credit: Piutang Kliring Midtrans
    v_clearing.property_id
  );

  UPDATE midtrans_clearing_transactions
  SET fee_amount = COALESCE(fee_amount, 0) + p_adjustment_amount,
      net_amount = gross_amount - (COALESCE(fee_amount, 0) + p_adjustment_amount),
      outstanding_amount = GREATEST(0, gross_amount - reconciled_amount - (COALESCE(fee_amount, 0) + p_adjustment_amount))
  WHERE id = p_clearing_id;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Penyesuaian kliring berhasil dicatat dan diposting ke ledger.'
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION adjust_clearing_transaction(BIGINT, NUMERIC, INT, VARCHAR, TEXT, VARCHAR) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION adjust_clearing_transaction(BIGINT, NUMERIC, INT, VARCHAR, TEXT, VARCHAR) TO service_role;

-- 4. UPDATE settle_contract_extension TO POST DR 1200 / CR 4000 FOR MIDTRANS PAYMENTS
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
  v_debit_account INT;
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

  -- 6. Insert into midtrans_clearing_transactions if paid via Midtrans
  IF (p_order_id IS NOT NULL AND p_order_id <> '') OR (p_payment_method ILIKE '%midtrans%') THEN
    v_debit_account := 1200; -- Piutang Kliring Midtrans
    INSERT INTO midtrans_clearing_transactions (
      payment_id,
      contract_extension_id,
      midtrans_order_id,
      midtrans_transaction_id,
      gross_amount,
      fee_amount,
      net_amount,
      reconciled_amount,
      outstanding_amount,
      clearing_status,
      property_id,
      tenant_name,
      settled_at
    ) VALUES (
      v_invoice_id,
      v_ext_id,
      COALESCE(p_order_id, 'EXT-' || v_ext_id),
      p_transaction_id,
      p_total_amount,
      0,
      p_total_amount,
      0,
      p_total_amount,
      'pending',
      v_tenant.property_id,
      v_tenant.full_name,
      NOW()
    )
    ON CONFLICT (midtrans_order_id) DO UPDATE SET
      settled_at = NOW(),
      clearing_status = 'pending',
      gross_amount = EXCLUDED.gross_amount,
      net_amount = EXCLUDED.net_amount,
      outstanding_amount = EXCLUDED.outstanding_amount;
  ELSE
    v_debit_account := 1010; -- Kas Bank Mandiri (Manual Transfer/Cash)
  END IF;

  -- 7. Post double-entry accounting journal with property_id (DR 1200 / CR 4000)
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
      v_debit_account,
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

REVOKE EXECUTE ON FUNCTION settle_contract_extension(BIGINT, INT, NUMERIC, VARCHAR, VARCHAR, VARCHAR, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION settle_contract_extension(BIGINT, INT, NUMERIC, VARCHAR, VARCHAR, VARCHAR, TEXT) TO service_role;
