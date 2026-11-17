-- =============================================================================
-- SAMARA STAY — LIVE PRODUCTION QA VERIFICATION SCRIPT (R1 – R21)
-- Jalankan di Supabase SQL Editor setelah migrasi 049 -> 049b -> 050 -> 051 -> 052
-- =============================================================================

-- 1. R17: Verifikasi Bucket Dokumen Privat (WAJIB public = false)
SELECT
  id AS bucket_id,
  public AS is_public,
  CASE
    WHEN id IN ('tenant-documents', 'payment-proof', 'contracts', 'signatures', 'maintenance') AND public = false THEN 'PASS (PRIVATE)'
    WHEN id IN ('property-images', 'room-images', 'avatars') AND public = true THEN 'PASS (PUBLIC)'
    ELSE 'FAIL (MISCONFIGURED BUCKET VISIBILITY)'
  END AS r17_status
FROM storage.buckets
WHERE id IN (
  'tenant-documents', 'payment-proof', 'contracts', 'signatures', 'maintenance',
  'property-images', 'room-images', 'avatars'
)
ORDER BY id;

-- 2. R17: Verifikasi Tidak Ada Data Base64 Baru di Kolom Dokumen
SELECT
  'bookings' AS table_name,
  COUNT(*) FILTER (
    WHERE COALESCE(ktp_image, '') LIKE 'data:%'
       OR COALESCE(occupant_ktp_image, '') LIKE 'data:%'
       OR COALESCE(marriage_certificate_url, '') LIKE 'data:%'
       OR COALESCE(signature_url, '') LIKE 'data:%'
  ) AS legacy_base64_rows
FROM public.bookings
UNION ALL
SELECT
  'tenants' AS table_name,
  COUNT(*) FILTER (
    WHERE COALESCE(ktp_image, '') LIKE 'data:%'
       OR COALESCE(marriage_certificate_url, '') LIKE 'data:%'
  ) AS legacy_base64_rows
FROM public.tenants;

-- 3. R18 & R21: Verifikasi Kolom hold_expires_at, hold_by_booking_id, dan RPC Kritis
SELECT
  table_name,
  column_name,
  data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND (
    (table_name = 'rooms' AND column_name IN ('hold_expires_at', 'hold_by_booking_id'))
    OR (table_name = 'bookings' AND column_name IN ('hold_expires_at'))
    OR (table_name = 'sent_emails' AND column_name IN ('html_body', 'retry_count', 'last_retry_at', 'order_id'))
  )
ORDER BY table_name, column_name;

-- 4. Verifikasi Keberadaan Fungsi RPC Kritis (049–052)
SELECT
  p.proname AS function_name,
  pg_get_function_Identity_arguments(p.oid) AS arguments
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'settle_booking_payment',
    'hold_room_atomic',
    'cleanup_expired_room_holds',
    'dashboard_summary',
    'monthly_cashflow'
  )
ORDER BY p.proname;

-- 5. Verifikasi Row Level Security (RLS) Aktif pada Tabel Sensitif
SELECT
  relname AS table_name,
  relrowsecurity AS rls_enabled
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND relname IN (
    'bookings', 'tenants', 'payments', 'financial_transactions',
    'journal_entries', 'ledger_entries', 'contracts', 'contract_extensions',
    'surveys', 'users', 'sent_emails', 'activity_logs', 'rooms', 'properties'
  )
ORDER BY relname;
