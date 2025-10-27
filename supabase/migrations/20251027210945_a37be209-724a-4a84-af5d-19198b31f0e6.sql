-- Remove the old primary/backup/tertiary config columns
-- We only keep active_config_id (which config is currently active)
-- and mullvad_account_id (which mullvad account to use)

ALTER TABLE whatsapp_accounts
DROP COLUMN IF EXISTS wireguard_config_id,
DROP COLUMN IF EXISTS wireguard_backup_config_id,
DROP COLUMN IF EXISTS wireguard_tertiary_config_id;