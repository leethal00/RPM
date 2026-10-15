-- Existing items keep their pricing. New items use $5 rounding for the
-- calculated final sell unless a manual unit price is saved.
alter table public.costing_items
  add column round_final_sell_to_five boolean not null default false;

alter table public.costing_items
  alter column round_final_sell_to_five set default true;
