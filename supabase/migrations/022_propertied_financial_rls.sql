-- ====================================================================
-- SAMARA STAY ERP v14 — MIGRATION 022: PROPORTIED FINANCIAL RLS POLICIES
-- ====================================================================

-- 1. TAMBAHKAN KOLOM property_id PADA TABEL users JIKA BELUM ADA
ALTER TABLE public.users 
  ADD COLUMN IF NOT EXISTS property_id integer REFERENCES public.properties(id);

CREATE INDEX IF NOT EXISTS idx_users_property_id ON public.users(property_id);


-- 2. DUA UTILITY HELPER FUNCTIONS UNTUK RLS
CREATE OR REPLACE FUNCTION public.get_auth_user_role()
RETURNS VARCHAR
LANGUAGE sql SECURITY DEFINER STABLE
AS $$
  SELECT role FROM public.users WHERE id = auth.uid()::text LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.get_auth_user_property_id()
RETURNS INTEGER
LANGUAGE sql SECURITY DEFINER STABLE
AS $$
  SELECT property_id FROM public.users WHERE id = auth.uid()::text LIMIT 1;
$$;

-- Beri izin eksekusi ke authenticated users
GRANT EXECUTE ON FUNCTION public.get_auth_user_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_auth_user_property_id() TO authenticated;


-- 3. PERBARUI RLS PADA TABEL FINANCIAL_TRANSACTIONS
ALTER TABLE public.financial_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin All Access for Transactions" ON public.financial_transactions;
DROP POLICY IF EXISTS "Scoped access for Transactions" ON public.financial_transactions;

CREATE POLICY "Scoped access for Transactions" ON public.financial_transactions
  FOR ALL TO authenticated
  USING (
    -- Super Admin, Owner, & Finance tanpa constraint properti: Akses Semua Data
    public.get_auth_user_role() IN ('super', 'super_admin', 'owner')
    OR (public.get_auth_user_role() = 'finance' AND public.get_auth_user_property_id() IS NULL)
    -- Admin Properti / Staff: Hanya akses properti mereka ATAU transaksi umum (NULL)
    OR property_id IS NULL
    OR property_id = public.get_auth_user_property_id()
  );


-- 4. PERBARUI RLS PADA TABEL JOURNAL_ENTRIES
ALTER TABLE public.journal_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin All Access for Journal Entries" ON public.journal_entries;
DROP POLICY IF EXISTS "Scoped access for Journal Entries" ON public.journal_entries;

CREATE POLICY "Scoped access for Journal Entries" ON public.journal_entries
  FOR ALL TO authenticated
  USING (
    public.get_auth_user_role() IN ('super', 'super_admin', 'owner')
    OR (public.get_auth_user_role() = 'finance' AND public.get_auth_user_property_id() IS NULL)
    OR EXISTS (
      SELECT 1 FROM public.financial_transactions ft
      WHERE ft.id = journal_entries.transaction_id
        AND (ft.property_id IS NULL OR ft.property_id = public.get_auth_user_property_id())
    )
  );


-- 5. PERBARUI RLS PADA TABEL PAYMENTS
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin All Access for Payments" ON public.payments;
DROP POLICY IF EXISTS "Scoped access for Payments" ON public.payments;

CREATE POLICY "Scoped access for Payments" ON public.payments
  FOR ALL TO authenticated
  USING (
    public.get_auth_user_role() IN ('super', 'super_admin', 'owner')
    OR (public.get_auth_user_role() = 'finance' AND public.get_auth_user_property_id() IS NULL)
    OR property_id IS NULL
    OR property_id = public.get_auth_user_property_id()
  );


-- 6. PERBARUI RLS PADA TABEL PETTY_CASH_REQUESTS
ALTER TABLE public.petty_cash_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin All Access for petty_cash_requests" ON public.petty_cash_requests;
DROP POLICY IF EXISTS "Scoped access for Petty Cash" ON public.petty_cash_requests;

CREATE POLICY "Scoped access for Petty Cash" ON public.petty_cash_requests
  FOR ALL TO authenticated
  USING (
    public.get_auth_user_role() IN ('super', 'super_admin', 'owner', 'finance')
    OR applicant = auth.jwt() ->> 'email'
  );


-- 7. PERBARUI RLS PADA TABEL BUDGETS
ALTER TABLE public.budgets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin All Access for budgets" ON public.budgets;
DROP POLICY IF EXISTS "Scoped access for Budgets" ON public.budgets;

CREATE POLICY "Scoped access for Budgets" ON public.budgets
  FOR ALL TO authenticated
  USING (
    public.get_auth_user_role() IN ('super', 'super_admin', 'owner')
    OR (public.get_auth_user_role() = 'finance' AND public.get_auth_user_property_id() IS NULL)
  );
