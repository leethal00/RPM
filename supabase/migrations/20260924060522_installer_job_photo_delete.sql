-- Workers may delete only their own, unpublished job photos.
-- Storage is removed through the Storage API before the job row is removed.
CREATE FUNCTION rpm_private.installer_can_delete_photo_path(p_path text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.installer_photos p
    WHERE p.storage_path=p_path
      AND p.user_id=auth.uid()
      AND p.published_site_photo_id IS NULL
      AND rpm_private.current_role()='installer'
      AND rpm_private.installer_can_access_job(p.job_id::text)
  )
$$;
REVOKE ALL ON FUNCTION rpm_private.installer_can_delete_photo_path(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION rpm_private.installer_can_delete_photo_path(text) TO authenticated;

CREATE POLICY installer_photo_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id='installer-photos' AND rpm_private.installer_can_delete_photo_path(name));

CREATE FUNCTION rpm_private.installer_deletable_photo_ids(p_job_id uuid)
RETURNS uuid[] LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE result uuid[];
BEGIN
  IF auth.uid() IS NULL OR rpm_private.current_role()<>'installer'
    OR NOT rpm_private.installer_can_access_job(p_job_id::text) THEN
    RAISE EXCEPTION 'Photo access denied' USING ERRCODE='42501';
  END IF;
  SELECT coalesce(array_agg(p.id), ARRAY[]::uuid[]) INTO result
    FROM public.installer_photos p
    WHERE p.job_id=p_job_id AND p.user_id=auth.uid()
      AND p.published_site_photo_id IS NULL;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION rpm_private.installer_deletable_photo_ids(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION rpm_private.installer_deletable_photo_ids(uuid) TO authenticated;

CREATE FUNCTION public.installer_deletable_photo_ids(p_job_id uuid)
RETURNS uuid[] LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
  SELECT rpm_private.installer_deletable_photo_ids(p_job_id)
$$;
REVOKE ALL ON FUNCTION public.installer_deletable_photo_ids(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.installer_deletable_photo_ids(uuid) TO authenticated;

CREATE FUNCTION rpm_private.installer_delete_job_photo(p_photo_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE photo public.installer_photos;
BEGIN
  IF auth.uid() IS NULL OR rpm_private.current_role()<>'installer' THEN
    RAISE EXCEPTION 'Photo access denied' USING ERRCODE='42501';
  END IF;
  SELECT * INTO photo FROM public.installer_photos WHERE id=p_photo_id FOR UPDATE;
  IF photo.id IS NULL OR photo.user_id<>auth.uid()
    OR photo.published_site_photo_id IS NOT NULL
    OR NOT rpm_private.installer_can_access_job(photo.job_id::text) THEN
    RAISE EXCEPTION 'Photo access denied' USING ERRCODE='42501';
  END IF;
  IF EXISTS (SELECT 1 FROM storage.objects o
    WHERE o.bucket_id='installer-photos' AND o.name=photo.storage_path) THEN
    RAISE EXCEPTION 'Remove the photo file first' USING ERRCODE='23514';
  END IF;
  DELETE FROM public.installer_photos WHERE id=p_photo_id;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION rpm_private.installer_delete_job_photo(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION rpm_private.installer_delete_job_photo(uuid) TO authenticated;

CREATE FUNCTION public.installer_delete_job_photo(p_photo_id uuid)
RETURNS boolean LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
  SELECT rpm_private.installer_delete_job_photo(p_photo_id)
$$;
REVOKE ALL ON FUNCTION public.installer_delete_job_photo(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.installer_delete_job_photo(uuid) TO authenticated;
