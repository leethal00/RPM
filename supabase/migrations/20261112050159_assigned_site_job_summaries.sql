BEGIN;

-- The HQ portfolio already grants site access across billing customers.
-- Allow the same limited, opt-in job summaries at those assigned sites.
-- Full costing jobs, quotes and financial details retain their existing access.
CREATE OR REPLACE FUNCTION rpm_private.site_costing_jobs(p_store_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE actor public.users; staff boolean;
BEGIN
  SELECT * INTO actor FROM public.users WHERE id = auth.uid();
  IF auth.uid() IS NULL OR actor.id IS NULL THEN
    RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501';
  END IF;
  staff := actor.role::text IN ('super_admin', 'rodier_admin');
  IF NOT staff AND NOT EXISTS (
    SELECT 1 FROM public.stores s WHERE s.id = p_store_id AND (
      (actor.role::text = 'client_hq' AND s.id = ANY(actor.store_ids)) OR
      (s.client_id = actor.client_id AND (
        actor.role::text = 'client_hq' OR
        (actor.role::text = 'client_store' AND s.id = ANY(actor.store_ids))
      ))
    )
  ) THEN
    RAISE EXCEPTION 'Site access denied' USING ERRCODE = '42501';
  END IF;
  RETURN coalesce((SELECT jsonb_agg(jsonb_build_object(
    'id', j.id, 'title', j.title, 'production_title', j.production_title,
    'job_number', j.job_number, 'status', j.status, 'created_at', j.created_at,
    'completion_date', j.completion_date, 'can_open_job', staff,
    'client_name', CASE WHEN staff THEN c.name ELSE NULL END
  ) ORDER BY j.created_at DESC)
  FROM public.costing_jobs j LEFT JOIN public.clients c ON c.id = j.client_id
  WHERE NOT j.is_template AND j.status::text NOT IN ('quote','quoted')
    AND (staff OR j.visible_to_client)
    AND (j.store_id = p_store_id OR EXISTS (
      SELECT 1 FROM public.costing_job_sites js WHERE js.job_id = j.id AND js.store_id = p_store_id
    ))), '[]'::jsonb);
END $$;

REVOKE ALL ON FUNCTION rpm_private.site_costing_jobs(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION rpm_private.site_costing_jobs(uuid) TO authenticated;

COMMIT;
