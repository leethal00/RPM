-- Run against a configured RPM database; all fixtures and posted entries roll back.
BEGIN;
SELECT set_config('request.jwt.claims',jsonb_build_object('sub',(SELECT id FROM public.users WHERE role::text='super_admin' ORDER BY id LIMIT 1),'role','authenticated')::text,true);
SELECT set_config('rpm.test_scan',gen_random_uuid()::text,true),set_config('rpm.test_bad_scan',gen_random_uuid()::text,true);
INSERT INTO public.job_card_scans(id,status,storage_path,mime_type) VALUES
  (current_setting('rpm.test_scan')::uuid,'review_required','transaction-test/card.pdf','application/pdf'),
  (current_setting('rpm.test_bad_scan')::uuid,'review_required','transaction-test/bad.pdf','application/pdf');
SET LOCAL ROLE authenticated;
DO $test$
DECLARE sid uuid:=current_setting('rpm.test_scan')::uuid; badid uuid:=current_setting('rpm.test_bad_scan')::uuid;
  jid uuid; blocked boolean; staff uuid; original_path text;
BEGIN
  SELECT id INTO jid FROM public.costing_jobs WHERE NOT is_template ORDER BY id LIMIT 1;
  IF jid IS NULL OR auth.uid() IS NULL THEN RAISE EXCEPTION 'Tests require an existing admin and job'; END IF;
  IF NOT public.match_scanned_job_card(sid,jid,'transaction-test/card.pdf') THEN RAISE EXCEPTION 'QR match not saved'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.job_card_scans WHERE id=sid AND job_id=jid AND status='review_required') THEN RAISE EXCEPTION 'QR match posted or lost review state'; END IF;
  blocked:=false;
  BEGIN PERFORM public.match_scanned_job_card(badid,jid,'changed.pdf'); EXCEPTION WHEN OTHERS THEN IF sqlerrm LIKE '%Original scan changed%' THEN blocked:=true; ELSE RAISE; END IF; END;
  IF NOT blocked THEN RAISE EXCEPTION 'Stale QR result accepted'; END IF;
  PERFORM public.confirm_scanned_job_card(sid,jid,'{"version":2,"labour":[{"employee":"Craig","date":"2026-09-22","hours":"0.25","type":"Fab"},{"employee":"Liam","date":"2026-09-24","hours":"0.5","type":"Fab"}],"travel":[{"employee":"Craig","date":"2026-09-25","hours":"1","description":"Delivery"}],"materials":[{"date":"2026-09-21","description":"Test angle","qty":"1.5","cost":""}]}'::jsonb);
  IF (SELECT count(*) FROM public.costing_time_entries WHERE source_scan_id=sid)<>3 THEN RAISE EXCEPTION 'Wrong time entry count'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.costing_time_entries WHERE source_scan_id=sid AND work_date='2026-09-22' AND person_name='Craig' AND hours=0.25) THEN RAISE EXCEPTION 'First day or employee lost'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.costing_time_entries WHERE source_scan_id=sid AND work_date='2026-09-24' AND person_name='Liam' AND hours=0.5) THEN RAISE EXCEPTION 'Second day or employee lost'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.costing_time_entries WHERE source_scan_id=sid AND work_date='2026-09-25' AND labour_type='Travel' AND hours=1) THEN RAISE EXCEPTION 'Travel date lost'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.costing_material_actuals WHERE source_scan_id=sid AND order_date='2026-09-21' AND qty=1.5) THEN RAISE EXCEPTION 'Material date lost'; END IF;
  blocked:=false;
  BEGIN PERFORM public.confirm_scanned_job_card(sid,jid,'{"labour":[],"travel":[],"materials":[]}'); EXCEPTION WHEN OTHERS THEN IF sqlerrm LIKE '%already been confirmed%' THEN blocked:=true; ELSE RAISE; END IF; END;
  IF NOT blocked THEN RAISE EXCEPTION 'Duplicate posting allowed'; END IF;
  blocked:=false;
  BEGIN PERFORM public.confirm_scanned_job_card(badid,jid,'{"labour":[{"employee":"Craig","date":"2026-09-22","hours":1},{"employee":"Liam","date":"2026-02-30","hours":2}],"materials":[]}'); EXCEPTION WHEN OTHERS THEN IF sqlerrm LIKE '%valid work date%' THEN blocked:=true; ELSE RAISE; END IF; END;
  IF NOT blocked OR EXISTS(SELECT 1 FROM public.costing_time_entries WHERE source_scan_id=badid) THEN RAISE EXCEPTION 'Invalid row was not atomic'; END IF;
  PERFORM public.confirm_scanned_job_card(badid,jid,'{"employee":"Legacy staff","date":"2026-09-20","labour":[{"hours":1}],"travel_hours":"0.5","materials":[]}');
  IF (SELECT count(*) FROM public.costing_time_entries WHERE source_scan_id=badid AND work_date='2026-09-20' AND person_name='Legacy staff')<>2 THEN RAISE EXCEPTION 'Legacy compatibility failed'; END IF;
  SELECT id INTO staff FROM public.users WHERE role::text='installer' ORDER BY id LIMIT 1;
  IF staff IS NOT NULL THEN
    PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',staff,'role','authenticated')::text,true);
    blocked:=false;
    BEGIN PERFORM public.match_scanned_job_card(sid,jid,'transaction-test/card.pdf'); EXCEPTION WHEN OTHERS THEN IF sqlerrm LIKE '%Only RPM administrators%' THEN blocked:=true; ELSE RAISE; END IF; END;
    IF NOT blocked THEN RAISE EXCEPTION 'Installer allowed to review'; END IF;
  END IF;
END $test$;
ROLLBACK;
SELECT 'Passed: QR matching, stale-file guard, two employees/dates, travel/material dates, duplicate guard, atomic invalid-date rollback, legacy payload compatibility and staff denial. Fixtures rolled back.' AS result;
