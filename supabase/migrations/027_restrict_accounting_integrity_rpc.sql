-- ====================================================================
-- SAMARA STAY ERP v14 — MIGRATION 027: RESTRICT REPAIR ACCOUNTING RPC
-- ====================================================================
-- Menutup celah otorisasi RPC repair_accounting_integrity agar hanya dapat
-- dieksekusi oleh service_role (backend server terverifikasi), bukan oleh
-- sembarang authenticated user dari browser client.

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'repair_accounting_integrity') THEN
        REVOKE EXECUTE ON FUNCTION public.repair_accounting_integrity(text[]) FROM authenticated;
        REVOKE EXECUTE ON FUNCTION public.repair_accounting_integrity(text[]) FROM public;
        GRANT EXECUTE ON FUNCTION public.repair_accounting_integrity(text[]) TO service_role;
    END IF;
END $$;
