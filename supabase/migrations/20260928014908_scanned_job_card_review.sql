-- Review and atomic posting for cards received by the existing mailbox importer.
alter table public.job_card_scans
  add column if not exists reviewed_data jsonb,
  add column if not exists confirmed_by uuid references public.users(id),
  add column if not exists confirmed_at timestamptz,
  add column if not exists deleted_by uuid references public.users(id),
  add column if not exists deleted_at timestamptz;

alter table public.costing_time_entries add column if not exists source_scan_id uuid references public.job_card_scans(id) on delete set null;
alter table public.costing_material_actuals add column if not exists source_scan_id uuid references public.job_card_scans(id) on delete set null;
create index if not exists costing_time_source_scan_idx on public.costing_time_entries(source_scan_id);
create index if not exists costing_material_source_scan_idx on public.costing_material_actuals(source_scan_id);

alter table public.job_card_scans drop constraint if exists job_card_scans_status_check;
alter table public.job_card_scans add constraint job_card_scans_status_check
  check (status in ('new','processing','ready','review_required','processed','failed','deleted'));

create schema if not exists rpm_private;

create or replace function rpm_private.job_card_reviewer()
returns uuid language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid();
begin
  if actor is null or not exists (
    select 1 from public.users where id = actor and role in ('super_admin','rodier_admin')
  ) then raise exception 'Only RPM administrators can review scanned job cards'; end if;
  return actor;
end $$;

