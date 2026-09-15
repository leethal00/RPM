-- Correct LED sizing data used by the Wiring - LED calculator.
BEGIN;

-- The 1.08 W three-block module is sized at 1.20 W design load.
UPDATE materials
SET watts = 1.20
WHERE section = 'Wiring - LED'
  AND subsection = 'Modules'
  AND description ILIKE 'Modules 1.08w 3 block%';

-- Use the full driver model rating (e.g. HLG-320 = 320 W) for capacity.
UPDATE materials
SET watts = (substring(description from 'HLG-([0-9]+)H'))::numeric
WHERE section = 'Wiring - LED'
  AND description ~* 'HLG-[0-9]+H';

-- Refresh existing BOM lines linked to those catalogue items.
UPDATE costing_lines cl
SET watts = m.watts
FROM materials m
WHERE cl.material_id = m.id
  AND m.section = 'Wiring - LED'
  AND (
    m.description ILIKE 'Modules 1.08w 3 block%'
    OR m.description ~* 'HLG-[0-9]+H'
  );

COMMIT;
