-- Reusable products (Stu): save a whole build item (BOM of materials + labour) as a
-- template, then drop it into a job's items in one click.
-- A product is just a build item with its lines, held under a special "Product Library"
-- template job (so the whole existing item/BOM editor is reused as-is).
BEGIN;

ALTER TABLE costing_jobs ADD COLUMN IF NOT EXISTS is_template BOOLEAN NOT NULL DEFAULT false;

-- The single library holder (its items are the products)
INSERT INTO costing_jobs (title, is_template, qty, status)
SELECT 'Product Library', true, 1, 'quote'
WHERE NOT EXISTS (SELECT 1 FROM costing_jobs WHERE is_template);

-- Clone an item (and its BOM lines) into a target job — used to add a product to a
-- job, and to save a job item back as a product. SECURITY INVOKER (default) so RLS
-- (admin-only) still applies to the caller.
CREATE OR REPLACE FUNCTION clone_costing_item(src_item UUID, target_job UUID)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE new_item UUID; next_sort INT;
BEGIN
  SELECT coalesce(max(sort), 0) + 1 INTO next_sort FROM costing_items WHERE job_id = target_job;

  INSERT INTO costing_items (job_id, name, mode, qty, unit_cost, unit_price, sign_code, size, details, delivery, sort)
  SELECT target_job, name, mode, qty, unit_cost, unit_price, sign_code, size, details, delivery, next_sort
  FROM costing_items WHERE id = src_item
  RETURNING id INTO new_item;

  INSERT INTO costing_lines
    (job_id, item_id, section, subsection, sort, material_id, description, supplier, qty, unit_cost,
     markup, unit_sell_override, internal_note, weight_kg, wt_factor, wt_size, wt_qty, watts)
  SELECT target_job, new_item, section, subsection, sort, material_id, description, supplier, qty, unit_cost,
     markup, unit_sell_override, internal_note, weight_kg, wt_factor, wt_size, wt_qty, watts
  FROM costing_lines WHERE item_id = src_item;

  RETURN new_item;
END $$;

GRANT EXECUTE ON FUNCTION clone_costing_item(UUID, UUID) TO authenticated;

COMMIT;
