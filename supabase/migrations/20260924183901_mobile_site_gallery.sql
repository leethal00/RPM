-- Give RPM Mobile a site gallery without exposing private installer uploads.
CREATE OR REPLACE FUNCTION rpm_private.mobile_site_gallery(p_site_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE result jsonb;
BEGIN
  IF auth.uid() IS NULL OR coalesce(rpm_private.current_role(), '') NOT IN
    ('installer', 'mobile_admin', 'rodier_admin', 'super_admin') THEN
    RAISE EXCEPTION 'Mobile access denied' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'site', jsonb_build_object('id', s.id, 'name', s.name, 'address', s.address,
      'lat', s.lat, 'lng', s.lng, 'client_name', c.name),
    'photos', coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', p.id, 'url', p.url,
        'caption', p.caption, 'album_id', p.album_id,
        'album_name', a.name, 'created_at', p.created_at)
        ORDER BY p.created_at DESC NULLS LAST, p.id)
      FROM public.site_photos p
      LEFT JOIN public.site_photo_albums a ON a.id = p.album_id
        AND a.store_id = p.store_id AND a.audience = 'client'
      WHERE p.store_id = s.id AND NOT p.internal_only
        AND nullif(p.url, '') IS NOT NULL
        AND (p.album_id IS NULL OR a.id IS NOT NULL)
    ), '[]'::jsonb)
  ) INTO result
  FROM public.stores s
  JOIN public.clients c ON c.id = s.client_id
  WHERE s.id = p_site_id AND s.status::text = 'active';

  IF result IS NULL THEN
    RAISE EXCEPTION 'Site not found' USING ERRCODE = '22023';
  END IF;
  RETURN result;
END $$;

REVOKE ALL ON FUNCTION rpm_private.mobile_site_gallery(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION rpm_private.mobile_site_gallery(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.mobile_site_gallery(p_site_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT rpm_private.mobile_site_gallery(p_site_id)
$$;
REVOKE ALL ON FUNCTION public.mobile_site_gallery(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mobile_site_gallery(uuid) TO authenticated;
