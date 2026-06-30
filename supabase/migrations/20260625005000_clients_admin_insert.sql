-- Let Rodier admins (not just super_admin) create a client — so a new client can be
-- added inline from the costing job form. Mirrors stores_insert which already allows
-- rodier_admin. SELECT/UPDATE/DELETE on clients are unchanged.
BEGIN;

CREATE POLICY clients_rodier_admin_insert ON clients FOR INSERT
  WITH CHECK (get_my_role() IN ('super_admin', 'rodier_admin'));

COMMIT;
