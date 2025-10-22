-- Enable realtime for messages table so incoming messages are synced automatically
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;