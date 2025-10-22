-- Add cover image field to profiles table
ALTER TABLE public.profiles 
ADD COLUMN global_profile_cover_image text;