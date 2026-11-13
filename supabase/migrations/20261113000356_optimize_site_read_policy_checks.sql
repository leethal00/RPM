-- Cache session-only policy helpers once per statement, rather than looking up
-- the same user repeatedly for every site, photo, asset, and related record.
-- Keep policy predicates, roles, permissiveness, and WITH CHECK unchanged.
DO $optimize$
DECLARE
    p record;
    optimized text;
BEGIN
    FOR p IN
        SELECT schemaname, tablename, policyname, qual
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename IN ('users', 'stores', 'clients', 'assets', 'jobs',
                            'site_photos', 'store_brands', 'client_brands')
          AND cmd IN ('SELECT', 'ALL') AND qual IS NOT NULL
    LOOP
        optimized := p.qual;
        optimized := replace(optimized, 'rpm_private."current_role"()', '(SELECT rpm_private."current_role"())');
        optimized := replace(optimized, 'get_my_role()', '(SELECT public.get_my_role())');
        optimized := replace(optimized, 'get_my_client_id()', '(SELECT public.get_my_client_id())');
        IF optimized <> p.qual THEN
            EXECUTE format('ALTER POLICY %I ON %I.%I USING (%s)',
                           p.policyname, p.schemaname, p.tablename, optimized);
        END IF;
    END LOOP;
END
$optimize$;
