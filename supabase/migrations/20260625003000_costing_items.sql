-- Multi-item jobs (Stu's feedback): a job is made of items (Sign 1, Sign 2, Travel…),
-- each either a full BOM ("build") or a single cost/sell line ("simple").
-- Repurposes the empty costing_quote_items table as costing_items and links BOM
-- lines to an item. Every existing job is folded into one default "build" item so
-- nothing breaks.
BEGIN;

ALTER TABLE costing_quote_items RENAME TO costing_items;

ALTER TABLE costing_items ADD COLUMN IF NOT EXISTS mode TEXT NOT NULL DEFAULT 'build'
  CHECK (mode IN ('simple', 'build'));
ALTER TABLE costing_items ADD COLUMN IF NOT EXISTS unit_cost NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE costing_items DROP COLUMN IF EXISTS amount;   -- cost/sell derived in app (build) or from unit_cost/price (simple)

-- BOM lines now belong to an item (cascade so deleting an item clears its BOM)
ALTER TABLE costing_lines ADD COLUMN IF NOT EXISTS item_id UUID REFERENCES costing_items(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_costing_lines_item ON costing_lines (item_id);

-- One default build item per existing job, named after the job
INSERT INTO costing_items (job_id, name, mode, qty, sort)
SELECT id, title, 'build', COALESCE(qty, 1), 0 FROM costing_jobs;

-- Point every existing BOM line at its job's default item
UPDATE costing_lines l SET item_id = i.id
FROM costing_items i WHERE i.job_id = l.job_id AND l.item_id IS NULL;

COMMIT;
