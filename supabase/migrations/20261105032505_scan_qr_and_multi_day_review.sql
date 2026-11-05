-- One scan can contain multiple days, people and material-use dates.
CREATE OR REPLACE FUNCTION rpm_private.scan_entry_date(p_value text)
RETURNS date LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE parsed date;
BEGIN
  IF p_value IS NULL OR p_value !~ '^\d{4}-\d{2}-\d{2}$' THEN RAISE EXCEPTION 'Enter a work date for each entry'; END IF;
  BEGIN parsed:=p_value::date; EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'Enter a valid work date for each entry'; END;
  RETURN parsed;
END $$;

CREATE OR REPLACE FUNCTION rpm_private.confirm_job_card(p_scan_id uuid,p_job_id uuid,p_review jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid; card public.job_card_scans; item jsonb; travel jsonb; entry_date date;
  employee text; hours numeric; qty numeric; amount numeric; labour_kind text;
BEGIN
  actor:=rpm_private.job_card_reviewer();
  SELECT * INTO card FROM public.job_card_scans WHERE id=p_scan_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Scanned job card not found'; END IF;
  IF card.status IN ('processed','deleted') OR card.confirmed_at IS NOT NULL THEN RAISE EXCEPTION 'This job card has already been confirmed or deleted'; END IF;
  IF card.storage_path IS NULL THEN RAISE EXCEPTION 'Attach the original scanned card before confirming'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.costing_jobs WHERE id=p_job_id AND NOT is_template) THEN RAISE EXCEPTION 'Select a valid RPM job'; END IF;
  IF jsonb_typeof(p_review) IS DISTINCT FROM 'object' OR jsonb_typeof(p_review->'labour') IS DISTINCT FROM 'array'
    OR jsonb_typeof(p_review->'materials') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Invalid labour or materials details'; END IF;
  -- Retain compatibility with reviews made before travel supported separate rows.
  IF p_review ? 'travel' THEN
    IF jsonb_typeof(p_review->'travel') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Invalid travel details'; END IF;
    travel:=p_review->'travel';
  ELSE
    travel:='[]'::jsonb;
    IF nullif(p_review->>'travel_hours','') IS NOT NULL THEN
      BEGIN hours:=(p_review->>'travel_hours')::numeric; EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'Invalid travel hours'; END;
      IF hours::text IN ('NaN','Infinity','-Infinity') OR hours<0 OR hours>1000 THEN RAISE EXCEPTION 'Invalid travel hours'; END IF;
      IF hours>0 THEN travel:=jsonb_build_array(jsonb_build_object('hours',hours,'description',p_review->>'travel_notes')); END IF;
    END IF;
  END IF;
  IF jsonb_array_length(p_review->'labour')+jsonb_array_length(travel)+jsonb_array_length(p_review->'materials')=0 THEN RAISE EXCEPTION 'Add labour, travel or materials before posting'; END IF;
  IF jsonb_array_length(p_review->'labour')+jsonb_array_length(travel)+jsonb_array_length(p_review->'materials')>500 THEN RAISE EXCEPTION 'Use at most 500 entries per card'; END IF;
  FOREACH labour_kind IN ARRAY ARRAY['labour','travel'] LOOP
    FOR item IN SELECT value FROM jsonb_array_elements(CASE WHEN labour_kind='travel' THEN travel ELSE p_review->'labour' END) LOOP
      IF jsonb_typeof(item) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Invalid time entry'; END IF;
      entry_date:=rpm_private.scan_entry_date(coalesce(nullif(item->>'date',''),nullif(item->>'work_date',''),p_review->>'date'));
      employee:=nullif(btrim(coalesce(nullif(item->>'employee',''),nullif(item->>'person_name',''),p_review->>'employee')),'');
      IF employee IS NULL THEN RAISE EXCEPTION 'Enter an employee for each time entry'; END IF;
      BEGIN hours:=(item->>'hours')::numeric; EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'Invalid time entry hours'; END;
      IF hours IS NULL OR hours::text IN ('NaN','Infinity','-Infinity') OR hours<=0 OR hours>1000 THEN RAISE EXCEPTION 'Time entry hours must be greater than zero and at most 1000'; END IF;
      INSERT INTO public.costing_time_entries(job_id,work_date,person_name,hours,description,labour_type,created_by,source_scan_id)
      VALUES(p_job_id,entry_date,employee,hours,nullif(btrim(item->>'description'),''),CASE WHEN labour_kind='travel' THEN 'Travel' ELSE coalesce(nullif(btrim(item->>'type'),''),'Workshop') END,actor,p_scan_id);
    END LOOP;
  END LOOP;
  FOR item IN SELECT value FROM jsonb_array_elements(p_review->'materials') LOOP
    IF jsonb_typeof(item) IS DISTINCT FROM 'object' OR nullif(btrim(item->>'description'),'') IS NULL THEN RAISE EXCEPTION 'Enter a material description'; END IF;
    entry_date:=rpm_private.scan_entry_date(coalesce(nullif(item->>'date',''),nullif(item->>'order_date',''),p_review->>'date'));
    BEGIN qty:=(item->>'qty')::numeric; EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'Invalid material quantity'; END;
    IF qty IS NULL OR qty::text IN ('NaN','Infinity','-Infinity') OR qty<=0 THEN RAISE EXCEPTION 'Material quantity must be greater than zero'; END IF;
    BEGIN amount:=nullif(item->>'cost','')::numeric; EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'Invalid material cost'; END;
    IF amount::text IN ('NaN','Infinity','-Infinity') OR amount<0 THEN RAISE EXCEPTION 'Material cost cannot be negative'; END IF;
    INSERT INTO public.costing_material_actuals(job_id,order_date,description,qty,cost,unit,created_by,source_scan_id)
    VALUES(p_job_id,entry_date,btrim(item->>'description'),qty,amount,nullif(btrim(item->>'unit'),''),actor,p_scan_id);
  END LOOP;
  UPDATE public.job_card_scans SET job_id=p_job_id,reviewed_data=p_review,status='processed',confirmed_by=actor,
    confirmed_at=now(),processed_at=now(),review_notes=nullif(btrim(p_review->>'notes'),'') WHERE id=p_scan_id;
