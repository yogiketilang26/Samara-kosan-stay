-- Migration: 012_relax_sent_emails_legacy_columns.sql
-- Description: Relaxes NOT NULL constraints on legacy columns ("to", body) in sent_emails table to prevent insert failures when logging email errors.

ALTER TABLE public.sent_emails ALTER COLUMN "to" DROP NOT NULL;
ALTER TABLE public.sent_emails ALTER COLUMN body DROP NOT NULL;

-- ⚠️ ACTION REQUIRED: Jalankan SQL di bawah ini di Supabase SQL Editor:
/*
ALTER TABLE public.sent_emails ALTER COLUMN "to" DROP NOT NULL;
ALTER TABLE public.sent_emails ALTER COLUMN body DROP NOT NULL;
*/
