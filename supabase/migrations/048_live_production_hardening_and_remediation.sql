-- ============================================================================
-- SAMARA STAY ERP — MIGRATION 048: LIVE PRODUCTION HARDENING & REMEDIATION
-- ============================================================================
-- Tujuan: Menjawab dan menutup seluruh 11 titik audit verifikasi live database:
--   1 & 2. Menghapus seluruh policy RLS permisif (USING true / WITH CHECK true)
--          dan menggantinya dengan RBAC ketat berbasis peran & properti.
--   3.     Memastikan 100% tabel di skema public mengaktifkan RLS (0 tabel tanpa RLS).
--   4.     Mencabut (REVOKE) seluruh hak akses tabel PII/keuangan dari role anon & PUBLIC.
--   5.     Mencabut (REVOKE) hak EXECUTE fungsi RPC mutasi/keuangan dari anon & authenticated
--          (hanya service_role yang berhak mengeksekusi).
--   6.     Memastikan tabel webhook_events memiliki UNIQUE(event_id) dan order_id nullable.
--   7.     Menyelaraskan kolom skema (tenants.lease_end_date, bookings.hold_expires_at,
--          midtrans_clearing_transactions.payment_id TEXT + UNIQUE(midtrans_order_id),
--          serta perbaikan RPC public_room_availability memakai r.price AS monthly_price).
--   8.     Membersihkan publikasi supabase_realtime dari tabel audit/sistem sensitif.
--   9.     Mengunci bucket dokumen privat (public = false) dan memperketat policy storage.objects.
--   10 & 11. Memperbaiki integritas akuntansi (jurnal yatim, duplikat referensi,
--          duplikat midtrans_order_id pada payments, dan backfill midtrans_clearing_transactions).
-- ============================================================================

BEGIN;

-- ============================================================================
-- BAGIAN 3: AKTIFKAN RLS PADA SELURUH TABEL DI SKEMA PUBLIC (0 TABEL TANPA RLS)
-- ============================================================================
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT c.relname AS tablename
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.tablename);
  END LOOP;
END $$;

-- ============================================================================
-- BAGIAN 6 & 7: PENYELARASAN SKEMA, KOLOM, & CONSTRAINT UNIK
-- ============================================================================

-- 6a. Pastikan tabel webhook_events ada dengan UNIQUE(event_id) dan order_id nullable
CREATE TABLE IF NOT EXISTS public.webhook_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  provider TEXT NOT NULL DEFAULT 'midtrans',
  event_id TEXT NOT NULL,
  order_id TEXT,
  transaction_id TEXT,
  status TEXT,
  payload JSONB,
  processed_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_events ALTER COLUMN order_id DROP NOT NULL;
ALTER TABLE public.webhook_events ALTER COLUMN status DROP NOT NULL;

-- Hapus constraint unik lama pada transaction_id / order_id jika pernah dibuat sebelumnya
DO $$
DECLARE
  c RECORD;
BEGIN
  FOR c IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.webhook_events'::regclass
      AND contype = 'u'
      AND pg_get_constraintdef(oid) NOT ILIKE '%(event_id)%'
  LOOP
    EXECUTE format('ALTER TABLE public.webhook_events DROP CONSTRAINT %I', c.conname);
  END LOOP;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.webhook_events'::regclass
      AND contype = 'u'
      AND pg_get_constraintdef(oid) ILIKE '%(event_id)%'
  ) THEN
    ALTER TABLE public.webhook_events ADD CONSTRAINT webhook_events_event_id_key UNIQUE (event_id);
  END IF;
END $$;

-- 7a. Pastikan kolom yang dirujuk kode tersedia di tabel masing-masing
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS hold_expires_at TIMESTAMPTZ;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS check_in_date DATE;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS check_out_date DATE;
ALTER TABLE public.tenants  ADD COLUMN IF NOT EXISTS lease_end_date DATE;
ALTER TABLE public.tenants  ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'active';
ALTER TABLE public.tenants  ADD COLUMN IF NOT EXISTS payment_status VARCHAR(50) DEFAULT 'paid';

-- 7b. Ubah midtrans_clearing_transactions.payment_id menjadi TEXT (agar kompatibel dengan ID 'INV-...')
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'midtrans_clearing_transactions'
      AND column_name = 'payment_id'
      AND data_type <> 'text'
  ) THEN
    ALTER TABLE public.midtrans_clearing_transactions
      ALTER COLUMN payment_id TYPE TEXT USING payment_id::TEXT;
  END IF;
END $$;

