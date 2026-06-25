-- ============================================================
-- Job Costing module — initial schema
-- ------------------------------------------------------------
-- New, self-contained costing/BOM spine for Rodier's signage
-- manufacturing. Does NOT touch the existing maintenance `jobs`
-- / `projects` tables. Reuses clients/stores/users/vendors as
-- OPTIONAL links only. All data is Rodier-internal: RLS is
-- restricted to super_admin / rodier_admin — never client roles.
--
-- Model (see docs/job-costing-data-model.md):
--   materials (catalogue) -> costing_lines (internal BOM)
--                         -> costing_quote_items (customer sign lines -> Xero)
--   costing_time_entries + costing_material_actuals (actuals from job card)
--   => estimated vs actual.
-- ============================================================
BEGIN;

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Lifecycle: quote -> quoted -> approved -> in_progress -> complete -> invoiced
CREATE TYPE costing_status AS ENUM (
  'quote', 'quoted', 'approved', 'in_progress', 'complete', 'invoiced', 'cancelled'
);

-- ============================================================
-- 1. costing_sections — display taxonomy (section + subsection ordering)
-- ============================================================
CREATE TABLE IF NOT EXISTS costing_sections (
  id          SERIAL PRIMARY KEY,
  section     TEXT NOT NULL,
  subsection  TEXT,
  sort        INTEGER NOT NULL DEFAULT 0,
  UNIQUE (section, subsection)
);

