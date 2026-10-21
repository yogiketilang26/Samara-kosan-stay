-- ============================================================================
-- MIGRATION 050: RBAC LEAST PRIVILEGE & RLS ESCALATION REMEDIATION (R1, R2)
-- Forward-only, idempotent, transactional migration.
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. DROP PERMISSIVE STAFF POLICIES ON FINANCIAL, AUDIT, BANK & ERP TABLES
-- ============================================================================
DO $$
DECLARE
  t text;
  all_erp_tables text[] := ARRAY[
    'accounts',
    'financial_transactions',
    'journal_entries',
    'ledger_entries',
    'financial_audit_logs',
    'failed_ledger_postings',
    'midtrans_clearing_transactions',
    'bank_reconciliation_matches',
    'bank_statement_items',
    'petty_cash_requests',
    'fixed_assets',
    'budgets',
    'vendors',
    'purchase_orders',
    'inventory_items',
    'activity_logs',
    'sent_emails',
    'payments',
    'contract_extensions'
  ];
BEGIN
  FOREACH t IN ARRAY all_erp_tables LOOP
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = t) THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
      EXECUTE format('DROP POLICY IF EXISTS "RBAC staff finance access %s" ON public.%I', t, t);
      EXECUTE format('DROP POLICY IF EXISTS "RBAC anak_owner read %s" ON public.%I', t, t);
      EXECUTE format('DROP POLICY IF EXISTS "RBAC finance access %s" ON public.%I', t, t);
      EXECUTE format('DROP POLICY IF EXISTS "RBAC operational staff %s" ON public.%I', t, t);
    END IF;
  END LOOP;
END $$;

-- ============================================================================
-- 2. RECREATE FINANCIAL / ERP POLICIES WITHOUT 'staff' + PROPERTY SCOPE
-- ============================================================================
-- 2A. Tables WITH property_id column:
--     FOR ALL: super, super_admin, owner, admin, finance (admin/finance scoped to property_id when user has property_id)
--     FOR SELECT: anak_owner (scoped to property_id when user has property_id)
DO $$
DECLARE
  t text;
  prop_scoped_finance_tables text[] := ARRAY[
    'financial_transactions',
    'journal_entries',
    'ledger_entries',
    'midtrans_clearing_transactions',
    'petty_cash_requests',
    'fixed_assets',
    'budgets',
    'purchase_orders',
    'payments',
    'contract_extensions'
  ];
  has_prop_col boolean;
BEGIN
  FOREACH t IN ARRAY prop_scoped_finance_tables LOOP
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = t) THEN
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = t AND column_name = 'property_id'
      ) INTO has_prop_col;

      IF has_prop_col THEN
        EXECUTE format(
          'CREATE POLICY "RBAC finance access %s" ON public.%I FOR ALL USING (
            public.get_auth_user_role() IN (''super'', ''super_admin'', ''owner'')
            OR (
              public.get_auth_user_role() IN (''admin'', ''finance'')
              AND (
                public.get_auth_user_property_id() IS NULL
                OR property_id = public.get_auth_user_property_id()
              )
            )
          ) WITH CHECK (
            public.get_auth_user_role() IN (''super'', ''super_admin'', ''owner'')
            OR (
              public.get_auth_user_role() IN (''admin'', ''finance'')
              AND (
                public.get_auth_user_property_id() IS NULL
                OR property_id = public.get_auth_user_property_id()
              )
            )
          )',
          t, t
        );

        EXECUTE format(
          'CREATE POLICY "RBAC anak_owner read %s" ON public.%I FOR SELECT USING (
            public.get_auth_user_role() = ''anak_owner''
            AND (
              public.get_auth_user_property_id() IS NULL
              OR property_id = public.get_auth_user_property_id()
            )
          )',
          t, t
        );
      ELSE
        EXECUTE format(
          'CREATE POLICY "RBAC finance access %s" ON public.%I FOR ALL USING (
            public.get_auth_user_role() IN (''super'', ''super_admin'', ''owner'')
            OR (
              public.get_auth_user_role() IN (''admin'', ''finance'')
              AND public.get_auth_user_property_id() IS NULL
            )
          ) WITH CHECK (
            public.get_auth_user_role() IN (''super'', ''super_admin'', ''owner'')
            OR (
              public.get_auth_user_role() IN (''admin'', ''finance'')
              AND public.get_auth_user_property_id() IS NULL
            )
          )',
          t, t
        );

        EXECUTE format(
          'CREATE POLICY "RBAC anak_owner read %s" ON public.%I FOR SELECT USING (
            public.get_auth_user_role() = ''anak_owner''
            AND public.get_auth_user_property_id() IS NULL
          )',
          t, t
        );
      END IF;
    END IF;
  END LOOP;
