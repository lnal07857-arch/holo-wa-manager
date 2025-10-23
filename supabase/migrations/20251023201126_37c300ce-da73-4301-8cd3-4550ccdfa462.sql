-- Remove cover image column from profiles table
ALTER TABLE public.profiles DROP COLUMN IF EXISTS global_profile_cover_image;

-- First delete all objects in the cover-images bucket
DELETE FROM storage.objects WHERE bucket_id = 'cover-images';

-- Then delete the cover-images storage bucket
DELETE FROM storage.buckets WHERE id = 'cover-images';