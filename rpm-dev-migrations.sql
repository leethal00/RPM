-- RPM Database Schema (Phase 1)

-- Types
CREATE TYPE user_role AS ENUM ('super_admin', 'rodier_admin', 'technician', 'client_hq', 'client_store');
CREATE TYPE job_type AS ENUM ('fault', 'maintenance', 'project');
CREATE TYPE job_status AS ENUM ('open', 'in_progress', 'resolved', 'closed');
CREATE TYPE store_status AS ENUM ('active', 'inactive', 'maintenance');

-- Tables
CREATE TABLE IF NOT EXISTS clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  logo_url TEXT,
  primary_color TEXT,
  contact_email TEXT,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  name TEXT,
  role user_role NOT NULL DEFAULT 'client_store',
  client_id UUID REFERENCES clients(id),
  store_ids UUID[] DEFAULT '{}',
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS stores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  region TEXT,
  address TEXT,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  manager_name TEXT,
  manager_phone TEXT,
  rodier_account_manager_id UUID REFERENCES users(id),
  status store_status DEFAULT 'active',
  bento_bowl BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS asset_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label TEXT NOT NULL,
  default_interval_days INTEGER DEFAULT 365,
  icon_name TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  asset_type_id UUID REFERENCES asset_types(id),
  install_date DATE,
  last_service_date DATE,
  service_interval_days INTEGER,
  status TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  asset_id UUID REFERENCES assets(id),
  job_type job_type NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  severity TEXT,
  status job_status DEFAULT 'open',
  reported_by UUID NOT NULL REFERENCES users(id),
  assigned_to UUID REFERENCES users(id),
  resolved_at TIMESTAMPTZ,
  photos TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- RLS (Basic isolation by client_id)
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;

-- Policies (Simplified for Phase 1)
-- Super Admins can do everything
CREATE POLICY super_admin_all ON clients FOR ALL USING (
  EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'super_admin')
);

-- Client HQ can view their own client data
CREATE POLICY client_hq_view ON clients FOR SELECT USING (
  EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'client_hq' AND users.client_id = clients.id)
);

-- Stores/Assets/Jobs follow client isolation
CREATE POLICY client_isolation_stores ON stores FOR SELECT USING (
  EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.client_id = stores.client_id)
);

-- (More granular policies would be added here in a production setup)



-- Add Missing Tables and Extensions (Phase 1.5)

-- 1. Create vendors table
CREATE TABLE IF NOT EXISTS vendors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  trade TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  account_code TEXT,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Create projects table
CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'planning',
  budget NUMERIC(10, 2) DEFAULT 0,
  start_date DATE,
  end_date DATE,
  store_id UUID REFERENCES stores(id) ON DELETE SET NULL,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Create regions table
CREATE TABLE IF NOT EXISTS regions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Create site_photos table
CREATE TABLE IF NOT EXISTS site_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 5. Create asset_photos table
CREATE TABLE IF NOT EXISTS asset_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 6. Create maintenance_schedules table
CREATE TABLE IF NOT EXISTS maintenance_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id UUID REFERENCES assets(id) ON DELETE CASCADE,
  task_name TEXT NOT NULL,
  frequency_days INTEGER NOT NULL,
  last_completed_at TIMESTAMPTZ,
  next_due_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 7. Extend stores table
ALTER TABLE stores ADD COLUMN IF NOT EXISTS brand_st_pierres BOOLEAN DEFAULT true;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS brand_k10 BOOLEAN DEFAULT false;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS site_type TEXT;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS site_category TEXT DEFAULT 'Stand alone';
ALTER TABLE stores ADD COLUMN IF NOT EXISTS maintenance_score NUMERIC(3, 1);
ALTER TABLE stores ADD COLUMN IF NOT EXISTS hours_of_operation TEXT;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS has_drive_thru BOOLEAN DEFAULT false;

-- 8. Extend jobs table
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS vendor_id UUID REFERENCES vendors(id);
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id);
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS budget_impact NUMERIC(10, 2);
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS media_urls TEXT[] DEFAULT '{}';

