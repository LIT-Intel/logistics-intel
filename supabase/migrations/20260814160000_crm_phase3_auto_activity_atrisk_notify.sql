-- CRM Phase 3 — "AI keeps your pipeline current" layer.
-- Auto-activity capture (email replies + meetings), at-risk/stale detection,
-- and won/lost notifications. Built entirely on existing Phase-1 plumbing
-- (lit_deals, lit_tasks, lit_deal_activity, lit_notifications) plus the
-- existing inbound-reply ledger (lit_outreach_history event_type='replied',
-- written by the reply-receiver edge fn) and lit_meetings (written by
-- cal-webhook).
--
-- Design:
--   1. reply  → DB trigger on lit_outreach_history (AFTER INSERT) matches the
--      reply sender email to an OPEN deal's primary contact, logs a
--      lit_deal_activity(kind='email') + a follow-up lit_task (+2d).
--   2. meeting → DB trigger on lit_meetings (AFTER INSERT/UPDATE) matches the
--      attendee email to an OPEN deal's primary contact, logs a
--      lit_deal_activity(kind='meeting') + a follow-up lit_task (end+1d).
--   3. stale  → pg_cron daily job flags OPEN deals with no activity in 14+d,
--      inserts one lit_notifications row per staleness EPISODE (dedupe via
--      lit_deals.stale_notified_at), sets lit_deals.is_stale for UI.
--   4. won/lost → companion AFTER-UPDATE trigger on lit_deals notifies the
--      deal owner + org admins on a Won/Lost stage move (severity varies).
--
-- All functions are SECURITY DEFINER (they must write cross-user rows the
-- calling context may not own — e.g. the reply-receiver runs as service role,
-- the cron runs as the job owner) with a pinned search_path. Idempotency is
-- enforced with partial UNIQUE indexes + episode timestamps so retries and
-- daily cron passes never double-write. Every new object gets EXPLICIT grants.
--
-- Applied to prod jkmrfiaefxwgbvftohrb via Supabase MCP; mirrored here so the
-- auto-deploy `supabase db push` treats it as idempotent.

BEGIN;

-- ════════════════════════════════════════════════════════════════════════
-- 0. Schema additions
-- ════════════════════════════════════════════════════════════════════════

-- Staleness flag + per-episode dedupe stamp on deals. is_stale is a plain
-- derivable flag the Pipeline UI can read without a heavy join;
-- stale_notified_at records WHEN the current staleness episode was notified
-- so the daily cron doesn't re-notify every day. It is cleared the moment
-- fresh activity lands (see lit_crm_touch_deal below).
ALTER TABLE public.lit_deals
  ADD COLUMN IF NOT EXISTS is_stale          boolean     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_activity_at  timestamptz,
  ADD COLUMN IF NOT EXISTS stale_notified_at timestamptz;

-- Backfill last_activity_at from existing activity so the very first cron
-- pass measures staleness from real history, not from "now".
UPDATE public.lit_deals d
SET last_activity_at = COALESCE(
  (SELECT max(a.created_at) FROM public.lit_deal_activity a WHERE a.deal_id = d.id),
  d.created_at
)
WHERE d.last_activity_at IS NULL;

-- Extend the notifications kind whitelist for the three new deal signals.
ALTER TABLE public.lit_notifications DROP CONSTRAINT IF EXISTS lit_notifications_kind_chk;
ALTER TABLE public.lit_notifications ADD CONSTRAINT lit_notifications_kind_chk
  CHECK (kind = ANY (ARRAY[
    'signal','reply','campaign','billing','system','invite','enrichment',
    'deal_stale','deal_won','deal_lost'
  ]));

-- ── Idempotency indexes ───────────────────────────────────────────────────
-- Reply → one email activity per (deal, inbound provider_event_id).
CREATE UNIQUE INDEX IF NOT EXISTS lit_deal_activity_reply_uidx
  ON public.lit_deal_activity (deal_id, (body->>'reply_event_id'))
  WHERE kind = 'email' AND body ? 'reply_event_id';

-- Meeting → one meeting activity per (deal, cal booking uid).
CREATE UNIQUE INDEX IF NOT EXISTS lit_deal_activity_meeting_uidx
  ON public.lit_deal_activity (deal_id, (body->>'meeting_uid'))
  WHERE kind = 'meeting' AND body ? 'meeting_uid';

