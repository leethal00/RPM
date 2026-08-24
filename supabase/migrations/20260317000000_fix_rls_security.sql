-- Migration: Fix RLS security issues (ISSUE-RPM-6)
-- Date: 2026-03-17
-- Description: Creates get_my_client_id() SECURITY DEFINER function, fixes all
--   client isolation policies to avoid RLS recursion, enables RLS on asset_types,
--   adds missing write policies, scopes GRANTs, and adds job INSERT for non-admins.

-- ============================================
-- Step 1: Create get_my_client_id() SECURITY DEFINER function
-- ============================================
CREATE OR REPLACE FUNCTION public.get_my_client_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT client_id FROM users WHERE id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION public.get_my_client_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_client_id() TO anon;

-- ============================================
-- Step 2: Fix client_hq_view on clients table
-- ============================================
DROP POLICY IF EXISTS "client_hq_view" ON clients;

CREATE POLICY "client_hq_view" ON clients FOR SELECT USING (
  id = public.get_my_client_id()
);

-- ============================================
-- Step 3: Fix client_isolation_stores on stores table
-- ============================================
DROP POLICY IF EXISTS "client_isolation_stores" ON stores;

CREATE POLICY "client_isolation_stores" ON stores FOR SELECT USING (
  client_id = public.get_my_client_id()
);

-- ============================================
-- Step 4: Fix client_isolation_assets on assets table
-- ============================================
DROP POLICY IF EXISTS "client_isolation_assets" ON assets;

CREATE POLICY "client_isolation_assets" ON assets FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM stores
    WHERE stores.id = assets.store_id
    AND stores.client_id = public.get_my_client_id()
  )
);

-- ============================================
-- Step 5: Fix client_isolation_jobs on jobs table
-- ============================================
DROP POLICY IF EXISTS "client_isolation_jobs" ON jobs;

CREATE POLICY "client_isolation_jobs" ON jobs FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM stores
    WHERE stores.id = jobs.store_id
    AND stores.client_id = public.get_my_client_id()
  )
);

-- ============================================
-- Step 6: Fix vendors policies
-- ============================================
DROP POLICY IF EXISTS "vendors_select" ON vendors;
DROP POLICY IF EXISTS "vendors_insert" ON vendors;

CREATE POLICY "admin_all_vendors" ON vendors FOR ALL USING (
  public.get_my_role() IN ('super_admin', 'rodier_admin')
);

CREATE POLICY "client_view_vendors" ON vendors FOR SELECT USING (
  client_id = public.get_my_client_id()
);

-- ============================================
-- Step 7: Fix projects policies
-- ============================================
DROP POLICY IF EXISTS "projects_select" ON projects;
DROP POLICY IF EXISTS "projects_insert" ON projects;

CREATE POLICY "admin_all_projects" ON projects FOR ALL USING (
  public.get_my_role() IN ('super_admin', 'rodier_admin')
);

CREATE POLICY "client_view_projects" ON projects FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM stores
    WHERE stores.id = projects.store_id
    AND stores.client_id = public.get_my_client_id()
  )
);

-- ============================================
-- Step 8: Fix regions policies (catalog table)
-- ============================================
DROP POLICY IF EXISTS "regions_select" ON regions;
DROP POLICY IF EXISTS "regions_insert" ON regions;

CREATE POLICY "regions_select" ON regions FOR SELECT USING (
  auth.role() = 'authenticated'
);

CREATE POLICY "admin_all_regions" ON regions FOR ALL USING (
  public.get_my_role() IN ('super_admin', 'rodier_admin')
);

-- ============================================
-- Step 9: Fix site_photos policies
-- ============================================
DROP POLICY IF EXISTS "site_photos_select" ON site_photos;

CREATE POLICY "admin_all_site_photos" ON site_photos FOR ALL USING (
  public.get_my_role() IN ('super_admin', 'rodier_admin')
);

CREATE POLICY "client_view_site_photos" ON site_photos FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM stores
    WHERE stores.id = site_photos.store_id
    AND stores.client_id = public.get_my_client_id()
  )
);

CREATE POLICY "client_insert_site_photos" ON site_photos FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM stores
    WHERE stores.id = site_photos.store_id
    AND stores.client_id = public.get_my_client_id()
  )
);

CREATE POLICY "client_delete_site_photos" ON site_photos FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM stores
    WHERE stores.id = site_photos.store_id
    AND stores.client_id = public.get_my_client_id()
  )
);

-- ============================================
-- Step 10: Fix asset_photos policies
-- ============================================
DROP POLICY IF EXISTS "asset_photos_select" ON asset_photos;

CREATE POLICY "admin_all_asset_photos" ON asset_photos FOR ALL USING (
  public.get_my_role() IN ('super_admin', 'rodier_admin')
);

CREATE POLICY "client_view_asset_photos" ON asset_photos FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM assets
    JOIN stores ON stores.id = assets.store_id
    WHERE assets.id = asset_photos.asset_id
    AND stores.client_id = public.get_my_client_id()
  )
);

CREATE POLICY "client_insert_asset_photos" ON asset_photos FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM assets
    JOIN stores ON stores.id = assets.store_id
    WHERE assets.id = asset_photos.asset_id
    AND stores.client_id = public.get_my_client_id()
  )
);

CREATE POLICY "client_delete_asset_photos" ON asset_photos FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM assets
    JOIN stores ON stores.id = assets.store_id
    WHERE assets.id = asset_photos.asset_id
    AND stores.client_id = public.get_my_client_id()
  )
);

-- ============================================
-- Step 11: Fix maintenance_schedules policies
-- ============================================
DROP POLICY IF EXISTS "maintenance_schedules_select" ON maintenance_schedules;

CREATE POLICY "admin_all_maintenance_schedules" ON maintenance_schedules FOR ALL USING (
  public.get_my_role() IN ('super_admin', 'rodier_admin')
);

CREATE POLICY "client_view_maintenance_schedules" ON maintenance_schedules FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM assets
    JOIN stores ON stores.id = assets.store_id
    WHERE assets.id = maintenance_schedules.asset_id
    AND stores.client_id = public.get_my_client_id()
  )
);

-- ============================================
-- Step 12: Enable RLS on asset_types and add policies
-- ============================================
ALTER TABLE asset_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "asset_types_select" ON asset_types FOR SELECT USING (
  auth.role() = 'authenticated'
);

CREATE POLICY "admin_all_asset_types" ON asset_types FOR ALL USING (
  public.get_my_role() IN ('super_admin', 'rodier_admin')
);

-- ============================================
-- Step 13: Add job INSERT policy for non-admin users
-- ============================================
CREATE POLICY "authenticated_insert_jobs" ON jobs FOR INSERT WITH CHECK (
  auth.role() = 'authenticated'
  AND EXISTS (
    SELECT 1 FROM stores
    WHERE stores.id = jobs.store_id
    AND stores.client_id = public.get_my_client_id()
  )
);

-- ============================================
-- Step 14: Scope GRANTs for photo tables (remove UPDATE)
-- ============================================
REVOKE INSERT, UPDATE, DELETE ON site_photos FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON asset_photos FROM authenticated;

GRANT SELECT, INSERT, DELETE ON site_photos TO authenticated;
GRANT SELECT, INSERT, DELETE ON asset_photos TO authenticated;

-- Grant for newly RLS-enabled table
GRANT SELECT, INSERT, UPDATE, DELETE ON asset_types TO authenticated;
