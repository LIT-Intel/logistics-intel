/*
  # Usage Enforcement (additive, idempotent)

  1) Adds the canonical usage ledger (lit_usage_ledger).
  2) Widens `plans` with the missing per-month quotas
     (exports_per_month, pulse_briefs_per_month, campaign_sends_per_month)
     and a market_benchmark_enabled boolean.
  3) Aligns plan rows + plan_entitlements to the new launch policy:
       free_trial: 10 searches, 5 saves total, 0 enrichment, 0 pulse,
                   0 exports, 0 campaigns, market_benchmark off
       starter:   250 searches, 50 enrichment, 25 pulse, 10 exports,
                  0 campaigns, market_benchmark off
       growth:    1000 searches, 200 enrichment, 100 pulse, 50 exports,
                  1000 campaigns, market_benchmark off
       enterprise: NULL (unlimited) for all numeric, market_benchmark on
  4) Creates two SECURITY DEFINER RPCs:
       check_usage_limit(p_org_id, p_user_id, p_feature_key)
       consume_usage(p_org_id, p_user_id, p_feature_key, p_quantity, p_metadata)

  All edge-function gates call these two RPCs. Service-role only for
  ledger writes; users can read their own rows.
*/

-- ============================================================================
-- 1. lit_usage_ledger
-- ============================================================================

