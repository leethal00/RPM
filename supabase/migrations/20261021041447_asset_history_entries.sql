-- Manual asset history is separate from jobs and does not change asset service dates.
create table public.asset_history_entries (
    id uuid primary key default gen_random_uuid(),
    asset_id uuid not null references public.assets(id) on delete cascade,
    occurred_on date not null check (isfinite(occurred_on)),
    title text not null check (char_length(btrim(title)) between 1 and 200),
    notes text not null default '' check (char_length(notes) <= 10000),
    created_by uuid default auth.uid() references auth.users(id) on delete set null,
    created_at timestamptz not null default now()
);
create index asset_history_entries_asset_date_idx
    on public.asset_history_entries (asset_id, occurred_on desc, created_at desc);
alter table public.asset_history_entries enable row level security;
revoke all on public.asset_history_entries from anon, authenticated;
grant select, insert on public.asset_history_entries to authenticated;
grant all on public.asset_history_entries to service_role;

-- The assets subquery runs under the caller's existing asset RLS policies,
-- including assigned-site access and restricted-role boundaries.
create policy asset_history_read on public.asset_history_entries
    for select to authenticated
    using (exists (select 1 from public.assets a where a.id = asset_id));
create policy asset_history_insert on public.asset_history_entries
    for insert to authenticated
    with check (
        (select auth.uid()) is not null
        and created_by = (select auth.uid())
        and (select public.get_my_role()) in ('super_admin', 'rodier_admin')
        and exists (select 1 from public.assets a where a.id = asset_id)
    );
comment on table public.asset_history_entries is
    'Dated manual service-history notes, with recording user and timestamp. Not jobs or scheduling instructions.';
