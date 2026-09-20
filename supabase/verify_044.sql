-- ====================================================================
-- SAMARA STAY ERP — VERIFIKASI MIGRATION 044: RBAC V2 AUDIT & ASSIGNMENT
-- ====================================================================
-- Script ini murni SELECT (read-only) untuk mengaudit status peran anak_owner
-- dan memverifikasi trigger proteksi kolom sensitif pada tabel users.

-- 1. Periksa akun-akun yang berpotensi memiliki hak akses Anak Owner
SELECT id, email, role, role_id, access, active, property_id, created_at
FROM public.users
WHERE role = 'anak_owner' 
   OR LOWER(COALESCE(access, '')) LIKE '%anak owner%' 
   OR LOWER(email) LIKE '%anakowner%'
ORDER BY created_at DESC;

-- 2. Periksa constraint role yang aktif pada tabel public.users
SELECT conname, pg_get_constraintdef(oid) AS constraint_definition
FROM pg_constraint
WHERE conrelid = 'public.users'::regclass AND contype = 'c';

-- 3. Periksa definisi fungsi get_auth_user_role() (memastikan mapping anak_owner -> admin aktif)
SELECT proname, prosrc 
FROM pg_proc 
WHERE proname = 'get_auth_user_role';

-- 4. Periksa trigger trg_protect_users_sensitive pada public.users
SELECT trigger_name, event_manipulation, action_statement
FROM information_schema.triggers
WHERE event_object_table = 'users' 
  AND trigger_name = 'trg_protect_users_sensitive';

-- 5. Periksa RLS policies yang terpasang pada public.users
SELECT policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE tablename = 'users';

-- ====================================================================
-- TEMPLATE PENGATURAN MANUAL OLEH SUPER ADMIN / OWNER (Bila diperlukan)
-- ====================================================================
/*
-- Jalankan manual di SQL Editor setelah memastikan ID akun yang sah:
UPDATE public.users
SET role = 'anak_owner',
    role_id = 2,
    access = 'Akses Operasional, Hunian & Keuangan (Anak Owner)'
WHERE id IN ('<MASUKKAN_USER_ID_DI_SINI>');

-- Catat mutasi manual ke activity_logs
INSERT INTO public.activity_logs (admin_name, action, detail, created_at)
VALUES (
  'Super Admin Manual SQL', 
  'MANUAL_ANAK_OWNER_ELEVATION', 
  'Pengangkatan peran anak_owner secara manual untuk ID terverifikasi.', 
  NOW()
);
*/

-- ====================================================================
-- SQL ROLLBACK (Jika ada akun yang keliru dinaikkan oleh migration 038)
-- ====================================================================
/*
-- Kembalikan role ke 'admin' bagi akun yang tidak berhak:
UPDATE public.users
SET role = 'admin',
    role_id = 3,
    access = 'Semua Properti (Admin)'
WHERE id IN ('<MASUKKAN_USER_ID_YANG_INGIN_DI_ROLLBACK>');

INSERT INTO public.activity_logs (admin_name, action, detail, created_at)
VALUES (
  'Super Admin Rollback SQL', 
  'MANUAL_ANAK_OWNER_ROLLBACK', 
  'Rollback peran anak_owner kembali ke admin untuk ID terkait.', 
  NOW()
);
*/
