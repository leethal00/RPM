-- Mobile administrators see operational data through scoped RPCs. Hugo's
-- existing Rodier admin profile can use the same mobile surface.
BEGIN;
ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'mobile_admin';
COMMIT;

BEGIN;
-- Existing permissive RLS policies must not expose raw pricing to this role.
DO $$ DECLARE t record; BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname='public'
    AND tablename NOT IN ('users','installer_jobs','installer_time_sessions','installer_photos','installer_job_notes') LOOP
    EXECUTE format('DROP POLICY IF EXISTS installer_boundary ON public.%I', t.tablename);
    EXECUTE format('CREATE POLICY installer_boundary ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (coalesce(rpm_private.current_role(), '''') NOT IN (''installer'',''mobile_admin'')) WITH CHECK (coalesce(rpm_private.current_role(), '''') NOT IN (''installer'',''mobile_admin''))', t.tablename);
  END LOOP;
END $$;
DROP POLICY IF EXISTS mobile_admin_own_profile ON public.users;
CREATE POLICY mobile_admin_own_profile ON public.users AS RESTRICTIVE FOR ALL TO authenticated
  USING (rpm_private.current_role() <> 'mobile_admin' OR id=auth.uid())
  WITH CHECK (rpm_private.current_role() <> 'mobile_admin' OR id=auth.uid());

-- A mobile administrator can use job photos and site drawings but no other bucket.
DROP POLICY IF EXISTS installer_storage_boundary ON storage.objects;
CREATE POLICY installer_storage_boundary ON storage.objects AS RESTRICTIVE FOR ALL TO authenticated
  USING (coalesce(rpm_private.current_role(),'') NOT IN ('installer','mobile_admin') OR
    (bucket_id='installer-photos' AND (rpm_private.current_role()='mobile_admin' OR
      (storage.foldername(name))[2]=auth.uid()::text) AND
      rpm_private.installer_can_access_job((storage.foldername(name))[1])) OR
    (bucket_id='construction-drawings' AND rpm_private.installer_can_access_site((storage.foldername(name))[1])))
  WITH CHECK (coalesce(rpm_private.current_role(),'') NOT IN ('installer','mobile_admin') OR
    (bucket_id='installer-photos' AND (storage.foldername(name))[2]=auth.uid()::text AND
      rpm_private.installer_can_access_job((storage.foldername(name))[1])));
DROP POLICY IF EXISTS mobile_admin_photo_upload ON storage.objects;
CREATE POLICY mobile_admin_photo_upload ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id='installer-photos' AND rpm_private.current_role()='mobile_admin');
DROP POLICY IF EXISTS mobile_admin_photo_read ON storage.objects;
CREATE POLICY mobile_admin_photo_read ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id='installer-photos' AND rpm_private.current_role()='mobile_admin');

CREATE OR REPLACE FUNCTION rpm_private.installer_can_access_job(p_job_id text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users u WHERE u.id=auth.uid() AND
      ((u.role::text IN ('mobile_admin','rodier_admin','super_admin') AND EXISTS (
        SELECT 1 FROM public.costing_jobs j WHERE j.id::text=p_job_id
          AND NOT j.is_template AND j.status::text IN ('approved','in_progress','complete','invoiced','cancelled')))
       OR (u.role::text='installer' AND (EXISTS (
         SELECT 1 FROM public.installer_jobs a WHERE a.user_id=u.id AND a.job_id::text=p_job_id)
         OR (u.installer_all_jobs AND EXISTS (
           SELECT 1 FROM public.costing_jobs j WHERE j.id::text=p_job_id
             AND rpm_private.installer_is_site_job(j.id))))))
  )
$$;

