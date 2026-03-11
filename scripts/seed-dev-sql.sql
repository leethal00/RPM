-- RPM Dev Database Seed Data (SQL Version)
-- This bypasses API cache issues by using direct SQL

-- ==================== 1. INSERT CLIENTS ====================
INSERT INTO clients (name, primary_color, contact_email, active)
VALUES
  ('St Pierre''s Sushi', '#2D6A4F', 'operations@stpierres.co.nz', true),
  ('Bento Bowl', '#D32F2F', 'admin@bentobowl.co.nz', true),
  ('K10 Sushi Train', '#1976D2', 'info@k10.co.nz', true);

-- ==================== 2. INSERT ASSET TYPES ====================
INSERT INTO asset_types (label, default_interval_days, icon_name)
VALUES
  ('Digital Menu Board', 180, 'Monitor'),
  ('Pylon Sign', 365, 'ArrowUp'),
  ('Fascia Sign', 365, 'Layout'),
  ('Internal Lightbox', 180, 'Box'),
  ('Window Graphics', 365, 'Frame'),
  ('Exterior LED Lighting', 180, 'Lightbulb'),
  ('Drive-Thru Menu Board', 180, 'Car'),
  ('A-Frame Sign', 365, 'Triangle');

-- ==================== 3. INSERT REGIONS ====================
INSERT INTO regions (name)
VALUES
  ('Auckland'),
  ('Wellington'),
  ('Christchurch'),
  ('Hamilton'),
  ('Tauranga'),
  ('Dunedin'),
  ('Palmerston North'),
  ('Queenstown');

-- ==================== 4. INSERT STORES ====================
-- Get client IDs first (using CTEs)
WITH client_ids AS (
  SELECT id, name FROM clients
)
INSERT INTO stores (
  client_id, name, region, address, lat, lng, status,
  brand_st_pierres, brand_bento_bowl, brand_k10,
  site_category, has_drive_thru, maintenance_score,
  manager_name, manager_phone
)
SELECT
  c.id,
  'St Pierre''s — Ponsonby',
  'Auckland',
  '254 Ponsonby Road, Ponsonby, Auckland 1011',
  -36.8530,
  174.7470,
  'active',
  true, false, false,
  'Stand alone', false, 92.5,
  'Sarah Chen', '021 234 5678'
FROM client_ids c WHERE c.name = 'St Pierre''s Sushi'

UNION ALL

SELECT
  c.id,
  'St Pierre''s — Sylvia Park',
  'Auckland',
  '286 Mount Wellington Highway, Mount Wellington, Auckland 1060',
  -36.9150,
  174.8420,
  'active',
  true, true, false,
  'Food court', false, 88.0,
  'Mike Johnson', '021 345 6789'
FROM client_ids c WHERE c.name = 'St Pierre''s Sushi'

UNION ALL

SELECT
  c.id,
  'St Pierre''s — Takapuna',
  'Auckland',
  '22 Hurstmere Road, Takapuna, Auckland 0622',
  -36.7885,
  174.7700,
  'active',
  true, false, false,
  'Stand alone', true, 95.0,
  'Emma Watson', '021 456 7890'
FROM client_ids c WHERE c.name = 'St Pierre''s Sushi'

UNION ALL

SELECT
  c.id,
  'St Pierre''s — Wellington CBD',
  'Wellington',
  '123 Lambton Quay, Wellington 6011',
  -41.2790,
  174.7760,
  'active',
  true, false, false,
  'Stand alone', false, 90.5,
  'David Lee', '021 567 8901'
FROM client_ids c WHERE c.name = 'St Pierre''s Sushi'

UNION ALL

SELECT
  c.id,
  'Bento Bowl — Newmarket',
  'Auckland',
  '277 Broadway, Newmarket, Auckland 1023',
  -36.8690,
  174.7780,
  'active',
  false, true, false,
  'Food court', false, 87.5,
  'Lisa Park', '021 678 9012'
FROM client_ids c WHERE c.name = 'Bento Bowl'

UNION ALL

SELECT
  c.id,
  'Bento Bowl — Christchurch Central',
  'Christchurch',
  '185 High Street, Christchurch 8011',
  -43.5320,
  172.6370,
  'active',
  false, true, false,
  'Stand alone', false, 91.0,
  'Tom Wilson', '021 789 0123'
FROM client_ids c WHERE c.name = 'Bento Bowl'

UNION ALL

SELECT
  c.id,
  'K10 Sushi Train — Queen Street',
  'Auckland',
  '55 Queen Street, Auckland CBD, Auckland 1010',
  -36.8485,
  174.7633,
  'active',
  false, false, true,
  'Stand alone', false, 93.5,
  'Akira Tanaka', '021 890 1234'
FROM client_ids c WHERE c.name = 'K10 Sushi Train';

-- ==================== 5. INSERT VENDORS ====================
WITH client_ids AS (
  SELECT id, name FROM clients
)
INSERT INTO vendors (client_id, name, trade, email, phone, account_code, status)
SELECT
  c.id,
  'Auckland Signage Solutions',
  'Signage',
  'jobs@aucklandsignage.co.nz',
  '09 123 4567',
  'ASS-001',
  'active'
FROM client_ids c WHERE c.name = 'St Pierre''s Sushi'

UNION ALL

