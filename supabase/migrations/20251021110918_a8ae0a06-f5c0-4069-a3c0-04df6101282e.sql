-- Enable realtime for whatsapp_accounts table to receive live QR code updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_accounts;