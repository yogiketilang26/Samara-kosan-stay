-- ====================================================================
-- SAMARA STAY ERP v14 — MIGRATION 023: MIDTRANS CLEARING & BANK RECONCILIATION
-- ====================================================================

-- 1. SEED / UPSERT MANDATORY CLEARING & GATEWAY FEE COA ACCOUNTS
INSERT INTO public.accounts (id, name, type, balance) VALUES
  (1200, 'Piutang Kliring Midtrans (Gateway Clearing)', 'asset', 0),
  (1300, 'Hutang Titipan Uang Muka / Deposit Survey', 'liability', 0),
  (5030, 'Biaya Layanan Midtrans / Payment Gateway', 'expense', 0)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  type = EXCLUDED.type;


-- 2. CREATE TABLE MIDTRANS_CLEARING_TRANSACTIONS
CREATE TABLE IF NOT EXISTS public.midtrans_clearing_transactions (
  id bigint NOT NULL DEFAULT nextval('midtrans_clearing_transactions_id_seq'::regclass),
  payment_id character varying,
  booking_id bigint,
  survey_id bigint,
  contract_extension_id bigint,
  midtrans_order_id character varying NOT NULL UNIQUE,
  midtrans_transaction_id character varying,
  gross_amount numeric(15, 2) NOT NULL DEFAULT 0,
  fee_amount numeric(15, 2) NOT NULL DEFAULT 0,
  net_amount numeric(15, 2) NOT NULL DEFAULT 0,
  reconciled_amount numeric(15, 2) NOT NULL DEFAULT 0,
  outstanding_amount numeric(15, 2) NOT NULL DEFAULT 0,
  clearing_status character varying NOT NULL DEFAULT 'pending'::character varying 
    CHECK (clearing_status::text = ANY (ARRAY['pending'::text, 'cleared'::text, 'partially_cleared'::text, 'reconciled'::text, 'disputed'::text])),
  property_id integer REFERENCES public.properties(id) ON DELETE SET NULL,
  tenant_name character varying,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
  settled_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
  CONSTRAINT midtrans_clearing_transactions_pkey PRIMARY KEY (id)
);

CREATE SEQUENCE IF NOT EXISTS midtrans_clearing_transactions_id_seq START WITH 1 INCREMENT BY 1;
ALTER TABLE public.midtrans_clearing_transactions 
  ALTER COLUMN id SET DEFAULT nextval('midtrans_clearing_transactions_id_seq'::regclass);

CREATE INDEX IF NOT EXISTS idx_midtrans_clearing_order_id ON public.midtrans_clearing_transactions(midtrans_order_id);
CREATE INDEX IF NOT EXISTS idx_midtrans_clearing_property_id ON public.midtrans_clearing_transactions(property_id);
CREATE INDEX IF NOT EXISTS idx_midtrans_clearing_status ON public.midtrans_clearing_transactions(clearing_status);


-- 3. CREATE TABLE BANK_RECONCILIATION_MATCHES
CREATE TABLE IF NOT EXISTS public.bank_reconciliation_matches (
  id bigint NOT NULL DEFAULT nextval('bank_reconciliation_matches_id_seq'::regclass),
  bank_statement_id bigint NOT NULL REFERENCES public.bank_statement_items(id) ON DELETE CASCADE,
  clearing_transaction_id bigint NOT NULL REFERENCES public.midtrans_clearing_transactions(id) ON DELETE CASCADE,
  matched_amount numeric(15, 2) NOT NULL DEFAULT 0,
  fee_amount numeric(15, 2) NOT NULL DEFAULT 0,
  difference_amount numeric(15, 2) NOT NULL DEFAULT 0,
  adjustment_category character varying DEFAULT 'Midtrans Gateway Fee'::character varying,
  status character varying NOT NULL DEFAULT 'matched'::character varying
    CHECK (status::text = ANY (ARRAY['matched'::text, 'partially_matched'::text, 'unmatched'::text, 'exception'::text])),
  notes text,
  created_by character varying NOT NULL DEFAULT 'System (Reconciliation Engine)'::character varying,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
  property_id integer REFERENCES public.properties(id) ON DELETE SET NULL,
  CONSTRAINT bank_reconciliation_matches_pkey PRIMARY KEY (id)
);

