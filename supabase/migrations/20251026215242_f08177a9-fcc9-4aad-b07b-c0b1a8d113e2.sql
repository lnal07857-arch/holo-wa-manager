-- Enable pg_cron extension if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Enable pg_net extension for HTTP requests
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Schedule VPN health check to run every 5 minutes
SELECT cron.schedule(
  'vpn-health-check-every-5-minutes',
  '*/5 * * * *', -- Every 5 minutes
  $$
  SELECT
    net.http_post(
        url:='https://umizkegxybjhqucbhgth.supabase.co/functions/v1/vpn-health-check',
        headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVtaXprZWd4eWJqaHF1Y2JoZ3RoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA5NzM0MjQsImV4cCI6MjA3NjU0OTQyNH0.t_C139tgMw__bCBTUkF-kgCaG3-MKKsukmYB8FQr-k4"}'::jsonb,
        body:=concat('{"time": "', now(), '"}')::jsonb
    ) as request_id;
  $$
);