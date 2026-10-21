-- ============================================================================
-- SKRIP KOREKSI DATA HISTORIS AKUNTANSI (MANUAL - BUTUH PERSETUJUAN PEMILIK)
-- ============================================================================
-- PENTING:
-- 1. Skrip ini TIDAK dijalankan otomatis oleh aplikasi maupun pipeline migrasi.
-- 2. TIDAK ADA operasi DELETE, DROP, atau TRUNCATE.
-- 3. Jalankan bagian STEP 1 (SELECT deteksi) terlebih dahulu di Supabase SQL Editor
--    untuk meninjau baris historis yang terdampak.
-- 4. Hanya setelah ditinjau dan disetujui oleh Pemilik (Owner), buka komentar
--    pada bagian STEP 2 untuk memperbarui klasifikasi `type` dan menyelaraskan
--    saldo `accounts.balance` berdasarkan buku besar (`journal_entries`).
-- ============================================================================

-- ============================================================================
-- STEP 1: QUERY DETEKSI (READ-ONLY / AMAN DIJALANKAN KAPAN SAJA)
-- ============================================================================

-- 1A. Deteksi transaksi rekonsiliasi bank historis yang tercatat sebagai 'income' (seharusnya 'transfer')
SELECT
  id,
  transaction_date,
  category,
  description,
  amount,
  type AS current_type,
  'transfer' AS target_type,
  debit_account_id,
  credit_account_id,
  reference_type,
  reference_id
FROM public.financial_transactions
WHERE reference_type = 'bank_reconciliation'
  AND LOWER(COALESCE(type, '')) = 'income'
ORDER BY id ASC;

-- 1B. Deteksi pembalikan rekonsiliasi bank (unmatch) yang tercatat sebagai 'expense' atau 'income'
SELECT
  id,
  transaction_date,
  category,
  description,
  amount,
  type AS current_type,
  debit_account_id,
  credit_account_id,
  reference_type,
  reference_id
FROM public.financial_transactions
WHERE (
    reference_type IN ('bank_reconciliation', 'bank_unreconcile')
    AND LOWER(COALESCE(type, '')) = 'expense'
    AND COALESCE(debit_account_id, 0) = 1200
    AND COALESCE(credit_account_id, 0) = 1010
  )
  OR (
    reference_type IN ('bank_reconciliation_fee', 'bank_unreconcile_fee')
    AND LOWER(COALESCE(type, '')) = 'income'
    AND COALESCE(debit_account_id, 0) = 1200
    AND COALESCE(credit_account_id, 0) = 5030
  )
ORDER BY id ASC;

-- 1C. Deteksi pengembalian (refund) DP Survey yang tercatat sebagai 'expense' (seharusnya 'liability_refund')
SELECT
  id,
  transaction_date,
  category,
  description,
  amount,
  type AS current_type,
  debit_account_id,
  credit_account_id,
  reference_type,
  reference_id
FROM public.financial_transactions
WHERE COALESCE(debit_account_id, 0) = 1300
  AND COALESCE(credit_account_id, 0) IN (1000, 1010)
  AND LOWER(COALESCE(type, '')) = 'expense'
ORDER BY id ASC;

-- 1D. Deteksi selisih antara accounts.balance saat ini vs perhitungan murni dari journal_entries
SELECT
  a.id AS account_id,
  a.name AS account_name,
  a.type AS account_type,
  a.balance AS current_stored_balance,
  COALESCE(
    SUM(
      CASE
        WHEN LOWER(a.type) IN ('asset', 'expense') THEN COALESCE(je.debit, 0) - COALESCE(je.credit, 0)
        ELSE COALESCE(je.credit, 0) - COALESCE(je.debit, 0)
      END
    ),
    0
  ) AS computed_ledger_balance,
  a.balance - COALESCE(
    SUM(
      CASE
        WHEN LOWER(a.type) IN ('asset', 'expense') THEN COALESCE(je.debit, 0) - COALESCE(je.credit, 0)
        ELSE COALESCE(je.credit, 0) - COALESCE(je.debit, 0)
      END
    ),
    0
  ) AS discrepancy
FROM public.accounts a
LEFT JOIN public.journal_entries je ON je.account_id = a.id
GROUP BY a.id, a.name, a.type, a.balance
ORDER BY a.id ASC;


-- ============================================================================
-- STEP 2: KOREKSI DATA HISTORIS (DIKOMENTARI — HANYA JALANKAN ATAS PERSETUJUAN OWNER)
-- ============================================================================
/*
BEGIN;

-- 2A. Ubah klasifikasi rekonsiliasi bank historis dari 'income' menjadi 'transfer'
UPDATE public.financial_transactions
   SET type = 'transfer'
 WHERE reference_type = 'bank_reconciliation'
   AND LOWER(COALESCE(type, '')) = 'income';

-- 2B. Ubah klasifikasi unmatch rekonsiliasi bank dari 'expense' menjadi 'transfer'
UPDATE public.financial_transactions
   SET type = 'transfer'
 WHERE reference_type IN ('bank_reconciliation', 'bank_unreconcile')
   AND LOWER(COALESCE(type, '')) = 'expense'
   AND COALESCE(debit_account_id, 0) = 1200
   AND COALESCE(credit_account_id, 0) = 1010;

-- 2C. Ubah klasifikasi pembalikan biaya gateway Midtrans dari 'income' menjadi 'expense_reversal'
UPDATE public.financial_transactions
   SET type = 'expense_reversal'
 WHERE reference_type IN ('bank_reconciliation_fee', 'bank_unreconcile_fee')
   AND LOWER(COALESCE(type, '')) = 'income'
   AND COALESCE(debit_account_id, 0) = 1200
   AND COALESCE(credit_account_id, 0) = 5030;

-- 2D. Ubah klasifikasi refund DP Survey dari 'expense' menjadi 'liability_refund'
UPDATE public.financial_transactions
   SET type = 'liability_refund',
       category = 'Refund DP Survey'
 WHERE COALESCE(debit_account_id, 0) = 1300
   AND COALESCE(credit_account_id, 0) IN (1000, 1010)
   AND LOWER(COALESCE(type, '')) = 'expense';

-- 2E. Rekalkulasi accounts.balance secara presisi dari journal_entries (tanpa GREATEST(0, ...))
WITH computed AS (
  SELECT
    a.id AS account_id,
    COALESCE(
      SUM(
        CASE
          WHEN LOWER(a.type) IN ('asset', 'expense') THEN COALESCE(je.debit, 0) - COALESCE(je.credit, 0)
          ELSE COALESCE(je.credit, 0) - COALESCE(je.debit, 0)
        END
      ),
      0
    ) AS true_balance
  FROM public.accounts a
  LEFT JOIN public.journal_entries je ON je.account_id = a.id
  GROUP BY a.id
)
UPDATE public.accounts a
   SET balance = c.true_balance
  FROM computed c
 WHERE a.id = c.account_id
   AND a.balance IS DISTINCT FROM c.true_balance;

COMMIT;
*/
