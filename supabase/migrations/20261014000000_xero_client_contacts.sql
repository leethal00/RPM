-- A customer can have more than one Xero contact (for example a trading name
-- and a legal name). Only server-side Xero routes may manage these links.
create table if not exists public.xero_client_contacts (
  xero_contact_id uuid primary key,
  client_id uuid not null references public.clients(id) on delete cascade,
  xero_name text not null,
  email text,
  preferred boolean not null default false,
  updated_at timestamptz not null default now()
);

create index if not exists xero_client_contacts_client_idx on public.xero_client_contacts(client_id);
create unique index if not exists xero_client_contacts_one_preferred_idx
  on public.xero_client_contacts(client_id) where preferred;
alter table public.xero_client_contacts enable row level security;
revoke all on public.xero_client_contacts from anon, authenticated;
grant all on public.xero_client_contacts to service_role;
