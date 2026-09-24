-- Mobile photos are job records even when the job has no site. Older clients
-- still use installer_register_photo; classify those uploads from the job site.
ALTER TABLE public.installer_photos ADD COLUMN category text;
UPDATE public.installer_photos
  SET category = CASE WHEN store_id IS NULL THEN 'Production' ELSE 'Installation' END;
ALTER TABLE public.installer_photos ALTER COLUMN category SET NOT NULL;
ALTER TABLE public.installer_photos ADD CONSTRAINT installer_photos_category_check
  CHECK (category IN ('Production', 'Installation', 'Site Survey', 'Delivery'));

CREATE FUNCTION rpm_private.installer_photo_category_default()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF NEW.category IS NULL THEN
    NEW.category := CASE WHEN NEW.store_id IS NULL THEN 'Production' ELSE 'Installation' END;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER installer_photo_category_default BEFORE INSERT ON public.installer_photos
  FOR EACH ROW EXECUTE FUNCTION rpm_private.installer_photo_category_default();

-- Keep the original four-argument RPC for older app versions.
CREATE FUNCTION rpm_private.installer_register_job_photo(
  p_job_id uuid, p_path text, p_caption text, p_captured_at timestamptz, p_category text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE photo_id uuid;
BEGIN
  IF p_category NOT IN ('Production', 'Installation', 'Site Survey', 'Delivery') OR p_category IS NULL THEN
    RAISE EXCEPTION 'Invalid job photo category' USING ERRCODE='22023';
  END IF;
  photo_id := rpm_private.installer_register_photo(p_job_id,p_path,p_caption,p_captured_at);
  UPDATE public.installer_photos SET category=p_category WHERE id=photo_id;
  RETURN photo_id;
END $$;
REVOKE ALL ON FUNCTION rpm_private.installer_register_job_photo(uuid,text,text,timestamptz,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION rpm_private.installer_register_job_photo(uuid,text,text,timestamptz,text) TO authenticated;

CREATE FUNCTION public.installer_register_job_photo(
  p_job_id uuid, p_path text, p_caption text, p_captured_at timestamptz, p_category text
) RETURNS uuid LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
  SELECT rpm_private.installer_register_job_photo(p_job_id,p_path,p_caption,p_captured_at,p_category)
$$;
REVOKE ALL ON FUNCTION public.installer_register_job_photo(uuid,text,text,timestamptz,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.installer_register_job_photo(uuid,text,text,timestamptz,text) TO authenticated;

CREATE OR REPLACE FUNCTION rpm_private.installer_workspace(p_job_id uuid DEFAULT NULL, p_site_search text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor public.users; result jsonb;
BEGIN
  SELECT * INTO actor FROM public.users WHERE id=auth.uid();
  IF auth.uid() IS NULL OR actor.role::text <> 'installer' THEN
    RAISE EXCEPTION 'Installer access denied' USING ERRCODE='42501';
  END IF;
  IF p_job_id IS NOT NULL AND NOT rpm_private.installer_can_access_job(p_job_id::text) THEN RAISE EXCEPTION 'Job access denied' USING ERRCODE='42501'; END IF;
  SELECT jsonb_build_object(
    'jobs', coalesce((SELECT jsonb_agg(x ORDER BY x.created_at DESC) FROM (
      SELECT j.id,j.job_number,j.title,j.status,j.store_id,j.created_at,
        s.name site_name,s.address,c.name client_name
      FROM public.costing_jobs j
      LEFT JOIN public.stores s ON s.id=j.store_id LEFT JOIN public.clients c ON c.id=j.client_id
      WHERE NOT j.is_template AND (
        (actor.installer_all_jobs AND rpm_private.installer_is_site_job(j.id))
        OR (j.status::text IN ('approved','in_progress','complete') AND EXISTS
          (SELECT 1 FROM public.installer_jobs a WHERE a.job_id=j.id AND a.user_id=auth.uid()))
      )
    ) x),'[]'::jsonb),
    'sites', coalesce((SELECT jsonb_agg(x ORDER BY x.client_name,x.name) FROM (
      SELECT s.id,s.name,s.address,s.lat,s.lng,s.manager_name,s.manager_phone,
        c.name client_name FROM public.stores s JOIN public.clients c ON c.id=s.client_id
      WHERE s.status::text='active' AND (p_site_search IS NULL OR
        s.name ILIKE '%'||left(p_site_search,80)||'%' OR c.name ILIKE '%'||left(p_site_search,80)||'%')
      ORDER BY c.name,s.name LIMIT 100
    ) x),'[]'::jsonb),
    'job', (SELECT jsonb_build_object('id',j.id,'title',j.title,'job_number',j.job_number,
      'status',j.status,'installation_notes',j.installation_notes,'store_id',j.store_id,
      'site_name',s.name,'address',s.address,'lat',s.lat,'lng',s.lng,'client_name',c.name)
      FROM public.costing_jobs j LEFT JOIN public.stores s ON s.id=j.store_id
      LEFT JOIN public.clients c ON c.id=j.client_id WHERE j.id=p_job_id),
    'documents',coalesce((SELECT jsonb_agg(jsonb_build_object('id',d.id,'title',d.drawing_title,
      'name',d.file_name,'path',d.file_url)) FROM public.site_construction_drawings d
      JOIN public.costing_jobs j ON j.store_id=d.store_id WHERE j.id=p_job_id),'[]'::jsonb),
    'photos',coalesce((SELECT jsonb_agg(jsonb_build_object('id',p.id,'path',p.storage_path,
      'caption',p.caption,'category',p.category,'captured_at',p.captured_at) ORDER BY p.captured_at DESC)
      FROM public.installer_photos p WHERE p.job_id=p_job_id),'[]'::jsonb),
    'site_photos',coalesce((SELECT jsonb_agg(jsonb_build_object('id',p.id,'url',p.url,
      'caption',p.caption) ORDER BY p.created_at DESC)
      FROM public.site_photos p JOIN public.costing_jobs j ON j.store_id=p.store_id
      WHERE j.id=p_job_id),'[]'::jsonb),
    'timer',(SELECT row_to_json(t) FROM (SELECT id,job_id,kind,started_at FROM public.installer_time_sessions
      WHERE user_id=auth.uid() AND stopped_at IS NULL) t)
  ) INTO result;
  RETURN result;
END $$;

