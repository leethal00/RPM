-- Allow client HQ users to manage stores belonging to their own client.
-- Rodier admins retain access to all stores.

DROP POLICY IF EXISTS stores_insert ON stores;
DROP POLICY IF EXISTS stores_update ON stores;

CREATE POLICY stores_insert
ON stores
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM users
    WHERE users.id = auth.uid()
      AND (
        users.role IN ('super_admin', 'rodier_admin')
        OR (
          users.role = 'client_hq'
          AND users.client_id = stores.client_id
        )
      )
  )
);

CREATE POLICY stores_update
ON stores
FOR UPDATE
USING (
  EXISTS (
    SELECT 1
    FROM users
    WHERE users.id = auth.uid()
      AND (
        users.role IN ('super_admin', 'rodier_admin')
        OR (
          users.role = 'client_hq'
          AND users.client_id = stores.client_id
        )
      )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM users
    WHERE users.id = auth.uid()
      AND (
        users.role IN ('super_admin', 'rodier_admin')
        OR (
          users.role = 'client_hq'
          AND users.client_id = stores.client_id
        )
      )
  )
);
