-- ====================================================================
-- SAMARA STAY ERP — MIGRATION 039: ROOMS PROPERTY FK CASCADE
-- ====================================================================
-- P1-1: Ubah foreign key rooms.property_id ke ON DELETE CASCADE
-- Jika entitas properti dihapus, semua kamar yang menjadi bagiannya ikut terhapus.

DO $$
DECLARE
  r RECORD;
BEGIN
  -- 1. Cari dan hapus constraint FK rooms -> properties yang ada
  FOR r IN (
    SELECT conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'rooms'
      AND con.contype = 'f'
      AND pg_get_constraintdef(con.oid) LIKE '%REFERENCES properties%'
  ) LOOP
    EXECUTE format('ALTER TABLE public.rooms DROP CONSTRAINT IF EXISTS %I', r.conname);
  END LOOP;

  -- 2. Buat FK baru dengan ON DELETE CASCADE
  ALTER TABLE public.rooms
    ADD CONSTRAINT fk_rooms_property_id
    FOREIGN KEY (property_id)
    REFERENCES public.properties(id)
    ON DELETE CASCADE;

EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Notice on migrating fk_rooms_property_id: %', SQLERRM;
END $$;
