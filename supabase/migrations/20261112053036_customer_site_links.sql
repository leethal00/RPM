BEGIN;

-- Staff can associate a billing customer with existing physical sites without
-- moving those sites, duplicating history, changing Xero, or granting logins.
CREATE TABLE public.customer_site_links (
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (client_id, store_id)
);
CREATE INDEX customer_site_links_store_idx ON public.customer_site_links(store_id);
ALTER TABLE public.customer_site_links ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.customer_site_links FROM anon, authenticated;
GRANT SELECT ON public.customer_site_links TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_site_links TO service_role;
CREATE POLICY customer_site_links_staff_read ON public.customer_site_links
  FOR SELECT TO authenticated
  USING ((SELECT rpm_private.current_role()) IN ('super_admin', 'rodier_admin'));

-- Resolve environment-specific IDs by name; link the current McDonalds fleet.
-- Requiring both the site and its owner to match avoids unrelated locations.
DO $$
DECLARE coates_id uuid; coates_count integer;
BEGIN
  SELECT count(*), min(id::text)::uuid INTO coates_count, coates_id
  FROM public.clients WHERE lower(trim(name)) = 'coates signco';
  IF coates_count > 1 THEN
    RAISE EXCEPTION 'Coates Signco customer is ambiguous; resolve before linking sites';
  END IF;
  IF coates_count = 1 THEN
    INSERT INTO public.customer_site_links(client_id, store_id)
    SELECT coates_id, s.id FROM public.stores s JOIN public.clients c ON c.id = s.client_id
    WHERE regexp_replace(lower(s.name), '[^a-z]', '', 'g') LIKE 'mcdonalds%'
      AND regexp_replace(lower(c.name), '[^a-z]', '', 'g') LIKE 'mcdonalds%'
    ON CONFLICT DO NOTHING;
  END IF;
END $$;

COMMIT;
