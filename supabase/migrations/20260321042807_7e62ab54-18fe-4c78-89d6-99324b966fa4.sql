
ALTER TABLE public.whatsapp_accounts
ADD COLUMN auto_welcome_enabled boolean NOT NULL DEFAULT false,
ADD COLUMN auto_welcome_message text;