CREATE SEQUENCE IF NOT EXISTS bank_reconciliation_matches_id_seq START WITH 1 INCREMENT BY 1;
ALTER TABLE public.bank_reconciliation_matches 
  ALTER COLUMN id SET DEFAULT nextval('bank_reconciliation_matches_id_seq'::regclass);

CREATE INDEX IF NOT EXISTS idx_bank_rec_matches_stmt ON public.bank_reconciliation_matches(bank_statement_id);
CREATE INDEX IF NOT EXISTS idx_bank_rec_matches_clearing ON public.bank_reconciliation_matches(clearing_transaction_id);


-- 4. ATOMIC RECONCILIATION STORED PROCEDURE: reconcile_bank_statement_entry
CREATE OR REPLACE FUNCTION reconcile_bank_statement_entry(
  p_bank_statement_id BIGINT,
  p_clearing_id BIGINT,
  p_reconciled_amount NUMERIC(15, 2),
  p_fee_amount NUMERIC(15, 2) DEFAULT 0,
  p_created_by VARCHAR(100) DEFAULT 'Finance Administrator',
  p_notes TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bank_stmt RECORD;
  v_clearing RECORD;
  v_trx_no_bank VARCHAR(50);
  v_trx_no_fee VARCHAR(50);
  v_match_id BIGINT;
  v_diff NUMERIC(15, 2);
  v_new_reconciled NUMERIC(15, 2);
  v_new_outstanding NUMERIC(15, 2);
  v_new_status VARCHAR(50);
BEGIN
  -- 1. Lock and fetch bank statement & clearing records
  SELECT * INTO v_bank_stmt FROM bank_statement_items WHERE id = p_bank_statement_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Bank statement record not found');
  END IF;

  SELECT * INTO v_clearing FROM midtrans_clearing_transactions WHERE id = p_clearing_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Midtrans clearing record not found');
  END IF;

  IF v_clearing.clearing_status = 'reconciled' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Clearing record is already fully reconciled');
  END IF;

  v_diff := (v_clearing.gross_amount - p_fee_amount) - p_reconciled_amount;
  v_new_reconciled := v_clearing.reconciled_amount + p_reconciled_amount;
  v_new_outstanding := GREATEST(0, v_clearing.gross_amount - v_new_reconciled - COALESCE(p_fee_amount, 0));

  IF v_new_outstanding <= 0 THEN
    v_new_status := 'reconciled';
  ELSE
    v_new_status := 'partially_cleared';
  END IF;

  -- 2. Post Financial Journal: DR 1010 (Kas Utama Bank Mandiri) & CR 1200 (Midtrans Clearing)
  v_trx_no_bank := 'TRX-REC-BNK-' || TO_CHAR(CURRENT_DATE, 'YYYYMMDD') || '-' || FLOOR(1000 + RANDOM() * 9000)::TEXT;
  PERFORM post_financial_transaction(
    v_trx_no_bank,
    CURRENT_DATE,
    'Rekonsiliasi Bank',
    'Penyelesaian Kliring Midtrans ke Bank Mandiri - Order #' || v_clearing.midtrans_order_id,
    p_reconciled_amount,
    'income',
    'bank_reconciliation',
    v_clearing.midtrans_order_id,
    p_created_by,
    1010, -- Debit: Bank Mandiri
    1200, -- Credit: Midtrans Clearing
    v_clearing.property_id
  );

  -- 3. If Midtrans Gateway Fee is recorded (> 0): DR 5030 (Biaya Layanan Midtrans) & CR 1200 (Midtrans Clearing)
  IF COALESCE(p_fee_amount, 0) > 0 THEN
    v_trx_no_fee := 'TRX-REC-FEE-' || TO_CHAR(CURRENT_DATE, 'YYYYMMDD') || '-' || FLOOR(1000 + RANDOM() * 9000)::TEXT;
    PERFORM post_financial_transaction(
      v_trx_no_fee,
      CURRENT_DATE,
      'Biaya Payment Gateway',
      'Beban Biaya Layanan Midtrans SNAP - Order #' || v_clearing.midtrans_order_id,
      p_fee_amount,
      'expense',
      'bank_reconciliation_fee',
      v_clearing.midtrans_order_id,
      p_created_by,
      5030, -- Debit: Biaya Payment Gateway
      1200, -- Credit: Midtrans Clearing
      v_clearing.property_id
    );
  END IF;

  -- 4. Update Clearing Transaction Status & Balances
  UPDATE midtrans_clearing_transactions
  SET fee_amount = COALESCE(fee_amount, 0) + COALESCE(p_fee_amount, 0),
      net_amount = gross_amount - (COALESCE(fee_amount, 0) + COALESCE(p_fee_amount, 0)),
      reconciled_amount = v_new_reconciled,
      outstanding_amount = v_new_outstanding,
      clearing_status = v_new_status
  WHERE id = p_clearing_id;

  -- 5. Update Bank Statement Item Status
  UPDATE bank_statement_items
  SET matched = true,
      matched_ref = v_clearing.midtrans_order_id
  WHERE id = p_bank_statement_id;

  -- 6. Record Reconciliation Match Audit Record
  INSERT INTO bank_reconciliation_matches (
    bank_statement_id,
    clearing_transaction_id,
    matched_amount,
    fee_amount,
    difference_amount,
    status,
    notes,
    created_by,
    property_id
  ) VALUES (
    p_bank_statement_id,
    p_clearing_id,
    p_reconciled_amount,
    COALESCE(p_fee_amount, 0),
    v_diff,
    'matched',
    p_notes,
    p_created_by,
    v_clearing.property_id
  ) RETURNING id INTO v_match_id;

  RETURN jsonb_build_object(
    'success', true,
    'match_id', v_match_id,
    'order_id', v_clearing.midtrans_order_id,
    'reconciled_amount', p_reconciled_amount,
    'fee_amount', COALESCE(p_fee_amount, 0),
    'new_status', v_new_status,
    'message', 'Bank statement entry successfully reconciled with Midtrans clearing'
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM,
    'code', SQLSTATE
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION reconcile_bank_statement_entry(BIGINT, BIGINT, NUMERIC, NUMERIC, VARCHAR, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION reconcile_bank_statement_entry(BIGINT, BIGINT, NUMERIC, NUMERIC, VARCHAR, TEXT) TO service_role;


-- 5. APPLY RLS POLICIES FOR CLEARING & RECONCILIATION TABLES
ALTER TABLE public.midtrans_clearing_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_reconciliation_matches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Scoped access for Midtrans Clearing" ON public.midtrans_clearing_transactions;
CREATE POLICY "Scoped access for Midtrans Clearing" ON public.midtrans_clearing_transactions
  FOR ALL TO authenticated
  USING (
    public.get_auth_user_role() IN ('super', 'super_admin', 'owner')
    OR (public.get_auth_user_role() = 'finance' AND public.get_auth_user_property_id() IS NULL)
    OR property_id IS NULL
    OR property_id = public.get_auth_user_property_id()
  );

DROP POLICY IF EXISTS "Scoped access for Bank Reconciliation Matches" ON public.bank_reconciliation_matches;
CREATE POLICY "Scoped access for Bank Reconciliation Matches" ON public.bank_reconciliation_matches
  FOR ALL TO authenticated
  USING (
    public.get_auth_user_role() IN ('super', 'super_admin', 'owner')
    OR (public.get_auth_user_role() = 'finance' AND public.get_auth_user_property_id() IS NULL)
    OR property_id IS NULL
    OR property_id = public.get_auth_user_property_id()
  );

GRANT ALL ON public.midtrans_clearing_transactions TO service_role;
GRANT ALL ON public.bank_reconciliation_matches TO service_role;