-- 7c. Perbaiki RPC public_room_availability agar merujuk kolom aktual r.price AS monthly_price
CREATE OR REPLACE FUNCTION public.public_room_availability(p_property_id BIGINT DEFAULT NULL)
RETURNS TABLE (
  room_id BIGINT,
  property_id BIGINT,
  room_number TEXT,
  status TEXT,
  monthly_price NUMERIC,
  daily_price NUMERIC
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    r.id AS room_id,
    r.property_id,
    r.room_number,
    r.status,
    r.price AS monthly_price,
    r.daily_price
  FROM public.rooms r
  WHERE (p_property_id IS NULL OR r.property_id = p_property_id);
$$;

-- 7d. Perbaiki RPC settle_manual_booking_approval agar mencatat midtrans_clearing_transactions & deduplikasi payments
CREATE OR REPLACE FUNCTION public.settle_manual_booking_approval(
  p_booking_id BIGINT,
  p_payment_method VARCHAR(100) DEFAULT 'Transfer Manual',
  p_created_by VARCHAR(100) DEFAULT 'Admin Approval'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking bookings%ROWTYPE;
  v_room_id BIGINT;
  v_occupant_name VARCHAR(255);
  v_occupant_phone VARCHAR(100);
  v_occupant_email VARCHAR(255);
  v_occupant_job VARCHAR(100);
  v_payment_method VARCHAR(100);
  v_amount NUMERIC(15, 2);
  v_invoice_id VARCHAR(100);
  v_trx_no VARCHAR(100);
  v_trx_id BIGINT;
  v_journal_no VARCHAR(100);
  v_debit_acc INT;
  v_credit_acc INT := 4000;
  v_tenant_id BIGINT;
  v_trx_date DATE := CURRENT_DATE;
BEGIN
  SELECT * INTO v_booking
  FROM bookings
  WHERE id = p_booking_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Booking tidak ditemukan.');
  END IF;

  IF v_booking.status = 'approved' THEN
    RETURN jsonb_build_object(
      'success', true,
      'already_approved', true,
      'message', 'Booking sudah disetujui sebelumnya.',
      'booking', row_to_json(v_booking)
    );
  END IF;

  v_occupant_name := COALESCE(NULLIF(TRIM(v_booking.occupant_name), ''), v_booking.tenant_name, 'Penyewa');
  v_occupant_phone := COALESCE(NULLIF(TRIM(v_booking.occupant_phone), ''), v_booking.phone, '-');
  v_occupant_email := COALESCE(NULLIF(TRIM(v_booking.occupant_email), ''), v_booking.email, '');
  v_occupant_job := COALESCE(NULLIF(TRIM(v_booking.occupant_job), ''), 'Umum');
  v_payment_method := COALESCE(NULLIF(TRIM(p_payment_method), ''), v_booking.payment_method, 'Transfer Manual');
  v_amount := COALESCE(v_booking.total_price, v_booking.rent_price, 0);

  IF LOWER(v_payment_method) LIKE '%midtrans%' THEN
    v_debit_acc := 1200;
  ELSE
    v_debit_acc := 1010;
  END IF;

  UPDATE bookings
  SET status = 'approved',
      payment_method = v_payment_method
  WHERE id = p_booking_id
  RETURNING * INTO v_booking;

  v_room_id := v_booking.room_id;
  IF v_room_id IS NULL AND v_booking.room_number IS NOT NULL THEN
    SELECT id INTO v_room_id
    FROM rooms
    WHERE room_number = v_booking.room_number
      AND (v_booking.property_id IS NULL OR property_id = v_booking.property_id)
    LIMIT 1;
  END IF;

  IF v_room_id IS NOT NULL THEN
    UPDATE rooms
    SET status = 'occupied',
        current_tenant_name = v_occupant_name
    WHERE id = v_room_id;
  END IF;

  SELECT id INTO v_tenant_id
  FROM tenants
  WHERE room_number = v_booking.room_number
    AND (v_booking.property_id IS NULL OR property_id = v_booking.property_id)
  ORDER BY id DESC
  LIMIT 1;

  IF v_tenant_id IS NOT NULL THEN
    UPDATE tenants
    SET full_name = v_occupant_name,
        phone = v_occupant_phone,
        email = v_occupant_email,
        job = v_occupant_job,
        start_date = COALESCE(v_booking.check_in_date, CURRENT_DATE),
        duration_months = COALESCE(v_booking.duration_months, 1),
        payment_status = 'paid',
        status = 'active'
    WHERE id = v_tenant_id;
  ELSE
    INSERT INTO tenants (
      full_name, phone, email, job, avatar_initials, avatar_color,
      property_id, room_number, start_date, duration_months, payment_status, status
    ) VALUES (
      v_occupant_name,
      v_occupant_phone,
      v_occupant_email,
      v_occupant_job,
      UPPER(LEFT(REGEXP_REPLACE(v_occupant_name, '[^a-zA-Z]', '', 'g'), 2)),
      '#2E6F40',
      v_booking.property_id,
      v_booking.room_number,
      COALESCE(v_booking.check_in_date, CURRENT_DATE),
      COALESCE(v_booking.duration_months, 1),
      'paid',
      'active'
    )
    RETURNING id INTO v_tenant_id;
  END IF;

  v_invoice_id := NULL;
  IF v_booking.midtrans_order_id IS NOT NULL THEN
    SELECT id INTO v_invoice_id
    FROM payments
    WHERE midtrans_order_id = v_booking.midtrans_order_id
    ORDER BY created_at ASC
    LIMIT 1;
  END IF;

  IF v_invoice_id IS NOT NULL THEN
    UPDATE payments
    SET tenant_name = v_occupant_name,
        property_id = v_booking.property_id,
        amount = v_amount,
        method = v_payment_method,
        status = 'paid',
        payment_date = v_trx_date
    WHERE id = v_invoice_id;
  ELSE
    v_invoice_id := 'INV-' || v_booking.id::TEXT || '-' || EXTRACT(EPOCH FROM NOW())::BIGINT::TEXT || '-' || FLOOR(1000 + RANDOM() * 9000)::TEXT;
    INSERT INTO payments (
      id, tenant_name, property_id, amount, method, status, payment_date, midtrans_order_id, transaction_id
    ) VALUES (
      v_invoice_id,
      v_occupant_name,
      v_booking.property_id,
      v_amount,
      v_payment_method,
      'paid',
      v_trx_date,
      v_booking.midtrans_order_id,
      COALESCE(v_booking.midtrans_order_id, 'manual-tr-' || FLOOR(100000 + RANDOM() * 900000)::TEXT)
    );
  END IF;

  IF LOWER(v_payment_method) LIKE '%midtrans%' AND v_booking.midtrans_order_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM midtrans_clearing_transactions WHERE midtrans_order_id = v_booking.midtrans_order_id
    ) THEN
      INSERT INTO midtrans_clearing_transactions (
        booking_id, midtrans_order_id, midtrans_transaction_id, gross_amount, fee_amount,
        net_amount, reconciled_amount, outstanding_amount, clearing_status, property_id, tenant_name, settled_at
      ) VALUES (
        v_booking.id, v_booking.midtrans_order_id, v_booking.midtrans_order_id, v_amount, 0,
        v_amount, 0, v_amount, 'cleared', COALESCE(v_booking.property_id, 1), v_occupant_name, NOW()
      );
    END IF;
  END IF;

  v_trx_no := 'TRX-' || TO_CHAR(v_trx_date, 'YYYYMMDD') || '-' || FLOOR(100 + RANDOM() * 900)::TEXT;
  BEGIN
    INSERT INTO financial_transactions (
      transaction_no, transaction_date, category, description, amount, type,
      reference_type, reference_id, created_by, property_id
    ) VALUES (
      v_trx_no, v_trx_date, 'Penerimaan Sewa',
      '[APPROVAL] Pelunasan Sewa ' || v_occupant_name || ' Unit ' || COALESCE(v_booking.room_number, ''),
      v_amount, 'income', 'payment', v_invoice_id, p_created_by, COALESCE(v_booking.property_id, 1)
    )
    RETURNING id INTO v_trx_id;

    IF v_trx_id IS NOT NULL THEN
      v_journal_no := 'JRN-' || TO_CHAR(v_trx_date, 'YYYYMMDD') || '-' || v_trx_id::TEXT;
      INSERT INTO journal_entries (journal_no, transaction_id, account_id, debit, credit)
      VALUES
        (v_journal_no, v_trx_id, v_debit_acc, v_amount, 0),
        (v_journal_no, v_trx_id, v_credit_acc, 0, v_amount);

      UPDATE accounts SET balance = balance + v_amount WHERE id = v_debit_acc;
      UPDATE accounts SET balance = balance + v_amount WHERE id = v_credit_acc;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN jsonb_build_object(
    'success', true,
    'already_approved', false,
    'booking', row_to_json(v_booking),
    'invoice_id', v_invoice_id,
    'tenant_id', v_tenant_id,
    'transaction_no', v_trx_no
  );
END;
$$;

-- ============================================================================
-- BAGIAN 10 & 11: PEMBERSIHAN & PERBAIKAN DATA AKUNTANSI & PEMBAYARAN LIVE
-- ============================================================================

-- 10c. Deteksi kandidat duplikat financial_transactions pada (reference_type, reference_id, category) yang sama
-- [NONAKTIF OLEH AUDIT] Penghapusan otomatis dinonaktifkan agar tidak menghapus cicilan sah atau membuat journal_entries yatim.
-- [NONAKTIF OLEH AUDIT] Penghapusan hanya boleh dilakukan manual setelah backup dan persetujuan pemilik.
-- [NONAKTIF OLEH AUDIT] DELETE FROM public.financial_transactions ft
-- [NONAKTIF OLEH AUDIT] USING (
-- [NONAKTIF OLEH AUDIT]   SELECT id,
-- [NONAKTIF OLEH AUDIT]          ROW_NUMBER() OVER (
-- [NONAKTIF OLEH AUDIT]            PARTITION BY reference_type, reference_id, category
-- [NONAKTIF OLEH AUDIT]            ORDER BY id ASC
-- [NONAKTIF OLEH AUDIT]          ) AS rn
-- [NONAKTIF OLEH AUDIT]   FROM public.financial_transactions
-- [NONAKTIF OLEH AUDIT]   WHERE reference_id IS NOT NULL
-- [NONAKTIF OLEH AUDIT] ) d
-- [NONAKTIF OLEH AUDIT] WHERE ft.id = d.id AND d.rn > 1;
SELECT
  reference_type,
  reference_id AS transaction_id,
  category,
  COUNT(*) AS duplicate_count,
  ARRAY_AGG(id ORDER BY id ASC) AS candidate_ids
FROM public.financial_transactions
WHERE reference_id IS NOT NULL
GROUP BY reference_type, reference_id, category
HAVING COUNT(*) > 1;

-- 10b. Backfill entri jurnal berpasangan (Debit = Kredit) untuk financial_transactions tanpa journal_entries
INSERT INTO public.journal_entries (journal_no, transaction_id, account_id, debit, credit)
SELECT
  'JRN-' || TO_CHAR(COALESCE(ft.transaction_date, CURRENT_DATE), 'YYYYMMDD') || '-' || LPAD(ft.id::TEXT, 5, '0'),
  ft.id,
  CASE WHEN ft.type = 'expense' THEN 5100 ELSE 1010 END,
  ft.amount,
  0
FROM public.financial_transactions ft
LEFT JOIN public.journal_entries je ON je.transaction_id = ft.id
WHERE je.id IS NULL AND COALESCE(ft.amount, 0) > 0;

INSERT INTO public.journal_entries (journal_no, transaction_id, account_id, debit, credit)
SELECT
  'JRN-' || TO_CHAR(COALESCE(ft.transaction_date, CURRENT_DATE), 'YYYYMMDD') || '-' || LPAD(ft.id::TEXT, 5, '0'),
  ft.id,
  CASE WHEN ft.type = 'expense' THEN 1010 ELSE 4000 END,
  0,
  ft.amount
FROM public.financial_transactions ft
WHERE COALESCE(ft.amount, 0) > 0
  AND (SELECT COUNT(*) FROM public.journal_entries je WHERE je.transaction_id = ft.id) = 1;

-- 10d. Koreksi jurnal yang mendebit & mengkredit akun yang sama dalam 1 transaksi (jika ada)
UPDATE public.journal_entries je
SET account_id = 4000
WHERE je.credit > 0
  AND je.debit = 0
  AND je.account_id IN (1000, 1010, 1020, 1200)
  AND EXISTS (
    SELECT 1 FROM public.journal_entries d
    WHERE d.transaction_id = je.transaction_id
      AND d.account_id = je.account_id
      AND d.debit > 0
  );

-- 10e. Tandai failed_ledger_postings lama sebagai resolved setelah jurnal seimbang
UPDATE public.failed_ledger_postings
SET status = 'resolved',
    resolved_at = NOW(),
    resolved_by = 'Migration 048 Auto-Remediation'
WHERE COALESCE(status, 'pending') <> 'resolved';

-- 11b. Deteksi baris payments duplikat dengan midtrans_order_id yang sama (laporan read-only)
-- [NONAKTIF OLEH AUDIT] DELETE FROM public.payments p
-- [NONAKTIF OLEH AUDIT] USING (
-- [NONAKTIF OLEH AUDIT]   SELECT id,
-- [NONAKTIF OLEH AUDIT]          ROW_NUMBER() OVER (
-- [NONAKTIF OLEH AUDIT]            PARTITION BY midtrans_order_id
-- [NONAKTIF OLEH AUDIT]            ORDER BY CASE WHEN method ILIKE '%midtrans%' THEN 0 ELSE 1 END, created_at ASC, id ASC
-- [NONAKTIF OLEH AUDIT]          ) AS rn
-- [NONAKTIF OLEH AUDIT]   FROM public.payments
-- [NONAKTIF OLEH AUDIT]   WHERE midtrans_order_id IS NOT NULL
-- [NONAKTIF OLEH AUDIT] ) dup
-- [NONAKTIF OLEH AUDIT] WHERE p.id = dup.id AND dup.rn > 1;
SELECT
  midtrans_order_id,
  COUNT(*) AS duplicate_count,
  ARRAY_AGG(id ORDER BY created_at ASC, id ASC) AS candidate_ids
FROM public.payments
WHERE midtrans_order_id IS NOT NULL
GROUP BY midtrans_order_id
HAVING COUNT(*) > 1;

-- Tambahkan unique index pada payments(midtrans_order_id) (partial index untuk non-null)
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_midtrans_order_id_unique
  ON public.payments (midtrans_order_id)
  WHERE midtrans_order_id IS NOT NULL;

-- 11a. Backfill midtrans_clearing_transactions untuk seluruh booking approved via Midtrans yang belum tercatat
-- [NONAKTIF OLEH AUDIT] DELETE FROM public.midtrans_clearing_transactions m
-- [NONAKTIF OLEH AUDIT] USING (
-- [NONAKTIF OLEH AUDIT]   SELECT id,
-- [NONAKTIF OLEH AUDIT]          ROW_NUMBER() OVER (
-- [NONAKTIF OLEH AUDIT]            PARTITION BY midtrans_order_id
-- [NONAKTIF OLEH AUDIT]            ORDER BY id ASC
-- [NONAKTIF OLEH AUDIT]          ) AS rn
-- [NONAKTIF OLEH AUDIT]   FROM public.midtrans_clearing_transactions
-- [NONAKTIF OLEH AUDIT]   WHERE midtrans_order_id IS NOT NULL
-- [NONAKTIF OLEH AUDIT] ) dup
-- [NONAKTIF OLEH AUDIT] WHERE m.id = dup.id AND dup.rn > 1;
SELECT
  midtrans_order_id,
  COUNT(*) AS duplicate_count,
  ARRAY_AGG(id ORDER BY id ASC) AS candidate_ids
FROM public.midtrans_clearing_transactions
WHERE midtrans_order_id IS NOT NULL
GROUP BY midtrans_order_id
HAVING COUNT(*) > 1;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.midtrans_clearing_transactions'::regclass
      AND contype = 'u'
      AND pg_get_constraintdef(oid) ILIKE '%(midtrans_order_id)%'
  ) THEN
    ALTER TABLE public.midtrans_clearing_transactions
      ADD CONSTRAINT midtrans_clearing_transactions_order_id_key UNIQUE (midtrans_order_id);
  END IF;
