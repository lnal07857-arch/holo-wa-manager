-- Add for_chats column to message_templates table
ALTER TABLE public.message_templates 
ADD COLUMN for_chats BOOLEAN DEFAULT false;