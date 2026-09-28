-- Incident, near-miss and hazard reports are private to the reporter and H&S admins.
create table public.hs_incidents (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in ('incident','near_miss','hazard')),
  status text not null default 'reported' check (status in ('reported','in_review','closed')),
  occurred_at timestamptz not null,
  site text not null check (length(trim(site)) > 0),
  job_id uuid references public.costing_jobs(id) on delete set null,
  job_reference text,
  summary text not null check (length(trim(summary)) > 0),
  description text not null check (length(trim(description)) > 0),
  immediate_action text,
  people_affected text,
  injury_or_damage text,
  notified text,
  corrective_action text,
  action_owner text,
  action_due date,
  outcome text,
  reported_by uuid not null default auth.uid() references public.users(id),
  reported_at timestamptz not null default now(),
  reviewed_by uuid references public.users(id),
  closed_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint hs_incident_closed_fields check ((status = 'closed') = (closed_at is not null))
);
create index hs_incidents_job_idx on public.hs_incidents(job_id, occurred_at desc);
create index hs_incidents_status_idx on public.hs_incidents(status, occurred_at desc);
create index hs_incidents_reporter_idx on public.hs_incidents(reported_by, occurred_at desc);

create table public.hs_incident_attachments (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references public.hs_incidents(id),
  file_name text not null,
  storage_path text not null unique,
  content_type text,
  uploaded_by uuid not null default auth.uid() references public.users(id),
  created_at timestamptz not null default now()
);

create function rpm_private.hs_guard_incident() returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then raise exception 'Incident reports cannot be deleted' using errcode = '42501'; end if;
  if tg_op = 'INSERT' then
    if new.status <> 'reported' or new.reported_by is distinct from auth.uid()
      or new.corrective_action is not null or new.action_owner is not null or new.action_due is not null
      or new.outcome is not null or new.reviewed_by is not null or new.closed_at is not null then
      raise exception 'Submit an incident as a new report' using errcode = '42501';
    end if;
    new.reported_at := now();
  else
    if old.status = 'closed' then raise exception 'Closed incident reports cannot be edited' using errcode = '42501'; end if;
    if new.id is distinct from old.id or new.reported_by is distinct from old.reported_by
      or new.reported_at is distinct from old.reported_at or new.category is distinct from old.category
      or new.occurred_at is distinct from old.occurred_at or new.site is distinct from old.site
      or new.job_id is distinct from old.job_id or new.job_reference is distinct from old.job_reference
      or new.summary is distinct from old.summary or new.description is distinct from old.description
      or new.immediate_action is distinct from old.immediate_action
      or new.people_affected is distinct from old.people_affected
      or new.injury_or_damage is distinct from old.injury_or_damage or new.notified is distinct from old.notified then
      raise exception 'Original report is locked; add follow-up details only' using errcode = '42501';
    end if;
    if new.status = 'closed' then
      if nullif(trim(coalesce(new.outcome, '')), '') is null then
        raise exception 'Record an outcome before closing' using errcode = '23514';
      end if;
      new.closed_at := now();
    else
      new.closed_at := null;
    end if;
    new.reviewed_by := auth.uid();
    new.updated_at := now();
  end if;
  return new;
end $$;
create trigger hs_incident_guard before insert or update or delete on public.hs_incidents
  for each row execute function rpm_private.hs_guard_incident();

create function rpm_private.hs_guard_incident_attachment() returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then raise exception 'Incident evidence cannot be deleted' using errcode = '42501'; end if;
  if tg_op = 'UPDATE' then raise exception 'Incident evidence cannot be changed' using errcode = '42501'; end if;
  if new.uploaded_by is distinct from auth.uid()
    or new.storage_path not like ('incidents/' || new.incident_id::text || '/%')
    or not exists (select 1 from public.hs_incidents i where i.id = new.incident_id and i.status <> 'closed') then
    raise exception 'Invalid incident evidence' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger hs_incident_attachment_guard before insert or update or delete on public.hs_incident_attachments
  for each row execute function rpm_private.hs_guard_incident_attachment();

create trigger hs_incidents_audit after insert or update on public.hs_incidents
  for each row execute function rpm_private.hs_audit_change();
create trigger hs_incident_attachments_audit after insert on public.hs_incident_attachments
  for each row execute function rpm_private.hs_audit_change();

alter table public.hs_incidents enable row level security;
alter table public.hs_incident_attachments enable row level security;
revoke all on public.hs_incidents, public.hs_incident_attachments from anon, public;
grant select, insert, update on public.hs_incidents to authenticated;
grant select, insert on public.hs_incident_attachments to authenticated;

