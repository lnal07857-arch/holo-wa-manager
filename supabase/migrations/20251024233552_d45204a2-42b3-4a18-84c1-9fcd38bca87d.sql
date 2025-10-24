-- Add new columns to warmup_settings for phase-based system
ALTER TABLE warmup_settings 
ADD COLUMN IF NOT EXISTS phase VARCHAR(20) DEFAULT 'phase1',
ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS min_typing_ms INTEGER DEFAULT 800,
ADD COLUMN IF NOT EXISTS max_typing_ms INTEGER DEFAULT 4000,
ADD COLUMN IF NOT EXISTS min_delay_sec INTEGER DEFAULT 2,
ADD COLUMN IF NOT EXISTS max_delay_sec INTEGER DEFAULT 15,
ADD COLUMN IF NOT EXISTS active_start_hour INTEGER DEFAULT 8,
ADD COLUMN IF NOT EXISTS active_end_hour INTEGER DEFAULT 22,
ADD COLUMN IF NOT EXISTS sleep_start_hour INTEGER DEFAULT 23,
ADD COLUMN IF NOT EXISTS sleep_end_hour INTEGER DEFAULT 7;

-- Create table for account warm-up statistics
CREATE TABLE IF NOT EXISTS account_warmup_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES whatsapp_accounts(id) ON DELETE CASCADE,
  sent_messages INTEGER DEFAULT 0,
  received_messages INTEGER DEFAULT 0,
  unique_contacts JSONB DEFAULT '{}'::jsonb,
  blocks INTEGER DEFAULT 0,
  status VARCHAR(20) DEFAULT 'warming',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(account_id)
);

-- Create table for daily message history
CREATE TABLE IF NOT EXISTS warmup_daily_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES whatsapp_accounts(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  sent_count INTEGER DEFAULT 0,
  received_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(account_id, date)
);

-- Enable RLS
ALTER TABLE account_warmup_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE warmup_daily_history ENABLE ROW LEVEL SECURITY;

-- RLS Policies for account_warmup_stats
CREATE POLICY "Users can view their own warmup stats"
  ON account_warmup_stats FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own warmup stats"
  ON account_warmup_stats FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own warmup stats"
  ON account_warmup_stats FOR UPDATE
  USING (auth.uid() = user_id);

-- RLS Policies for warmup_daily_history
CREATE POLICY "Users can view their own daily history"
  ON warmup_daily_history FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM whatsapp_accounts 
      WHERE whatsapp_accounts.id = warmup_daily_history.account_id 
      AND whatsapp_accounts.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert their own daily history"
  ON warmup_daily_history FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM whatsapp_accounts 
      WHERE whatsapp_accounts.id = warmup_daily_history.account_id 
      AND whatsapp_accounts.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update their own daily history"
  ON warmup_daily_history FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM whatsapp_accounts 
      WHERE whatsapp_accounts.id = warmup_daily_history.account_id 
      AND whatsapp_accounts.user_id = auth.uid()
    )
  );

-- Trigger for updated_at
CREATE TRIGGER update_account_warmup_stats_updated_at
  BEFORE UPDATE ON account_warmup_stats
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Function to increment warmup stats
CREATE OR REPLACE FUNCTION increment_warmup_stats(
  p_account_id UUID,
  p_to_phone TEXT,
  p_count INTEGER DEFAULT 1
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id UUID;
  v_today DATE := CURRENT_DATE;
  v_contacts JSONB;
BEGIN
  -- Get user_id from account
  SELECT user_id INTO v_user_id
  FROM whatsapp_accounts
  WHERE id = p_account_id;

  -- Ensure stats record exists
  INSERT INTO account_warmup_stats (user_id, account_id)
  VALUES (v_user_id, p_account_id)
  ON CONFLICT (account_id) DO NOTHING;

  -- Get current contacts
  SELECT unique_contacts INTO v_contacts
  FROM account_warmup_stats
  WHERE account_id = p_account_id;

  -- Update contact count
  v_contacts := jsonb_set(
    COALESCE(v_contacts, '{}'::jsonb),
    ARRAY[p_to_phone],
    to_jsonb(COALESCE((v_contacts->p_to_phone)::int, 0) + p_count)
  );

  -- Update stats
  UPDATE account_warmup_stats
  SET 
    sent_messages = sent_messages + p_count,
    unique_contacts = v_contacts
  WHERE account_id = p_account_id;

  -- Update daily history
  INSERT INTO warmup_daily_history (account_id, date, sent_count)
  VALUES (p_account_id, v_today, p_count)
  ON CONFLICT (account_id, date)
  DO UPDATE SET sent_count = warmup_daily_history.sent_count + p_count;
END;
$$;