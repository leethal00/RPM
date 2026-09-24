-- Installer notes are separate from job instructions and costing details.
CREATE TABLE public.installer_job_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.costing_jobs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id),
  body text NOT NULL CHECK (length(btrim(body)) BETWEEN 1 AND 4000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX installer_job_notes_job_created_idx ON public.installer_job_notes(job_id, created_at DESC);

ALTER TABLE public.installer_job_notes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.installer_job_notes FROM anon, authenticated;
GRANT SELECT ON public.installer_job_notes TO authenticated;
CREATE POLICY installer_job_notes_admin_read ON public.installer_job_notes
  FOR SELECT TO authenticated
  USING (rpm_private.current_role() IN ('super_admin','rodier_admin'));

CREATE FUNCTION rpm_private.installer_job_notes(p_job_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF auth.uid() IS NULL OR rpm_private.current_role() <> 'installer'
    OR NOT rpm_private.installer_can_access_job(p_job_id::text) THEN
    RAISE EXCEPTION 'Job access denied' USING ERRCODE='42501';
  END IF;
  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object(
      'id',n.id,'body',n.body,'created_at',n.created_at,
      'author',coalesce(u.name,u.email,'Installer')
    ) ORDER BY n.created_at DESC)
    FROM public.installer_job_notes n
    JOIN public.users u ON u.id=n.user_id
    WHERE n.job_id=p_job_id
  ), '[]'::jsonb);
END $$;

CREATE FUNCTION rpm_private.installer_add_job_note(p_job_id uuid,p_body text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE saved public.installer_job_notes; author_name text;
BEGIN
  IF auth.uid() IS NULL OR rpm_private.current_role() <> 'installer'
    OR NOT rpm_private.installer_can_access_job(p_job_id::text)
    OR NOT EXISTS (SELECT 1 FROM public.costing_jobs j WHERE j.id=p_job_id
      AND j.status::text IN ('approved','in_progress'))
    OR length(btrim(coalesce(p_body,''))) NOT BETWEEN 1 AND 4000 THEN
    RAISE EXCEPTION 'Note access denied' USING ERRCODE='42501';
  END IF;
  INSERT INTO public.installer_job_notes(job_id,user_id,body)
    VALUES (p_job_id,auth.uid(),btrim(p_body)) RETURNING * INTO saved;
  SELECT coalesce(u.name,u.email,'Installer') INTO author_name
    FROM public.users u WHERE u.id=auth.uid();
  RETURN jsonb_build_object('id',saved.id,'body',saved.body,
    'created_at',saved.created_at,'author',author_name);
END $$;

REVOKE ALL ON FUNCTION rpm_private.installer_job_notes(uuid),
  rpm_private.installer_add_job_note(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION rpm_private.installer_job_notes(uuid),
  rpm_private.installer_add_job_note(uuid,text) TO authenticated;

CREATE FUNCTION public.installer_job_notes(p_job_id uuid)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
  SELECT rpm_private.installer_job_notes(p_job_id)
$$;
CREATE FUNCTION public.installer_add_job_note(p_job_id uuid,p_body text)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
  SELECT rpm_private.installer_add_job_note(p_job_id,p_body)
$$;
REVOKE ALL ON FUNCTION public.installer_job_notes(uuid),
  public.installer_add_job_note(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.installer_job_notes(uuid),
  public.installer_add_job_note(uuid,text) TO authenticated;

