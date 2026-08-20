-- ==============================================================================
-- SAMARA STAY ERP v16 — PROPOSED DATABASE HARDENING MIGRATION
-- Migration File: 026_harden_schema_consistency.sql (PROPOSAL ONLY)
-- Status: PROPOSAL — REVIEW BEFORE EXECUTION
-- ==============================================================================

-- 1. HARDEN PAYMENT STATUS DEFAULT (Mencegah false 'paid' state)
ALTER TABLE public.payments 
  ALTER COLUMN status SET DEFAULT 'pending'::character varying;

ALTER TABLE public.contract_extensions 
  ALTER COLUMN status SET DEFAULT 'pending'::character varying,
  ALTER COLUMN paid_at DROP DEFAULT,
  ALTER COLUMN paid_at SET DEFAULT NULL;

-- 2. DUKUNGAN PROPERTY DIMENSION PADA SUB-OPERASIONAL (Branch Scoping)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'petty_cash_requests' AND column_name = 'property_id') THEN
    ALTER TABLE public.petty_cash_requests ADD COLUMN property_id integer REFERENCES public.properties(id) ON DELETE SET NULL;
    CREATE INDEX idx_petty_cash_property_id ON public.petty_cash_requests(property_id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'fixed_assets' AND column_name = 'property_id') THEN
    ALTER TABLE public.fixed_assets ADD COLUMN property_id integer REFERENCES public.properties(id) ON DELETE SET NULL;
    CREATE INDEX idx_fixed_assets_property_id ON public.fixed_assets(property_id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'inventory_items' AND column_name = 'property_id') THEN
    ALTER TABLE public.inventory_items ADD COLUMN property_id integer REFERENCES public.properties(id) ON DELETE SET NULL;
    CREATE INDEX idx_inventory_property_id ON public.inventory_items(property_id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'purchase_orders' AND column_name = 'property_id') THEN
    ALTER TABLE public.purchase_orders ADD COLUMN property_id integer REFERENCES public.properties(id) ON DELETE SET NULL;
    CREATE INDEX idx_purchase_orders_property_id ON public.purchase_orders(property_id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'budgets' AND column_name = 'property_id') THEN
    ALTER TABLE public.budgets ADD COLUMN property_id integer REFERENCES public.properties(id) ON DELETE SET NULL;
    CREATE INDEX idx_budgets_property_id ON public.budgets(property_id);
  END IF;
END $$;

-- 3. PERBAIKAN TIPE REFERENSI PAYMENT DI CLEARING GATEWAY
-- Menambahkan kolom midtrans_order_id index & payment_varchar_id jika diperlukan
CREATE INDEX IF NOT EXISTS idx_clearing_order_id_lookup ON public.midtrans_clearing_transactions(midtrans_order_id);
CREATE INDEX IF NOT EXISTS idx_payments_order_id_lookup ON public.payments(midtrans_order_id);

-- ROLLBACK SCRIPT (Jika diperlukan pembatalan migrasi):
-- ALTER TABLE public.payments ALTER COLUMN status SET DEFAULT 'paid'::character varying;
-- ALTER TABLE public.contract_extensions ALTER COLUMN status SET DEFAULT 'paid'::character varying;
-- ALTER TABLE public.petty_cash_requests DROP COLUMN IF EXISTS property_id;
-- ALTER TABLE public.fixed_assets DROP COLUMN IF EXISTS property_id;
-- ALTER TABLE public.inventory_items DROP COLUMN IF EXISTS property_id;
-- ALTER TABLE public.purchase_orders DROP COLUMN IF EXISTS property_id;
-- ALTER TABLE public.budgets DROP COLUMN IF EXISTS property_id;
