# Xero request usage

Accounting requests use `src/lib/xero-requests.ts`. Authentication/token requests
are separate and are not included in accounting usage. No tokens, headers, query
strings, invoice payloads or customer names are stored in request records.

The service-only tables are `xero_api_requests`, `xero_api_state` and
`xero_api_cache`. Browser roles have no table or RPC access. Request logs are
retained for 30 days; quote discovery snapshots expire after five minutes.

Use the Supabase SQL editor (or the connected admin tool) to inspect usage:

```sql
select activity, resource, method, count(*) as requests,
       count(*) filter (where status = 429) as throttled,
       min(day_remaining) as lowest_daily_remaining
from public.xero_api_requests
where created_at >= now() - interval '24 hours'
group by activity, resource, method
order by requests desc;

select tenant_id, day_remaining, minute_remaining, observed_at,
       limit_problem, blocked_until
from public.xero_api_state;
```

Background work stops when the observed daily remaining allowance is 100 or
less, or the minute remaining allowance is 10 or less. Manual actions can use
that reserve. All activities honor Xero's actual Retry-After cooldown. The
guard is shared between server instances; the allowance is taken from Xero's
response headers, without assuming a particular developer tier.

Invoice notifications are saved before acknowledgement. Repeated notifications
for the same tenant/invoice replace older pending versions. Paused work is
retried when the next invoice notification arrives; there is no scheduled poll.
Pending notifications are retained for 30 days. Manual Check Xero remains
available independently when allowance permits. A failed or incomplete lookup
stays pending, and an older worker cannot remove a newer notification.

Background discovery fetches paged quotes for only the notified customers,
then maps QuoteIDs to open RPM records. A cached miss is refreshed. Before
any automatic link, current customer quotes and invoice history are fetched
again to preserve ambiguity checks. Reads are shared within a notification
batch; existing unique invoice constraints and conditional writes are retained.

The job import dialog accepts up to 40 comma-separated invoice numbers. One
paged lookup returns full invoice lines for the batch. Each invoice is reviewed
separately, and site selections reset between jobs. Import always rereads the
invoice and validates identity, status, line items, duplicates and sites. A
single invoice needs two accounting requests across lookup and import; N
invoices in a batch normally need N+1. Cancelling or skipping does not create
unreviewed jobs.

Database checks: `scripts/test-xero-budget.sql` runs in a rollback transaction.