END $$;

CREATE OR REPLACE FUNCTION rpm_private.match_job_card(p_scan_id uuid,p_job_id uuid,p_storage_path text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE card public.job_card_scans; number text;
BEGIN
  PERFORM rpm_private.job_card_reviewer();
  SELECT * INTO card FROM public.job_card_scans WHERE id=p_scan_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Scanned card not found'; END IF;
  IF card.status IN ('processed','deleted') OR card.confirmed_at IS NOT NULL THEN RAISE EXCEPTION 'Card already confirmed or deleted'; END IF;
  IF card.storage_path IS NULL OR card.storage_path IS DISTINCT FROM p_storage_path THEN RAISE EXCEPTION 'Original scan changed; reopen the card'; END IF;
  SELECT job_number INTO number FROM public.costing_jobs WHERE id=p_job_id AND NOT is_template;
  IF NOT FOUND THEN RAISE EXCEPTION 'QR job not found'; END IF;
  -- Keep an existing match; a QR read must never silently replace a reviewed job.
  IF card.job_id IS NOT NULL THEN RETURN card.job_id=p_job_id; END IF;
  UPDATE public.job_card_scans SET job_id=p_job_id,detected_job_number=number WHERE id=p_scan_id;
  RETURN true;
END $$;
CREATE OR REPLACE FUNCTION public.match_scanned_job_card(p_scan_id uuid,p_job_id uuid,p_storage_path text)
RETURNS boolean LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT rpm_private.match_job_card(p_scan_id,p_job_id,p_storage_path) $$;
REVOKE ALL ON FUNCTION rpm_private.scan_entry_date(text),rpm_private.match_job_card(uuid,uuid,text),public.match_scanned_job_card(uuid,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION rpm_private.match_job_card(uuid,uuid,text),public.match_scanned_job_card(uuid,uuid,text) TO authenticated;
NOTIFY pgrst,'reload schema';