CREATE TABLE IF NOT EXISTS lit_usage_ledger (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid,
  user_id       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  feature_key   text NOT NULL,
  action_key    text NOT NULL DEFAULT 'consume',
  quantity      integer NOT NULL DEFAULT 1,
  period_start  timestamptz,
  period_end    timestamptz,
  metadata      jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lit_usage_ledger_org_feature_created
  ON lit_usage_ledger (org_id, feature_key, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lit_usage_ledger_user_feature_created
  ON lit_usage_ledger (user_id, feature_key, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lit_usage_ledger_feature_period
  ON lit_usage_ledger (feature_key, period_start, period_end);

ALTER TABLE lit_usage_ledger ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='lit_usage_ledger'
      AND policyname='Users can view their own usage'
  ) THEN
    CREATE POLICY "Users can view their own usage"
      ON lit_usage_ledger FOR SELECT TO authenticated
      USING (user_id = auth.uid());
  END IF;
  -- Writes: service-role only (no policy = denied for authenticated).
END $$;

-- ============================================================================
-- 2. Plan column widening
-- ============================================================================

ALTER TABLE plans
  ADD COLUMN IF NOT EXISTS exports_per_month         integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pulse_briefs_per_month    integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS campaign_sends_per_month  integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS market_benchmark_enabled  boolean NOT NULL DEFAULT false;

-- Allow NULL for unlimited (Enterprise). The DEFAULT 0 above only applies
-- to existing rows on column add; unset paid plans keep 0 until updated
-- below.
ALTER TABLE plans ALTER COLUMN exports_per_month        DROP NOT NULL;
ALTER TABLE plans ALTER COLUMN pulse_briefs_per_month   DROP NOT NULL;
ALTER TABLE plans ALTER COLUMN campaign_sends_per_month DROP NOT NULL;
ALTER TABLE plans ALTER COLUMN search_limit             DROP NOT NULL;
ALTER TABLE plans ALTER COLUMN save_limit               DROP NOT NULL;
ALTER TABLE plans ALTER COLUMN enrichment_limit         DROP NOT NULL;
ALTER TABLE plans ALTER COLUMN ai_brief_limit           DROP NOT NULL;

-- ============================================================================
-- 3. Plan policy alignment (launch values)
-- ============================================================================

-- Free trial: 10 searches, 5 total saves, 0 everything else
UPDATE plans SET
  search_limit             = 10,
  save_limit               = 5,
  enrichment_limit         = 0,
  ai_brief_limit           = 0,
  pulse_briefs_per_month   = 0,
  exports_per_month        = 0,
  campaign_sends_per_month = 0,
  market_benchmark_enabled = false,
  enrichment_enabled       = false,
  campaigns_enabled        = false,
  updated_at               = now()
WHERE code = 'free_trial';

-- Starter: per Q5 defaults
UPDATE plans SET
  search_limit             = 250,
  enrichment_limit         = 50,
  pulse_briefs_per_month   = 25,
  exports_per_month        = 10,
  campaign_sends_per_month = 0,
  market_benchmark_enabled = false,
  enrichment_enabled       = true,
  updated_at               = now()
WHERE code = 'starter';

-- Growth: per Q5 defaults
UPDATE plans SET
  search_limit             = 1000,
  enrichment_limit         = 200,
  pulse_briefs_per_month   = 100,
  exports_per_month        = 50,
  campaign_sends_per_month = 1000,
  market_benchmark_enabled = false,
  enrichment_enabled       = true,
  campaigns_enabled        = true,
  updated_at               = now()
WHERE code = 'growth';

-- Enterprise: NULL == unlimited
UPDATE plans SET
  search_limit             = NULL,
  save_limit               = NULL,
  enrichment_limit         = NULL,
  ai_brief_limit           = NULL,
  pulse_briefs_per_month   = NULL,
  exports_per_month        = NULL,
  campaign_sends_per_month = NULL,
  market_benchmark_enabled = true,
  enrichment_enabled       = true,
  campaigns_enabled        = true,
  updated_at               = now()
WHERE code = 'enterprise';

-- Free trial entitlements: lock contact_enrichment_access to match limit=0
UPDATE plan_entitlements pe SET enabled = false
  FROM plans p
 WHERE pe.plan_id = p.id
   AND p.code = 'free_trial'
   AND pe.feature_key = 'contact_enrichment_access';

-- ============================================================================
-- 4. Helper: resolve a user's effective plan_code
--
--    user_id first; fallback org_id; fallback 'free_trial'.
--    Active subscription preferred; ignores canceled/past_due.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.resolve_plan_code(
  p_org_id uuid,
  p_user_id uuid
)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT plan_code FROM subscriptions
       WHERE user_id = p_user_id
         AND COALESCE(status, 'active') IN ('active','trialing','incomplete','past_due')
       ORDER BY (status = 'active') DESC, started_at DESC NULLS LAST, created_at DESC
       LIMIT 1
    ),
    (
      SELECT plan_code FROM subscriptions
       WHERE p_org_id IS NOT NULL AND organization_id = p_org_id
         AND COALESCE(status, 'active') IN ('active','trialing','incomplete','past_due')
       ORDER BY (status = 'active') DESC, started_at DESC NULLS LAST, created_at DESC
       LIMIT 1
    ),
    'free_trial'
  );
$$;

