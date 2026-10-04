-- Run on rpm-dev after the migration. All fixtures are rolled back.
BEGIN;
DO $$
DECLARE
  admin_id uuid; client_user public.users; other_client uuid;
  first_site uuid := gen_random_uuid(); second_site uuid := gen_random_uuid(); foreign_site uuid := gen_random_uuid();
  hidden_job uuid := gen_random_uuid(); shared_job uuid := gen_random_uuid(); legacy_job uuid := gen_random_uuid();
  result jsonb;
BEGIN
  SELECT id INTO STRICT admin_id FROM public.users WHERE role::text = 'super_admin' LIMIT 1;
  SELECT * INTO STRICT client_user FROM public.users WHERE role::text = 'client_hq' LIMIT 1;
  SELECT id INTO STRICT other_client FROM public.clients WHERE id <> client_user.client_id LIMIT 1;
  INSERT INTO public.stores(id,client_id,name) VALUES
    (first_site,client_user.client_id,'Rollback test primary'),
    (second_site,client_user.client_id,'Rollback test secondary'),
    (foreign_site,other_client,'Rollback test foreign');
  INSERT INTO public.costing_jobs(id,title,client_id,store_id,status,is_template,visible_to_client,notes,adjusted_total) VALUES
    (hidden_job,'Rollback test hidden',other_client,first_site,'in_progress',false,false,'Private staff note',12345),
    (shared_job,'Rollback test shared',other_client,first_site,'in_progress',false,true,'Private staff note',12345),
    (legacy_job,'Rollback test legacy',other_client,first_site,'complete',false,true,NULL,NULL);
  INSERT INTO public.costing_job_sites(job_id,store_id,sort) VALUES
    (hidden_job,first_site,0),(hidden_job,second_site,1),(shared_job,first_site,0),(shared_job,second_site,1);

  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub',admin_id::text,true);
  result := public.site_costing_jobs(first_site);
  IF jsonb_array_length(result) <> 3 THEN RAISE EXCEPTION 'Staff primary history missing/duplicated jobs'; END IF;
  result := public.site_costing_jobs(second_site);
  IF jsonb_array_length(result) <> 2 THEN RAISE EXCEPTION 'Staff secondary history missing jobs'; END IF;

  PERFORM set_config('request.jwt.claim.sub',client_user.id::text,true);
  result := public.site_costing_jobs(second_site);
  IF jsonb_array_length(result) <> 1 OR result->0->>'id' <> shared_job::text THEN
    RAISE EXCEPTION 'Client visibility setting not enforced';
  END IF;
  IF (result->0->>'can_open_job')::boolean OR result->0->>'client_name' IS NOT NULL OR
    result->0 ? 'notes' OR result->0 ? 'adjusted_total' THEN
    RAISE EXCEPTION 'Internal job data exposed to client';
  END IF;
  IF EXISTS (SELECT 1 FROM public.costing_jobs WHERE id = shared_job) THEN
    RAISE EXCEPTION 'Client can read full costing job';
  END IF;
  IF EXISTS (SELECT 1 FROM public.costing_job_sites WHERE job_id = shared_job) THEN
    RAISE EXCEPTION 'Client can read internal site associations';
  END IF;
  result := public.site_costing_jobs(first_site);
  IF jsonb_array_length(result) <> 2 THEN RAISE EXCEPTION 'Legacy single-site job omitted'; END IF;
  BEGIN
    PERFORM public.site_costing_jobs(foreign_site);
    RAISE EXCEPTION 'Client can read another client site';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  PERFORM set_config('request.jwt.claim.sub','',true);
  BEGIN
    PERFORM public.site_costing_jobs(first_site);
    RAISE EXCEPTION 'Unauthenticated access allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  EXECUTE 'RESET ROLE';
END $$;
ROLLBACK;
