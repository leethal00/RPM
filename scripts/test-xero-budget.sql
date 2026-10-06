begin;
do $$
declare n integer; t text := 'rpm-budget-regression';
begin
 if has_table_privilege('anon','public.xero_api_cache','select') or has_table_privilege('authenticated','public.xero_api_cache','select') then raise exception 'cache exposed'; end if;
 if has_function_privilege('authenticated','public.xero_request_gate(text,boolean)','execute') then raise exception 'gate exposed'; end if;
 perform public.xero_record_request(t,'import','/Invoices','GET',200,100,50,null,null,5);
 n := public.xero_request_gate(t,true);
 if n <> 60 then raise exception 'background reserve failed: %',n; end if;
 n := public.xero_request_gate(t,false);
 if n <> 0 then raise exception 'manual request denied: %',n; end if;
 perform public.xero_record_request(t,'background','/Quotes','GET',429,0,50,'day',120,10);
 n := public.xero_request_gate(t,false);
 if n not between 119 and 120 then raise exception 'shared cooldown failed: %',n; end if;
 perform public.xero_record_request(t,'import','/Invoices','GET',200,80,45,null,null,10);
 n := public.xero_request_gate(t,false);
 if n not between 119 and 120 then raise exception 'concurrent success cleared cooldown'; end if;
 update public.xero_api_state set blocked_until=now()-interval '1 minute', minute_remaining=0,observed_at=now()-interval '2 minutes',day_remaining=500 where tenant_id=t;
 n := public.xero_request_gate(t,true);
 if n <> 0 then raise exception 'expired minute window did not resume'; end if;
end $$;
rollback;