-- Won/Lost → at most one celebratory/quiet notification per (deal, recipient).
-- NOTE: these deal notifications deliberately DO NOT set source_table/source_id.
-- A pre-existing platform index uq_lit_notifications_source enforces UNIQUE
-- (source_table, source_id) — only ONE notification per source row ever — which
-- would collide across our stale + won + lost signals on the same deal. So we
-- key off metadata->>'deal_id' and deep-link via cta_url instead.
CREATE UNIQUE INDEX IF NOT EXISTS lit_notifications_deal_outcome_uidx
  ON public.lit_notifications (user_id, (metadata->>'deal_id'), kind)
  WHERE kind IN ('deal_won','deal_lost');

-- Stale → one notification per staleness episode per owner. The episode key
-- is to_char(now(),'YYYY-MM-DD') stamped when the episode began; combined with
-- the app-level stale_notified_at reset this prevents daily spam.
CREATE UNIQUE INDEX IF NOT EXISTS lit_notifications_deal_stale_uidx
  ON public.lit_notifications (user_id, (metadata->>'deal_id'), (metadata->>'episode'))
  WHERE kind = 'deal_stale';

-- ════════════════════════════════════════════════════════════════════════
-- 1. Shared helper: touch a deal's activity clock + clear staleness
-- ════════════════════════════════════════════════════════════════════════
-- Called whenever real activity lands on a deal. Advances last_activity_at
-- and, if the deal had been flagged stale, un-flags it and clears the
-- episode stamp so a future quiet period is treated as a NEW episode.
CREATE OR REPLACE FUNCTION public.lit_crm_touch_deal(p_deal_id uuid, p_when timestamptz)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  UPDATE public.lit_deals
  SET last_activity_at = GREATEST(COALESCE(last_activity_at, p_when), p_when),
      is_stale = false,
      stale_notified_at = NULL,
      updated_at = now()
  WHERE id = p_deal_id;
$$;

-- Keep last_activity_at fresh for ANY activity row (notes, manual logs, etc.),
-- not just auto-captured ones. AFTER INSERT on lit_deal_activity.
CREATE OR REPLACE FUNCTION public.lit_deal_activity_touch()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Advance the clock but don't recurse into auto-capture logic.
  UPDATE public.lit_deals
  SET last_activity_at = GREATEST(COALESCE(last_activity_at, NEW.created_at), NEW.created_at),
      is_stale = false,
      stale_notified_at = NULL
  WHERE id = NEW.deal_id;
  RETURN NULL;
END; $$;

DROP TRIGGER IF EXISTS lit_deal_activity_touch_ins ON public.lit_deal_activity;
CREATE TRIGGER lit_deal_activity_touch_ins
  AFTER INSERT ON public.lit_deal_activity
  FOR EACH ROW EXECUTE FUNCTION public.lit_deal_activity_touch();

-- ════════════════════════════════════════════════════════════════════════
-- 2. Auto-capture from email replies
-- ════════════════════════════════════════════════════════════════════════
-- The reply-receiver edge fn inserts a lit_outreach_history row with
-- event_type='replied' and metadata = { from, subject, snippet, ... } and a
-- provider_event_id = the inbound Message-ID. We match the sender email to an
-- OPEN deal whose primary_contact_id resolves to that email, then:
--   • insert a lit_deal_activity(kind='email') (idempotent per provider_event_id)
--   • create a follow-up lit_task (+2 days) IF no OPEN task already on the deal.
CREATE OR REPLACE FUNCTION public.lit_crm_capture_reply()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_from        text;
  v_subject     text;
  v_snippet     text;
  v_event_id    text;
  v_contact_name text;
  d             record;
