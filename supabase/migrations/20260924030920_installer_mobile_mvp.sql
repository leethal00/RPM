-- Installer mobile access is deliberately projected through RPCs. Costing rows
-- contain prices and must never be selected directly by an installer.
BEGIN;
ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'installer';
COMMIT;

BEGIN;
ALTER TABLE public.costing_jobs ADD COLUMN installation_notes text;
CREATE TABLE public.installer_jobs (
  job_id uuid NOT NULL REFERENCES public.costing_jobs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (job_id, user_id)
);
CREATE INDEX installer_jobs_user_idx ON public.installer_jobs(user_id);

CREATE TABLE public.installer_time_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.costing_jobs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('travel','work')),
  started_at timestamptz NOT NULL DEFAULT now(),
  stopped_at timestamptz,
  CHECK (stopped_at IS NULL OR stopped_at >= started_at)
);
CREATE UNIQUE INDEX installer_one_running_timer ON public.installer_time_sessions(user_id) WHERE stopped_at IS NULL;
CREATE INDEX installer_time_job_idx ON public.installer_time_sessions(job_id, started_at DESC);

CREATE TABLE public.installer_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.costing_jobs(id) ON DELETE CASCADE,
  store_id uuid REFERENCES public.stores(id),
  user_id uuid NOT NULL REFERENCES public.users(id),
  storage_path text NOT NULL UNIQUE,
  caption text,
  captured_at timestamptz NOT NULL,
  uploaded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX installer_photos_job_idx ON public.installer_photos(job_id, uploaded_at DESC);

ALTER TABLE public.installer_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.installer_time_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.installer_photos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.installer_jobs, public.installer_time_sessions, public.installer_photos FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.installer_jobs TO authenticated;
GRANT SELECT ON public.installer_time_sessions, public.installer_photos TO authenticated;
CREATE POLICY installer_jobs_admin ON public.installer_jobs FOR ALL TO authenticated
  USING (rpm_private.current_role() IN ('super_admin','rodier_admin'))
  WITH CHECK (rpm_private.current_role() IN ('super_admin','rodier_admin'));
CREATE POLICY installer_time_admin ON public.installer_time_sessions FOR SELECT TO authenticated
  USING (rpm_private.current_role() IN ('super_admin','rodier_admin'));
CREATE POLICY installer_photos_admin ON public.installer_photos FOR SELECT TO authenticated
  USING (rpm_private.current_role() IN ('super_admin','rodier_admin'));

-- Existing permissive policies cannot override these boundaries. The own
-- profile exception is required for login and works with the existing policy.
DO $$ DECLARE t record; BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname='public'
    AND tablename NOT IN ('users','installer_jobs','installer_time_sessions','installer_photos') LOOP
    EXECUTE format('CREATE POLICY installer_boundary ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (coalesce(rpm_private.current_role(), '''') <> ''installer'') WITH CHECK (coalesce(rpm_private.current_role(), '''') <> ''installer'')', t.tablename);
  END LOOP;
END $$;
CREATE POLICY installer_own_profile ON public.users AS RESTRICTIVE FOR ALL TO authenticated
  USING (rpm_private.current_role() <> 'installer' OR id = auth.uid())
  WITH CHECK (rpm_private.current_role() <> 'installer' OR id = auth.uid());

INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES ('installer-photos','installer-photos',false,10485760,ARRAY['image/jpeg','image/png','image/webp'])
ON CONFLICT (id) DO UPDATE SET public=false, file_size_limit=10485760,
  allowed_mime_types=ARRAY['image/jpeg','image/png','image/webp'];

