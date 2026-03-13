
-- Drop trigger (correct name) and function
DROP TRIGGER IF EXISTS auto_add_warmup_phone_trigger ON public.whatsapp_accounts;
DROP FUNCTION IF EXISTS public.auto_add_warmup_phone() CASCADE;

-- Drop function increment_warmup_stats
DROP FUNCTION IF EXISTS public.increment_warmup_stats(uuid, text, integer);

-- Drop tables (order matters for foreign keys)
DROP TABLE IF EXISTS public.warmup_daily_history;
DROP TABLE IF EXISTS public.warmup_phone_numbers;
DROP TABLE IF EXISTS public.warmup_settings;
DROP TABLE IF EXISTS public.account_warmup_stats;
DROP TABLE IF EXISTS public.follow_up_disabled_contacts;
