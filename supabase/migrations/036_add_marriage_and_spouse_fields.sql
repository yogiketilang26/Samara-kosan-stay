-- Migration 036: Add marriage and spouse fields to tenants & bookings
-- Menjamin verifikasi pasangan suami istri (buku nikah, NIK pasangan, no WA) tersimpan aman dan sinkron secara real-time

-- 1. Tambahkan kolom pada tabel tenants (Penghuni)
ALTER TABLE IF EXISTS public.tenants
  ADD COLUMN IF NOT EXISTS nik VARCHAR(32),
  ADD COLUMN IF NOT EXISTS is_married BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS marriage_certificate_url TEXT,
  ADD COLUMN IF NOT EXISTS spouse_name VARCHAR(255),
  ADD COLUMN IF NOT EXISTS spouse_nik VARCHAR(32),
  ADD COLUMN IF NOT EXISTS spouse_phone VARCHAR(64),
  ADD COLUMN IF NOT EXISTS spouse_relation VARCHAR(32) DEFAULT 'istri';

-- 2. Tambahkan kolom pada tabel bookings (Riwayat Pemesanan Kamar)
ALTER TABLE IF EXISTS public.bookings
  ADD COLUMN IF NOT EXISTS is_married BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS marriage_certificate_url TEXT,
  ADD COLUMN IF NOT EXISTS spouse_name VARCHAR(255),
  ADD COLUMN IF NOT EXISTS spouse_nik VARCHAR(32),
  ADD COLUMN IF NOT EXISTS spouse_phone VARCHAR(64),
  ADD COLUMN IF NOT EXISTS spouse_relation VARCHAR(32) DEFAULT 'istri';

-- 3. Tambahkan komentar kolom untuk dokumentasi skema database
COMMENT ON COLUMN public.tenants.is_married IS 'Status pernikahan penghuni (true = Pasutri, false = Lajang)';
COMMENT ON COLUMN public.tenants.marriage_certificate_url IS 'URL dokumen buku nikah / kartu nikah di Supabase Storage';
COMMENT ON COLUMN public.tenants.spouse_name IS 'Nama lengkap suami atau istri penghuni';
COMMENT ON COLUMN public.tenants.spouse_nik IS 'NIK KTP pasangan penghuni';
COMMENT ON COLUMN public.tenants.spouse_phone IS 'Nomor WhatsApp / telepon pasangan penghuni';
COMMENT ON COLUMN public.tenants.spouse_relation IS 'Hubungan pasangan: istri atau suami';

COMMENT ON COLUMN public.bookings.is_married IS 'Status pernikahan pemesan (true = Pasutri, false = Lajang)';
COMMENT ON COLUMN public.bookings.marriage_certificate_url IS 'URL dokumen buku nikah / kartu nikah di Supabase Storage';
COMMENT ON COLUMN public.bookings.spouse_name IS 'Nama lengkap suami atau istri pemesan';
COMMENT ON COLUMN public.bookings.spouse_nik IS 'NIK KTP pasangan pemesan';
COMMENT ON COLUMN public.bookings.spouse_phone IS 'Nomor WhatsApp / telepon pasangan pemesan';
COMMENT ON COLUMN public.bookings.spouse_relation IS 'Hubungan pasangan: istri atau suami';

-- 4. Pastikan tabel tenants dan bookings terdaftar dalam supabase_realtime publication
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.tenants;
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.bookings;
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;
END $$;
