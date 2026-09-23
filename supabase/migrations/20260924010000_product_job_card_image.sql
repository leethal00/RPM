-- Keep one immutable storage path per product/item. Copies retain the same
-- image, while replacing a product image only changes that product.
alter table public.costing_items
  add column if not exists image_path text;

create or replace function public.clone_costing_item(src_item uuid, target_job uuid)
returns uuid
language plpgsql
security invoker
set search_path = public
as $function$
declare new_item uuid; next_sort int;
begin
  select coalesce(max(sort), 0) + 1 into next_sort from public.costing_items where job_id = target_job;

  insert into public.costing_items (job_id, name, mode, qty, build_qty, unit_cost, unit_price, sign_code, size, details, delivery, sort, image_path)
  select target_job, name, mode, qty, build_qty, unit_cost, unit_price, sign_code, size, details, delivery, next_sort, image_path
  from public.costing_items where id = src_item
  returning id into new_item;

  insert into public.costing_lines
    (job_id, item_id, section, subsection, sort, material_id, description, supplier, qty, unit_cost,
     catalogue_unit_cost_snapshot, markup, unit_sell_override, internal_note, weight_kg, wt_factor, wt_size, wt_qty, watts)
  select target_job, new_item, section, subsection, sort, material_id, description, supplier, qty, unit_cost,
     catalogue_unit_cost_snapshot, markup, unit_sell_override, internal_note, weight_kg, wt_factor, wt_size, wt_qty, watts
  from public.costing_lines where item_id = src_item;

  return new_item;
end $function$;
