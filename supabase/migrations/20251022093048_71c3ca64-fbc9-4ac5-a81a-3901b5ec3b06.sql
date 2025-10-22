-- Create table for follow-up disabled contacts
CREATE TABLE public.follow_up_disabled_contacts (
  id UUID NOT NULL DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
  user_id UUID NOT NULL,
  contact_phone TEXT NOT NULL,
  disabled_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, contact_phone)
);

-- Enable Row Level Security
ALTER TABLE public.follow_up_disabled_contacts ENABLE ROW LEVEL SECURITY;

-- Create policies for user access
CREATE POLICY "Users can view own disabled contacts" 
ON public.follow_up_disabled_contacts 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create own disabled contacts" 
ON public.follow_up_disabled_contacts 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own disabled contacts" 
ON public.follow_up_disabled_contacts 
FOR DELETE 
USING (auth.uid() = user_id);