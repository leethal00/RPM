-- Record the invoice's status at import and retain its approved sales lines.
alter table public.costing_jobs
  add column if not exists xero_invoice_import_status text
  check (xero_invoice_import_status in ('DRAFT', 'AUTHORISED', 'PAID'));

alter table public.costing_items
  add column if not exists xero_imported_line boolean not null default false,
  add column if not exists xero_line_item_id text,
  add column if not exists xero_line_amount numeric(18, 4),
  add column if not exists xero_unit_amount numeric(18, 4);

create or replace function public.protect_approved_xero_import_line()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.xero_imported_line and exists (
    select 1 from public.costing_jobs j
    where j.id = old.job_id
      and j.xero_invoice_import_status in ('AUTHORISED', 'PAID')
  ) then
    if tg_op = 'DELETE' then
      raise exception 'Approved Xero invoice lines cannot be deleted from RPM';
    end if;
    if new.job_id is distinct from old.job_id
      or new.name is distinct from old.name
      or new.details is distinct from old.details
      or new.qty is distinct from old.qty
      or new.unit_price is distinct from old.unit_price
      or new.sort is distinct from old.sort
      or new.xero_imported_line is distinct from old.xero_imported_line
      or new.xero_line_item_id is distinct from old.xero_line_item_id
      or new.xero_line_amount is distinct from old.xero_line_amount
      or new.xero_unit_amount is distinct from old.xero_unit_amount then
      raise exception 'Approved Xero sales values are locked; edit the BOM instead';
    end if;
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_approved_xero_import_line on public.costing_items;
create trigger protect_approved_xero_import_line
  before update or delete on public.costing_items
  for each row execute function public.protect_approved_xero_import_line();

create or replace function public.prevent_new_approved_xero_sales_line()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.costing_jobs j
    where j.id = new.job_id
      and j.xero_invoice_import_status in ('AUTHORISED', 'PAID')
  ) then
    raise exception 'New sales lines cannot be added to an approved Xero invoice job';
  end if;
  return new;
end;
$$;

drop trigger if exists prevent_new_approved_xero_sales_line on public.costing_items;
create trigger prevent_new_approved_xero_sales_line
  before insert on public.costing_items
  for each row execute function public.prevent_new_approved_xero_sales_line();

create or replace function public.protect_approved_xero_import_status()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.xero_invoice_import_status in ('AUTHORISED', 'PAID') and (
    new.xero_invoice_import_status is distinct from old.xero_invoice_import_status
    or new.xero_invoice_id is distinct from old.xero_invoice_id
    or new.xero_invoice_number is distinct from old.xero_invoice_number
    or new.job_number is distinct from old.job_number
  ) then
    raise exception 'The approved Xero invoice identity cannot be changed';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_approved_xero_import_status on public.costing_jobs;
create trigger protect_approved_xero_import_status
  before update of xero_invoice_import_status, xero_invoice_id, xero_invoice_number, job_number on public.costing_jobs
  for each row execute function public.protect_approved_xero_import_status();
