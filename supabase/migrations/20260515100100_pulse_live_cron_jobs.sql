-- 20260515100100_pulse_live_cron_jobs.sql
-- B6: schedule pulse-bol-tracking-tick at 06:00 UTC daily.

SELECT cron.unschedule('pulse-bol-tracking-daily') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname='pulse-bol-tracking-daily'
);

SELECT cron.schedule(
  'pulse-bol-tracking-daily',
  '0 6 * * *',
  $$
  SELECT net.http_post(
    url := 'https://jkmrfiaefxwgbvftohrb.supabase.co/functions/v1/pulse-bol-tracking-tick',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Internal-Cron', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'LIT_CRON_SECRET')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 240000
  );
  $$
);
