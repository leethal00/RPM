-- The installer app receives its own private job photos separately. The
-- site gallery feed should include only photos deliberately shared there.
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
      WHERE j.id=p_job_id AND NOT p.internal_only AND p.url <> ''),'[]'::jsonb),
    'timer',(SELECT row_to_json(t) FROM (SELECT id,job_id,kind,started_at FROM public.installer_time_sessions
      WHERE user_id=auth.uid() AND stopped_at IS NULL) t)
  ) INTO result;
  RETURN result;
END $$;
