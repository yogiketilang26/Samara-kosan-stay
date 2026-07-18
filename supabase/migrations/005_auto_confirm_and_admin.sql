-- Migration: 005_auto_confirm_and_admin.sql
-- Description: Automatically confirms newly signed-up users to bypass "Email not confirmed" error,
-- and inserts a default admin user with login credentials.

-- 1. Enable pgcrypto extension in extensions schema if it doesn't exist
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- 2. Create the auto-confirm trigger function
CREATE OR REPLACE FUNCTION public.auto_confirm_user_email()
RETURNS TRIGGER AS $$
BEGIN
  NEW.email_confirmed_at := COALESCE(NEW.email_confirmed_at, now());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Bind trigger to auth.users table (BEFORE INSERT)
DROP TRIGGER IF EXISTS tr_auto_confirm_user_email ON auth.users;
CREATE TRIGGER tr_auto_confirm_user_email
  BEFORE INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_confirm_user_email();

-- 4. Create default admin user (admin@samarastay.co.id / samarastay2026)
-- Password hashed using bcrypt ($2a$10$...) via crypt
INSERT INTO auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  recovery_sent_at,
  last_sign_in_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  confirmation_token,
  email_change,
  email_change_token_new,
  recovery_token
)
SELECT
  '00000000-0000-0000-0000-000000000000',
  'a3b8d4c1-7972-46fb-8d4c-5453ec34e717', -- predetermined uuid
  'authenticated',
  'authenticated',
  'admin@samarastay.co.id',
  extensions.crypt('samarastay2026', extensions.gen_salt('bf', 10)),
  now(),
  null,
  null,
  '{"provider": "email", "providers": ["email"]}',
  '{"full_name": "Samara Admin"}',
  now(),
  now(),
  '',
  '',
  '',
  ''
WHERE NOT EXISTS (
  SELECT 1 FROM auth.users WHERE email = 'admin@samarastay.co.id'
);

-- 4.1 Create yogiketilang33@gmail.com admin user with password samarastay2026
INSERT INTO auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  recovery_sent_at,
  last_sign_in_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  confirmation_token,
  email_change,
  email_change_token_new,
  recovery_token
)
SELECT
  '00000000-0000-0000-0000-000000000000',
  'b5c9e1d2-7972-46fb-8d4c-5453ec34e717', -- predetermined uuid for yogiketilang33
  'authenticated',
  'authenticated',
  'yogiketilang33@gmail.com',
  extensions.crypt('samarastay2026', extensions.gen_salt('bf', 10)),
  now(),
  null,
  null,
  '{"provider": "email", "providers": ["email"]}',
  '{"full_name": "Yogi Ketilang"}',
  now(),
  now(),
  '',
  '',
  '',
  ''
WHERE NOT EXISTS (
  SELECT 1 FROM auth.users WHERE email = 'yogiketilang33@gmail.com'
);

-- 5. Insert into public.users to link the admin account as super/admin
INSERT INTO public.users (
  id,
  full_name,
  email,
  role,
  role_id,
  access,
  last_login,
  active,
  created_at
)
SELECT
  'a3b8d4c1-7972-46fb-8d4c-5453ec34e717',
  'Samara Admin',
  'admin@samarastay.co.id',
  'super',
  1,
  'Semua Properti',
  'Baru saja',
  true,
  now()
WHERE NOT EXISTS (
  SELECT 1 FROM public.users WHERE email = 'admin@samarastay.co.id'
);

-- 5.1 Insert yogiketilang33@gmail.com into public.users
INSERT INTO public.users (
  id,
  full_name,
  email,
  role,
  role_id,
  access,
  last_login,
  active,
  created_at
)
SELECT
  'b5c9e1d2-7972-46fb-8d4c-5453ec34e717',
  'Yogi Ketilang',
  'yogiketilang33@gmail.com',
  'super',
  1,
  'Semua Properti',
  'Baru saja',
  true,
  now()
WHERE NOT EXISTS (
  SELECT 1 FROM public.users WHERE email = 'yogiketilang33@gmail.com'
);
