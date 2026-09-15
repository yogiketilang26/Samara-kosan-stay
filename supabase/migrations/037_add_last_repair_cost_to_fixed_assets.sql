-- =========================================================================
-- Migration 037: Add last_repair_cost column to fixed_assets table
-- Purpose: Persist asset maintenance and repair expense records directly
--          in the Supabase database for long-term auditing and reporting.
-- =========================================================================

ALTER TABLE IF EXISTS fixed_assets 
ADD COLUMN IF NOT EXISTS last_repair_cost NUMERIC DEFAULT 0;

COMMENT ON COLUMN fixed_assets.last_repair_cost IS 'Biaya perbaikan terakhir aset yang dapat dibukukan ke Laporan Keuangan';
