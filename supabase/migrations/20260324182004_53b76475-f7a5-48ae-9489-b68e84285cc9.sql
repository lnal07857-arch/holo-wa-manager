
-- Add worker_slot column to whatsapp_accounts
ALTER TABLE public.whatsapp_accounts ADD COLUMN IF NOT EXISTS worker_slot INTEGER;

-- Create worker_slots table
CREATE TABLE IF NOT EXISTS public.worker_slots (
  slot_number INTEGER PRIMARY KEY CHECK (slot_number >= 1 AND slot_number <= 10),
  account_id UUID REFERENCES public.whatsapp_accounts(id) ON DELETE SET NULL,
  is_occupied BOOLEAN NOT NULL DEFAULT false,
  last_used_at TIMESTAMP WITH TIME ZONE
);

-- Pre-populate slots 1-10
INSERT INTO public.worker_slots (slot_number, is_occupied) VALUES
  (1, false), (2, false), (3, false), (4, false), (5, false),
  (6, false), (7, false), (8, false), (9, false), (10, false)
ON CONFLICT (slot_number) DO NOTHING;

-- Enable RLS
ALTER TABLE public.worker_slots ENABLE ROW LEVEL SECURITY;

-- RLS policies for worker_slots
CREATE POLICY "Authenticated users can view worker slots"
  ON public.worker_slots FOR SELECT TO authenticated USING (true);

CREATE POLICY "Service role can manage worker slots"
  ON public.worker_slots FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Sync existing accounts: map worker_id to worker_slot
UPDATE public.whatsapp_accounts 
SET worker_slot = CAST(SUBSTRING(worker_id FROM 'worker-(\d+)') AS INTEGER)
WHERE worker_id IS NOT NULL AND worker_slot IS NULL;

-- Update worker_slots from existing accounts
UPDATE public.worker_slots ws
SET account_id = wa.id, is_occupied = true, last_used_at = wa.updated_at
FROM public.whatsapp_accounts wa
WHERE wa.worker_slot = ws.slot_number AND wa.worker_slot IS NOT NULL;
