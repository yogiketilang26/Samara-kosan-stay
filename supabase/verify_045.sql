-- ====================================================================
-- SAMARA STAY ERP — VERIFIKASI MIGRATION 045: TENANT NIK AUDIT TRIGGER
-- ====================================================================
-- Script ini hanya melakukan SELECT aman (read-only) untuk verifikasi.
-- Pengujian penulisan data disertakan dalam blok komentar di bawah.

-- 1. Verifikasi eksistensi fungsi audit_tenant_nik_changes
SELECT proname, prosecdef, prosrc 
FROM pg_proc 
WHERE proname = 'audit_tenant_nik_changes';

-- 2. Verifikasi trigger trg_audit_tenant_nik pada tabel public.tenants
SELECT trigger_name, event_manipulation, action_statement, action_timing
FROM information_schema.triggers
WHERE event_object_table = 'tenants' 
  AND trigger_name = 'trg_audit_tenant_nik';

-- ====================================================================
-- PENGUJIAN PENULISAN (Jalankan di SQL Editor jika ingin menguji mutasi):
-- ====================================================================
/*
BEGIN;
  -- Simulasikan insert tenant dengan NIK dan kolom full_name
  INSERT INTO public.tenants (
    id,
    full_name,
    email,
    phone,
    room_number,
    status,
    nik,
    spouse_nik,
    created_at
  ) VALUES (
    'test-audit-045-' || floor(random() * 10000)::text,
    'Budi Verification 045',
    'budi.test045@example.com',
    '081234567890',
    '101',
    'active',
    '3201123456780001',
    '3201123456780002',
    NOW()
  );

  -- Cek apakah log audit NIK berhasil masuk ke activity_logs
  SELECT admin_name, action, detail, created_at
  FROM public.activity_logs
  WHERE action = 'TENANT_NIK_INSERT'
  ORDER BY created_at DESC
  LIMIT 1;

ROLLBACK; -- Selalu rollback agar tidak meninggalkan data uji
*/
