-- Site Photo Albums
-- Adds simple per-site photo albums while keeping existing photos in General.

-- ============================================================
-- 1. Create site_photo_albums table
-- ============================================================

CREATE TABLE IF NOT EXISTS site_photo_albums (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_site_photo_albums_store_id
    ON site_photo_albums(store_id);

-- Prevent duplicate album names within the same site.
CREATE UNIQUE INDEX IF NOT EXISTS idx_site_photo_albums_store_name_unique
    ON site_photo_albums(store_id, lower(name));

-- ============================================================
-- 2. Add optional album to site photos
-- ============================================================

ALTER TABLE site_photos
    ADD COLUMN IF NOT EXISTS album_id UUID
    REFERENCES site_photo_albums(id)
    ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_site_photos_album_id
    ON site_photos(album_id);

-- Existing photos deliberately remain album_id = NULL.
-- The application treats NULL as the site's General gallery.

-- ============================================================
-- 3. Enable Row Level Security
-- ============================================================

ALTER TABLE site_photo_albums ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 4. Read access
-- ============================================================

DROP POLICY IF EXISTS site_photo_albums_select
    ON site_photo_albums;

CREATE POLICY site_photo_albums_select
    ON site_photo_albums
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
                      WHERE stores.id = site_photo_albums.store_id
                        AND stores.client_id = users.client_id
                  )
              )
        )
    );

-- ============================================================
-- 5. Album management
-- ============================================================

DROP POLICY IF EXISTS site_photo_albums_insert
    ON site_photo_albums;

CREATE POLICY site_photo_albums_insert
    ON site_photo_albums
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1
            FROM users
            WHERE users.id = auth.uid()
              AND users.role IN ('super_admin', 'rodier_admin')
        )
    );

DROP POLICY IF EXISTS site_photo_albums_update
    ON site_photo_albums;

CREATE POLICY site_photo_albums_update
    ON site_photo_albums
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

DROP POLICY IF EXISTS site_photo_albums_delete
    ON site_photo_albums;

CREATE POLICY site_photo_albums_delete
    ON site_photo_albums
    FOR DELETE
    USING (
        EXISTS (
            SELECT 1
            FROM users
            WHERE users.id = auth.uid()
              AND users.role IN ('super_admin', 'rodier_admin')
        )
    );

-- ============================================================
-- 6. Allow existing site photos to be moved between albums
-- ============================================================

DROP POLICY IF EXISTS site_photos_update
    ON site_photos;

CREATE POLICY site_photos_update
    ON site_photos
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
