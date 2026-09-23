BEGIN;
ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'department_operator';
CREATE SCHEMA IF NOT EXISTS rpm_private;
REVOKE ALL ON SCHEMA rpm_private FROM PUBLIC;
GRANT USAGE ON SCHEMA rpm_private TO authenticated;

CREATE TABLE public.departments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), code text NOT NULL UNIQUE, name text NOT NULL
);
INSERT INTO public.departments(code,name) VALUES ('cnc','CNC');
ALTER TABLE public.users ADD COLUMN department_id uuid REFERENCES public.departments(id);
CREATE TABLE public.department_jobs (
 job_id uuid REFERENCES public.costing_jobs(id) ON DELETE CASCADE,
 department_id uuid REFERENCES public.departments(id),
 instructions text NOT NULL DEFAULT '', estimated_hours numeric(8,2) CHECK (estimated_hours >= 0),
 progress integer NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
 updated_at timestamptz NOT NULL DEFAULT now(), updated_by uuid REFERENCES public.users(id),
 PRIMARY KEY(job_id,department_id)
);
ALTER TABLE public.costing_time_entries ADD COLUMN department_id uuid REFERENCES public.departments(id);
ALTER TABLE public.costing_material_actuals ADD COLUMN department_id uuid REFERENCES public.departments(id);
ALTER TABLE public.costing_material_actuals ADD COLUMN unit text;
ALTER TABLE public.costing_material_actuals ADD COLUMN costing_line_id uuid REFERENCES public.costing_lines(id) ON DELETE SET NULL;

-- Private lookup avoids recursive users RLS. No user-editable JWT claims are trusted.
CREATE FUNCTION rpm_private.current_role() RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$ SELECT role::text FROM public.users WHERE id = auth.uid() AND auth.uid() IS NOT NULL $$;
REVOKE ALL ON FUNCTION rpm_private.current_role() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION rpm_private.current_role() TO authenticated;

CREATE FUNCTION rpm_private.guard_user_access() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
 IF auth.uid() IS NOT NULL AND coalesce(rpm_private.current_role(),'') NOT IN ('super_admin','rodier_admin') AND
   (NEW.role IS DISTINCT FROM OLD.role OR NEW.department_id IS DISTINCT FROM OLD.department_id
    OR NEW.client_id IS DISTINCT FROM OLD.client_id OR NEW.store_ids IS DISTINCT FROM OLD.store_ids
    OR NEW.developer_mode IS DISTINCT FROM OLD.developer_mode OR NEW.id IS DISTINCT FROM OLD.id) THEN
   RAISE EXCEPTION 'Only administrators can change access permissions' USING ERRCODE='42501';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION rpm_private.guard_user_access() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER users_guard_access BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION rpm_private.guard_user_access();

ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.department_jobs ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.departments,public.department_jobs TO authenticated;
CREATE POLICY departments_admin ON public.departments FOR ALL TO authenticated
 USING (rpm_private.current_role() IN ('super_admin','rodier_admin')) WITH CHECK (rpm_private.current_role() IN ('super_admin','rodier_admin'));
CREATE POLICY department_jobs_admin ON public.department_jobs FOR ALL TO authenticated
 USING (rpm_private.current_role() IN ('super_admin','rodier_admin')) WITH CHECK (rpm_private.current_role() IN ('super_admin','rodier_admin'));

-- Existing tables can have permissive policies. A restrictive policy prevents OR-policy leakage.
-- Production access uses the explicitly projected, authorized functions below, never raw pricing tables.
DO $$ DECLARE t record; BEGIN
 FOR t IN SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> 'users' LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tablename);
  EXECUTE format('CREATE POLICY department_operator_boundary ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (coalesce(rpm_private.current_role(), '''') <> ''department_operator'') WITH CHECK (coalesce(rpm_private.current_role(), '''') <> ''department_operator'')', t.tablename);
 END LOOP;
END $$;
CREATE POLICY department_operator_own_profile ON public.users AS RESTRICTIVE FOR ALL TO authenticated
 USING (rpm_private.current_role() <> 'department_operator' OR id=auth.uid())
 WITH CHECK (rpm_private.current_role() <> 'department_operator' OR id=auth.uid());
CREATE POLICY department_operator_storage_boundary ON storage.objects AS RESTRICTIVE FOR ALL TO authenticated
 USING (coalesce(rpm_private.current_role(),'') <> 'department_operator')
 WITH CHECK (coalesce(rpm_private.current_role(),'') <> 'department_operator');

