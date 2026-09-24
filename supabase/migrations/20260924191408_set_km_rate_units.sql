-- The two seeded kilometre rates live in Labour for costing, but their
-- quantities are distances. Record that explicitly for hour calculations.
update public.materials
set unit = 'km'
where section = 'Labour'
  and description in ('Km rate', 'Km rate - Escalated')
  and nullif(trim(unit), '') is null;
