-- Received drawings belong to the costing record through its quote and job stages.
create table public.costing_job_drawings (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.costing_jobs(id) on delete cascade,
  file_name text not null check (length(btrim(file_name)) between 1 and 255),
  storage_path text not null unique,
  mime_type text,
  file_size bigint not null check (file_size > 0 and file_size <= 52428800),
  uploaded_by uuid not null references public.users(id),
  created_at timestamptz not null default now()
);
create index costing_job_drawings_job_date on public.costing_job_drawings(job_id, created_at desc);

alter table public.costing_job_drawings enable row level security;
revoke all on public.costing_job_drawings from anon, public;
grant select, insert, delete on public.costing_job_drawings to authenticated;
create policy costing_job_drawings_read on public.costing_job_drawings for select to authenticated
  using (rpm_private.current_role() in ('super_admin','rodier_admin'));
create policy costing_job_drawings_add on public.costing_job_drawings for insert to authenticated
  with check (
    rpm_private.current_role() in ('super_admin','rodier_admin')
    and uploaded_by = auth.uid()
    and split_part(storage_path, '/', 1) = job_id::text
    and exists (select 1 from storage.objects o where o.bucket_id = 'quote-job-drawings' and o.name = storage_path)
  );
create policy costing_job_drawings_delete on public.costing_job_drawings for delete to authenticated
  using (rpm_private.current_role() in ('super_admin','rodier_admin'));

insert into storage.buckets(id, name, public, file_size_limit)
values ('quote-job-drawings', 'quote-job-drawings', false, 52428800)
on conflict (id) do update set public = false, file_size_limit = 52428800;

create policy quote_job_drawings_read on storage.objects for select to authenticated
  using (bucket_id = 'quote-job-drawings' and rpm_private.current_role() in ('super_admin','rodier_admin'));
create policy quote_job_drawings_add on storage.objects for insert to authenticated
  with check (
    bucket_id = 'quote-job-drawings'
    and rpm_private.current_role() in ('super_admin','rodier_admin')
    and exists (
      select 1 from public.costing_jobs j
      where j.id::text = (storage.foldername(name))[1]
    )
  );
create policy quote_job_drawings_delete on storage.objects for delete to authenticated
  using (bucket_id = 'quote-job-drawings' and rpm_private.current_role() in ('super_admin','rodier_admin'));

-- The existing restrictive policies already exclude non-admin roles from this bucket.
