-- Enable users to delete messages from their own accounts
CREATE POLICY "Users can delete messages from own accounts"
ON messages
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM whatsapp_accounts
    WHERE whatsapp_accounts.id = messages.account_id
    AND whatsapp_accounts.user_id = auth.uid()
  )
);