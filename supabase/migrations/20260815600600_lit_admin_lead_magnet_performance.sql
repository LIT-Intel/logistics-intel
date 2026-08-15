-- Growth Sprint DATA foundation 7/8: Admin lead-magnet acquisition rollup RPC.
-- Platform-admin gated. Per magnet_slug funnel over the last p_days. Revenue is NULL
-- (not fabricated) until a real revenue source is wired in.
CREATE OR REPLACE FUNCTION public.lit_admin_lead_magnet_performance(p_days integer DEFAULT 30)
RETURNS TABLE (
  magnet_slug text,
  sessions    bigint,
  leads       bigint,
  trials      bigint,
  activated   bigint,
  paid        bigint,
  revenue     numeric
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
  WITH bounded AS (
    SELECT s.*
      FROM public.lit_lead_magnet_sessions s
     WHERE s.created_at >= now() - (GREATEST(COALESCE(p_days, 30), 1) || ' days')::interval
       -- Exclude internal + suspended/banned once a session is stitched to a user.
       AND (s.user_id IS NULL OR (
              NOT public.is_internal_user(s.user_id)
          AND NOT public.is_suspended_or_banned(s.user_id)
       ))
  )
  SELECT
    b.magnet_slug,
    count(*)                                                        AS sessions,
    count(*) FILTER (WHERE b.email_captured_at IS NOT NULL)         AS leads,
    count(*) FILTER (WHERE COALESCE(b.trial_started_at, ua.trial_started_at) IS NOT NULL) AS trials,
    count(*) FILTER (WHERE COALESCE(b.first_search_at, ua.first_search_at) IS NOT NULL
                        OR COALESCE(b.first_save_at,   ua.first_save_at)   IS NOT NULL)   AS activated,
    count(*) FILTER (WHERE COALESCE(b.converted_at, ua.converted_paid_at) IS NOT NULL)    AS paid,
    NULL::numeric                                                   AS revenue
  FROM bounded b
  LEFT JOIN public.lit_user_activation ua ON ua.user_id = b.user_id
  WHERE public.is_platform_admin(auth.uid())
  GROUP BY b.magnet_slug
  ORDER BY sessions DESC;
$fn$;

COMMENT ON FUNCTION public.lit_admin_lead_magnet_performance(integer) IS
  'Platform-admin-gated per-magnet_slug funnel over the last p_days: sessions(visitors), leads(email captured), trials, activated(first search/save), paid. Joins lit_lead_magnet_sessions to lit_user_activation; excludes internal + suspended/banned once stitched. revenue is NULL (not fabricated). Zero-safe.';

REVOKE ALL ON FUNCTION public.lit_admin_lead_magnet_performance(integer) FROM public;
GRANT EXECUTE ON FUNCTION public.lit_admin_lead_magnet_performance(integer) TO authenticated;