BEGIN
  IF NEW.event_type <> 'replied' THEN
    RETURN NULL;
  END IF;

  v_from     := lower(trim(COALESCE(NEW.metadata->>'from', '')));
  -- 'from' headers arrive as e.g. "Jane Doe <jane@acme.com>" — extract the addr.
  IF v_from ~ '<[^>]+>' THEN
    v_from := lower(trim((regexp_match(v_from, '<([^>]+)>'))[1]));
  END IF;
  IF v_from = '' OR v_from !~ '@' THEN
    RETURN NULL;
  END IF;

  v_subject  := COALESCE(NEW.subject, NEW.metadata->>'subject', '');
  v_snippet  := COALESCE(NEW.metadata->>'snippet', '');
  v_event_id := COALESCE(NEW.provider_event_id, NEW.provider_message_id, NEW.id::text);

  -- Find OPEN deals whose primary contact's email matches the reply sender.
  FOR d IN
    SELECT dl.id, dl.org_id, dl.owner_user_id, c.full_name
    FROM public.lit_deals dl
    JOIN public.lit_contacts c ON c.id = dl.primary_contact_id
    WHERE dl.status = 'open'
      AND lower(trim(c.email)) = v_from
  LOOP
    v_contact_name := COALESCE(d.full_name, v_from);

    -- (a) Activity row — idempotent via lit_deal_activity_reply_uidx.
    INSERT INTO public.lit_deal_activity (deal_id, org_id, kind, body, actor_user_id)
    VALUES (
      d.id, d.org_id, 'email',
      jsonb_build_object(
        'direction', 'inbound',
        'reply_event_id', v_event_id,
        'from', v_from,
        'subject', v_subject,
        'snippet', left(v_snippet, 500),
        'source', 'auto_capture'
      ),
      NULL
    )
    ON CONFLICT DO NOTHING;

    -- (b) Follow-up task — only if there is no OPEN task already on this deal.
    IF NOT EXISTS (
      SELECT 1 FROM public.lit_tasks t
      WHERE t.deal_id = d.id AND t.status = 'open'
    ) THEN
      INSERT INTO public.lit_tasks
        (org_id, deal_id, title, due_date, status, assignee_user_id, created_by)
      VALUES (
        d.org_id, d.id,
        'Reply from ' || v_contact_name || ' — follow up',
        now() + interval '2 days',
        'open',
        d.owner_user_id,
        d.owner_user_id
      );
    END IF;
  END LOOP;

  RETURN NULL;
END; $$;

DROP TRIGGER IF EXISTS lit_crm_capture_reply_ins ON public.lit_outreach_history;
CREATE TRIGGER lit_crm_capture_reply_ins
  AFTER INSERT ON public.lit_outreach_history
  FOR EACH ROW
  WHEN (NEW.event_type = 'replied')
  EXECUTE FUNCTION public.lit_crm_capture_reply();

-- ════════════════════════════════════════════════════════════════════════
-- 3. Auto-capture from meetings
-- ════════════════════════════════════════════════════════════════════════
-- cal-webhook upserts lit_meetings keyed on cal_booking_uid. When the
-- attendee email matches an OPEN deal's primary contact, log a
-- lit_deal_activity(kind='meeting') (idempotent per cal_booking_uid+deal) and
-- create a follow-up task due (ends_at + 1 day) — falls back to now()+1d when
-- ends_at is null (e.g. a just-created booking with no end time yet).
CREATE OR REPLACE FUNCTION public.lit_crm_capture_meeting()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_email    text;
  v_uid      text;
  v_due      timestamptz;
  v_title    text;
  d          record;
BEGIN
  v_email := lower(trim(COALESCE(NEW.attendee_email, '')));
  v_uid   := COALESCE(NEW.cal_booking_uid, NEW.id::text);
  IF v_email = '' OR v_email !~ '@' THEN
    RETURN NULL;
  END IF;

  -- Skip pure cancellations — nothing to log an outcome for.
  IF NEW.status = 'cancelled' THEN
    RETURN NULL;
  END IF;

  v_due   := COALESCE(NEW.ends_at, NEW.starts_at, now()) + interval '1 day';
  v_title := COALESCE(NEW.event_type, 'Meeting');

  FOR d IN
    SELECT dl.id, dl.org_id, dl.owner_user_id, c.full_name
    FROM public.lit_deals dl
    JOIN public.lit_contacts c ON c.id = dl.primary_contact_id
    WHERE dl.status = 'open'
      AND lower(trim(c.email)) = v_email
  LOOP
    -- (a) Activity — idempotent per (deal, cal_booking_uid).
    INSERT INTO public.lit_deal_activity (deal_id, org_id, kind, body, actor_user_id)
    VALUES (
      d.id, d.org_id, 'meeting',
      jsonb_build_object(
        'meeting_uid', v_uid,
        'title', v_title,
        'status', NEW.status,
        'attendee_email', v_email,
        'starts_at', NEW.starts_at,
        'ends_at', NEW.ends_at,
        'source', 'auto_capture'
      ),
      NULL
    )
    ON CONFLICT DO NOTHING;

    -- (b) Follow-up task — only if no OPEN task already on the deal.
    IF NOT EXISTS (
      SELECT 1 FROM public.lit_tasks t
      WHERE t.deal_id = d.id AND t.status = 'open'
    ) THEN
      INSERT INTO public.lit_tasks
        (org_id, deal_id, title, due_date, status, assignee_user_id, created_by)
      VALUES (
        d.org_id, d.id,
        'Meeting with ' || COALESCE(d.full_name, v_email) || ' — log outcome',
        v_due,
        'open',
        d.owner_user_id,
        d.owner_user_id
      );
    END IF;
  END LOOP;

  RETURN NULL;