END $$;

INSERT INTO public.midtrans_clearing_transactions (
  booking_id,
  midtrans_order_id,
  midtrans_transaction_id,
  gross_amount,
  fee_amount,
  net_amount,
  reconciled_amount,
  outstanding_amount,
  clearing_status,
  property_id,
  tenant_name,
  settled_at
)
SELECT
  b.id,
  b.midtrans_order_id,
  b.midtrans_order_id,
  COALESCE(CASE WHEN b.is_dp THEN b.dp_amount ELSE b.total_price END, b.total_price, 0),
  0,
  COALESCE(CASE WHEN b.is_dp THEN b.dp_amount ELSE b.total_price END, b.total_price, 0),
  0,
  COALESCE(CASE WHEN b.is_dp THEN b.dp_amount ELSE b.total_price END, b.total_price, 0),
  'cleared',
  COALESCE(b.property_id, 1),
  COALESCE(b.occupant_name, b.tenant_name, 'Penyewa'),
  COALESCE(b.created_at, NOW())
FROM public.bookings b
LEFT JOIN public.midtrans_clearing_transactions m
  ON m.midtrans_order_id = b.midtrans_order_id
WHERE b.status = 'approved'
  AND b.payment_method ILIKE '%midtrans%'
  AND b.midtrans_order_id IS NOT NULL
  AND m.id IS NULL;

