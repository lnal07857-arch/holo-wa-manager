-- Ensure full row data for realtime on messages
ALTER TABLE public.messages REPLICA IDENTITY FULL;