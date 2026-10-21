-- =============================================================================
-- SAMARA STAY ERP — MIGRATION 049: OPTIMIZE REALTIME PUBLICATION (C4 / E1)
-- Tujuan: Menghapus tabel audit/internal berfrekuensi tulis tinggi dari publikasi
--         supabase_realtime untuk menekan WAL-to-WebSocket egress tanpa memutus
--         sinkronisasi tabel operasional utama.
-- =============================================================================

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'webhook_events',
    'sent_emails',
    'financial_audit_logs',
    'failed_ledger_postings',
    'ledger_entries'
  ] LOOP
    IF EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime DROP TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;
