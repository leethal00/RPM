-- Adds a flag for sites whose lat/lng was geocoded approximately
-- (e.g. landed at a mall centroid or a generic street) and need a
-- manual nudge before they should be considered verified.

ALTER TABLE stores
    ADD COLUMN IF NOT EXISTS location_approximate boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN stores.location_approximate IS
    'When true, lat/lng are present but known to be imprecise — UI shows an APPROXIMATE badge instead of VERIFIED.';