CREATE FUNCTION rpm_private.installer_can_access_job(p_job_id text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT EXISTS (SELECT 1 FROM public.installer_jobs a WHERE a.user_id=auth.uid() AND a.job_id::text=p_job_id)
$$;
REVOKE ALL ON FUNCTION rpm_private.installer_can_access_job(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION rpm_private.installer_can_access_job(text) TO authenticated;

CREATE FUNCTION rpm_private.installer_can_access_site(p_site_id text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT EXISTS (SELECT 1 FROM public.installer_jobs a JOIN public.costing_jobs j ON j.id=a.job_id
    WHERE a.user_id=auth.uid() AND j.store_id::text=p_site_id)
$$;
REVOKE ALL ON FUNCTION rpm_private.installer_can_access_site(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION rpm_private.installer_can_access_site(text) TO authenticated;

-- Existing storage policies for unrelated buckets remain unchanged for
-- existing roles. Installers can only upload to an assigned job path.
CREATE POLICY installer_storage_boundary ON storage.objects AS RESTRICTIVE FOR ALL TO authenticated
  USING (coalesce(rpm_private.current_role(),'') <> 'installer' OR
    (bucket_id='installer-photos' AND (storage.foldername(name))[2]=auth.uid()::text AND
      rpm_private.installer_can_access_job((storage.foldername(name))[1])) OR
    (bucket_id='construction-drawings' AND rpm_private.installer_can_access_site((storage.foldername(name))[1])))
  WITH CHECK (coalesce(rpm_private.current_role(),'') <> 'installer' OR
    (bucket_id='installer-photos' AND (storage.foldername(name))[2]=auth.uid()::text AND
      rpm_private.installer_can_access_job((storage.foldername(name))[1])));
CREATE POLICY installer_photo_upload ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id='installer-photos' AND rpm_private.current_role()='installer');
CREATE POLICY installer_photo_read ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id='installer-photos' AND rpm_private.current_role()='installer');
CREATE POLICY installer_photo_admin ON storage.objects FOR ALL TO authenticated
  USING (bucket_id='installer-photos' AND rpm_private.current_role() IN ('super_admin','rodier_admin'))
  WITH CHECK (bucket_id='installer-photos' AND rpm_private.current_role() IN ('super_admin','rodier_admin'));

CREATE FUNCTION rpm_private.installer_workspace(p_job_id uuid DEFAULT NULL, p_site_search text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor public.users; result jsonb;
BEGIN
  SELECT * INTO actor FROM public.users WHERE id=auth.uid();
  IF auth.uid() IS NULL OR actor.role::text <> 'installer' THEN
    RAISE EXCEPTION 'Installer access denied' USING ERRCODE='42501';
  END IF;
  IF p_job_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.installer_jobs a WHERE a.job_id=p_job_id AND a.user_id=auth.uid()
  ) THEN RAISE EXCEPTION 'Job access denied' USING ERRCODE='42501'; END IF;
  SELECT jsonb_build_object(
    'jobs', coalesce((SELECT jsonb_agg(x ORDER BY x.created_at DESC) FROM (
      SELECT j.id,j.job_number,j.title,j.status,j.store_id,j.created_at,
        s.name site_name,s.address,c.name client_name
      FROM public.installer_jobs a JOIN public.costing_jobs j ON j.id=a.job_id
      LEFT JOIN public.stores s ON s.id=j.store_id LEFT JOIN public.clients c ON c.id=j.client_id
      WHERE a.user_id=auth.uid() AND NOT j.is_template
        AND j.status::text IN ('approved','in_progress','complete')
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

CREATE FUNCTION rpm_private.installer_timer(p_job_id uuid,p_kind text,p_action text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor public.users; current_timer public.installer_time_sessions; result public.installer_time_sessions;
BEGIN
  SELECT * INTO actor FROM public.users WHERE id=auth.uid();
  IF auth.uid() IS NULL OR actor.role::text <> 'installer' OR p_kind NOT IN ('travel','work')
    OR p_action NOT IN ('start','stop') THEN RAISE EXCEPTION 'Timer access denied' USING ERRCODE='42501'; END IF;
  IF p_action='start' AND NOT EXISTS (SELECT 1 FROM public.installer_jobs a JOIN public.costing_jobs j ON j.id=a.job_id
    WHERE a.user_id=auth.uid() AND a.job_id=p_job_id
      AND j.status::text IN ('approved','in_progress')) THEN
    RAISE EXCEPTION 'Job is not assigned or is closed' USING ERRCODE='42501'; END IF;
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

CREATE FUNCTION rpm_private.installer_register_photo(p_job_id uuid,p_path text,p_caption text DEFAULT NULL,p_captured_at timestamptz DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor public.users; site uuid; photo_id uuid; assigned boolean;
BEGIN
  SELECT * INTO actor FROM public.users WHERE id=auth.uid();
  IF auth.uid() IS NULL OR actor.role::text <> 'installer' OR p_captured_at IS NULL
    OR p_captured_at > now() + interval '5 minutes' OR length(coalesce(p_caption,''))>500 THEN
    RAISE EXCEPTION 'Photo access denied' USING ERRCODE='42501'; END IF;
  SELECT true,j.store_id INTO assigned,site FROM public.installer_jobs a JOIN public.costing_jobs j ON j.id=a.job_id
    WHERE a.job_id=p_job_id AND a.user_id=auth.uid() AND j.status::text IN ('approved','in_progress');
  IF coalesce(assigned,false)=false OR p_path NOT LIKE p_job_id::text||'/'||auth.uid()::text||'/%'
    OR NOT EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id='installer-photos' AND name=p_path) THEN
    RAISE EXCEPTION 'Photo job or file is invalid' USING ERRCODE='42501'; END IF;
  INSERT INTO public.installer_photos(job_id,store_id,user_id,storage_path,caption,captured_at)
    VALUES(p_job_id,site,auth.uid(),p_path,p_caption,p_captured_at)
    ON CONFLICT (storage_path) DO UPDATE SET storage_path=excluded.storage_path
    RETURNING id INTO photo_id;
  RETURN photo_id;
END $$;

REVOKE ALL ON FUNCTION rpm_private.installer_workspace(uuid,text),
  rpm_private.installer_timer(uuid,text,text),
  rpm_private.installer_register_photo(uuid,text,text,timestamptz) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION rpm_private.installer_workspace(uuid,text),
  rpm_private.installer_timer(uuid,text,text),
  rpm_private.installer_register_photo(uuid,text,text,timestamptz) TO authenticated;
CREATE FUNCTION public.installer_workspace(p_job_id uuid DEFAULT NULL,p_site_search text DEFAULT NULL)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT rpm_private.installer_workspace(p_job_id,p_site_search) $$;
CREATE FUNCTION public.installer_timer(p_job_id uuid,p_kind text,p_action text)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT rpm_private.installer_timer(p_job_id,p_kind,p_action) $$;
CREATE FUNCTION public.installer_register_photo(p_job_id uuid,p_path text,p_caption text DEFAULT NULL,p_captured_at timestamptz DEFAULT NULL)
RETURNS uuid LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT rpm_private.installer_register_photo(p_job_id,p_path,p_caption,p_captured_at) $$;
REVOKE ALL ON FUNCTION public.installer_workspace(uuid,text),public.installer_timer(uuid,text,text),
  public.installer_register_photo(uuid,text,text,timestamptz) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.installer_workspace(uuid,text),public.installer_timer(uuid,text,text),
  public.installer_register_photo(uuid,text,text,timestamptz) TO authenticated;
COMMIT;
