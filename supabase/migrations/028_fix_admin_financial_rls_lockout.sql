-- ====================================================================
-- SAMARA STAY ERP v14 — MIGRATION 028: FIX ADMIN ROLE FINANCIAL RLS LOCKOUT
-- ====================================================================
-- Memperbaiki RLS policies pada financial_transactions, journal_entries,
-- dan payments agar pengguna dengan role 'admin' memiliki hak akses penuh
-- bersama super, super_admin, dan owner, tanpa terkena filter parsial.

-- 1. Financial Transactions RLS
DROP POLICY IF EXISTS "Scoped access for Transactions" ON public.financial_transactions;
CREATE POLICY "Scoped access for Transactions" ON public.financial_transactions
  FOR ALL TO authenticated
  USING (
    public.get_auth_user_role() IN ('super', 'super_admin', 'owner', 'admin')
    OR (public.get_auth_user_role() = 'finance' AND public.get_auth_user_property_id() IS NULL)
    OR property_id IS NULL
    OR property_id = public.get_auth_user_property_id()
  );

-- 2. Journal Entries RLS
DROP POLICY IF EXISTS "Scoped access for Journal Entries" ON public.journal_entries;
CREATE POLICY "Scoped access for Journal Entries" ON public.journal_entries
  FOR ALL TO authenticated
  USING (
    public.get_auth_user_role() IN ('super', 'super_admin', 'owner', 'admin')
    OR (public.get_auth_user_role() = 'finance' AND public.get_auth_user_property_id() IS NULL)
    OR EXISTS (
      SELECT 1 FROM public.financial_transactions ft
      WHERE ft.id = journal_entries.transaction_id
        AND (ft.property_id IS NULL OR ft.property_id = public.get_auth_user_property_id())
    )
  );

-- 3. Payments RLS
DROP POLICY IF EXISTS "Scoped access for Payments" ON public.payments;
CREATE POLICY "Scoped access for Payments" ON public.payments
  FOR ALL TO authenticated
  USING (
    public.get_auth_user_role() IN ('super', 'super_admin', 'owner', 'admin')
    OR (public.get_auth_user_role() = 'finance' AND public.get_auth_user_property_id() IS NULL)
    OR property_id IS NULL
    OR property_id = public.get_auth_user_property_id()
  );

-- 4. Budgets RLS
DROP POLICY IF EXISTS "Scoped access for Budgets" ON public.budgets;
CREATE POLICY "Scoped access for Budgets" ON public.budgets
  FOR ALL TO authenticated
  USING (
    public.get_auth_user_role() IN ('super', 'super_admin', 'owner', 'admin')
    OR (public.get_auth_user_role() = 'finance' AND public.get_auth_user_property_id() IS NULL)
  );
