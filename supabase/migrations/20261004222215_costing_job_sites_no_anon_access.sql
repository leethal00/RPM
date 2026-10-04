-- New public tables inherit default grants in Supabase. RLS already denies
-- anonymous rows; also prevent anonymous GraphQL schema discovery.
REVOKE ALL ON TABLE public.costing_job_sites FROM anon;
