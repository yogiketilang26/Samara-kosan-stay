-- Migration: 020_add_property_dimension.sql
-- Description: Menambahkan dimensi property_id ke financial_transactions
-- supaya laporan keuangan per-properti bisa dibuat di masa depan.
-- Kolom nullable — transaksi yang memang tidak terkait satu properti spesifik
-- (misal biaya operasional gabungan, petty cash umum) boleh tetap NULL.

ALTER TABLE financial_transactions
  ADD COLUMN IF NOT EXISTS property_id INTEGER REFERENCES properties(id);

CREATE INDEX IF NOT EXISTS idx_financial_transactions_property_id
  ON financial_transactions(property_id);

-- Backfill data lama: hanya untuk transaksi yang reference_type-nya 'payment',
-- karena hanya jenis ini yang bisa ditelusuri balik ke property_id secara
-- andal lewat tabel payments. Jenis lain (reclassification, expense umum)
-- SENGAJA dibiarkan NULL karena memang tidak selalu terkait satu properti.
UPDATE financial_transactions ft
SET property_id = p.property_id
FROM payments p
WHERE ft.reference_type = 'payment'
  AND ft.reference_id = p.id
  AND ft.property_id IS NULL
  AND p.property_id IS NOT NULL;

-- Update post_financial_transaction RPC function to support optional p_property_id
CREATE OR REPLACE FUNCTION post_financial_transaction(
  p_transaction_no VARCHAR(50),
  p_transaction_date DATE,
  p_category VARCHAR(100),
  p_description TEXT,
  p_amount NUMERIC(15, 2),
  p_type VARCHAR(50),
  p_reference_type VARCHAR(50),
  p_reference_id VARCHAR(50),
  p_created_by VARCHAR(100),
  p_debit_account_id INT,
  p_credit_account_id INT,
  p_property_id INT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_transaction_id BIGINT;
  v_journal_no VARCHAR(50);
  v_result JSONB;
BEGIN
  -- A. Insert parent Financial Transaction with optional property_id
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
    p_transaction_no,
    p_transaction_date,
    p_category,
    p_description,
    p_amount,
    p_type,
    p_reference_type,
    p_reference_id,
    p_created_by,
    p_property_id
  ) RETURNING id INTO v_transaction_id;

  -- Generate sequential Journal Entry number
  v_journal_no := 'JRN-' || TO_CHAR(p_transaction_date, 'YYYYMMDD') || '-' || LPAD(CAST(v_transaction_id AS VARCHAR), 5, '0');

  -- B. Insert Debit Ledger Entry
  INSERT INTO journal_entries (
    journal_no,
    transaction_id,
    account_id,
    debit,
    credit
  ) VALUES (
    v_journal_no,
    v_transaction_id,
    p_debit_account_id,
    p_amount,
    0
  );

  -- C. Insert Credit Ledger Entry
  INSERT INTO journal_entries (
    journal_no,
    transaction_id,
    account_id,
    debit,
    credit
  ) VALUES (
    v_journal_no,
    v_transaction_id,
    p_credit_account_id,
    0,
    p_amount
  );

  -- D. Update Debit Account Balance (Normal balance rule: Asset and Expense increase on Debit)
  UPDATE accounts
  SET balance = CASE 
    WHEN type IN ('asset', 'expense') THEN balance + p_amount
    ELSE GREATEST(0, balance - p_amount)
  END
  WHERE id = p_debit_account_id;

  -- E. Update Credit Account Balance (Normal balance rule: Liability, Equity, and Revenue increase on Credit)
  UPDATE accounts
  SET balance = CASE 
    WHEN type IN ('liability', 'equity', 'revenue') THEN balance + p_amount
    ELSE GREATEST(0, balance - p_amount)
  END
  WHERE id = p_credit_account_id;

  -- Build final successful JSON payload
  v_result := jsonb_build_object(
    'success', true,
    'transaction_id', v_transaction_id,
    'journal_no', v_journal_no,
    'message', 'Transaction and double-entry journals posted successfully'
  );

  RETURN v_result;

EXCEPTION WHEN OTHERS THEN
  v_result := jsonb_build_object(
    'success', false,
    'error', SQLERRM,
    'code', SQLSTATE
  );
  RETURN v_result;
END;
$$;

-- Restrict execution permission on post_financial_transaction to service_role only
REVOKE EXECUTE ON FUNCTION post_financial_transaction(
  VARCHAR(50), DATE, VARCHAR(100), TEXT, NUMERIC(15, 2), VARCHAR(50), VARCHAR(50), VARCHAR(50), VARCHAR(100), INT, INT, INT
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION post_financial_transaction(
  VARCHAR(50), DATE, VARCHAR(100), TEXT, NUMERIC(15, 2), VARCHAR(50), VARCHAR(50), VARCHAR(50), VARCHAR(100), INT, INT, INT
) TO service_role;
