-- Migration: 009_backfill_remaining_facilities.sql
-- Description: Backfills legacy/new string-array facilities for Properties and Rooms into property_facilities and room_facilities join tables.
-- Ensures that any Property/Room with facilities string[] but without junction table records gets migrated. Idempotent (ON CONFLICT DO NOTHING).

DO $$
BEGIN
  -- 1. Backfill Property facilities
  IF EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'properties' AND column_name = 'facilities'
  ) THEN
    -- First, insert any missing facility names into master facilities table
    INSERT INTO facilities (name, icon, category, description)
    SELECT DISTINCT
      trim(f_name) AS name,
      CASE 
        WHEN LOWER(f_name) LIKE '%wifi%' THEN 'Wifi'
        WHEN LOWER(f_name) LIKE '%ac%' THEN 'Wind'
        WHEN LOWER(f_name) LIKE '%parkir%' THEN 'Car'
        WHEN LOWER(f_name) LIKE '%aman%' OR LOWER(f_name) LIKE '%shield%' THEN 'Shield'
        ELSE 'Sparkles'
      END AS icon,
      CASE 
        WHEN LOWER(f_name) LIKE '%ac%' OR LOWER(f_name) LIKE '%mandi%' THEN 'room'
        ELSE 'general'
      END AS category,
      'Backfill otomatis fasilitas properti' AS description
    FROM properties p,
    UNNEST(p.facilities) AS f_name
    WHERE p.facilities IS NOT NULL AND trim(f_name) <> ''
    ON CONFLICT (name) DO NOTHING;

    -- Second, associate properties with facilities in property_facilities junction table
    INSERT INTO property_facilities (property_id, facility_id)
    SELECT DISTINCT p.id, fac.id
    FROM properties p,
    UNNEST(p.facilities) AS f_name
    JOIN facilities fac ON LOWER(fac.name) = LOWER(trim(f_name))
    WHERE p.facilities IS NOT NULL AND trim(f_name) <> ''
    ON CONFLICT (property_id, facility_id) DO NOTHING;
  END IF;

  -- 2. Backfill Room facilities
  IF EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'rooms' AND column_name = 'facilities'
  ) THEN
    -- First, insert any missing facility names into master facilities table
    INSERT INTO facilities (name, icon, category, description)
    SELECT DISTINCT
      trim(f_name) AS name,
      CASE 
        WHEN LOWER(f_name) LIKE '%wifi%' THEN 'Wifi'
        WHEN LOWER(f_name) LIKE '%ac%' THEN 'Wind'
        WHEN LOWER(f_name) LIKE '%mandi%' OR LOWER(f_name) LIKE '%shower%' THEN 'Droplet'
        ELSE 'Sparkles'
      END AS icon,
      'room' AS category,
      'Backfill otomatis fasilitas kamar' AS description
    FROM rooms r,
    UNNEST(r.facilities) AS f_name
    WHERE r.facilities IS NOT NULL AND trim(f_name) <> ''
    ON CONFLICT (name) DO NOTHING;

    -- Second, associate rooms with facilities in room_facilities junction table
    INSERT INTO room_facilities (room_id, facility_id)
    SELECT DISTINCT r.id, fac.id
    FROM rooms r,
    UNNEST(r.facilities) AS f_name
    JOIN facilities fac ON LOWER(fac.name) = LOWER(trim(f_name))
    WHERE r.facilities IS NOT NULL AND trim(f_name) <> ''
    ON CONFLICT (room_id, facility_id) DO NOTHING;
  END IF;
END;
$$;

-- ⚠️ ACTION REQUIRED: Jalankan migration ini di Supabase SQL Editor
-- Copy and paste the statements below into the Supabase SQL Editor:
/*
DO $$
BEGIN
  -- 1. Backfill Property facilities
  IF EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'properties' AND column_name = 'facilities'
  ) THEN
    INSERT INTO facilities (name, icon, category, description)
    SELECT DISTINCT
      trim(f_name) AS name,
      CASE 
        WHEN LOWER(f_name) LIKE '%wifi%' THEN 'Wifi'
        WHEN LOWER(f_name) LIKE '%ac%' THEN 'Wind'
        WHEN LOWER(f_name) LIKE '%parkir%' THEN 'Car'
        WHEN LOWER(f_name) LIKE '%aman%' OR LOWER(f_name) LIKE '%shield%' THEN 'Shield'
        ELSE 'Sparkles'
      END AS icon,
      CASE 
        WHEN LOWER(f_name) LIKE '%ac%' OR LOWER(f_name) LIKE '%mandi%' THEN 'room'
        ELSE 'general'
      END AS category,
      'Backfill otomatis fasilitas properti' AS description
    FROM properties p,
    UNNEST(p.facilities) AS f_name
    WHERE p.facilities IS NOT NULL AND trim(f_name) <> ''
    ON CONFLICT (name) DO NOTHING;

    INSERT INTO property_facilities (property_id, facility_id)
    SELECT DISTINCT p.id, fac.id
    FROM properties p,
    UNNEST(p.facilities) AS f_name
    JOIN facilities fac ON LOWER(fac.name) = LOWER(trim(f_name))
    WHERE p.facilities IS NOT NULL AND trim(f_name) <> ''
    ON CONFLICT (property_id, facility_id) DO NOTHING;
  END IF;

  -- 2. Backfill Room facilities
  IF EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'rooms' AND column_name = 'facilities'
  ) THEN
    INSERT INTO facilities (name, icon, category, description)
    SELECT DISTINCT
      trim(f_name) AS name,
      CASE 
        WHEN LOWER(f_name) LIKE '%wifi%' THEN 'Wifi'
        WHEN LOWER(f_name) LIKE '%ac%' THEN 'Wind'
        WHEN LOWER(f_name) LIKE '%mandi%' OR LOWER(f_name) LIKE '%shower%' THEN 'Droplet'
        ELSE 'Sparkles'
      END AS icon,
      'room' AS category,
      'Backfill otomatis fasilitas kamar' AS description
    FROM rooms r,
    UNNEST(r.facilities) AS f_name
    WHERE r.facilities IS NOT NULL AND trim(f_name) <> ''
    ON CONFLICT (name) DO NOTHING;

    INSERT INTO room_facilities (room_id, facility_id)
    SELECT DISTINCT r.id, fac.id
    FROM rooms r,
    UNNEST(r.facilities) AS f_name
    JOIN facilities fac ON LOWER(fac.name) = LOWER(trim(f_name))
    WHERE r.facilities IS NOT NULL AND trim(f_name) <> ''
    ON CONFLICT (room_id, facility_id) DO NOTHING;
  END IF;
END;
$$;
*/