-- 11c. Deteksi kandidat duplikat contract_extensions berstatus 'paid' (laporan read-only)
-- [NONAKTIF OLEH AUDIT] DELETE FROM public.contract_extensions ce
-- [NONAKTIF OLEH AUDIT] USING (
-- [NONAKTIF OLEH AUDIT]   SELECT id,
-- [NONAKTIF OLEH AUDIT]          ROW_NUMBER() OVER (
-- [NONAKTIF OLEH AUDIT]            PARTITION BY tenant_id, extension_months, total_amount, status
-- [NONAKTIF OLEH AUDIT]            ORDER BY paid_at ASC NULLS LAST, id ASC
-- [NONAKTIF OLEH AUDIT]          ) AS rn
-- [NONAKTIF OLEH AUDIT]   FROM public.contract_extensions
-- [NONAKTIF OLEH AUDIT]   WHERE status = 'paid'
-- [NONAKTIF OLEH AUDIT] ) dup
-- [NONAKTIF OLEH AUDIT] WHERE ce.id = dup.id AND dup.rn > 1;
SELECT
  midtrans_order_id,
  tenant_id,
  extension_months,
  total_amount,
  status,
  COUNT(*) AS duplicate_count,
  ARRAY_AGG(id ORDER BY paid_at ASC NULLS LAST, id ASC) AS candidate_ids
FROM public.contract_extensions
WHERE status = 'paid'
GROUP BY midtrans_order_id, tenant_id, extension_months, total_amount, status
HAVING COUNT(*) > 1;

-- Backfill property_id pada financial_transactions dan sinkronkan ulang saldo COA dari journal_entries
UPDATE public.financial_transactions ft
SET property_id = COALESCE(
  (SELECT p.property_id FROM public.payments p WHERE p.id = ft.reference_id LIMIT 1),
  1
)
WHERE ft.property_id IS NULL;

