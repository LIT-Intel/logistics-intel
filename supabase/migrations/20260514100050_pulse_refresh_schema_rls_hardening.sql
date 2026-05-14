-- Pulse refresh schema — RLS hardening follow-up (spec 2026-05-14)
--
-- Two additive fixes on top of 20260514100000_pulse_refresh_schema.sql:
--   1. Enable RLS on lit_saved_company_refresh_runs (was missing) +
--      admin-only SELECT policy via public.is_admin_caller().
--   2. Add explicit service_role FOR ALL policies on the 4 new tables
--      to match house style (see 20260511000000_pulse_search_intelligence_tables.sql).
--
-- service_role bypasses RLS by default, but we keep these policies
-- explicit so RLS posture is readable from pg_policy alone.

BEGIN;

-- 1. RLS gap fix on telemetry table.
ALTER TABLE public.lit_saved_company_refresh_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lit_saved_company_refresh_runs_admin_read
  ON public.lit_saved_company_refresh_runs;
CREATE POLICY lit_saved_company_refresh_runs_admin_read
  ON public.lit_saved_company_refresh_runs
  FOR SELECT TO authenticated
  USING (public.is_admin_caller());

-- 2. Explicit service_role FOR ALL policies on all 4 new tables.
DROP POLICY IF EXISTS lit_pulse_alerts_service_all ON public.lit_pulse_alerts;
CREATE POLICY lit_pulse_alerts_service_all ON public.lit_pulse_alerts
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS lit_user_alert_prefs_service_all ON public.lit_user_alert_prefs;
CREATE POLICY lit_user_alert_prefs_service_all ON public.lit_user_alert_prefs
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS lit_benchmark_rates_service_all ON public.lit_benchmark_rates;
CREATE POLICY lit_benchmark_rates_service_all ON public.lit_benchmark_rates
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS lit_saved_company_refresh_runs_service_all
  ON public.lit_saved_company_refresh_runs;
CREATE POLICY lit_saved_company_refresh_runs_service_all
  ON public.lit_saved_company_refresh_runs
  FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMIT;
