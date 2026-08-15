-- Phase 3 Activation & Attribution: 5/5 retention cohorts (signup cohort x weeks-since-signup)
-- p_grain: 'week' (ISO week) or 'month'. Activity = lit_activity_events UNION lit_usage_ledger.
CREATE OR REPLACE FUNCTION public.lit_admin_retention_cohorts(p_grain text DEFAULT 'week')
RETURNS TABLE (
  cohort           date,        -- cohort bucket start (ISO week Monday, or month first day)
  cohort_size      bigint,      -- signups in the cohort
  weeks_since      int,         -- whole weeks since signup
  retained         bigint,      -- distinct users from the cohort active in that week-offset
  retained_pct     numeric      -- retained / cohort_size * 100
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
  WITH base AS (
    SELECT ua.user_id, ua.signup_at,
           CASE WHEN p_grain='month' THEN date_trunc('month', ua.signup_at)
                ELSE date_trunc('week', ua.signup_at) END AS cohort_ts
    FROM public.lit_user_activation ua
    WHERE ua.signup_at IS NOT NULL
      AND public.is_platform_admin(auth.uid())
  ),
  sizes AS (
    SELECT cohort_ts, count(*) AS cohort_size FROM base GROUP BY cohort_ts
  ),
  activity AS (
    SELECT b.user_id, b.cohort_ts,
           floor(EXTRACT(epoch FROM (act.ts - b.signup_at)) / 604800)::int AS weeks_since
    FROM base b
    JOIN LATERAL (
      SELECT a.created_at AS ts FROM lit_activity_events a WHERE a.user_id=b.user_id
      UNION ALL
      SELECT l.created_at FROM lit_usage_ledger l WHERE l.user_id=b.user_id
    ) act ON act.ts >= b.signup_at
  )
  SELECT
    s.cohort_ts::date            AS cohort,
    s.cohort_size,
    a.weeks_since,
    count(DISTINCT a.user_id)     AS retained,
    round(count(DISTINCT a.user_id)::numeric / NULLIF(s.cohort_size,0) * 100, 1) AS retained_pct
  FROM sizes s
  JOIN activity a ON a.cohort_ts = s.cohort_ts
  WHERE a.weeks_since >= 0
  GROUP BY s.cohort_ts, s.cohort_size, a.weeks_since
  ORDER BY s.cohort_ts, a.weeks_since;
$fn$;

COMMENT ON FUNCTION public.lit_admin_retention_cohorts(text) IS
  'Platform-admin-gated retention cohorts. p_grain=''week'' (ISO week Monday) or ''month''. Rows: cohort bucket x weeks_since_signup with distinct retained users and retained_pct. Activity source: lit_activity_events UNION lit_usage_ledger. Week 0 = signup week (always ~100%).';

REVOKE ALL ON FUNCTION public.lit_admin_retention_cohorts(text) FROM public;
GRANT EXECUTE ON FUNCTION public.lit_admin_retention_cohorts(text) TO authenticated;
