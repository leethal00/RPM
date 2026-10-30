-- Explicit site binding supports field-created SWMS before a job is selected.
ALTER TABLE public.hs_records ADD COLUMN store_id uuid REFERENCES public.stores(id);
CREATE INDEX hs_records_store_date_idx ON public.hs_records(store_id, work_date DESC);

CREATE OR REPLACE FUNCTION rpm_private.mobile_hs_can_write()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.users u WHERE u.id=auth.uid()
    AND u.role::text IN ('super_admin','rodier_admin','mobile_admin','installer') AND NOT u.is_subcontractor)
$$;

CREATE OR REPLACE FUNCTION rpm_private.mobile_hs_can_read_record(p_site_id uuid, p_record_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users u CROSS JOIN public.hs_records r
    JOIN public.stores s ON s.id=p_site_id AND s.status::text='active'
    WHERE u.id=auth.uid() AND u.role::text IN ('installer','mobile_admin','rodier_admin','super_admin')
      AND r.id=p_record_id AND r.kind IN ('swms','toolbox')
      AND (r.store_id=p_site_id OR (r.store_id IS NULL AND EXISTS (
        SELECT 1 FROM public.costing_jobs j WHERE j.id=r.job_id AND
          (j.store_id=p_site_id OR EXISTS (SELECT 1 FROM public.costing_job_sites js WHERE js.job_id=j.id AND js.store_id=p_site_id)))))
      AND (NOT u.is_subcontractor OR EXISTS (SELECT 1 FROM public.installer_jobs a WHERE a.user_id=u.id AND a.job_id=r.job_id))
  )
$$;