-- ============================================================
-- 2. materials — priced catalogue (~250 common items; codes added later)
--    Labour rates live here too (is_labour = true, unit_cost = hourly rate).
-- ============================================================
CREATE TABLE IF NOT EXISTS materials (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code              TEXT,                              -- optional ID; searchable
  description       TEXT NOT NULL,
  supplier          TEXT,
  unit              TEXT,                              -- 'sheet' | 'm' | 'each' | 'hour' ...
  unit_cost         NUMERIC(12,4) NOT NULL DEFAULT 0,
  default_markup    NUMERIC(6,4)  NOT NULL DEFAULT 0.5,-- markup-on-cost, decimal (0.5 = 50%)
  section           TEXT NOT NULL,
  subsection        TEXT,
  date_last_checked DATE,
  check_note        TEXT,                              -- 'Old' | 'Guess' | 'Discontinued' ...
  is_labour         BOOLEAN NOT NULL DEFAULT false,
  active            BOOLEAN NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_materials_section      ON materials (section);
CREATE INDEX idx_materials_active       ON materials (active);
CREATE INDEX idx_materials_code_trgm    ON materials USING gin (code gin_trgm_ops);
CREATE INDEX idx_materials_desc_trgm    ON materials USING gin (description gin_trgm_ops);

-- ============================================================
-- 3. costing_jobs — the spine (client & store OPTIONAL for ad-hoc work)
-- ============================================================
CREATE TABLE IF NOT EXISTS costing_jobs (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_number          TEXT,                            -- 4-digit Xero/job ref (set on approval)
  title               TEXT NOT NULL,
  client_id           UUID REFERENCES clients(id) ON DELETE SET NULL,
  store_id            UUID REFERENCES stores(id)  ON DELETE SET NULL,
  reference           TEXT,                            -- Xero "Reference" field
  details             TEXT,
  quoted_by           UUID REFERENCES users(id),
  qty                 NUMERIC(12,3) NOT NULL DEFAULT 1,-- project qty for per-unit costing
  status              costing_status NOT NULL DEFAULT 'quote',
  adjusted_total      NUMERIC(14,2),                   -- manual override of grand SELL total
  xero_quote_id       TEXT,
  xero_quote_number   TEXT,
  xero_invoice_number TEXT,
  folder_ref          TEXT,                            -- 'YY-MM-DD Title NNNN'
  notes               TEXT,
  created_by          UUID REFERENCES users(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_costing_jobs_client ON costing_jobs (client_id);
CREATE INDEX idx_costing_jobs_store  ON costing_jobs (store_id);
CREATE INDEX idx_costing_jobs_status ON costing_jobs (status);

-- ============================================================
-- 4. costing_lines — the internal BOM / estimate (cost & sell derived)
--    line_cost = qty * unit_cost
--    line_sell = qty * COALESCE(unit_sell_override, unit_cost * (1 + markup))
--    (margin is derived in the app/view; a generated column may not
--     reference other generated columns.)
-- ============================================================
CREATE TABLE IF NOT EXISTS costing_lines (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id             UUID NOT NULL REFERENCES costing_jobs(id) ON DELETE CASCADE,
  section            TEXT NOT NULL,
  subsection         TEXT,
  sort               INTEGER NOT NULL DEFAULT 0,
  material_id        UUID REFERENCES materials(id) ON DELETE SET NULL,  -- null = ad-hoc line
  description        TEXT NOT NULL,
  supplier           TEXT,
  qty                NUMERIC(12,4) NOT NULL DEFAULT 0,
  unit_cost          NUMERIC(12,4) NOT NULL DEFAULT 0,
  markup             NUMERIC(6,4)  NOT NULL DEFAULT 0,
  unit_sell_override NUMERIC(12,4),                    -- null = derive sell from markup
  internal_note      TEXT,                             -- shows on job card, NOT on invoice
  weight_kg          NUMERIC(12,4),                    -- steel -> galvanising aux calc
  line_cost NUMERIC(16,4) GENERATED ALWAYS AS (qty * unit_cost) STORED,
  line_sell NUMERIC(16,4) GENERATED ALWAYS AS (
    qty * COALESCE(unit_sell_override, unit_cost * (1 + markup))
  ) STORED,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_costing_lines_job      ON costing_lines (job_id);
CREATE INDEX idx_costing_lines_material ON costing_lines (material_id);

-- ============================================================
-- 5. costing_quote_items — customer-facing sign lines (-> Xero quote)
-- ============================================================
CREATE TABLE IF NOT EXISTS costing_quote_items (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id      UUID NOT NULL REFERENCES costing_jobs(id) ON DELETE CASCADE,
  sign_code   TEXT,                                    -- e.g. 'S21'
  name        TEXT NOT NULL,
  size        TEXT,
  details     TEXT,
  delivery    TEXT,                                    -- 'ex-factory' | 'freight' | 'install'
  qty         NUMERIC(12,3) NOT NULL DEFAULT 1,
  unit_price  NUMERIC(12,2) NOT NULL DEFAULT 0,
  sort        INTEGER NOT NULL DEFAULT 0,
  amount NUMERIC(16,2) GENERATED ALWAYS AS (qty * unit_price) STORED,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_costing_quote_items_job ON costing_quote_items (job_id);

-- ============================================================
-- 6. costing_time_entries — actual labour (job card HOURS table)
-- ============================================================
CREATE TABLE IF NOT EXISTS costing_time_entries (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id       UUID NOT NULL REFERENCES costing_jobs(id) ON DELETE CASCADE,
  work_date    DATE,
  user_id      UUID REFERENCES users(id),             -- optional link to a staff user
  person_name  TEXT,                                  -- free text (not all staff are users)
  hours        NUMERIC(8,2) NOT NULL DEFAULT 0,
  description  TEXT,
  labour_type  TEXT,                                  -- maps to a Factory/Install labour line
  created_by   UUID REFERENCES users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_costing_time_entries_job ON costing_time_entries (job_id);

-- ============================================================
-- 7. costing_material_actuals — actual materials (job card Materials/Orders)
-- ============================================================
CREATE TABLE IF NOT EXISTS costing_material_actuals (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id       UUID NOT NULL REFERENCES costing_jobs(id) ON DELETE CASCADE,
  order_date   DATE,
  supplier     TEXT,
  description  TEXT,
  qty          NUMERIC(12,4),
  cost         NUMERIC(12,4),
  material_id  UUID REFERENCES materials(id) ON DELETE SET NULL,
  created_by   UUID REFERENCES users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_costing_material_actuals_job ON costing_material_actuals (job_id);

-- ============================================================
-- 8. updated_at triggers (reuse public.set_updated_at)
-- ============================================================
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'materials', 'costing_jobs', 'costing_lines', 'costing_quote_items',
    'costing_time_entries', 'costing_material_actuals'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %1$s_set_updated_at ON %1$s;', t);
    EXECUTE format(
      'CREATE TRIGGER %1$s_set_updated_at BEFORE UPDATE ON %1$s
         FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();', t);
  END LOOP;
END $$;

-- ============================================================
-- 9. RLS — Rodier-internal only (super_admin / rodier_admin).
--    Clients (client_hq / client_store) get NO access to costing data.
-- ============================================================
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'costing_sections', 'materials', 'costing_jobs', 'costing_lines',
    'costing_quote_items', 'costing_time_entries', 'costing_material_actuals'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO authenticated;', t);

    -- Read + write for Rodier staff
    EXECUTE format($f$
      CREATE POLICY %1$s_admin_rw ON %1$s FOR ALL
      USING (EXISTS (SELECT 1 FROM users
                     WHERE users.id = auth.uid()
                       AND users.role IN ('super_admin','rodier_admin')))
      WITH CHECK (EXISTS (SELECT 1 FROM users
                          WHERE users.id = auth.uid()
                            AND users.role IN ('super_admin','rodier_admin')));
    $f$, t);
  END LOOP;
END $$;

-- costing_sections is a shared lookup; allow any authenticated user to read it
CREATE POLICY costing_sections_read ON costing_sections FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- ============================================================
-- 10. Seed the section / subsection taxonomy (from the master template)
-- ============================================================
INSERT INTO costing_sections (section, subsection, sort) VALUES
  ('Materials', 'ACM - Fabrication grade', 10),
  ('Materials', 'ACM - FEVE', 20),
  ('Materials', 'Acrylic Opal and Clear', 30),
  ('Materials', 'Acrylic White, Black and Coloured', 40),
  ('Materials', 'Polycarbonate', 50),
  ('Materials', 'Multiboard', 60),
  ('Materials', 'Aluminium Sheet', 70),
  ('Materials', 'Aluminium Extrusions', 80),
  ('Materials', 'Flexface', 90),
  ('Materials', 'Vinyl', 100),
  ('Materials', 'Fixings', 110),
  ('Materials', 'Paint', 120),
  ('Materials', 'Misc', 130),
  ('Wiring - LED', 'Modules', 210),
  ('Wiring - LED', 'Transformers', 220),
  ('Wiring - LED', 'Misc', 230),
  ('Labour', 'Factory Time', 310),
  ('Labour', 'Install Time', 320),
  ('Pack/Despatch/Freight', 'Powdercoating', 410),
  ('Pack/Despatch/Freight', 'Painting', 420),
  ('Pack/Despatch/Freight', 'Laser cutting', 430),
  ('Pack/Despatch/Freight', 'Guillotine/Presswork', 440),
  ('Pack/Despatch/Freight', 'Access', 450),
  ('Pack/Despatch/Freight', 'Galvanising', 460),
  ('Pack/Despatch/Freight', 'General', 470);

COMMIT;
