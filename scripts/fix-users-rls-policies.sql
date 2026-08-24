-- Fix RLS policies for users table to allow INSERT and UPDATE

-- Drop existing policies if they exist (to avoid conflicts)
DROP POLICY IF EXISTS "users_select" ON users;
DROP POLICY IF EXISTS "users_insert" ON users;
DROP POLICY IF EXISTS "users_update" ON users;
DROP POLICY IF EXISTS "users_delete" ON users;

-- SELECT: Users can view themselves and super_admins can view all
CREATE POLICY "users_select" ON users FOR SELECT USING (
  auth.uid() = id
  OR
  EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'super_admin')
);

-- INSERT: Super admins and rodier admins can create users
CREATE POLICY "users_insert" ON users FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('super_admin', 'rodier_admin'))
);

-- UPDATE: Users can update themselves, super admins can update all
CREATE POLICY "users_update" ON users FOR UPDATE USING (
  auth.uid() = id
  OR
  EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'super_admin')
);

-- DELETE: Only super admins can delete users
CREATE POLICY "users_delete" ON users FOR DELETE USING (
  EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'super_admin')
);

-- Verify policies were created
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd
FROM pg_policies
WHERE tablename = 'users'
ORDER BY policyname;