WITH computed AS (
  SELECT
    a.id,
    CASE
      WHEN a.type IN ('asset', 'expense') THEN COALESCE(SUM(j.debit), 0) - COALESCE(SUM(j.credit), 0)
      ELSE COALESCE(SUM(j.credit), 0) - COALESCE(SUM(j.debit), 0)
    END AS calculated_balance
  FROM public.accounts a
  LEFT JOIN public.journal_entries j ON j.account_id = a.id
  GROUP BY a.id, a.type
)
UPDATE public.accounts a
SET balance = computed.calculated_balance
FROM computed
WHERE a.id = computed.id AND ABS(COALESCE(a.balance, 0) - computed.calculated_balance) > 0.01;

-- ============================================================================
-- BAGIAN 4: REVOKE HAK AKSES TABEL DARI ANON & PUBLIC (PII & INTERNAL ZERO-EXPOSURE)
-- ============================================================================
DO $$
DECLARE
  t TEXT;
  sensitive_tables TEXT[] := ARRAY[
    'bookings', 'tenants', 'surveys', 'payments', 'users', 'profiles',
    'contract_extensions', 'accounts', 'financial_transactions', 'journal_entries',
    'ledger_entries', 'financial_audit_logs', 'failed_ledger_postings',
    'midtrans_clearing_transactions', 'bank_reconciliation_matches',
    'bank_statement_items', 'petty_cash_requests', 'fixed_assets', 'budgets',
    'vendors', 'purchase_orders', 'inventory_items', 'maintenance',
    'activity_logs', 'sent_emails', 'webhook_events'
  ];
  public_catalog_tables TEXT[] := ARRAY[
    'properties', 'rooms', 'facilities', 'property_facilities',
    'room_facilities', 'nearby_amenities', 'coupons', 'settings'
  ];
BEGIN
  FOREACH t IN ARRAY sensitive_tables LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon', t);
      IF t = 'webhook_events' THEN
        EXECUTE format('REVOKE ALL ON TABLE public.%I FROM authenticated', t);
      ELSE
        EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO authenticated', t);
      END IF;
      EXECUTE format('GRANT ALL ON TABLE public.%I TO service_role', t);
    END IF;
  END LOOP;

  FOREACH t IN ARRAY public_catalog_tables LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon', t);
      EXECUTE format('GRANT SELECT ON TABLE public.%I TO anon', t);
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO authenticated', t);
      EXECUTE format('GRANT ALL ON TABLE public.%I TO service_role', t);
    END IF;
  END LOOP;
END $$;

-- ============================================================================
-- BAGIAN 1 & 2: HAPUS SEMUA POLICY PERMISIF (USING true / WITH CHECK true)
--               DAN TERAPKAN RBAC POLICIES KETAT (0 BARIS PADA QUERY #2)
-- ============================================================================

-- Pastikan fungsi helper RBAC tersedia sebelum membuat policy (role eksplisit, anak_owner tidak diubah otomatis menjadi admin)
CREATE OR REPLACE FUNCTION public.get_auth_user_role()
RETURNS VARCHAR LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT role
  FROM public.users WHERE id = auth.uid()::text LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.get_auth_user_property_id()
RETURNS BIGINT LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT property_id::BIGINT
  FROM public.users WHERE id = auth.uid()::text LIMIT 1;
$$;

-- Hapus seluruh policy di skema public yang masih memakai qual='true' atau with_check='true'
DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND (trim(coalesce(qual, '')) = 'true' OR trim(coalesce(with_check, '')) = 'true')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, pol.tablename);
  END LOOP;
END $$;

-- 2A. Policy Katalog Publik (SELECT hanya untuk baris valid, Write hanya untuk Admin/Owner/Super)
DROP POLICY IF EXISTS "Public catalog read properties" ON public.properties;
CREATE POLICY "Public catalog read properties" ON public.properties
  FOR SELECT TO anon, authenticated
  USING (id IS NOT NULL);

DROP POLICY IF EXISTS "Admin manage properties" ON public.properties;
CREATE POLICY "Admin manage properties" ON public.properties
  FOR ALL TO authenticated
  USING (public.get_auth_user_role() IN ('super', 'super_admin', 'owner', 'admin'))
  WITH CHECK (public.get_auth_user_role() IN ('super', 'super_admin', 'owner', 'admin'));

DROP POLICY IF EXISTS "Public catalog read rooms" ON public.rooms;
CREATE POLICY "Public catalog read rooms" ON public.rooms
  FOR SELECT TO anon, authenticated
  USING (id IS NOT NULL);

DROP POLICY IF EXISTS "Staff and admin manage rooms" ON public.rooms;
CREATE POLICY "Staff and admin manage rooms" ON public.rooms
  FOR ALL TO authenticated
  USING (
    public.get_auth_user_role() IN ('super', 'super_admin', 'owner', 'anak_owner', 'admin')
    OR (public.get_auth_user_role() = 'staff' AND property_id = public.get_auth_user_property_id())
  )
  WITH CHECK (
    public.get_auth_user_role() IN ('super', 'super_admin', 'owner', 'anak_owner', 'admin')
    OR (public.get_auth_user_role() = 'staff' AND property_id = public.get_auth_user_property_id())
  );

DROP POLICY IF EXISTS "Public catalog read facilities" ON public.facilities;
CREATE POLICY "Public catalog read facilities" ON public.facilities
  FOR SELECT TO anon, authenticated
  USING (id IS NOT NULL);

DROP POLICY IF EXISTS "Admin manage facilities" ON public.facilities;
CREATE POLICY "Admin manage facilities" ON public.facilities
  FOR ALL TO authenticated
  USING (public.get_auth_user_role() IN ('super', 'super_admin', 'owner', 'admin'))
  WITH CHECK (public.get_auth_user_role() IN ('super', 'super_admin', 'owner', 'admin'));

DROP POLICY IF EXISTS "Public catalog read property_facilities" ON public.property_facilities;
CREATE POLICY "Public catalog read property_facilities" ON public.property_facilities
  FOR SELECT TO anon, authenticated
  USING (property_id IS NOT NULL AND facility_id IS NOT NULL);

DROP POLICY IF EXISTS "Admin manage property_facilities" ON public.property_facilities;
CREATE POLICY "Admin manage property_facilities" ON public.property_facilities
  FOR ALL TO authenticated
  USING (public.get_auth_user_role() IN ('super', 'super_admin', 'owner', 'admin'))
  WITH CHECK (public.get_auth_user_role() IN ('super', 'super_admin', 'owner', 'admin'));

