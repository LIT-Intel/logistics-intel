-- LIT email automation tables
-- Applied: 2026-05-08
-- Purpose: Audit log for lifecycle emails + unsubscribe suppression table + pg_cron job
-- Both tables have RLS enabled (service role writes; authenticated users read own rows)

CREATE TABLE IF NOT EXISTS public.lit_email_automation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  org_id uuid NULL REFERENCES public.organizations(id) ON DELETE SET NULL,
  subscription_id text NULL,
  plan_slug text NULL,
  event_type text NOT NULL,
  resend_email_id text NULL,
  recipient_email text NOT NULL,
  subject text NOT NULL,
  status text NOT NULL DEFAULT 'sent',
  error_message text NULL,
  payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  sent_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Idempotency: a given (user_id, org_id, event_type, plan_slug) tuple can only fire ONCE successfully
CREATE UNIQUE INDEX IF NOT EXISTS lit_email_auto_dedup_idx
  ON public.lit_email_automation_events (user_id, org_id, event_type, plan_slug)
  WHERE status = 'sent';

CREATE INDEX IF NOT EXISTS lit_email_auto_recipient_idx
  ON public.lit_email_automation_events (recipient_email);

CREATE INDEX IF NOT EXISTS lit_email_auto_event_idx
  ON public.lit_email_automation_events (event_type, sent_at DESC);

ALTER TABLE public.lit_email_automation_events ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'lit_email_automation_events'
      AND policyname = 'lit_email_auto_select_own'
  ) THEN
    CREATE POLICY lit_email_auto_select_own ON public.lit_email_automation_events
      FOR SELECT TO authenticated
      USING (user_id = auth.uid());
  END IF;
END $$;

-- Unsubscribe table for List-Unsubscribe compliance
CREATE TABLE IF NOT EXISTS public.lit_email_unsubscribes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_email text NOT NULL UNIQUE,
  user_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  reason text NULL,
  unsubscribed_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.lit_email_unsubscribes ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'lit_email_unsubscribes'
      AND policyname = 'lit_email_unsub_select_own'
  ) THEN
    CREATE POLICY lit_email_unsub_select_own ON public.lit_email_unsubscribes
      FOR SELECT TO authenticated
      USING (user_id = auth.uid());
  END IF;
END $$;

-- Daily cron at 10:00 UTC via pg_cron + pg_net
-- Both extensions confirmed installed (pg_cron 1.6.4, pg_net 0.19.5)
-- The cron calls subscription-email-cron edge function with service-role auth
-- NOTE: current_setting('app.settings.service_role_key', true) must be set
-- in Supabase project settings for pg_cron to authenticate correctly.
SELECT cron.schedule(
  'lit-subscription-email-cron',
  '0 10 * * *',
  $$
  SELECT net.http_post(
    url := 'https://jkmrfiaefxwgbvftohrb.supabase.co/functions/v1/subscription-email-cron',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
