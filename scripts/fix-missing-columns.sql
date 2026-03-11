-- Fix Missing Columns (run this before seed)
-- This ensures all required columns exist before seeding

-- Add missing columns to stores table
ALTER TABLE stores ADD COLUMN IF NOT EXISTS brand_st_pierres BOOLEAN DEFAULT true;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS brand_bento_bowl BOOLEAN DEFAULT false;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS brand_k10 BOOLEAN DEFAULT false;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS site_type TEXT;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS site_category TEXT DEFAULT 'Stand alone';
ALTER TABLE stores ADD COLUMN IF NOT EXISTS maintenance_score NUMERIC(3, 1);
ALTER TABLE stores ADD COLUMN IF NOT EXISTS hours_of_operation TEXT;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS has_drive_thru BOOLEAN DEFAULT false;

-- Add missing columns to jobs table
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS vendor_id UUID REFERENCES vendors(id);
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id);
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS budget_impact NUMERIC(10, 2);
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS media_urls TEXT[] DEFAULT '{}';

-- Add missing columns to assets table
ALTER TABLE assets ADD COLUMN IF NOT EXISTS asset_group TEXT;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS asset_details TEXT;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS asset_dimensions TEXT;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS next_service_date DATE;

-- Success message
DO $$
BEGIN
  RAISE NOTICE '✅ All missing columns added successfully!';
  RAISE NOTICE 'You can now run the seed script.';
END $$;
