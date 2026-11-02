-- Supabase Storage is already installed by Supabase itself.
-- Creates a NEW public media bucket. Never changes the privacy of an existing bucket.
-- No anonymous write/delete policies are created; server S3 credentials are required.
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('mozes-media', 'mozes-media', true, 52428800)
ON CONFLICT (id) DO NOTHING;
