-- Add check constraint to ensure only valid status values for whatsapp_accounts
-- Valid statuses: 'connected', 'disconnected', 'blocked', 'pending'
ALTER TABLE whatsapp_accounts 
DROP CONSTRAINT IF EXISTS whatsapp_accounts_status_check;

ALTER TABLE whatsapp_accounts 
ADD CONSTRAINT whatsapp_accounts_status_check 
CHECK (status IN ('connected', 'disconnected', 'blocked', 'pending'));