-- Site Construction Set
-- Stores the individual PDF drawing sheets that make up the
-- current/final construction set for each site.
--
-- Revision control and additional drawing disciplines can be
-- added later without changing the basic site/drawing structure.

CREATE TABLE IF NOT EXISTS site_construction_drawings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    store_id UUID NOT NULL
        REFERENCES stores(id)
        ON DELETE CASCADE,

    drawing_number TEXT NOT NULL,
    drawing_title TEXT NOT NULL,

    file_url TEXT NOT NULL,
    file_name TEXT NOT NULL,

    uploaded_by UUID
        REFERENCES users(id)
        ON DELETE SET NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- Indexes
-- ------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_site_construction_drawings_store_id
    ON site_construction_drawings(store_id);

CREATE INDEX IF NOT EXISTS idx_site_construction_drawings_number
    ON site_construction_drawings(store_id, drawing_number);

-- Prevent the same drawing number being entered twice
-- for the same site.
CREATE UNIQUE INDEX IF NOT EXISTS idx_site_construction_drawings_unique_number
    ON site_construction_drawings(store_id, lower(drawing_number));

-- ------------------------------------------------------------
-- Row Level Security
-- ------------------------------------------------------------

ALTER TABLE site_construction_drawings ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------
-- SELECT
--
-- Rodier admins can see all drawings.
-- Client users can see drawings belonging to their own client.
-- ------------------------------------------------------------

DROP POLICY IF EXISTS site_construction_drawings_select
    ON site_construction_drawings;

CREATE POLICY site_construction_drawings_select
ON site_construction_drawings
FOR SELECT
USING (
    EXISTS (
        SELECT 1
        FROM users
        WHERE users.id = auth.uid()
          AND (
              users.role IN ('super_admin', 'rodier_admin')
              OR EXISTS (
                  SELECT 1
                  FROM stores
                  WHERE stores.id = site_construction_drawings.store_id
                    AND stores.client_id = users.client_id
              )
          )
    )
);

-- ------------------------------------------------------------
-- INSERT
--
-- Rodier admins only for the first version.
-- ------------------------------------------------------------

DROP POLICY IF EXISTS site_construction_drawings_insert
    ON site_construction_drawings;

CREATE POLICY site_construction_drawings_insert
ON site_construction_drawings
FOR INSERT
WITH CHECK (
    EXISTS (
        SELECT 1
        FROM users
        WHERE users.id = auth.uid()
          AND users.role IN ('super_admin', 'rodier_admin')
    )
);

-- ------------------------------------------------------------
-- UPDATE
-- ------------------------------------------------------------

DROP POLICY IF EXISTS site_construction_drawings_update
    ON site_construction_drawings;

CREATE POLICY site_construction_drawings_update
ON site_construction_drawings
FOR UPDATE
USING (
    EXISTS (
        SELECT 1
        FROM users
        WHERE users.id = auth.uid()
          AND users.role IN ('super_admin', 'rodier_admin')
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1
        FROM users
        WHERE users.id = auth.uid()
          AND users.role IN ('super_admin', 'rodier_admin')
    )
);

-- ------------------------------------------------------------
-- DELETE
-- ------------------------------------------------------------

DROP POLICY IF EXISTS site_construction_drawings_delete
    ON site_construction_drawings;

CREATE POLICY site_construction_drawings_delete
ON site_construction_drawings
FOR DELETE
USING (
    EXISTS (
        SELECT 1
        FROM users
        WHERE users.id = auth.uid()
          AND users.role IN ('super_admin', 'rodier_admin')
    )
);
