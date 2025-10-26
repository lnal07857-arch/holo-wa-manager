-- Add display_order column to whatsapp_accounts table
ALTER TABLE whatsapp_accounts 
ADD COLUMN IF NOT EXISTS display_order integer DEFAULT 0;

-- Update existing accounts with sequential order
WITH ordered_accounts AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at) as row_num
  FROM whatsapp_accounts
)
UPDATE whatsapp_accounts
SET display_order = ordered_accounts.row_num
FROM ordered_accounts
WHERE whatsapp_accounts.id = ordered_accounts.id;