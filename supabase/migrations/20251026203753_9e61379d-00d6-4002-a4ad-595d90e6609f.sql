-- Add phase column to account_warmup_stats if not exists
ALTER TABLE public.account_warmup_stats 
ADD COLUMN IF NOT EXISTS phase VARCHAR DEFAULT 'phase1';

-- Update existing records to have phase1 as default
UPDATE public.account_warmup_stats 
SET phase = 'phase1' 
WHERE phase IS NULL;