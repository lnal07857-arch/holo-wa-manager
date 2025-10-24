-- Setup cron job to run warmup every minute
SELECT cron.schedule(
  'warmup-runner-job',
  '* * * * *',
  $$
  SELECT
    net.http_post(
        url:='https://umizkegxybjhqucbhgth.supabase.co/functions/v1/warmup-runner',
        headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVtaXprZWd4eWJqaHF1Y2JoZ3RoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA5NzM0MjQsImV4cCI6MjA3NjU0OTQyNH0.t_C139tgMw__bCBTUkF-kgCaG3-MKKsukmYB8FQr-k4"}'::jsonb,
        body:='{}'::jsonb
    ) as request_id;
  $$
);

-- Enable realtime for warmup_settings table
ALTER PUBLICATION supabase_realtime ADD TABLE public.warmup_settings;