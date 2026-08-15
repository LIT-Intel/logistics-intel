-- CRM deal alerts — close-date detection layer (companion to Phase-3 stale sweep).
--
-- Phase 3 (20260814160000) already flags OPEN deals that go QUIET (no activity
-- in 14+ days) via lit_crm_flag_stale_deals -> is_stale + a `deal_stale`
-- notification, cron `lit-crm-stale-deals-daily`.
--
-- This migration adds CLOSE-DATE awareness on top of that, using the existing
-- lit_deals.expected_close_date:
--   • closing_soon — OPEN deal whose expected_close_date is within the next
--                    3 days (inclusive of today) and not yet past.
--   • overdue      — OPEN deal whose expected_close_date is already in the past.
--
-- A per-deal episode state machine (close_alert_state + close_alerted_at) makes
-- the daily sweep IDEMPOTENT: an owner is notified ONCE when a deal first enters
-- closing_soon, and ONCE when it first crosses into overdue — never re-notified
-- day after day for the same state. Moving out of an alert state (deal closes,
-- reopens, or the close date is pushed out) clears the stamp so a future entry
-- is a fresh episode.
--
-- Two new notification kinds (deal_closing_soon / deal_overdue) extend the
-- lit_notifications kind whitelist. A partial UNIQUE index keys the dedupe on
-- (user, deal, kind, episode) so retries + concurrent cron runs can't double
-- write. Everything is SECURITY DEFINER with a pinned search_path, invoked only
-- by the cron job owner (postgres) + service_role, mirroring the stale sweep.
--
-- Coordinated migration timestamp 20260814240000 (after the 2026-08-14 CRM set).
-- Applied to prod jkmrfiaefxwgbvftohrb via Supabase MCP; mirrored here so
-- `supabase db push` treats it as idempotent.

BEGIN;

-- ════════════════════════════════════════════════════════════════════════
-- 0. Schema additions
-- ════════════════════════════════════════════════════════════════════════
-- close_alert_state: NULL (no active close alert) | 'closing_soon' | 'overdue'.
--   This is the current episode the owner has been notified about; it drives
--   idempotency and the Pulse Coach / email surfacing.
-- close_alerted_at: when the CURRENT close_alert_state episode was raised.
ALTER TABLE public.lit_deals
  ADD COLUMN IF NOT EXISTS close_alert_state text
    CHECK (close_alert_state IN ('closing_soon','overdue')),
  ADD COLUMN IF NOT EXISTS close_alerted_at  timestamptz;

-- Extend the notifications kind whitelist for the two new close signals.
ALTER TABLE public.lit_notifications DROP CONSTRAINT IF EXISTS lit_notifications_kind_chk;
ALTER TABLE public.lit_notifications ADD CONSTRAINT lit_notifications_kind_chk
  CHECK (kind = ANY (ARRAY[
    'signal','reply','campaign','billing','system','invite','enrichment',
    'deal_stale','deal_won','deal_lost','deal_closing_soon','deal_overdue'
  ]));

-- Close-alert dedupe: one notification per (owner, deal, kind, episode). The
-- episode key is the day the deal ENTERED this close_alert_state (stored in
-- metadata.episode) so re-entry after clearing yields a new key. Uses the same
-- keying scheme as lit_notifications_deal_stale_uidx — deliberately NOT
-- source_table/source_id (the platform's uq_lit_notifications_source enforces
-- one notification per source row, which would collide across signals).
CREATE UNIQUE INDEX IF NOT EXISTS lit_notifications_deal_close_uidx
  ON public.lit_notifications (user_id, (metadata->>'deal_id'), kind, (metadata->>'episode'))
  WHERE kind IN ('deal_closing_soon','deal_overdue');

-- ════════════════════════════════════════════════════════════════════════
-- 1. Close-date alert sweep (called daily by pg_cron, alongside the stale sweep)
-- ════════════════════════════════════════════════════════════════════════
-- For every OPEN deal with an expected_close_date, compute its desired close
-- alert state and, when it CHANGES, stamp the deal + notify the owner once.
--   desired = 'overdue'      when expected_close_date < today
--           = 'closing_soon' when today <= expected_close_date <= today+N days
--           = NULL           otherwise (further out than the window)
-- Only a transition INTO a non-null state raises a notification. Transitions
-- between states (closing_soon -> overdue) each notify once. Falling back to
-- NULL (date pushed out, or deal no longer open — handled by the WHERE) just
-- clears the stamp silently. p_soon_days defaults to 3.
CREATE OR REPLACE FUNCTION public.lit_crm_flag_close_alerts(p_soon_days int DEFAULT 3)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_cnt     integer := 0;
  v_desired text;
  v_kind    text;
  v_sev     text;
  v_title   text;
  v_body    text;
  v_amt     text;
  v_episode text;
  v_when    text;
  d         record;