CREATE OR REPLACE FUNCTION rpm_private.mobile_site_health_safety(p_site_id uuid, p_record_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE actor public.users; site_data jsonb; result jsonb;
BEGIN
  SELECT * INTO actor FROM public.users WHERE id=auth.uid();
  IF auth.uid() IS NULL OR coalesce(actor.role::text,'') NOT IN ('installer','mobile_admin','rodier_admin','super_admin') THEN
    RAISE EXCEPTION 'Mobile access denied' USING ERRCODE='42501';
  END IF;
  SELECT jsonb_build_object('id',s.id,'name',s.name,'address',s.address,'client_name',c.name)
    INTO site_data FROM public.stores s JOIN public.clients c ON c.id=s.client_id
    WHERE s.id=p_site_id AND s.status::text='active';
  IF site_data IS NULL THEN RAISE EXCEPTION 'Site not found' USING ERRCODE='22023'; END IF;
  IF actor.is_subcontractor AND NOT EXISTS (
    SELECT 1 FROM public.installer_jobs a JOIN public.costing_jobs j ON j.id=a.job_id
    WHERE a.user_id=auth.uid() AND (j.store_id=p_site_id OR EXISTS (
      SELECT 1 FROM public.costing_job_sites js WHERE js.job_id=j.id AND js.store_id=p_site_id))) THEN
    RAISE EXCEPTION 'Site access denied' USING ERRCODE='42501';
  END IF;
  IF p_record_id IS NOT NULL AND NOT rpm_private.mobile_hs_can_read_record(p_site_id,p_record_id) THEN
    RAISE EXCEPTION 'H&S record not available for this site' USING ERRCODE='42501';
  END IF;
  SELECT jsonb_build_object(
    'site',site_data,'can_create',rpm_private.mobile_hs_can_write(),
    'records',coalesce((SELECT jsonb_agg(x ORDER BY x.work_date DESC,x.revision DESC,x.id) FROM (
      SELECT r.id,r.kind,r.title,r.status,r.work_date,r.revision,r.job_reference,r.job_id,r.site,
        coalesce(r.body->'date_tbc'='true'::jsonb,false) date_tbc
      FROM public.hs_records r WHERE rpm_private.mobile_hs_can_read_record(p_site_id,r.id)) x),'[]'::jsonb),
    'record',(SELECT jsonb_build_object('id',r.id,'kind',r.kind,'title',r.title,'status',r.status,
      'job_id',r.job_id,'job_reference',r.job_reference,'site',r.site,'work_date',r.work_date,
      'body',r.body,'revision',r.revision,'created_at',r.created_at,'updated_at',r.updated_at,
      'completed_at',r.completed_at,'template_id',r.template_id,'template_version',r.template_version,
      'can_edit',r.status='draft' AND r.kind='swms' AND rpm_private.mobile_hs_can_write()
        AND (actor.role::text IN ('super_admin','rodier_admin') OR r.created_by=auth.uid()))
      FROM public.hs_records r WHERE r.id=p_record_id),
    'attendees',coalesce((SELECT jsonb_agg(jsonb_build_object('id',a.id,'name',a.name,'signed_at',a.signed_at) ORDER BY a.created_at,a.id)
      FROM public.hs_attendees a WHERE a.record_id=p_record_id),'[]'::jsonb),
    'attachments',coalesce((SELECT jsonb_agg(jsonb_build_object('id',a.id,'file_name',a.file_name,'storage_path',a.storage_path) ORDER BY a.created_at,a.id)
      FROM public.hs_attachments a WHERE a.record_id=p_record_id),'[]'::jsonb),
    'jobs',coalesce((SELECT jsonb_agg(x ORDER BY x.job_number,x.id) FROM (
      SELECT j.id,j.title,j.job_number FROM public.costing_jobs j WHERE NOT j.is_template
        AND j.status::text IN ('approved','in_progress','complete','invoiced')
        AND (j.store_id=p_site_id OR EXISTS (SELECT 1 FROM public.costing_job_sites js WHERE js.job_id=j.id AND js.store_id=p_site_id))
        AND (NOT actor.is_subcontractor OR EXISTS (SELECT 1 FROM public.installer_jobs a WHERE a.user_id=auth.uid() AND a.job_id=j.id))) x),'[]'::jsonb),
    'templates',coalesce((SELECT jsonb_agg(jsonb_build_object('id',t.id,'title',t.title,'body',t.body,'version',t.version) ORDER BY t.title)
      FROM public.hs_templates t WHERE t.kind='swms' AND t.active),'[]'::jsonb)
  ) INTO result;
  RETURN result;
END $$;

CREATE OR REPLACE FUNCTION rpm_private.mobile_save_swms_draft(
  p_site_id uuid, p_record_id uuid, p_title text, p_work_date date,
  p_body jsonb, p_job_id uuid DEFAULT NULL, p_attendees text[] DEFAULT '{}',
  p_expected_updated_at timestamptz DEFAULT NULL, p_template_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE actor public.users; prior public.hs_records; saved public.hs_records;
  site_row public.stores; job_ref text; template_ver integer; person text; names text[];
BEGIN
  SELECT * INTO actor FROM public.users WHERE id=auth.uid();
  IF auth.uid() IS NULL OR NOT rpm_private.mobile_hs_can_write() THEN
    RAISE EXCEPTION 'You do not have permission to create SWMS drafts' USING ERRCODE='42501';
  END IF;
  IF p_record_id IS NULL OR nullif(trim(p_title),'') IS NULL OR length(p_title)>250 THEN
    RAISE EXCEPTION 'Enter a title (up to 250 characters)' USING ERRCODE='22023';
  END IF;
  IF jsonb_typeof(p_body) IS DISTINCT FROM 'object' OR pg_column_size(p_body)>262144
    OR jsonb_typeof(p_body->'steps') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Invalid SWMS body or work steps' USING ERRCODE='22023';
  END IF;
  IF jsonb_array_length(p_body->'steps')>100 OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_body->'steps') step WHERE jsonb_typeof(step)<>'object') THEN
    RAISE EXCEPTION 'Use at most 100 valid work steps' USING ERRCODE='22023';
  END IF;
  IF p_work_date IS NULL AND coalesce(p_body->'date_tbc'='true'::jsonb,false)=false THEN
    RAISE EXCEPTION 'Enter a work date or select TBC' USING ERRCODE='22023';
  END IF;
  SELECT * INTO site_row FROM public.stores WHERE id=p_site_id AND status::text='active';
  IF NOT FOUND THEN RAISE EXCEPTION 'Site not found' USING ERRCODE='22023'; END IF;
  IF p_job_id IS NOT NULL THEN
    SELECT concat_ws(' ',nullif(j.job_number,''),j.title) INTO job_ref FROM public.costing_jobs j
      WHERE j.id=p_job_id AND NOT j.is_template AND j.status::text IN ('approved','in_progress','complete','invoiced')
        AND (j.store_id=p_site_id OR EXISTS (SELECT 1 FROM public.costing_job_sites js WHERE js.job_id=j.id AND js.store_id=p_site_id));
    IF NOT FOUND THEN RAISE EXCEPTION 'Choose a job linked to this site' USING ERRCODE='22023'; END IF;
  END IF;
  IF p_template_id IS NOT NULL THEN
    SELECT version INTO template_ver FROM public.hs_templates WHERE id=p_template_id AND kind='swms' AND active;
    IF NOT FOUND THEN RAISE EXCEPTION 'SWMS template is not available' USING ERRCODE='22023'; END IF;
  END IF;
  SELECT coalesce(array_agg(DISTINCT trim(name) ORDER BY trim(name)),'{}'::text[]) INTO names
    FROM unnest(coalesce(p_attendees,'{}'::text[])) name WHERE nullif(trim(name),'') IS NOT NULL;
  IF cardinality(names)>100 OR EXISTS (SELECT 1 FROM unnest(names) name WHERE length(name)>200) THEN
    RAISE EXCEPTION 'Use at most 100 attendee names (up to 200 characters each)' USING ERRCODE='22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_record_id::text,0));
  SELECT * INTO prior FROM public.hs_records WHERE id=p_record_id FOR UPDATE;
  IF FOUND THEN
    IF prior.kind<>'swms' OR prior.status<>'draft' OR NOT rpm_private.mobile_hs_can_read_record(p_site_id,prior.id)
      OR (actor.role::text NOT IN ('super_admin','rodier_admin') AND prior.created_by IS DISTINCT FROM auth.uid()) THEN
      RAISE EXCEPTION 'Only permitted SWMS drafts can be edited' USING ERRCODE='42501';
    END IF;
    -- A retried request with the same client UUID must not create a duplicate.
    IF prior.title=trim(p_title) AND prior.body=p_body AND prior.job_id IS NOT DISTINCT FROM p_job_id
      AND prior.work_date=coalesce(p_work_date,prior.work_date)
      AND names=coalesce((SELECT array_agg(a.name ORDER BY a.name) FROM public.hs_attendees a WHERE a.record_id=prior.id),'{}'::text[]) THEN
      RETURN jsonb_build_object('id',prior.id,'updated_at',prior.updated_at);
    END IF;
    IF p_expected_updated_at IS NULL OR prior.updated_at IS DISTINCT FROM p_expected_updated_at THEN
      RAISE EXCEPTION 'This draft changed. Reopen the saved draft before editing again.' USING ERRCODE='40001';
    END IF;
    UPDATE public.hs_records SET title=trim(p_title),
      store_id=CASE WHEN prior.store_id IS NULL AND p_job_id IS NOT NULL THEN NULL ELSE p_site_id END,
      site=coalesce(nullif(prior.site,''),nullif(site_row.address,''),site_row.name),
      job_id=p_job_id,job_reference=job_ref,work_date=coalesce(p_work_date,prior.work_date),body=p_body
      WHERE id=prior.id RETURNING * INTO saved;
  ELSE
    IF p_expected_updated_at IS NOT NULL THEN RAISE EXCEPTION 'Draft no longer available' USING ERRCODE='22023'; END IF;
    INSERT INTO public.hs_records(id,kind,title,status,store_id,site,job_id,job_reference,work_date,body,created_by,template_id,template_version)
      VALUES(p_record_id,'swms',trim(p_title),'draft',p_site_id,coalesce(nullif(site_row.address,''),site_row.name),p_job_id,job_ref,
        coalesce(p_work_date,current_date),p_body,auth.uid(),p_template_id,template_ver) RETURNING * INTO saved;
  END IF;
  DELETE FROM public.hs_attendees WHERE record_id=saved.id AND signed_at IS NULL AND NOT (name=ANY(names));
  FOREACH person IN ARRAY names LOOP
    INSERT INTO public.hs_attendees(record_id,name) VALUES(saved.id,person) ON CONFLICT(record_id,name) DO NOTHING;
  END LOOP;
  RETURN jsonb_build_object('id',saved.id,'updated_at',saved.updated_at);
