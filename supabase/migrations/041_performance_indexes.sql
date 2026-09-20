-- ====================================================================
-- SAMARA STAY ERP — MIGRATION 041: PERFORMANCE INDEXES
-- ====================================================================
-- P1-3: Menambahkan index performa untuk mempercepat query operasional dan analitik:
-- 1. idx_bookings_property_id pada bookings(property_id)
-- 2. idx_bookings_status pada bookings(status)
-- 3. idx_journal_entries_date_prop pada journal_entries(entry_date, property_id)
-- 4. idx_rooms_prop_status pada rooms(property_id, status)

CREATE INDEX IF NOT EXISTS idx_bookings_property_id 
  ON public.bookings(property_id);

CREATE INDEX IF NOT EXISTS idx_bookings_status 
  ON public.bookings(status);

DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'journal_entries') THEN
    IF EXISTS (
      SELECT FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = 'journal_entries' AND column_name = 'entry_date'
    ) THEN
      CREATE INDEX IF NOT EXISTS idx_journal_entries_date_prop 
        ON public.journal_entries(entry_date, property_id);
    END IF;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_rooms_prop_status 
  ON public.rooms(property_id, status);
