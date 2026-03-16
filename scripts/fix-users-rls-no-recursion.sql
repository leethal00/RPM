-- Fix RLS policies for users table WITHOUT infinite recursion

-- Drop existing policies
DROP POLICY IF EXISTS "users_select" ON users;
DROP POLICY IF EXISTS "users_insert" ON users;
DROP POLICY IF EXISTS "users_update" ON users;
DROP POLICY IF EXISTS "users_delete" ON users;

-- SELECT: Users can view their own row, or if authenticated (simplified)
CREATE POLICY "users_select" ON users FOR SELECT USING (
  auth.uid() = id
  OR
  auth.role() = 'authenticated'
);

-- INSERT: Any authenticated user can insert (we'll validate on app level)
-- OR make it service_role only for production
CREATE POLICY "users_insert" ON users FOR INSERT WITH CHECK (
  auth.role() = 'authenticated'
);

-- UPDATE: Users can only update their own row
CREATE POLICY "users_update" ON users FOR UPDATE USING (
  auth.uid() = id
) WITH CHECK (
  auth.uid() = id
);

-- DELETE: Disable delete via RLS (use service role for user deletion)
-- No DELETE policy = no one can delete via normal queries

-- Verify policies were created
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE tablename = 'users'
ORDER BY policyname;
