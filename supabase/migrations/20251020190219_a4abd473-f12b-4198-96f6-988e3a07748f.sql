-- Add global profile settings to profiles table
ALTER TABLE public.profiles 
ADD COLUMN global_profile_name TEXT,
ADD COLUMN global_profile_image TEXT,
ADD COLUMN global_profile_website TEXT,
ADD COLUMN global_profile_address TEXT;