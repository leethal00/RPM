alter table public.costing_jobs
    add column if not exists quoted_by_name text,
    add column if not exists job_lead_name text;

update public.costing_jobs as job
set quoted_by_name = coalesce(nullif(trim(team_member.name), ''), split_part(team_member.email, '@', 1))
from public.users as team_member
where job.quoted_by = team_member.id
  and job.quoted_by_name is null;
