-- Give installer accounts optional access to every job containing a Site Time Labour catalogue item.
-- Catalogue and costing rows remain hidden from installer clients by the existing RLS boundary.
BEGIN;
ALTER TABLE public.users ADD COLUMN installer_all_jobs boolean NOT NULL DEFAULT false;
ALTER TABLE public.users ADD CONSTRAINT installer_all_jobs_role CHECK (NOT installer_all_jobs OR role::text='installer');

CREATE OR REPLACE FUNCTION rpm_private.guard_user_access() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF auth.uid() IS NOT NULL AND coalesce(rpm_private.current_role(),'') NOT IN ('super_admin','rodier_admin') AND
   (NEW.role IS DISTINCT FROM OLD.role OR NEW.department_id IS DISTINCT FROM OLD.department_id
    OR NEW.client_id IS DISTINCT FROM OLD.client_id OR NEW.store_ids IS DISTINCT FROM OLD.store_ids
    OR NEW.developer_mode IS DISTINCT FROM OLD.developer_mode
    OR NEW.installer_all_jobs IS DISTINCT FROM OLD.installer_all_jobs
    OR NEW.id IS DISTINCT FROM OLD.id) THEN
   RAISE EXCEPTION 'Only administrators can change access permissions' USING ERRCODE='42501';
 END IF;
 RETURN NEW;
END $$;

CREATE FUNCTION rpm_private.installer_is_site_job(p_job_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.costing_jobs j JOIN public.costing_lines l ON l.job_id=j.id
    LEFT JOIN public.materials m ON m.id=l.material_id
    WHERE j.id=p_job_id AND NOT j.is_template AND j.status::text <> 'cancelled'
      AND ((m.is_labour AND m.description ILIKE 'Site Time Labour%')
        OR (l.material_id IS NULL AND l.section ILIKE 'Labour'
          AND l.description ILIKE 'Site Time Labour%'))
  )
$$;
REVOKE ALL ON FUNCTION rpm_private.installer_is_site_job(uuid) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION rpm_private.installer_can_access_job(p_job_id text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users u WHERE u.id=auth.uid() AND u.role::text='installer'
      AND (EXISTS (SELECT 1 FROM public.installer_jobs a
          WHERE a.user_id=u.id AND a.job_id::text=p_job_id)
        OR (u.installer_all_jobs AND EXISTS (
          SELECT 1 FROM public.costing_jobs j WHERE j.id::text=p_job_id
            AND rpm_private.installer_is_site_job(j.id))))
  )
$$;

CREATE OR REPLACE FUNCTION rpm_private.installer_can_access_site(p_site_id text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT EXISTS (SELECT 1 FROM public.costing_jobs j
    WHERE j.store_id::text=p_site_id AND rpm_private.installer_can_access_job(j.id::text))
$$;

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
      'caption',p.caption,'captured_at',p.captured_at) ORDER BY p.captured_at DESC)
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

CREATE OR REPLACE FUNCTION rpm_private.installer_timer(p_job_id uuid,p_kind text,p_action text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor public.users; current_timer public.installer_time_sessions; result public.installer_time_sessions;
BEGIN
  SELECT * INTO actor FROM public.users WHERE id=auth.uid();
  IF auth.uid() IS NULL OR actor.role::text <> 'installer' OR p_kind NOT IN ('travel','work')
    OR p_action NOT IN ('start','stop') THEN RAISE EXCEPTION 'Timer access denied' USING ERRCODE='42501'; END IF;
  IF p_action='start' AND NOT EXISTS (SELECT 1 FROM public.costing_jobs j
    WHERE j.id=p_job_id AND j.status::text IN ('approved','in_progress')
      AND rpm_private.installer_can_access_job(j.id::text)) THEN
    RAISE EXCEPTION 'Job is not available for time entry' USING ERRCODE='42501'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext(auth.uid()::text));
  SELECT * INTO current_timer FROM public.installer_time_sessions WHERE user_id=auth.uid() AND stopped_at IS NULL;
  IF p_action='start' THEN
    IF current_timer.id IS NOT NULL THEN RAISE EXCEPTION 'Stop the running timer first'; END IF;
    INSERT INTO public.installer_time_sessions(job_id,user_id,kind) VALUES(p_job_id,auth.uid(),p_kind) RETURNING * INTO result;
  ELSE
    IF current_timer.id IS NULL OR current_timer.job_id<>p_job_id OR current_timer.kind<>p_kind THEN
      RAISE EXCEPTION 'No matching running timer'; END IF;
    UPDATE public.installer_time_sessions SET stopped_at=now() WHERE id=current_timer.id RETURNING * INTO result;
  END IF;
  RETURN jsonb_build_object('id',result.id,'job_id',result.job_id,'kind',result.kind,
    'started_at',result.started_at,'stopped_at',result.stopped_at);
END $$;

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
    OR NOT EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id='installer-photos' AND name=p_path) THEN
    RAISE EXCEPTION 'Photo job or file is invalid' USING ERRCODE='42501'; END IF;
  INSERT INTO public.installer_photos(job_id,store_id,user_id,storage_path,caption,captured_at)
    VALUES(p_job_id,site,auth.uid(),p_path,p_caption,p_captured_at)
    ON CONFLICT (storage_path) DO UPDATE SET storage_path=excluded.storage_path
    RETURNING id INTO photo_id;
  RETURN photo_id;
END $$;
COMMIT;