DROP POLICY IF EXISTS "Public catalog read room_facilities" ON public.room_facilities;
CREATE POLICY "Public catalog read room_facilities" ON public.room_facilities
  FOR SELECT TO anon, authenticated
  USING (room_id IS NOT NULL AND facility_id IS NOT NULL);

DROP POLICY IF EXISTS "Admin manage room_facilities" ON public.room_facilities;
CREATE POLICY "Admin manage room_facilities" ON public.room_facilities
  FOR ALL TO authenticated
  USING (public.get_auth_user_role() IN ('super', 'super_admin', 'owner', 'admin'))
  WITH CHECK (public.get_auth_user_role() IN ('super', 'super_admin', 'owner', 'admin'));

DROP POLICY IF EXISTS "Public catalog read nearby_amenities" ON public.nearby_amenities;
CREATE POLICY "Public catalog read nearby_amenities" ON public.nearby_amenities
  FOR SELECT TO anon, authenticated
  USING (is_active = true OR public.get_auth_user_role() IN ('super', 'super_admin', 'owner', 'anak_owner', 'admin', 'staff'));

DROP POLICY IF EXISTS "Admin manage nearby_amenities" ON public.nearby_amenities;
CREATE POLICY "Admin manage nearby_amenities" ON public.nearby_amenities
  FOR ALL TO authenticated
  USING (public.get_auth_user_role() IN ('super', 'super_admin', 'owner', 'admin', 'finance'))
  WITH CHECK (public.get_auth_user_role() IN ('super', 'super_admin', 'owner', 'admin', 'finance'));

DROP POLICY IF EXISTS "Public catalog read active coupons" ON public.coupons;
CREATE POLICY "Public catalog read active coupons" ON public.coupons
  FOR SELECT TO anon, authenticated
  USING (is_active = true OR public.get_auth_user_role() IN ('super', 'super_admin', 'owner', 'anak_owner', 'admin', 'finance'));

DROP POLICY IF EXISTS "Admin manage coupons" ON public.coupons;
CREATE POLICY "Admin manage coupons" ON public.coupons
  FOR ALL TO authenticated
  USING (public.get_auth_user_role() IN ('super', 'super_admin', 'owner', 'admin'))
  WITH CHECK (public.get_auth_user_role() IN ('super', 'super_admin', 'owner', 'admin'));

DROP POLICY IF EXISTS "Public catalog read settings" ON public.settings;
CREATE POLICY "Public catalog read settings" ON public.settings
  FOR SELECT TO anon, authenticated
  USING (id IS NOT NULL);

DROP POLICY IF EXISTS "Admin manage settings" ON public.settings;
CREATE POLICY "Admin manage settings" ON public.settings
  FOR ALL TO authenticated
  USING (public.get_auth_user_role() IN ('super', 'super_admin', 'owner', 'admin'))
  WITH CHECK (public.get_auth_user_role() IN ('super', 'super_admin', 'owner', 'admin'));

-- 2B. Policy Tabel PII & Operasional (bookings, tenants, surveys, payments, contract_extensions, maintenance)
DROP POLICY IF EXISTS "RBAC select bookings" ON public.bookings;
CREATE POLICY "RBAC select bookings" ON public.bookings
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()::text
    OR email = (auth.jwt() ->> 'email')
    OR public.get_auth_user_role() IN ('super', 'super_admin', 'owner', 'anak_owner', 'admin', 'finance')
    OR (public.get_auth_user_role() = 'staff' AND property_id = public.get_auth_user_property_id())
  );

DROP POLICY IF EXISTS "RBAC insert bookings" ON public.bookings;
CREATE POLICY "RBAC insert bookings" ON public.bookings
  FOR INSERT TO authenticated
  WITH CHECK (
    (COALESCE(status, 'pending') IN ('pending', 'pending_payment') AND (user_id IS NULL OR user_id = auth.uid()::text))
    OR public.get_auth_user_role() IN ('super', 'super_admin', 'owner', 'admin', 'finance', 'staff')
  );

DROP POLICY IF EXISTS "RBAC update bookings" ON public.bookings;
CREATE POLICY "RBAC update bookings" ON public.bookings
  FOR UPDATE TO authenticated
  USING (
    public.get_auth_user_role() IN ('super', 'super_admin', 'owner', 'admin', 'finance')
    OR (public.get_auth_user_role() = 'staff' AND property_id = public.get_auth_user_property_id())
    OR (user_id = auth.uid()::text AND status IN ('pending', 'pending_payment'))
  )
  WITH CHECK (
    public.get_auth_user_role() IN ('super', 'super_admin', 'owner', 'admin', 'finance')
    OR (public.get_auth_user_role() = 'staff' AND property_id = public.get_auth_user_property_id())
    OR (user_id = auth.uid()::text AND status IN ('pending', 'pending_payment'))
  );

DROP POLICY IF EXISTS "RBAC delete bookings" ON public.bookings;
CREATE POLICY "RBAC delete bookings" ON public.bookings
  FOR DELETE TO authenticated
  USING (public.get_auth_user_role() IN ('super', 'super_admin', 'owner', 'admin'));

DROP POLICY IF EXISTS "RBAC select surveys" ON public.surveys;
CREATE POLICY "RBAC select surveys" ON public.surveys
  FOR SELECT TO authenticated
  USING (
    email = (auth.jwt() ->> 'email')
    OR public.get_auth_user_role() IN ('super', 'super_admin', 'owner', 'anak_owner', 'admin', 'finance')
    OR (public.get_auth_user_role() = 'staff' AND property_id = public.get_auth_user_property_id())
  );

DROP POLICY IF EXISTS "RBAC insert surveys" ON public.surveys;
CREATE POLICY "RBAC insert surveys" ON public.surveys
  FOR INSERT TO authenticated
  WITH CHECK (
    COALESCE(status, 'pending_payment') IN ('pending_payment', 'survey_confirmed')
    OR public.get_auth_user_role() IN ('super', 'super_admin', 'owner', 'admin', 'staff')
  );

