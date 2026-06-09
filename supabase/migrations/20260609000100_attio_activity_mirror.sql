-- P2 — Attio activity mirror infra.
-- 1. Log table for idempotency + ops visibility.
-- 2. Trigger function that calls the edge fn via pg_net.
-- 3. AFTER INSERT triggers on lit_outreach_history + lit_email_events.

CREATE TABLE IF NOT EXISTS public.lit_attio_activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  lit_contact_id uuid NOT NULL,
  event_type text NOT NULL,
  dedupe_key text NOT NULL,
  status text NOT NULL CHECK (status IN ('succeeded','skipped','failed')),
  reason text,
  attio_person_id text,
  attio_note_id text,
  error text
);

CREATE INDEX IF NOT EXISTS lit_attio_activity_log_dedupe_key_created_idx
  ON public.lit_attio_activity_log(dedupe_key, created_at DESC);
CREATE INDEX IF NOT EXISTS lit_attio_activity_log_contact_idx
  ON public.lit_attio_activity_log(lit_contact_id, created_at DESC);

ALTER TABLE public.lit_attio_activity_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "platform_admins_select_attio_activity" ON public.lit_attio_activity_log;
CREATE POLICY "platform_admins_select_attio_activity"
  ON public.lit_attio_activity_log
  FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.platform_admins pa WHERE pa.user_id = auth.uid()));

-- Trigger function. Resolves payload + fires fire-and-forget pg_net POST
-- to attio-activity-mirror. Failures don't block the underlying INSERT.
CREATE OR REPLACE FUNCTION public.fire_attio_activity_mirror()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_secret text;
  v_anon text;
  v_url text := 'https://jkmrfiaefxwgbvftohrb.supabase.co/functions/v1/attio-activity-mirror';
  v_contact_id uuid;
  v_event_type text;
  v_dedupe_key text;
  v_subject text;
  v_url_clicked text;
  v_occurred_at timestamptz;
  v_campaign_name text;
BEGIN
  -- Source-dispatch on the trigger table.
  IF TG_TABLE_NAME = 'lit_outreach_history' THEN
    v_contact_id := NEW.contact_id;
    v_event_type := COALESCE(NEW.event_type, NEW.status);
    -- Only mirror real sends + bounces + replies. Skip queue/pending rows.
    IF v_event_type NOT IN ('sent','send','bounced','bounce','replied','reply','failed') THEN
      RETURN NEW;
    END IF;
    v_subject := NEW.subject;
    v_occurred_at := COALESCE(NEW.occurred_at, NEW.created_at, now());
    v_dedupe_key := 'history:' || NEW.id::text;
    SELECT name INTO v_campaign_name FROM public.lit_campaigns WHERE id = NEW.campaign_id;
  ELSIF TG_TABLE_NAME = 'lit_email_events' THEN
    v_contact_id := NEW.contact_id;
    v_event_type := NEW.event_type;
    -- Mirror opens + clicks + complaints. Skip delivery / bounce
    -- (already captured by lit_outreach_history side).
    IF v_event_type NOT IN ('opened','open','clicked','click','complained','complaint') THEN
      RETURN NEW;
    END IF;
    v_url_clicked := NEW.url_clicked;
    v_occurred_at := COALESCE(NEW.event_timestamp, NEW.created_at, now());
    v_dedupe_key := 'event:' || NEW.id::text;
    SELECT name INTO v_campaign_name FROM public.lit_campaigns WHERE id = NEW.campaign_id;
  ELSE
    RETURN NEW;
  END IF;

  IF v_contact_id IS NULL THEN RETURN NEW; END IF;

  -- Pull cron secret from vault (never leaves DB).
  SELECT decrypted_secret INTO v_secret
    FROM vault.decrypted_secrets WHERE name = 'LIT_CRON_SECRET' LIMIT 1;
  IF v_secret IS NULL THEN
    RAISE LOG 'fire_attio_activity_mirror: LIT_CRON_SECRET not in vault, skipping';
    RETURN NEW;
  END IF;

  -- Hardcoded anon key as gateway-pass JWT. Same legacy key the deployer
  -- already exposed via get-publishable-keys. Rotating the anon key
  -- means updating this string OR (cleaner) reading it from vault.
  v_anon := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImprbXJmaWFlZnh3Z2J2ZnRvaHJiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgzNTUyMTksImV4cCI6MjA4MzkzMTIxOX0.NkvdYLsGD6GmwfgmlTqlAtkMk_5RLt2dU_LY59sPgrg';

  PERFORM net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Internal-Cron', v_secret,
      'Authorization', 'Bearer ' || v_anon
    ),
    body := jsonb_build_object(
      'lit_contact_id', v_contact_id,
      'event_type', v_event_type,
      'dedupe_key', v_dedupe_key,
      'subject', v_subject,
      'url_clicked', v_url_clicked,
      'occurred_at', v_occurred_at,
      'campaign_name', v_campaign_name
    )
  );

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS attio_activity_mirror_outreach_history ON public.lit_outreach_history;
CREATE TRIGGER attio_activity_mirror_outreach_history
  AFTER INSERT ON public.lit_outreach_history
  FOR EACH ROW EXECUTE FUNCTION public.fire_attio_activity_mirror();

DROP TRIGGER IF EXISTS attio_activity_mirror_email_events ON public.lit_email_events;
CREATE TRIGGER attio_activity_mirror_email_events
  AFTER INSERT ON public.lit_email_events
  FOR EACH ROW EXECUTE FUNCTION public.fire_attio_activity_mirror();
