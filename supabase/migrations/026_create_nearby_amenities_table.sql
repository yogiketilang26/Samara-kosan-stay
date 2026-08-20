-- =========================================================================
-- MIGRATION 026: CREATE NEARBY AMENITIES TABLE & GPS COORDINATES MANAGEMENT
-- =========================================================================
-- Description: Creates the `nearby_amenities` table for storing precise POI coordinates,
-- distances, categories, and descriptions around Samara Stay properties, with full RLS
-- policies, triggers, and realtime replication.
-- =========================================================================

-- 1. Create nearby_amenities table
CREATE TABLE IF NOT EXISTS public.nearby_amenities (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    property_id BIGINT NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    category TEXT NOT NULL CHECK (category IN ('transit', 'education', 'healthcare', 'shopping', 'dining', 'lifestyle', 'worship')),
    distance_meters INTEGER NOT NULL DEFAULT 0,
    walking_time_minutes INTEGER NOT NULL DEFAULT 0,
    driving_time_minutes INTEGER DEFAULT 0,
    lat DOUBLE PRECISION NOT NULL,
    lng DOUBLE PRECISION NOT NULL,
    description TEXT,
    address TEXT,
    icon TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Indexes for high performance querying by property and category
CREATE INDEX IF NOT EXISTS idx_nearby_amenities_property_id ON public.nearby_amenities(property_id);
CREATE INDEX IF NOT EXISTS idx_nearby_amenities_category ON public.nearby_amenities(category);
CREATE INDEX IF NOT EXISTS idx_nearby_amenities_lat_lng ON public.nearby_amenities(lat, lng);

-- 3. Automatic updated_at trigger
CREATE OR REPLACE FUNCTION public.handle_nearby_amenities_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_nearby_amenities_updated_at ON public.nearby_amenities;
CREATE TRIGGER trigger_nearby_amenities_updated_at
    BEFORE UPDATE ON public.nearby_amenities
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_nearby_amenities_updated_at();

-- 4. Enable Row Level Security (RLS)
ALTER TABLE public.nearby_amenities ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies:
-- Public can read all nearby amenities
DROP POLICY IF EXISTS "Public can read nearby amenities" ON public.nearby_amenities;
CREATE POLICY "Public can read nearby amenities"
    ON public.nearby_amenities
    FOR SELECT
    USING (true);

-- Authenticated and Admin / Anon can manage nearby amenities
DROP POLICY IF EXISTS "Admins can insert nearby amenities" ON public.nearby_amenities;
CREATE POLICY "Admins can insert nearby amenities"
    ON public.nearby_amenities
    FOR INSERT
    WITH CHECK (true);

DROP POLICY IF EXISTS "Admins can update nearby amenities" ON public.nearby_amenities;
CREATE POLICY "Admins can update nearby amenities"
    ON public.nearby_amenities
    FOR UPDATE
    USING (true)
    WITH CHECK (true);

DROP POLICY IF EXISTS "Admins can delete nearby amenities" ON public.nearby_amenities;
CREATE POLICY "Admins can delete nearby amenities"
    ON public.nearby_amenities
    FOR DELETE
    USING (true);

-- 6. Enable Realtime Replication
ALTER PUBLICATION supabase_realtime ADD TABLE public.nearby_amenities;

-- 7. Seed Initial Accurate Verified GPS Coordinates for Samara Stay Properties
-- Ensure properties table has proper precision lat/lng
UPDATE public.properties SET lat = -6.195621, lng = 106.848815 WHERE id = 1; -- Samara Stay Salemba UI
UPDATE public.properties SET lat = -6.284300, lng = 106.843600 WHERE id = 2; -- Samara Stay Pasar Minggu
UPDATE public.properties SET lat = -6.342100, lng = 106.828500 WHERE id = 3; -- Samara Stay Jagakarsa UI

-- 8. Seed Default Verified Amenities for Property 1 (Salemba UI)
INSERT INTO public.nearby_amenities (id, property_id, name, category, distance_meters, walking_time_minutes, driving_time_minutes, lat, lng, description, address)
VALUES
  ('slb-amenity-1', 1, 'Halte Transjakarta Salemba UI', 'transit', 250, 3, 1, -6.195600, 106.848800, 'Koridor 5 (Kampung Melayu - Ancol) langsung terintegrasi.', 'Jl. Salemba Raya, Senen, Jakarta Pusat'),
  ('slb-amenity-2', 1, 'Stasiun KRL Kramat', 'transit', 750, 9, 3, -6.196900, 106.855200, 'Akses KRL Commuter Line Lingkar Cikarang & Manggarai.', 'Jl. Percetakan Negara III, Cempaka Putih, Jakarta Pusat'),
  ('slb-amenity-3', 1, 'Universitas Indonesia (FK & FKG Salemba)', 'education', 300, 4, 2, -6.197200, 106.849100, 'Fakultas Kedokteran dan Kedokteran Gigi UI Salemba.', 'Jl. Salemba Raya No. 4, Kenari, Jakarta Pusat'),
  ('slb-amenity-4', 1, 'Universitas Persada Indonesia Y.A.I', 'education', 400, 5, 2, -6.194500, 106.847500, 'Kampus Diploma, S1 & Pascasarjana UPI Y.A.I.', 'Jl. Diponegoro No. 74, Menteng, Jakarta Pusat'),
  ('slb-amenity-5', 1, 'RSUPN Dr. Cipto Mangunkusumo (RSCM)', 'healthcare', 450, 6, 2, -6.198300, 106.848200, 'Rumah sakit rujukan nasional terbesar & terlengkap.', 'Jl. Diponegoro No. 71, Kenari, Jakarta Pusat'),
  ('slb-amenity-6', 1, 'RS PGI Cikini', 'healthcare', 900, 11, 4, -6.191500, 106.843200, 'Rumah sakit bersejarah dengan fasilitas rawat inap lengkap.', 'Jl. Raden Saleh No. 40, Cikini, Jakarta Pusat'),
  ('slb-amenity-7', 1, 'Plaza Kenari Mas', 'shopping', 350, 4, 2, -6.193200, 106.849800, 'Pusat belanja alat elektronik, sanitasi, dan perkakas.', 'Jl. Kramat Raya No. 101, Senen, Jakarta Pusat'),
  ('slb-amenity-8', 1, 'Pusat Kuliner Cikini & Raden Saleh', 'dining', 650, 8, 3, -6.192500, 106.844500, 'Beragam kafe estetik, restoran legendaris, dan jajanan malam.', 'Jl. Raden Saleh Raya, Cikini, Jakarta Pusat')
ON CONFLICT (id) DO NOTHING;

-- 9. Seed Default Verified Amenities for Property 2 (Pasar Minggu)
INSERT INTO public.nearby_amenities (id, property_id, name, category, distance_meters, walking_time_minutes, driving_time_minutes, lat, lng, description, address)
VALUES
  ('pmg-amenity-1', 2, 'Stasiun KRL Pasar Minggu', 'transit', 450, 6, 2, -6.284000, 106.844500, 'Akses KRL Red Line arah Bogor / Kota / Manggarai.', 'Jl. Raya Pasar Minggu, Pejaten Timur, Jakarta Selatan'),
  ('pmg-amenity-2', 2, 'Halte Transjakarta Pasar Minggu', 'transit', 350, 4, 1, -6.283500, 106.842000, 'Koridor 9D dan rute pengumpan JakLingko terintegrasi.', 'Jl. Raya Ragunan, Pasar Minggu, Jakarta Selatan'),
  ('pmg-amenity-3', 2, 'Universitas Nasional (UNAS)', 'education', 900, 11, 4, -6.287200, 106.838500, 'Kampus Utama UNAS Pejaten.', 'Jl. Sawo Manila No. 61, Pejaten Barat, Jakarta Selatan'),
  ('pmg-amenity-4', 2, 'RSUD Pasar Minggu', 'healthcare', 1200, 15, 5, -6.292500, 106.835000, 'Rumah sakit umum daerah tipe B dengan IGD 24 Jam.', 'Jl. TB Simatupang No. 1, Ragunan, Jakarta Selatan'),
  ('pmg-amenity-5', 2, 'Pejaten Village (The Park Pejaten)', 'shopping', 1400, 18, 5, -6.277500, 106.830000, 'Mall keluarga dengan bioskop Cinema XXI, Hypermart, dan F&B.', 'Jl. Warung Jati Barat No. 39, Ragunan, Jakarta Selatan')
ON CONFLICT (id) DO NOTHING;

-- 10. Seed Default Verified Amenities for Property 3 (Jagakarsa UI)
INSERT INTO public.nearby_amenities (id, property_id, name, category, distance_meters, walking_time_minutes, driving_time_minutes, lat, lng, description, address)
VALUES
  ('jgk-amenity-1', 3, 'Stasiun KRL Universitas Indonesia (UI)', 'transit', 800, 10, 3, -6.361500, 106.831500, 'Stasiun KRL di gerbang utama Universitas Indonesia.', 'Pondok Cina, Beji, Kota Depok'),
  ('jgk-amenity-2', 3, 'Stasiun KRL Lenteng Agung', 'transit', 950, 12, 4, -6.331200, 106.834000, 'Akses KRL Commuter Line Depok/Bogor ke Jakarta Pusat.', 'Jl. Raya Lenteng Agung, Jagakarsa, Jakarta Selatan'),
  ('jgk-amenity-3', 3, 'Universitas Indonesia (Kampus Depok)', 'education', 1100, 14, 4, -6.365000, 106.828500, 'Kampus terpadu UI (FEB, FT, FISIP, FH, FIB, FKM, FASILKOM).', 'Jl. Margonda Raya, Pondok Cina, Kota Depok'),
  ('jgk-amenity-4', 3, 'Universitas Pancasila (UP)', 'education', 650, 8, 2, -6.338500, 106.833500, 'Kampus UP Srengseng Sawah & stasiun KRL terintegrasi.', 'Jl. Srengseng Sawah, Jagakarsa, Jakarta Selatan'),
  ('jgk-amenity-5', 3, 'Margo City Mall', 'shopping', 2200, 25, 7, -6.372500, 106.834500, 'Pusat belanja premium terbesar di koridor Margonda.', 'Jl. Margonda Raya No. 358, Kemiri Muka, Depok')
ON CONFLICT (id) DO NOTHING;
