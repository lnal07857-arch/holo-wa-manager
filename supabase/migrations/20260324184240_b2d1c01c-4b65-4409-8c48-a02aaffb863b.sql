-- Allow authenticated users to update worker_slots (for slot assignment from frontend)
CREATE POLICY "Authenticated users can update worker slots"
  ON public.worker_slots FOR UPDATE TO authenticated USING (true) WITH CHECK (true);