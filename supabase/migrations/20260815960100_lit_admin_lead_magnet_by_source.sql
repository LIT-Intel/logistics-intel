-- Lead-SOURCE rollup for the admin Growth tab: per (magnet_slug, utm_source)
-- so the owner can see WHICH source x WHICH magnet produces leads. Platform-admin
-- gated; excludes internal + suspended/banned. Null/blank utm_source normalizes
-- to 'direct/unknown'. Zero-safe. "track every lead source and magnet."
CREATE OR REPLACE FUNCTION public.lit_admin_lead_magnet_by_source(p_days integer DEFAULT 30)
RETURNS TABLE (
  magnet_slug text,
  utm_source  text,
  sessions    bigint,
  leads       bigint,
  signups     bigint,
  trials      bigint,
  paid        bigint
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
  WITH bounded AS (
    SELECT s.*
      FROM public.lit_lead_magnet_sessions s
     WHERE s.created_at >= now() - (GREATEST(COALESCE(p_days, 30), 1) || ' days')::interval
       AND (s.user_id IS NULL OR (
              NOT public.is_internal_user(s.user_id)
          AND NOT public.is_suspended_or_banned(s.user_id)
       ))
       AND (s.converted_user_id IS NULL OR (
              NOT public.is_internal_user(s.converted_user_id)
          AND NOT public.is_suspended_or_banned(s.converted_user_id)
       ))
  )
  SELECT
    b.magnet_slug,
    COALESCE(NULLIF(btrim(lower(b.utm_source)), ''), 'direct/unknown')                    AS utm_source,
    count(*)                                                                              AS sessions,
    count(*) FILTER (WHERE b.email_captured_at IS NOT NULL)                               AS leads,
    count(*) FILTER (WHERE COALESCE(b.signup_at, ua.signup_at) IS NOT NULL)               AS signups,
    count(*) FILTER (WHERE COALESCE(b.trial_started_at, ua.trial_started_at) IS NOT NULL) AS trials,
    count(*) FILTER (WHERE COALESCE(b.converted_at, ua.converted_paid_at) IS NOT NULL)    AS paid
  FROM bounded b
  LEFT JOIN public.lit_user_activation ua
    ON ua.user_id = COALESCE(b.converted_user_id, b.user_id)
  WHERE public.is_platform_admin(auth.uid())
  GROUP BY b.magnet_slug, COALESCE(NULLIF(btrim(lower(b.utm_source)), ''), 'direct/unknown')
  ORDER BY sessions DESC;
$fn$;

COMMENT ON FUNCTION public.lit_admin_lead_magnet_by_source(integer) IS
  'Platform-admin-gated per (magnet_slug, normalized utm_source) rollup over the last p_days: sessions, leads(email captured), signups, trials, paid. Null/blank utm_source -> direct/unknown. Excludes internal + suspended/banned. Zero-safe.';

REVOKE ALL ON FUNCTION public.lit_admin_lead_magnet_by_source(integer) FROM public;
GRANT EXECUTE ON FUNCTION public.lit_admin_lead_magnet_by_source(integer) TO authenticated;
