-- Belt-and-braces guard on users.developer_mode.
--
-- The UI hides the toggle from non-super_admins, but a hand-crafted POST
-- against the REST/GraphQL endpoint would otherwise let a regular user
-- update their own row (the users_update RLS policy allows `auth.uid() = id`)
-- including flipping developer_mode = true and granting themselves
-- AI Auto-Build access.
--
-- A BEFORE UPDATE trigger rejects any change to developer_mode unless the
-- caller is super_admin. Cheaper and clearer than a column-level grant
-- restriction.

CREATE OR REPLACE FUNCTION public.guard_users_developer_mode()
RETURNS TRIGGER LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
    IF NEW.developer_mode IS DISTINCT FROM OLD.developer_mode THEN
        IF (SELECT role::text FROM public.users WHERE id = auth.uid()) <> 'super_admin' THEN
            RAISE EXCEPTION 'developer_mode can only be modified by super_admin';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS users_guard_developer_mode ON public.users;
CREATE TRIGGER users_guard_developer_mode
    BEFORE UPDATE ON public.users
    FOR EACH ROW EXECUTE FUNCTION public.guard_users_developer_mode();
