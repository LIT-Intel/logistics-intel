-- Phase 3 Activation & Attribution: 1/5 canonical event taxonomy (documentation-as-data)
CREATE TABLE IF NOT EXISTS public.lit_event_taxonomy (
  event_key        text PRIMARY KEY,
  category         text NOT NULL,
  description      text NOT NULL,
  source_table     text NOT NULL,
  source_predicate text NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.lit_event_taxonomy IS
  'Canonical product-event reference (documentation-as-data). The Admin scoreboard and future code should reference these event_keys so event names stop drifting. Seeded to match what actually exists in the DB as of 2026-08-14.';

INSERT INTO public.lit_event_taxonomy (event_key, category, description, source_table, source_predicate) VALUES
  ('account_created',        'lifecycle',   'User account created (signup).',                                  'auth.users',            'created_at'),
  ('first_search',           'activation',  'User''s first company search (activation milestone).',            'lit_usage_ledger',      'earliest feature_key=''company_search'' UNION earliest lit_activity_events.event_type=''search'''),
  ('search',                 'engagement',  'A company search event (metering source of truth).',              'lit_usage_ledger',      'feature_key=''company_search'' (also lit_activity_events.event_type=''search'')'),
  ('company_profile_view',   'engagement',  'User viewed a company profile.',                                  'lit_usage_ledger',      'feature_key=''company_profile_view'''),
  ('first_save',             'activation',  'User''s first saved company (activation milestone).',             'lit_saved_companies',   'earliest created_at per user'),
  ('company_saved',          'engagement',  'A company was saved. CANONICAL save event; historical lit_activity_events also contains legacy duplicate ''saved_company'' rows (trigger removed 2026-08-14).', 'lit_saved_companies', 'row exists; dedup activity events via DISTINCT (user_id, company_id, day) preferring ''company_saved'''),
  ('returned_d7',            'retention',   'User returned during the D7 window (activity in [signup+7d, signup+14d)).', 'lit_activity_events+lit_usage_ledger', 'earliest activity created_at within [signup_at+7d, signup_at+14d)'),
  ('trial_started',          'monetization','User entered a trial.',                                            'subscriptions',         'plan_code=''free_trial'' OR status=''trialing'' OR trial_ends_at is not null'),
  ('converted_paid',         'monetization','User converted to a paid (non-trial) subscription.',              'subscriptions',         'status=''active'' OR stripe_status=''active'' (non free_trial plan)'),
  ('contact_enrichment',     'engagement',  'Contact enrichment consumed.',                                    'lit_usage_ledger',      'feature_key=''contact_enrichment'''),
  ('pulse_search',           'engagement',  'Pulse search executed.',                                          'lit_usage_ledger',      'feature_key=''pulse_search'''),
  ('campaign_email_sent',    'acquisition', 'A campaign/demo-invite email was sent.',                          'lit_demo_invites',      'sent_at is not null (also email_webhook_events.event_type=''email.sent'')'),
  ('campaign_email_clicked', 'acquisition', 'A campaign/demo-invite email was clicked.',                       'lit_demo_invites',      'clicked_at is not null (also resend/webhook ''clicked'' events by recipient email)')
ON CONFLICT (event_key) DO UPDATE
  SET category=EXCLUDED.category, description=EXCLUDED.description,
      source_table=EXCLUDED.source_table, source_predicate=EXCLUDED.source_predicate;

ALTER TABLE public.lit_event_taxonomy ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS lit_event_taxonomy_read_authenticated ON public.lit_event_taxonomy;
CREATE POLICY lit_event_taxonomy_read_authenticated ON public.lit_event_taxonomy
  FOR SELECT TO authenticated USING (true);
