-- Add all existing WhatsApp account phone numbers to warmup blacklist
INSERT INTO public.warmup_phone_numbers (user_id, phone_number)
SELECT user_id, phone_number
FROM public.whatsapp_accounts
ON CONFLICT (user_id, phone_number) DO NOTHING;