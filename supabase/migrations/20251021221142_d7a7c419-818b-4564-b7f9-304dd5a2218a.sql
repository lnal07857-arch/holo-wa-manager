-- Allow users to update messages (mark as read) for their own accounts
CREATE POLICY "Users can update messages from own accounts"
ON public.messages
FOR UPDATE
USING (
  EXISTS (
    SELECT 1
    FROM whatsapp_accounts
    WHERE whatsapp_accounts.id = messages.account_id
      AND whatsapp_accounts.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM whatsapp_accounts
    WHERE whatsapp_accounts.id = messages.account_id
      AND whatsapp_accounts.user_id = auth.uid()
  )
);