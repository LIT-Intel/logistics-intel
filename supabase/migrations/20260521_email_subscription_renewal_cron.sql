-- Schedule pg_cron job to renew Gmail Watch / Graph subscriptions every 6h.
-- Gmail Watch caps at 7 days; Graph subscriptions on /messages cap at ~71h59m.
-- Posting to reply-receiver?action=renew refreshes anything expiring in <24h.

SELECT cron.unschedule('email-subscription-renewal') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'email-subscription-renewal'
);

SELECT cron.schedule(
  'email-subscription-renewal',
  '0 */6 * * *',
  $$
  SELECT net.http_post(
    url := 'https://jkmrfiaefxwgbvftohrb.supabase.co/functions/v1/reply-receiver?action=renew',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Internal-Cron', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'LIT_CRON_SECRET')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 50000
  ) AS request_id;
  $$
);
