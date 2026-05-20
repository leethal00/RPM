-- Storage bucket for customer-uploaded brand logos.
-- Existing built-in brands (St Pierre's) use static paths under /brands/<key>.png
-- in the Next.js public folder. New customers (McDonald's, etc.) will upload
-- via the Brand Manager UI into this bucket.

BEGIN;

INSERT INTO storage.buckets (id, name, public)
VALUES ('client-brand-logos', 'client-brand-logos', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Public read client-brand-logos"   ON storage.objects;
DROP POLICY IF EXISTS "Admin upload client-brand-logos"  ON storage.objects;
DROP POLICY IF EXISTS "Admin delete client-brand-logos"  ON storage.objects;

CREATE POLICY "Public read client-brand-logos"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'client-brand-logos');

CREATE POLICY "Admin upload client-brand-logos"
    ON storage.objects FOR INSERT
    WITH CHECK (
        bucket_id = 'client-brand-logos'
        AND public.get_my_role() IN ('super_admin', 'rodier_admin')
    );

CREATE POLICY "Admin delete client-brand-logos"
    ON storage.objects FOR DELETE
    USING (
        bucket_id = 'client-brand-logos'
        AND public.get_my_role() IN ('super_admin', 'rodier_admin')
    );

COMMIT;
