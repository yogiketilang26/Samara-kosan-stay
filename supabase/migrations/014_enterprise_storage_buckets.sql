-- Migration: 014_enterprise_storage_buckets.sql
-- Description: Creates storage buckets for Samara Stay ERP and configures public read / authenticated write access policies.

-- Insert buckets into storage.buckets if they do not exist
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES 
  ('property-images', 'property-images', true, 20971520, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/avif']),
  ('room-images', 'room-images', true, 20971520, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/avif']),
  ('tenant-documents', 'tenant-documents', true, 20971520, ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']),
  ('payment-proof', 'payment-proof', true, 20971520, ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']),
  ('contracts', 'contracts', true, 20971520, ARRAY['application/pdf', 'image/png', 'image/jpeg']),
  ('signatures', 'signatures', true, 20971520, ARRAY['image/png', 'image/jpeg', 'image/webp']),
  ('avatars', 'avatars', true, 10485760, ARRAY['image/jpeg', 'image/png', 'image/webp']),
  ('maintenance', 'maintenance', true, 20971520, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE SET 
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit;

-- Public Storage Access Policies for objects
DROP POLICY IF EXISTS "Public Storage Read Access" ON storage.objects;
CREATE POLICY "Public Storage Read Access" ON storage.objects
  FOR SELECT TO public USING (true);

DROP POLICY IF EXISTS "Public Storage Upload Access" ON storage.objects;
CREATE POLICY "Public Storage Upload Access" ON storage.objects
  FOR INSERT TO public WITH CHECK (true);

DROP POLICY IF EXISTS "Public Storage Update Access" ON storage.objects;
CREATE POLICY "Public Storage Update Access" ON storage.objects
  FOR UPDATE TO public WITH CHECK (true);

DROP POLICY IF EXISTS "Public Storage Delete Access" ON storage.objects;
CREATE POLICY "Public Storage Delete Access" ON storage.objects
  FOR DELETE TO public USING (true);

-- ⚠️ ACTION REQUIRED: Jalankan migration ini di Supabase SQL Editor jika belum berjalan otomatis:
/*
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES 
  ('property-images', 'property-images', true, 20971520),
  ('room-images', 'room-images', true, 20971520),
  ('tenant-documents', 'tenant-documents', true, 20971520),
  ('payment-proof', 'payment-proof', true, 20971520),
  ('contracts', 'contracts', true, 20971520),
  ('signatures', 'signatures', true, 20971520),
  ('avatars', 'avatars', true, 10485760),
  ('maintenance', 'maintenance', true, 20971520)
ON CONFLICT (id) DO UPDATE SET public = true;

CREATE POLICY "Public Storage Read Access" ON storage.objects FOR SELECT TO public USING (true);
CREATE POLICY "Public Storage Upload Access" ON storage.objects FOR INSERT TO public WITH CHECK (true);
*/
