-- Daily 09:00 UTC schedule for attio-stalled-deals-cron.
-- Scans the LIT Attio workspace for Active Pipeline deals with no touch
-- in 14+ days (configurable via ATTIO_STALL_DAYS env on the edge fn),
-- creates a follow-up Task in Attio for each, rolls up the batch into an
-- admin-notify summary so the founder sees what needs attention.
--
-- 09:00 UTC = 05:00 ET / 04:00 CT — the queue is ready before the sales
-- day starts.

SELECT cron.unschedule('attio-stalled-deals-cron') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'attio-stalled-deals-cron'
);

SELECT cron.schedule(
  'attio-stalled-deals-cron',
  '0 9 * * *',
  $$
  SELECT net.http_post(
    url := 'https://jkmrfiaefxwgbvftohrb.supabase.co/functions/v1/attio-stalled-deals-cron',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Internal-Cron', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'LIT_CRON_SECRET')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  ) AS request_id;
  $$
);
