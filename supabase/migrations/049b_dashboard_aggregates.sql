-- ============================================================================
-- MIGRATION 049b: SERVER-SIDE DASHBOARD AGGREGATES (G9)
-- ============================================================================
-- Tujuan:
--   1. Menyediakan RPC agregasi `dashboard_summary(p_property_id, p_from, p_to)`
--      dan `monthly_cashflow(p_property_id, p_from, p_to)` yang idempoten dan
--      identik secara matematis dengan `src/lib/financialMetrics.ts`
--      (`calculateExecutiveFinancialSummary`), sehingga dashboard Admin/Owner
--      tidak perlu menghitung ulang ribuan baris di browser.
--   2. Keamanan:
--      - `SECURITY DEFINER` + `SET search_path = public`
--      - Pemeriksaan role & cakupan properti (`property_id`) di dalam fungsi
--      - `REVOKE ALL FROM PUBLIC, anon` dan `GRANT EXECUTE TO authenticated, service_role`
-- ============================================================================

BEGIN;

-- Pastikan kolom opsional tersedia pada financial_transactions & users agar fungsi tidak gagal di skema lama
ALTER TABLE public.financial_transactions ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'posted';
ALTER TABLE public.financial_transactions ADD COLUMN IF NOT EXISTS debit_account_id INT;
ALTER TABLE public.financial_transactions ADD COLUMN IF NOT EXISTS credit_account_id INT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT true;

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
  v_jwt_role TEXT := COALESCE(current_setting('request.jwt.claim.role', true), '');
  v_uid UUID := auth.uid();
  v_user_role TEXT;
  v_user_prop BIGINT;
  v_is_active BOOLEAN;
  v_effective_prop BIGINT := p_property_id;

  v_has_posted_ledger BOOLEAN := false;
  v_total_inflow NUMERIC := 0;
  v_total_expenses NUMERIC := 0;
  v_opex_maintenance NUMERIC := 0;
  v_opex_utilities NUMERIC := 0;
  v_opex_marketing NUMERIC := 0;
  v_opex_other NUMERIC := 0;
  v_gross_pipeline NUMERIC := 0;
  v_total_rooms INT := 0;
  v_occupied_rooms INT := 0;
  v_occupancy_rate INT := 0;
