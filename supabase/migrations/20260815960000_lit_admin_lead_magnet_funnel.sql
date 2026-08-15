-- Per-magnet FUNNEL STEPS for the admin Growth tab. Platform-admin gated;
-- excludes internal + suspended/banned identities. Zero-safe (missing steps
-- render 0). Powers "add these funnel steps inside the admin panel."
--
-- Step counts are derived from two sources and combined:
--   * lit_lead_magnet_events (distinct anonymous_id, fallback session_id) for the
--     early client-instrumented steps: viewed, started, submitted, result_viewed,
--     trial_cta_clicked, and the lead_captured event.
--   * lit_lead_magnet_sessions timestamps + lit_user_activation join for the
--     server-truth late steps: lead_captured (email_captured_at), signup,
--     trial_started, activated (first_search OR first_save), paid.
CREATE OR REPLACE FUNCTION public.lit_admin_lead_magnet_funnel(p_days integer DEFAULT 30)
RETURNS TABLE (
  magnet_slug        text,
  viewed             bigint,
  started            bigint,
  submitted          bigint,
  lead_captured      bigint,
  result_viewed      bigint,
  trial_cta_clicked  bigint,
  signup             bigint,
  trial_started      bigint,
  activated          bigint,
  paid               bigint
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
  WITH win AS (
    SELECT (now() - (GREATEST(COALESCE(p_days, 30), 1) || ' days')::interval) AS since
  ),
  -- Sessions in-window, excluding internal + suspended/banned (anon sessions kept).
  bounded AS (
    SELECT s.*
      FROM public.lit_lead_magnet_sessions s, win
     WHERE s.created_at >= win.since
       AND (s.user_id IS NULL OR (
              NOT public.is_internal_user(s.user_id)
          AND NOT public.is_suspended_or_banned(s.user_id)
       ))
       AND (s.converted_user_id IS NULL OR (
              NOT public.is_internal_user(s.converted_user_id)
          AND NOT public.is_suspended_or_banned(s.converted_user_id)
       ))
  ),
  -- Event-derived step counts: distinct anonymous_id (fallback session_id) per event.
  ev AS (
    SELECT e.magnet_slug,
           e.event_name,
           count(DISTINCT COALESCE(e.anonymous_id, e.session_id::text)) AS n
      FROM public.lit_lead_magnet_events e, win
     WHERE e.created_at >= win.since
       AND (e.user_id IS NULL OR (
              NOT public.is_internal_user(e.user_id)
          AND NOT public.is_suspended_or_banned(e.user_id)
       ))
     GROUP BY e.magnet_slug, e.event_name
  ),
  ev_pivot AS (
    SELECT magnet_slug,
           COALESCE(SUM(n) FILTER (WHERE event_name = 'lead_magnet_viewed'), 0)     AS viewed,
           COALESCE(SUM(n) FILTER (WHERE event_name = 'lead_magnet_started'), 0)    AS started,
           COALESCE(SUM(n) FILTER (WHERE event_name = 'lead_magnet_submitted'), 0)  AS submitted,
           COALESCE(SUM(n) FILTER (WHERE event_name = 'lead_captured'), 0)          AS lead_captured_ev,
           COALESCE(SUM(n) FILTER (WHERE event_name = 'lead_result_viewed'), 0)     AS result_viewed,
           COALESCE(SUM(n) FILTER (WHERE event_name = 'lead_trial_cta_clicked'), 0) AS trial_cta_clicked
      FROM ev
     GROUP BY magnet_slug
  ),
  -- Session/activation-derived step counts (source of truth for late funnel).
  sess AS (
    SELECT b.magnet_slug,
           count(*) FILTER (WHERE b.email_captured_at IS NOT NULL)                               AS lead_captured_sess,
           count(*) FILTER (WHERE COALESCE(b.signup_at, ua.signup_at) IS NOT NULL)               AS signup,
           count(*) FILTER (WHERE COALESCE(b.trial_started_at, ua.trial_started_at) IS NOT NULL) AS trial_started,
           count(*) FILTER (WHERE COALESCE(b.first_search_at, ua.first_search_at) IS NOT NULL
                               OR COALESCE(b.first_save_at,   ua.first_save_at)   IS NOT NULL)   AS activated,
           count(*) FILTER (WHERE COALESCE(b.converted_at, ua.converted_paid_at) IS NOT NULL)    AS paid
      FROM bounded b
      LEFT JOIN public.lit_user_activation ua
        ON ua.user_id = COALESCE(b.converted_user_id, b.user_id)
     GROUP BY b.magnet_slug
  ),
  slugs AS (
    SELECT magnet_slug FROM sess
    UNION
    SELECT magnet_slug FROM ev_pivot
  )
  SELECT
    sl.magnet_slug,
    COALESCE(ep.viewed, 0)                                        AS viewed,
    COALESCE(ep.started, 0)                                       AS started,
    COALESCE(ep.submitted, 0)                                     AS submitted,
    -- Prefer session email_captured truth; fall back to the lead_captured event.
    GREATEST(COALESCE(se.lead_captured_sess, 0), COALESCE(ep.lead_captured_ev, 0)) AS lead_captured,
    COALESCE(ep.result_viewed, 0)                                 AS result_viewed,
    COALESCE(ep.trial_cta_clicked, 0)                             AS trial_cta_clicked,
    COALESCE(se.signup, 0)                                        AS signup,
    COALESCE(se.trial_started, 0)                                 AS trial_started,
    COALESCE(se.activated, 0)                                     AS activated,
    COALESCE(se.paid, 0)                                          AS paid
  FROM slugs sl
  LEFT JOIN ev_pivot ep ON ep.magnet_slug = sl.magnet_slug
  LEFT JOIN sess se     ON se.magnet_slug = sl.magnet_slug
  WHERE public.is_platform_admin(auth.uid())
  ORDER BY viewed DESC, lead_captured DESC, sl.magnet_slug;
$fn$;

COMMENT ON FUNCTION public.lit_admin_lead_magnet_funnel(integer) IS
  'Platform-admin-gated per-magnet_slug funnel-step counts over the last p_days: viewed, started, submitted, lead_captured, result_viewed, trial_cta_clicked, signup, trial_started, activated(first search/save), paid. Early steps from lit_lead_magnet_events (distinct anonymous_id/session); late steps from lit_lead_magnet_sessions + lit_user_activation. Excludes internal + suspended/banned. Zero-safe.';

REVOKE ALL ON FUNCTION public.lit_admin_lead_magnet_funnel(integer) FROM public;
GRANT EXECUTE ON FUNCTION public.lit_admin_lead_magnet_funnel(integer) TO authenticated;
