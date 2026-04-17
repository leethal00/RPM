-- RLS Hardening (Phase 3)
-- Fixes overly permissive Phase 1 policies and adds missing write policies.

-- ============================================================
-- 1. VENDORS — Restrict SELECT to client-scoped
-- ============================================================
DROP POLICY IF EXISTS vendors_select ON vendors;

CREATE POLICY vendors_select ON vendors FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
      AND (
        users.role IN ('super_admin', 'rodier_admin')
        OR users.client_id = vendors.client_id
      )
  )
);

-- Add UPDATE/DELETE for admins only
CREATE POLICY vendors_update ON vendors FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
      AND users.role IN ('super_admin', 'rodier_admin')
  )
);

CREATE POLICY vendors_delete ON vendors FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
      AND users.role IN ('super_admin', 'rodier_admin')
  )
);

-- ============================================================
-- 2. PROJECTS — Restrict SELECT/INSERT to client-scoped via stores
-- ============================================================
DROP POLICY IF EXISTS projects_select ON projects;
DROP POLICY IF EXISTS projects_insert ON projects;

CREATE POLICY projects_select ON projects FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
      AND (
        users.role IN ('super_admin', 'rodier_admin')
        OR (
          -- Project linked to a store the user's client owns
          projects.store_id IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM stores
            WHERE stores.id = projects.store_id
              AND stores.client_id = users.client_id
          )
        )
        OR (
          -- Unlinked projects created by this user
          projects.store_id IS NULL
          AND projects.created_by = auth.uid()
        )
      )
  )
);

CREATE POLICY projects_insert ON projects FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
      AND users.role IN ('super_admin', 'rodier_admin')
  )
);

CREATE POLICY projects_update ON projects FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
      AND users.role IN ('super_admin', 'rodier_admin')
  )
);

CREATE POLICY projects_delete ON projects FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
      AND users.role = 'super_admin'
  )
);

-- ============================================================
-- 3. STORES — Add INSERT/UPDATE/DELETE (only SELECT existed)
-- ============================================================
CREATE POLICY stores_insert ON stores FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
      AND users.role IN ('super_admin', 'rodier_admin')
  )
);

CREATE POLICY stores_update ON stores FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
      AND users.role IN ('super_admin', 'rodier_admin')
  )
);

CREATE POLICY stores_delete ON stores FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
      AND users.role = 'super_admin'
  )
);

-- ============================================================
-- 4. ASSETS — Add SELECT (client-scoped) + INSERT/UPDATE/DELETE
-- ============================================================
CREATE POLICY assets_select ON assets FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM stores
    JOIN users ON users.client_id = stores.client_id
    WHERE stores.id = assets.store_id AND users.id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
      AND users.role IN ('super_admin', 'rodier_admin')
  )
);

CREATE POLICY assets_insert ON assets FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
      AND users.role IN ('super_admin', 'rodier_admin')
  )
);

CREATE POLICY assets_update ON assets FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
      AND users.role IN ('super_admin', 'rodier_admin')
  )
);

CREATE POLICY assets_delete ON assets FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
      AND users.role = 'super_admin'
  )
);

-- ============================================================
-- 5. JOBS — Add SELECT (client-scoped) + INSERT/UPDATE/DELETE
-- ============================================================
CREATE POLICY jobs_select ON jobs FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM stores
    JOIN users ON users.client_id = stores.client_id
    WHERE stores.id = jobs.store_id AND users.id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
      AND users.role IN ('super_admin', 'rodier_admin')
  )
);

-- Any authenticated user can create a job (reporting a fault)
CREATE POLICY jobs_insert ON jobs FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM users WHERE users.id = auth.uid()
  )
);

CREATE POLICY jobs_update ON jobs FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
      AND users.role IN ('super_admin', 'rodier_admin')
  )
  OR (
    -- Assignees and reporters can update their own jobs
    jobs.reported_by = auth.uid() OR jobs.assigned_to = auth.uid()
  )
);

CREATE POLICY jobs_delete ON jobs FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
      AND users.role = 'super_admin'
  )
);

-- ============================================================
-- 6. SITE PHOTOS — Add INSERT/DELETE
-- ============================================================
CREATE POLICY site_photos_insert ON site_photos FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
      AND users.role IN ('super_admin', 'rodier_admin')
  )
);

CREATE POLICY site_photos_delete ON site_photos FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
      AND users.role IN ('super_admin', 'rodier_admin')
  )
);

-- ============================================================
-- 7. ASSET PHOTOS — Add INSERT/DELETE
-- ============================================================
CREATE POLICY asset_photos_insert ON asset_photos FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
      AND users.role IN ('super_admin', 'rodier_admin')
  )
);

CREATE POLICY asset_photos_delete ON asset_photos FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
      AND users.role IN ('super_admin', 'rodier_admin')
  )
);

-- ============================================================
-- 8. STORAGE — Restrict delete to admin roles
-- ============================================================
DROP POLICY IF EXISTS "Authenticated Delete job-attachments" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated Delete site-photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated Delete asset-photos" ON storage.objects;

CREATE POLICY "Admin Delete job-attachments"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'job-attachments'
    AND EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
        AND users.role IN ('super_admin', 'rodier_admin')
    )
  );

CREATE POLICY "Admin Delete site-photos"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'site-photos'
    AND EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
        AND users.role IN ('super_admin', 'rodier_admin')
    )
  );

CREATE POLICY "Admin Delete asset-photos"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'asset-photos'
    AND EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
        AND users.role IN ('super_admin', 'rodier_admin')
    )
  );

-- ============================================================
-- 9. MAINTENANCE SCHEDULES — Add write policies
-- ============================================================
CREATE POLICY maintenance_schedules_insert ON maintenance_schedules FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
      AND users.role IN ('super_admin', 'rodier_admin')
  )
);

CREATE POLICY maintenance_schedules_update ON maintenance_schedules FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
      AND users.role IN ('super_admin', 'rodier_admin')
  )
);

CREATE POLICY maintenance_schedules_delete ON maintenance_schedules FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
      AND users.role = 'super_admin'
  )
);
