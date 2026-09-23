-- Run against a migrated test database with psql -v ON_ERROR_STOP=1 -f.
begin;

do $test$
declare
  library_id uuid;
  source_id uuid;
  copy_id uuid;
  job_id uuid;
  job_item_id uuid;
begin
  insert into public.costing_jobs (title, is_template, qty, status)
  values ('Product copy test library', true, 1, 'quote') returning id into library_id;

  insert into public.costing_items
    (job_id, name, mode, qty, build_qty, unit_cost, unit_price, sign_code, size, details, delivery, sort, image_path)
  values
    (library_id, 'Road Sign', 'build', 2, 5, 19, 150, 'S40', '400x600', 'Aluminium', 'Freight to site', 3, 'products/test/road-sign.png')
  returning id into source_id;

  insert into public.costing_lines
    (job_id, item_id, section, subsection, sort, description, supplier, qty, unit_cost, catalogue_unit_cost_snapshot,
     markup, unit_sell_override, internal_note, weight_kg, wt_factor, wt_size, wt_qty, watts)
  values
    (library_id, source_id, 'Materials', 'Sheet', 2, 'Aluminium sheet', 'Supplier', 2, 20, 18,
     0.25, null, 'Cut to size', 1.2, 1, 2, 1, null),
    (library_id, source_id, 'Labour', 'Assembly', 1, 'Fabrication', null, 3, 40, null,
     0.5, 75, 'Weld corners', null, null, null, null, 10);

  copy_id := public.duplicate_library_product(source_id);

  if copy_id is null or copy_id = source_id then
    raise exception 'Duplicate has no independent item ID';
  end if;

  insert into public.costing_jobs (title, is_template, qty, status)
  values ('Product image test job', false, 1, 'quote') returning id into job_id;
  job_item_id := public.clone_costing_item(source_id, job_id);
  if (select image_path from public.costing_items where id = job_item_id)
     is distinct from 'products/test/road-sign.png' then
    raise exception 'Job item lost the product image';
  end if;

  if not exists (
    select 1 from public.costing_items i
    where i.id = copy_id and i.job_id = library_id and i.name = 'Road Sign - Copy'
      and i.image_path = 'products/test/road-sign.png'
      and (i.mode, i.qty, i.build_qty, i.unit_cost, i.unit_price, i.sign_code, i.size, i.details, i.delivery)
       is not distinct from ('build', 2::numeric, 5::numeric, 19::numeric, 150::numeric,
                             'S40', '400x600', 'Aluminium', 'Freight to site')
  ) then
    raise exception 'Product settings were not copied';
  end if;

  if (select count(*) from public.costing_lines where item_id = copy_id) <> 2 then
    raise exception 'BOM lines were not copied';
  end if;

  -- Generated cost/sell values must match too.
  if (select jsonb_agg(to_jsonb(l) - array['id','item_id','created_at','updated_at'] order by section, subsection, sort)
      from public.costing_lines l where item_id = source_id)
     is distinct from
     (select jsonb_agg(to_jsonb(l) - array['id','item_id','created_at','updated_at'] order by section, subsection, sort)
      from public.costing_lines l where item_id = copy_id) then
    raise exception 'BOM values, sections, or ordering differ';
  end if;

  if exists (
    select 1 from public.costing_lines original
    join public.costing_lines copied on original.id = copied.id
    where original.item_id = source_id and copied.item_id = copy_id
  ) then
    raise exception 'BOM line IDs were reused';
  end if;

  update public.costing_items set name = 'Changed copy', image_path = 'products/test/replacement.png' where id = copy_id;
  update public.costing_lines set qty = 99 where item_id = copy_id and section = 'Materials';
  if (select name from public.costing_items where id = source_id) <> 'Road Sign'
    or (select image_path from public.costing_items where id = source_id) <> 'products/test/road-sign.png'
    or (select image_path from public.costing_items where id = job_item_id) <> 'products/test/road-sign.png'
    or (select qty from public.costing_lines where item_id = source_id and section = 'Materials') <> 2 then
    raise exception 'Editing the copy changed the source';
  end if;
end;
$test$;

rollback;