BEGIN
  -- 1. Verifikasi Role & Cakupan Properti (kecuali dipanggil oleh service_role server)
  IF v_jwt_role <> 'service_role' THEN
    IF v_uid IS NULL THEN
      RAISE EXCEPTION 'Akses ditolak: autentikasi diperlukan untuk dashboard_summary.';
    END IF;

    SELECT u.role, u.property_id::BIGINT, COALESCE(u.active, true)
      INTO v_user_role, v_user_prop, v_is_active
    FROM public.users u
    WHERE u.id::text = v_uid::text
    LIMIT 1;

    IF v_user_role IS NULL OR NOT v_is_active THEN
      RAISE EXCEPTION 'Akses ditolak: akun tidak aktif atau tidak ditemukan.';
    END IF;

    IF v_user_role NOT IN ('super', 'super_admin', 'owner', 'anak_owner', 'director', 'commissioner', 'admin', 'finance', 'accounting', 'staff') THEN
      RAISE EXCEPTION 'Akses ditolak: peran % tidak diizinkan mengakses ringkasan keuangan.', v_user_role;
    END IF;

    IF v_user_prop IS NOT NULL THEN
      v_effective_prop := v_user_prop;
    END IF;
  END IF;

  -- 2. Cek apakah sudah ada transaksi berstatus posted di financial_transactions (sesuai financialMetrics.ts)
  SELECT EXISTS (
    SELECT 1
    FROM public.financial_transactions ft
    WHERE LOWER(COALESCE(ft.status, 'posted')) NOT IN ('void', 'deleted', 'cancelled', 'rejected', 'failed')
      AND (v_effective_prop IS NULL OR ft.property_id = v_effective_prop)
      AND (p_from IS NULL OR COALESCE(ft.transaction_date, ft.created_at::date) >= p_from)
      AND (p_to IS NULL OR COALESCE(ft.transaction_date, ft.created_at::date) <= p_to)
  ) INTO v_has_posted_ledger;

  -- 3. Hitung Total Inflow (paritas dengan calculateTotalInflow)
  IF v_has_posted_ledger THEN
    SELECT COALESCE(SUM(COALESCE(ft.amount, 0)), 0)
      INTO v_total_inflow
    FROM public.financial_transactions ft
    WHERE LOWER(COALESCE(ft.status, 'posted')) NOT IN ('void', 'deleted', 'cancelled', 'rejected', 'failed')
      AND (v_effective_prop IS NULL OR ft.property_id = v_effective_prop)
      AND (p_from IS NULL OR COALESCE(ft.transaction_date, ft.created_at::date) >= p_from)
      AND (p_to IS NULL OR COALESCE(ft.transaction_date, ft.created_at::date) <= p_to)
      AND (
        LOWER(COALESCE(ft.type, '')) IN ('revenue', 'income')
        OR (ft.credit_account_id >= 4000 AND ft.credit_account_id < 5000)
        OR (ft.credit_account_id = 2100 AND ft.debit_account_id IN (1000, 1010, 1020))
      );
  ELSE
    SELECT COALESCE((
      SELECT SUM(COALESCE(p.amount, 0))
      FROM public.payments p
      WHERE LOWER(COALESCE(p.status, '')) IN ('paid', 'completed', 'settled', 'settlement', 'approved', 'success')
        AND (v_effective_prop IS NULL OR p.property_id = v_effective_prop)
        AND (p_from IS NULL OR COALESCE(p.payment_date, p.created_at::date) >= p_from)
        AND (p_to IS NULL OR COALESCE(p.payment_date, p.created_at::date) <= p_to)
    ), 0)
    + COALESCE((
      SELECT SUM(COALESCE(ce.total_amount, 0))
      FROM public.contract_extensions ce
      WHERE LOWER(COALESCE(ce.status, '')) IN ('paid', 'approved', 'settled', 'settlement', 'completed')
        AND (v_effective_prop IS NULL OR ce.property_id = v_effective_prop)
        AND (p_from IS NULL OR COALESCE(ce.paid_at::date, ce.created_at::date) >= p_from)
        AND (p_to IS NULL OR COALESCE(ce.paid_at::date, ce.created_at::date) <= p_to)
    ), 0)
    INTO v_total_inflow;
  END IF;

  -- 4. Hitung Total Expenses & Expense Breakdown (paritas dengan calculateExpenseBreakdown)
  SELECT EXISTS (
    SELECT 1
    FROM public.financial_transactions ft
    WHERE LOWER(COALESCE(ft.status, 'posted')) NOT IN ('void', 'deleted', 'cancelled', 'rejected', 'failed')
      AND (v_effective_prop IS NULL OR ft.property_id = v_effective_prop)
      AND (p_from IS NULL OR COALESCE(ft.transaction_date, ft.created_at::date) >= p_from)
      AND (p_to IS NULL OR COALESCE(ft.transaction_date, ft.created_at::date) <= p_to)
      AND (
        LOWER(COALESCE(ft.type, '')) = 'expense'
        OR (ft.debit_account_id >= 5000 AND ft.debit_account_id < 6000)
      )
  ) INTO v_has_posted_ledger;

  IF v_has_posted_ledger THEN
    SELECT
      COALESCE(SUM(CASE WHEN LOWER(COALESCE(ft.category, '')) LIKE '%maint%' OR LOWER(COALESCE(ft.category, '')) LIKE '%perbaikan%' OR LOWER(COALESCE(ft.category, '')) LIKE '%pemeliharaan%' OR ft.debit_account_id = 5100 THEN COALESCE(ft.amount, 0) ELSE 0 END), 0),
      COALESCE(SUM(CASE WHEN NOT (LOWER(COALESCE(ft.category, '')) LIKE '%maint%' OR LOWER(COALESCE(ft.category, '')) LIKE '%perbaikan%' OR LOWER(COALESCE(ft.category, '')) LIKE '%pemeliharaan%' OR ft.debit_account_id = 5100)
                         AND (LOWER(COALESCE(ft.category, '')) LIKE '%util%' OR LOWER(COALESCE(ft.category, '')) LIKE '%listrik%' OR LOWER(COALESCE(ft.category, '')) LIKE '%air%' OR LOWER(COALESCE(ft.category, '')) LIKE '%internet%' OR LOWER(COALESCE(ft.category, '')) LIKE '%wifi%' OR ft.debit_account_id IN (5000, 5010))
                        THEN COALESCE(ft.amount, 0) ELSE 0 END), 0),
      COALESCE(SUM(CASE WHEN NOT (LOWER(COALESCE(ft.category, '')) LIKE '%maint%' OR LOWER(COALESCE(ft.category, '')) LIKE '%perbaikan%' OR LOWER(COALESCE(ft.category, '')) LIKE '%pemeliharaan%' OR ft.debit_account_id = 5100)
                         AND NOT (LOWER(COALESCE(ft.category, '')) LIKE '%util%' OR LOWER(COALESCE(ft.category, '')) LIKE '%listrik%' OR LOWER(COALESCE(ft.category, '')) LIKE '%air%' OR LOWER(COALESCE(ft.category, '')) LIKE '%internet%' OR LOWER(COALESCE(ft.category, '')) LIKE '%wifi%' OR ft.debit_account_id IN (5000, 5010))
                         AND (LOWER(COALESCE(ft.category, '')) LIKE '%market%' OR LOWER(COALESCE(ft.category, '')) LIKE '%iklan%' OR LOWER(COALESCE(ft.category, '')) LIKE '%promosi%' OR ft.debit_account_id = 5500)
                        THEN COALESCE(ft.amount, 0) ELSE 0 END), 0),
      COALESCE(SUM(CASE WHEN NOT (LOWER(COALESCE(ft.category, '')) LIKE '%maint%' OR LOWER(COALESCE(ft.category, '')) LIKE '%perbaikan%' OR LOWER(COALESCE(ft.category, '')) LIKE '%pemeliharaan%' OR ft.debit_account_id = 5100)
                         AND NOT (LOWER(COALESCE(ft.category, '')) LIKE '%util%' OR LOWER(COALESCE(ft.category, '')) LIKE '%listrik%' OR LOWER(COALESCE(ft.category, '')) LIKE '%air%' OR LOWER(COALESCE(ft.category, '')) LIKE '%internet%' OR LOWER(COALESCE(ft.category, '')) LIKE '%wifi%' OR ft.debit_account_id IN (5000, 5010))
                         AND NOT (LOWER(COALESCE(ft.category, '')) LIKE '%market%' OR LOWER(COALESCE(ft.category, '')) LIKE '%iklan%' OR LOWER(COALESCE(ft.category, '')) LIKE '%promosi%' OR ft.debit_account_id = 5500)
                        THEN COALESCE(ft.amount, 0) ELSE 0 END), 0)
    INTO v_opex_maintenance, v_opex_utilities, v_opex_marketing, v_opex_other
    FROM public.financial_transactions ft
    WHERE LOWER(COALESCE(ft.status, 'posted')) NOT IN ('void', 'deleted', 'cancelled', 'rejected', 'failed')
      AND (v_effective_prop IS NULL OR ft.property_id = v_effective_prop)
      AND (p_from IS NULL OR COALESCE(ft.transaction_date, ft.created_at::date) >= p_from)
      AND (p_to IS NULL OR COALESCE(ft.transaction_date, ft.created_at::date) <= p_to)
      AND (
        LOWER(COALESCE(ft.type, '')) = 'expense'
        OR (ft.debit_account_id >= 5000 AND ft.debit_account_id < 6000)
      );
  ELSIF to_regclass('public.operational_expenses') IS NOT NULL THEN
    EXECUTE $sql$
      SELECT
        COALESCE(SUM(CASE WHEN LOWER(COALESCE(oe.category, '')) = 'maintenance' THEN COALESCE(oe.amount, 0) ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN LOWER(COALESCE(oe.category, '')) = 'utilities' THEN COALESCE(oe.amount, 0) ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN LOWER(COALESCE(oe.category, '')) = 'marketing' THEN COALESCE(oe.amount, 0) ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN LOWER(COALESCE(oe.category, '')) NOT IN ('maintenance', 'utilities', 'marketing') THEN COALESCE(oe.amount, 0) ELSE 0 END), 0)
      FROM public.operational_expenses oe
      WHERE ($1 IS NULL OR oe.property_id = $1)
        AND ($2 IS NULL OR COALESCE(oe.expense_date, oe.created_at::date) >= $2)
        AND ($3 IS NULL OR COALESCE(oe.expense_date, oe.created_at::date) <= $3)
    $sql$
    INTO v_opex_maintenance, v_opex_utilities, v_opex_marketing, v_opex_other
    USING v_effective_prop, p_from, p_to;
  END IF;

  v_total_expenses := v_opex_maintenance + v_opex_utilities + v_opex_marketing + v_opex_other;

  -- 5. Hitung Gross Pipeline (paritas dengan calculateGrossPipeline)
  SELECT COALESCE(SUM(COALESCE(b.total_price, 0)), 0)
    INTO v_gross_pipeline
  FROM public.bookings b
  WHERE LOWER(COALESCE(b.status, '')) IN ('approved', 'pending', 'paid', 'confirmed', 'completed')
    AND (v_effective_prop IS NULL OR b.property_id = v_effective_prop)
    AND (p_from IS NULL OR b.created_at::date >= p_from)
    AND (p_to IS NULL OR b.created_at::date <= p_to);

  -- 6. Hitung Occupancy (paritas dengan calculateOccupancy)
  SELECT
    COUNT(*),
    COUNT(*) FILTER (
      WHERE LOWER(COALESCE(r.status, '')) = 'occupied'
         OR EXISTS (
           SELECT 1
           FROM public.tenants t
           WHERE t.property_id = r.property_id
             AND TRIM(COALESCE(t.room_number, '')) = TRIM(COALESCE(r.room_number, ''))
             AND LOWER(COALESCE(t.status, 'active')) NOT IN ('cancelled', 'terminated', 'moved_out', 'completed', 'expired', 'inactive', 'checked_out')
             AND (
               t.start_date IS NULL
               OR (t.start_date::date + (GREATEST(COALESCE(t.duration_months, 1), 1) || ' months')::interval)::date >= CURRENT_DATE
             )
         )
    )
  INTO v_total_rooms, v_occupied_rooms
  FROM public.rooms r
  WHERE (v_effective_prop IS NULL OR r.property_id = v_effective_prop);

  IF v_total_rooms > 0 THEN
    v_occupancy_rate := ROUND((v_occupied_rooms::NUMERIC / v_total_rooms::NUMERIC) * 100)::INT;
  ELSE
    v_occupancy_rate := 0;
  END IF;

  RETURN jsonb_build_object(
    'totalInflow', v_total_inflow,
    'totalExpenses', v_total_expenses,
    'noi', v_total_inflow - v_total_expenses,
    'grossPipeline', v_gross_pipeline,
    'opexBreakdown', jsonb_build_object(
      'maintenance', v_opex_maintenance,
      'utilities', v_opex_utilities,
      'marketing', v_opex_marketing,
      'other', v_opex_other,
      'total', v_total_expenses
    ),
    'occupancy', jsonb_build_object(
      'totalRooms', v_total_rooms,
      'occupiedRooms', v_occupied_rooms,
      'vacantRooms', GREATEST(0, v_total_rooms - v_occupied_rooms),
      'occupancyRate', v_occupancy_rate
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.monthly_cashflow(
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
  v_jwt_role TEXT := COALESCE(current_setting('request.jwt.claim.role', true), '');
  v_uid UUID := auth.uid();
  v_user_role TEXT;
  v_user_prop BIGINT;
  v_is_active BOOLEAN;
  v_effective_prop BIGINT := p_property_id;
  v_result JSONB := '[]'::jsonb;
BEGIN
  IF v_jwt_role <> 'service_role' THEN
    IF v_uid IS NULL THEN
      RAISE EXCEPTION 'Akses ditolak: autentikasi diperlukan untuk monthly_cashflow.';
    END IF;

    SELECT u.role, u.property_id::BIGINT, COALESCE(u.active, true)
      INTO v_user_role, v_user_prop, v_is_active
    FROM public.users u
    WHERE u.id::text = v_uid::text
    LIMIT 1;

    IF v_user_role IS NULL OR NOT v_is_active THEN
      RAISE EXCEPTION 'Akses ditolak: akun tidak aktif atau tidak ditemukan.';
    END IF;

    IF v_user_role NOT IN ('super', 'super_admin', 'owner', 'anak_owner', 'director', 'commissioner', 'admin', 'finance', 'accounting', 'staff') THEN
      RAISE EXCEPTION 'Akses ditolak: peran % tidak diizinkan mengakses arus kas bulanan.', v_user_role;
    END IF;

    IF v_user_prop IS NOT NULL THEN
      v_effective_prop := v_user_prop;
    END IF;
  END IF;

  SELECT COALESCE(jsonb_agg(row_to_json(m) ORDER BY m.month ASC), '[]'::jsonb)
    INTO v_result
  FROM (
    SELECT
      TO_CHAR(COALESCE(ft.transaction_date, ft.created_at::date), 'YYYY-MM') AS month,
      COALESCE(SUM(CASE
        WHEN LOWER(COALESCE(ft.type, '')) IN ('revenue', 'income')
          OR (ft.credit_account_id >= 4000 AND ft.credit_account_id < 5000)
          OR (ft.credit_account_id = 2100 AND ft.debit_account_id IN (1000, 1010, 1020))
        THEN COALESCE(ft.amount, 0) ELSE 0 END), 0) AS inflow,
      COALESCE(SUM(CASE
        WHEN LOWER(COALESCE(ft.type, '')) = 'expense'
          OR (ft.debit_account_id >= 5000 AND ft.debit_account_id < 6000)
        THEN COALESCE(ft.amount, 0) ELSE 0 END), 0) AS outflow,
      COALESCE(SUM(CASE
        WHEN LOWER(COALESCE(ft.type, '')) IN ('revenue', 'income')
          OR (ft.credit_account_id >= 4000 AND ft.credit_account_id < 5000)
          OR (ft.credit_account_id = 2100 AND ft.debit_account_id IN (1000, 1010, 1020))
        THEN COALESCE(ft.amount, 0)
        WHEN LOWER(COALESCE(ft.type, '')) = 'expense'
          OR (ft.debit_account_id >= 5000 AND ft.debit_account_id < 6000)
        THEN -COALESCE(ft.amount, 0)
        ELSE 0 END), 0) AS net
    FROM public.financial_transactions ft
    WHERE LOWER(COALESCE(ft.status, 'posted')) NOT IN ('void', 'deleted', 'cancelled', 'rejected', 'failed')
      AND (v_effective_prop IS NULL OR ft.property_id = v_effective_prop)
      AND (p_from IS NULL OR COALESCE(ft.transaction_date, ft.created_at::date) >= p_from)
      AND (p_to IS NULL OR COALESCE(ft.transaction_date, ft.created_at::date) <= p_to)
    GROUP BY TO_CHAR(COALESCE(ft.transaction_date, ft.created_at::date), 'YYYY-MM')
  ) m;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.dashboard_summary(BIGINT, DATE, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dashboard_summary(BIGINT, DATE, DATE) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.monthly_cashflow(BIGINT, DATE, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.monthly_cashflow(BIGINT, DATE, DATE) TO authenticated, service_role;

COMMIT;
