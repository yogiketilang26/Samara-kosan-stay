-- ====================================================================
-- SAMARA STAY ERP v16 — MIGRATION 029: CLOSE NULL PROPERTY RLS BYPASS
-- ====================================================================
-- Memperbaiki celah keamanan RLS di mana 'property_id IS NULL' memberikan
-- hak INSERT/UPDATE/DELETE penuh kepada seluruh authenticated user (termasuk staff).
-- Pemisahan kebijakan:
-- 1. SELECT: Diizinkan membaca global (NULL property) untuk user berwenang atau staff yang membaca.
-- 2. INSERT/UPDATE/DELETE: HANYA diizinkan untuk super, super_admin, owner, admin, finance
--    atau staff yang dibatasi ke property_id milik mereka secara ketat (WITH CHECK).

-- --------------------------------------------------------------------
-- 1. FINANCIAL TRANSACTIONS
-- --------------------------------------------------------------------
DROP POLICY IF EXISTS "Scoped access for Transactions" ON public.financial_transactions;
DROP POLICY IF EXISTS "Financial Transactions Select Policy" ON public.financial_transactions;
DROP POLICY IF EXISTS "Financial Transactions Mutate Policy" ON public.financial_transactions;

-- SELECT policy: Staff hanya bisa melihat transaksi propertinya atau global umum jika diizinkan
CREATE POLICY "Financial Transactions Select Policy" ON public.financial_transactions
  FOR SELECT TO authenticated
  USING (
    public.get_auth_user_role() IN ('super', 'super_admin', 'owner', 'admin', 'finance')
    OR property_id = public.get_auth_user_property_id()
  );

-- INSERT / UPDATE / DELETE policy: Hanya untuk role berkepentingan, dilarang sembarang mutasi NULL property oleh staff
CREATE POLICY "Financial Transactions Mutate Policy" ON public.financial_transactions
  FOR ALL TO authenticated
  USING (
    public.get_auth_user_role() IN ('super', 'super_admin', 'owner', 'admin', 'finance')
    OR (
      public.get_auth_user_role() = 'staff' 
      AND property_id IS NOT NULL 
      AND property_id = public.get_auth_user_property_id()
    )
  )
  WITH CHECK (
    public.get_auth_user_role() IN ('super', 'super_admin', 'owner', 'admin', 'finance')
    OR (
      public.get_auth_user_role() = 'staff' 
      AND property_id IS NOT NULL 
      AND property_id = public.get_auth_user_property_id()
    )
  );

-- --------------------------------------------------------------------
-- 2. JOURNAL ENTRIES
-- --------------------------------------------------------------------
DROP POLICY IF EXISTS "Scoped access for Journal Entries" ON public.journal_entries;
DROP POLICY IF EXISTS "Journal Entries Select Policy" ON public.journal_entries;
DROP POLICY IF EXISTS "Journal Entries Mutate Policy" ON public.journal_entries;

CREATE POLICY "Journal Entries Select Policy" ON public.journal_entries
  FOR SELECT TO authenticated
  USING (
    public.get_auth_user_role() IN ('super', 'super_admin', 'owner', 'admin', 'finance')
    OR EXISTS (
      SELECT 1 FROM public.financial_transactions ft
      WHERE ft.id = journal_entries.transaction_id
        AND ft.property_id IS NOT NULL
        AND ft.property_id = public.get_auth_user_property_id()
    )
  );

CREATE POLICY "Journal Entries Mutate Policy" ON public.journal_entries
  FOR ALL TO authenticated
  USING (
    public.get_auth_user_role() IN ('super', 'super_admin', 'owner', 'admin', 'finance')
  )
  WITH CHECK (
    public.get_auth_user_role() IN ('super', 'super_admin', 'owner', 'admin', 'finance')
  );

-- --------------------------------------------------------------------
-- 3. PAYMENTS
-- --------------------------------------------------------------------
DROP POLICY IF EXISTS "Scoped access for Payments" ON public.payments;
DROP POLICY IF EXISTS "Payments Select Policy" ON public.payments;
DROP POLICY IF EXISTS "Payments Mutate Policy" ON public.payments;

CREATE POLICY "Payments Select Policy" ON public.payments
  FOR SELECT TO authenticated
  USING (
    public.get_auth_user_role() IN ('super', 'super_admin', 'owner', 'admin', 'finance')
    OR property_id = public.get_auth_user_property_id()
  );

CREATE POLICY "Payments Mutate Policy" ON public.payments
  FOR ALL TO authenticated
  USING (
    public.get_auth_user_role() IN ('super', 'super_admin', 'owner', 'admin', 'finance')
    OR (
      public.get_auth_user_role() = 'staff' 
      AND property_id IS NOT NULL 
      AND property_id = public.get_auth_user_property_id()
    )
  )
  WITH CHECK (
    public.get_auth_user_role() IN ('super', 'super_admin', 'owner', 'admin', 'finance')
    OR (
      public.get_auth_user_role() = 'staff' 
      AND property_id IS NOT NULL 
      AND property_id = public.get_auth_user_property_id()
    )
  );

-- --------------------------------------------------------------------
-- 4. BUDGETS
-- --------------------------------------------------------------------
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
