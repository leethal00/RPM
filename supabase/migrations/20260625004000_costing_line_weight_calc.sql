-- Galvanising weight calc (Stu): each steel line's weight = factor × size × qty,
-- entered manually and independent of the cost-line qty (they bill full length but
-- galvanise only what's used). factor = kg/m (linear) or kg/m² (plate); size =
-- length (m) or area (m²); qty = number of pieces.
BEGIN;

ALTER TABLE costing_lines ADD COLUMN IF NOT EXISTS wt_factor NUMERIC(12,4);  -- kg per m  OR  kg per m²
ALTER TABLE costing_lines ADD COLUMN IF NOT EXISTS wt_size   NUMERIC(12,4);  -- length (m)  OR  area (m²)
ALTER TABLE costing_lines ADD COLUMN IF NOT EXISTS wt_qty    NUMERIC(12,4);  -- number of pieces

COMMIT;
