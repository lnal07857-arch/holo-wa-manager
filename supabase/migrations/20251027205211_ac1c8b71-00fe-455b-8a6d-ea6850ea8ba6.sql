-- Add mullvad_account_id to whatsapp_accounts table
ALTER TABLE whatsapp_accounts
ADD COLUMN mullvad_account_id UUID REFERENCES mullvad_accounts(id) ON DELETE SET NULL;

-- Add index for better query performance
CREATE INDEX idx_whatsapp_accounts_mullvad_account_id ON whatsapp_accounts(mullvad_account_id);