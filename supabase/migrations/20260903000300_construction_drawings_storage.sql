-- Construction Drawings Storage
-- Private storage for final construction drawing PDFs.

INSERT INTO storage.buckets (
    id,
    name,
    public
)
VALUES (
    'construction-drawings',
    'construction-drawings',
    false
)
ON CONFLICT (id) DO UPDATE
SET public = false;

-- ------------------------------------------------------------
-- READ
-- Any authenticated RPM user may request the file.
-- Site/client access is additionally controlled by the
-- site_construction_drawings table and application.
-- ------------------------------------------------------------

DROP POLICY IF EXISTS "Authenticated Read construction-drawings"
    ON storage.objects;

CREATE POLICY "Authenticated Read construction-drawings"
ON storage.objects
FOR SELECT
USING (
    bucket_id = 'construction-drawings'
    AND auth.role() = 'authenticated'
);

-- ------------------------------------------------------------
-- UPLOAD
-- Authenticated users may upload.
-- Database RLS controls who can create drawing records.
-- ------------------------------------------------------------

DROP POLICY IF EXISTS "Authenticated Upload construction-drawings"
    ON storage.objects;

CREATE POLICY "Authenticated Upload construction-drawings"
ON storage.objects
FOR INSERT
WITH CHECK (
    bucket_id = 'construction-drawings'
    AND auth.role() = 'authenticated'
);

-- ------------------------------------------------------------
-- DELETE
-- Authenticated users may delete files.
-- Application/database permissions determine who receives
-- the delete controls.
-- ------------------------------------------------------------

DROP POLICY IF EXISTS "Authenticated Delete construction-drawings"
    ON storage.objects;

CREATE POLICY "Authenticated Delete construction-drawings"
ON storage.objects
FOR DELETE
USING (
    bucket_id = 'construction-drawings'
    AND auth.role() = 'authenticated'
);
