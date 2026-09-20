-- ====================================================================
-- SAMARA STAY ERP — MIGRATION 040: JOURNAL ENTRIES PROPERTY FK RESTRICT
-- ====================================================================
-- P1-2: Ubah Foreign Key property_id di tabel journal_entries dan financial_transactions
-- ke ON DELETE RESTRICT. Jurnal keuangan adalah arsip hukum dan akuntansi abadi,
-- sehingga properti tidak boleh dihapus jika masih memiliki riwayat transaksi/jurnal.

DO $$
BEGIN
  -- 1. Pastikan kolom property_id ada pada tabel journal_entries
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'journal_entries') THEN
    ALTER TABLE public.journal_entries ADD COLUMN IF NOT EXISTS property_id BIGINT;
    
    -- Drop constraint lama jika ada
    ALTER TABLE public.journal_entries DROP CONSTRAINT IF EXISTS fk_journal_entries_property_id;
    ALTER TABLE public.journal_entries DROP CONSTRAINT IF EXISTS journal_entries_property_id_fkey;

    -- Pasang FK baru dengan ON DELETE RESTRICT
    ALTER TABLE public.journal_entries
      ADD CONSTRAINT fk_journal_entries_property_id
      FOREIGN KEY (property_id)
      REFERENCES public.properties(id)
      ON DELETE RESTRICT;
  END IF;

  -- 2. Pastikan tabel financial_transactions juga menerapkan ON DELETE RESTRICT untuk property_id
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'financial_transactions') THEN
    ALTER TABLE public.financial_transactions DROP CONSTRAINT IF EXISTS fk_financial_transactions_property_id;
    ALTER TABLE public.financial_transactions DROP CONSTRAINT IF EXISTS financial_transactions_property_id_fkey;

    ALTER TABLE public.financial_transactions
      ADD CONSTRAINT fk_financial_transactions_property_id
      FOREIGN KEY (property_id)
      REFERENCES public.properties(id)
      ON DELETE RESTRICT;
  END IF;

EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Notice on migrating fk_journal_entries_property_id: %', SQLERRM;
END $$;
