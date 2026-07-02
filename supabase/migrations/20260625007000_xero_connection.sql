-- Xero OAuth2 connection (single Rodier org). Holds the access/refresh tokens.
-- RLS ON with NO policies => unreadable from the browser (anon/authenticated);
-- only server route handlers using the service-role key can touch it.
BEGIN;

CREATE TABLE IF NOT EXISTS xero_connection (
  id            INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),  -- single row
  tenant_id     TEXT,
  tenant_name   TEXT,
  access_token  TEXT,
  refresh_token TEXT,
  expires_at    TIMESTAMPTZ,
  scopes        TEXT,
  connected_by  UUID REFERENCES users(id),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE xero_connection ENABLE ROW LEVEL SECURITY;
-- intentionally no policies: only the service role (route handlers) may read/write.

COMMIT;
