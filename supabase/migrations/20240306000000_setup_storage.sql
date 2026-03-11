-- Storage Buckets and Policies Setup

-- 1. Create storage buckets
INSERT INTO storage.buckets (id, name, public)
VALUES
  ('job-attachments', 'job-attachments', true),
  ('site-photos', 'site-photos', true),
  ('asset-photos', 'asset-photos', true)
ON CONFLICT (id) DO NOTHING;

-- 2. Storage policies for job-attachments
CREATE POLICY "Public Access job-attachments"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'job-attachments');

CREATE POLICY "Authenticated Upload job-attachments"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'job-attachments'
    AND auth.role() = 'authenticated'
  );

CREATE POLICY "Authenticated Delete job-attachments"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'job-attachments'
    AND auth.role() = 'authenticated'
  );

-- 3. Storage policies for site-photos
CREATE POLICY "Public Access site-photos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'site-photos');

CREATE POLICY "Authenticated Upload site-photos"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'site-photos'
    AND auth.role() = 'authenticated'
  );

CREATE POLICY "Authenticated Delete site-photos"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'site-photos'
    AND auth.role() = 'authenticated'
  );

-- 4. Storage policies for asset-photos
CREATE POLICY "Public Access asset-photos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'asset-photos');

CREATE POLICY "Authenticated Upload asset-photos"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'asset-photos'
    AND auth.role() = 'authenticated'
  );

CREATE POLICY "Authenticated Delete asset-photos"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'asset-photos'
    AND auth.role() = 'authenticated'
  );
