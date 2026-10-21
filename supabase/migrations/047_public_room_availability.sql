-- ====================================================================
-- SAMARA STAY ERP v16 — MIGRATION 047: PUBLIC ROOM AVAILABILITY & EGRESS HARDENING
-- ====================================================================
-- 1. Pastikan Row Level Security aktif pada tabel sensitif
ALTER TABLE IF EXISTS public.bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.surveys ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.contract_extensions ENABLE ROW LEVEL SECURITY;

-- 2. Tolak akses anon secara eksplisit pada seluruh tabel PII (mencegah kebocoran PII & menghemat egress)
REVOKE ALL ON public.bookings FROM anon, PUBLIC;
REVOKE ALL ON public.tenants FROM anon, PUBLIC;
REVOKE ALL ON public.surveys FROM anon, PUBLIC;
REVOKE ALL ON public.payments FROM anon, PUBLIC;
REVOKE ALL ON public.users FROM anon, PUBLIC;
REVOKE ALL ON public.contract_extensions FROM anon, PUBLIC;

-- 3. Hapus policy permisif publik/anon pada tabel PII
DROP POLICY IF EXISTS "Users can select their own bookings" ON public.bookings;
DROP POLICY IF EXISTS "Enable insert for public bookings" ON public.bookings;
DROP POLICY IF EXISTS "Public select surveys" ON public.surveys;
DROP POLICY IF EXISTS "Enable insert for public surveys" ON public.surveys;
DROP POLICY IF EXISTS "Enable insert for payments via webhooks" ON public.payments;
DROP POLICY IF EXISTS "Deny anon read tenants" ON public.tenants;
DROP POLICY IF EXISTS "Deny anon read surveys" ON public.surveys;
DROP POLICY IF EXISTS "Deny anon read contract_extensions" ON public.contract_extensions;

-- 4. RPC Publik Minimal untuk ketersediaan kamar tanpa data pribadi (PII-free)
--    Menggunakan kolom aktual r.price AS monthly_price dan r.daily_price.
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
    r.price AS monthly_price,
    r.daily_price
  FROM public.rooms r
  WHERE (p_property_id IS NULL OR r.property_id = p_property_id);
$$;

GRANT EXECUTE ON FUNCTION public.public_room_availability(BIGINT) TO anon, authenticated, service_role;

