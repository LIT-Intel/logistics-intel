-- Growth Sprint DATA foundation 6/8: Admin Growth-tab sprint status RPC.
-- Platform-admin gated. Reports pace/projection for the ACTIVE growth goal.
CREATE OR REPLACE FUNCTION public.lit_admin_growth_sprint_status()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  g              RECORD;
  v_now          timestamptz := now();
  v_days_total   numeric;
  v_days_elapsed numeric;
  v_days_remain  numeric;
  v_current      integer := 0;
  v_target       integer;
  v_remaining    integer;
  v_req_per_day  numeric := 0;
  v_act_per_day  numeric := 0;
  v_projected    integer := 0;
  v_pct          numeric := 0;
BEGIN
  IF NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT * INTO g
    FROM public.lit_growth_goals
   WHERE active = true
   ORDER BY start_at DESC
   LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'name', NULL, 'metric', NULL, 'target', 0,
      'start_at', NULL, 'end_at', NULL,
      'days_total', 0, 'days_elapsed', 0, 'days_remaining', 0,
      'current', 0, 'pct_complete', 0,
      'required_per_day', 0, 'actual_per_day', 0, 'projected_final', 0
    );
  END IF;

  v_target := g.target;
  -- Day accounting (whole days; guard against zero).
  v_days_total   := GREATEST(CEIL(EXTRACT(epoch FROM (g.end_at   - g.start_at)) / 86400.0), 1);
  v_days_elapsed := GREATEST(LEAST(CEIL(EXTRACT(epoch FROM (LEAST(v_now, g.end_at) - g.start_at)) / 86400.0), v_days_total), 0);
  v_days_remain  := GREATEST(v_days_total - v_days_elapsed, 0);

  -- 'current' = metric count within [start_at, now()], excluding internal + suspended/banned.
  IF g.metric = 'trial_signup' THEN
    SELECT count(DISTINCT ua.user_id) INTO v_current
      FROM public.lit_user_activation ua
     WHERE COALESCE(ua.trial_started_at, ua.signup_at) >= g.start_at
       AND COALESCE(ua.trial_started_at, ua.signup_at) <= v_now
       AND NOT public.is_internal_user(ua.user_id)
       AND NOT public.is_suspended_or_banned(ua.user_id);
  ELSE
    -- Unknown metric: report zero rather than guess.
    v_current := 0;
  END IF;

  v_remaining   := GREATEST(v_target - v_current, 0);
  v_req_per_day := ROUND(v_remaining::numeric / GREATEST(v_days_remain, 1), 2);
  v_act_per_day := ROUND(v_current::numeric  / GREATEST(v_days_elapsed, 1), 2);
  v_projected   := ROUND(v_act_per_day * v_days_total);
  v_pct         := CASE WHEN v_target > 0 THEN ROUND((v_current::numeric / v_target) * 100, 1) ELSE 0 END;

  RETURN jsonb_build_object(
    'name', g.name,
    'metric', g.metric,
    'target', v_target,
    'start_at', g.start_at,
    'end_at', g.end_at,
    'days_total', v_days_total::int,
    'days_elapsed', v_days_elapsed::int,
    'days_remaining', v_days_remain::int,
    'current', v_current,
    'pct_complete', v_pct,
    'required_per_day', v_req_per_day,
    'actual_per_day', v_act_per_day,
    'projected_final', v_projected
  );
END;
$fn$;

COMMENT ON FUNCTION public.lit_admin_growth_sprint_status() IS
  'Platform-admin-gated status for the ACTIVE lit_growth_goals row: target/current/pace/projection. For metric trial_signup, current = distinct users with trial_started_at (or signup_at fallback) in [start_at, now()], excluding internal + suspended/banned. Returns sane zeros when no active goal.';

REVOKE ALL ON FUNCTION public.lit_admin_growth_sprint_status() FROM public;
GRANT EXECUTE ON FUNCTION public.lit_admin_growth_sprint_status() TO authenticated;
