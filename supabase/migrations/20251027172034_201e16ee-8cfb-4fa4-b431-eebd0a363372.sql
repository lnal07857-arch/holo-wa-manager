-- Add backup config columns to whatsapp_accounts
ALTER TABLE public.whatsapp_accounts 
ADD COLUMN IF NOT EXISTS wireguard_backup_config_id UUID REFERENCES public.wireguard_configs(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS wireguard_tertiary_config_id UUID REFERENCES public.wireguard_configs(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS active_config_id UUID REFERENCES public.wireguard_configs(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS last_failover_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS failover_count INTEGER DEFAULT 0;

-- Create WireGuard health status table
CREATE TABLE IF NOT EXISTS public.wireguard_health (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  config_id UUID NOT NULL REFERENCES public.wireguard_configs(id) ON DELETE CASCADE,
  is_healthy BOOLEAN NOT NULL DEFAULT true,
  last_check_at TIMESTAMP WITH TIME ZONE,
  last_success_at TIMESTAMP WITH TIME ZONE,
  last_failure_at TIMESTAMP WITH TIME ZONE,
  failure_count INTEGER NOT NULL DEFAULT 0,
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(config_id)
);

-- Enable RLS
ALTER TABLE public.wireguard_health ENABLE ROW LEVEL SECURITY;

-- RLS Policies for wireguard_health
CREATE POLICY "Users can view health of their configs" 
ON public.wireguard_health 
FOR SELECT 
USING (EXISTS (
  SELECT 1 FROM public.wireguard_configs 
  WHERE wireguard_configs.id = wireguard_health.config_id 
  AND wireguard_configs.user_id = auth.uid()
));

CREATE POLICY "Service role can manage health" 
ON public.wireguard_health 
FOR ALL 
USING (true)
WITH CHECK (true);

-- Function to mark WireGuard config as healthy
CREATE OR REPLACE FUNCTION mark_wireguard_healthy(p_config_id UUID)
RETURNS void AS $$
BEGIN
  INSERT INTO public.wireguard_health (
    config_id,
    is_healthy,
    last_check_at,
    last_success_at,
    consecutive_failures
  )
  VALUES (
    p_config_id,
    true,
    now(),
    now(),
    0
  )
  ON CONFLICT (config_id)
  DO UPDATE SET
    is_healthy = true,
    last_check_at = now(),
    last_success_at = now(),
    consecutive_failures = 0,
    error_message = NULL,
    updated_at = now();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Function to mark WireGuard config as unhealthy
CREATE OR REPLACE FUNCTION mark_wireguard_unhealthy(p_config_id UUID, p_error_message TEXT DEFAULT NULL)
RETURNS void AS $$
BEGIN
  INSERT INTO public.wireguard_health (
    config_id,
    is_healthy,
    last_check_at,
    last_failure_at,
    failure_count,
    consecutive_failures,
    error_message
  )
  VALUES (
    p_config_id,
    false,
    now(),
    now(),
    1,
    1,
    p_error_message
  )
  ON CONFLICT (config_id)
  DO UPDATE SET
    is_healthy = false,
    last_check_at = now(),
    last_failure_at = now(),
    failure_count = wireguard_health.failure_count + 1,
    consecutive_failures = wireguard_health.consecutive_failures + 1,
    error_message = p_error_message,
    updated_at = now();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_wireguard_health_config_id ON public.wireguard_health(config_id);
CREATE INDEX IF NOT EXISTS idx_wireguard_health_healthy ON public.wireguard_health(is_healthy);
CREATE INDEX IF NOT EXISTS idx_whatsapp_accounts_active_config ON public.whatsapp_accounts(active_config_id);