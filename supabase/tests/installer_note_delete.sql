-- Run against rpm-dev. Only a temporary fixture is deleted; all writes roll back.
begin;
do $$
declare
  fixture_id uuid;
  author_id uuid;
  actor_id uuid;
  actor_role text;
  affected integer;
begin
  select id into author_id from public.users where role::text = 'super_admin' limit 1;
  if author_id is null then raise exception 'Test requires a super admin'; end if;
  insert into public.installer_job_notes(job_id, user_id, body)
    values ((select id from public.costing_jobs limit 1), author_id, 'Temporary note deletion permission test')
    returning id into fixture_id;

  foreach actor_role in array array['rodier_admin', 'installer', 'super_admin'] loop
    select id into actor_id from public.users where role::text = actor_role limit 1;
    if actor_id is null then raise exception 'Test requires role %', actor_role; end if;
    perform set_config('request.jwt.claim.sub', actor_id::text, true);
    perform set_config('role', 'authenticated', true);
    delete from public.installer_job_notes where id = fixture_id;
    get diagnostics affected = row_count;
    perform set_config('role', 'none', true);
    if affected <> (case when actor_role = 'super_admin' then 1 else 0 end) then
      raise exception 'Unexpected delete count % for %', affected, actor_role;
    end if;
  end loop;
end $$;
rollback;
