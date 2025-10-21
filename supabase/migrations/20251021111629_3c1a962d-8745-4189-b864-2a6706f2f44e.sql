-- Ensure full row data for realtime updates
ALTER TABLE public.whatsapp_accounts REPLICA IDENTITY FULL;

-- Enable RLS (idempotent)
ALTER TABLE public.whatsapp_accounts ENABLE ROW LEVEL SECURITY;

-- Create policies if they don't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'whatsapp_accounts' AND policyname = 'whatsapp_accounts_select_own'
  ) THEN
    CREATE POLICY whatsapp_accounts_select_own ON public.whatsapp_accounts
      FOR SELECT TO authenticated
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'whatsapp_accounts' AND policyname = 'whatsapp_accounts_insert_own'
  ) THEN
    CREATE POLICY whatsapp_accounts_insert_own ON public.whatsapp_accounts
      FOR INSERT TO authenticated
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'whatsapp_accounts' AND policyname = 'whatsapp_accounts_update_own'
  ) THEN
    CREATE POLICY whatsapp_accounts_update_own ON public.whatsapp_accounts
      FOR UPDATE TO authenticated
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'whatsapp_accounts' AND policyname = 'whatsapp_accounts_delete_own'
  ) THEN
    CREATE POLICY whatsapp_accounts_delete_own ON public.whatsapp_accounts
      FOR DELETE TO authenticated
      USING (auth.uid() = user_id);
  END IF;
END $$;