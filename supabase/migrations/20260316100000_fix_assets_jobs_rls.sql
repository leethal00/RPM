-- Migration: Add RLS policies for assets and jobs tables
-- Date: 2026-03-16
-- Description: The assets and jobs tables have RLS enabled but no SELECT policies,
--   causing all queries to return empty arrays. This adds admin and client isolation
--   policies following the same pattern as the stores table.
-- Depends on: 20260316000000_fix_rls_policies.sql (get_my_role function)

-- Ensure get_my_role() exists (idempotent, in case the dependency migration hasn't been applied)
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
-- Assets table policies
-- ============================================
DROP POLICY IF EXISTS "admin_view_assets" ON assets;
DROP POLICY IF EXISTS "client_isolation_assets" ON assets;

-- Admins see all assets
CREATE POLICY "admin_view_assets" ON assets FOR ALL USING (
  public.get_my_role() IN ('super_admin', 'rodier_admin')
);

-- Client users see assets at their stores
CREATE POLICY "client_isolation_assets" ON assets FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM stores
    JOIN users ON users.client_id = stores.client_id
    WHERE stores.id = assets.store_id AND users.id = auth.uid()
  )
);

-- ============================================
-- Jobs table policies
-- ============================================
DROP POLICY IF EXISTS "admin_view_jobs" ON jobs;
DROP POLICY IF EXISTS "client_isolation_jobs" ON jobs;

-- Admins see all jobs
CREATE POLICY "admin_view_jobs" ON jobs FOR ALL USING (
  public.get_my_role() IN ('super_admin', 'rodier_admin')
);

-- Client users see jobs at their stores
CREATE POLICY "client_isolation_jobs" ON jobs FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM stores
    JOIN users ON users.client_id = stores.client_id
    WHERE stores.id = jobs.store_id AND users.id = auth.uid()
  )
);