END; $$;

DROP TRIGGER IF EXISTS lit_crm_capture_meeting_iu ON public.lit_meetings;
CREATE TRIGGER lit_crm_capture_meeting_iu
  AFTER INSERT OR UPDATE ON public.lit_meetings
  FOR EACH ROW EXECUTE FUNCTION public.lit_crm_capture_meeting();

-- ════════════════════════════════════════════════════════════════════════
-- 4. Won / Lost notifications (companion trigger — does NOT touch the
--    existing lit_deals_log_activity fn, to avoid stepping on the agent
--    adding win_probability to stages).
-- ════════════════════════════════════════════════════════════════════════
-- Fires when a deal's status transitions INTO won/lost (driven by the
-- BEFORE-trigger lit_deals_stage_derive which sets status from the stage's
-- is_won/is_lost flags). Notifies the deal owner + all org admins/owners.
CREATE OR REPLACE FUNCTION public.lit_crm_deal_outcome_notify()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_kind      text;
  v_severity  text;
  v_title     text;
  v_body      text;
  v_amt       text;
  r_user      uuid;
BEGIN
  IF NEW.status = OLD.status OR NEW.status NOT IN ('won','lost') THEN
    RETURN NULL;
  END IF;

  v_amt := CASE WHEN NEW.value_amount IS NOT NULL
                THEN ' (' || NEW.currency || ' ' || trim(to_char(NEW.value_amount, 'FM999,999,999,990')) || ')'
                ELSE '' END;

  IF NEW.status = 'won' THEN
    v_kind := 'deal_won'; v_severity := 'low';
    v_title := '🎉 Deal won: ' || NEW.title;
    v_body  := 'Congrats — "' || NEW.title || '"' || v_amt || ' just moved to Won.';
  ELSE
    v_kind := 'deal_lost'; v_severity := 'low';
    v_title := 'Deal marked lost: ' || NEW.title;
    v_body  := '"' || NEW.title || '"' || v_amt || ' was marked Lost.';
  END IF;

  -- Recipients: deal owner ∪ org owners/admins (distinct, active).
  FOR r_user IN
    SELECT DISTINCT u FROM (
      SELECT NEW.owner_user_id AS u
      UNION
      SELECT om.user_id
      FROM public.org_members om
      WHERE om.org_id = NEW.org_id
        AND om.role IN ('owner','admin')
        AND COALESCE(om.status, 'active') = 'active'
    ) s
    WHERE u IS NOT NULL
  LOOP
    INSERT INTO public.lit_notifications
      (user_id, org_id, kind, severity, title, body, cta_label, cta_url,
       status, metadata)
    VALUES (
      r_user, NEW.org_id, v_kind, v_severity, v_title, v_body,
      'View deal', '/crm/deals/' || NEW.id::text, 'unread',
      jsonb_build_object('deal_id', NEW.id::text, 'status', NEW.status,
                         'value_amount', NEW.value_amount, 'currency', NEW.currency)
    )
    ON CONFLICT DO NOTHING;  -- lit_notifications_deal_outcome_uidx
  END LOOP;

  RETURN NULL;
END; $$;

DROP TRIGGER IF EXISTS lit_crm_deal_outcome_notify_upd ON public.lit_deals;
CREATE TRIGGER lit_crm_deal_outcome_notify_upd
  AFTER UPDATE ON public.lit_deals
  FOR EACH ROW
  WHEN (NEW.status IS DISTINCT FROM OLD.status)
  EXECUTE FUNCTION public.lit_crm_deal_outcome_notify();