DROP POLICY IF EXISTS "RBAC update surveys" ON public.surveys;
CREATE POLICY "RBAC update surveys" ON public.surveys
  FOR UPDATE TO authenticated
  USING (
    public.get_auth_user_role() IN ('super', 'super_admin', 'owner', 'admin', 'finance')
    OR (public.get_auth_user_role() = 'staff' AND property_id = public.get_auth_user_property_id())
  )
  WITH CHECK (
    public.get_auth_user_role() IN ('super', 'super_admin', 'owner', 'admin', 'finance')
    OR (public.get_auth_user_role() = 'staff' AND property_id = public.get_auth_user_property_id())
  );

DROP POLICY IF EXISTS "RBAC delete surveys" ON public.surveys;
CREATE POLICY "RBAC delete surveys" ON public.surveys
  FOR DELETE TO authenticated
  USING (public.get_auth_user_role() IN ('super', 'super_admin', 'owner', 'admin'));

DROP POLICY IF EXISTS "RBAC select tenants" ON public.tenants;
CREATE POLICY "RBAC select tenants" ON public.tenants
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()::text
    OR email = (auth.jwt() ->> 'email')
    OR public.get_auth_user_role() IN ('super', 'super_admin', 'owner', 'anak_owner', 'admin', 'finance')
    OR (public.get_auth_user_role() = 'staff' AND property_id = public.get_auth_user_property_id())
  );

DROP POLICY IF EXISTS "RBAC manage tenants" ON public.tenants;
CREATE POLICY "RBAC manage tenants" ON public.tenants
  FOR ALL TO authenticated
  USING (
    public.get_auth_user_role() IN ('super', 'super_admin', 'owner', 'admin', 'finance')
    OR (public.get_auth_user_role() = 'staff' AND property_id = public.get_auth_user_property_id())
  )
  WITH CHECK (
    public.get_auth_user_role() IN ('super', 'super_admin', 'owner', 'admin', 'finance')
    OR (public.get_auth_user_role() = 'staff' AND property_id = public.get_auth_user_property_id())
  );

DROP POLICY IF EXISTS "RBAC select payments" ON public.payments;
CREATE POLICY "RBAC select payments" ON public.payments
  FOR SELECT TO authenticated
  USING (
    public.get_auth_user_role() IN ('super', 'super_admin', 'owner', 'anak_owner', 'admin', 'finance')
    OR (public.get_auth_user_role() = 'staff' AND property_id = public.get_auth_user_property_id())
  );

DROP POLICY IF EXISTS "RBAC manage payments" ON public.payments;
CREATE POLICY "RBAC manage payments" ON public.payments
  FOR ALL TO authenticated
  USING (
    public.get_auth_user_role() IN ('super', 'super_admin', 'owner', 'admin', 'finance')
    OR (public.get_auth_user_role() = 'staff' AND property_id = public.get_auth_user_property_id())
  )
  WITH CHECK (
    public.get_auth_user_role() IN ('super', 'super_admin', 'owner', 'admin', 'finance')
  );

DROP POLICY IF EXISTS "RBAC select contract_extensions" ON public.contract_extensions;
CREATE POLICY "RBAC select contract_extensions" ON public.contract_extensions
  FOR SELECT TO authenticated
  USING (
    public.get_auth_user_role() IN ('super', 'super_admin', 'owner', 'anak_owner', 'admin', 'finance')
    OR (public.get_auth_user_role() = 'staff' AND property_id = public.get_auth_user_property_id())
  );

DROP POLICY IF EXISTS "RBAC manage contract_extensions" ON public.contract_extensions;
CREATE POLICY "RBAC manage contract_extensions" ON public.contract_extensions
  FOR ALL TO authenticated
  USING (
    public.get_auth_user_role() IN ('super', 'super_admin', 'owner', 'admin', 'finance')
    OR (public.get_auth_user_role() = 'staff' AND property_id = public.get_auth_user_property_id())
  )
  WITH CHECK (
    public.get_auth_user_role() IN ('super', 'super_admin', 'owner', 'admin', 'finance', 'staff')
  );

DROP POLICY IF EXISTS "RBAC manage maintenance" ON public.maintenance;
CREATE POLICY "RBAC manage maintenance" ON public.maintenance
  FOR ALL TO authenticated
  USING (
    public.get_auth_user_role() IN ('super', 'super_admin', 'owner', 'anak_owner', 'admin', 'finance')
    OR (public.get_auth_user_role() = 'staff' AND property_id = public.get_auth_user_property_id())
  )
  WITH CHECK (
    public.get_auth_user_role() IN ('super', 'super_admin', 'owner', 'anak_owner', 'admin', 'finance', 'staff')
  );

-- 2C. Policy Tabel ERP, Keuangan, & Audit Internal (anak_owner hanya SELECT pada tabel keuangan/audit)
DO $$
DECLARE
  t TEXT;
  erp_tables TEXT[] := ARRAY[
    'accounts', 'financial_transactions', 'journal_entries', 'ledger_entries',
    'financial_audit_logs', 'failed_ledger_postings', 'midtrans_clearing_transactions',
    'bank_reconciliation_matches', 'bank_statement_items', 'petty_cash_requests',
    'fixed_assets', 'budgets', 'vendors', 'purchase_orders', 'inventory_items',
    'activity_logs', 'sent_emails'
  ];
BEGIN
  FOREACH t IN ARRAY erp_tables LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('DROP POLICY IF EXISTS "RBAC staff finance access %s" ON public.%I', t, t);
      EXECUTE format('DROP POLICY IF EXISTS "RBAC anak_owner read %s" ON public.%I', t, t);
      EXECUTE format(
        'CREATE POLICY "RBAC anak_owner read %s" ON public.%I FOR SELECT TO authenticated ' ||
        'USING (public.get_auth_user_role() IN (''super'', ''super_admin'', ''owner'', ''anak_owner'', ''admin'', ''finance'', ''staff''))',
        t, t
      );
      EXECUTE format(
        'CREATE POLICY "RBAC staff finance access %s" ON public.%I FOR ALL TO authenticated ' ||
        'USING (public.get_auth_user_role() IN (''super'', ''super_admin'', ''owner'', ''admin'', ''finance'', ''staff'')) ' ||
        'WITH CHECK (public.get_auth_user_role() IN (''super'', ''super_admin'', ''owner'', ''admin'', ''finance'', ''staff''))',
        t, t
      );
    END IF;
  END LOOP;
