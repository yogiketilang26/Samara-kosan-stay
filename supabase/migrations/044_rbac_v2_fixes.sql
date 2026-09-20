-- ====================================================================
-- SAMARA STAY ERP — MIGRATION 044: RBAC V2 SECURITY FIXES & HARDENING
-- ====================================================================
-- 1. Membersihkan dan menstandarkan constraint role pada tabel users dan profiles.
-- 2. Memetakan peran 'anak_owner' -> 'admin' pada get_auth_user_role() untuk menjaga
--    kompatibilitas dengan seluruh RLS policy yang ada (mencegah lockout data/dashboard).
-- 3. Trigger proteksi kolom sensitif (role, role_id, access, active, property_id, email)
--    mencegah eskalasi hak istimewa langsung via PostgREST/client JWT.
-- 4. Mengunci write policies pada tabel users hanya untuk super/owner dan self-insert safe default.

-- 1. CHECK role: hapus SEMUA constraint role secara dinamis, tanpa menelan error
DO $$
DECLARE c record;
BEGIN
  FOR c IN SELECT conname FROM pg_constraint
           WHERE conrelid = 'public.users'::regclass AND contype = 'c'
             AND pg_get_constraintdef(oid) ILIKE '%role%'
             AND pg_get_constraintdef(oid) NOT ILIKE '%role_id%'
  LOOP 
    EXECUTE format('ALTER TABLE public.users DROP CONSTRAINT %I', c.conname); 
  END LOOP;
  ALTER TABLE public.users ADD CONSTRAINT users_role_check
    CHECK (role IN ('super','super_admin','owner','anak_owner','admin','finance','staff','user'));
END $$;

DO $$
DECLARE c record;
BEGIN
  IF to_regclass('public.profiles') IS NOT NULL THEN
    FOR c IN SELECT conname FROM pg_constraint
             WHERE conrelid = 'public.profiles'::regclass AND contype = 'c'
               AND pg_get_constraintdef(oid) ILIKE '%role%'
    LOOP 
      EXECUTE format('ALTER TABLE public.profiles DROP CONSTRAINT %I', c.conname); 
    END LOOP;
    ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
      CHECK (role IN ('super','super_admin','owner','anak_owner','admin','finance','staff','user'));
  END IF;
END $$;

-- 2. Semua policy RLS lama memakai 'admin': petakan anak_owner -> admin HANYA untuk RLS
CREATE OR REPLACE FUNCTION public.get_auth_user_role()
RETURNS VARCHAR LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT CASE WHEN role = 'anak_owner' THEN 'admin' ELSE role END
  FROM public.users WHERE id = auth.uid()::text LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.get_auth_user_role() TO authenticated;

-- 3. Trigger: kolom sensitif hanya boleh diubah super/owner (service role & SQL Editor: auth.uid() NULL -> lolos)
CREATE OR REPLACE FUNCTION public.protect_users_sensitive_columns()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_caller text;
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  SELECT role INTO v_caller FROM public.users WHERE id = auth.uid()::text;
  IF (NEW.role IS DISTINCT FROM OLD.role OR NEW.role_id IS DISTINCT FROM OLD.role_id
      OR NEW.access IS DISTINCT FROM OLD.access OR NEW.active IS DISTINCT FROM OLD.active
      OR NEW.property_id IS DISTINCT FROM OLD.property_id OR NEW.email IS DISTINCT FROM OLD.email)
     AND COALESCE(v_caller,'') NOT IN ('super','super_admin','owner') THEN
    RAISE EXCEPTION 'Perubahan kolom sensitif (role/access/active/property_id/email) hanya boleh oleh super/owner atau melalui API server.';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_protect_users_sensitive ON public.users;
CREATE TRIGGER trg_protect_users_sensitive BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.protect_users_sensitive_columns();

-- 4. Policy users: admin/anak_owner TIDAK punya akses tulis langsung ke baris user (mereka lewat API server/service role)
DROP POLICY IF EXISTS "Admins Update All Users Policy" ON public.users;
CREATE POLICY "Admins Update All Users Policy" ON public.users FOR UPDATE TO authenticated
  USING (id = auth.uid()::text OR public.get_auth_user_role() IN ('super','super_admin','owner'))
  WITH CHECK (id = auth.uid()::text OR public.get_auth_user_role() IN ('super','super_admin','owner'));

DROP POLICY IF EXISTS "Admins Insert Users Policy" ON public.users;
CREATE POLICY "Admins Insert Users Policy" ON public.users FOR INSERT TO authenticated
  WITH CHECK (public.get_auth_user_role() IN ('super','super_admin','owner'));

DROP POLICY IF EXISTS "Admins Delete Users Policy" ON public.users;
CREATE POLICY "Admins Delete Users Policy" ON public.users FOR DELETE TO authenticated
  USING (public.get_auth_user_role() IN ('super','super_admin','owner'));

-- Self-insert: izinkan staff/user, wajib property_id NULL
DROP POLICY IF EXISTS "Self Insert Own User Row Policy" ON public.users;
DROP POLICY IF EXISTS "Self Insert Own Staff Row Policy" ON public.users;
CREATE POLICY "Self Insert Own User Row Policy" ON public.users FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid()::text AND role IN ('staff','user') AND role_id = 4 AND property_id IS NULL);
