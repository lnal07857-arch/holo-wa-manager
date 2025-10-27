-- Create warmup phone numbers blacklist table
CREATE TABLE public.warmup_phone_numbers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  phone_number TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, phone_number)
);

-- Enable RLS
ALTER TABLE public.warmup_phone_numbers ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own warmup numbers" 
ON public.warmup_phone_numbers 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own warmup numbers" 
ON public.warmup_phone_numbers 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own warmup numbers" 
ON public.warmup_phone_numbers 
FOR DELETE 
USING (auth.uid() = user_id);

-- Index for performance
CREATE INDEX idx_warmup_phone_numbers_user_id ON public.warmup_phone_numbers(user_id);
CREATE INDEX idx_warmup_phone_numbers_phone ON public.warmup_phone_numbers(phone_number);

-- Function to auto-add WhatsApp account phone numbers to warmup blacklist
CREATE OR REPLACE FUNCTION auto_add_warmup_phone()
RETURNS TRIGGER AS $$
BEGIN
  -- Add the WhatsApp account's phone number to warmup blacklist
  INSERT INTO public.warmup_phone_numbers (user_id, phone_number)
  VALUES (NEW.user_id, NEW.phone_number)
  ON CONFLICT (user_id, phone_number) DO NOTHING;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Trigger to automatically add phone numbers
CREATE TRIGGER auto_add_warmup_phone_trigger
AFTER INSERT ON public.whatsapp_accounts
FOR EACH ROW
EXECUTE FUNCTION auto_add_warmup_phone();