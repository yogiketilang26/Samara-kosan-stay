-- ====================================================================
-- SAMARA STAY ERP — MIGRATION 043: STANDARDIZE PROPERTY_ID TYPES
-- ====================================================================
-- P1-5: Konsistensi tipe data property_id ke BIGINT (menyelaraskan dengan properties.id).

DO $$
DECLARE
  tbl_name TEXT;
  target_tables TEXT[] := ARRAY[
    'rooms', 'bookings', 'tenants', 'users', 'financial_transactions', 
    'journal_entries', 'facilities', 'contract_extensions', 'nearby_amenities'
  ];
BEGIN
  FOREACH tbl_name IN ARRAY target_tables LOOP
    IF EXISTS (
      SELECT FROM information_schema.columns 
      WHERE table_schema = 'public' 
        AND table_name = tbl_name 
        AND column_name = 'property_id'
        AND data_type != 'bigint'
    ) THEN
      BEGIN
        EXECUTE format('ALTER TABLE public.%I ALTER COLUMN property_id TYPE BIGINT USING property_id::BIGINT', tbl_name);
        RAISE NOTICE 'Converted %.property_id to BIGINT', tbl_name;
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Could not convert %.property_id: %', tbl_name, SQLERRM;
      END;
    END IF;
  END LOOP;
END $$;
