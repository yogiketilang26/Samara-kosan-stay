-- Migration: 006_migrate_legacy_user_ids.sql
-- Description: Detects and migrates non-UUID legacy IDs in public.users to valid auth.users UUIDs.
-- This ensures strict database integrity and eliminates runtime dual-lookup/migration code.

DO $$
DECLARE
  r RECORD;
  v_auth_id UUID;
  v_exists_new_id BOOLEAN;
BEGIN
  RAISE NOTICE 'Starting enterprise database audit and migration for legacy user IDs...';

  -- Loop through all rows in public.users that do not have a valid UUID as their ID
  FOR r IN 
    SELECT id, email, full_name, role, role_id, access, last_login, active, created_at 
    FROM public.users
    WHERE id !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
  LOOP
    RAISE NOTICE 'Found legacy user record: ID=%, Email=%, Name=%', r.id, r.email, r.full_name;

    -- 1. Find corresponding auth.users UUID matching by email
    SELECT id INTO v_auth_id 
    FROM auth.users 
    WHERE email = r.email 
    LIMIT 1;

    IF v_auth_id IS NOT NULL THEN
      RAISE NOTICE 'Matching auth.users UUID found: %', v_auth_id;

      -- 2. Check if a public.users record with the new UUID already exists
      SELECT EXISTS (
        SELECT 1 FROM public.users WHERE id = v_auth_id::text
      ) INTO v_exists_new_id;

      -- 3. Update referencing tables first (tenants and bookings)
      -- Update tenants.user_id references
      IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tenants' AND column_name = 'user_id') THEN
        UPDATE tenants 
        SET user_id = v_auth_id::text 
        WHERE user_id = r.id;
        RAISE NOTICE 'Updated tenants table references from % to %', r.id, v_auth_id;
      END IF;

      -- Update bookings.user_id references
      IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bookings' AND column_name = 'user_id') THEN
        UPDATE bookings 
        SET user_id = v_auth_id::text 
        WHERE user_id = r.id;
        RAISE NOTICE 'Updated bookings table references from % to %', r.id, v_auth_id;
      END IF;

      -- 4. Handle public.users table merge or update
      IF v_exists_new_id THEN
        -- If the record with new UUID already exists, update its fields with any non-null legacy data if empty, and then delete the legacy row
        UPDATE public.users
        SET 
          full_name = COALESCE(full_name, r.full_name),
          role = COALESCE(role, r.role),
          role_id = COALESCE(role_id, r.role_id),
          access = COALESCE(access, r.access),
          last_login = COALESCE(last_login, r.last_login),
          active = COALESCE(active, r.active)
        WHERE id = v_auth_id::text;

        DELETE FROM public.users WHERE id = r.id;
        RAISE NOTICE 'Merged legacy user into existing UUID record and deleted legacy row.';
      ELSE
        -- If the record with new UUID does not exist yet, we can safely update the legacy row's primary key
        UPDATE public.users
        SET id = v_auth_id::text
        WHERE id = r.id;
        RAISE NOTICE 'Updated legacy user primary key to UUID % directly.', v_auth_id;
      END IF;

    ELSE
      RAISE WARNING 'No matching auth.users record found for email %! Generating a new random UUID...', r.email;
      -- If they don't exist in auth.users, they are an orphan. We can generate a new random UUID for them
      v_auth_id := extensions.gen_random_uuid();
      
      -- Update references first
      IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tenants' AND column_name = 'user_id') THEN
        UPDATE tenants SET user_id = v_auth_id::text WHERE user_id = r.id;
      END IF;
      IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bookings' AND column_name = 'user_id') THEN
        UPDATE bookings SET user_id = v_auth_id::text WHERE user_id = r.id;
      END IF;

      -- Update user table
      UPDATE public.users SET id = v_auth_id::text WHERE id = r.id;
      RAISE NOTICE 'Updated legacy user ID to random UUID %.', v_auth_id;
    END IF;

  END LOOP;

  RAISE NOTICE 'Enterprise database legacy ID audit and migration completed successfully!';
END;
$$;