END $$;

-- 2B. Tables WITHOUT property_id (global financial/audit/bank/email tables):
--     FOR ALL: super, super_admin, owner (and global admin/finance where property_id IS NULL)
--     FOR SELECT: anak_owner (when property_id IS NULL)
DO $$
DECLARE
  t text;
  global_finance_tables text[] := ARRAY[
    'accounts',
    'financial_audit_logs',
    'failed_ledger_postings',
    'bank_reconciliation_matches',
    'bank_statement_items',
    'vendors',
    'sent_emails'
  ];
BEGIN
  FOREACH t IN ARRAY global_finance_tables LOOP
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = t) THEN
      EXECUTE format(
        'CREATE POLICY "RBAC finance access %s" ON public.%I FOR ALL USING (
          public.get_auth_user_role() IN (''super'', ''super_admin'', ''owner'')
          OR (
            public.get_auth_user_role() IN (''admin'', ''finance'')
            AND public.get_auth_user_property_id() IS NULL
          )
        ) WITH CHECK (
          public.get_auth_user_role() IN (''super'', ''super_admin'', ''owner'')
          OR (
            public.get_auth_user_role() IN (''admin'', ''finance'')
            AND public.get_auth_user_property_id() IS NULL
          )
        )',
        t, t
      );

      EXECUTE format(
        'CREATE POLICY "RBAC anak_owner read %s" ON public.%I FOR SELECT USING (
          public.get_auth_user_role() = ''anak_owner''
          AND public.get_auth_user_property_id() IS NULL
        )',
        t, t
      );
    END IF;
  END LOOP;
END $$;

-- ============================================================================
-- 3. OPERATIONAL TABLES FOR STAFF (ONLY OWN PROPERTY) & ACTIVITY_LOGS
-- ============================================================================
-- 3A. inventory_items: operational table accessible by staff on own property
DO $$
DECLARE
  has_prop_col boolean;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'inventory_items') THEN
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'inventory_items' AND column_name = 'property_id'
    ) INTO has_prop_col;

    IF has_prop_col THEN
      EXECUTE 'CREATE POLICY "RBAC operational staff inventory_items" ON public.inventory_items FOR ALL USING (
        public.get_auth_user_role() IN (''super'', ''super_admin'', ''owner'')
        OR (
          public.get_auth_user_role() IN (''admin'', ''finance'', ''staff'')
          AND (
            public.get_auth_user_property_id() IS NULL
            OR property_id = public.get_auth_user_property_id()
          )
        )
      ) WITH CHECK (
        public.get_auth_user_role() IN (''super'', ''super_admin'', ''owner'')
        OR (
          public.get_auth_user_role() IN (''admin'', ''finance'', ''staff'')
          AND (
            public.get_auth_user_property_id() IS NULL
            OR property_id = public.get_auth_user_property_id()
          )
        )
      )';

      EXECUTE 'CREATE POLICY "RBAC anak_owner read inventory_items" ON public.inventory_items FOR SELECT USING (
        public.get_auth_user_role() = ''anak_owner''
        AND (
          public.get_auth_user_property_id() IS NULL
          OR property_id = public.get_auth_user_property_id()
        )
      )';
    ELSE
      EXECUTE 'CREATE POLICY "RBAC operational staff inventory_items" ON public.inventory_items FOR ALL USING (
        public.get_auth_user_role() IN (''super'', ''super_admin'', ''owner'', ''admin'', ''finance'', ''staff'')
      ) WITH CHECK (
        public.get_auth_user_role() IN (''super'', ''super_admin'', ''owner'', ''admin'', ''finance'', ''staff'')
      )';

      EXECUTE 'CREATE POLICY "RBAC anak_owner read inventory_items" ON public.inventory_items FOR SELECT USING (
        public.get_auth_user_role() = ''anak_owner''
      )';
    END IF;
  END IF;
