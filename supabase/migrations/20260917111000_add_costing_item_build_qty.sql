alter table public.costing_items add column if not exists build_qty numeric;

create or replace function public.clone_costing_item(src_item uuid, target_job uuid)
returns uuid
language plpgsql
as $function$
declare new_item uuid; next_sort int;
begin
  select coalesce(max(sort), 0) + 1 into next_sort from costing_items where job_id = target_job;

  insert into costing_items (job_id, name, mode, qty, build_qty, unit_cost, unit_price, sign_code, size, details, delivery, sort)
  select target_job, name, mode, qty, build_qty, unit_cost, unit_price, sign_code, size, details, delivery, next_sort
  from costing_items where id = src_item
  returning id into new_item;

  insert into costing_lines
    (job_id, item_id, section, subsection, sort, material_id, description, supplier, qty, unit_cost,
     markup, unit_sell_override, internal_note, weight_kg, wt_factor, wt_size, wt_qty, watts)
  select target_job, new_item, section, subsection, sort, material_id, description, supplier, qty, unit_cost,
     markup, unit_sell_override, internal_note, weight_kg, wt_factor, wt_size, wt_qty, watts
  from costing_lines where item_id = src_item;

  return new_item;
end $function$;
