-- Phase 1 multi-tenant: lift brands out of stores' hardcoded boolean columns
-- into client-scoped configuration. Enables onboarding additional customers
-- (McDonald's, etc.) without schema changes per customer.
--
-- Migrates the existing St Pierre's Sushi data lossless:
--   - 3 client_brands rows are seeded
--   - For every store, store_brands rows are created from the boolean columns
--   - The 3 boolean columns are then dropped
--
-- Idempotent: safe to re-run.

BEGIN;

-- =====================================================================
-- 1. New tables
-- =====================================================================

-- A customer's brand registry. Each row is one brand the customer operates.
-- e.g. for St Pierre's: ("Sushi of Japan", st-pierres.png),
--                       ("Bento Bowl", bento-bowl.png),
--                       ("K10 Sushi Train", k10.png)
CREATE TABLE IF NOT EXISTS client_brands (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id     UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    key           TEXT NOT NULL,                 -- stable slug, locked after create
    label         TEXT NOT NULL,                 -- display name
    logo_url      TEXT,                          -- /brands/<key>.png or storage URL
    color         TEXT,                          -- optional tint for text-only chips
    display_order INTEGER NOT NULL DEFAULT 0,
    created_at    TIMESTAMPTZ DEFAULT now(),
    updated_at    TIMESTAMPTZ DEFAULT now(),
    UNIQUE (client_id, key)
);

CREATE INDEX IF NOT EXISTS idx_client_brands_client_id ON client_brands(client_id);

-- Which of a customer's brands operate at which sites. Many-to-many.
CREATE TABLE IF NOT EXISTS store_brands (
    store_id UUID NOT NULL REFERENCES stores(id)        ON DELETE CASCADE,
    brand_id UUID NOT NULL REFERENCES client_brands(id) ON DELETE CASCADE,
    PRIMARY KEY (store_id, brand_id)
);

CREATE INDEX IF NOT EXISTS idx_store_brands_store_id ON store_brands(store_id);
CREATE INDEX IF NOT EXISTS idx_store_brands_brand_id ON store_brands(brand_id);

-- Updated-at trigger for client_brands
DROP TRIGGER IF EXISTS client_brands_set_updated_at ON client_brands;
CREATE TRIGGER client_brands_set_updated_at
    BEFORE UPDATE ON client_brands
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =====================================================================
-- 2. Seed St Pierre's Sushi brands + backfill store_brands from booleans
-- =====================================================================
DO $$
DECLARE
    sp_client_id  UUID;
    brand_sp_id   UUID;
    brand_bb_id   UUID;
    brand_k10_id  UUID;
BEGIN
    SELECT id INTO sp_client_id FROM clients WHERE name = 'St Pierre''s Sushi' LIMIT 1;

    IF sp_client_id IS NULL THEN
        RAISE NOTICE 'No St Pierre''s Sushi client found — skipping seed';
        RETURN;
    END IF;

    -- Insert / get the 3 brands. ON CONFLICT makes this idempotent.
    INSERT INTO client_brands (client_id, key, label, logo_url, display_order)
    VALUES (sp_client_id, 'st_pierres', 'Sushi of Japan',  '/brands/st-pierres.png', 0)
    ON CONFLICT (client_id, key) DO UPDATE SET label = EXCLUDED.label
    RETURNING id INTO brand_sp_id;

    INSERT INTO client_brands (client_id, key, label, logo_url, display_order)
    VALUES (sp_client_id, 'bento_bowl', 'Bento Bowl', '/brands/bento-bowl.png', 1)
    ON CONFLICT (client_id, key) DO UPDATE SET label = EXCLUDED.label
    RETURNING id INTO brand_bb_id;

    INSERT INTO client_brands (client_id, key, label, logo_url, display_order)
    VALUES (sp_client_id, 'k10', 'K10 Sushi Train', '/brands/k10.png', 2)
    ON CONFLICT (client_id, key) DO UPDATE SET label = EXCLUDED.label
    RETURNING id INTO brand_k10_id;

    -- Backfill store_brands from existing booleans (idempotent via ON CONFLICT).
    -- Only proceeds if the boolean columns still exist — if a previous run
    -- already dropped them this is skipped.
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'stores'
              AND column_name = 'brand_st_pierres'
    ) THEN
        INSERT INTO store_brands (store_id, brand_id)
        SELECT s.id, brand_sp_id
        FROM stores s
        WHERE s.brand_st_pierres = true AND s.client_id = sp_client_id
        ON CONFLICT DO NOTHING;

        INSERT INTO store_brands (store_id, brand_id)
        SELECT s.id, brand_bb_id
        FROM stores s
        WHERE s.brand_bento_bowl = true AND s.client_id = sp_client_id
        ON CONFLICT DO NOTHING;

        INSERT INTO store_brands (store_id, brand_id)
        SELECT s.id, brand_k10_id
        FROM stores s
        WHERE s.brand_k10 = true AND s.client_id = sp_client_id
        ON CONFLICT DO NOTHING;
    END IF;
END$$;

-- =====================================================================
-- 3. Drop the legacy boolean columns
-- =====================================================================
ALTER TABLE stores DROP COLUMN IF EXISTS brand_st_pierres;
ALTER TABLE stores DROP COLUMN IF EXISTS brand_bento_bowl;
ALTER TABLE stores DROP COLUMN IF EXISTS brand_k10;

-- =====================================================================
-- 4. RLS policies
-- =====================================================================
ALTER TABLE client_brands ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_brands  ENABLE ROW LEVEL SECURITY;

-- client_brands: admins manage everything; client_hq sees their own brands
DROP POLICY IF EXISTS client_brands_admin_all     ON client_brands;
DROP POLICY IF EXISTS client_brands_client_select ON client_brands;

CREATE POLICY client_brands_admin_all ON client_brands
    FOR ALL
    USING (public.get_my_role() IN ('super_admin', 'rodier_admin'))
    WITH CHECK (public.get_my_role() IN ('super_admin', 'rodier_admin'));

CREATE POLICY client_brands_client_select ON client_brands
    FOR SELECT
    USING (
        public.get_my_role() IN ('super_admin', 'rodier_admin')
        OR client_id = public.get_my_client_id()
    );

-- store_brands: visibility follows the store. Admin manages; others view
-- whatever stores they have access to.
DROP POLICY IF EXISTS store_brands_admin_all     ON store_brands;
DROP POLICY IF EXISTS store_brands_client_select ON store_brands;

CREATE POLICY store_brands_admin_all ON store_brands
    FOR ALL
    USING (public.get_my_role() IN ('super_admin', 'rodier_admin'))
    WITH CHECK (public.get_my_role() IN ('super_admin', 'rodier_admin'));

CREATE POLICY store_brands_client_select ON store_brands
    FOR SELECT
    USING (
        public.get_my_role() IN ('super_admin', 'rodier_admin')
        OR EXISTS (
            SELECT 1 FROM stores s
            WHERE s.id = store_brands.store_id
              AND s.client_id = public.get_my_client_id()
        )
    );

COMMIT;
