-- ====================================================================
-- SAMARA STAY ERP v16 — MIGRATION 047: PUBLIC ROOM AVAILABILITY & EGRESS HARDENING
-- ====================================================================
-- 1. Pastikan Row Level Security aktif pada tabel sensitif
ALTER TABLE IF EXISTS public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.surveys ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.contract_extensions ENABLE ROW LEVEL SECURITY;

-- 2. Tolak akses SELECT, UPDATE, DELETE anon secara eksplisit (mencegah pencurian PII & menghemat egress)
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.tenants FROM anon;
REVOKE SELECT, UPDATE, DELETE ON public.surveys FROM anon;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.contract_extensions FROM anon;

-- Tetap izinkan anon submit survey baru (untuk formulir booking survey publik)
GRANT INSERT ON public.surveys TO anon;

-- 3. Policy RLS proteksi untuk anon vs authenticated
DROP POLICY IF EXISTS "Deny anon read tenants" ON public.tenants;
DROP POLICY IF EXISTS "Deny anon read surveys" ON public.surveys;
DROP POLICY IF EXISTS "Deny anon read contract_extensions" ON public.contract_extensions;

-- 4. RPC Publik Minimal untuk ketersediaan kamar tanpa data pribadi (PII-free)
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
AS $$
  SELECT 
    r.id AS room_id,
    r.property_id,
    r.room_number,
    r.status,
    r.monthly_price,
    r.daily_price
  FROM public.rooms r
  WHERE (p_property_id IS NULL OR r.property_id = p_property_id);
$$;

GRANT EXECUTE ON FUNCTION public.public_room_availability(BIGINT) TO anon, authenticated, service_role;
