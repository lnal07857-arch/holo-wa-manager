-- Add mullvad_account_id to wireguard_configs
ALTER TABLE public.wireguard_configs 
ADD COLUMN mullvad_account_id UUID REFERENCES public.mullvad_accounts(id) ON DELETE SET NULL;

-- Create index for performance
CREATE INDEX idx_wireguard_configs_mullvad_account 
ON public.wireguard_configs(mullvad_account_id);

-- Add comment
COMMENT ON COLUMN public.wireguard_configs.mullvad_account_id 
IS 'Reference to the Mullvad account used to generate this config (max 5 simultaneous connections per account)';