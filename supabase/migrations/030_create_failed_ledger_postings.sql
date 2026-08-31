-- ====================================================================
-- SAMARA STAY ERP v16 — MIGRATION 030: CREATE FAILED LEDGER POSTINGS TABLE
-- ====================================================================
-- Tabel audit untuk merekam transaksi yang gagal membukukan jurnal akuntansi (double-entry).
-- Memungkinkan administrator dan tim finance untuk merekonsiliasi / auto-retry pembukuan.

CREATE TABLE IF NOT EXISTS public.failed_ledger_postings (
  id BIGSERIAL PRIMARY KEY,
  transaction_no VARCHAR(100),
  reference_type VARCHAR(50) NOT NULL, -- 'booking', 'survey', 'extension', 'manual_payment'
  reference_id VARCHAR(100) NOT NULL,
  amount NUMERIC(15, 2) NOT NULL DEFAULT 0,
  debit_account_id INT NOT NULL,
  credit_account_id INT NOT NULL,
  property_id BIGINT REFERENCES public.properties(id) ON DELETE SET NULL,
  created_by VARCHAR(100) DEFAULT 'System',
  error_message TEXT,
  status VARCHAR(30) DEFAULT 'pending', -- 'pending', 'resolved', 'ignored'
  resolved_at TIMESTAMPTZ,
  resolved_by VARCHAR(100),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexing for quick lookups
CREATE INDEX IF NOT EXISTS idx_failed_ledger_status ON public.failed_ledger_postings(status);
CREATE INDEX IF NOT EXISTS idx_failed_ledger_ref ON public.failed_ledger_postings(reference_type, reference_id);

-- Enable RLS
ALTER TABLE public.failed_ledger_postings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin full access for failed_ledger_postings" ON public.failed_ledger_postings;
CREATE POLICY "Admin full access for failed_ledger_postings" ON public.failed_ledger_postings
  FOR ALL TO authenticated
  USING (
    public.get_auth_user_role() IN ('super', 'super_admin', 'owner', 'admin', 'finance')
  )
  WITH CHECK (
    public.get_auth_user_role() IN ('super', 'super_admin', 'owner', 'admin', 'finance')
  );
