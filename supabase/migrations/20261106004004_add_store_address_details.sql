-- Nullable and additive only. No backfill or UPDATE of any existing store.
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS address_details jsonb;

COMMENT ON COLUMN public.stores.address_details IS
    'User-confirmed address components and optional Google place ID. Legacy/manual addresses may have no details. Google coordinates are resolved at map display time, never cached in stores.';
