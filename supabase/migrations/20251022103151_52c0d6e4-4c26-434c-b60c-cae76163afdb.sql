-- Add separate field for WhatsApp status/info
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS global_profile_info text;

COMMENT ON COLUMN public.profiles.global_profile_info IS 'WhatsApp Status/Info text (separate from business description)';
COMMENT ON COLUMN public.profiles.global_profile_description IS 'WhatsApp Business profile description';