create policy hs_incidents_read on public.hs_incidents for select to authenticated
  using (rpm_private.current_role() in ('super_admin','rodier_admin')
    or (reported_by = auth.uid() and rpm_private.current_role() in ('technician','installer','mobile_admin','department_operator')));
create policy hs_incidents_report on public.hs_incidents for insert to authenticated
  with check (reported_by = auth.uid() and rpm_private.current_role() in
    ('super_admin','rodier_admin','technician','installer','mobile_admin','department_operator'));
create policy hs_incidents_manage on public.hs_incidents for update to authenticated
  using (rpm_private.current_role() in ('super_admin','rodier_admin'))
  with check (rpm_private.current_role() in ('super_admin','rodier_admin'));
create policy hs_incident_attachments_read on public.hs_incident_attachments for select to authenticated
  using (exists (select 1 from public.hs_incidents i where i.id = incident_id));
create policy hs_incident_attachments_add on public.hs_incident_attachments for insert to authenticated
  with check (uploaded_by = auth.uid() and exists
    (select 1 from public.hs_incidents i where i.id = incident_id and i.status <> 'closed'));

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('hs-incidents', 'hs-incidents', false, 20971520,
  array['application/pdf','image/jpeg','image/png','image/webp','application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
on conflict (id) do nothing;
create policy hs_incident_files_read on storage.objects for select to authenticated
  using (bucket_id = 'hs-incidents' and exists
    (select 1 from public.hs_incidents i where i.id::text = (storage.foldername(name))[2]));
create policy hs_incident_files_add on storage.objects for insert to authenticated
  with check (bucket_id = 'hs-incidents' and (storage.foldername(name))[1] = 'incidents'
    and exists (select 1 from public.hs_incidents i
      where i.id::text = (storage.foldername(name))[2] and i.status <> 'closed'));
create policy hs_incident_files_boundary on storage.objects as restrictive for all to authenticated
  using (bucket_id <> 'hs-incidents' or exists
    (select 1 from public.hs_incidents i where i.id::text = (storage.foldername(name))[2]))
  with check (bucket_id <> 'hs-incidents' or exists
    (select 1 from public.hs_incidents i
      where i.id::text = (storage.foldername(name))[2] and i.status <> 'closed'));
create policy hs_incident_files_no_change on storage.objects as restrictive for update to authenticated
  using (bucket_id <> 'hs-incidents') with check (bucket_id <> 'hs-incidents');
create policy hs_incident_files_no_delete on storage.objects as restrictive for delete to authenticated
  using (bucket_id <> 'hs-incidents');

-- Existing H&S and mobile storage boundaries must allow incident uploads, while
-- the incident-specific policies above still control which report is accessible.
drop policy hs_files_boundary on storage.objects;
create policy hs_files_boundary on storage.objects as restrictive for all to authenticated
  using (bucket_id not in ('health-safety','hs-incidents')
    or bucket_id = 'hs-incidents'
    or rpm_private.current_role() in ('super_admin','rodier_admin','technician','installer','mobile_admin','department_operator'))
  with check (bucket_id not in ('health-safety','hs-incidents')
    or bucket_id = 'hs-incidents'
    or rpm_private.current_role() in ('super_admin','rodier_admin'));
drop policy installer_storage_boundary on storage.objects;
create policy installer_storage_boundary on storage.objects as restrictive for all to authenticated
  using (coalesce(rpm_private.current_role(),'') not in ('installer','mobile_admin')
    or bucket_id in ('health-safety','hs-incidents')
    or (bucket_id = 'installer-photos' and
      (rpm_private.current_role() = 'mobile_admin' or (storage.foldername(name))[2] = auth.uid()::text)
      and rpm_private.installer_can_access_job((storage.foldername(name))[1]))
    or (bucket_id = 'construction-drawings' and rpm_private.installer_can_access_site((storage.foldername(name))[1])))
  with check (coalesce(rpm_private.current_role(),'') not in ('installer','mobile_admin')
    or bucket_id = 'hs-incidents'
    or (bucket_id = 'installer-photos' and (storage.foldername(name))[2] = auth.uid()::text
      and rpm_private.installer_can_access_job((storage.foldername(name))[1])));
drop policy department_operator_storage_boundary on storage.objects;
create policy department_operator_storage_boundary on storage.objects as restrictive for all to authenticated
  using (coalesce(rpm_private.current_role(),'') <> 'department_operator' or bucket_id in ('health-safety','hs-incidents'))
  with check (coalesce(rpm_private.current_role(),'') <> 'department_operator' or bucket_id = 'hs-incidents');

