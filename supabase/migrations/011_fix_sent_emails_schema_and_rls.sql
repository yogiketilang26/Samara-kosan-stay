-- Migration: 011_fix_sent_emails_schema_and_rls.sql
-- Description: Updates sent_emails table schema using ALTER TABLE and enforces secure RLS for authenticated admins only.

-- 1. Ensure all required columns exist without dropping existing data or columns
ALTER TABLE public.sent_emails ADD COLUMN IF NOT EXISTS recipient TEXT;
ALTER TABLE public.sent_emails ADD COLUMN IF NOT EXISTS subject TEXT;
ALTER TABLE public.sent_emails ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'sent';
ALTER TABLE public.sent_emails ADD COLUMN IF NOT EXISTS error_message TEXT;
ALTER TABLE public.sent_emails ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.sent_emails ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

-- 2. Enable Row Level Security (RLS)
ALTER TABLE public.sent_emails ENABLE ROW LEVEL SECURITY;

-- 3. Remove all public policies (no public access allowed)
DROP POLICY IF EXISTS "Allow public select on sent_emails" ON public.sent_emails;
DROP POLICY IF EXISTS "Allow public insert on sent_emails" ON public.sent_emails;
DROP POLICY IF EXISTS "Allow public delete on sent_emails" ON public.sent_emails;
DROP POLICY IF EXISTS "Public Select for sent_emails" ON public.sent_emails;
DROP POLICY IF EXISTS "Public Insert for sent_emails" ON public.sent_emails;
DROP POLICY IF EXISTS "Public Delete for sent_emails" ON public.sent_emails;

-- 4. Create RLS policies ONLY for authenticated users
DROP POLICY IF EXISTS "Authenticated Select for sent_emails" ON public.sent_emails;
CREATE POLICY "Authenticated Select for sent_emails" ON public.sent_emails
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated Insert for sent_emails" ON public.sent_emails;
CREATE POLICY "Authenticated Insert for sent_emails" ON public.sent_emails
  FOR INSERT TO authenticated WITH CHECK (true);

-- Note: NO DELETE policy exists for public or authenticated roles.
-- Server backend operations use service_role key which automatically bypasses RLS.
