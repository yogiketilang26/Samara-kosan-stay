-- Migration: 008_drop_auto_confirm_trigger.sql
-- Description: Drops the auto-confirm email trigger and function to enforce standard email confirmation rules.
-- This ensures users must confirm their email before signing in, preventing fake or unverified accounts.

-- Drop the trigger from auth.users
DROP TRIGGER IF EXISTS tr_auto_confirm_user_email ON auth.users;

-- Drop the helper function
DROP FUNCTION IF EXISTS public.auto_confirm_user_email();

-- ⚠️ ACTION REQUIRED: Jalankan migration ini di Supabase SQL Editor
-- Copy and paste the statements below into the Supabase SQL Editor:
/*
DROP TRIGGER IF EXISTS tr_auto_confirm_user_email ON auth.users;
DROP FUNCTION IF EXISTS public.auto_confirm_user_email();
*/
