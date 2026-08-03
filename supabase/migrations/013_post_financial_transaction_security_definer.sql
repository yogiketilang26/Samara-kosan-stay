-- Migration: 013_post_financial_transaction_security_definer.sql
-- Description: Adds SECURITY DEFINER and SET search_path = public to post_financial_transaction() function for secure RPC invocation across authenticated roles.

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
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

-- ⚠️ ACTION REQUIRED: Jalankan migration ini di Supabase SQL Editor
/*
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
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_transaction_id BIGINT;
  v_journal_no VARCHAR(50);
  v_debit_balance_change NUMERIC(15, 2);
  v_credit_balance_change NUMERIC(15, 2);
  v_result JSONB;
BEGIN
  INSERT INTO financial_transactions (
    transaction_no, transaction_date, category, description,
    amount, type, reference_type, reference_id, created_by
  ) VALUES (
    p_transaction_no, p_transaction_date, p_category, p_description,
    p_amount, p_type, p_reference_type, p_reference_id, p_created_by
  ) RETURNING id INTO v_transaction_id;

  v_journal_no := 'JRN-' || TO_CHAR(p_transaction_date, 'YYYYMMDD') || '-' || LPAD(CAST(v_transaction_id AS VARCHAR), 5, '0');

  INSERT INTO journal_entries (journal_no, transaction_id, account_id, debit, credit)
  VALUES (v_journal_no, v_transaction_id, p_debit_account_id, p_amount, 0);

  INSERT INTO journal_entries (journal_no, transaction_id, account_id, debit, credit)
  VALUES (v_journal_no, v_transaction_id, p_credit_account_id, 0, p_amount);

  UPDATE accounts
  SET balance = CASE 
    WHEN type IN ('asset', 'expense') THEN balance + p_amount
    ELSE GREATEST(0, balance - p_amount)
  END
  WHERE id = p_debit_account_id;

  UPDATE accounts
  SET balance = CASE 
    WHEN type IN ('liability', 'equity', 'revenue') THEN balance + p_amount
    ELSE GREATEST(0, balance - p_amount)
  END
  WHERE id = p_credit_account_id;

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
*/