BEGIN
  FOR d IN
    SELECT id, org_id, owner_user_id, title, value_amount, currency,
           expected_close_date, close_alert_state
    FROM public.lit_deals
    WHERE status = 'open'
      AND expected_close_date IS NOT NULL
  LOOP
    -- Desired state for this deal right now.
    IF d.expected_close_date < current_date THEN
      v_desired := 'overdue';
    ELSIF d.expected_close_date <= (current_date + p_soon_days) THEN
      v_desired := 'closing_soon';
    ELSE
      v_desired := NULL;
    END IF;

    -- No change — nothing to do (this is the daily no-op path that prevents spam).
    IF v_desired IS NOT DISTINCT FROM d.close_alert_state THEN
      CONTINUE;
    END IF;

    -- State changed: stamp the deal first so a concurrent run can't double-notify.
    UPDATE public.lit_deals
    SET close_alert_state = v_desired,
        close_alerted_at  = CASE WHEN v_desired IS NULL THEN NULL ELSE now() END
    WHERE id = d.id
      AND close_alert_state IS NOT DISTINCT FROM d.close_alert_state;  -- optimistic guard

    IF NOT FOUND THEN
      CONTINUE;  -- another run claimed this transition
    END IF;

    -- Clearing to NULL raises no notification.
    IF v_desired IS NULL THEN
      CONTINUE;
    END IF;

    -- Notify the owner once for the new episode.
    IF d.owner_user_id IS NOT NULL THEN
      v_episode := to_char(now(), 'YYYY-MM-DD');
      v_amt := CASE WHEN d.value_amount IS NOT NULL
                    THEN ' (' || COALESCE(d.currency,'USD') || ' '
                         || trim(to_char(d.value_amount, 'FM999,999,999,990')) || ')'
                    ELSE '' END;
      v_when := to_char(d.expected_close_date, 'Mon FMDD');

      IF v_desired = 'closing_soon' THEN
        v_kind := 'deal_closing_soon'; v_sev := 'medium';
        v_title := 'Deal closing soon: ' || d.title;
        v_body  := '"' || d.title || '"' || v_amt
                   || ' is set to close on ' || v_when
                   || '. Make sure everything''s lined up.';
      ELSE
        v_kind := 'deal_overdue'; v_sev := 'high';
        v_title := 'Deal past its close date: ' || d.title;
        v_body  := '"' || d.title || '"' || v_amt
                   || ' was due to close on ' || v_when
                   || ' and is still open. Update the close date or move it forward.';
      END IF;

      INSERT INTO public.lit_notifications
        (user_id, org_id, kind, severity, title, body, cta_label, cta_url,
         status, metadata)
      VALUES (
        d.owner_user_id, d.org_id, v_kind, v_sev, v_title, v_body,
        'View deal', '/crm/deals/' || d.id::text, 'unread',
        jsonb_build_object('deal_id', d.id::text, 'episode', v_episode,
                           'state', v_desired,
                           'expected_close_date', d.expected_close_date,
                           'value_amount', d.value_amount, 'currency', d.currency)
      )
      ON CONFLICT DO NOTHING;  -- lit_notifications_deal_close_uidx
    END IF;

    v_cnt := v_cnt + 1;
  END LOOP;

  RETURN v_cnt;
END; $$;

-- ════════════════════════════════════════════════════════════════════════
-- 2. Combined daily deal-alert runner (stale + close alerts)
-- ════════════════════════════════════════════════════════════════════════
-- A single entrypoint the daily cron calls so both the (existing) staleness
-- sweep and the (new) close-date sweep run together. Returns a small JSON
-- summary for cron logs / ad-hoc admin runs. Wrapping — rather than editing
-- the existing lit_crm_flag_stale_deals — keeps the stale sweep owned by the
-- Phase-3 migration untouched.
CREATE OR REPLACE FUNCTION public.lit_crm_run_deal_alerts(
  p_stale_days int DEFAULT 14,
  p_soon_days  int DEFAULT 3
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_stale integer;
  v_close integer;
BEGIN
  v_stale := public.lit_crm_flag_stale_deals(p_stale_days);
  v_close := public.lit_crm_flag_close_alerts(p_soon_days);
  RETURN jsonb_build_object(
    'ran_at', now(),
    'stale_flagged', v_stale,
    'close_alerts_raised', v_close
  );
END; $$;

-- ════════════════════════════════════════════════════════════════════════
-- 3. Grants
-- ════════════════════════════════════════════════════════════════════════
-- Cron-owner / admin only; never end-user callable.
REVOKE ALL ON FUNCTION public.lit_crm_flag_close_alerts(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lit_crm_flag_close_alerts(int) TO service_role;
REVOKE ALL ON FUNCTION public.lit_crm_run_deal_alerts(int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lit_crm_run_deal_alerts(int, int) TO service_role;

COMMIT;

-- ════════════════════════════════════════════════════════════════════════
-- 4. Repoint the existing daily cron to the combined runner (autocommits)
-- ════════════════════════════════════════════════════════════════════════
-- Keeps the same 13:00 UTC slot + job name as Phase 3 so there's still ONE
-- daily deal-alert pass; it now also raises close-date alerts.
SELECT cron.schedule(
  'lit-crm-stale-deals-daily',
  '0 13 * * *',
  $cron$ SELECT public.lit_crm_run_deal_alerts(14, 3); $cron$
);
