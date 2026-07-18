-- Migration: 007_revert_facilities_public_rls.sql
-- Description: Reverts migration 004 public access workaround.
-- Restricts full access (ALL) for facilities, property_facilities, and room_facilities to authenticated users only.
-- Allows public select (read-only) for guests/unauthenticated clients viewing property listings, but restricts write operations.

-- 1. Revert policies for facilities
DROP POLICY IF EXISTS "Public All Access for facilities" ON facilities;
DROP POLICY IF EXISTS "Public Select for facilities" ON facilities;
DROP POLICY IF EXISTS "Authenticated Select for facilities" ON facilities;
DROP POLICY IF EXISTS "Admin All Access for facilities" ON facilities;

CREATE POLICY "Public Select for facilities" ON facilities 
  FOR SELECT TO public USING (true);

CREATE POLICY "Admin All Access for facilities" ON facilities 
  FOR ALL TO authenticated USING (true) WITH CHECK (true);


-- 2. Revert policies for property_facilities
DROP POLICY IF EXISTS "Public All Access for property_facilities" ON property_facilities;
DROP POLICY IF EXISTS "Public Select for property_facilities" ON property_facilities;
DROP POLICY IF EXISTS "Authenticated Select for property_facilities" ON property_facilities;
DROP POLICY IF EXISTS "Admin All Access for property_facilities" ON property_facilities;

CREATE POLICY "Public Select for property_facilities" ON property_facilities 
  FOR SELECT TO public USING (true);

CREATE POLICY "Admin All Access for property_facilities" ON property_facilities 
  FOR ALL TO authenticated USING (true) WITH CHECK (true);


-- 3. Revert policies for room_facilities
DROP POLICY IF EXISTS "Public All Access for room_facilities" ON room_facilities;
DROP POLICY IF EXISTS "Public Select for room_facilities" ON room_facilities;
DROP POLICY IF EXISTS "Authenticated Select for room_facilities" ON room_facilities;
DROP POLICY IF EXISTS "Admin All Access for room_facilities" ON room_facilities;

CREATE POLICY "Public Select for room_facilities" ON room_facilities 
  FOR SELECT TO public USING (true);

CREATE POLICY "Admin All Access for room_facilities" ON room_facilities 
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ⚠️ ACTION REQUIRED: Jalankan migration ini di Supabase SQL Editor
-- Copy and paste the statements below into the Supabase SQL Editor:
/*
DROP POLICY IF EXISTS "Public All Access for facilities" ON public.facilities;
DROP POLICY IF EXISTS "Public Select for facilities" ON public.facilities;
DROP POLICY IF EXISTS "Authenticated Select for facilities" ON public.facilities;
DROP POLICY IF EXISTS "Admin All Access for facilities" ON public.facilities;

CREATE POLICY "Public Select for facilities" ON public.facilities 
  FOR SELECT TO public USING (true);

CREATE POLICY "Admin All Access for facilities" ON public.facilities 
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public All Access for property_facilities" ON public.property_facilities;
DROP POLICY IF EXISTS "Public Select for property_facilities" ON public.property_facilities;
DROP POLICY IF EXISTS "Authenticated Select for property_facilities" ON public.property_facilities;
DROP POLICY IF EXISTS "Admin All Access for property_facilities" ON public.property_facilities;

CREATE POLICY "Public Select for property_facilities" ON public.property_facilities 
  FOR SELECT TO public USING (true);

CREATE POLICY "Admin All Access for property_facilities" ON public.property_facilities 
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public All Access for room_facilities" ON public.room_facilities;
DROP POLICY IF EXISTS "Public Select for room_facilities" ON public.room_facilities;
DROP POLICY IF EXISTS "Authenticated Select for room_facilities" ON public.room_facilities;
DROP POLICY IF EXISTS "Admin All Access for room_facilities" ON public.room_facilities;

CREATE POLICY "Public Select for room_facilities" ON public.room_facilities 
  FOR SELECT TO public USING (true);

CREATE POLICY "Admin All Access for room_facilities" ON public.room_facilities 
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
*/
