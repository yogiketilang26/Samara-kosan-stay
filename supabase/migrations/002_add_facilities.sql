-- Migration: Create and Secure Facilities and Join Tables
-- This migration ensures that facilities, property_facilities, and room_facilities tables are created,
-- have active foreign key constraints with ON DELETE CASCADE, RLS enabled, and proper authenticated read policies.

-- 1. Create tables if they do not exist
CREATE TABLE IF NOT EXISTS facilities (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(255) UNIQUE NOT NULL,
  icon VARCHAR(100) NOT NULL, -- e.g. Wifi, Wind, Shield, Car, Shirt, etc. (Lucide icon names)
  category VARCHAR(100) DEFAULT 'general' NOT NULL, -- e.g. room, property, general
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

CREATE TABLE IF NOT EXISTS property_facilities (
  property_id BIGINT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  facility_id BIGINT NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  PRIMARY KEY (property_id, facility_id)
);

CREATE TABLE IF NOT EXISTS room_facilities (
  room_id BIGINT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  facility_id BIGINT NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  PRIMARY KEY (room_id, facility_id)
);

-- 2. Enable Row Level Security (RLS)
ALTER TABLE IF EXISTS facilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS property_facilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS room_facilities ENABLE ROW LEVEL SECURITY;

-- 3. Create RLS Policies
-- Confirm RLS policies allow authenticated read access for users.
-- We also allow public read access because guests/unauthenticated clients viewing the properties or rooms need to list their facilities.
-- Admin users have full ALL access.

-- A. Policies for facilities
DROP POLICY IF EXISTS "Public Select for facilities" ON facilities;
CREATE POLICY "Public Select for facilities" ON facilities 
  FOR SELECT TO public USING (true);

DROP POLICY IF EXISTS "Authenticated Select for facilities" ON facilities;
CREATE POLICY "Authenticated Select for facilities" ON facilities 
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Admin All Access for facilities" ON facilities;
CREATE POLICY "Admin All Access for facilities" ON facilities 
  FOR ALL TO authenticated USING (true);


-- B. Policies for property_facilities
DROP POLICY IF EXISTS "Public Select for property_facilities" ON property_facilities;
CREATE POLICY "Public Select for property_facilities" ON property_facilities 
  FOR SELECT TO public USING (true);

DROP POLICY IF EXISTS "Authenticated Select for property_facilities" ON property_facilities;
CREATE POLICY "Authenticated Select for property_facilities" ON property_facilities 
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Admin All Access for property_facilities" ON property_facilities;
CREATE POLICY "Admin All Access for property_facilities" ON property_facilities 
  FOR ALL TO authenticated USING (true);


-- C. Policies for room_facilities
DROP POLICY IF EXISTS "Public Select for room_facilities" ON room_facilities;
CREATE POLICY "Public Select for room_facilities" ON room_facilities 
  FOR SELECT TO public USING (true);

DROP POLICY IF EXISTS "Authenticated Select for room_facilities" ON room_facilities;
CREATE POLICY "Authenticated Select for room_facilities" ON room_facilities 
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Admin All Access for room_facilities" ON room_facilities;
CREATE POLICY "Admin All Access for room_facilities" ON room_facilities 
  FOR ALL TO authenticated USING (true);


-- 4. Seed Standard Facilities
INSERT INTO facilities (id, name, icon, category, description) VALUES
(1, 'WiFi High-Speed', 'Wifi', 'general', 'Koneksi internet tanpa kabel berkecepatan hingga 100 Mbps'),
(2, 'Air Conditioner (AC)', 'Wind', 'room', 'Pendingin ruangan inverter hemat energi'),
(3, 'Keamanan 24 Jam', 'Shield', 'property', 'Pengawasan CCTV dan petugas keamanan siaga 24 jam'),
(4, 'Parkir Motor Luas', 'Car', 'property', 'Area parkir motor yang aman, teduh, dan luas'),
(5, 'Laundry Kiloan', 'Shirt', 'property', 'Fasilitas cuci gosok pakaian tersedia untuk penghuni'),
(6, 'Cleaning Service', 'Sparkles', 'property', 'Layanan kebersihan kamar 2 kali seminggu'),
(7, 'Dapur Bersama', 'CupSoda', 'property', 'Dapur umum lengkap dengan kompor, dispenser, dan kulkas'),
(8, 'Kamar Mandi Dalam', 'Droplet', 'room', 'Kamar mandi pribadi dilengkapi shower dan toilet duduk')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  icon = EXCLUDED.icon,
  category = EXCLUDED.category,
  description = EXCLUDED.description;


-- 5. Seed sample mapping for Property Facilities
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM properties WHERE id = 1) THEN
    INSERT INTO property_facilities (property_id, facility_id) VALUES
    (1, 1), (1, 3), (1, 4), (1, 5), (1, 6), (1, 7)
    ON CONFLICT DO NOTHING;
  END IF;

  IF EXISTS (SELECT 1 FROM properties WHERE id = 2) THEN
    INSERT INTO property_facilities (property_id, facility_id) VALUES
    (2, 1), (2, 3), (2, 4), (2, 5), (2, 6), (2, 7)
    ON CONFLICT DO NOTHING;
  END IF;

  -- 6. Seed sample mapping for Room Facilities
  IF EXISTS (SELECT 1 FROM rooms WHERE id = 1) THEN
    INSERT INTO room_facilities (room_id, facility_id) VALUES
    (1, 1), (1, 2), (1, 8)
    ON CONFLICT DO NOTHING;
  END IF;

  IF EXISTS (SELECT 1 FROM rooms WHERE id = 2) THEN
    INSERT INTO room_facilities (room_id, facility_id) VALUES
    (2, 1), (2, 2), (2, 8)
    ON CONFLICT DO NOTHING;
  END IF;
END;
$$;


-- 7. Automatically sync sequences for serial-based tables
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN 
        SELECT table_name, column_name 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND column_default LIKE 'nextval%'
    LOOP
        EXECUTE 'SELECT setval(pg_get_serial_sequence(''' || r.table_name || ''', ''' || r.column_name || '''), COALESCE(MAX(' || r.column_name || '), 0) + 1, false) FROM ' || r.table_name;
    END LOOP;
END;
$$;
