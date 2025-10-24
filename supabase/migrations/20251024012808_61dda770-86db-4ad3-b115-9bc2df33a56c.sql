-- Create warmup_settings table for persistent warmup state
CREATE TABLE public.warmup_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  is_running BOOLEAN NOT NULL DEFAULT false,
  interval_minutes INTEGER NOT NULL DEFAULT 5,
  messages_per_session INTEGER NOT NULL DEFAULT 5,
  messages_sent INTEGER NOT NULL DEFAULT 0,
  skipped_pairs INTEGER NOT NULL DEFAULT 0,
  completed_rounds INTEGER NOT NULL DEFAULT 0,
  current_pair_index INTEGER NOT NULL DEFAULT 0,
  all_pairs JSONB DEFAULT '[]'::jsonb,
  last_message TEXT,
  last_run_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.warmup_settings ENABLE ROW LEVEL SECURITY;

-- Users can view own settings
CREATE POLICY "Users can view own warmup settings"
ON public.warmup_settings
FOR SELECT
USING (auth.uid() = user_id);

-- Users can create own settings
CREATE POLICY "Users can create own warmup settings"
ON public.warmup_settings
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Users can update own settings
CREATE POLICY "Users can update own warmup settings"
ON public.warmup_settings
FOR UPDATE
USING (auth.uid() = user_id);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_warmup_settings_updated_at
BEFORE UPDATE ON public.warmup_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create index for efficient user lookups
CREATE INDEX idx_warmup_settings_user_id ON public.warmup_settings(user_id);

-- Enable pg_cron extension for scheduled jobs
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Enable pg_net extension for HTTP requests
CREATE EXTENSION IF NOT EXISTS pg_net;