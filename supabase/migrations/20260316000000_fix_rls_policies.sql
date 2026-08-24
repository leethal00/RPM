-- Migration: Fix RLS policies to eliminate recursive queries
-- Date: 2026-03-16
-- Description: Creates a SECURITY DEFINER function to check user roles without
--   triggering RLS recursion, then updates all table policies to use it.
--   Run this on production when promoting from dev.

-- ============================================
-- Step 1: Create non-recursive role helper
-- ============================================
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role::text FROM users WHERE id = auth.uid();
$$;

-- ============================================
-- Step 2: Fix USERS table policies
-- ============================================
DROP POLICY IF EXISTS "users_select" ON users;
DROP POLICY IF EXISTS "users_insert" ON users;
DROP POLICY IF EXISTS "users_update" ON users;
DROP POLICY IF EXISTS "users_delete" ON users;

-- SELECT: All authenticated users can view users
CREATE POLICY "users_select" ON users FOR SELECT USING (
  auth.role() = 'authenticated'
);

-- INSERT: Only super_admin and rodier_admin can create users
CREATE POLICY "users_insert" ON users FOR INSERT WITH CHECK (
  public.get_my_role() IN ('super_admin', 'rodier_admin')
);

-- UPDATE: Users can update themselves, admins can update anyone
CREATE POLICY "users_update" ON users FOR UPDATE USING (
  auth.uid() = id
  OR public.get_my_role() IN ('super_admin', 'rodier_admin')
) WITH CHECK (
  auth.uid() = id
  OR public.get_my_role() IN ('super_admin', 'rodier_admin')
);

-- DELETE: Only super_admins can delete users
CREATE POLICY "users_delete" ON users FOR DELETE USING (
  public.get_my_role() = 'super_admin'
);

-- ============================================
-- Step 3: Fix CLIENTS table policies
-- ============================================
DROP POLICY IF EXISTS "super_admin_all" ON clients;
DROP POLICY IF EXISTS "client_hq_view" ON clients;
DROP POLICY IF EXISTS "rodier_admin_view_clients" ON clients;

-- Super admins can do everything with clients
CREATE POLICY "super_admin_all" ON clients FOR ALL USING (
  public.get_my_role() = 'super_admin'
);

-- Rodier admins can view all clients
CREATE POLICY "rodier_admin_view_clients" ON clients FOR SELECT USING (
  public.get_my_role() = 'rodier_admin'
);

-- Client HQ can view their own client
CREATE POLICY "client_hq_view" ON clients FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
    AND users.client_id = clients.id
  )
);

-- ============================================
-- Step 4: Fix STORES table policies
-- ============================================
DROP POLICY IF EXISTS "client_isolation_stores" ON stores;
DROP POLICY IF EXISTS "admin_view_stores" ON stores;

-- Admins can see all stores
CREATE POLICY "admin_view_stores" ON stores FOR ALL USING (
  public.get_my_role() IN ('super_admin', 'rodier_admin')
);

-- Client users see their own stores
CREATE POLICY "client_isolation_stores" ON stores FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
    AND users.client_id = stores.client_id
  )
);

-- ============================================
-- Step 5: Grant table permissions to authenticated role
-- ============================================
GRANT SELECT, INSERT, UPDATE, DELETE ON users TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON clients TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON stores TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON assets TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON jobs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON asset_types TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON vendors TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON regions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON maintenance_schedules TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON site_photos TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON asset_photos TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_role() TO anon;
