-- Migration: 004_fix_facilities_rls.sql
-- Description: Fixes RLS policies for facilities, property_facilities, and room_facilities
-- to allow full CRUD access (ALL) for both public (anon) and authenticated roles.
-- This enables admin users logged in via standard/sandbox credentials to manage facilities.

-- 1. Policies for facilities
DROP POLICY IF EXISTS "Public Select for facilities" ON facilities;
DROP POLICY IF EXISTS "Authenticated Select for facilities" ON facilities;
DROP POLICY IF EXISTS "Admin All Access for facilities" ON facilities;
DROP POLICY IF EXISTS "Public All Access for facilities" ON facilities;

CREATE POLICY "Public All Access for facilities" ON facilities
  FOR ALL TO public USING (true) WITH CHECK (true);

-- 2. Policies for property_facilities
DROP POLICY IF EXISTS "Public Select for property_facilities" ON property_facilities;
DROP POLICY IF EXISTS "Authenticated Select for property_facilities" ON property_facilities;
DROP POLICY IF EXISTS "Admin All Access for property_facilities" ON property_facilities;
DROP POLICY IF EXISTS "Public All Access for property_facilities" ON property_facilities;

CREATE POLICY "Public All Access for property_facilities" ON property_facilities
  FOR ALL TO public USING (true) WITH CHECK (true);

-- 3. Policies for room_facilities
DROP POLICY IF EXISTS "Public Select for room_facilities" ON room_facilities;
DROP POLICY IF EXISTS "Authenticated Select for room_facilities" ON room_facilities;
DROP POLICY IF EXISTS "Admin All Access for room_facilities" ON room_facilities;
DROP POLICY IF EXISTS "Public All Access for room_facilities" ON room_facilities;

CREATE POLICY "Public All Access for room_facilities" ON room_facilities
  FOR ALL TO public USING (true) WITH CHECK (true);
