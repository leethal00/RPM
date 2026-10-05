-- Full-resolution camera photos can exceed the original 10 MB bucket limit.
UPDATE storage.buckets
SET file_size_limit = 52428800
WHERE id = 'installer-photos';
