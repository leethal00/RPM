-- Super users may remove any job photo from the desktop job view.
-- The image file is removed through the Storage API before this table row.
GRANT DELETE ON public.installer_photos TO authenticated;
DROP POLICY IF EXISTS installer_photos_admin_delete ON public.installer_photos;
CREATE POLICY installer_photos_admin_delete ON public.installer_photos
  FOR DELETE TO authenticated
  USING (rpm_private.current_role() IN ('super_admin','rodier_admin'));
