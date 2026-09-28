-- Explicitly remove inherited anonymous table grants in existing deployments.
revoke all on public.costing_job_drawings from anon, public;
