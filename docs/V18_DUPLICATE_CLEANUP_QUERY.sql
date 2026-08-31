-- ==============================================================================
-- SAMARA STAY ERP v18 — FORENSIC AUDIT & DUPLICATE TRANSACTIONS CLEANUP SCRIPT
-- ==============================================================================
-- Purpose: Identify duplicate payments, duplicate financial transactions, and 
--          unbalanced journal entries caused by client-side duplicate posting in v17.
-- NOTE: DO NOT EXECUTE DESTRUCTIVE QUERIES BLINDLY. Review the SELECT queries first.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- STEP 1: Identify Duplicate Payments for the Same Tenant / Property within 10 minutes
-- ------------------------------------------------------------------------------
SELECT 
    p1.id AS invoice_id_1,
    p2.id AS invoice_id_2,
    p1.tenant_name,
    p1.property_id,
    p1.amount,
    p1.payment_date,
    p1.created_at AS created_at_1,
    p2.created_at AS created_at_2,
    ABS(EXTRACT(EPOCH FROM (p1.created_at - p2.created_at))) AS seconds_apart
FROM payments p1
JOIN payments p2 
    ON p1.tenant_name = p2.tenant_name
    AND p1.property_id = p2.property_id
    AND p1.amount = p2.amount
    AND p1.id < p2.id
    AND ABS(EXTRACT(EPOCH FROM (p1.created_at - p2.created_at))) <= 600
ORDER BY p1.created_at DESC;

-- ------------------------------------------------------------------------------
-- STEP 2: Identify Duplicate Financial Transactions Linked to Duplicate Payments
-- ------------------------------------------------------------------------------
SELECT 
    ft1.id AS trx_id_1,
    ft1.transaction_no AS trx_no_1,
    ft1.reference_id AS ref_invoice_1,
    ft2.id AS trx_id_2,
    ft2.transaction_no AS trx_no_2,
    ft2.reference_id AS ref_invoice_2,
    ft1.description,
    ft1.amount,
    ft1.created_at AS created_at_1,
    ft2.created_at AS created_at_2
FROM financial_transactions ft1
JOIN financial_transactions ft2 
    ON ft1.amount = ft2.amount
    AND ft1.property_id = ft2.property_id
    AND ft1.type = 'income'
    AND ft1.reference_type = 'payment'
    AND ft2.reference_type = 'payment'
    AND ft1.id < ft2.id
    AND ABS(EXTRACT(EPOCH FROM (ft1.created_at - ft2.created_at))) <= 600
ORDER BY ft1.created_at DESC;

-- ------------------------------------------------------------------------------
-- STEP 3: Identify Redundant Journal Entries from Duplicate Financial Transactions
-- ------------------------------------------------------------------------------
SELECT 
    je.id AS journal_entry_id,
    je.journal_no,
    je.transaction_id,
    je.account_id,
    je.debit,
    je.credit,
    je.created_at,
    ft.description,
    ft.reference_id
FROM journal_entries je
JOIN financial_transactions ft ON je.transaction_id = ft.id
WHERE ft.id IN (
    SELECT ft2.id
    FROM financial_transactions ft1
    JOIN financial_transactions ft2 
        ON ft1.amount = ft2.amount
        AND ft1.property_id = ft2.property_id
        AND ft1.type = 'income'
        AND ft1.reference_type = 'payment'
        AND ft2.reference_type = 'payment'
        AND ft1.id < ft2.id
        AND ABS(EXTRACT(EPOCH FROM (ft1.created_at - ft2.created_at))) <= 600
)
ORDER BY je.transaction_id, je.account_id;

-- ------------------------------------------------------------------------------
-- STEP 4: (OPTIONAL MANUAL ROLLBACK / CLEANUP TEMPLATE)
-- Run this block ONLY after reviewing the IDs identified in Step 1, 2, and 3.
-- Replace '{DUPLICATE_TRX_ID}' and '{DUPLICATE_INVOICE_ID}' with actual IDs.
-- ------------------------------------------------------------------------------
/*
BEGIN;

-- A. Reverse Account Balances for the duplicate transaction
-- Debit was added to account 1010/1200, Credit was added to account 4000
UPDATE accounts 
SET balance = balance - {AMOUNT} 
WHERE id IN ({DEBIT_ACCOUNT_ID}, {CREDIT_ACCOUNT_ID});

-- B. Remove duplicate journal entries
DELETE FROM journal_entries 
WHERE transaction_id = {DUPLICATE_TRX_ID};

-- C. Remove duplicate financial transaction
DELETE FROM financial_transactions 
WHERE id = {DUPLICATE_TRX_ID};

-- D. Remove duplicate payment invoice
DELETE FROM payments 
WHERE id = '{DUPLICATE_INVOICE_ID}';

COMMIT;
*/
