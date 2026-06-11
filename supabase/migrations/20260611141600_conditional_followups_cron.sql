-- Sub-project O — register cron job for process-conditional-followups
-- Mirrors campaign-dispatcher-tick: every minute, posts to the edge fn
-- with LIT_CRON_SECRET from vault. Edge fn returns {processed:0} when
-- there are no due trigger rows, so the wake-up is cheap.
--
-- Note: this migration is idempotent via cron.unschedule first.

DO $$
BEGIN
  PERFORM cron.unschedule('conditional-followups-tick');
EXCEPTION WHEN OTHERS THEN
  -- job doesn't exist yet, ignore
  NULL;
END $$;

SELECT cron.schedule(
  'conditional-followups-tick',
  '* * * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://jkmrfiaefxwgbvftohrb.supabase.co/functions/v1/process-conditional-followups',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Internal-Cron', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'LIT_CRON_SECRET')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 50000
  ) AS request_id;
  $cron$
);
