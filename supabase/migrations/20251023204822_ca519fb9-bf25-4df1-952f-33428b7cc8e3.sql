-- Add is_warmup flag to messages table
ALTER TABLE public.messages 
ADD COLUMN is_warmup boolean DEFAULT false NOT NULL;

-- Add index for better query performance
CREATE INDEX idx_messages_is_warmup ON public.messages(is_warmup);