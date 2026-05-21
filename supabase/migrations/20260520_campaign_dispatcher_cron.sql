-- pg_cron is already enabled in this project (other cron jobs exist).
-- Confirm defensively.
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Drop the legacy unauthenticated tick job, if present. The new job
-- below replaces it with an X-Internal-Cron-authenticated POST.
SELECT cron.unschedule('lit-send-campaign-email-tick')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'lit-send-campaign-email-tick'
);

-- Drop the new job if present (idempotent migration).
SELECT cron.unschedule('campaign-dispatcher-tick')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'campaign-dispatcher-tick'
);

-- Every minute, POST to send-campaign-email. The dispatcher does its
-- own pagination + advisory locking, so concurrent invocations are
-- safe. The function reads LIT_CRON_SECRET from its environment and
-- compares it to the X-Internal-Cron request header.
SELECT cron.schedule(
  'campaign-dispatcher-tick',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://jkmrfiaefxwgbvftohrb.supabase.co/functions/v1/send-campaign-email',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Internal-Cron', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'LIT_CRON_SECRET')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 50000
  ) AS request_id;
  $$
);
