-- Growth Sprint DATA foundation 2/8: lead-magnet event stream + taxonomy seed.
-- Append-only per-event rows tied to a session. Canonical event_names are also seeded
-- into lit_event_taxonomy (category 'lead_magnet') so the scoreboard reuses one taxonomy.
CREATE TABLE IF NOT EXISTS public.lit_lead_magnet_events (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    uuid REFERENCES public.lit_lead_magnet_sessions(id) ON DELETE CASCADE,
  magnet_slug   text,
  event_name    text NOT NULL,
  anonymous_id  text,
  user_id       uuid,
  metadata      jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.lit_lead_magnet_events IS
  'Append-only lead-magnet event stream. event_name values are the canonical lead_magnet keys seeded into lit_event_taxonomy. Written by public edge fns (service role) and by stitch_lead_magnet_session().';

CREATE INDEX IF NOT EXISTS lit_lead_magnet_events_session_idx ON public.lit_lead_magnet_events (session_id);
CREATE INDEX IF NOT EXISTS lit_lead_magnet_events_name_idx    ON public.lit_lead_magnet_events (event_name, created_at DESC);

ALTER TABLE public.lit_lead_magnet_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS lit_lead_magnet_events_admin_select ON public.lit_lead_magnet_events;
CREATE POLICY lit_lead_magnet_events_admin_select ON public.lit_lead_magnet_events
  FOR SELECT TO authenticated
  USING (public.is_platform_admin(auth.uid()));

-- Seed canonical lead-magnet event names into the existing taxonomy (reuse, don't fork).
INSERT INTO public.lit_event_taxonomy (event_key, category, description, source_table, source_predicate) VALUES
  ('lead_magnet_viewed',    'lead_magnet', 'Lead-magnet landing/tool viewed.',                      'lit_lead_magnet_events', 'event_name=''lead_magnet_viewed'''),
  ('lead_magnet_started',   'lead_magnet', 'User began interacting with the lead-magnet tool.',     'lit_lead_magnet_events', 'event_name=''lead_magnet_started'''),
  ('lead_magnet_submitted', 'lead_magnet', 'Lead-magnet form/query submitted.',                     'lit_lead_magnet_events', 'event_name=''lead_magnet_submitted'''),
  ('lead_captured',         'lead_magnet', 'Email captured from a lead-magnet session.',            'lit_lead_magnet_sessions', 'email_captured_at is not null'),
  ('lead_result_viewed',    'lead_magnet', 'Lead-magnet result shown to the visitor.',              'lit_lead_magnet_events', 'event_name=''lead_result_viewed'''),
  ('lead_result_locked',    'lead_magnet', 'Lead-magnet result gated behind signup/paywall.',       'lit_lead_magnet_events', 'event_name=''lead_result_locked'''),
  ('lead_trial_cta_clicked','lead_magnet', 'Visitor clicked the trial CTA from a lead magnet.',     'lit_lead_magnet_events', 'event_name=''lead_trial_cta_clicked'''),
  ('lead_signup_started',   'lead_magnet', 'Visitor began signup from a lead-magnet flow.',         'lit_lead_magnet_events', 'event_name=''lead_signup_started'''),
  ('lead_signup_completed', 'lead_magnet', 'Lead-magnet session reconciled to a signed-up user.',   'lit_lead_magnet_events', 'event_name=''lead_signup_completed'' (emitted by stitch_lead_magnet_session)'),
  ('lead_first_search',     'lead_magnet', 'First search by a user acquired via a lead magnet.',     'lit_lead_magnet_sessions', 'first_search_at is not null'),
  ('lead_first_save',       'lead_magnet', 'First save by a user acquired via a lead magnet.',       'lit_lead_magnet_sessions', 'first_save_at is not null'),
  ('lead_paid_conversion',  'lead_magnet', 'User acquired via a lead magnet converted to paid.',     'lit_lead_magnet_sessions', 'converted_at is not null')
ON CONFLICT (event_key) DO UPDATE
  SET category=EXCLUDED.category, description=EXCLUDED.description,
      source_table=EXCLUDED.source_table, source_predicate=EXCLUDED.source_predicate;