END $$;

-- 3B. Enforce strict property scoping for staff on rooms, maintenance, bookings, surveys, tenants
DO $$
DECLARE
  op_tbl text;
  op_tables text[] := ARRAY['rooms', 'maintenance', 'bookings', 'surveys', 'tenants'];
BEGIN
  FOREACH op_tbl IN ARRAY op_tables LOOP
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = op_tbl) THEN
      EXECUTE format('DROP POLICY IF EXISTS "RBAC operational property scope %s" ON public.%I', op_tbl, op_tbl);
      EXECUTE format(
        'CREATE POLICY "RBAC operational property scope %s" ON public.%I FOR ALL USING (
          public.get_auth_user_role() IN (''super'', ''super_admin'', ''owner'')
          OR (
            public.get_auth_user_role() IN (''admin'', ''finance'')
            AND (
              public.get_auth_user_property_id() IS NULL
              OR property_id = public.get_auth_user_property_id()
            )
          )
          OR (
            public.get_auth_user_role() = ''staff''
            AND public.get_auth_user_property_id() IS NOT NULL
            AND property_id = public.get_auth_user_property_id()
          )
        ) WITH CHECK (
          public.get_auth_user_role() IN (''super'', ''super_admin'', ''owner'')
          OR (
            public.get_auth_user_role() IN (''admin'', ''finance'')
            AND (
              public.get_auth_user_property_id() IS NULL
              OR property_id = public.get_auth_user_property_id()
            )
          )
          OR (
            public.get_auth_user_role() = ''staff''
            AND public.get_auth_user_property_id() IS NOT NULL
            AND property_id = public.get_auth_user_property_id()
          )
        )',
        op_tbl, op_tbl
      );
    END IF;
  END LOOP;
END $$;

-- 3C. activity_logs: INSERT allowed for authenticated, SELECT/DELETE only admin and above (NOT staff/user)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'activity_logs') THEN
    DROP POLICY IF EXISTS "Activity logs insertable by authenticated" ON public.activity_logs;
    DROP POLICY IF EXISTS "Activity logs readable by admin and above" ON public.activity_logs;
    DROP POLICY IF EXISTS "Activity logs manageable by super and owner" ON public.activity_logs;

    CREATE POLICY "Activity logs insertable by authenticated"
      ON public.activity_logs FOR INSERT
      WITH CHECK (auth.role() = 'authenticated');

    CREATE POLICY "Activity logs readable by admin and above"
      ON public.activity_logs FOR SELECT
      USING (public.get_auth_user_role() IN ('super', 'super_admin', 'owner', 'anak_owner', 'admin', 'finance'));

    CREATE POLICY "Activity logs manageable by super and owner"
      ON public.activity_logs FOR DELETE
      USING (public.get_auth_user_role() IN ('super', 'super_admin', 'owner', 'admin'));
  END IF;
END $$;

