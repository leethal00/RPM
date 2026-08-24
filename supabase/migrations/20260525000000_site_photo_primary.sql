-- Allow each site to nominate one photo as its "primary" image — the one
-- shown on the map popup and any other summary surface. Without this, the
-- popup just shows whatever photo happens to be first in the list (which
-- ends up being the most recently uploaded, often a fault close-up rather
-- than a representative site shot).
--
-- The partial unique index enforces "at most one primary per store" at the
-- DB layer. UI handlers should clear the old primary before setting a new
-- one to avoid tripping the constraint.

BEGIN;

ALTER TABLE public.site_photos
    ADD COLUMN IF NOT EXISTS is_primary boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.site_photos.is_primary IS
    'When true, this is the photo used as the site''s main image on the map and other summary views. At most one row per store_id may be primary (see site_photos_one_primary_per_store).';

CREATE UNIQUE INDEX IF NOT EXISTS site_photos_one_primary_per_store
    ON public.site_photos (store_id)
    WHERE is_primary;

COMMIT;
