-- Reconcile prod ↔ dev branch schema drift discovered during the
-- DiskStation → cloud-dev Supabase migration (2026-05-20).
--
-- This migration is idempotent — safe to run multiple times and on either
-- environment (cloud-dev or prod). After both environments have it applied,
-- their public schemas match the dev branch's app code.
--
-- See SCHEMA_DRIFT.md for the full rationale per column.

BEGIN;

-- =====================================================================
-- 1. Rename: stores.bento_bowl → brand_bento_bowl
-- =====================================================================
-- Prod and DiskStation both had this rename applied manually. The repo's
-- baseline migration created `bento_bowl`. Catching everyone up in code.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'stores'
      AND column_name = 'bento_bowl'
  ) THEN
    ALTER TABLE stores RENAME COLUMN bento_bowl TO brand_bento_bowl;
  END IF;
END$$;

-- Default value alignment — both prod and dev set this to true historically.
ALTER TABLE stores ALTER COLUMN brand_bento_bowl SET DEFAULT false;

-- =====================================================================
-- 2. Widen stores.maintenance_score (precision (3,1) → (5,1))
-- =====================================================================
-- Prod has values that exceed 99.9 (e.g. 100). Make column tolerant.
ALTER TABLE stores ALTER COLUMN maintenance_score TYPE NUMERIC(5,1);

-- =====================================================================
-- 3. Relax assets.name NOT NULL
-- =====================================================================
-- Prod has assets with NULL names (legacy data entry). Repo migration had
-- NOT NULL; production data violates it. Drop the constraint.
ALTER TABLE assets ALTER COLUMN name DROP NOT NULL;

-- =====================================================================
-- 4. KEEP: add prod-only columns that have real data
--    (no-op on prod where they already exist; adds them on cloud-dev)
-- =====================================================================
ALTER TABLE assets       ADD COLUMN IF NOT EXISTS pm_interval_months INTEGER;
ALTER TABLE jobs         ADD COLUMN IF NOT EXISTS responded_at TIMESTAMPTZ;
ALTER TABLE site_photos  ADD COLUMN IF NOT EXISTS caption TEXT;
ALTER TABLE site_photos  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE asset_photos ADD COLUMN IF NOT EXISTS caption TEXT;

-- =====================================================================
-- 5. DROP: prod-only columns that were never populated
--    (no-op on cloud-dev where they don't exist; drops them on prod)
-- =====================================================================
ALTER TABLE asset_types DROP COLUMN IF EXISTS sub_cat_1;
ALTER TABLE asset_types DROP COLUMN IF EXISTS sub_cat_2;
ALTER TABLE asset_types DROP COLUMN IF EXISTS sub_cat_3;
ALTER TABLE asset_types DROP COLUMN IF EXISTS code;
ALTER TABLE assets      DROP COLUMN IF EXISTS asset_code;

-- Vendors — drop the prod-only structure entirely. Safe because prod has 0 vendor rows.
ALTER TABLE vendors DROP COLUMN IF EXISTS address;
ALTER TABLE vendors DROP COLUMN IF EXISTS service_type;

-- =====================================================================
-- 6. ADD: dev-branch columns that prod is missing
--    (no-op on cloud-dev where they exist; adds them on prod)
-- =====================================================================
ALTER TABLE vendors  ADD COLUMN IF NOT EXISTS client_id    UUID REFERENCES clients(id) ON DELETE CASCADE;
ALTER TABLE vendors  ADD COLUMN IF NOT EXISTS trade        TEXT;
ALTER TABLE vendors  ADD COLUMN IF NOT EXISTS account_code TEXT;

-- Prod has 0 vendor rows, so we can safely tighten `trade` NOT NULL now.
-- Wrap in a guard for environments that already had it.
DO $$
BEGIN
  IF (SELECT count(*) FROM vendors) = 0 THEN
    ALTER TABLE vendors ALTER COLUMN trade SET NOT NULL;
  END IF;
END$$;

ALTER TABLE jobs ADD COLUMN IF NOT EXISTS budget_impact NUMERIC(10, 2);
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS project_id    UUID REFERENCES projects(id);
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS vendor_id     UUID REFERENCES vendors(id);
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS media_urls    TEXT[] DEFAULT '{}';

ALTER TABLE projects ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES stores(id) ON DELETE SET NULL;

-- =====================================================================
-- 7. Indexes that may have been missing on prod
-- =====================================================================
CREATE INDEX IF NOT EXISTS idx_vendors_client_id              ON vendors(client_id);
CREATE INDEX IF NOT EXISTS idx_jobs_vendor_id                 ON jobs(vendor_id);
CREATE INDEX IF NOT EXISTS idx_jobs_project_id                ON jobs(project_id);
CREATE INDEX IF NOT EXISTS idx_projects_store_id              ON projects(store_id);
CREATE INDEX IF NOT EXISTS idx_site_photos_store_id           ON site_photos(store_id);
CREATE INDEX IF NOT EXISTS idx_asset_photos_asset_id          ON asset_photos(asset_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_schedules_asset_id ON maintenance_schedules(asset_id);

-- =====================================================================
-- 8. Updated-at trigger for site_photos (since we just added the column)
-- =====================================================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS site_photos_set_updated_at ON site_photos;
CREATE TRIGGER site_photos_set_updated_at
  BEFORE UPDATE ON site_photos
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMIT;
