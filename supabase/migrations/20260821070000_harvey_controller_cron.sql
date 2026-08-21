-- ============================================================================
-- Project Harvey — controller heartbeat cron (true autonomy).
--
-- Registers a pg_cron job that calls the harvey-controller edge function every
-- 10 minutes. Each tick lets Harvey probe live pipeline state, pick ONE
-- highest-priority action, and (when cleared) execute it — including drafting
-- first-touch outreach for the owner's EXISTING enriched CRM leads.
--
-- AUTH — mirrors the EXACT working pattern of the live edge-fn crons
-- (campaign-dispatcher-tick, lit-sync-inbox-tick, lifecycle-nudge-daily): a
-- net.http_post with ONLY Content-Type + X-Internal-Cron sourced from
-- vault.decrypted_secrets['LIT_CRON_SECRET']. NO Authorization/apikey header —
-- harvey-controller is deployed with verify_jwt=false (listed in
-- supabase/functions/.verify-jwt-manifest.json → deploy passes --no-verify-jwt),
-- so the functions gateway does NOT require a JWT; the fn's own verifyCronAuth
-- (X-Internal-Cron == LIT_CRON_SECRET) is the auth boundary.
--
-- Why not the service-role-bearer pattern some older migrations use: this
-- project's app.settings.service_role_key is NOT set (current_setting returns
-- NULL), and there is no service-role key in the vault — that pattern would
-- authenticate with an empty bearer and silently fail. The X-Internal-Cron +
-- verify_jwt=false pattern is what every WORKING LIT cron actually uses.
--
-- SAFE EVEN IF HARVEY IS OFF: this cron only pings the controller. Harvey's own
-- fail-closed gates still govern whether a tick does anything —
--   1. lit_feature_flags['harvey_internal_agent'] must exist with global_kill=false
--   2. lit_agent_config['harvey'].enabled must be true
--   3. config.sending.paused / quiet-hours skip the run
--   plus every worker re-checks the same gates + dryRun/testMode itself. A missing
--   flag/config, killed flag, paused agent, or quiet hours all make the tick a
--   recorded no-op. Nothing sends until the owner turns Harvey on.
--
-- IDEMPOTENT: unschedules any prior 'harvey-controller-heartbeat' before
-- (re)scheduling, so re-applying is a no-op net change.
-- ============================================================================

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule('harvey-controller-heartbeat')
      where exists (select 1 from cron.job where jobname = 'harvey-controller-heartbeat');

    perform cron.schedule(
      'harvey-controller-heartbeat',
      '*/10 * * * *',
      $cron$
      select net.http_post(
        url := 'https://jkmrfiaefxwgbvftohrb.supabase.co/functions/v1/harvey-controller',
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
