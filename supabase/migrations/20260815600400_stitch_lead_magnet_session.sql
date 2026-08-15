-- Growth Sprint DATA foundation 5/8: identity stitching / attribution reconciliation.
-- At signup, reconcile a visitor's anonymous lead-magnet sessions to their new user_id and
-- backfill first-touch attribution onto lit_user_activation WITHOUT ever overwriting an
-- existing first-touch value (plan: "Do not overwrite first-touch attribution").
CREATE OR REPLACE FUNCTION public.stitch_lead_magnet_session(
  p_anonymous_id text,
  p_user_id      uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_earliest RECORD;
BEGIN
  IF p_anonymous_id IS NULL OR p_user_id IS NULL THEN
    RETURN;
  END IF;

  -- Claim only sessions that are not yet bound to a user (guard against hijack).
  UPDATE public.lit_lead_magnet_sessions s
     SET user_id           = p_user_id,
         converted_user_id = p_user_id,
         signup_at         = COALESCE(s.signup_at, now()),
         updated_at        = now()
   WHERE s.anonymous_id = p_anonymous_id
     AND s.user_id IS NULL;

  -- Earliest first-touch across this anon id's sessions (post-claim, so it's this user's).
  SELECT s.utm_source, s.utm_medium, s.utm_campaign, s.referrer, s.landing_page
    INTO v_earliest
    FROM public.lit_lead_magnet_sessions s
   WHERE s.anonymous_id = p_anonymous_id
     AND s.user_id = p_user_id
   ORDER BY s.session_started_at ASC NULLS LAST, s.created_at ASC
   LIMIT 1;

  IF FOUND THEN
    -- Backfill activation first-touch columns ONLY where currently NULL.
    -- COALESCE(existing, new) guarantees an existing first-touch is never overwritten.
    UPDATE public.lit_user_activation ua
       SET signup_source          = COALESCE(ua.signup_source,          v_earliest.utm_source),
           signup_landing         = COALESCE(ua.signup_landing,         v_earliest.landing_page),
           first_touch_utm_source = COALESCE(ua.first_touch_utm_source, v_earliest.utm_source),
           first_touch_utm_medium = COALESCE(ua.first_touch_utm_medium, v_earliest.utm_medium),
           first_touch_utm_campaign = COALESCE(ua.first_touch_utm_campaign, v_earliest.utm_campaign),
           first_touch_referrer   = COALESCE(ua.first_touch_referrer,   v_earliest.referrer),
           updated_at             = now()
     WHERE ua.user_id = p_user_id;
  END IF;

  -- Emit a lead_signup_completed event per stitched session (idempotent-ish: one per session).
  INSERT INTO public.lit_lead_magnet_events (session_id, magnet_slug, event_name, anonymous_id, user_id, metadata)
  SELECT s.id, s.magnet_slug, 'lead_signup_completed', s.anonymous_id, p_user_id,
         jsonb_build_object('stitched_at', now())
    FROM public.lit_lead_magnet_sessions s
   WHERE s.anonymous_id = p_anonymous_id
     AND s.user_id = p_user_id
     AND NOT EXISTS (
       SELECT 1 FROM public.lit_lead_magnet_events e
        WHERE e.session_id = s.id AND e.event_name = 'lead_signup_completed'
     );
END;
$fn$;

COMMENT ON FUNCTION public.stitch_lead_magnet_session(text, uuid) IS
  'Reconcile anonymous lead-magnet sessions to a user at signup. Claims only user_id-null sessions (anti-hijack), backfills lit_user_activation first-touch columns ONLY where currently null (COALESCE, never overwrites), and emits lead_signup_completed. Executable by authenticated (self-reconcile) and service_role.';

REVOKE ALL ON FUNCTION public.stitch_lead_magnet_session(text, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.stitch_lead_magnet_session(text, uuid) TO authenticated, service_role;
