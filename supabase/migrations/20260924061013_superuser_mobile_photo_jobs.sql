-- Super users can find every job that has mobile photos without loading costing details.
CREATE FUNCTION rpm_private.superuser_photo_jobs(p_search text DEFAULT '', p_offset integer DEFAULT 0)
RETURNS TABLE(job_id uuid, job_number text, title text, client_name text, site_name text,
  photo_count bigint, latest_photo_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF auth.uid() IS NULL OR rpm_private.current_role()<>'super_admin' THEN
    RAISE EXCEPTION 'Photo access denied' USING ERRCODE='42501';
  END IF;
  RETURN QUERY
    SELECT j.id, j.job_number::text, j.title::text, c.name::text, s.name::text,
      count(p.id), max(p.uploaded_at)
    FROM public.installer_photos p
    JOIN public.costing_jobs j ON j.id=p.job_id
    LEFT JOIN public.clients c ON c.id=j.client_id
    LEFT JOIN public.stores s ON s.id=j.store_id
    WHERE trim(coalesce(p_search,''))=''
      OR j.job_number ILIKE '%'||left(trim(p_search),80)||'%'
      OR j.title ILIKE '%'||left(trim(p_search),80)||'%'
      OR c.name ILIKE '%'||left(trim(p_search),80)||'%'
      OR s.name ILIKE '%'||left(trim(p_search),80)||'%'
    GROUP BY j.id,c.name,s.name
    ORDER BY max(p.uploaded_at) DESC
    LIMIT 50 OFFSET greatest(coalesce(p_offset,0),0);
END $$;
REVOKE ALL ON FUNCTION rpm_private.superuser_photo_jobs(text,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION rpm_private.superuser_photo_jobs(text,integer) TO authenticated;

CREATE FUNCTION public.superuser_photo_jobs(p_search text DEFAULT '', p_offset integer DEFAULT 0)
RETURNS TABLE(job_id uuid, job_number text, title text, client_name text, site_name text,
  photo_count bigint, latest_photo_at timestamptz)
LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
  SELECT * FROM rpm_private.superuser_photo_jobs(p_search,p_offset)
$$;
REVOKE ALL ON FUNCTION public.superuser_photo_jobs(text,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.superuser_photo_jobs(text,integer) TO authenticated;