END $$;

REVOKE ALL ON FUNCTION rpm_private.mobile_hs_can_write(),rpm_private.mobile_hs_can_read_record(uuid,uuid),rpm_private.mobile_site_health_safety(uuid,uuid),rpm_private.mobile_save_swms_draft(uuid,uuid,text,date,jsonb,uuid,text[],timestamptz,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION rpm_private.mobile_hs_can_write(),rpm_private.mobile_hs_can_read_record(uuid,uuid),rpm_private.mobile_site_health_safety(uuid,uuid),rpm_private.mobile_save_swms_draft(uuid,uuid,text,date,jsonb,uuid,text[],timestamptz,uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.mobile_site_health_safety(p_site_id uuid,p_record_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$ SELECT rpm_private.mobile_site_health_safety(p_site_id,p_record_id) $$;
CREATE OR REPLACE FUNCTION public.mobile_save_swms_draft(p_site_id uuid,p_record_id uuid,p_title text,p_work_date date,p_body jsonb,p_job_id uuid DEFAULT NULL,p_attendees text[] DEFAULT '{}',p_expected_updated_at timestamptz DEFAULT NULL,p_template_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT rpm_private.mobile_save_swms_draft(p_site_id,p_record_id,p_title,p_work_date,p_body,p_job_id,p_attendees,p_expected_updated_at,p_template_id) $$;
REVOKE ALL ON FUNCTION public.mobile_site_health_safety(uuid,uuid),public.mobile_save_swms_draft(uuid,uuid,text,date,jsonb,uuid,text[],timestamptz,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.mobile_site_health_safety(uuid,uuid),public.mobile_save_swms_draft(uuid,uuid,text,date,jsonb,uuid,text[],timestamptz,uuid) TO authenticated;
NOTIFY pgrst,'reload schema';
