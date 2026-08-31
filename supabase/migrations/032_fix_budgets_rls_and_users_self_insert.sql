-- ====================================================================
-- SAMARA STAY ERP v16 — MIGRATION 032: FIX BUDGETS RLS & SELF INSERT
-- ====================================================================
-- 1. Memastikan kebijakan tabel budgets murni berbasis peran (role-gated: super, super_admin, owner, admin, finance)
--    tanpa merujuk kolom property_id yang tidak ada pada tabel budgets.
-- 2. Memastikan kebijakan pendaftaran mandiri (self-insert) profil awal pada tabel public.users
--    diizinkan dengan role 'staff' (role_id = 4).

-- --------------------------------------------------------------------
-- 1. BUDGETS
-- --------------------------------------------------------------------
ALTER TABLE public.budgets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Scoped access for Budgets" ON public.budgets;
DROP POLICY IF EXISTS "Budgets Select Policy" ON public.budgets;
DROP POLICY IF EXISTS "Budgets Mutate Policy" ON public.budgets;

CREATE POLICY "Budgets Select Policy" ON public.budgets
  FOR SELECT TO authenticated
  USING (
    public.get_auth_user_role() IN ('super', 'super_admin', 'owner', 'admin', 'finance')
  );

CREATE POLICY "Budgets Mutate Policy" ON public.budgets
  FOR ALL TO authenticated
  USING (
    public.get_auth_user_role() IN ('super', 'super_admin', 'owner', 'admin', 'finance')
  )
  WITH CHECK (
    public.get_auth_user_role() IN ('super', 'super_admin', 'owner', 'admin', 'finance')
  );

-- --------------------------------------------------------------------
-- 2. USERS SELF-INSERT POLICY
-- --------------------------------------------------------------------
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Self Insert Own Staff Row Policy" ON public.users;

CREATE POLICY "Self Insert Own Staff Row Policy" ON public.users
  FOR INSERT TO authenticated
  WITH CHECK (
    id = auth.uid()::text
    AND role = 'staff'
    AND role_id = 4
  );
