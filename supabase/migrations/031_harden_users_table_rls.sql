-- ====================================================================
-- SAMARA STAY ERP v16 — MIGRATION 031: HARDEN USERS TABLE RLS
-- ====================================================================
-- Menutup celah privilege escalation pada tabel public.users di mana
-- authenticated users (misal role 'staff') dapat meng-update kolom 'role' milik mereka sendiri.
-- Pemisahan kebijakan:
-- 1. SELECT: Pengguna dapat membaca data profil mereka sendiri (id = auth.uid()::text) ATAU
--    Administrator (super, super_admin, owner, admin, finance) dapat membaca seluruh user.
-- 2. UPDATE (Self): Pengguna dapat memperbarui data profil mereka sendiri,
--    namun modifikasi role, role_id, access, active, dan property_id HANYA diizinkan untuk super/super_admin/owner/admin.
-- 3. INSERT / DELETE: HANYA diizinkan untuk super, super_admin, owner, admin.

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Hapus policy lama yang terlalu permisif
DROP POLICY IF EXISTS "Admin All Access for Users" ON public.users;
DROP POLICY IF EXISTS "Users Read Policy" ON public.users;
DROP POLICY IF EXISTS "Users Select Policy" ON public.users;
DROP POLICY IF EXISTS "Users Update Own Policy" ON public.users;
DROP POLICY IF EXISTS "Admins Manage All Users Policy" ON public.users;
DROP POLICY IF EXISTS "Admins Insert Users Policy" ON public.users;
DROP POLICY IF EXISTS "Admins Update All Users Policy" ON public.users;
DROP POLICY IF EXISTS "Admins Delete Users Policy" ON public.users;
DROP POLICY IF EXISTS "Allow user to read own profile" ON public.users;
DROP POLICY IF EXISTS "Allow admin to read all users" ON public.users;
DROP POLICY IF EXISTS "Allow admin to insert users" ON public.users;
DROP POLICY IF EXISTS "Allow admin to update users" ON public.users;
DROP POLICY IF EXISTS "Allow admin to delete users" ON public.users;

-- 1. SELECT Policy
CREATE POLICY "Users Select Policy" ON public.users
  FOR SELECT TO authenticated
  USING (
    id = auth.uid()::text
    OR email = auth.jwt()->>'email'
    OR public.get_auth_user_role() IN ('super', 'super_admin', 'owner', 'admin', 'finance')
  );

-- 2. INSERT Policy (Admin dapat insert semua role; User baru hanya boleh insert baris miliknya sendiri dengan role staff)
CREATE POLICY "Admins Insert Users Policy" ON public.users
  FOR INSERT TO authenticated
  WITH CHECK (
    public.get_auth_user_role() IN ('super', 'super_admin', 'owner', 'admin')
  );

CREATE POLICY "Self Insert Own Staff Row Policy" ON public.users
  FOR INSERT TO authenticated
  WITH CHECK (
    id = auth.uid()::text
    AND role = 'staff'
    AND role_id = 4
  );

-- 3. UPDATE Policy (Admin dapat update semua; User biasa hanya boleh update baris miliknya dan dilarang mengubah role)
CREATE POLICY "Admins Update All Users Policy" ON public.users
  FOR UPDATE TO authenticated
  USING (
    public.get_auth_user_role() IN ('super', 'super_admin', 'owner', 'admin')
    OR (
      id = auth.uid()::text
    )
  )
  WITH CHECK (
    public.get_auth_user_role() IN ('super', 'super_admin', 'owner', 'admin')
    OR (
      id = auth.uid()::text 
      AND role = (SELECT u.role FROM public.users u WHERE u.id = auth.uid()::text LIMIT 1)
      AND role_id = (SELECT u.role_id FROM public.users u WHERE u.id = auth.uid()::text LIMIT 1)
    )
  );

-- 4. DELETE Policy (Hanya Super, Super Admin, Owner, Admin)
CREATE POLICY "Admins Delete Users Policy" ON public.users
  FOR DELETE TO authenticated
  USING (
    public.get_auth_user_role() IN ('super', 'super_admin', 'owner', 'admin')
  );
