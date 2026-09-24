-- Albums belong to one site's client or internal gallery. Installer photos
-- remain in their private bucket while sharing the internal gallery UI.
ALTER TABLE public.site_photo_albums
  ADD COLUMN audience text NOT NULL DEFAULT 'client'
  CHECK (audience IN ('client', 'internal'));

DROP INDEX IF EXISTS public.idx_site_photo_albums_store_name_unique;
CREATE UNIQUE INDEX site_photo_albums_store_audience_name
  ON public.site_photo_albums(store_id, audience, lower(name));

ALTER TABLE public.installer_photos
  ADD COLUMN album_id uuid REFERENCES public.site_photo_albums(id) ON DELETE SET NULL;
CREATE INDEX installer_photos_album_idx ON public.installer_photos(album_id);

-- A client can see names of albums intended for clients only.
DROP POLICY IF EXISTS site_photo_albums_select ON public.site_photo_albums;
CREATE POLICY site_photo_albums_select ON public.site_photo_albums FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid()
    AND (u.role IN ('super_admin','rodier_admin') OR
      (audience = 'client' AND EXISTS (SELECT 1 FROM public.stores s
        WHERE s.id = site_photo_albums.store_id AND s.client_id = u.client_id))))
);

GRANT UPDATE, DELETE ON public.installer_photos TO authenticated;
CREATE POLICY installer_photos_admin_update ON public.installer_photos FOR UPDATE TO authenticated
  USING (rpm_private.current_role() IN ('super_admin','rodier_admin'))
  WITH CHECK (rpm_private.current_role() IN ('super_admin','rodier_admin'));
CREATE POLICY installer_photos_admin_delete ON public.installer_photos FOR DELETE TO authenticated
  USING (rpm_private.current_role() IN ('super_admin','rodier_admin'));

-- Prevent photos being assigned to an album for a different site or gallery.
CREATE FUNCTION rpm_private.validate_site_photo_album() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NEW.album_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.site_photo_albums a WHERE a.id = NEW.album_id
      AND a.store_id = NEW.store_id
      AND a.audience = CASE WHEN NEW.internal_only THEN 'internal' ELSE 'client' END
  ) THEN RAISE EXCEPTION 'Album must belong to the same site and gallery' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER site_photo_album_guard BEFORE INSERT OR UPDATE OF store_id,album_id,internal_only
  ON public.site_photos FOR EACH ROW EXECUTE FUNCTION rpm_private.validate_site_photo_album();

CREATE FUNCTION rpm_private.validate_installer_photo_album() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NEW.album_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.site_photo_albums a WHERE a.id = NEW.album_id
      AND a.store_id = NEW.store_id AND a.audience = 'internal'
  ) THEN RAISE EXCEPTION 'Album must belong to the same site and internal gallery' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER installer_photo_album_guard BEFORE INSERT OR UPDATE OF store_id,album_id
  ON public.installer_photos FOR EACH ROW EXECUTE FUNCTION rpm_private.validate_installer_photo_album();
