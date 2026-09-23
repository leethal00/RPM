-- Execute as postgres against rpm-dev. All fixtures and writes are rolled back.
BEGIN;
CREATE TEMP TABLE cnc_test_ids (actor uuid, other_actor uuid, department uuid, other_department uuid, job uuid, hidden_job uuid, closed_job uuid, material uuid, line uuid, hidden_line uuid);
INSERT INTO cnc_test_ids VALUES (gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid());
GRANT SELECT ON cnc_test_ids TO authenticated;
INSERT INTO auth.users(id,email) SELECT actor,actor::text||'@example.invalid' FROM cnc_test_ids UNION ALL SELECT other_actor,other_actor::text||'@example.invalid' FROM cnc_test_ids;
INSERT INTO public.departments(id,code,name) SELECT department,'qa-'||department::text,'QA CNC' FROM cnc_test_ids UNION ALL SELECT other_department,'qa-'||other_department::text,'QA Other' FROM cnc_test_ids;
INSERT INTO public.users(id,email,name,role,department_id) SELECT actor,actor::text||'@example.invalid','QA operator','department_operator'::public.user_role,department FROM cnc_test_ids UNION ALL SELECT other_actor,other_actor::text||'@example.invalid','QA other','department_operator'::public.user_role,other_department FROM cnc_test_ids;
INSERT INTO public.costing_jobs(id,title,status) SELECT job,'CNC QA assigned','in_progress'::public.costing_status FROM cnc_test_ids UNION ALL SELECT hidden_job,'CNC QA forbidden','in_progress'::public.costing_status FROM cnc_test_ids UNION ALL SELECT closed_job,'CNC QA closed','complete'::public.costing_status FROM cnc_test_ids;
INSERT INTO public.department_jobs(job_id,department_id,estimated_hours) SELECT job,department,8 FROM cnc_test_ids UNION ALL SELECT closed_job,department,2 FROM cnc_test_ids UNION ALL SELECT hidden_job,other_department,4 FROM cnc_test_ids;
INSERT INTO public.materials(id,description,unit,unit_cost,section) SELECT material,'QA material','sheet',123,'Materials' FROM cnc_test_ids;
INSERT INTO public.costing_lines(id,job_id,material_id,description,qty,unit_cost,markup,section) SELECT line,job,material,'QA material',2,123,0.5,'Materials' FROM cnc_test_ids UNION ALL SELECT hidden_line,hidden_job,material,'Forbidden material',3,123,0.5,'Materials' FROM cnc_test_ids;
SELECT set_config('request.jwt.claim.sub',actor::text,true),set_config('request.jwt.claim.role','authenticated',true) FROM cnc_test_ids;
SET LOCAL ROLE authenticated;
DO $$
DECLARE ids record; data jsonb; n integer; t record;
BEGIN
 SELECT * INTO ids FROM cnc_test_ids;
 data := public.production_workspace(ids.job,NULL);
 IF jsonb_array_length(data->'jobs') <> 2 OR data->'job'->>'id' <> ids.job::text THEN RAISE EXCEPTION 'Assigned jobs failed'; END IF;
 IF data::text ~ 'unit_cost|line_sell|markup|adjusted_total|unit_price|xero_quote|"cost"' THEN RAISE EXCEPTION 'Pricing leakage'; END IF;
 IF public.production_workspace(ids.job,ids.other_department)->>'department_id' <> ids.department::text THEN RAISE EXCEPTION 'Department spoof'; END IF;
 FOR t IN SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename<>'users' LOOP
  EXECUTE format('select count(*) from public.%I',t.tablename) INTO n;
  IF n <> 0 THEN RAISE EXCEPTION 'Raw table leak: %',t.tablename; END IF;
 END LOOP;
 SELECT count(*) INTO n FROM public.users;
 IF n<>1 THEN RAISE EXCEPTION 'User data leak'; END IF;
 BEGIN UPDATE public.users SET role='super_admin' WHERE id=ids.actor; RAISE EXCEPTION 'Role escalation allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN UPDATE public.users SET department_id=ids.other_department WHERE id=ids.actor; RAISE EXCEPTION 'Department escalation allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM public.production_workspace(ids.hidden_job,NULL); RAISE EXCEPTION 'Unassigned read allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM public.production_record(ids.hidden_job,'time','{"date":"2026-09-20","hours":1,"description":"forbidden"}',NULL); RAISE EXCEPTION 'Unassigned write allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM public.production_record(ids.closed_job,'time','{"date":"2026-09-20","hours":1,"description":"closed"}',NULL); RAISE EXCEPTION 'Closed write allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM public.production_record(ids.job,'material',jsonb_build_object('date','2026-09-20','qty',1,'line_id',ids.hidden_line,'unit','sheet'),NULL); RAISE EXCEPTION 'Cross-job material allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM public.production_record(ids.job,'time','{"date":"2026-09-20","hours":-1,"description":"invalid"}',NULL); RAISE EXCEPTION 'Negative hours allowed'; EXCEPTION WHEN raise_exception THEN IF SQLERRM='Negative hours allowed' THEN RAISE; END IF; END;
 BEGIN PERFORM public.production_record(ids.job,'progress','{"progress":101}',NULL); RAISE EXCEPTION 'Invalid progress allowed'; EXCEPTION WHEN raise_exception THEN IF SQLERRM='Invalid progress allowed' THEN RAISE; END IF; END;
 PERFORM public.production_record(ids.job,'time',jsonb_build_object('date','2026-09-20','hours',1.5,'description','QA time','user_id',ids.other_actor),NULL);
 PERFORM public.production_record(ids.job,'material',jsonb_build_object('date','2026-09-20','qty',0.5,'line_id',ids.line,'unit','sheet','cost',999),NULL);
 PERFORM public.production_record(ids.job,'material','{"date":"2026-09-20","qty":2,"description":"Offcut","unit":"each"}',NULL);
 PERFORM public.production_record(ids.job,'progress','{"progress":35}',NULL);
 data := public.production_workspace(ids.job,NULL);
 IF (data->'time'->0->>'hours')::numeric <> 1.5 OR jsonb_array_length(data->'actuals')<>2 OR (data->'job'->>'progress')::integer<>35 THEN RAISE EXCEPTION 'Read-after-write failed'; END IF;
