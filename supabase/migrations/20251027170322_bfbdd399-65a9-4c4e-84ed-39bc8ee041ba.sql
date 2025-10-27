-- Drop old Mullvad SOCKS5 tables
DROP TABLE IF EXISTS mullvad_accounts CASCADE;

-- Create WireGuard configs table
CREATE TABLE public.wireguard_configs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  config_name TEXT NOT NULL,
  config_content TEXT NOT NULL,
  server_location TEXT NOT NULL DEFAULT 'DE',
  public_key TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.wireguard_configs ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own wireguard configs" 
ON public.wireguard_configs 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own wireguard configs" 
ON public.wireguard_configs 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own wireguard configs" 
ON public.wireguard_configs 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own wireguard configs" 
ON public.wireguard_configs 
FOR DELETE 
USING (auth.uid() = user_id);

-- Update whatsapp_accounts table to use wireguard_config_id instead of proxy_server JSON
ALTER TABLE public.whatsapp_accounts 
ADD COLUMN IF NOT EXISTS wireguard_config_id UUID REFERENCES public.wireguard_configs(id) ON DELETE SET NULL;

-- Create index for performance
CREATE INDEX idx_wireguard_configs_user_id ON public.wireguard_configs(user_id);
CREATE INDEX idx_whatsapp_accounts_wireguard_config ON public.whatsapp_accounts(wireguard_config_id);