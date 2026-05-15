SELECT cron.schedule(
  'pulse-drayage-recompute-daily',
  '0 7 * * *',
  $$
  SELECT net.http_post(
    url := 'https://jkmrfiaefxwgbvftohrb.supabase.co/functions/v1/pulse-drayage-recompute',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Internal-Cron', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'LIT_CRON_SECRET')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 180000
  );
  $$
);
