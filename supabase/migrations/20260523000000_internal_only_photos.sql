-- Photos can now be marked "internal only" — visible to staff
-- (super_admin, rodier_admin, technician) but hidden from client roles
-- (client_hq, client_store). Used by the service teams for before/after
-- work shots and other staff-internal documentation that the customer
-- shouldn't see when they log in.
--
-- The boolean defaults to false so existing photos remain client-visible
-- (the current behaviour). The UI surfaces a "Service team only" toggle
-- at upload time so flags are deliberate.

BEGIN;

-- 1. Column
ALTER TABLE public.site_photos
    ADD COLUMN IF NOT EXISTS internal_only boolean NOT NULL DEFAULT false;
ALTER TABLE public.asset_photos
    ADD COLUMN IF NOT EXISTS internal_only boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.site_photos.internal_only IS
    'When true, this photo is hidden from client_hq/client_store roles via RLS.';
COMMENT ON COLUMN public.asset_photos.internal_only IS
    'When true, this photo is hidden from client_hq/client_store roles via RLS.';

-- 2. Refresh client view policies to filter out internal_only photos.
DROP POLICY IF EXISTS client_view_site_photos ON public.site_photos;
CREATE POLICY client_view_site_photos ON public.site_photos
    FOR SELECT USING (
        internal_only = false
        AND EXISTS (
            SELECT 1 FROM stores
            WHERE stores.id = site_photos.store_id
              AND stores.client_id = get_my_client_id()
        )
    );

DROP POLICY IF EXISTS client_view_asset_photos ON public.asset_photos;
CREATE POLICY client_view_asset_photos ON public.asset_photos
    FOR SELECT USING (
        internal_only = false
        AND EXISTS (
            SELECT 1
            FROM assets
            JOIN stores ON stores.id = assets.store_id
            WHERE assets.id = asset_photos.asset_id
              AND stores.client_id = get_my_client_id()
        )
    );

-- admin_all_* policies are unchanged — admins continue to see everything,
-- including internal_only photos.

COMMIT;
