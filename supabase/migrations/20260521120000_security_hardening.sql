-- Closes the Supabase Security Advisor warnings about SECURITY DEFINER
-- helpers being callable by anon, and trigger functions having a mutable
-- search_path (theoretical SQL-injection vector).
--
-- Idempotent — safe to re-run on either cloud-dev or prod. Each
-- function is guarded so missing functions (e.g. handle_new_user on dev)
-- are skipped without error.

BEGIN;

-- 1. Pin search_path on the trigger functions advisor flagged.
--    Without this, a malicious schema in search_path could shadow built-in
--    names. With pg_temp last, temp objects can't shadow either.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname='set_updated_at' AND pronamespace='public'::regnamespace) THEN
        ALTER FUNCTION public.set_updated_at() SET search_path = public, pg_temp;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname='handle_new_user' AND pronamespace='public'::regnamespace) THEN
        ALTER FUNCTION public.handle_new_user() SET search_path = public, pg_temp;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname='update_projects_update' AND pronamespace='public'::regnamespace) THEN
        ALTER FUNCTION public.update_projects_update() SET search_path = public, pg_temp;
    END IF;
END$$;

-- 2. Convert get_my_role / get_my_client_id from SECURITY DEFINER to
--    SECURITY INVOKER. They just do `SELECT col FROM users WHERE id = auth.uid()`.
--    Under SECURITY INVOKER:
--      • authenticated callers — RLS on users lets them read their own row, returns role/client_id.
--      • anon callers — RLS on users blocks them, function returns NULL. No info leak.
--    This kills both the "Public Can Execute SECURITY DEFINER" warning AND
--    keeps anon-evaluated RLS policies (e.g. on stores) from erroring on the
--    helper call.
ALTER FUNCTION public.get_my_role()      SECURITY INVOKER;
ALTER FUNCTION public.get_my_client_id() SECURITY INVOKER;

-- Restore EXECUTE that an earlier hardening pass revoked. Safe now that
-- the functions can't leak through SECURITY DEFINER privileges.
GRANT EXECUTE ON FUNCTION public.get_my_role()      TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_my_client_id() TO anon, authenticated, service_role;

COMMIT;
