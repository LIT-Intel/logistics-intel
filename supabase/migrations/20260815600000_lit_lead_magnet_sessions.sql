-- Growth Sprint DATA foundation 1/8: lead-magnet session attribution table.
-- One row per anonymous lead-magnet session; carries first-touch + last-touch UTM and
-- the funnel timestamps (email captured -> signup -> trial -> activation -> paid).
-- Writes go through service-role / edge fns only; NO anon direct access.
CREATE TABLE IF NOT EXISTS public.lit_lead_magnet_sessions (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  magnet_slug               text NOT NULL,
  anonymous_id              text NOT NULL,
  user_id                   uuid,
  converted_user_id         uuid,
  email                     text,
  organization_id           uuid,
  utm_source                text,
  utm_medium                text,
  utm_campaign              text,
  utm_term                  text,
  utm_content               text,
  referrer                  text,
  landing_page              text,
  last_touch_utm_source     text,
  last_touch_utm_medium     text,
  last_touch_utm_campaign   text,
  session_started_at        timestamptz DEFAULT now(),
  email_captured_at         timestamptz,
  signup_at                 timestamptz,
  trial_started_at          timestamptz,
  first_search_at           timestamptz,
  first_save_at             timestamptz,
  converted_at              timestamptz,
  metadata                  jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.lit_lead_magnet_sessions IS
  'One row per anonymous lead-magnet session. Carries first-touch UTM (utm_*), last-touch UTM, and funnel timestamps. Populated by public lead-magnet edge fns via service role. Stitched to a user via stitch_lead_magnet_session() at signup. No anon direct access (RLS).';

CREATE INDEX IF NOT EXISTS lit_lead_magnet_sessions_anon_idx   ON public.lit_lead_magnet_sessions (anonymous_id);
CREATE INDEX IF NOT EXISTS lit_lead_magnet_sessions_email_idx  ON public.lit_lead_magnet_sessions (email);
CREATE INDEX IF NOT EXISTS lit_lead_magnet_sessions_magnet_idx ON public.lit_lead_magnet_sessions (magnet_slug, created_at DESC);
CREATE INDEX IF NOT EXISTS lit_lead_magnet_sessions_user_idx   ON public.lit_lead_magnet_sessions (user_id);

ALTER TABLE public.lit_lead_magnet_sessions ENABLE ROW LEVEL SECURITY;
-- No anon/authenticated policies: writes flow through service role (bypasses RLS);
-- reads are exposed only through platform-admin-gated RPCs. Explicit admin SELECT policy
-- so a platform admin can inspect rows directly if needed.
DROP POLICY IF EXISTS lit_lead_magnet_sessions_admin_select ON public.lit_lead_magnet_sessions;
CREATE POLICY lit_lead_magnet_sessions_admin_select ON public.lit_lead_magnet_sessions
  FOR SELECT TO authenticated
  USING (public.is_platform_admin(auth.uid()));
