BEGIN;

ALTER TABLE public.costing_jobs ADD COLUMN visible_to_client boolean NOT NULL DEFAULT false;

-- Keep costing_jobs.store_id as the primary site for existing workflows.
-- Additional associations include the primary site in selection order.
CREATE TABLE public.costing_job_sites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.costing_jobs(id) ON DELETE CASCADE,
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  sort integer NOT NULL DEFAULT 0 CHECK (sort >= 0),
  UNIQUE (job_id, store_id)
);
CREATE INDEX costing_job_sites_store_idx ON public.costing_job_sites (store_id);

ALTER TABLE public.costing_job_sites ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.costing_job_sites TO authenticated;
GRANT ALL ON public.costing_job_sites TO service_role;

CREATE POLICY costing_job_sites_read ON public.costing_job_sites
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.costing_jobs j WHERE j.id = job_id));
CREATE POLICY costing_job_sites_admin_write ON public.costing_job_sites
  FOR ALL TO authenticated
  USING ((SELECT rpm_private.current_role()) IN ('super_admin', 'rodier_admin'))
  WITH CHECK ((SELECT rpm_private.current_role()) IN ('super_admin', 'rodier_admin'));

-- Client users receive a limited summary, not access to costing_jobs or BOMs.
CREATE FUNCTION rpm_private.site_costing_jobs(p_store_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE actor public.users; staff boolean;
BEGIN
  SELECT * INTO actor FROM public.users WHERE id = auth.uid();
  IF auth.uid() IS NULL OR actor.id IS NULL THEN
    RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501';
  END IF;
  staff := actor.role::text IN ('super_admin', 'rodier_admin');
  IF NOT staff AND NOT EXISTS (
    SELECT 1 FROM public.stores s WHERE s.id = p_store_id AND s.client_id = actor.client_id
      AND (actor.role::text = 'client_hq' OR
        (actor.role::text = 'client_store' AND s.id = ANY(actor.store_ids)))
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

CREATE FUNCTION public.site_costing_jobs(p_store_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT rpm_private.site_costing_jobs(p_store_id);
$$;
REVOKE ALL ON FUNCTION rpm_private.site_costing_jobs(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.site_costing_jobs(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION rpm_private.site_costing_jobs(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.site_costing_jobs(uuid) TO authenticated;

COMMIT;
