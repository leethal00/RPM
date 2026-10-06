create table public.xero_api_state (
 tenant_id text primary key, blocked_until timestamptz, day_remaining integer, minute_remaining integer,
 observed_at timestamptz, limit_problem text
);
create table public.xero_api_cache (
 tenant_id text not null, cache_key text not null, payload jsonb not null, expires_at timestamptz not null,
 primary key (tenant_id, cache_key)
);
create table public.xero_api_requests (
 id bigint generated always as identity primary key, created_at timestamptz not null default now(),
 tenant_id text not null, activity text not null, resource text not null, method text not null,
 status integer not null, day_remaining integer, minute_remaining integer, limit_problem text,
 retry_after integer, duration_ms integer not null
);
create index xero_api_requests_time_idx on public.xero_api_requests(created_at);
alter table public.xero_api_state enable row level security;
alter table public.xero_api_cache enable row level security;
alter table public.xero_api_requests enable row level security;
revoke all on public.xero_api_state, public.xero_api_cache, public.xero_api_requests from public, anon, authenticated;
grant all on public.xero_api_state, public.xero_api_cache, public.xero_api_requests to service_role;
grant usage, select on sequence public.xero_api_requests_id_seq to service_role;

create function public.xero_request_gate(p_tenant text, p_background boolean default false)
returns integer language plpgsql security invoker set search_path = '' as $$
declare s public.xero_api_state; wait_seconds integer;
begin
 insert into public.xero_api_state(tenant_id) values(p_tenant) on conflict do nothing;
 select * into s from public.xero_api_state where tenant_id=p_tenant for update;
 if s.blocked_until > now() then return greatest(1,ceil(extract(epoch from s.blocked_until-now()))::integer); end if;
 if s.minute_remaining <= 0 and s.observed_at > now()-interval '1 minute' then
   return greatest(1,ceil(extract(epoch from s.observed_at+interval '1 minute'-now()))::integer);
 end if;
 if p_background and ((s.day_remaining <= 100 and s.observed_at > now()-interval '24 hours')
   or (s.minute_remaining <= 10 and s.observed_at > now()-interval '1 minute')) then return 60; end if;
 update public.xero_api_state set day_remaining=greatest(0,day_remaining-1),
   minute_remaining=greatest(0,minute_remaining-1) where tenant_id=p_tenant;
 return 0;
end $$;
revoke all on function public.xero_request_gate(text,boolean) from public,anon,authenticated;
grant execute on function public.xero_request_gate(text,boolean) to service_role;

create function public.xero_record_request(p_tenant text,p_activity text,p_resource text,p_method text,
 p_status integer,p_day integer,p_minute integer,p_problem text,p_retry integer,p_duration integer)
returns void language plpgsql security invoker set search_path = '' as $$
begin
 insert into public.xero_api_requests(tenant_id,activity,resource,method,status,day_remaining,minute_remaining,limit_problem,retry_after,duration_ms)
 values(p_tenant,p_activity,p_resource,p_method,p_status,p_day,p_minute,p_problem,p_retry,p_duration);
 insert into public.xero_api_state(tenant_id,day_remaining,minute_remaining,observed_at,limit_problem,blocked_until)
 values(p_tenant,p_day,p_minute,now(),p_problem,case when p_status=429 then now()+make_interval(secs=>p_retry) else null end)
 on conflict(tenant_id) do update set day_remaining=coalesce(excluded.day_remaining,xero_api_state.day_remaining),
 minute_remaining=coalesce(excluded.minute_remaining,xero_api_state.minute_remaining),
 observed_at=case when p_day is not null or p_minute is not null then now() else xero_api_state.observed_at end,
 limit_problem=coalesce(excluded.limit_problem,xero_api_state.limit_problem),
 blocked_until=greatest(xero_api_state.blocked_until,excluded.blocked_until);
 delete from public.xero_api_requests where created_at < now()-interval '30 days';
 delete from public.xero_api_cache where expires_at < now()-interval '1 day';
end $$;
revoke all on function public.xero_record_request(text,text,text,text,integer,integer,integer,text,integer,integer) from public,anon,authenticated;
grant execute on function public.xero_record_request(text,text,text,text,integer,integer,integer,text,integer,integer) to service_role;