-- ============================================================================
-- 4. STORAGE BUCKETS: REMOVE CLIENT 'FOR ALL' FOR STAFF; SERVER-ONLY WRITES
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'storage' AND tablename = 'objects') THEN
    DROP POLICY IF EXISTS "Staff manage private buckets" ON storage.objects;
    DROP POLICY IF EXISTS "Authenticated read private buckets" ON storage.objects;
    DROP POLICY IF EXISTS "Authenticated upload private buckets" ON storage.objects;
    DROP POLICY IF EXISTS "Admin owner finance read private buckets" ON storage.objects;
    DROP POLICY IF EXISTS "Staff read own property private buckets" ON storage.objects;

    -- SELECT for super, super_admin, owner, anak_owner, admin, finance
    CREATE POLICY "Admin owner finance read private buckets"
      ON storage.objects FOR SELECT
      USING (
        bucket_id IN ('tenant-documents', 'payment-proof', 'contracts', 'signatures', 'maintenance')
        AND (
          public.get_auth_user_role() IN ('super', 'super_admin', 'owner', 'anak_owner')
          OR (
            public.get_auth_user_role() IN ('admin', 'finance')
            AND (
              public.get_auth_user_property_id() IS NULL
              OR position('prop_' || public.get_auth_user_property_id()::text || '/' in name) > 0
            )
          )
        )
      );

    -- SELECT for staff ONLY when path contains their own property_id (e.g., prop_<id>/...)
    CREATE POLICY "Staff read own property private buckets"
      ON storage.objects FOR SELECT
      USING (
        bucket_id IN ('tenant-documents', 'payment-proof', 'contracts', 'signatures', 'maintenance')
        AND public.get_auth_user_role() = 'staff'
        AND public.get_auth_user_property_id() IS NOT NULL
        AND position('prop_' || public.get_auth_user_property_id()::text || '/' in name) > 0
      );
  END IF;
END $$;

-- ============================================================================
-- 5. USERS SELF-INSERT POLICY & AUTH TRIGGER HARDENING (ROLE='user' ONLY)
-- ============================================================================
DROP POLICY IF EXISTS "Self Insert Own User Row" ON public.users;
DROP POLICY IF EXISTS "Self Insert Own User Row Policy" ON public.users;

CREATE POLICY "Self Insert Own User Row"
  ON public.users FOR INSERT
  WITH CHECK (
    auth.uid() = id
    AND role = 'user'
    AND (role_id IS NULL OR role_id = (SELECT id FROM public.roles WHERE name = 'user' LIMIT 1) OR role_id = 4)
    AND property_id IS NULL
  );

-- Update handle_new_auth_user trigger function so it never uses hardcoded emails or 'staff' fallback
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_role_id INTEGER;
BEGIN
  SELECT id INTO v_user_role_id FROM public.roles WHERE name = 'user' LIMIT 1;
  v_user_role_id := COALESCE(v_user_role_id, 4);

  INSERT INTO public.users (id, email, full_name, role, role_id, access, active, property_id, created_at)
  VALUES (
    NEW.id,
    LOWER(TRIM(COALESCE(NEW.email, ''))),
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(COALESCE(NEW.email, 'user'), '@', 1)),
    'user',
    v_user_role_id,
    'Pengguna Publik Terdaftar',
    true,
    NULL,
    NOW()
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

