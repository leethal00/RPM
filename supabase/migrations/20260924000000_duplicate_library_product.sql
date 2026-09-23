-- The live line schema has a catalogue cost snapshot that the existing clone
-- function misses. Record it in migration history and include it in every
-- costing item copy, including library products.
alter table public.costing_lines
  add column if not exists catalogue_unit_cost_snapshot numeric;

create or replace function public.clone_costing_item(src_item uuid, target_job uuid)
returns uuid
language plpgsql
security invoker
set search_path = public
as $function$
declare new_item uuid; next_sort int;
begin
  select coalesce(max(sort), 0) + 1 into next_sort from public.costing_items where job_id = target_job;

  insert into public.costing_items (job_id, name, mode, qty, build_qty, unit_cost, unit_price, sign_code, size, details, delivery, sort)
  select target_job, name, mode, qty, build_qty, unit_cost, unit_price, sign_code, size, details, delivery, next_sort
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

-- Duplicate a product within the library in one transaction. The clone
-- function creates fresh item and BOM line IDs while retaining all editable
-- costing values, sections, and line order.
create or replace function public.duplicate_library_product(src_item uuid)
returns uuid
language plpgsql
security invoker
set search_path = public
as $function$
declare
  source_job uuid;
  source_name text;
  new_item uuid;
begin
  select i.job_id, i.name
    into source_job, source_name
  from public.costing_items i
  join public.costing_jobs j on j.id = i.job_id
  where i.id = src_item and j.is_template = true;

  if source_job is null then
    raise exception 'Product not found in library';
  end if;

  new_item := public.clone_costing_item(src_item, source_job);
  if new_item is null then
    raise exception 'Could not duplicate product';
  end if;

  update public.costing_items
    set name = coalesce(nullif(btrim(source_name), ''), 'Untitled product') || ' - Copy'
  where id = new_item;

  return new_item;
end;
$function$;

revoke execute on function public.duplicate_library_product(uuid) from public, anon;
grant execute on function public.duplicate_library_product(uuid) to authenticated;
