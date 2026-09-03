-- Shared Rodier / client Projects & Tasks register.

CREATE TABLE IF NOT EXISTS client_tasks (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    store_id uuid REFERENCES stores(id) ON DELETE SET NULL,
    asset_id uuid REFERENCES assets(id) ON DELETE SET NULL,

    title text NOT NULL,
    description text,

    status text NOT NULL DEFAULT 'new'
        CHECK (
            status IN (
                'new',
                'in_progress',
                'waiting_client',
                'waiting_rodier',
                'completed',
                'cancelled'
            )
        ),

    priority text NOT NULL DEFAULT 'normal'
        CHECK (
            priority IN (
                'low',
                'normal',
                'high',
                'urgent'
            )
        ),

    created_by uuid REFERENCES users(id) ON DELETE SET NULL,
    assigned_to uuid REFERENCES users(id) ON DELETE SET NULL,

    due_date date,
    completed_at timestamptz,

    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS client_tasks_client_id_idx
    ON client_tasks(client_id);

CREATE INDEX IF NOT EXISTS client_tasks_store_id_idx
    ON client_tasks(store_id);

CREATE INDEX IF NOT EXISTS client_tasks_asset_id_idx
    ON client_tasks(asset_id);

CREATE INDEX IF NOT EXISTS client_tasks_status_idx
    ON client_tasks(status);

ALTER TABLE client_tasks ENABLE ROW LEVEL SECURITY;

-- Rodier admins can view all tasks.
-- Client HQ users can view tasks belonging to their own client.
CREATE POLICY client_tasks_select
ON client_tasks
FOR SELECT
USING (
    EXISTS (
        SELECT 1
        FROM users
        WHERE users.id = auth.uid()
          AND (
              users.role IN ('super_admin', 'rodier_admin')
              OR (
                  users.role IN ('client_hq', 'client_store')
                  AND users.client_id = client_tasks.client_id
              )
          )
    )
);

-- Rodier admins and Client HQ can create tasks.
-- Client HQ can only create tasks for their own client.
CREATE POLICY client_tasks_insert
ON client_tasks
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
                  AND users.client_id = client_tasks.client_id
              )
          )
    )
);

-- Rodier admins and Client HQ can update tasks.
-- Client HQ can only update their own client's tasks.
CREATE POLICY client_tasks_update
ON client_tasks
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
                  AND users.client_id = client_tasks.client_id
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
                  AND users.client_id = client_tasks.client_id
              )
          )
    )
);

-- Only Rodier admins can delete tasks.
CREATE POLICY client_tasks_delete
ON client_tasks
FOR DELETE
USING (
    EXISTS (
        SELECT 1
        FROM users
        WHERE users.id = auth.uid()
          AND users.role IN ('super_admin', 'rodier_admin')
    )
);