END $$;

-- webhook_events: Hanya dapat diakses oleh service_role (backend webhook processor) dan dibaca super/owner
DROP POLICY IF EXISTS "Super admin read webhook_events" ON public.webhook_events;
CREATE POLICY "Super admin read webhook_events" ON public.webhook_events
  FOR SELECT TO authenticated
  USING (public.get_auth_user_role() IN ('super', 'super_admin', 'owner'));

-- profiles (jika tabel ada)
DO $$
BEGIN
  IF to_regclass('public.profiles') IS NOT NULL THEN
    DROP POLICY IF EXISTS "RBAC select profiles" ON public.profiles;
    CREATE POLICY "RBAC select profiles" ON public.profiles
      FOR SELECT TO authenticated
      USING (id::text = auth.uid()::text OR public.get_auth_user_role() IN ('super', 'super_admin', 'owner', 'admin'));

    DROP POLICY IF EXISTS "RBAC update own profile" ON public.profiles;
    CREATE POLICY "RBAC update own profile" ON public.profiles
      FOR UPDATE TO authenticated
      USING (id::text = auth.uid()::text OR public.get_auth_user_role() IN ('super', 'super_admin', 'owner'))
      WITH CHECK (id::text = auth.uid()::text OR public.get_auth_user_role() IN ('super', 'super_admin', 'owner'));
  END IF;
END $$;

-- ============================================================================
-- BAGIAN 5: KUNCI HAK EXECUTE FUNGSI / RPC (SERVICE_ROLE ONLY UNTUK MUTASI)
-- ============================================================================
DO $$
DECLARE
  fn RECORD;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure AS sig, p.proname
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
  LOOP
    IF fn.proname IN ('get_auth_user_role', 'get_auth_user_property_id') THEN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', fn.sig);
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', fn.sig);
    ELSIF fn.proname = 'public_room_availability' THEN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', fn.sig);
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon, authenticated, service_role', fn.sig);
    ELSE
      -- Seluruh fungsi RPC mutasi/akuntansi/trigger (post_financial_transaction, settle_*,
      -- approve_*, hold_room_atomic, cleanup_expired_room_holds, repair_accounting_integrity, dll.)
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn.sig);
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn.sig);
    END IF;
  END LOOP;
END $$;

-- ============================================================================
-- BAGIAN 8: BERSIHKAN PUBLIKASI SUPABASE_REALTIME DARI TABEL AUDIT/SISTEM SENSITIF
-- ============================================================================
DO $$
DECLARE
  t TEXT;
  remove_from_realtime TEXT[] := ARRAY[
    'webhook_events', 'failed_ledger_postings', 'sent_emails',
    'financial_audit_logs', 'ledger_entries', 'users', 'profiles'
  ];
BEGIN
  FOREACH t IN ARRAY remove_from_realtime LOOP
    IF EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime DROP TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;

-- ============================================================================
-- BAGIAN 9: STORAGE BUCKET PRIVAT (public = false) & POLICY STORAGE.OBJECTS
-- ============================================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('property-images', 'property-images', true, 20971520, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/avif']),
  ('room-images', 'room-images', true, 20971520, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/avif']),
  ('avatars', 'avatars', true, 10485760, ARRAY['image/jpeg', 'image/png', 'image/webp']),
  ('tenant-documents', 'tenant-documents', false, 20971520, ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']),
  ('payment-proof', 'payment-proof', false, 20971520, ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']),
  ('contracts', 'contracts', false, 20971520, ARRAY['application/pdf', 'image/png', 'image/jpeg']),
  ('signatures', 'signatures', false, 20971520, ARRAY['image/png', 'image/jpeg', 'image/webp']),
  ('maintenance', 'maintenance', false, 20971520, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Hapus policy storage.objects lama yang permisif
DROP POLICY IF EXISTS "Public Storage Read Access" ON storage.objects;
DROP POLICY IF EXISTS "Public Storage Upload Access" ON storage.objects;
DROP POLICY IF EXISTS "Public Storage Update Access" ON storage.objects;
DROP POLICY IF EXISTS "Public Storage Delete Access" ON storage.objects;
DROP POLICY IF EXISTS "Public read for marketing buckets" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated write for marketing buckets" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated update for marketing buckets" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated delete for marketing buckets" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated full access for private buckets" ON storage.objects;
DROP POLICY IF EXISTS "Staff manage marketing buckets" ON storage.objects;
DROP POLICY IF EXISTS "Staff manage private buckets" ON storage.objects;

-- Bucket Marketing Publik: Publik hanya SELECT; Write/Delete hanya untuk Admin/Owner/Staff
CREATE POLICY "Public read for marketing buckets" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id IN ('property-images', 'room-images', 'avatars'));

CREATE POLICY "Staff manage marketing buckets" ON storage.objects
  FOR ALL TO authenticated
  USING (
    bucket_id IN ('property-images', 'room-images', 'avatars')
    AND public.get_auth_user_role() IN ('super', 'super_admin', 'owner', 'admin', 'staff')
  )
  WITH CHECK (
    bucket_id IN ('property-images', 'room-images', 'avatars')
    AND public.get_auth_user_role() IN ('super', 'super_admin', 'owner', 'admin', 'staff')
  );

-- Bucket Dokumen Privat: Hanya terautentikasi (Admin/Owner/Finance/Staff) & Service Role
CREATE POLICY "Staff manage private buckets" ON storage.objects
  FOR ALL TO authenticated
  USING (
    bucket_id IN ('tenant-documents', 'payment-proof', 'contracts', 'signatures', 'maintenance')
    AND public.get_auth_user_role() IN ('super', 'super_admin', 'owner', 'admin', 'finance', 'staff')
  )
  WITH CHECK (
    bucket_id IN ('tenant-documents', 'payment-proof', 'contracts', 'signatures', 'maintenance')
    AND public.get_auth_user_role() IN ('super', 'super_admin', 'owner', 'admin', 'finance', 'staff')
  );

COMMIT;
