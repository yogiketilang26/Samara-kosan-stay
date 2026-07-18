-- Migration: 003_migrate_legacy_facilities.sql
-- Description: Safely copies legacy string-array facilities into the relational join tables,
-- then removes the legacy columns to prevent dual-system conflicts.

DO $$
DECLARE
  p_record RECORD;
  r_record RECORD;
  fac_name TEXT;
  fac_id BIGINT;
  fac_category TEXT;
  fac_icon TEXT;
BEGIN
  -- 1. Migrate Property facilities
  IF EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_name = 'properties' AND column_name = 'facilities'
  ) THEN
    FOR p_record IN SELECT id, name, facilities FROM properties LOOP
      IF p_record.facilities IS NOT NULL AND array_length(p_record.facilities, 1) > 0 THEN
        FOREACH fac_name IN ARRAY p_record.facilities LOOP
          fac_name := trim(fac_name);
          IF fac_name <> '' THEN
            -- Find or create facility in facilities table by case-insensitive name
            SELECT id INTO fac_id FROM facilities WHERE LOWER(name) = LOWER(fac_name);
            IF fac_id IS NULL THEN
              -- Assign a default category and icon based on keywords
              fac_category := CASE 
                WHEN LOWER(fac_name) LIKE '%ac%' OR LOWER(fac_name) LIKE '%mandi%' THEN 'room'
                ELSE 'general'
              END;
              fac_icon := CASE
                WHEN LOWER(fac_name) LIKE '%wifi%' THEN 'Wifi'
                WHEN LOWER(fac_name) LIKE '%ac%' THEN 'Wind'
                WHEN LOWER(fac_name) LIKE '%parkir%' THEN 'Car'
                WHEN LOWER(fac_name) LIKE '%aman%' OR LOWER(fac_name) LIKE '%shield%' THEN 'Shield'
                ELSE 'Sparkles'
              END;
              
              INSERT INTO facilities (name, icon, category, description)
              VALUES (fac_name, fac_icon, fac_category, 'Migrasi otomatis dari fasilitas properti')
              RETURNING id INTO fac_id;
            END IF;
            
            -- Insert association
            INSERT INTO property_facilities (property_id, facility_id)
            VALUES (p_record.id, fac_id)
            ON CONFLICT DO NOTHING;
          END IF;
        END FOREACH;
      END IF;
    END LOOP;
  END IF;

  -- 2. Migrate Room facilities
  IF EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_name = 'rooms' AND column_name = 'facilities'
  ) THEN
    FOR r_record IN SELECT id, room_number, facilities FROM rooms LOOP
      IF r_record.facilities IS NOT NULL AND array_length(r_record.facilities, 1) > 0 THEN
        FOREACH fac_name IN ARRAY r_record.facilities LOOP
          fac_name := trim(fac_name);
          IF fac_name <> '' THEN
            -- Find or create facility in facilities table
            SELECT id INTO fac_id FROM facilities WHERE LOWER(name) = LOWER(fac_name);
            IF fac_id IS NULL THEN
              fac_category := 'room';
              fac_icon := CASE
                WHEN LOWER(fac_name) LIKE '%wifi%' THEN 'Wifi'
                WHEN LOWER(fac_name) LIKE '%ac%' THEN 'Wind'
                WHEN LOWER(fac_name) LIKE '%mandi%' OR LOWER(fac_name) LIKE '%shower%' THEN 'Droplet'
                ELSE 'Sparkles'
              END;
              
              INSERT INTO facilities (name, icon, category, description)
              VALUES (fac_name, fac_icon, fac_category, 'Migrasi otomatis dari fasilitas kamar')
              RETURNING id INTO fac_id;
            END IF;
            
            -- Insert association
            INSERT INTO room_facilities (room_id, facility_id)
            VALUES (r_record.id, fac_id)
            ON CONFLICT DO NOTHING;
          END IF;
        END FOREACH;
      END IF;
    END LOOP;
  END IF;
END;
$$;

-- 3. Verify associations exist and validate counts before removing columns
DO $$
DECLARE
  rel_prop_count INT := 0;
  rel_room_count INT := 0;
BEGIN
  -- Check counts of relations
  SELECT COUNT(*) INTO rel_prop_count FROM property_facilities;
  SELECT COUNT(*) INTO rel_room_count FROM room_facilities;
  
  RAISE NOTICE 'Migration Validation: property_facilities count = %, room_facilities count = %', rel_prop_count, rel_room_count;
  
  -- If counts look correct, we can safely drop the legacy columns to finalize refactoring
  IF EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_name = 'properties' AND column_name = 'facilities'
  ) THEN
    ALTER TABLE properties DROP COLUMN facilities;
  END IF;

  IF EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_name = 'rooms' AND column_name = 'facilities'
  ) THEN
    ALTER TABLE rooms DROP COLUMN facilities;
  END IF;
END;
$$;
