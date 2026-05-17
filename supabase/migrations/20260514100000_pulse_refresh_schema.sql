-- Pulse refresh + alert digest + benchmark schema (spec 2026-05-14)
-- Adds 4 new tables, 4 column adds, RLS policies, indexes.

BEGIN;

-- Per-user × per-company × per-alert-type delta row.
CREATE TABLE IF NOT EXISTS public.lit_pulse_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_company_key text,
  alert_type text NOT NULL CHECK (alert_type IN ('volume','shipment','lane','benchmark','baseline')),
  severity text NOT NULL DEFAULT 'info' CHECK (severity IN ('info','warning','high')),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  digest_sent_at timestamptz,
  dismissed_at timestamptz,
  digest_send_attempts int NOT NULL DEFAULT 0,
  digest_last_error text
);

CREATE INDEX IF NOT EXISTS lit_pulse_alerts_user_pending_idx
  ON public.lit_pulse_alerts (user_id, digest_sent_at)
  WHERE digest_sent_at IS NULL;

CREATE INDEX IF NOT EXISTS lit_pulse_alerts_recent_idx
  ON public.lit_pulse_alerts (created_at DESC);

ALTER TABLE public.lit_pulse_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lit_pulse_alerts_self_read ON public.lit_pulse_alerts;
CREATE POLICY lit_pulse_alerts_self_read ON public.lit_pulse_alerts
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS lit_pulse_alerts_self_update ON public.lit_pulse_alerts;
CREATE POLICY lit_pulse_alerts_self_update ON public.lit_pulse_alerts
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Per-user alert preferences (toggles + pause + unsubscribe token).
CREATE TABLE IF NOT EXISTS public.lit_user_alert_prefs (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  volume_alerts boolean NOT NULL DEFAULT true,
  shipment_alerts boolean NOT NULL DEFAULT true,
  lane_alerts boolean NOT NULL DEFAULT true,
  benchmark_alerts boolean NOT NULL DEFAULT false,
  paused_until timestamptz,
  unsubscribe_token text UNIQUE,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.lit_user_alert_prefs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lit_user_alert_prefs_self ON public.lit_user_alert_prefs;
CREATE POLICY lit_user_alert_prefs_self ON public.lit_user_alert_prefs
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Freightos FBX rates by week × lane × mode.
CREATE TABLE IF NOT EXISTS public.lit_benchmark_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  week_of date NOT NULL,
  lane text NOT NULL,
  lane_code text NOT NULL,
  mode text NOT NULL DEFAULT 'FCL_40HC',
  rate_usd numeric(10,2) NOT NULL CHECK (rate_usd > 0),
  volatility_pct numeric(5,2),
  source_url text NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  parse_confidence numeric(3,2) NOT NULL DEFAULT 1.0,
  CONSTRAINT lit_benchmark_rates_unique UNIQUE (week_of, lane_code, mode)
);

CREATE INDEX IF NOT EXISTS lit_benchmark_rates_recent_idx
  ON public.lit_benchmark_rates (lane_code, week_of DESC);

ALTER TABLE public.lit_benchmark_rates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lit_benchmark_rates_read ON public.lit_benchmark_rates;
CREATE POLICY lit_benchmark_rates_read ON public.lit_benchmark_rates
  FOR SELECT TO authenticated
  USING (true);

-- Per-tick telemetry.
CREATE TABLE IF NOT EXISTS public.lit_saved_company_refresh_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  processed_count int NOT NULL DEFAULT 0,
  alert_count int NOT NULL DEFAULT 0,
  error_count int NOT NULL DEFAULT 0,
  importyeti_credits_used int NOT NULL DEFAULT 0,
  notes text
);

CREATE INDEX IF NOT EXISTS lit_saved_company_refresh_runs_recent_idx
  ON public.lit_saved_company_refresh_runs (started_at DESC);

-- Add diff baseline column to existing snapshot table.
ALTER TABLE public.lit_importyeti_company_snapshot
  ADD COLUMN IF NOT EXISTS previous_parsed_summary jsonb;

-- Add refresh status columns to lit_saved_companies.
ALTER TABLE public.lit_saved_companies
  ADD COLUMN IF NOT EXISTS refresh_status text NOT NULL DEFAULT 'active'
    CHECK (refresh_status IN ('active','untrackable','paused'));

ALTER TABLE public.lit_saved_companies
  ADD COLUMN IF NOT EXISTS refresh_status_updated_at timestamptz;

ALTER TABLE public.lit_saved_companies
  ADD COLUMN IF NOT EXISTS consecutive_refresh_failures int NOT NULL DEFAULT 0;

COMMIT;