-- ════════════════════════════════════════════════════════════════════════
-- 5. At-risk / stale-deal sweep (called daily by pg_cron)
-- ════════════════════════════════════════════════════════════════════════
-- Flags OPEN deals whose last_activity_at is 14+ days old, sets is_stale,
-- and inserts ONE lit_notifications row per staleness EPISODE for the owner.
-- Episode key = the day the deal first entered THIS quiet period (stamped in
-- stale_notified_at) so re-running the cron daily doesn't spam. Fresh activity
-- clears is_stale + stale_notified_at (see lit_deal_activity_touch), so the
-- next quiet period is a distinct episode with a new key.
CREATE OR REPLACE FUNCTION public.lit_crm_flag_stale_deals(p_threshold_days int DEFAULT 14)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_cnt     integer := 0;
  v_episode text;
  d         record;
BEGIN
  FOR d IN
    SELECT id, org_id, owner_user_id, title
    FROM public.lit_deals
    WHERE status = 'open'
      AND stale_notified_at IS NULL            -- not already notified this episode
      AND COALESCE(last_activity_at, created_at) < (now() - make_interval(days => p_threshold_days))
  LOOP
    v_episode := to_char(now(), 'YYYY-MM-DD');

    -- Flag + stamp the episode first so a concurrent run can't double-notify.
    UPDATE public.lit_deals
    SET is_stale = true, stale_notified_at = now()
    WHERE id = d.id AND stale_notified_at IS NULL;

    IF NOT FOUND THEN
      CONTINUE;  -- another run claimed it
    END IF;

    IF d.owner_user_id IS NOT NULL THEN
      INSERT INTO public.lit_notifications
        (user_id, org_id, kind, severity, title, body, cta_label, cta_url,
         status, metadata)
      VALUES (
        d.owner_user_id, d.org_id, 'deal_stale', 'medium',
        'Deal has gone quiet: ' || d.title,
        '"' || d.title || '" has had no activity in ' || p_threshold_days || '+ days. Time to follow up?',
        'View deal', '/crm/deals/' || d.id::text, 'unread',
        jsonb_build_object('deal_id', d.id::text, 'episode', v_episode,
                           'threshold_days', p_threshold_days)
      )
      ON CONFLICT DO NOTHING;  -- lit_notifications_deal_stale_uidx
    END IF;

    v_cnt := v_cnt + 1;
  END LOOP;

  RETURN v_cnt;
END; $$;

-- ════════════════════════════════════════════════════════════════════════
-- 6. Grants
-- ════════════════════════════════════════════════════════════════════════
-- The trigger fns run as their definer (table owner) and are invoked
-- implicitly by DML, so no EXECUTE grant to authenticated is needed for them.
-- lit_crm_flag_stale_deals is invoked by the cron job owner (postgres) only —
-- it must NOT be callable by end users, so we deliberately grant it only to
-- service_role for ad-hoc admin runs.
REVOKE ALL ON FUNCTION public.lit_crm_flag_stale_deals(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lit_crm_flag_stale_deals(int) TO service_role;
REVOKE ALL ON FUNCTION public.lit_crm_touch_deal(uuid, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lit_crm_touch_deal(uuid, timestamptz) TO service_role;

-- Trigger functions are invoked only implicitly by their triggers, never as
-- PostgREST RPC. Revoke EXECUTE from PUBLIC so anon/authenticated cannot call
-- these SECURITY DEFINER functions directly (clears the linter finding).
REVOKE ALL ON FUNCTION public.lit_crm_capture_reply() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.lit_crm_capture_meeting() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.lit_crm_deal_outcome_notify() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.lit_deal_activity_touch() FROM PUBLIC;

COMMIT;

-- ════════════════════════════════════════════════════════════════════════
-- 7. pg_cron schedule (outside the txn — cron.schedule autocommits)
-- ════════════════════════════════════════════════════════════════════════
SELECT cron.schedule(
  'lit-crm-stale-deals-daily',
  '0 13 * * *',               -- 13:00 UTC daily (mid-morning US)
  $cron$ SELECT public.lit_crm_flag_stale_deals(14); $cron$
);
