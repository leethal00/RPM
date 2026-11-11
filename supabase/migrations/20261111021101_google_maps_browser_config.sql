-- Stores only the public, HTTP-referrer-restricted Maps JavaScript browser key.
-- Never store a server API key or any other secret in this table.
CREATE TABLE public.google_maps_browser_config (
    id boolean PRIMARY KEY DEFAULT true CHECK (id),
    browser_api_key text NOT NULL CHECK (browser_api_key LIKE 'AIza%'),
    map_id text NOT NULL CHECK (length(trim(map_id)) > 0)
);
ALTER TABLE public.google_maps_browser_config ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.google_maps_browser_config FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.google_maps_browser_config TO service_role;
COMMENT ON TABLE public.google_maps_browser_config IS
    'Public Google Maps browser configuration. Server-only table; authenticated API exposes only the referrer-restricted browser key and map ID.';
