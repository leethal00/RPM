-- Staff-only decisions for Xero customers where no physical RPM site exists.
create table if not exists public.mcdonalds_xero_site_skips (
  client_id uuid primary key references public.clients(id) on delete cascade,
  skipped_at timestamptz not null default now(),
  skipped_by uuid
);

alter table public.mcdonalds_xero_site_skips enable row level security;
revoke all on public.mcdonalds_xero_site_skips from public, anon, authenticated;
grant select, insert, update, delete on public.mcdonalds_xero_site_skips to service_role;

-- Create the site and assign its one Xero contact in the same transaction.
create or replace function public.create_mcdonalds_site_for_xero_customer(
  p_client_id uuid,
  p_site_name text,
  p_address text
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_customer_name text;
  v_contact_count integer;
  v_site_id uuid;
  v_updated integer;
begin
  perform pg_advisory_xact_lock(hashtext('mcdonalds_site_create'));
  if length(trim(coalesce(p_site_name, ''))) < 2 or length(trim(p_site_name)) > 200
     or length(trim(coalesce(p_address, ''))) < 5 or length(trim(p_address)) > 500 then
    raise exception 'Enter a site name and full address';
  end if;

  select name into v_customer_name
  from public.clients where id = p_client_id for update;
  if v_customer_name is null or v_customer_name !~* '^mc\s*donald' or
     regexp_replace(lower(v_customer_name), '[^a-z]', '', 'g') = 'mcdonalds' then
    raise exception 'Choose a McDonalds site-specific Xero customer';
  end if;
  if exists (select 1 from public.stores where client_id = p_client_id) then
    raise exception 'This customer already has an RPM site';
  end if;

  select count(*) into v_contact_count from public.xero_client_contacts
  where client_id = p_client_id;
  if v_contact_count <> 1 or exists (
    select 1 from public.xero_client_contacts
    where client_id = p_client_id and store_id is not null
  ) then
    raise exception 'Resolve this customer’s Xero contact links before creating a site';
  end if;

  if exists (
    select 1 from public.stores s join public.clients c on c.id = s.client_id
    where c.name ~* '^mc\s*donald' and (
      regexp_replace(lower(s.address), '[^a-z0-9]', '', 'g') =
        regexp_replace(lower(trim(p_address)), '[^a-z0-9]', '', 'g')
      or regexp_replace(lower(s.name), '[^a-z0-9]', '', 'g') =
        regexp_replace(lower(trim(p_site_name)), '[^a-z0-9]', '', 'g')
    )
  ) then
    raise exception 'A McDonalds site with this name or address already exists. Review the existing site first';
  end if;

  insert into public.stores (client_id, name, address)
  values (p_client_id, trim(p_site_name), trim(p_address))
  returning id into v_site_id;

  update public.xero_client_contacts
  set store_id = v_site_id, updated_at = now()
  where client_id = p_client_id and store_id is null;
  get diagnostics v_updated = row_count;
  if v_updated <> 1 then
    raise exception 'The Xero contact changed; reload and try again';
  end if;

  delete from public.mcdonalds_xero_site_skips where client_id = p_client_id;
  return v_site_id;
end;
$$;

revoke all on function public.create_mcdonalds_site_for_xero_customer(uuid,text,text) from public, anon, authenticated;
grant execute on function public.create_mcdonalds_site_for_xero_customer(uuid,text,text) to service_role;