create or replace function rpm_private.confirm_job_card(p_scan_id uuid, p_job_id uuid, p_review jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  actor uuid;
  card public.job_card_scans%rowtype;
  item jsonb;
  entry_date date;
  employee text;
  hours numeric;
  qty numeric;
  amount numeric;
begin
  actor := rpm_private.job_card_reviewer();
  select * into card from public.job_card_scans where id = p_scan_id for update;
  if not found then raise exception 'Scanned job card not found'; end if;
  if card.status in ('processed','deleted') or card.confirmed_at is not null then
    raise exception 'This job card has already been confirmed or deleted';
  end if;
  if card.storage_path is null then raise exception 'Attach the original scanned card before confirming'; end if;
  if not exists (select 1 from public.costing_jobs where id = p_job_id and not is_template) then
    raise exception 'Select a valid RPM job';
  end if;
  if jsonb_typeof(p_review) <> 'object' then raise exception 'Invalid review details'; end if;
  begin
    entry_date := (p_review->>'date')::date;
  exception when others then raise exception 'Enter a valid work date'; end;
  if entry_date is null then raise exception 'Enter a work date'; end if;
  employee := nullif(btrim(p_review->>'employee'), '');
  if jsonb_typeof(p_review->'labour') <> 'array' or jsonb_typeof(p_review->'materials') <> 'array' then
    raise exception 'Invalid labour or materials details';
  end if;

  for item in select value from jsonb_array_elements(p_review->'labour') loop
    if employee is null then raise exception 'Enter an employee for labour'; end if;
    begin hours := (item->>'hours')::numeric; exception when others then raise exception 'Invalid labour hours'; end;
    if hours is null or hours <= 0 or hours > 1000 then raise exception 'Labour hours must be greater than zero'; end if;
    insert into public.costing_time_entries(job_id,work_date,person_name,hours,description,labour_type,created_by,source_scan_id)
    values (p_job_id,entry_date,employee,hours,nullif(btrim(item->>'description'),''),
      coalesce(nullif(btrim(item->>'type'),''),'Workshop'),actor,p_scan_id);
  end loop;

  if nullif(p_review->>'travel_hours','') is not null then
    if employee is null then raise exception 'Enter an employee for travel'; end if;
    begin hours := (p_review->>'travel_hours')::numeric; exception when others then raise exception 'Invalid travel hours'; end;
    if hours < 0 or hours > 1000 then raise exception 'Travel hours cannot be negative'; end if;
    if hours > 0 then
      insert into public.costing_time_entries(job_id,work_date,person_name,hours,description,labour_type,created_by,source_scan_id)
      values (p_job_id,entry_date,employee,hours,nullif(btrim(p_review->>'travel_notes'),''),'Travel',actor,p_scan_id);
    end if;
  end if;

  for item in select value from jsonb_array_elements(p_review->'materials') loop
    if nullif(btrim(item->>'description'),'') is null then raise exception 'Enter a material description'; end if;
    begin qty := (item->>'qty')::numeric; exception when others then raise exception 'Invalid material quantity'; end;
    if qty is null or qty <= 0 then raise exception 'Material quantity must be greater than zero'; end if;
    begin amount := nullif(item->>'cost','')::numeric; exception when others then raise exception 'Invalid material cost'; end;
    if amount < 0 then raise exception 'Material cost cannot be negative'; end if;
    insert into public.costing_material_actuals(job_id,order_date,description,qty,cost,unit,created_by,source_scan_id)
    values (p_job_id,entry_date,btrim(item->>'description'),qty,amount,nullif(btrim(item->>'unit'),''),actor,p_scan_id);
  end loop;

  update public.job_card_scans set job_id=p_job_id,reviewed_data=p_review,
    status='processed',confirmed_by=actor,confirmed_at=now(),processed_at=now(),
    review_notes=nullif(btrim(p_review->>'notes'),'') where id=p_scan_id;
end $$;

create or replace function rpm_private.delete_job_card(p_scan_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare actor uuid; card public.job_card_scans%rowtype;
begin
  actor := rpm_private.job_card_reviewer();
  select * into card from public.job_card_scans where id=p_scan_id for update;
  if not found then raise exception 'Scanned job card not found'; end if;
  if card.status='processed' or card.confirmed_at is not null then
    raise exception 'Confirmed job cards cannot be deleted'; end if;
  update public.job_card_scans set status='deleted',deleted_by=actor,deleted_at=now() where id=p_scan_id;
end $$;

create or replace function rpm_private.attach_job_card(p_scan_id uuid, p_path text, p_name text, p_mime text)
returns void language plpgsql security definer set search_path = '' as $$
declare card public.job_card_scans%rowtype;
begin
  perform rpm_private.job_card_reviewer();
  select * into card from public.job_card_scans where id=p_scan_id for update;
  if not found or card.status in ('processed','deleted') then raise exception 'Card cannot be changed'; end if;
  if card.storage_path is not null then raise exception 'Original card is already attached'; end if;
  if p_path not like p_scan_id::text || '/%' or
     not exists (select 1 from storage.objects where bucket_id='job-card-scans' and name=p_path) then
    raise exception 'Uploaded card not found'; end if;
  if p_mime not in ('application/pdf','image/jpeg','image/png') then raise exception 'Unsupported file type'; end if;
  update public.job_card_scans set storage_path=p_path,attachment_name=p_name,mime_type=p_mime,
    status='review_required',review_notes=null where id=p_scan_id;
end $$;

create or replace function public.confirm_scanned_job_card(p_scan_id uuid, p_job_id uuid, p_review jsonb)
returns void language sql security invoker set search_path = '' as $$
  select rpm_private.confirm_job_card(p_scan_id,p_job_id,p_review)
$$;
create or replace function public.delete_scanned_job_card(p_scan_id uuid)
returns void language sql security invoker set search_path = '' as $$
  select rpm_private.delete_job_card(p_scan_id)
$$;
create or replace function public.attach_scanned_job_card(p_scan_id uuid, p_path text, p_name text, p_mime text)
returns void language sql security invoker set search_path = '' as $$
  select rpm_private.attach_job_card(p_scan_id,p_path,p_name,p_mime)
$$;

revoke all on function rpm_private.job_card_reviewer() from public, anon;
revoke all on function rpm_private.confirm_job_card(uuid,uuid,jsonb) from public, anon;
revoke all on function rpm_private.delete_job_card(uuid) from public, anon;
revoke all on function rpm_private.attach_job_card(uuid,text,text,text) from public, anon;
grant usage on schema rpm_private to authenticated;
grant execute on function rpm_private.job_card_reviewer() to authenticated;
grant execute on function rpm_private.confirm_job_card(uuid,uuid,jsonb) to authenticated;
grant execute on function rpm_private.delete_job_card(uuid) to authenticated;
grant execute on function rpm_private.attach_job_card(uuid,text,text,text) to authenticated;
revoke all on function public.confirm_scanned_job_card(uuid,uuid,jsonb) from public, anon;
revoke all on function public.delete_scanned_job_card(uuid) from public, anon;
revoke all on function public.attach_scanned_job_card(uuid,text,text,text) from public, anon;
grant execute on function public.confirm_scanned_job_card(uuid,uuid,jsonb) to authenticated;
grant execute on function public.delete_scanned_job_card(uuid) to authenticated;
grant execute on function public.attach_scanned_job_card(uuid,text,text,text) to authenticated;

-- All scan state changes go through the checked functions above. Service-role ingestion is unaffected.
revoke update, delete on public.job_card_scans from authenticated;

create policy "RPM admins can upload missing scanned cards" on storage.objects for insert to authenticated
with check (bucket_id='job-card-scans' and exists (
  select 1 from public.users where id=auth.uid() and role in ('super_admin','rodier_admin')
));
