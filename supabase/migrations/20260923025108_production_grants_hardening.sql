-- Supabase default privileges may grant anon access on newly created tables.
REVOKE ALL ON public.departments, public.department_jobs FROM anon;
