-- Xero may contain several generic-looking McDonalds contacts. The original
-- RPM group customer is the one that owns the physical sites still to review.
create or replace function public.assign_mcdonalds_site_customer(
  p_site_id uuid,
  p_client_id uuid
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_generic_id uuid;
  v_generic_count integer;
  v_current_client_id uuid;
  v_customer_name text;
  v_contact_count integer;
  v_updated integer;
begin
  select count(distinct s.client_id), min(s.client_id::text)::uuid
    into v_generic_count, v_generic_id
  from public.stores s
  join public.clients c on c.id = s.client_id
  where regexp_replace(lower(c.name), '[^a-z]', '', 'g') = 'mcdonalds';
  if v_generic_count <> 1 then
    raise exception 'The RPM McDonalds group customer could not be identified uniquely';
  end if;

  select client_id into v_current_client_id
  from public.stores where id = p_site_id for update;
  if v_current_client_id is distinct from v_generic_id then
    raise exception 'This site is no longer waiting for a McDonalds customer match';
  end if;

  select name into v_customer_name
  from public.clients where id = p_client_id for update;
  if v_customer_name is null or v_customer_name !~* '^mc\s*donald' or p_client_id = v_generic_id then
    raise exception 'Choose a McDonalds site customer';
  end if;
  if exists (select 1 from public.stores where client_id = p_client_id) then
    raise exception 'This customer already owns a physical site';
  end if;

  select count(*) into v_contact_count
  from public.xero_client_contacts
  where client_id = p_client_id and store_id is null;
  if v_contact_count <> 1 or exists (
    select 1 from public.xero_client_contacts
    where client_id = p_client_id and store_id is not null
  ) then
    raise exception 'This customer needs exactly one unassigned Xero contact';
  end if;

  update public.xero_client_contacts
  set store_id = p_site_id, updated_at = now()
  where client_id = p_client_id and store_id is null;
  get diagnostics v_updated = row_count;
  if v_updated <> 1 then raise exception 'The Xero contact changed; reload and try again'; end if;

  update public.stores set client_id = p_client_id, updated_at = now()
  where id = p_site_id and client_id = v_generic_id;
  get diagnostics v_updated = row_count;
  if v_updated <> 1 then raise exception 'The site changed; reload and try again'; end if;

  return p_site_id;
end;
$$;

revoke all on function public.assign_mcdonalds_site_customer(uuid, uuid) from public, anon, authenticated;
grant execute on function public.assign_mcdonalds_site_customer(uuid, uuid) to service_role;
