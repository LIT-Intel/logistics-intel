-- Lead-LEVEL list of captured lead-magnet leads for the admin Growth tab. One
-- row per session whose email is captured, newest first, so the owner can see &
-- follow up on each lead. Platform-admin gated; excludes internal + suspended/
-- banned. "capture these leads correctly."
--
-- stage escalates by the furthest milestone reached:
--   captured < signup < trial < activated < paid
-- first_name is pulled from session metadata (first_name / firstName) if present,
-- else the first token of the stitched profile's full_name.
CREATE OR REPLACE FUNCTION public.lit_admin_recent_leads(
  p_days  integer DEFAULT 30,
  p_limit integer DEFAULT 200
)
RETURNS TABLE (
  session_id        uuid,
  email             text,
  first_name        text,
  magnet_slug       text,
  utm_source        text,
  utm_campaign      text,
  landing_page      text,
  stage             text,
  created_at        timestamptz,
  email_captured_at timestamptz,
  converted_user_id uuid
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
  WITH bounded AS (
    SELECT s.*
      FROM public.lit_lead_magnet_sessions s
     WHERE s.created_at >= now() - (GREATEST(COALESCE(p_days, 30), 1) || ' days')::interval
       AND s.email IS NOT NULL
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
    b.id AS session_id,
    b.email,
    COALESCE(
      NULLIF(btrim(b.metadata->>'first_name'), ''),
      NULLIF(btrim(b.metadata->>'firstName'), ''),
      NULLIF(split_part(btrim(COALESCE(pr.full_name, '')), ' ', 1), '')
    ) AS first_name,
    b.magnet_slug,
    COALESCE(NULLIF(btrim(lower(b.utm_source)), ''), 'direct/unknown') AS utm_source,
    b.utm_campaign,
    b.landing_page,
    CASE
      WHEN COALESCE(b.converted_at, ua.converted_paid_at) IS NOT NULL THEN 'paid'
      WHEN COALESCE(b.first_search_at, ua.first_search_at) IS NOT NULL
        OR COALESCE(b.first_save_at,   ua.first_save_at)   IS NOT NULL THEN 'activated'
      WHEN COALESCE(b.trial_started_at, ua.trial_started_at) IS NOT NULL THEN 'trial'
      WHEN COALESCE(b.signup_at, ua.signup_at) IS NOT NULL THEN 'signup'
      ELSE 'captured'
    END AS stage,
    b.created_at,
    b.email_captured_at,
    b.converted_user_id
  FROM bounded b
  LEFT JOIN public.lit_user_activation ua
    ON ua.user_id = COALESCE(b.converted_user_id, b.user_id)
  LEFT JOIN public.profiles pr
    ON pr.id = COALESCE(b.converted_user_id, b.user_id)
  WHERE public.is_platform_admin(auth.uid())
  ORDER BY b.created_at DESC
  LIMIT GREATEST(COALESCE(p_limit, 200), 1);
$fn$;

COMMENT ON FUNCTION public.lit_admin_recent_leads(integer, integer) IS
  'Platform-admin-gated lead-level list: one row per captured lead-magnet session (email not null) over the last p_days, newest first, capped at p_limit. Returns email, first_name (metadata or profile), magnet_slug, utm_source, utm_campaign, landing_page, computed stage (captured<signup<trial<activated<paid), timestamps, converted_user_id. Excludes internal + suspended/banned.';

REVOKE ALL ON FUNCTION public.lit_admin_recent_leads(integer, integer) FROM public;
GRANT EXECUTE ON FUNCTION public.lit_admin_recent_leads(integer, integer) TO authenticated;