-- ============================================================================
-- 5. Feature -> { quota_column, kind } mapping (built into the RPC).
--
--    Returns the active limit for a feature against a plan. NULL = unlimited.
--    'kind' is one of 'monthly' (count from ledger this calendar month) or
--    'total' (count actual rows — currently only saved_company).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.resolve_feature_limit(
  p_plan_code text,
  p_feature_key text
)
RETURNS TABLE (limit_value integer, kind text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan plans%ROWTYPE;
BEGIN
  SELECT * INTO v_plan FROM plans WHERE code = p_plan_code LIMIT 1;
  IF NOT FOUND THEN
    SELECT * INTO v_plan FROM plans WHERE code = 'free_trial' LIMIT 1;
  END IF;

  CASE p_feature_key
    WHEN 'company_search'      THEN limit_value := v_plan.search_limit;             kind := 'monthly';
    WHEN 'company_profile_view'THEN limit_value := v_plan.search_limit;             kind := 'monthly';
    WHEN 'saved_company'       THEN limit_value := v_plan.save_limit;               kind := 'total';
    WHEN 'contact_enrichment'  THEN limit_value := v_plan.enrichment_limit;         kind := 'monthly';
    WHEN 'pulse_brief'         THEN limit_value := v_plan.pulse_briefs_per_month;   kind := 'monthly';
    WHEN 'export_pdf'          THEN limit_value := v_plan.exports_per_month;        kind := 'monthly';
    WHEN 'campaign_send'       THEN limit_value := v_plan.campaign_sends_per_month; kind := 'monthly';
    WHEN 'ai_brief'            THEN limit_value := v_plan.ai_brief_limit;           kind := 'monthly';
    ELSE
      limit_value := NULL;
      kind := 'unknown';
  END CASE;
  RETURN NEXT;
END;
$$;

-- ============================================================================
-- 6. check_usage_limit (read-only)
--
--    Returns the LIMIT_EXCEEDED-shaped JSONB contract:
--      { ok, code?, feature, used, limit, plan, reset_at, upgrade_url? }
--    No side effects. Edge functions call this BEFORE doing the work.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.check_usage_limit(
  p_org_id uuid,
  p_user_id uuid,
  p_feature_key text,
  p_quantity integer DEFAULT 1
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan_code   text;
  v_limit       integer;
  v_kind        text;
  v_used        integer := 0;
  v_period_start timestamptz;
  v_period_end   timestamptz;
BEGIN
  v_plan_code := public.resolve_plan_code(p_org_id, p_user_id);
  SELECT limit_value, kind INTO v_limit, v_kind
    FROM public.resolve_feature_limit(v_plan_code, p_feature_key);

  IF v_kind = 'unknown' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'UNKNOWN_FEATURE',
      'feature', p_feature_key,
      'plan', v_plan_code,
      'message', format('Unknown feature key: %s', p_feature_key)
    );
  END IF;

  -- Unlimited
  IF v_limit IS NULL THEN
    RETURN jsonb_build_object(
      'ok', true,
      'feature', p_feature_key,
      'used', NULL,
      'limit', NULL,
      'plan', v_plan_code,
      'reset_at', NULL
    );
  END IF;

  IF v_kind = 'monthly' THEN
    v_period_start := date_trunc('month', now());
    v_period_end   := v_period_start + INTERVAL '1 month';
    SELECT COALESCE(SUM(quantity), 0)::integer INTO v_used
      FROM lit_usage_ledger
     WHERE feature_key = p_feature_key
       AND created_at >= v_period_start
       AND created_at < v_period_end
       AND (
         (p_org_id IS NOT NULL AND org_id = p_org_id)
         OR (p_user_id IS NOT NULL AND user_id = p_user_id)
       );
  ELSIF v_kind = 'total' THEN
    -- Only saved_company today.
    IF p_feature_key = 'saved_company' THEN
      SELECT count(*)::integer INTO v_used
        FROM lit_saved_companies
       WHERE user_id = p_user_id;
    ELSE
      v_used := 0;
    END IF;
  END IF;

  IF (v_used + p_quantity) > v_limit THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'LIMIT_EXCEEDED',
      'feature', p_feature_key,
      'used', v_used,
      'limit', v_limit,
      'plan', v_plan_code,
      'reset_at', CASE WHEN v_kind = 'monthly' THEN v_period_end ELSE NULL END,
      'upgrade_url', '/app/billing',
      'message', format(
        '%s plan includes %s %s. Upgrade to continue.',
        initcap(v_plan_code), v_limit, p_feature_key
      )
    );
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'feature', p_feature_key,
    'used', v_used,
    'limit', v_limit,
    'plan', v_plan_code,
    'reset_at', CASE WHEN v_kind = 'monthly' THEN v_period_end ELSE NULL END
  );
END;
$$;

