-- Clear all chat messages for fresh testing
DELETE FROM messages;

-- Reset warmup stats
UPDATE account_warmup_stats SET 
  sent_messages = 0,
  received_messages = 0,
  unique_contacts = '{}'::jsonb,
  blocks = 0;

-- Clear warmup daily history
DELETE FROM warmup_daily_history;