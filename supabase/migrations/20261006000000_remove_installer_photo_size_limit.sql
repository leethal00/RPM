-- Let the project-wide Storage setting govern full-resolution job photos.
UPDATE storage.buckets
SET file_size_limit = NULL
WHERE id = 'installer-photos';
