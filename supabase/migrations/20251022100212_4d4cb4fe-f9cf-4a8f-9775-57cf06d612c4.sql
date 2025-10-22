-- Add category field to profiles table
ALTER TABLE public.profiles 
ADD COLUMN global_profile_category text;