SELECT
  c.id,
  'NZ Electrical Services',
  'Electrical',
  'bookings@nzelec.co.nz',
  '09 234 5678',
  'NZES-001',
  'active'
FROM client_ids c WHERE c.name = 'St Pierre''s Sushi'

UNION ALL

SELECT
  c.id,
  'Premier Maintenance Ltd',
  'General Maintenance',
  'ops@premiermaint.co.nz',
  '09 345 6789',
  'PML-001',
  'active'
FROM client_ids c WHERE c.name = 'St Pierre''s Sushi'

UNION ALL

SELECT
  c.id,
  'Southern Refrigeration',
  'Refrigeration',
  'service@southernrefrig.co.nz',
  '03 456 7890',
  'SR-001',
  'active'
FROM client_ids c WHERE c.name = 'Bento Bowl';

-- ==================== 6. INSERT ASSETS ====================
WITH store_ids AS (
  SELECT id, name FROM stores
),
asset_type_ids AS (
  SELECT id, label FROM asset_types
)
INSERT INTO assets (
  store_id, name, asset_type_id, asset_group,
  install_date, last_service_date, service_interval_days,
  status, asset_dimensions, notes
)
-- Assets for each store (3-4 assets per store)
SELECT
  s.id,
  'Main Fascia Sign',
  at.id,
  'external',
  '2022-03-15'::date,
  '2024-09-01'::date,
  365,
  'operational',
  '6m x 1.2m',
  'LED illuminated fascia with brand logo'
FROM store_ids s
CROSS JOIN asset_type_ids at
WHERE at.label = 'Fascia Sign'

UNION ALL

SELECT
  s.id,
  'Digital Menu Board #1',
  at.id,
  'internal',
  '2023-01-10'::date,
  '2025-01-15'::date,
  180,
  'operational',
  '55 inch display',
  'Primary menu display above counter'
FROM store_ids s
CROSS JOIN asset_type_ids at
WHERE at.label = 'Digital Menu Board'

UNION ALL

SELECT
  s.id,
  'Internal Menu Lightbox',
  at.id,
  'internal',
  '2022-03-15'::date,
  '2024-08-20'::date,
  180,
  'operational',
  '2m x 1.5m',
  'Backlit menu board'
FROM store_ids s
CROSS JOIN asset_type_ids at
WHERE at.label = 'Internal Lightbox'

UNION ALL

-- Pylon signs only for stand-alone stores
SELECT
  s.id,
  'Street Pylon Sign',
  at.id,
  'external',
  '2022-03-15'::date,
  '2024-03-20'::date,
  365,
  'operational',
  '8m height',
  'Illuminated pylon with brand identity'
FROM store_ids s
CROSS JOIN asset_type_ids at
WHERE at.label = 'Pylon Sign'
  AND s.id IN (SELECT id FROM stores WHERE site_category = 'Stand alone')

UNION ALL

-- Drive-thru boards only for stores with drive-thru
SELECT
  s.id,
  'Drive-Thru Menu Board',
  at.id,
  'external',
  '2023-06-01'::date,
  '2025-01-10'::date,
  180,
  'operational',
  '3m x 2m',
  'Illuminated drive-thru ordering board'
FROM store_ids s
CROSS JOIN asset_type_ids at
WHERE at.label = 'Drive-Thru Menu Board'
  AND s.id IN (SELECT id FROM stores WHERE has_drive_thru = true);

-- ==================== 7. INSERT PROJECTS ====================
WITH store_ids AS (
  SELECT id, name FROM stores
)
INSERT INTO projects (
  name, description, status, budget, start_date, end_date, store_id
)
SELECT
  'Takapuna Store Refresh 2026',
  'Complete signage and interior refresh including new digital menu boards and updated fascia',
  'in_progress',
  45000.00,
  '2026-02-01'::date,
  '2026-04-30'::date,
  s.id
FROM store_ids s WHERE s.name LIKE '%Takapuna%'

UNION ALL

SELECT
  'Wellington Brand Rollout',
  'Update all signage to new brand guidelines',
  'planning',
  32000.00,
  '2026-05-01'::date,
  '2026-06-30'::date,
  s.id
FROM store_ids s WHERE s.name LIKE '%Wellington%';

-- ==================== 8. INSERT MAINTENANCE SCHEDULES ====================
INSERT INTO maintenance_schedules (asset_id, task_name, frequency_days, next_due_at)
SELECT
  a.id,
  'Preventive Maintenance Inspection',
  a.service_interval_days,
  (CURRENT_TIMESTAMP + (a.service_interval_days || ' days')::interval)
FROM assets a
LIMIT 10;

-- ==================== SUCCESS MESSAGE ====================
DO $$
BEGIN
  RAISE NOTICE '✨ Seed completed successfully!';
  RAISE NOTICE '📊 Summary:';
  RAISE NOTICE '   - 3 clients';
  RAISE NOTICE '   - 8 asset types';
  RAISE NOTICE '   - 8 regions';
  RAISE NOTICE '   - 7 stores';
  RAISE NOTICE '   - 4 vendors';
  RAISE NOTICE '   - ~25 assets';
  RAISE NOTICE '   - 2 projects';
  RAISE NOTICE '   - 10 maintenance schedules';
  RAISE NOTICE '';
  RAISE NOTICE '🎉 Dev environment is ready for testing!';
END $$;
