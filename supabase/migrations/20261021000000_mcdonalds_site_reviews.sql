-- A temporary staff-only checklist for auditing McDonalds site/customer links.
create table if not exists public.mcdonalds_site_reviews (
  site_id uuid primary key references public.stores(id) on delete cascade,
  review_status text not null default 'pending'
    check (review_status in ('pending', 'verified', 'xero_issue')),
  note text not null default '',
  updated_at timestamptz not null default now(),
  updated_by uuid
);

alter table public.mcdonalds_site_reviews enable row level security;
revoke all on public.mcdonalds_site_reviews from public, anon, authenticated;
grant select, insert, update, delete on public.mcdonalds_site_reviews to service_role;
