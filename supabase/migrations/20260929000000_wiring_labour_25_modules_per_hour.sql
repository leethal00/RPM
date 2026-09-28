-- Update the wiring labour guide on existing catalogue items and BOM lines.
-- Leave estimated quantities and LED module/driver sizing data untouched.
BEGIN;

UPDATE materials
SET description = 'Wiring Labour (25 modules per hour as a guide)'
WHERE section = 'Wiring - LED'
  AND description = 'Wiring Labour (20 modules per hour as a guide)';

UPDATE costing_lines
SET description = 'Wiring Labour (25 modules per hour as a guide)'
WHERE section = 'Wiring - LED'
  AND description = 'Wiring Labour (20 modules per hour as a guide)';

COMMIT;
