-- ============================================================================
-- Project Harvey — sequence + enrichment heartbeats.
--
-- Two pg_cron jobs, both using the EXACT working LIT cron pattern (net.http_post
-- with ONLY Content-Type + X-Internal-Cron from vault; NO Authorization/apikey —
-- both targets are verify_jwt=false via .verify-jwt-manifest.json):
--
--   harvey-sequence-tick  every 10 min — enroll workable LEAD-CRM leads into the
--                         ICP campaigns + emit due sequence drafts (email +
--                         LinkedIn). The dispatchers send them.
--   harvey-enrich         every 30 min — Apollo-reveal emails for New-stage
--                         leads that have none, so they become emailable.
--
-- SAFE EVEN IF HARVEY IS OFF: both functions fail-closed on the
-- 'harvey_internal_agent' flag + config.enabled, so a tick is a recorded no-op
-- until Harvey is turned on. IDEMPOTENT: unschedules any prior job of the same
-- name before (re)scheduling.
-- ============================================================================

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    -- harvey-sequence-tick — every 10 minutes
    perform cron.unschedule('harvey-sequence-tick-heartbeat')
      where exists (select 1 from cron.job where jobname = 'harvey-sequence-tick-heartbeat');
    perform cron.schedule(
      'harvey-sequence-tick-heartbeat',
      '*/10 * * * *',
      $cron$
      select net.http_post(
        url := 'https://jkmrfiaefxwgbvftohrb.supabase.co/functions/v1/harvey-sequence-tick',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'X-Internal-Cron', (select decrypted_secret from vault.decrypted_secrets where name = 'LIT_CRON_SECRET')
        ),
        body := '{"trigger_type":"cron"}'::jsonb,
        timeout_milliseconds := 120000
      );
      $cron$
    );

    -- harvey-enrich — every 30 minutes (offset by cron minute alignment)
    perform cron.unschedule('harvey-enrich-heartbeat')
      where exists (select 1 from cron.job where jobname = 'harvey-enrich-heartbeat');
    perform cron.schedule(
      'harvey-enrich-heartbeat',
      '*/30 * * * *',
      $cron$
      select net.http_post(
        url := 'https://jkmrfiaefxwgbvftohrb.supabase.co/functions/v1/harvey-enrich',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'X-Internal-Cron', (select decrypted_secret from vault.decrypted_secrets where name = 'LIT_CRON_SECRET')
        ),
        body := '{"trigger_type":"cron"}'::jsonb,
        timeout_milliseconds := 120000
      );
      $cron$
    );
  end if;
end
$$;
