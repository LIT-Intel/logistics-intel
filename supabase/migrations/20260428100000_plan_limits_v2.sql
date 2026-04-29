/*
  # Plan limits v2 — beta-test hardening

  Builds on 20260427100000_usage_enforcement.sql:

  1) Bumps free_trial save_limit from 5 to 10 (decision: 2026-04-28).
  2) Adds is_platform_admin(uuid) helper that reads from platform_admins.
  3) Wraps check_usage_limit with a server-side admin bypass that flips ok=true
     and adds admin_bypass=true to the response. Bypass is enforced inside
     the canonical gate, NOT in the UI — so any edge function that gates
     correctly automatically respects admin overrides.

  Idempotent: safe to run multiple times.
*/

-- ============================================================================
-- 1. Bump free_trial saved-company limit 5 -> 10
-- ============================================================================

UPDATE plans
   SET save_limit = 10,
       updated_at = now()
 WHERE code = 'free_trial';

-- ============================================================================
-- 2. is_platform_admin helper
-- ============================================================================

CREATE OR REPLACE FUNCTION public.is_platform_admin(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM platform_admins WHERE user_id = p_user_id
  );
$$;

REVOKE ALL ON FUNCTION public.is_platform_admin(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_platform_admin(uuid) TO service_role, authenticated;

-- ============================================================================
-- 3. check_usage_limit with admin bypass
--
--    If the caller is a platform admin, return ok=true with admin_bypass=true
--    and a still-honest used/limit snapshot for telemetry. Edge functions then
--    proceed with the action and consume_usage normally — admin actions still
--    show up in the ledger so we can audit.
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
  v_is_admin    boolean := false;
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

  -- Compute used count first so admin bypass response still carries truth.
  IF v_limit IS NOT NULL AND v_kind = 'monthly' THEN
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
  ELSIF v_limit IS NOT NULL AND v_kind = 'total' AND p_feature_key = 'saved_company' THEN
    SELECT count(*)::integer INTO v_used
      FROM lit_saved_companies
     WHERE user_id = p_user_id;
  END IF;

  -- Admin bypass: only platform_admins (table-driven, not org role).
  -- Bypass is logged in the response; consume_usage still records the action.
  IF p_user_id IS NOT NULL AND public.is_platform_admin(p_user_id) THEN
    v_is_admin := true;
  END IF;

  IF v_is_admin THEN
    RETURN jsonb_build_object(
      'ok', true,
      'admin_bypass', true,
      'feature', p_feature_key,
      'used', v_used,
      'limit', v_limit,
      'plan', v_plan_code,
      'reset_at', CASE WHEN v_kind = 'monthly' THEN v_period_end ELSE NULL END
    );
  END IF;

  -- Unlimited (NULL limit) for non-admin
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

  -- Standard quota check
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
      'upgrade_required', true,
      'message', format(
        '%s plan includes %s %s. Upgrade to continue.',
        initcap(v_plan_code), v_limit, replace(p_feature_key, '_', ' ')
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

-- Permissions (re-grant after CREATE OR REPLACE)
REVOKE ALL ON FUNCTION public.check_usage_limit(uuid, uuid, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_usage_limit(uuid, uuid, text, integer) TO service_role;
