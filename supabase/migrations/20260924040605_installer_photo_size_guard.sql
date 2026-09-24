-- Refuse empty mobile uploads before they become job or site photos.
CREATE OR REPLACE FUNCTION rpm_private.installer_register_photo(p_job_id uuid,p_path text,p_caption text DEFAULT NULL,p_captured_at timestamptz DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor public.users; site uuid; photo_id uuid; assigned boolean;
BEGIN
  SELECT * INTO actor FROM public.users WHERE id=auth.uid();
  IF auth.uid() IS NULL OR actor.role::text <> 'installer' OR p_captured_at IS NULL
    OR p_captured_at > now() + interval '5 minutes' OR length(coalesce(p_caption,''))>500 THEN
    RAISE EXCEPTION 'Photo access denied' USING ERRCODE='42501'; END IF;
  SELECT true,j.store_id INTO assigned,site FROM public.costing_jobs j
    WHERE j.id=p_job_id AND j.status::text IN ('approved','in_progress')
      AND rpm_private.installer_can_access_job(j.id::text);
  IF coalesce(assigned,false)=false OR p_path NOT LIKE p_job_id::text||'/'||auth.uid()::text||'/%'
    OR NOT EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id='installer-photos' AND name=p_path AND (metadata->>'size')::bigint>0) THEN
    RAISE EXCEPTION 'Photo job or file is invalid' USING ERRCODE='42501'; END IF;
  INSERT INTO public.installer_photos(job_id,store_id,user_id,storage_path,caption,captured_at)
    VALUES(p_job_id,site,auth.uid(),p_path,p_caption,p_captured_at)
    ON CONFLICT (storage_path) DO UPDATE SET storage_path=excluded.storage_path
    RETURNING id INTO photo_id;
  RETURN photo_id;
END $$;

