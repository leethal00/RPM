-- Keep installer originals in the private bucket until a staff member approves
-- a copy for the public site gallery.
ALTER TABLE public.installer_photos
  ADD COLUMN published_site_photo_id uuid REFERENCES public.site_photos(id) ON DELETE SET NULL;
CREATE INDEX installer_photos_site_review_idx ON public.installer_photos(store_id, uploaded_at DESC)
  WHERE published_site_photo_id IS NULL;

CREATE FUNCTION rpm_private.installer_publish_site_photo(
  p_photo_id uuid, p_public_path text, p_public_url text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE source_photo public.installer_photos; site_photo_id uuid;
BEGIN
  IF auth.uid() IS NULL OR rpm_private.current_role() NOT IN ('super_admin','rodier_admin') THEN
    RAISE EXCEPTION 'Photo review access denied' USING ERRCODE='42501';
  END IF;

  SELECT * INTO source_photo FROM public.installer_photos
    WHERE id=p_photo_id FOR UPDATE;
  IF source_photo.id IS NULL OR source_photo.store_id IS NULL THEN
    RAISE EXCEPTION 'Installation photo has no site' USING ERRCODE='22023';
  END IF;
  IF source_photo.published_site_photo_id IS NOT NULL THEN
    RETURN source_photo.published_site_photo_id;
  END IF;

  IF p_public_path <> 'photos/'||source_photo.store_id::text||'/installation/'||source_photo.id::text||'.jpg'
    OR p_public_url NOT LIKE 'https://%/storage/v1/object/public/site-photos/'||p_public_path
    OR NOT EXISTS (SELECT 1 FROM storage.objects o WHERE o.bucket_id='installer-photos'
      AND o.name=source_photo.storage_path AND (o.metadata->>'size')::bigint>0)
    OR NOT EXISTS (SELECT 1 FROM storage.objects o WHERE o.bucket_id='site-photos'
      AND o.name=p_public_path AND (o.metadata->>'size')::bigint>0) THEN
    RAISE EXCEPTION 'Photo files are missing or invalid' USING ERRCODE='22023';
  END IF;

  INSERT INTO public.site_photos(store_id,url,caption,internal_only,is_primary)
    VALUES (source_photo.store_id,p_public_url,source_photo.caption,false,false)
    RETURNING id INTO site_photo_id;
  UPDATE public.installer_photos SET published_site_photo_id=site_photo_id WHERE id=p_photo_id;
  RETURN site_photo_id;
END $$;
REVOKE ALL ON FUNCTION rpm_private.installer_publish_site_photo(uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION rpm_private.installer_publish_site_photo(uuid,text,text) TO authenticated;

CREATE FUNCTION public.installer_publish_site_photo(
  p_photo_id uuid, p_public_path text, p_public_url text
) RETURNS uuid LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
  SELECT rpm_private.installer_publish_site_photo(p_photo_id,p_public_path,p_public_url)
$$;
REVOKE ALL ON FUNCTION public.installer_publish_site_photo(uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.installer_publish_site_photo(uuid,text,text) TO authenticated;