-- ============================================================================
-- 6. HARDEN dashboard_summary & monthly_cashflow (R1.6 & R5)
--    - Allowed roles ONLY: super, super_admin, owner, anak_owner, admin, finance
--    - Remove fictional roles (director, commissioner, accounting) and staff
--    - Enforce user property_id scope strictly (no NULL property leakage)
--    - Exclude bank_reconciliation / transfer / dp_booking / liability_refund from inflow/expenses
-- ============================================================================
CREATE OR REPLACE FUNCTION public.dashboard_summary(
  p_property_id BIGINT DEFAULT NULL,
  p_from DATE DEFAULT NULL,
  p_to DATE DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID;
  v_role TEXT;
  v_user_prop BIGINT;
  v_effective_prop BIGINT;

  v_total_rooms BIGINT := 0;
  v_occupied_rooms BIGINT := 0;
  v_available_rooms BIGINT := 0;
  v_occupancy_rate NUMERIC := 0;

  v_inflow NUMERIC := 0;
  v_expenses NUMERIC := 0;
  v_noi NUMERIC := 0;

  v_coa_maint NUMERIC := 0;
  v_coa_util NUMERIC := 0;
  v_coa_mkt NUMERIC := 0;
  v_coa_other NUMERIC := 0;

  v_gross_pipeline NUMERIC := 0;
  v_pending_bookings_count BIGINT := 0;
  v_approved_bookings_count BIGINT := 0;
  v_active_tenants_count BIGINT := 0;
  v_unreconciled_escrow NUMERIC := 0;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NOT NULL THEN
    SELECT LOWER(COALESCE(u.role, '')), u.property_id
      INTO v_role, v_user_prop
      FROM public.users u
     WHERE u.id = v_uid
     LIMIT 1;

    IF v_role IS NULL OR v_role NOT IN (
      'super', 'super_admin', 'owner', 'anak_owner', 'admin', 'finance'
    ) THEN
      RAISE EXCEPTION 'Unauthorized: role "%" is not permitted to invoke dashboard_summary', COALESCE(v_role, 'anonymous')
        USING ERRCODE = '42501';
    END IF;

    -- User with property_id IS NOT NULL is strictly pinned to their property_id
    IF v_user_prop IS NOT NULL THEN
      IF p_property_id IS NOT NULL AND p_property_id <> v_user_prop THEN
        RAISE EXCEPTION 'Unauthorized: property scope violation for property_id %', p_property_id
          USING ERRCODE = '42501';
      END IF;
      v_effective_prop := v_user_prop;
    ELSE
      v_effective_prop := p_property_id;
    END IF;
  ELSE
    v_effective_prop := p_property_id;
  END IF;

  -- 1. Room Occupancy Metrics
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE LOWER(COALESCE(r.status, '')) = 'occupied'),
    COUNT(*) FILTER (WHERE LOWER(COALESCE(r.status, 'available')) IN ('available', ''))
  INTO v_total_rooms, v_occupied_rooms, v_available_rooms
  FROM public.rooms r
  WHERE (v_effective_prop IS NULL OR r.property_id = v_effective_prop);

  IF v_total_rooms > 0 THEN
    v_occupancy_rate := ROUND((v_occupied_rooms::NUMERIC / v_total_rooms::NUMERIC) * 100);
  ELSE
    v_occupancy_rate := 0;
  END IF;

  -- 2. Inflow & Expenses from financial_transactions
  --    R5: Exclude bank_reconciliation, transfer, dp_booking, liability_refund, DR 1010/CR 1200, and CR 1300
  SELECT
    COALESCE(SUM(ft.amount) FILTER (
      WHERE LOWER(COALESCE(ft.type, '')) IN ('revenue', 'income')
        AND COALESCE(ft.reference_type, '') NOT IN ('bank_reconciliation', 'survey_refund')
        AND NOT (COALESCE(ft.debit_account_id, 0) = 1010 AND COALESCE(ft.credit_account_id, 0) = 1200)
        AND COALESCE(ft.credit_account_id, 0) <> 1300
        AND (
          COALESCE(ft.credit_account_id, 0) IN (4000, 4100, 4200, 4300, 2100)
          OR COALESCE(ft.debit_account_id, 0) IN (1000, 1010, 1020, 1100, 1200)
          OR (ft.credit_account_id IS NULL AND ft.debit_account_id IS NULL)
        )
    ), 0),
    COALESCE(SUM(ft.amount) FILTER (
      WHERE LOWER(COALESCE(ft.type, '')) = 'expense'
        AND COALESCE(ft.reference_type, '') NOT IN ('bank_reconciliation', 'survey_refund')
        AND COALESCE(ft.debit_account_id, 0) <> 1300
        AND NOT (COALESCE(ft.debit_account_id, 0) = 1200 AND COALESCE(ft.credit_account_id, 0) = 1010)
    ), 0),
    COALESCE(SUM(ft.amount) FILTER (
      WHERE LOWER(COALESCE(ft.type, '')) = 'expense'
        AND COALESCE(ft.reference_type, '') NOT IN ('bank_reconciliation', 'survey_refund')
        AND COALESCE(ft.debit_account_id, 0) <> 1300
        AND (
          LOWER(COALESCE(ft.category, '')) LIKE '%pemeliharaan%'
          OR LOWER(COALESCE(ft.category, '')) LIKE '%perbaikan%'
          OR LOWER(COALESCE(ft.category, '')) LIKE '%maintenance%'
        )
    ), 0),
    COALESCE(SUM(ft.amount) FILTER (
      WHERE LOWER(COALESCE(ft.type, '')) = 'expense'
        AND COALESCE(ft.reference_type, '') NOT IN ('bank_reconciliation', 'survey_refund')
        AND COALESCE(ft.debit_account_id, 0) <> 1300
        AND (
          LOWER(COALESCE(ft.category, '')) LIKE '%listrik%'
          OR LOWER(COALESCE(ft.category, '')) LIKE '%air%'
          OR LOWER(COALESCE(ft.category, '')) LIKE '%wifi%'
          OR LOWER(COALESCE(ft.category, '')) LIKE '%internet%'
          OR LOWER(COALESCE(ft.category, '')) LIKE '%utilitas%'
        )
    ), 0),
    COALESCE(SUM(ft.amount) FILTER (
      WHERE LOWER(COALESCE(ft.type, '')) = 'expense'
        AND COALESCE(ft.reference_type, '') NOT IN ('bank_reconciliation', 'survey_refund')
        AND COALESCE(ft.debit_account_id, 0) <> 1300
        AND (
          LOWER(COALESCE(ft.category, '')) LIKE '%komisi%'
          OR LOWER(COALESCE(ft.category, '')) LIKE '%iklan%'
          OR LOWER(COALESCE(ft.category, '')) LIKE '%pemasaran%'
          OR LOWER(COALESCE(ft.category, '')) LIKE '%marketing%'
          OR LOWER(COALESCE(ft.category, '')) LIKE '%gateway%'
          OR LOWER(COALESCE(ft.category, '')) LIKE '%midtrans%'
        )
    ), 0)
  INTO v_inflow, v_expenses, v_coa_maint, v_coa_util, v_coa_mkt
  FROM public.financial_transactions ft
  WHERE (
      CASE
        WHEN v_user_prop IS NOT NULL THEN ft.property_id = v_user_prop
        WHEN v_effective_prop IS NOT NULL THEN ft.property_id = v_effective_prop
        ELSE TRUE
      END
    )
    AND LOWER(COALESCE(ft.status, 'posted')) NOT IN ('void', 'failed', 'cancelled', 'rejected')
    AND (p_from IS NULL OR COALESCE(ft.transaction_date, ft.date, ft.created_at::DATE) >= p_from)
    AND (p_to   IS NULL OR COALESCE(ft.transaction_date, ft.date, ft.created_at::DATE) <= p_to);

  -- Fallback to paid payments ONLY if financial_transactions has zero inflow rows
  IF v_inflow = 0 THEN
    SELECT COALESCE(SUM(p.amount), 0)
      INTO v_inflow
      FROM public.payments p
     WHERE (
         CASE
           WHEN v_user_prop IS NOT NULL THEN p.property_id = v_user_prop
           WHEN v_effective_prop IS NOT NULL THEN p.property_id = v_effective_prop
           ELSE TRUE
         END
       )
       AND LOWER(COALESCE(p.status, '')) IN ('paid', 'settled', 'settlement', 'lunas')
       AND (p_from IS NULL OR COALESCE(p.payment_date, p.created_at::DATE) >= p_from)
       AND (p_to   IS NULL OR COALESCE(p.payment_date, p.created_at::DATE) <= p_to);
  END IF;

  -- R5: Do NOT fabricate 35% synthetic expenses or 40/15/15/30% breakdown
  v_coa_other := GREATEST(0, v_expenses - (v_coa_maint + v_coa_util + v_coa_mkt));
  v_noi := v_inflow - v_expenses;

  -- 3. Bookings Pipeline & Counts
  SELECT
    COALESCE(SUM(b.total_price) FILTER (WHERE LOWER(COALESCE(b.status, '')) IN ('approved', 'paid', 'active', 'completed')), 0),
    COUNT(*) FILTER (WHERE LOWER(COALESCE(b.status, '')) = 'pending'),
    COUNT(*) FILTER (WHERE LOWER(COALESCE(b.status, '')) = 'approved')
  INTO v_gross_pipeline, v_pending_bookings_count, v_approved_bookings_count
  FROM public.bookings b
  WHERE (v_effective_prop IS NULL OR b.property_id = v_effective_prop)
    AND (p_from IS NULL OR COALESCE(b.booking_date, b.created_at::DATE) >= p_from)
    AND (p_to   IS NULL OR COALESCE(b.booking_date, b.created_at::DATE) <= p_to);

  -- 4. Active Tenants Count
  SELECT COUNT(*)
    INTO v_active_tenants_count
    FROM public.tenants t
   WHERE (v_effective_prop IS NULL OR t.property_id = v_effective_prop)
     AND LOWER(COALESCE(t.status, 'active')) <> 'checkout';

  -- 5. Unreconciled Midtrans Clearing (COA 1200)
  SELECT COALESCE(SUM(
    CASE
      WHEN mc.outstanding_amount IS NOT NULL AND mc.outstanding_amount > 0 THEN mc.outstanding_amount
      ELSE GREATEST(0, COALESCE(mc.net_amount, mc.gross_amount, 0) - COALESCE(mc.reconciled_amount, 0))
    END
  ), 0)
  INTO v_unreconciled_escrow
  FROM public.midtrans_clearing_transactions mc
  WHERE (
      CASE
        WHEN v_user_prop IS NOT NULL THEN mc.property_id = v_user_prop
        WHEN v_effective_prop IS NOT NULL THEN mc.property_id = v_effective_prop
        ELSE TRUE
      END
    )
    AND LOWER(COALESCE(mc.clearing_status, 'pending')) <> 'reconciled';

  RETURN jsonb_build_object(
    'occupancy', jsonb_build_object(
      'total', v_total_rooms,
      'occupied', v_occupied_rooms,
      'available', v_available_rooms,
      'rate', v_occupancy_rate
    ),
    'inflow', v_inflow,
    'expenses', v_expenses,
    'noi', v_noi,
    'coaBreakdown', jsonb_build_object(
      'maintenance', v_coa_maint,
      'utilities', v_coa_util,
      'marketing', v_coa_mkt,
      'other', v_coa_other
    ),
    'grossPipeline', v_gross_pipeline,
    'pendingBookingsCount', v_pending_bookings_count,
    'approvedBookingsCount', v_approved_bookings_count,
    'activeTenantsCount', v_active_tenants_count,
    'unreconciledEscrow', v_unreconciled_escrow,
    'propertyId', v_effective_prop
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.monthly_cashflow(
  p_property_id BIGINT DEFAULT NULL,
  p_months INT DEFAULT 12
)
RETURNS TABLE (
  month TEXT,
  period_key TEXT,
  inflow NUMERIC,
  outflow NUMERIC,
  noi NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID;
  v_role TEXT;
  v_user_prop BIGINT;
  v_effective_prop BIGINT;
  v_safe_months INT;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NOT NULL THEN
    SELECT LOWER(COALESCE(u.role, '')), u.property_id
      INTO v_role, v_user_prop
      FROM public.users u
     WHERE u.id = v_uid
     LIMIT 1;

    IF v_role IS NULL OR v_role NOT IN (
      'super', 'super_admin', 'owner', 'anak_owner', 'admin', 'finance'
    ) THEN
      RAISE EXCEPTION 'Unauthorized: role "%" is not permitted to invoke monthly_cashflow', COALESCE(v_role, 'anonymous')
        USING ERRCODE = '42501';
    END IF;

    IF v_user_prop IS NOT NULL THEN
      IF p_property_id IS NOT NULL AND p_property_id <> v_user_prop THEN
        RAISE EXCEPTION 'Unauthorized: property scope violation for property_id %', p_property_id
          USING ERRCODE = '42501';
      END IF;
      v_effective_prop := v_user_prop;
    ELSE
      v_effective_prop := p_property_id;
    END IF;
  ELSE
    v_effective_prop := p_property_id;
  END IF;

  v_safe_months := LEAST(GREATEST(COALESCE(p_months, 12), 1), 36);

  RETURN QUERY
  WITH month_series AS (
    SELECT
      date_trunc('month', CURRENT_DATE) - (n || ' months')::INTERVAL AS month_start
    FROM generate_series(v_safe_months - 1, 0, -1) AS n
  ),
  tx_agg AS (
    SELECT
      date_trunc('month', COALESCE(ft.transaction_date, ft.date, ft.created_at::DATE)::TIMESTAMP) AS m_start,
      COALESCE(SUM(ft.amount) FILTER (
        WHERE LOWER(COALESCE(ft.type, '')) IN ('revenue', 'income')
          AND COALESCE(ft.reference_type, '') NOT IN ('bank_reconciliation', 'survey_refund')
          AND NOT (COALESCE(ft.debit_account_id, 0) = 1010 AND COALESCE(ft.credit_account_id, 0) = 1200)
          AND COALESCE(ft.credit_account_id, 0) <> 1300
      ), 0) AS m_inflow,
      COALESCE(SUM(ft.amount) FILTER (
        WHERE LOWER(COALESCE(ft.type, '')) = 'expense'
          AND COALESCE(ft.reference_type, '') NOT IN ('bank_reconciliation', 'survey_refund')
          AND COALESCE(ft.debit_account_id, 0) <> 1300
          AND NOT (COALESCE(ft.debit_account_id, 0) = 1200 AND COALESCE(ft.credit_account_id, 0) = 1010)
      ), 0) AS m_outflow
    FROM public.financial_transactions ft
    WHERE (
        CASE
          WHEN v_user_prop IS NOT NULL THEN ft.property_id = v_user_prop
          WHEN v_effective_prop IS NOT NULL THEN ft.property_id = v_effective_prop
          ELSE TRUE
        END
      )
      AND LOWER(COALESCE(ft.status, 'posted')) NOT IN ('void', 'failed', 'cancelled', 'rejected')
      AND COALESCE(ft.transaction_date, ft.date, ft.created_at::DATE) >= (date_trunc('month', CURRENT_DATE) - ((v_safe_months - 1) || ' months')::INTERVAL)::DATE
    GROUP BY 1
  )
  SELECT
    to_char(ms.month_start, 'Mon YYYY') AS month,
    to_char(ms.month_start, 'YYYY-MM') AS period_key,
    COALESCE(ta.m_inflow, 0)::NUMERIC AS inflow,
    COALESCE(ta.m_outflow, 0)::NUMERIC AS outflow,
    (COALESCE(ta.m_inflow, 0) - COALESCE(ta.m_outflow, 0))::NUMERIC AS noi
  FROM month_series ms
  LEFT JOIN tx_agg ta ON ta.m_start = ms.month_start
  ORDER BY ms.month_start ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.dashboard_summary(BIGINT, DATE, DATE) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dashboard_summary(BIGINT, DATE, DATE) FROM anon;
GRANT EXECUTE ON FUNCTION public.dashboard_summary(BIGINT, DATE, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dashboard_summary(BIGINT, DATE, DATE) TO service_role;

REVOKE ALL ON FUNCTION public.monthly_cashflow(BIGINT, INT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.monthly_cashflow(BIGINT, INT) FROM anon;
GRANT EXECUTE ON FUNCTION public.monthly_cashflow(BIGINT, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.monthly_cashflow(BIGINT, INT) TO service_role;

COMMIT;
