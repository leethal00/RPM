-- A Xero billing contact can identify a physical RPM site independently of
-- the RPM customer that owns the site. Keep the existing contact/customer link.
alter table public.xero_client_contacts
  add column if not exists store_id uuid references public.stores(id) on delete set null;

create index if not exists xero_client_contacts_store_idx
  on public.xero_client_contacts(store_id) where store_id is not null;
