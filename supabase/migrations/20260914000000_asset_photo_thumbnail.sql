-- Allow each asset to nominate one photo as its thumbnail for asset lists.
-- At most one photo per asset can be selected. Existing assets are given
-- their most recent photo as a sensible initial thumbnail.

BEGIN;

ALTER TABLE public.asset_photos
    ADD COLUMN IF NOT EXISTS is_thumbnail boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.asset_photos.is_thumbnail IS
    'When true, this photo is used as the asset thumbnail in site asset lists. At most one row per asset_id may be selected.';

-- Backfill one thumbnail for assets that already have photos.
WITH ranked AS (
    SELECT id,
           row_number() OVER (PARTITION BY asset_id ORDER BY created_at DESC, id DESC) AS rn
    FROM public.asset_photos
), chosen AS (
    SELECT id FROM ranked WHERE rn = 1
)
UPDATE public.asset_photos p
SET is_thumbnail = true
FROM chosen c
WHERE p.id = c.id
  AND NOT EXISTS (
      SELECT 1
      FROM public.asset_photos existing
      WHERE existing.asset_id = p.asset_id
        AND existing.is_thumbnail = true
  );

CREATE UNIQUE INDEX IF NOT EXISTS asset_photos_one_thumbnail_per_asset
    ON public.asset_photos (asset_id)
    WHERE is_thumbnail;

COMMIT;
