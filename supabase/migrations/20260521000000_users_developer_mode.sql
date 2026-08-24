-- Adds a developer-mode flag on users for gating power-user features
-- like the AI Auto-Build workflow. Default false; flipped manually for
-- users we trust to ship code via the automation.

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS developer_mode boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN users.developer_mode IS
    'When true, the user can trigger AI-driven workflows (e.g. AI Auto-Build feature requests). Must be a small, trusted set.';