END $$;
RESET ROLE;
DO $$ DECLARE ids record; BEGIN
 SELECT * INTO ids FROM cnc_test_ids;
 IF NOT EXISTS (SELECT 1 FROM public.costing_time_entries WHERE job_id=ids.job AND user_id=ids.actor AND created_by=ids.actor AND department_id=ids.department AND hours=1.5) THEN RAISE EXCEPTION 'Time attribution failed'; END IF;
 IF EXISTS (SELECT 1 FROM public.costing_material_actuals WHERE job_id=ids.job AND cost IS NOT NULL) THEN RAISE EXCEPTION 'Price input accepted'; END IF;
 DELETE FROM public.department_jobs WHERE job_id=ids.job AND department_id=ids.department;
END $$;
SET LOCAL ROLE authenticated;
DO $$ DECLARE ids record; BEGIN
 SELECT * INTO ids FROM cnc_test_ids;
 BEGIN PERFORM public.production_workspace(ids.job,NULL); RAISE EXCEPTION 'Revocation failed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','',true);
UPDATE public.users SET role='client_store' WHERE id=(SELECT actor FROM cnc_test_ids);
SELECT set_config('request.jwt.claim.sub',actor::text,true) FROM cnc_test_ids;
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 BEGIN PERFORM public.production_workspace(NULL,NULL); RAISE EXCEPTION 'Client production access allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','',true);
UPDATE public.users SET role='super_admin' WHERE id=(SELECT actor FROM cnc_test_ids);
SELECT set_config('request.jwt.claim.sub',actor::text,true) FROM cnc_test_ids;
SET LOCAL ROLE authenticated;
DO $$ DECLARE ids record; BEGIN
 SELECT * INTO ids FROM cnc_test_ids;
 IF NOT EXISTS (SELECT 1 FROM public.costing_jobs WHERE id=ids.job) THEN RAISE EXCEPTION 'Administrator regression'; END IF;
 INSERT INTO public.department_jobs(job_id,department_id) VALUES(ids.job,ids.department);
 PERFORM public.production_workspace(ids.job,ids.department);
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','',true);
SET LOCAL ROLE anon;
DO $$ BEGIN
 BEGIN PERFORM public.production_workspace(NULL,NULL); RAISE EXCEPTION 'Anonymous production access allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SELECT 'PASS: assigned/read/write, pricing exclusion, raw-table denial, role and department escalation, unassigned and closed jobs, cross-job material, attribution, validation, revocation, client/anonymous denial, and administrator regression' AS result;
ROLLBACK;

