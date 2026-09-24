-- Internal site uploads use private storage until explicitly shared.
ALTER TABLE public.site_photos ADD COLUMN private_storage_path text;

INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES ('site-internal-photos','site-internal-photos',false,20971520,
  ARRAY['image/jpeg','image/png','image/webp','image/gif'])
ON CONFLICT (id) DO UPDATE SET public=false, file_size_limit=20971520,
  allowed_mime_types=ARRAY['image/jpeg','image/png','image/webp','image/gif'];

CREATE POLICY site_internal_photos_admin ON storage.objects FOR ALL TO authenticated
  USING (bucket_id='site-internal-photos' AND rpm_private.current_role() IN ('super_admin','rodier_admin'))
  WITH CHECK (bucket_id='site-internal-photos' AND rpm_private.current_role() IN ('super_admin','rodier_admin'));
CREATE POLICY site_internal_photos_boundary ON storage.objects AS RESTRICTIVE FOR ALL TO anon,authenticated
  USING (bucket_id<>'site-internal-photos' OR
    (auth.uid() IS NOT NULL AND rpm_private.current_role() IN ('super_admin','rodier_admin')))
  WITH CHECK (bucket_id<>'site-internal-photos' OR
    (auth.uid() IS NOT NULL AND rpm_private.current_role() IN ('super_admin','rodier_admin')));

REVOKE ALL ON public.site_photo_albums FROM anon;
REVOKE ALL ON FUNCTION rpm_private.validate_site_photo_album() FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION rpm_private.validate_installer_photo_album() FROM PUBLIC,anon;
