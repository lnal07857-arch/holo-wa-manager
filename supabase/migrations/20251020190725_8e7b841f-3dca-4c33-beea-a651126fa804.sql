-- Add email field to global profile settings
ALTER TABLE public.profiles 
ADD COLUMN global_profile_email TEXT;