-- Switch pulse-refresh-tick from every-15-min to daily-at-03:00 UTC.
-- Combined with BATCH_SIZE=40 + TTL=7 days inside the edge function,
-- this yields ~one refresh per saved company per week — the cadence
-- the operator approved for ImportYeti-token-conscious operation.

SELECT cron.unschedule('pulse-refresh-tick-15min')
 WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'pulse-refresh-tick-15min');

SELECT cron.unschedule('pulse-refresh-tick-daily')
 WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'pulse-refresh-tick-daily');

SELECT cron.schedule(
  'pulse-refresh-tick-daily',
  '0 3 * * *',
  $$
  SELECT net.http_post(
    url := 'https://jkmrfiaefxwgbvftohrb.supabase.co/functions/v1/pulse-refresh-tick',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Internal-Cron', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'LIT_CRON_SECRET')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  ) AS request_id;
  $$
);
