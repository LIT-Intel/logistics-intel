-- Phase 3A — Admin dashboard foundation tables.
--
-- Per the design handoff (docs/admin-dashboard-handoff/README.md §6),
-- the panels read from four tables that don't exist yet:
--
--   lit_audit_log        — every admin mutation writes a row here. Read
--                          by the Audit Trail panel. Append-only at the
--                          DB level (no UPDATE/DELETE grants).
--   lit_user_activity    — every meaningful user action (search, save,
--                          enrich, campaign launch, etc.). Read by
--                          "Active · 7 days" KPI and the user profile
--                          drill-down.
--   lit_job_errors       — provider errors (Gmail rate limit, Outlook
--                          Graph 5xx, etc.) surfaced in the Error Log
--                          panel with retry actions.
--   lit_ingestion_runs   — one row per pipeline run (ImportYeti, CBP,
--                          Clay, Apollo, etc.). Read by Ingestion Status.
--
-- All four are additive. No existing schema changes. RLS on. Only
-- admins (verified server-side via the lit.is_admin() helper) can read.

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;

-- ───────────────────────────── helper ─────────────────────────────

-- Cheap is_admin check the policies below use. Falls back to false so
-- non-admin reads always fail closed. Looks at platform_admins for
-- superadmin and the user's org_members role for org admin.
CREATE OR REPLACE FUNCTION public.is_admin_caller()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.platform_admins WHERE user_id = auth.uid()
  ) OR EXISTS (
    SELECT 1 FROM public.org_members
     WHERE user_id = auth.uid() AND role IN ('admin', 'owner', 'superadmin')
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_admin_caller() TO authenticated;

-- ───────────────────────────── lit_audit_log ─────────────────────────────

CREATE TABLE IF NOT EXISTS public.lit_audit_log (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_role     text NOT NULL CHECK (actor_role IN ('superadmin', 'admin', 'user', 'system', 'service')),
  action         text NOT NULL,
  target         text,
  severity       text NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'warn', 'error')),
  source         text NOT NULL DEFAULT 'admin' CHECK (source IN ('admin', 'webhook', 'job', 'sec', 'app', 'system')),
  ip             text,
  user_agent     text,
  metadata       jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lit_audit_log_created_at ON public.lit_audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lit_audit_log_actor      ON public.lit_audit_log (actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lit_audit_log_severity   ON public.lit_audit_log (severity, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lit_audit_log_source     ON public.lit_audit_log (source, created_at DESC);

ALTER TABLE public.lit_audit_log ENABLE ROW LEVEL SECURITY;

-- Admins read; nobody writes through this policy (the audit helper
-- below runs as security definer and bypasses RLS for inserts).
DROP POLICY IF EXISTS lit_audit_log_admin_read ON public.lit_audit_log;
CREATE POLICY lit_audit_log_admin_read
  ON public.lit_audit_log FOR SELECT TO authenticated
  USING (public.is_admin_caller());

GRANT SELECT ON public.lit_audit_log TO authenticated;

-- ───────────────────────────── audit helper ─────────────────────────────

-- Shared helper every server-side mutation calls. Bypasses RLS via
-- SECURITY DEFINER so callers don't need elevated grants on the table.
CREATE OR REPLACE FUNCTION public.lit_audit_write(
  p_actor_id   uuid,
  p_actor_role text,
  p_action     text,
  p_target     text,
  p_severity   text DEFAULT 'info',
  p_source     text DEFAULT 'admin',
  p_metadata   jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.lit_audit_log (actor_id, actor_role, action, target, severity, source, metadata)
  VALUES (p_actor_id, p_actor_role, p_action, p_target, p_severity, p_source, p_metadata)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.lit_audit_write(uuid, text, text, text, text, text, jsonb) TO authenticated, service_role;

-- ───────────────────────────── lit_user_activity ─────────────────────────────

CREATE TABLE IF NOT EXISTS public.lit_user_activity (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type  text NOT NULL,
  page_path   text,
  metadata    jsonb NOT NULL DEFAULT '{}'::jsonb,
  ts          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lit_user_activity_user_ts  ON public.lit_user_activity (user_id, ts DESC);
CREATE INDEX IF NOT EXISTS idx_lit_user_activity_event_ts ON public.lit_user_activity (event_type, ts DESC);
CREATE INDEX IF NOT EXISTS idx_lit_user_activity_ts       ON public.lit_user_activity (ts DESC);

ALTER TABLE public.lit_user_activity ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lit_user_activity_self_read ON public.lit_user_activity;
CREATE POLICY lit_user_activity_self_read
  ON public.lit_user_activity FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin_caller());

DROP POLICY IF EXISTS lit_user_activity_self_insert ON public.lit_user_activity;
CREATE POLICY lit_user_activity_self_insert
  ON public.lit_user_activity FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

GRANT SELECT, INSERT ON public.lit_user_activity TO authenticated;

-- ───────────────────────────── lit_job_errors ─────────────────────────────

CREATE TABLE IF NOT EXISTS public.lit_job_errors (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider       text NOT NULL,
  code           text NOT NULL,
  message        text,
  campaign_id    uuid REFERENCES public.lit_campaigns(id) ON DELETE SET NULL,
  recipient_id   uuid REFERENCES public.lit_campaign_contacts(id) ON DELETE SET NULL,
  attempts       int NOT NULL DEFAULT 1,
  resolved       boolean NOT NULL DEFAULT false,
  resolved_at    timestamptz,
  resolved_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  metadata       jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lit_job_errors_unresolved ON public.lit_job_errors (resolved, created_at DESC) WHERE resolved = false;
CREATE INDEX IF NOT EXISTS idx_lit_job_errors_provider   ON public.lit_job_errors (provider, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lit_job_errors_campaign   ON public.lit_job_errors (campaign_id, created_at DESC);

ALTER TABLE public.lit_job_errors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lit_job_errors_admin_all ON public.lit_job_errors;
CREATE POLICY lit_job_errors_admin_all
  ON public.lit_job_errors FOR ALL TO authenticated
  USING (public.is_admin_caller())
  WITH CHECK (public.is_admin_caller());

GRANT SELECT, INSERT, UPDATE ON public.lit_job_errors TO authenticated;

-- ───────────────────────────── lit_ingestion_runs ─────────────────────────────

CREATE TABLE IF NOT EXISTS public.lit_ingestion_runs (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_name  text NOT NULL,
  status         text NOT NULL DEFAULT 'ok' CHECK (status IN ('ok', 'warning', 'stale', 'fail', 'running')),
  records_label  text,
  records_count  bigint,
  delta_pct      numeric(8, 2),
  last_run_at    timestamptz,
  next_run_at    timestamptz,
  note           text,
  error_message  text,
  metadata       jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (pipeline_name)
);

CREATE INDEX IF NOT EXISTS idx_lit_ingestion_runs_last_run ON public.lit_ingestion_runs (last_run_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_lit_ingestion_runs_status   ON public.lit_ingestion_runs (status, last_run_at DESC);

ALTER TABLE public.lit_ingestion_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lit_ingestion_runs_admin_all ON public.lit_ingestion_runs;
CREATE POLICY lit_ingestion_runs_admin_all
  ON public.lit_ingestion_runs FOR ALL TO authenticated
  USING (public.is_admin_caller())
  WITH CHECK (public.is_admin_caller());

GRANT SELECT, INSERT, UPDATE ON public.lit_ingestion_runs TO authenticated;

-- ───────────────────────────── seed ingestion pipelines ─────────────────────────────

-- One row per pipeline we monitor. Status starts as 'stale' so the
-- panel renders the "no recent run" state until each pipeline reports
-- in. The status / records / last_run_at columns get UPDATEd by the
-- pipeline cron jobs as they ship.
INSERT INTO public.lit_ingestion_runs (pipeline_name, status, note, last_run_at)
VALUES
  ('ImportYeti · BOL feed',        'stale', 'awaiting first run', null),
  ('US Customs · 30d rolling',     'stale', 'awaiting first run', null),
  ('Clay enrichment · companies',  'stale', 'awaiting first run', null),
  ('Apollo enrichment · contacts', 'stale', 'awaiting first run', null),
  ('Shipment snapshots · weekly',  'stale', 'awaiting first run', null),
  ('Carrier lane index',           'stale', 'awaiting first run', null),
  ('OpenCorporates · entity link', 'stale', 'awaiting first run', null)
ON CONFLICT (pipeline_name) DO NOTHING;

-- ───────────────────────────── touch-updated_at trigger ─────────────────────────────

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lit_job_errors_touch ON public.lit_job_errors;
CREATE TRIGGER trg_lit_job_errors_touch
BEFORE UPDATE ON public.lit_job_errors
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_lit_ingestion_runs_touch ON public.lit_ingestion_runs;
CREATE TRIGGER trg_lit_ingestion_runs_touch
BEFORE UPDATE ON public.lit_ingestion_runs
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
