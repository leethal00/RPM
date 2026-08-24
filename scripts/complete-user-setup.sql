-- Complete user setup by inserting into public.users
-- Run this in Supabase SQL Editor after the auth user is created

-- Get the first client ID for assignment
WITH first_client AS (
  SELECT id FROM clients LIMIT 1
)
INSERT INTO users (id, email, name, role, client_id, store_ids)
VALUES (
  '49a0cf11-2f48-46a2-9196-437d7cb3e582', -- Auth user ID from script
  'admin@rpm.dev',
  'Dev Admin',
  'super_admin',
  (SELECT id FROM first_client),
  '{}'
)
ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  name = EXCLUDED.name,
  role = EXCLUDED.role;

-- Verify the user was created
SELECT
  u.id,
  u.email,
  u.name,
  u.role,
  c.name as client_name
FROM users u
LEFT JOIN clients c ON c.id = u.client_id
WHERE u.email = 'admin@rpm.dev';
