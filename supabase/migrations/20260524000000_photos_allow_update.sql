-- Photo galleries now expose a per-photo "Service team only" toggle that
-- flips internal_only on existing rows. The original RLS hardening
-- (20260317000000) explicitly revoked UPDATE from authenticated on the
-- two photo tables on the grounds that captions/urls shouldn't be edited
-- after upload. That blanket revoke also blocks the new toggle for
-- admins, so we restore UPDATE at the table-grant layer and rely on RLS
-- to keep client roles out.
--
-- We also add a WITH CHECK clause to the admin_all_* policies. FOR ALL
-- without WITH CHECK lets the row pass UPDATE's USING check but rejects
-- the new row on the WITH CHECK side (which defaults to FALSE), so
-- admin UPDATEs were doubly blocked.
--
-- Client roles still can't UPDATE: there is no client_update_* policy
-- on either table, so RLS will reject any UPDATE from them.

BEGIN;

-- 1. Restore table-level UPDATE grants.
GRANT UPDATE ON public.site_photos  TO authenticated;
GRANT UPDATE ON public.asset_photos TO authenticated;

-- 2. Re-create admin policies with matching WITH CHECK.
DROP POLICY IF EXISTS admin_all_site_photos  ON public.site_photos;
CREATE POLICY admin_all_site_photos ON public.site_photos
    FOR ALL
    USING      (public.get_my_role() IN ('super_admin', 'rodier_admin'))
    WITH CHECK (public.get_my_role() IN ('super_admin', 'rodier_admin'));

DROP POLICY IF EXISTS admin_all_asset_photos ON public.asset_photos;
CREATE POLICY admin_all_asset_photos ON public.asset_photos
    FOR ALL
    USING      (public.get_my_role() IN ('super_admin', 'rodier_admin'))
    WITH CHECK (public.get_my_role() IN ('super_admin', 'rodier_admin'));

COMMIT;
