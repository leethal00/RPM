-- Department operators cannot read costing_items directly. Return only notes
-- for a job assigned to their department through the production boundary.
create or replace function rpm_private.production_bom_notes(p_job_id uuid, p_department_id uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor public.users; dept uuid; result jsonb;
begin
  select * into actor from public.users where id = auth.uid();
  if auth.uid() is null or coalesce(actor.role::text, '') not in ('department_operator', 'super_admin', 'rodier_admin') then
    raise exception 'Production access denied' using errcode = '42501';
  end if;

  dept := case when actor.role::text = 'department_operator' then actor.department_id else p_department_id end;
  if dept is null and actor.role::text <> 'department_operator' then
    select id into dept from public.departments where code = 'cnc';
  end if;
  if not exists (
    select 1 from public.department_jobs d
    join public.costing_jobs j on j.id = d.job_id
    where d.job_id = p_job_id and d.department_id = dept
      and j.status::text in ('approved', 'in_progress', 'complete', 'invoiced') and not j.is_template
  ) then
    raise exception 'Job access denied' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('item_id', i.id, 'name', i.name, 'notes', i.internal_notes) order by i.sort), '[]'::jsonb)
  into result from public.costing_items i
  where i.job_id = p_job_id and i.mode = 'build' and nullif(btrim(i.internal_notes), '') is not null;
  return result;
end $$;

revoke all on function rpm_private.production_bom_notes(uuid, uuid) from public, anon;
grant execute on function rpm_private.production_bom_notes(uuid, uuid) to authenticated;

create or replace function public.production_bom_notes(p_job_id uuid, p_department_id uuid default null)
returns jsonb language sql security invoker set search_path = '' as $$
  select rpm_private.production_bom_notes(p_job_id, p_department_id)
$$;
revoke all on function public.production_bom_notes(uuid, uuid) from public, anon;
grant execute on function public.production_bom_notes(uuid, uuid) to authenticated;