CREATE FUNCTION rpm_private.production_workspace(p_job_id uuid DEFAULT NULL, p_department_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE actor public.users; dept uuid; result jsonb;
BEGIN
 SELECT * INTO actor FROM public.users WHERE id=auth.uid();
 IF auth.uid() IS NULL OR coalesce(actor.role::text,'') NOT IN ('department_operator','super_admin','rodier_admin') THEN
  RAISE EXCEPTION 'Production access denied' USING ERRCODE='42501';
 END IF;
 dept := CASE WHEN actor.role::text='department_operator' THEN actor.department_id ELSE p_department_id END;
 IF dept IS NULL THEN
  IF actor.role::text='department_operator' THEN RETURN jsonb_build_object('department',NULL,'jobs','[]'::jsonb); END IF;
  SELECT id INTO dept FROM public.departments WHERE code='cnc';
 END IF;
 IF p_job_id IS NOT NULL AND NOT EXISTS (
   SELECT 1 FROM public.department_jobs d JOIN public.costing_jobs j ON j.id=d.job_id
   WHERE d.job_id=p_job_id AND d.department_id=dept AND j.status::text IN ('approved','in_progress','complete','invoiced') AND NOT j.is_template
 ) THEN RAISE EXCEPTION 'Job access denied' USING ERRCODE='42501'; END IF;
 SELECT jsonb_build_object(
  'department',(SELECT name FROM public.departments WHERE id=dept), 'department_id',dept,
  'jobs',coalesce((SELECT jsonb_agg(x ORDER BY x.completion_date NULLS LAST,x.title) FROM (
   SELECT j.id,j.job_number,coalesce(nullif(to_jsonb(j)->>'production_title',''),j.title) title,j.status,j.completion_date,
    d.estimated_hours,d.progress,
    (SELECT coalesce(sum(t.hours),0) FROM public.costing_time_entries t WHERE t.job_id=j.id AND t.department_id=dept) actual_hours
   FROM public.department_jobs d JOIN public.costing_jobs j ON j.id=d.job_id
   WHERE d.department_id=dept AND j.status::text IN ('approved','in_progress','complete','invoiced') AND NOT j.is_template
  ) x),'[]'::jsonb),
  'job', (SELECT jsonb_build_object('id',j.id,'title',coalesce(nullif(to_jsonb(j)->>'production_title',''),j.title),
   'job_number',j.job_number,'status',j.status,'completion_date',j.completion_date,'job_lead_name',j.job_lead_name,
   'instructions',d.instructions,'details',to_jsonb(j)->>'production_details','estimated_hours',d.estimated_hours,'progress',d.progress)
   FROM public.costing_jobs j JOIN public.department_jobs d ON d.job_id=j.id AND d.department_id=dept WHERE j.id=p_job_id),
  'lines',coalesce((SELECT jsonb_agg(x) FROM (
   SELECT l.id,l.material_id,l.description,l.qty,m.unit,l.section,l.item_id FROM public.costing_lines l
   LEFT JOIN public.materials m ON m.id=l.material_id WHERE l.job_id=p_job_id ORDER BY l.sort
  ) x),'[]'::jsonb),
  'time',coalesce((SELECT jsonb_agg(x) FROM (
   SELECT t.id,t.work_date,t.hours,t.description,t.labour_type,t.user_id=auth.uid() AS own
   FROM public.costing_time_entries t WHERE t.job_id=p_job_id AND t.department_id=dept ORDER BY t.work_date DESC,t.created_at DESC
  ) x),'[]'::jsonb),
  'actuals',coalesce((SELECT jsonb_agg(x) FROM (
   SELECT a.id,a.order_date,a.description,a.qty,a.unit,a.material_id,a.costing_line_id,a.created_by=auth.uid() AS own
   FROM public.costing_material_actuals a WHERE a.job_id=p_job_id AND a.department_id=dept ORDER BY a.order_date DESC,a.created_at DESC
  ) x),'[]'::jsonb)
 ) INTO result;
 RETURN result;
END $$;

CREATE FUNCTION rpm_private.production_record(p_job_id uuid,p_kind text,p_data jsonb,p_department_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE actor public.users; dept uuid; result uuid; job_status text; line public.costing_lines;
 amount numeric; entry_date date; description text; unit_name text;
BEGIN
 SELECT * INTO actor FROM public.users WHERE id=auth.uid();
 IF auth.uid() IS NULL OR coalesce(actor.role::text,'') NOT IN ('department_operator','super_admin','rodier_admin') THEN
  RAISE EXCEPTION 'Production access denied' USING ERRCODE='42501'; END IF;
 dept := CASE WHEN actor.role::text='department_operator' THEN actor.department_id ELSE p_department_id END;
 SELECT j.status::text INTO job_status FROM public.department_jobs d JOIN public.costing_jobs j ON j.id=d.job_id
 WHERE d.department_id=dept AND d.job_id=p_job_id AND NOT j.is_template FOR SHARE OF j,d;
 IF job_status IS NULL OR job_status NOT IN ('approved','in_progress') THEN
  RAISE EXCEPTION 'Job is not assigned or is closed' USING ERRCODE='42501'; END IF;
 IF p_kind='progress' THEN
  amount := (p_data->>'progress')::numeric;
  IF amount IS NULL OR amount NOT BETWEEN 0 AND 100 OR amount <> trunc(amount) THEN RAISE EXCEPTION 'Progress must be 0 to 100'; END IF;
  UPDATE public.department_jobs SET progress=amount,updated_at=now(),updated_by=auth.uid() WHERE job_id=p_job_id AND department_id=dept;
  RETURN p_job_id;
 END IF;
 entry_date := (p_data->>'date')::date;
 description := trim(p_data->>'description');
 IF entry_date IS NULL OR entry_date > current_date OR length(description)>2000 THEN RAISE EXCEPTION 'Check date and description'; END IF;
 IF p_kind='time' THEN
  amount := (p_data->>'hours')::numeric;
  IF amount IS NULL OR amount NOT BETWEEN 0.01 AND 24 OR coalesce(description,'')='' THEN RAISE EXCEPTION 'Enter 0.01 to 24 hours and a description'; END IF;
  INSERT INTO public.costing_time_entries(job_id,work_date,user_id,person_name,hours,description,labour_type,created_by,department_id)
  VALUES(p_job_id,entry_date,auth.uid(),actor.name,amount,description,(SELECT name FROM public.departments WHERE id=dept),auth.uid(),dept) RETURNING id INTO result;
 ELSIF p_kind='material' THEN
  amount := (p_data->>'qty')::numeric;
  unit_name := trim(p_data->>'unit');
  IF amount IS NULL OR amount NOT BETWEEN 0.0001 AND 99999999 THEN RAISE EXCEPTION 'Enter a positive quantity'; END IF;
  IF nullif(p_data->>'line_id','') IS NOT NULL THEN
   SELECT * INTO line FROM public.costing_lines WHERE id=(p_data->>'line_id')::uuid AND job_id=p_job_id AND section <> 'Labour';
   IF line.id IS NULL THEN RAISE EXCEPTION 'Material is not on this job' USING ERRCODE='42501'; END IF;
   description := line.description;
   unit_name := coalesce((SELECT nullif(unit,'') FROM public.materials WHERE id=line.material_id),unit_name);
  END IF;
  IF coalesce(description,'')='' OR coalesce(unit_name,'')='' OR length(unit_name)>40 THEN RAISE EXCEPTION 'Enter material description and unit'; END IF;
  INSERT INTO public.costing_material_actuals(job_id,order_date,description,qty,material_id,created_by,department_id,unit,costing_line_id)
  VALUES(p_job_id,entry_date,description,amount,line.material_id,auth.uid(),dept,unit_name,line.id) RETURNING id INTO result;
 ELSE RAISE EXCEPTION 'Unknown entry type'; END IF;
 RETURN result;
END $$;

REVOKE ALL ON FUNCTION rpm_private.production_workspace(uuid,uuid),rpm_private.production_record(uuid,text,jsonb,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION rpm_private.production_workspace(uuid,uuid),rpm_private.production_record(uuid,text,jsonb,uuid) TO authenticated;
CREATE FUNCTION public.production_workspace(p_job_id uuid DEFAULT NULL,p_department_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT rpm_private.production_workspace(p_job_id,p_department_id) $$;
CREATE FUNCTION public.production_record(p_job_id uuid,p_kind text,p_data jsonb,p_department_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT rpm_private.production_record(p_job_id,p_kind,p_data,p_department_id) $$;
REVOKE ALL ON FUNCTION public.production_workspace(uuid,uuid),public.production_record(uuid,text,jsonb,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.production_workspace(uuid,uuid),public.production_record(uuid,text,jsonb,uuid) TO authenticated;
COMMIT;
