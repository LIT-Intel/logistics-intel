-- ============================================================================
-- Phase 7 lifecycle drip cron. Registers a daily pg_cron job that calls
-- lifecycle-nudge-tick with the X-Internal-Cron secret (standard LIT pattern,
-- mirrors pulse-*-tick jobs).
--
-- DORMANT BY DESIGN: the job fires daily, but lifecycle-nudge-tick short-circuits
-- to a no-op ("skipped: flag_off") because lit_internal_meta['lifecycle_messaging_enabled']
-- defaults FALSE. Nothing emails a real user until the owner enables the flag in
-- the Admin > Growth > Lifecycle surface. Reactivation has NO cron — it's a
-- manual per-segment "send now" from the admin, also gated.
--
-- Schedule: 15:00 UTC daily (mid-morning US) — after the trial-email cron window,
-- avoids same-minute contention.
-- ============================================================================

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    -- Idempotent: drop any prior definition before (re)scheduling.
    perform cron.unschedule('lifecycle-nudge-daily')
      where exists (select 1 from cron.job where jobname = 'lifecycle-nudge-daily');

    perform cron.schedule(
      'lifecycle-nudge-daily',
      '0 15 * * *',
      $cron$
      select net.http_post(
        url := 'https://jkmrfiaefxwgbvftohrb.supabase.co/functions/v1/lifecycle-nudge-tick',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'X-Internal-Cron', (select decrypted_secret from vault.decrypted_secrets where name = 'LIT_CRON_SECRET')
        ),
        body := '{"mode":"lifecycle"}'::jsonb,
        timeout_milliseconds := 240000
      );
      $cron$
    );
  end if;
end
$$;
