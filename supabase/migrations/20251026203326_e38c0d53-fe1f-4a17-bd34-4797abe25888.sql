-- Create mullvad_accounts table
CREATE TABLE public.mullvad_accounts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  account_number TEXT NOT NULL,
  server_region TEXT NOT NULL DEFAULT 'DE',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.mullvad_accounts ENABLE ROW LEVEL SECURITY;

-- Create policies for user access
CREATE POLICY "Users can view their own mullvad accounts" 
ON public.mullvad_accounts 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own mullvad accounts" 
ON public.mullvad_accounts 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own mullvad accounts" 
ON public.mullvad_accounts 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own mullvad accounts" 
ON public.mullvad_accounts 
FOR DELETE 
USING (auth.uid() = user_id);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_mullvad_accounts_updated_at
BEFORE UPDATE ON public.mullvad_accounts
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();