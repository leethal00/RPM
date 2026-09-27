-- Internal H&S register. Completed records and their evidence are append-only.
create table public.hs_templates (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('toolbox','swms')),
  title text not null check (length(trim(title)) > 0),
  body jsonb not null default '{}'::jsonb,
  version integer not null default 1 check (version > 0),
  active boolean not null default true,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.hs_records (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('toolbox','swms')),
  title text not null check (length(trim(title)) > 0),
  status text not null default 'draft' check (status in ('draft','completed')),
  job_id uuid references public.costing_jobs(id) on delete set null,
  job_reference text,
  site text,
  work_date date not null default current_date,
  template_id uuid references public.hs_templates(id) on delete set null,
  template_version integer,
  body jsonb not null default '{}'::jsonb,
  revision_of uuid references public.hs_records(id),
  revision integer not null default 1 check (revision > 0),
  created_by uuid references public.users(id) on delete set null,
  completed_by uuid references public.users(id) on delete set null,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint hs_completed_fields check ((status = 'draft' and completed_at is null) or (status = 'completed' and completed_at is not null))
);
create index hs_records_job_idx on public.hs_records(job_id, work_date desc);
create index hs_records_kind_date_idx on public.hs_records(kind, work_date desc);

create table public.hs_attendees (
  id uuid primary key default gen_random_uuid(),
  record_id uuid not null references public.hs_records(id),
  name text not null check (length(trim(name)) > 0),
  user_id uuid references public.users(id) on delete set null,
  signed_at timestamptz,
  signed_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique(record_id, name)
);

