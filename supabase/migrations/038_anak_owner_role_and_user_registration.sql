-- ====================================================================
-- SAMARA STAY ERP — MIGRATION 038: ANAK_OWNER ROLE & USER REGISTRATION
-- ====================================================================
-- 1. Perluas CHECK constraint role di tabel public.users dan profiles
--    agar memuat 'anak_owner' dan 'user' (untuk registrasi publik).
-- 2. Update data pengguna lama yang fungsionalitasnya anak_owner
--    tetapi sebelumnya terpaksa disimpan sebagai 'admin'.
-- 3. Perbarui RLS policies agar mencakup 'anak_owner' dan mengubah
--    self-insert default dari 'staff' ke 'user' (role_id: 4).

DO $$
BEGIN
  -- Drop constraint lama pada tabel users jika ada
  ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_role_check;
  ALTER TABLE public.users DROP CONSTRAINT IF EXISTS check_users_role;
  
  -- Tambahkan constraint baru yang mencakup anak_owner dan user
  ALTER TABLE public.users ADD CONSTRAINT users_role_check 
    CHECK (role IN ('super', 'super_admin', 'owner', 'anak_owner', 'admin', 'finance', 'staff', 'user'));
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

DO $$
BEGIN
  -- Jika tabel profiles ada dan memiliki constraint role
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'profiles') THEN
    ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
    ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS check_profiles_role;
    ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check 
      CHECK (role IN ('super', 'super_admin', 'owner', 'anak_owner', 'admin', 'finance', 'staff', 'user'));
  END IF;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- Update data lama yang tersimpan sebagai admin tetapi access/email adalah anak owner
UPDATE public.users
SET role = 'anak_owner',
    role_id = 2
WHERE (
  LOWER(COALESCE(access, '')) LIKE '%anak owner%' 
  OR LOWER(COALESCE(access, '')) LIKE '%anak_owner%'
  OR LOWER(COALESCE(email, '')) LIKE '%anakowner%'
)
AND role != 'anak_owner';

-- Perbarui RLS policies pada tabel public.users
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users Select Policy" ON public.users;
CREATE POLICY "Users Select Policy" ON public.users
  FOR SELECT TO authenticated
  USING (
    id = auth.uid()::text
    OR email = auth.jwt()->>'email'
    OR public.get_auth_user_role() IN ('super', 'super_admin', 'owner', 'anak_owner', 'admin', 'finance')
  );

DROP POLICY IF EXISTS "Admins Insert Users Policy" ON public.users;
CREATE POLICY "Admins Insert Users Policy" ON public.users
  FOR INSERT TO authenticated
  WITH CHECK (
    public.get_auth_user_role() IN ('super', 'super_admin', 'owner', 'anak_owner', 'admin')
  );

-- Self insert untuk pendaftaran publik mandiri: default role adalah 'user' (role_id: 4)
DROP POLICY IF EXISTS "Self Insert Own Staff Row Policy" ON public.users;
DROP POLICY IF EXISTS "Self Insert Own User Row Policy" ON public.users;
CREATE POLICY "Self Insert Own User Row Policy" ON public.users
  FOR INSERT TO authenticated
  WITH CHECK (
    id = auth.uid()::text
    AND role = 'user'
    AND role_id = 4
  );

DROP POLICY IF EXISTS "Admins Update All Users Policy" ON public.users;
CREATE POLICY "Admins Update All Users Policy" ON public.users
  FOR UPDATE TO authenticated
  USING (
    public.get_auth_user_role() IN ('super', 'super_admin', 'owner', 'anak_owner', 'admin')
    OR id = auth.uid()::text
  )
  WITH CHECK (
    public.get_auth_user_role() IN ('super', 'super_admin', 'owner', 'anak_owner', 'admin')
    OR (
      id = auth.uid()::text 
      AND role = (SELECT u.role FROM public.users u WHERE u.id = auth.uid()::text LIMIT 1)
      AND role_id = (SELECT u.role_id FROM public.users u WHERE u.id = auth.uid()::text LIMIT 1)
    )
  );

DROP POLICY IF EXISTS "Admins Delete Users Policy" ON public.users;
CREATE POLICY "Admins Delete Users Policy" ON public.users
  FOR DELETE TO authenticated
  USING (
    public.get_auth_user_role() IN ('super', 'super_admin', 'owner', 'anak_owner', 'admin')
  );

COMMENT ON TABLE public.users IS 'Tabel otorisasi pengguna ERP. Peran super, owner, dan anak_owner dibatasi secara ketat.';
