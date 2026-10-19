-- A headquarters user can be granted explicit site visibility without becoming
-- the billing customer or changing the site's owner. Jobs and quotes stay out
-- of this pilot scope.
CREATE POLICY client_hq_assigned_sites_read ON public.stores
FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.users u
  WHERE u.id = (SELECT auth.uid()) AND u.role = 'client_hq'
    AND stores.id = ANY(u.store_ids)
));

CREATE POLICY client_hq_assigned_assets_read ON public.assets
FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.users u
  WHERE u.id = (SELECT auth.uid()) AND u.role = 'client_hq'
    AND assets.store_id = ANY(u.store_ids)
));

CREATE POLICY client_hq_assigned_site_photos_read ON public.site_photos
FOR SELECT TO authenticated
USING (internal_only = false AND EXISTS (
  SELECT 1 FROM public.users u
  WHERE u.id = (SELECT auth.uid()) AND u.role = 'client_hq'
    AND site_photos.store_id = ANY(u.store_ids)
));

CREATE POLICY client_hq_assigned_asset_photos_read ON public.asset_photos
FOR SELECT TO authenticated
USING (internal_only = false AND EXISTS (
  SELECT 1 FROM public.assets a JOIN public.users u
    ON a.store_id = ANY(u.store_ids)
  WHERE a.id = asset_photos.asset_id AND u.id = (SELECT auth.uid())
    AND u.role = 'client_hq'
));

CREATE POLICY client_hq_assigned_albums_read ON public.site_photo_albums
FOR SELECT TO authenticated
USING (audience = 'client' AND EXISTS (
  SELECT 1 FROM public.users u
  WHERE u.id = (SELECT auth.uid()) AND u.role = 'client_hq'
    AND site_photo_albums.store_id = ANY(u.store_ids)
));

CREATE POLICY client_hq_assigned_store_brands_read ON public.store_brands
FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.users u
  WHERE u.id = (SELECT auth.uid()) AND u.role = 'client_hq'
    AND store_brands.store_id = ANY(u.store_ids)
));
