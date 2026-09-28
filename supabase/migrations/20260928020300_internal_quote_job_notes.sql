-- Internal staff notes are deliberately separate from quote text and job-pack data.
create table public.costing_job_internal_notes (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.costing_jobs(id) on delete cascade,
  body text not null check (length(btrim(body)) between 1 and 10000),
  created_by uuid not null references public.users(id),
  created_at timestamptz not null default now()
);
create index costing_job_internal_notes_job_date on public.costing_job_internal_notes(job_id, created_at desc);

alter table public.costing_job_internal_notes enable row level security;
revoke all on public.costing_job_internal_notes from anon, public;
grant select, insert, delete on public.costing_job_internal_notes to authenticated;
create policy costing_job_internal_notes_read on public.costing_job_internal_notes for select to authenticated
  using (rpm_private.current_role() in ('super_admin', 'rodier_admin'));
create policy costing_job_internal_notes_add on public.costing_job_internal_notes for insert to authenticated
  with check (rpm_private.current_role() in ('super_admin', 'rodier_admin') and created_by = auth.uid());
create policy costing_job_internal_notes_delete on public.costing_job_internal_notes for delete to authenticated
  using (rpm_private.current_role() in ('super_admin', 'rodier_admin'));