-- 9. Extend assets table
ALTER TABLE assets ADD COLUMN IF NOT EXISTS asset_group TEXT;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS asset_details TEXT;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS asset_dimensions TEXT;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS next_service_date DATE;

-- 10. Enable RLS on new tables
ALTER TABLE vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE regions ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE asset_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance_schedules ENABLE ROW LEVEL SECURITY;

-- 11. Basic RLS Policies for new tables
-- Vendors: Super admins and authenticated users can view
CREATE POLICY vendors_select ON vendors FOR SELECT USING (
  EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid())
);

CREATE POLICY vendors_insert ON vendors FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('super_admin', 'rodier_admin'))
);

-- Projects: Authenticated users can view all projects
CREATE POLICY projects_select ON projects FOR SELECT USING (
  EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid())
);

CREATE POLICY projects_insert ON projects FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid())
);

-- Regions: Public read access for authenticated users
CREATE POLICY regions_select ON regions FOR SELECT USING (
  EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid())
);

CREATE POLICY regions_insert ON regions FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('super_admin', 'rodier_admin'))
);

-- Site photos: Linked to store's client isolation
CREATE POLICY site_photos_select ON site_photos FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM stores
    JOIN users ON users.client_id = stores.client_id
    WHERE stores.id = site_photos.store_id AND users.id = auth.uid()
  )
);

-- Asset photos: Linked to asset's store's client isolation
CREATE POLICY asset_photos_select ON asset_photos FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM assets
    JOIN stores ON stores.id = assets.store_id
    JOIN users ON users.client_id = stores.client_id
    WHERE assets.id = asset_photos.asset_id AND users.id = auth.uid()
  )
);

-- Maintenance schedules: Linked to asset's store's client isolation
CREATE POLICY maintenance_schedules_select ON maintenance_schedules FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM assets
    JOIN stores ON stores.id = assets.store_id
    JOIN users ON users.client_id = stores.client_id
    WHERE assets.id = maintenance_schedules.asset_id AND users.id = auth.uid()
  )
);

-- 12. Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_vendors_client_id ON vendors(client_id);
CREATE INDEX IF NOT EXISTS idx_projects_store_id ON projects(store_id);
CREATE INDEX IF NOT EXISTS idx_site_photos_store_id ON site_photos(store_id);
CREATE INDEX IF NOT EXISTS idx_asset_photos_asset_id ON asset_photos(asset_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_schedules_asset_id ON maintenance_schedules(asset_id);
CREATE INDEX IF NOT EXISTS idx_jobs_vendor_id ON jobs(vendor_id);
CREATE INDEX IF NOT EXISTS idx_jobs_project_id ON jobs(project_id);



-- Storage Buckets and Policies Setup

-- 1. Create storage buckets
INSERT INTO storage.buckets (id, name, public)
VALUES
  ('job-attachments', 'job-attachments', true),
  ('site-photos', 'site-photos', true),
  ('asset-photos', 'asset-photos', true)
ON CONFLICT (id) DO NOTHING;

-- 2. Storage policies for job-attachments
CREATE POLICY "Public Access job-attachments"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'job-attachments');

CREATE POLICY "Authenticated Upload job-attachments"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'job-attachments'
    AND auth.role() = 'authenticated'
  );

CREATE POLICY "Authenticated Delete job-attachments"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'job-attachments'
    AND auth.role() = 'authenticated'
  );

-- 3. Storage policies for site-photos
CREATE POLICY "Public Access site-photos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'site-photos');

CREATE POLICY "Authenticated Upload site-photos"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'site-photos'
    AND auth.role() = 'authenticated'
  );

CREATE POLICY "Authenticated Delete site-photos"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'site-photos'
    AND auth.role() = 'authenticated'
  );

-- 4. Storage policies for asset-photos
CREATE POLICY "Public Access asset-photos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'asset-photos');

CREATE POLICY "Authenticated Upload asset-photos"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'asset-photos'
    AND auth.role() = 'authenticated'
  );

CREATE POLICY "Authenticated Delete asset-photos"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'asset-photos'
    AND auth.role() = 'authenticated'
  );
