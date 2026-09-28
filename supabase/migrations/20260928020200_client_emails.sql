-- Client correspondence follows the same costing record from quote to job.
create table public.costing_job_emails (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.costing_jobs(id) on delete cascade,
  sender text not null check (length(btrim(sender)) between 1 and 320),
  subject text not null check (length(btrim(subject)) between 1 and 500),
  received_on date not null,
  body text,
  file_name text check (file_name is null or length(btrim(file_name)) between 1 and 255),
  storage_path text unique,
  saved_by uuid not null references public.users(id),
  created_at timestamptz not null default now(),
  constraint costing_job_emails_content check (nullif(btrim(body), '') is not null or storage_path is not null),
  constraint costing_job_emails_file_pair check ((file_name is null) = (storage_path is null))
);
create index costing_job_emails_job_received on public.costing_job_emails(job_id, received_on desc, created_at desc);

alter table public.costing_job_emails enable row level security;
revoke all on public.costing_job_emails from anon, public;
grant select, insert, delete on public.costing_job_emails to authenticated;
create policy costing_job_emails_read on public.costing_job_emails for select to authenticated
  using (rpm_private.current_role() in ('super_admin', 'rodier_admin'));
create policy costing_job_emails_add on public.costing_job_emails for insert to authenticated
  with check (
    rpm_private.current_role() in ('super_admin', 'rodier_admin')
    and saved_by = auth.uid()
    and (storage_path is null or (
      split_part(storage_path, '/', 1) = job_id::text
      and exists (select 1 from storage.objects o where o.bucket_id = 'quote-job-emails' and o.name = storage_path)
    ))
  );
create policy costing_job_emails_delete on public.costing_job_emails for delete to authenticated
  using (rpm_private.current_role() in ('super_admin', 'rodier_admin'));

insert into storage.buckets(id, name, public, file_size_limit)
values ('quote-job-emails', 'quote-job-emails', false, 52428800)
on conflict (id) do update set public = false, file_size_limit = 52428800;
create policy quote_job_emails_read on storage.objects for select to authenticated
  using (bucket_id = 'quote-job-emails' and rpm_private.current_role() in ('super_admin', 'rodier_admin'));
create policy quote_job_emails_add on storage.objects for insert to authenticated
  with check (
    bucket_id = 'quote-job-emails'
    and rpm_private.current_role() in ('super_admin', 'rodier_admin')
    and exists (select 1 from public.costing_jobs j where j.id::text = (storage.foldername(name))[1])
  );
create policy quote_job_emails_delete on storage.objects for delete to authenticated
  using (bucket_id = 'quote-job-emails' and rpm_private.current_role() in ('super_admin', 'rodier_admin'));
