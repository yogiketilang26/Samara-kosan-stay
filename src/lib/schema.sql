-- =========================================================================
-- SAMARA KOS ERP FINANCIAL MANAGEMENT SYSTEM
-- PostgreSQL Database Schema & Transactional Posting Engine
-- =========================================================================

-- 1. Create journal_entries Table (Double-Entry Ledger Bookkeeping)
CREATE TABLE IF NOT EXISTS journal_entries (
  id BIGSERIAL PRIMARY KEY,
  journal_no VARCHAR(50) NOT NULL,
  transaction_id BIGINT NOT NULL,
  account_id BIGINT NOT NULL,
  debit NUMERIC(15, 2) DEFAULT 0 NOT NULL,
  credit NUMERIC(15, 2) DEFAULT 0 NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 2. Add indexing for lightning-fast queries and general ledger performance
CREATE INDEX IF NOT EXISTS idx_journal_entries_transaction_id ON journal_entries(transaction_id);
CREATE INDEX IF NOT EXISTS idx_journal_entries_account_id ON journal_entries(account_id);

-- 3. Create a PostgreSQL Stored Function for Atomic Posting
-- This function guarantees ACID compliance (Atomicity, Consistency, Isolation, Durability).
-- Any error inside this block triggers an automatic rollback of all database changes.
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
  p_credit_account_id INT
) RETURNS JSONB AS $$
DECLARE
  v_transaction_id BIGINT;
  v_journal_no VARCHAR(50);
  v_debit_balance_change NUMERIC(15, 2);
  v_credit_balance_change NUMERIC(15, 2);
  v_result JSONB;
BEGIN
  -- A. Insert parent Financial Transaction
  INSERT INTO financial_transactions (
    transaction_no,
    transaction_date,
    category,
    description,
    amount,
    type,
    reference_type,
    reference_id,
    created_by
  ) VALUES (
    p_transaction_no,
    p_transaction_date,
    p_category,
    p_description,
    p_amount,
    p_type,
    p_reference_type,
    p_reference_id,
    p_created_by
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
  -- Automatic transaction rollback is performed on exceptions
  v_result := jsonb_build_object(
    'success', false,
    'error', SQLERRM,
    'code', SQLSTATE
  );
  RETURN v_result;
END;
$$ LANGUAGE plpgsql;
