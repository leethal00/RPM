-- Run against a disposable database after migrations. Uses transaction-local
-- fixtures and rolls everything back. Requires a database owner connection.
BEGIN;
INSERT INTO auth.users(id,email) VALUES
 ('f1111111-1111-4111-8111-111111111111','planning-admin@example.invalid'),
 ('f2222222-2222-4222-8222-222222222222','planning-client@example.invalid');
INSERT INTO public.users(id,email,role) VALUES
 ('f1111111-1111-4111-8111-111111111111','planning-admin@example.invalid','super_admin'),
 ('f2222222-2222-4222-8222-222222222222','planning-client@example.invalid','client_hq')
 ON CONFLICT (id) DO UPDATE SET role=excluded.role;
INSERT INTO public.costing_jobs(id,title,status,is_template) VALUES
 ('f3333333-3333-4333-8333-333333333333','Planning test job','in_progress',false),
 ('f4444444-4444-4444-8444-444444444444','Other job','approved',false),
 ('f5555555-5555-4555-8555-555555555555','Quote','quote',false);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','f1111111-1111-4111-8111-111111111111',true);
INSERT INTO public.production_operations(id,job_id,department_code,name,estimated_hours,progress_percent) VALUES
 ('f6666666-6666-4666-8666-666666666666','f3333333-3333-4333-8333-333333333333','cnc','Cut',4,25),
 ('f7777777-7777-4777-8777-777777777777','f3333333-3333-4333-8333-333333333333','cnc','Drill',NULL,NULL),
 ('f8888888-8888-4888-8888-888888888888','f3333333-3333-4333-8333-333333333333','assembly','Assemble',2,NULL);

DO $$ BEGIN
 IF (SELECT count(*) FROM public.production_operations WHERE job_id='f3333333-3333-4333-8333-333333333333') <> 3 THEN
  RAISE EXCEPTION 'Multiple operations per department/job failed'; END IF;
 IF (SELECT actual_hours FROM public.production_planning WHERE id='f6666666-6666-4666-8666-666666666666') IS NOT NULL THEN
  RAISE EXCEPTION 'Absent actuals must be NULL'; END IF;
 BEGIN
  INSERT INTO public.production_operations(job_id,department_code,name) VALUES ('f5555555-5555-4555-8555-555555555555','cnc','Invalid quote stage');
  RAISE EXCEPTION 'TEST FAILED: quote accepted';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM LIKE 'TEST FAILED:%' THEN RAISE; END IF;
 END;
 BEGIN
  UPDATE public.production_operations SET progress_percent=100 WHERE id='f6666666-6666-4666-8666-666666666666';
  RAISE EXCEPTION 'TEST FAILED: 100 without completion accepted';
 EXCEPTION WHEN check_violation THEN NULL; END;
 BEGIN
  UPDATE public.production_operations SET department_code='assembly' WHERE id='f6666666-6666-4666-8666-666666666666';
  RAISE EXCEPTION 'TEST FAILED: existing stage reassignment accepted';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM LIKE 'TEST FAILED:%' THEN RAISE; END IF;
 END;
 BEGIN
  INSERT INTO public.costing_time_entries(job_id,hours,production_operation_id) VALUES
   ('f4444444-4444-4444-8444-444444444444',1,'f6666666-6666-4666-8666-666666666666');
  RAISE EXCEPTION 'TEST FAILED: cross-job labour link accepted';
 EXCEPTION WHEN foreign_key_violation THEN NULL; END;
 BEGIN
  INSERT INTO public.costing_material_actuals(job_id,qty,production_operation_id) VALUES
   ('f4444444-4444-4444-8444-444444444444',1,'f6666666-6666-4666-8666-666666666666');
  RAISE EXCEPTION 'TEST FAILED: cross-job material link accepted';
 EXCEPTION WHEN foreign_key_violation THEN NULL; END;
END $$;

INSERT INTO public.costing_time_entries(job_id,hours,production_operation_id) VALUES
 ('f3333333-3333-4333-8333-333333333333',7,'f6666666-6666-4666-8666-666666666666'),
 ('f3333333-3333-4333-8333-333333333333',99,NULL);
DO $$ BEGIN
 IF (SELECT actual_hours FROM public.production_planning WHERE id='f6666666-6666-4666-8666-666666666666') <> 7 THEN
  RAISE EXCEPTION 'Actuals aggregation included unassigned hours'; END IF;
 IF (SELECT progress_percent FROM public.production_planning WHERE id='f6666666-6666-4666-8666-666666666666') <> 25 THEN
  RAISE EXCEPTION 'Consumed hours changed progress'; END IF;
 IF (SELECT actual_hours FROM public.production_planning WHERE id='f7777777-7777-4777-8777-777777777777') IS NOT NULL THEN
  RAISE EXCEPTION 'Actuals leaked between operations'; END IF;
END $$;
UPDATE public.production_operations SET status='complete' WHERE id='f6666666-6666-4666-8666-666666666666';
DO $$ BEGIN
 IF (SELECT progress_percent FROM public.production_operations WHERE id='f6666666-6666-4666-8666-666666666666') <> 100 THEN
  RAISE EXCEPTION 'Complete did not record 100 percent'; END IF;
END $$;

SELECT set_config('request.jwt.claim.sub','f2222222-2222-4222-8222-222222222222',true);
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM public.production_operations) OR EXISTS (SELECT 1 FROM public.production_planning) THEN
  RAISE EXCEPTION 'Client can read planning'; END IF;
 BEGIN
  INSERT INTO public.production_operations(job_id,department_code,name) VALUES ('f3333333-3333-4333-8333-333333333333','cnc','Denied');
  RAISE EXCEPTION 'TEST FAILED: client write allowed';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 UPDATE public.production_operations SET name='Denied' WHERE id='f6666666-6666-4666-8666-666666666666';
 IF FOUND THEN RAISE EXCEPTION 'Client update allowed'; END IF;
END $$;
SET LOCAL ROLE anon;
DO $$ BEGIN
 BEGIN
  PERFORM * FROM public.production_planning;
  RAISE EXCEPTION 'TEST FAILED: anonymous read allowed';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
ROLLBACK;