CREATE OR REPLACE FUNCTION rpm_private.installer_can_access_site(p_site_id text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT EXISTS (SELECT 1 FROM public.costing_jobs j
    WHERE j.store_id::text=p_site_id AND rpm_private.installer_can_access_job(j.id::text))
$$;

CREATE OR REPLACE FUNCTION rpm_private.mobile_admin_workspace(p_job_id uuid DEFAULT NULL,p_site_search text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
  IF auth.uid() IS NULL OR rpm_private.current_role() NOT IN ('mobile_admin','rodier_admin','super_admin') THEN
    RAISE EXCEPTION 'Mobile admin access denied' USING ERRCODE='42501';
  END IF;
  IF p_job_id IS NOT NULL AND NOT rpm_private.installer_can_access_job(p_job_id::text) THEN
    RAISE EXCEPTION 'Job access denied' USING ERRCODE='42501';
  END IF;
  SELECT jsonb_build_object(
    'jobs',coalesce((SELECT jsonb_agg(x ORDER BY x.created_at DESC) FROM (
      SELECT j.id,j.job_number,j.title,j.status,j.store_id,j.created_at,s.name site_name,s.address,c.name client_name
      FROM public.costing_jobs j LEFT JOIN public.stores s ON s.id=j.store_id
      LEFT JOIN public.clients c ON c.id=j.client_id
      WHERE NOT j.is_template AND j.status::text IN ('approved','in_progress','complete','invoiced','cancelled')
    ) x),'[]'::jsonb),
    'sites',coalesce((SELECT jsonb_agg(x ORDER BY x.client_name,x.name) FROM (
      SELECT s.id,s.name,s.address,s.lat,s.lng,s.manager_name,s.manager_phone,c.name client_name
      FROM public.stores s JOIN public.clients c ON c.id=s.client_id
      WHERE s.status::text='active' AND (p_site_search IS NULL OR
        s.name ILIKE '%'||left(p_site_search,80)||'%' OR c.name ILIKE '%'||left(p_site_search,80)||'%')
      ORDER BY c.name,s.name LIMIT 100
    ) x),'[]'::jsonb),
    'job',(SELECT jsonb_build_object('id',j.id,'job_number',j.job_number,'title',j.title,
      'status',j.status,'store_id',j.store_id,'installation_notes',j.installation_notes,
      'details',j.details,'production_details',j.production_details,'notes',j.notes,
      'site_name',s.name,'address',s.address,'lat',s.lat,'lng',s.lng,'client_name',c.name)
      FROM public.costing_jobs j LEFT JOIN public.stores s ON s.id=j.store_id
      LEFT JOIN public.clients c ON c.id=j.client_id WHERE j.id=p_job_id),
    'materials',coalesce((SELECT jsonb_agg(jsonb_build_object('id',l.id,'description',l.description,
      'qty',l.qty,'unit',m.unit,'section',l.section) ORDER BY l.section,l.description)
      FROM public.costing_lines l LEFT JOIN public.materials m ON m.id=l.material_id
      WHERE l.job_id=p_job_id AND l.section <> 'Labour'),'[]'::jsonb),
    'time_entries',coalesce((SELECT jsonb_agg(jsonb_build_object('id',t.id,'work_date',t.work_date,
      'person_name',t.person_name,'hours',t.hours,'description',t.description,'labour_type',t.labour_type)
      ORDER BY t.work_date DESC,t.created_at DESC) FROM public.costing_time_entries t WHERE t.job_id=p_job_id),'[]'::jsonb),
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
REVOKE ALL ON FUNCTION rpm_private.mobile_admin_workspace(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION rpm_private.mobile_admin_workspace(uuid,text) TO authenticated;
CREATE OR REPLACE FUNCTION public.mobile_admin_workspace(p_job_id uuid DEFAULT NULL,p_site_search text DEFAULT NULL)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
  SELECT rpm_private.mobile_admin_workspace(p_job_id,p_site_search)
$$;
REVOKE ALL ON FUNCTION public.mobile_admin_workspace(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.mobile_admin_workspace(uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION rpm_private.mobile_admin_save_time_entry(p_job_id uuid,p_entry_id uuid,p_work_date date,
  p_hours numeric,p_description text,p_labour_type text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE saved public.costing_time_entries; actor_name text;
BEGIN
  IF auth.uid() IS NULL OR rpm_private.current_role() NOT IN ('mobile_admin','rodier_admin','super_admin')
    OR NOT rpm_private.installer_can_access_job(p_job_id::text)
    OR NOT EXISTS (SELECT 1 FROM public.costing_jobs WHERE id=p_job_id AND status::text IN ('approved','in_progress'))
    OR p_work_date IS NULL OR p_hours IS NULL OR p_hours <= 0 OR p_hours > 24
    OR length(coalesce(p_description,'')) > 4000 OR length(coalesce(p_labour_type,'')) > 100 THEN
    RAISE EXCEPTION 'Time entry access denied' USING ERRCODE='42501';
  END IF;
  IF p_entry_id IS NULL THEN
    SELECT coalesce(name,email,'Staff') INTO actor_name FROM public.users WHERE id=auth.uid();
    INSERT INTO public.costing_time_entries(job_id,work_date,user_id,person_name,hours,description,labour_type,created_by)
      VALUES(p_job_id,p_work_date,auth.uid(),actor_name,p_hours,nullif(btrim(p_description),''),nullif(btrim(p_labour_type),''),auth.uid())
      RETURNING * INTO saved;
  ELSE
    UPDATE public.costing_time_entries SET work_date=p_work_date,hours=p_hours,
      description=nullif(btrim(p_description),''),labour_type=nullif(btrim(p_labour_type),''),updated_at=now()
      WHERE id=p_entry_id AND job_id=p_job_id RETURNING * INTO saved;
    IF saved.id IS NULL THEN RAISE EXCEPTION 'Time entry not found' USING ERRCODE='42501'; END IF;
  END IF;
  RETURN jsonb_build_object('id',saved.id,'work_date',saved.work_date,'person_name',saved.person_name,
    'hours',saved.hours,'description',saved.description,'labour_type',saved.labour_type);
END $$;
REVOKE ALL ON FUNCTION rpm_private.mobile_admin_save_time_entry(uuid,uuid,date,numeric,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION rpm_private.mobile_admin_save_time_entry(uuid,uuid,date,numeric,text,text) TO authenticated;
CREATE OR REPLACE FUNCTION public.mobile_admin_save_time_entry(p_job_id uuid,p_entry_id uuid,p_work_date date,
  p_hours numeric,p_description text,p_labour_type text)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
  SELECT rpm_private.mobile_admin_save_time_entry(p_job_id,p_entry_id,p_work_date,p_hours,p_description,p_labour_type)
$$;
REVOKE ALL ON FUNCTION public.mobile_admin_save_time_entry(uuid,uuid,date,numeric,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.mobile_admin_save_time_entry(uuid,uuid,date,numeric,text,text) TO authenticated;

-- Keep installer assignment rules. These existing actions now also accept the
-- mobile admin and Rodier admin roles via installer_can_access_job.
CREATE OR REPLACE FUNCTION rpm_private.installer_timer(p_job_id uuid,p_kind text,p_action text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE current_timer public.installer_time_sessions; result public.installer_time_sessions;
BEGIN
  IF auth.uid() IS NULL OR rpm_private.current_role() NOT IN ('installer','mobile_admin','rodier_admin','super_admin')
    OR p_kind NOT IN ('travel','work') OR p_action NOT IN ('start','stop') THEN
    RAISE EXCEPTION 'Timer access denied' USING ERRCODE='42501';
  END IF;
  IF p_action='start' AND NOT EXISTS (SELECT 1 FROM public.costing_jobs j
    WHERE j.id=p_job_id AND j.status::text IN ('approved','in_progress')
      AND rpm_private.installer_can_access_job(j.id::text)) THEN
    RAISE EXCEPTION 'Job is not available for time entry' USING ERRCODE='42501';
  END IF;
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
DECLARE site uuid; photo_id uuid; assigned boolean;
BEGIN
  IF auth.uid() IS NULL OR rpm_private.current_role() NOT IN ('installer','mobile_admin','rodier_admin','super_admin')
    OR p_captured_at IS NULL OR p_captured_at > now() + interval '5 minutes'
    OR length(coalesce(p_caption,''))>500 THEN
    RAISE EXCEPTION 'Photo access denied' USING ERRCODE='42501';
  END IF;
  SELECT true,j.store_id INTO assigned,site FROM public.costing_jobs j
    WHERE j.id=p_job_id AND j.status::text IN ('approved','in_progress')
      AND rpm_private.installer_can_access_job(j.id::text);
  IF coalesce(assigned,false)=false OR p_path NOT LIKE p_job_id::text||'/'||auth.uid()::text||'/%'
    OR NOT EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id='installer-photos' AND name=p_path) THEN
    RAISE EXCEPTION 'Photo job or file is invalid' USING ERRCODE='42501';
  END IF;
  INSERT INTO public.installer_photos(job_id,store_id,user_id,storage_path,caption,captured_at)
    VALUES(p_job_id,site,auth.uid(),p_path,p_caption,p_captured_at)
    ON CONFLICT (storage_path) DO UPDATE SET storage_path=excluded.storage_path
    RETURNING id INTO photo_id;
  RETURN photo_id;
END $$;

CREATE OR REPLACE FUNCTION rpm_private.installer_job_notes(p_job_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF auth.uid() IS NULL OR rpm_private.current_role() NOT IN ('installer','mobile_admin','rodier_admin','super_admin')
    OR NOT rpm_private.installer_can_access_job(p_job_id::text) THEN
    RAISE EXCEPTION 'Job access denied' USING ERRCODE='42501';
  END IF;
  RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('id',n.id,'body',n.body,
    'created_at',n.created_at,'author',coalesce(u.name,u.email,'Staff')) ORDER BY n.created_at DESC)
    FROM public.installer_job_notes n JOIN public.users u ON u.id=n.user_id WHERE n.job_id=p_job_id),'[]'::jsonb);
END $$;

CREATE OR REPLACE FUNCTION rpm_private.installer_add_job_note(p_job_id uuid,p_body text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE saved public.installer_job_notes; author_name text;
BEGIN
  IF auth.uid() IS NULL OR rpm_private.current_role() NOT IN ('installer','mobile_admin','rodier_admin','super_admin')
    OR NOT rpm_private.installer_can_access_job(p_job_id::text)
    OR NOT EXISTS (SELECT 1 FROM public.costing_jobs j WHERE j.id=p_job_id
      AND j.status::text IN ('approved','in_progress'))
    OR length(btrim(coalesce(p_body,''))) NOT BETWEEN 1 AND 4000 THEN
    RAISE EXCEPTION 'Note access denied' USING ERRCODE='42501';
  END IF;
  INSERT INTO public.installer_job_notes(job_id,user_id,body)
    VALUES(p_job_id,auth.uid(),btrim(p_body)) RETURNING * INTO saved;
  SELECT coalesce(u.name,u.email,'Staff') INTO author_name FROM public.users u WHERE u.id=auth.uid();
  RETURN jsonb_build_object('id',saved.id,'body',saved.body,
    'created_at',saved.created_at,'author',author_name);
END $$;
COMMIT;
