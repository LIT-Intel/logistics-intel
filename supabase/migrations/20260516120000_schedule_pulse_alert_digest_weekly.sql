-- Schedule pulse-alert-digest weekly send.
--
-- Schedule: hourly Mondays 09:00-17:00 UTC. Hourly window gives natural
-- retry on Resend rate-limits or function timeouts; idempotency is enforced
-- by the function via the digest_sent_at column (once sent, subsequent
-- hourly attempts exit cheaply with "no_alerts").
--
-- Window rationale: 9-17 UTC = 5am-1pm EST, covers business hours for the
-- US East/Central broker user base. The freight-rate-fetcher fires at
-- 16:00 UTC so the late-window digests carry fresh benchmark data.

SELECT cron.schedule(
  'pulse-alert-digest-hourly-monday',
  '0 9-17 * * 1',
  $$SELECT net.http_post(
    url := 'https://jkmrfiaefxwgbvftohrb.supabase.co/functions/v1/pulse-alert-digest',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Internal-Cron', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'LIT_CRON_SECRET')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 240000
  );$$
);
