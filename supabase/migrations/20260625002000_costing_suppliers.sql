-- Suppliers list for the costing module. Lets users type a supplier on a line
-- and have it saved for reuse (Stu's feedback). Seeded from suppliers already in
-- the materials catalogue. Rodier-internal (admin-only RLS), like the other costing tables.
BEGIN;

CREATE TABLE IF NOT EXISTS costing_suppliers (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed from existing material suppliers
INSERT INTO costing_suppliers (name)
SELECT DISTINCT trim(supplier) FROM materials
WHERE supplier IS NOT NULL AND trim(supplier) <> ''
ON CONFLICT (name) DO NOTHING;

ALTER TABLE costing_suppliers ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON costing_suppliers TO authenticated;

CREATE POLICY costing_suppliers_admin_rw ON costing_suppliers FOR ALL
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid()
                 AND users.role IN ('super_admin','rodier_admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid()
                      AND users.role IN ('super_admin','rodier_admin')));

COMMIT;
