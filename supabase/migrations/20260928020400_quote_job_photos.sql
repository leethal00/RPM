-- Photos received for a quote remain on the same costing record after it becomes a job.
create table public.costing_job_photos (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.costing_jobs(id) on delete cascade,
  file_name text not null check (length(btrim(file_name)) between 1 and 255),
  storage_path text not null unique,
  mime_type text,
  file_size bigint not null check (file_size > 0 and file_size <= 52428800),
  uploaded_by uuid not null references public.users(id),
  created_at timestamptz not null default now()
);
create index costing_job_photos_job_date on public.costing_job_photos(job_id, created_at desc);

alter table public.costing_job_photos enable row level security;
revoke all on public.costing_job_photos from anon, public;
grant select, insert, delete on public.costing_job_photos to authenticated;
create policy costing_job_photos_read on public.costing_job_photos for select to authenticated
  using (rpm_private.current_role() in ('super_admin', 'rodier_admin'));
create policy costing_job_photos_add on public.costing_job_photos for insert to authenticated
  with check (
    rpm_private.current_role() in ('super_admin', 'rodier_admin')
    and uploaded_by = auth.uid()
    and split_part(storage_path, '/', 1) = job_id::text
    and exists (select 1 from storage.objects o where o.bucket_id = 'quote-job-photos' and o.name = storage_path)
  );
create policy costing_job_photos_delete on public.costing_job_photos for delete to authenticated
  using (rpm_private.current_role() in ('super_admin', 'rodier_admin'));

insert into storage.buckets(id, name, public, file_size_limit)
values ('quote-job-photos', 'quote-job-photos', false, 52428800)
on conflict (id) do update set public = false, file_size_limit = 52428800;
create policy quote_job_photos_read on storage.objects for select to authenticated
  using (bucket_id = 'quote-job-photos' and rpm_private.current_role() in ('super_admin', 'rodier_admin'));
create policy quote_job_photos_add on storage.objects for insert to authenticated
  with check (
    bucket_id = 'quote-job-photos'
    and rpm_private.current_role() in ('super_admin', 'rodier_admin')
    and exists (select 1 from public.costing_jobs j where j.id::text = (storage.foldername(name))[1])
  );
create policy quote_job_photos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'quote-job-photos' and rpm_private.current_role() in ('super_admin', 'rodier_admin'));
