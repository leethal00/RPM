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
