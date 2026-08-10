-- Migration: 015_secure_storage_policies.sql
-- Description: Replaces overly permissive public storage policies from migration 014
-- with secure policies restricting private buckets to authenticated users.

DROP POLICY IF EXISTS "Public Storage Read Access" ON storage.objects;
DROP POLICY IF EXISTS "Public Storage Upload Access" ON storage.objects;
DROP POLICY IF EXISTS "Public Storage Update Access" ON storage.objects;
DROP POLICY IF EXISTS "Public Storage Delete Access" ON storage.objects;

-- Marketing/Public Buckets: Public Read Access
CREATE POLICY "Public read for marketing buckets" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id IN ('property-images', 'room-images', 'avatars'));

-- Marketing/Public Buckets: Authenticated Write/Update/Delete
CREATE POLICY "Authenticated write for marketing buckets" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id IN ('property-images', 'room-images', 'avatars'));

CREATE POLICY "Authenticated update for marketing buckets" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id IN ('property-images', 'room-images', 'avatars'));

CREATE POLICY "Authenticated delete for marketing buckets" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id IN ('property-images', 'room-images', 'avatars'));

-- Private Sensitive Buckets: Authenticated Full Access Only
CREATE POLICY "Authenticated full access for private buckets" ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id IN ('tenant-documents', 'payment-proof', 'contracts', 'signatures', 'maintenance'))
  WITH CHECK (bucket_id IN ('tenant-documents', 'payment-proof', 'contracts', 'signatures', 'maintenance'));

-- ⚠️ ACTION REQUIRED: Run this SQL in the Supabase SQL Editor if needed:
/*
DROP POLICY IF EXISTS "Public Storage Read Access" ON storage.objects;
DROP POLICY IF EXISTS "Public Storage Upload Access" ON storage.objects;
DROP POLICY IF EXISTS "Public Storage Update Access" ON storage.objects;
DROP POLICY IF EXISTS "Public Storage Delete Access" ON storage.objects;

CREATE POLICY "Public read for marketing buckets" ON storage.objects
  FOR SELECT TO public USING (bucket_id IN ('property-images', 'room-images', 'avatars'));

CREATE POLICY "Authenticated write for marketing buckets" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id IN ('property-images', 'room-images', 'avatars'));

CREATE POLICY "Authenticated update for marketing buckets" ON storage.objects
  FOR UPDATE TO authenticated USING (bucket_id IN ('property-images', 'room-images', 'avatars'));

CREATE POLICY "Authenticated delete for marketing buckets" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id IN ('property-images', 'room-images', 'avatars'));

CREATE POLICY "Authenticated full access for private buckets" ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id IN ('tenant-documents', 'payment-proof', 'contracts', 'signatures', 'maintenance'))
  WITH CHECK (bucket_id IN ('tenant-documents', 'payment-proof', 'contracts', 'signatures', 'maintenance'));
*/