-- ============================================================================
-- 7. consume_usage (insert ledger row after action success)
--
--    For 'total' features (saved_company), this is a no-op: the inserted
--    domain row IS the consumption.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.consume_usage(
  p_org_id uuid,
  p_user_id uuid,
  p_feature_key text,
  p_quantity integer DEFAULT 1,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan_code text;
  v_limit     integer;
  v_kind      text;
  v_period_start timestamptz;
  v_period_end   timestamptz;
BEGIN
  v_plan_code := public.resolve_plan_code(p_org_id, p_user_id);
  SELECT limit_value, kind INTO v_limit, v_kind
    FROM public.resolve_feature_limit(v_plan_code, p_feature_key);

  IF v_kind = 'unknown' THEN
    RAISE EXCEPTION 'Unknown feature key: %', p_feature_key;
  END IF;

  -- Total-mode features: domain row is the consumption. Skip ledger insert.
  IF v_kind = 'total' THEN
    RETURN jsonb_build_object('ok', true, 'feature', p_feature_key, 'mode', 'total');
  END IF;

  -- Monthly mode (or unlimited — still log)
  v_period_start := date_trunc('month', now());
  v_period_end   := v_period_start + INTERVAL '1 month';
  INSERT INTO lit_usage_ledger (
    org_id, user_id, feature_key, action_key, quantity, period_start, period_end, metadata
  ) VALUES (
    p_org_id, p_user_id, p_feature_key, 'consume', p_quantity, v_period_start, v_period_end, COALESCE(p_metadata, '{}'::jsonb)
  );

  RETURN jsonb_build_object(
    'ok', true,
    'feature', p_feature_key,
    'plan', v_plan_code,
    'mode', 'monthly',
    'period_end', v_period_end
  );
END;
$$;

-- ============================================================================
-- 8. get_entitlements (single read for the Billing page + UI gating)
--
--    Returns a snapshot of the user's plan + every feature limit + current
--    used count. NULL limit == unlimited.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_entitlements(
  p_org_id uuid,
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan_code text;
  v_plan      plans%ROWTYPE;
  v_period_start timestamptz := date_trunc('month', now());
  v_period_end   timestamptz := date_trunc('month', now()) + INTERVAL '1 month';
  v_features  jsonb := '{}'::jsonb;
  v_used_search       integer;
  v_used_profile      integer;
  v_used_enrichment   integer;
  v_used_pulse        integer;
  v_used_export       integer;
  v_used_campaign     integer;
  v_used_ai_brief     integer;
  v_used_saves        integer;
BEGIN
  v_plan_code := public.resolve_plan_code(p_org_id, p_user_id);
  SELECT * INTO v_plan FROM plans WHERE code = v_plan_code LIMIT 1;
  IF NOT FOUND THEN
    SELECT * INTO v_plan FROM plans WHERE code = 'free_trial' LIMIT 1;
  END IF;

  -- Boolean feature access (from plan_entitlements)
  SELECT COALESCE(jsonb_object_agg(pe.feature_key, pe.enabled), '{}'::jsonb) INTO v_features
    FROM plan_entitlements pe
   WHERE pe.plan_id = v_plan.id;

  -- Monthly used counts (this calendar month)
  SELECT COALESCE(SUM(quantity), 0)::integer INTO v_used_search
    FROM lit_usage_ledger
   WHERE feature_key='company_search'
     AND created_at >= v_period_start AND created_at < v_period_end
     AND ((p_org_id IS NOT NULL AND org_id=p_org_id) OR (p_user_id IS NOT NULL AND user_id=p_user_id));

  SELECT COALESCE(SUM(quantity), 0)::integer INTO v_used_profile
    FROM lit_usage_ledger
   WHERE feature_key='company_profile_view'
     AND created_at >= v_period_start AND created_at < v_period_end
     AND ((p_org_id IS NOT NULL AND org_id=p_org_id) OR (p_user_id IS NOT NULL AND user_id=p_user_id));

  SELECT COALESCE(SUM(quantity), 0)::integer INTO v_used_enrichment
    FROM lit_usage_ledger
   WHERE feature_key='contact_enrichment'
     AND created_at >= v_period_start AND created_at < v_period_end
     AND ((p_org_id IS NOT NULL AND org_id=p_org_id) OR (p_user_id IS NOT NULL AND user_id=p_user_id));

  SELECT COALESCE(SUM(quantity), 0)::integer INTO v_used_pulse
    FROM lit_usage_ledger
   WHERE feature_key='pulse_brief'
     AND created_at >= v_period_start AND created_at < v_period_end
     AND ((p_org_id IS NOT NULL AND org_id=p_org_id) OR (p_user_id IS NOT NULL AND user_id=p_user_id));

  SELECT COALESCE(SUM(quantity), 0)::integer INTO v_used_export
    FROM lit_usage_ledger
   WHERE feature_key='export_pdf'
     AND created_at >= v_period_start AND created_at < v_period_end
     AND ((p_org_id IS NOT NULL AND org_id=p_org_id) OR (p_user_id IS NOT NULL AND user_id=p_user_id));

  SELECT COALESCE(SUM(quantity), 0)::integer INTO v_used_campaign
    FROM lit_usage_ledger
   WHERE feature_key='campaign_send'
     AND created_at >= v_period_start AND created_at < v_period_end
     AND ((p_org_id IS NOT NULL AND org_id=p_org_id) OR (p_user_id IS NOT NULL AND user_id=p_user_id));

  SELECT COALESCE(SUM(quantity), 0)::integer INTO v_used_ai_brief
    FROM lit_usage_ledger
   WHERE feature_key='ai_brief'
     AND created_at >= v_period_start AND created_at < v_period_end
     AND ((p_org_id IS NOT NULL AND org_id=p_org_id) OR (p_user_id IS NOT NULL AND user_id=p_user_id));

  -- Total saves (count actual rows)
  SELECT count(*)::integer INTO v_used_saves
    FROM lit_saved_companies
   WHERE user_id = p_user_id;

  RETURN jsonb_build_object(
    'plan',       v_plan_code,
    'plan_name',  v_plan.name,
    'reset_at',   v_period_end,
    'market_benchmark_enabled', COALESCE(v_plan.market_benchmark_enabled, false),
    'features',   v_features,
    'limits', jsonb_build_object(
      'company_search',       v_plan.search_limit,
      'company_profile_view', v_plan.search_limit,
      'saved_company',        v_plan.save_limit,
      'contact_enrichment',   v_plan.enrichment_limit,
      'pulse_brief',          v_plan.pulse_briefs_per_month,
      'export_pdf',           v_plan.exports_per_month,
      'campaign_send',        v_plan.campaign_sends_per_month,
      'ai_brief',             v_plan.ai_brief_limit
    ),
    'used', jsonb_build_object(
      'company_search',       v_used_search,
      'company_profile_view', v_used_profile,
      'saved_company',        v_used_saves,
      'contact_enrichment',   v_used_enrichment,
      'pulse_brief',          v_used_pulse,
      'export_pdf',           v_used_export,
      'campaign_send',        v_used_campaign,
      'ai_brief',             v_used_ai_brief
    )
  );
END;
$$;

-- ============================================================================
-- 9. Permissions: callable via service-role + (read-only fns) authenticated.
--    Edge functions use service-role; this grants belt-and-braces.
-- ============================================================================

REVOKE ALL ON FUNCTION public.check_usage_limit(uuid, uuid, text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.consume_usage(uuid, uuid, text, integer, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_entitlements(uuid, uuid)                    FROM PUBLIC;
REVOKE ALL ON FUNCTION public.resolve_plan_code(uuid, uuid)                   FROM PUBLIC;
REVOKE ALL ON FUNCTION public.resolve_feature_limit(text, text)               FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.check_usage_limit(uuid, uuid, text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.consume_usage(uuid, uuid, text, integer, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_entitlements(uuid, uuid)                    TO service_role, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_plan_code(uuid, uuid)                   TO service_role, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_feature_limit(text, text)               TO service_role, authenticated;
