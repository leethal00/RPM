-- Field staff record quantities against a job without access to material costs.
-- The desktop Actuals tab can price and correct these entries later.
CREATE OR REPLACE FUNCTION rpm_private.mobile_job_materials(p_job_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF auth.uid() IS NULL
    OR rpm_private.current_role() NOT IN ('installer','mobile_admin','rodier_admin','super_admin')
    OR NOT rpm_private.installer_can_access_job(p_job_id::text) THEN
    RAISE EXCEPTION 'Job access denied' USING ERRCODE = '42501';
  END IF;
  RETURN jsonb_build_object(
    'planned', coalesce((SELECT jsonb_agg(jsonb_build_object(
      'id', l.id, 'description', l.description, 'qty', l.qty,
      'unit', m.unit, 'section', l.section) ORDER BY l.sort, l.description)
      FROM public.costing_lines l LEFT JOIN public.materials m ON m.id = l.material_id
      WHERE l.job_id = p_job_id AND l.section <> 'Labour'), '[]'::jsonb),
    'used', coalesce((SELECT jsonb_agg(jsonb_build_object(
      'id', a.id, 'description', a.description, 'qty', a.qty,
      'unit', a.unit, 'supplier', a.supplier, 'used_on', a.order_date,
      'line_id', a.costing_line_id) ORDER BY a.created_at DESC)
      FROM public.costing_material_actuals a WHERE a.job_id = p_job_id), '[]'::jsonb)
  );
END $$;
REVOKE ALL ON FUNCTION rpm_private.mobile_job_materials(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION rpm_private.mobile_job_materials(uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.mobile_job_materials(p_job_id uuid)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT rpm_private.mobile_job_materials(p_job_id)
$$;
REVOKE ALL ON FUNCTION public.mobile_job_materials(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mobile_job_materials(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION rpm_private.mobile_add_material_used(
  p_job_id uuid, p_line_id uuid, p_description text, p_qty numeric,
  p_unit text, p_supplier text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE selected_line public.costing_lines; saved public.costing_material_actuals;
  item_description text; item_unit text;
BEGIN
  IF auth.uid() IS NULL
    OR rpm_private.current_role() NOT IN ('installer','mobile_admin','rodier_admin','super_admin')
    OR NOT EXISTS (SELECT 1 FROM public.costing_jobs j WHERE j.id = p_job_id
      AND NOT j.is_template AND j.status::text IN ('approved','in_progress')
      AND rpm_private.installer_can_access_job(j.id::text))
    OR p_qty IS NULL OR p_qty <= 0 OR p_qty > 99999999
    OR length(coalesce(p_supplier,'')) > 150 THEN
    RAISE EXCEPTION 'Material entry denied' USING ERRCODE = '42501';
  END IF;
  IF p_line_id IS NOT NULL THEN
    SELECT * INTO selected_line FROM public.costing_lines
      WHERE id = p_line_id AND job_id = p_job_id AND section <> 'Labour';
    IF selected_line.id IS NULL THEN
      RAISE EXCEPTION 'Material is not on this job' USING ERRCODE = '42501';
    END IF;
    item_description := selected_line.description;
  ELSE
    item_description := btrim(coalesce(p_description,''));
  END IF;
  item_unit := btrim(coalesce(p_unit,''));
  IF length(item_description) NOT BETWEEN 1 AND 500
    OR length(item_unit) NOT BETWEEN 1 AND 40 THEN
    RAISE EXCEPTION 'Enter a material and unit';
  END IF;
  INSERT INTO public.costing_material_actuals
    (job_id, order_date, description, qty, unit, supplier, material_id,
     costing_line_id, created_by)
  VALUES (p_job_id, current_date, item_description, p_qty, item_unit,
    nullif(btrim(p_supplier),''), selected_line.material_id, selected_line.id,
    auth.uid()) RETURNING * INTO saved;
  RETURN jsonb_build_object('id',saved.id,'description',saved.description,
    'qty',saved.qty,'unit',saved.unit,'supplier',saved.supplier,
    'used_on',saved.order_date,'line_id',saved.costing_line_id);
END $$;
REVOKE ALL ON FUNCTION rpm_private.mobile_add_material_used(uuid,uuid,text,numeric,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION rpm_private.mobile_add_material_used(uuid,uuid,text,numeric,text,text) TO authenticated;
CREATE OR REPLACE FUNCTION public.mobile_add_material_used(
  p_job_id uuid, p_line_id uuid, p_description text, p_qty numeric,
  p_unit text, p_supplier text DEFAULT NULL)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT rpm_private.mobile_add_material_used(p_job_id,p_line_id,p_description,p_qty,p_unit,p_supplier)
$$;
REVOKE ALL ON FUNCTION public.mobile_add_material_used(uuid,uuid,text,numeric,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mobile_add_material_used(uuid,uuid,text,numeric,text,text) TO authenticated;