create table public.hs_attachments (
  id uuid primary key default gen_random_uuid(),
  record_id uuid not null references public.hs_records(id),
  file_name text not null,
  storage_path text not null unique,
  content_type text,
  uploaded_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.hs_training (
  id uuid primary key default gen_random_uuid(),
  staff_name text not null check (length(trim(staff_name)) > 0),
  user_id uuid references public.users(id) on delete set null,
  training text not null check (length(trim(training)) > 0),
  competency text check (competency in ('not_qualified','supervised','competent','trainer')),
  reference text,
  completed_on date,
  expires_on date,
  notes text,
  evidence_path text,
  updated_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index hs_training_staff_idx on public.hs_training(staff_name);
create index hs_training_expiry_idx on public.hs_training(expires_on);

create table public.hs_policies (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  version text not null,
  effective_on date,
  review_due_on date,
  file_name text not null,
  storage_path text not null unique,
  uploaded_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.hs_audit (
  id bigint generated always as identity primary key,
  entity text not null,
  entity_id uuid not null,
  action text not null,
  actor_id uuid,
  at timestamptz not null default now(),
  snapshot jsonb not null
);
create index hs_audit_entity_idx on public.hs_audit(entity, entity_id, at desc);

create function rpm_private.hs_guard_record() returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then raise exception 'H&S records cannot be deleted' using errcode = '42501'; end if;
  if tg_op = 'UPDATE' and old.status = 'completed' then
    raise exception 'Completed H&S records cannot be edited; create a revision' using errcode = '42501';
  end if;
  if tg_op = 'INSERT' and new.status <> 'draft' then
    raise exception 'Create a draft before completing a record' using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' and new.status = 'completed' then
    if new.kind = 'swms' and nullif(trim(coalesce(new.site,'')), '') is null then
      raise exception 'SWMS/TA needs a work site before completion' using errcode = '23514';
    end if;
    if nullif(trim(coalesce(new.body->>'scope','')), '') is null then
      raise exception 'Describe the work or meeting topic before completion' using errcode = '23514';
    end if;
    if new.kind = 'swms' and (nullif(trim(coalesce(new.body->>'hazards','')), '') is null
      or nullif(trim(coalesce(new.body->>'controls','')), '') is null) then
      raise exception 'SWMS/TA needs hazards and controls before completion' using errcode = '23514';
    end if;
    if new.kind = 'swms' and jsonb_array_length(coalesce(new.body->'steps', '[]'::jsonb)) = 0 then
      raise exception 'Add at least one safe work step before completion' using errcode = '23514';
    end if;
    if not exists (select 1 from public.hs_attendees where record_id = new.id) then
      raise exception 'Add at least one attendee before completion' using errcode = '23514';
    end if;
    new.completed_at := now(); new.completed_by := auth.uid();
  end if;
  if tg_op = 'UPDATE' then new.updated_at := now(); end if;
  return new;
end $$;
create trigger hs_record_guard before insert or update or delete on public.hs_records
  for each row execute function rpm_private.hs_guard_record();

create function rpm_private.hs_guard_attendee() returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' and (new.signed_at is not null or new.signed_by is not null) then
    raise exception 'Attendees must acknowledge for themselves' using errcode = '42501';
  end if;
  if tg_op = 'INSERT' and not exists
    (select 1 from public.hs_records r where r.id = new.record_id and r.status = 'draft') then
    raise exception 'Attendees can only be added to a draft' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' then
    if old.signed_at is not null or new.id is distinct from old.id or new.record_id is distinct from old.record_id
      or new.name is distinct from old.name or new.user_id is distinct from old.user_id
      or new.created_at is distinct from old.created_at then
      raise exception 'Only an unsigned acknowledgement can be signed' using errcode = '42501';
    end if;
    new.signed_at := now(); new.signed_by := auth.uid();
  end if;
  return new;
end $$;
create trigger hs_attendee_guard before insert or update on public.hs_attendees
  for each row execute function rpm_private.hs_guard_attendee();

create function rpm_private.hs_audit_change() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.hs_audit(entity, entity_id, action, actor_id, snapshot)
  values (tg_table_name, new.id, tg_op, auth.uid(), to_jsonb(new));
  return new;
end $$;
revoke all on function rpm_private.hs_audit_change() from public, anon, authenticated;
do $$ declare t text; begin
  foreach t in array array['hs_templates','hs_records','hs_attendees','hs_attachments','hs_training','hs_policies'] loop
    execute format('create trigger %I after insert or update on public.%I for each row execute function rpm_private.hs_audit_change()', t || '_audit', t);
  end loop;
end $$;

-- A policy version, attachment, signature, or audit event is never removed.
create function rpm_private.hs_no_delete() returns trigger language plpgsql set search_path = '' as $$
begin raise exception 'H&S history cannot be deleted' using errcode = '42501'; end $$;
do $$ declare t text; begin
  foreach t in array array['hs_attendees','hs_attachments','hs_policies','hs_audit'] loop
    execute format('create trigger %I before delete on public.%I for each row execute function rpm_private.hs_no_delete()', t || '_no_delete', t);
  end loop;
end $$;

do $$ declare t text; begin
  foreach t in array array['hs_templates','hs_records','hs_attendees','hs_attachments','hs_training','hs_policies','hs_audit'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('grant select, insert, update on public.%I to authenticated', t);
  end loop;
end $$;
revoke insert, update on public.hs_audit from authenticated;
grant usage, select on sequence public.hs_audit_id_seq to authenticated;

create policy hs_templates_read on public.hs_templates for select to authenticated
  using (rpm_private.current_role() in ('super_admin','rodier_admin','technician'));
create policy hs_templates_write on public.hs_templates for all to authenticated
  using (rpm_private.current_role() in ('super_admin','rodier_admin'))
  with check (rpm_private.current_role() in ('super_admin','rodier_admin'));
create policy hs_records_read on public.hs_records for select to authenticated
  using (rpm_private.current_role() in ('super_admin','rodier_admin','technician'));
create policy hs_records_write on public.hs_records for all to authenticated
  using (rpm_private.current_role() in ('super_admin','rodier_admin'))
  with check (rpm_private.current_role() in ('super_admin','rodier_admin'));
create policy hs_attendees_read on public.hs_attendees for select to authenticated
  using (rpm_private.current_role() in ('super_admin','rodier_admin','technician'));
create policy hs_attendees_write on public.hs_attendees for insert to authenticated
  with check (rpm_private.current_role() in ('super_admin','rodier_admin'));
create policy hs_attendees_sign on public.hs_attendees for update to authenticated
  using (user_id = auth.uid() and signed_at is null and exists
    (select 1 from public.hs_records r where r.id = record_id and r.status = 'completed'))
  with check (user_id = auth.uid() and signed_by = auth.uid() and signed_at is not null and exists
    (select 1 from public.hs_records r where r.id = record_id and r.status = 'completed'));
create policy hs_attachments_read on public.hs_attachments for select to authenticated
  using (rpm_private.current_role() in ('super_admin','rodier_admin','technician'));
create policy hs_attachments_write on public.hs_attachments for insert to authenticated
  with check (rpm_private.current_role() in ('super_admin','rodier_admin'));
create policy hs_training_read on public.hs_training for select to authenticated
  using (rpm_private.current_role() in ('super_admin','rodier_admin','technician'));
create policy hs_training_write on public.hs_training for all to authenticated
  using (rpm_private.current_role() in ('super_admin','rodier_admin'))
  with check (rpm_private.current_role() in ('super_admin','rodier_admin'));
create policy hs_policies_read on public.hs_policies for select to authenticated
  using (rpm_private.current_role() in ('super_admin','rodier_admin','technician'));
create policy hs_policies_write on public.hs_policies for insert to authenticated
  with check (rpm_private.current_role() in ('super_admin','rodier_admin'));
create policy hs_audit_read on public.hs_audit for select to authenticated
  using (rpm_private.current_role() in ('super_admin','rodier_admin'));

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('health-safety', 'health-safety', false, 20971520,
  array['application/pdf','image/jpeg','image/png','image/webp','application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
on conflict (id) do nothing;
create policy hs_files_read on storage.objects for select to authenticated
  using (bucket_id = 'health-safety' and rpm_private.current_role() in ('super_admin','rodier_admin','technician'));
create policy hs_files_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'health-safety' and rpm_private.current_role() in ('super_admin','rodier_admin'));
create policy hs_files_boundary on storage.objects as restrictive for all to authenticated
  using (bucket_id <> 'health-safety' or rpm_private.current_role() in ('super_admin','rodier_admin','technician'))
  with check (bucket_id <> 'health-safety' or rpm_private.current_role() in ('super_admin','rodier_admin'));
create policy hs_files_no_change on storage.objects as restrictive for update to authenticated
  using (bucket_id <> 'health-safety') with check (bucket_id <> 'health-safety');
create policy hs_files_no_delete on storage.objects as restrictive for delete to authenticated
  using (bucket_id <> 'health-safety');

insert into public.hs_templates(kind, title, body) values
  ('toolbox', 'Weekly team toolbox meeting', '{"scope":"","run_by":"","previous_actions":"","safety_topics":"","operations":"","actions":"","notes":""}'::jsonb),
  ('swms', 'Site-specific SWMS / Task Analysis', '{"scope":"","principal":"","client":"","responsible":"","duration":"","notification":"","permits":"","ppe":"","plant":"","signage":"","approvals":"","checks":"","qualifications":"","hazards":"","controls":"","emergency":"","actions":"","notes":"","steps":[]}'::jsonb);
