-- LED/transformer wattage for the sizing calc (Stu #2).
-- materials.watts: per-unit consumption for LED modules; usable capacity for transformers.
-- costing_lines.watts: copied from the material when added (used by the calc).
BEGIN;

ALTER TABLE materials ADD COLUMN IF NOT EXISTS watts NUMERIC(8,2);
ALTER TABLE costing_lines ADD COLUMN IF NOT EXISTS watts NUMERIC(8,2);

-- Transformers: usable capacity from the "(… Nwatts)" in the description
UPDATE materials
SET watts = (substring(description from '([0-9]+)watts'))::numeric
WHERE section = 'Wiring - LED' AND subsection = 'Transformers' AND description ~ '[0-9]+watts';

-- LED modules: per-unit consumption from the "N.Nw" in the description
UPDATE materials
SET watts = (substring(description from '([0-9]+\.?[0-9]*)w'))::numeric
WHERE section = 'Wiring - LED' AND subsection = 'Modules' AND description ~ '[0-9]+\.?[0-9]*w';

COMMIT;
