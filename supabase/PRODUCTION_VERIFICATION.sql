-- ============================================================================
-- SAMARA STAY — PRODUCTION DATABASE VERIFICATION & AUDIT QUERIES
-- Consolidated, non-overlapping read-only SQL checks for live production state.
-- ============================================================================

-- 1. Global Double-Entry Bookkeeping Balance (Expected: global_imbalance = 0)
SELECT
  COALESCE(SUM(debit), 0) AS total_debit,
  COALESCE(SUM(credit), 0) AS total_credit,
  COALESCE(SUM(debit), 0) - COALESCE(SUM(credit), 0) AS global_imbalance
FROM public.journal_entries;

-- 2. Chart of Accounts (COA) Balance vs Journal Entries Mutation (Expected: variance = 0)
SELECT
  a.id AS account_id,
  a.name AS account_name,
  a.type AS account_type,
  a.balance AS stored_balance,
  COALESCE(
    SUM(
      CASE
        WHEN LOWER(a.type) IN ('asset', 'expense') THEN COALESCE(je.debit, 0) - COALESCE(je.credit, 0)
        ELSE COALESCE(je.credit, 0) - COALESCE(je.debit, 0)
      END
    ),
    0
  ) AS ledger_balance,
  a.balance - COALESCE(
    SUM(
      CASE
        WHEN LOWER(a.type) IN ('asset', 'expense') THEN COALESCE(je.debit, 0) - COALESCE(je.credit, 0)
        ELSE COALESCE(je.credit, 0) - COALESCE(je.debit, 0)
      END
    ),
    0
  ) AS variance
FROM public.accounts a
LEFT JOIN public.journal_entries je ON je.account_id = a.id
GROUP BY a.id, a.name, a.type, a.balance
ORDER BY a.id;

-- 3. Orphaned Posted Financial Transactions without Journal Entries (Expected: 0 rows)
SELECT
  ft.id,
  ft.transaction_date,
  ft.category,
  ft.description,
  ft.amount,
  ft.type,
  ft.reference_type,
  ft.reference_id,
  ft.status
FROM public.financial_transactions ft
LEFT JOIN public.journal_entries je ON je.transaction_id = ft.id
WHERE COALESCE(ft.status, 'posted') = 'posted'
GROUP BY ft.id
HAVING COUNT(je.id) = 0
ORDER BY ft.id DESC;

-- 4. Unbalanced Journal Entries per Transaction (Expected: 0 rows)
SELECT
  transaction_id,
  journal_no,
  COUNT(*) AS line_count,
  SUM(debit) AS sum_debit,
  SUM(credit) AS sum_credit,
  SUM(debit) - SUM(credit) AS diff
FROM public.journal_entries
GROUP BY transaction_id, journal_no
HAVING SUM(debit) <> SUM(credit) OR COUNT(*) < 2
ORDER BY transaction_id DESC;

-- 5. Idempotency Index & Duplicate Settlement Check (Expected: 0 duplicate rows)
SELECT
  reference_type,
  reference_id,
  category,
  debit_account_id,
  credit_account_id,
  COUNT(*) AS duplicate_count,
  ARRAY_AGG(id ORDER BY id) AS transaction_ids,
  SUM(amount) AS total_duplicated_amount
FROM public.financial_transactions
WHERE reference_type IS NOT NULL
  AND reference_id IS NOT NULL
  AND COALESCE(status, 'posted') = 'posted'
GROUP BY reference_type, reference_id, category, debit_account_id, credit_account_id
HAVING COUNT(*) > 1
ORDER BY duplicate_count DESC;

-- 6. Room Occupancy vs Active Tenants / Approved Bookings Consistency (Expected: 0 rows)
SELECT
  r.id AS room_id,
  r.property_id,
  r.room_number,
  r.status AS room_status,
  r.current_tenant_name,
  r.hold_expires_at,
  COUNT(DISTINCT t.id) FILTER (WHERE COALESCE(t.status, 'active') <> 'checkout') AS active_tenant_count,
  COUNT(DISTINCT b.id) FILTER (WHERE b.status = 'approved') AS approved_booking_count
FROM public.rooms r
LEFT JOIN public.tenants t
  ON t.property_id = r.property_id AND t.room_number = r.room_number
LEFT JOIN public.bookings b
  ON b.property_id = r.property_id AND b.room_number = r.room_number
GROUP BY r.id, r.property_id, r.room_number, r.status, r.current_tenant_name, r.hold_expires_at
HAVING (
  (r.status = 'available' AND COUNT(DISTINCT t.id) FILTER (WHERE COALESCE(t.status, 'active') <> 'checkout') > 0)
  OR (r.status = 'occupied' AND COUNT(DISTINCT t.id) FILTER (WHERE COALESCE(t.status, 'active') <> 'checkout') = 0 AND COUNT(DISTINCT b.id) FILTER (WHERE b.status = 'approved') = 0)
)
ORDER BY r.property_id, r.room_number;

-- 7. Least-Privilege RLS Verification on Financial Tables (Expected: 0 policies granting 'staff' access)
SELECT
  schemaname,
  tablename,
  policyname,
  cmd,
  qual
FROM pg_policies
WHERE tablename IN (
  'accounts', 'financial_transactions', 'journal_entries', 'ledger_entries',
  'financial_audit_logs', 'failed_ledger_postings', 'midtrans_clearing_transactions',
  'bank_reconciliation_matches', 'bank_statement_items', 'petty_cash_requests',
  'fixed_assets', 'budgets', 'vendors', 'purchase_orders', 'sent_emails'
)
AND (
  COALESCE(qual, '') ILIKE '%''staff''%'
  OR COALESCE(with_check, '') ILIKE '%''staff''%'
);

-- 8. Bank Reconciliation Classification Check (Expected: 0 rows classified as 'income')
SELECT
  id,
  transaction_date,
  category,
  amount,
  type,
  reference_type,
  reference_id
FROM public.financial_transactions
WHERE reference_type = 'bank_reconciliation'
  AND LOWER(COALESCE(type, '')) = 'income';
