-- 2026-06-12 — Dedup opened/clicked counts in lit_campaign_funnel_v.
--
-- Background:
--   Sub-project M added first-party pixel tracking (`provider='pixel'`)
--   AND Resend `tracking_options` webhook events (`provider='resend'`).
--   Both insert into `lit_outreach_history` for the same physical open
--   (Apple Mail pre-fetches the pixel AND Resend reports an `email.opened`
--   from the same render). The previous view counted both rows naively
--   with `COUNT(*)` — open rate was inflated up to 2x for campaigns sent
--   through Resend.
--
-- Fix:
--   Replace `COUNT(*)` with `COUNT(DISTINCT <recipient-step grain>)` for
--   `opened` and `clicked`. The dedup key collapses pixel + resend rows
--   into one observation per recipient per step.
--
-- Dedup key choice:
--   Primary:  (campaign_id, contact_id, campaign_step_id)
--   When contact_id is NULL (older rows where the recipient → contact
--   mapping was unknown) we fall back to `metadata->>'recipient_id'`
--   (populated by pixel + redirect-click) and `metadata->>'recipient_email'`
--   (populated by Resend webhook). When step is NULL we fall back to
--   `metadata->>'campaign_step_id'`, then the row id (so unattributed
--   events still count as one observation each, never two).
--
-- Why NOT message_id:
--   - pixel doesn't have a message_id (token carries only IDs, no
--     Resend `email_id`), so message_id would only dedupe Resend→Resend
--     pairs, not the cross-source double-count we actually have.
--
-- The lit_campaign_metrics_batch RPC depends on the view's column list,
-- so we drop+recreate both in the same transaction.

BEGIN;

DROP FUNCTION IF EXISTS public.lit_campaign_metrics_batch(uuid[]);
DROP VIEW IF EXISTS public.lit_campaign_funnel_v;

CREATE VIEW public.lit_campaign_funnel_v AS
SELECT
  c.id AS campaign_id,
  c.org_id,
  ( SELECT count(DISTINCT (h.metadata ->> 'recipient_email'::text))
      FROM public.lit_outreach_history h
     WHERE h.campaign_id = c.id
       AND h.event_type <> 'test_sent' ) AS enrolled,
  ( SELECT count(*)
      FROM public.lit_outreach_history h
     WHERE h.campaign_id = c.id
       AND h.event_type = 'sent' ) AS sent,
  ( SELECT count(DISTINCT (h.metadata ->> 'recipient_email'::text))
      FROM public.lit_outreach_history h
     WHERE h.campaign_id = c.id
       AND h.event_type = 'sent' ) AS unique_sent,
  -- opened: dedup across pixel + resend webhook so the same physical
  -- open isn't counted twice. Grain = (campaign, recipient, step).
  ( SELECT count(DISTINCT (
        COALESCE(h.contact_id::text,
                 h.metadata ->> 'recipient_id',
                 h.metadata ->> 'recipient_email',
                 h.id::text)
        || '|' ||
        COALESCE(h.campaign_step_id::text,
                 h.metadata ->> 'campaign_step_id',
                 '')
      ))
      FROM public.lit_outreach_history h
     WHERE h.campaign_id = c.id
       AND (h.event_type = 'opened' OR h.opened_at IS NOT NULL) ) AS opened,
  -- clicked: same dedup grain as opened. Resend `tracking_options` and
  -- our `redirect-click` slug both produce a clicked row per click.
  ( SELECT count(DISTINCT (
        COALESCE(h.contact_id::text,
                 h.metadata ->> 'recipient_id',
                 h.metadata ->> 'recipient_email',
                 h.id::text)
        || '|' ||
        COALESCE(h.campaign_step_id::text,
                 h.metadata ->> 'campaign_step_id',
                 '')
      ))
      FROM public.lit_outreach_history h
     WHERE h.campaign_id = c.id
       AND (h.event_type = 'clicked' OR h.clicked_at IS NOT NULL) ) AS clicked,
  ( SELECT count(*)
      FROM public.lit_outreach_history h
     WHERE h.campaign_id = c.id
       AND (h.event_type = 'replied' OR h.replied_at IS NOT NULL OR h.status = 'replied') ) AS replied,
  ( SELECT count(*)
      FROM public.lit_outreach_history h
     WHERE h.campaign_id = c.id
       AND (h.event_type = 'bounced' OR h.status = 'bounced') ) AS bounced,
  ( SELECT count(*)
      FROM public.lit_outreach_history h
     WHERE h.campaign_id = c.id
       AND h.event_type = 'suppressed' ) AS suppressed,
  GREATEST(0::bigint,
    ( SELECT count(*)
        FROM public.lit_outreach_history h
       WHERE h.campaign_id = c.id
         AND h.event_type = ANY (ARRAY['meeting_booked'::text, 'meeting_rescheduled'::text]) )
    - ( SELECT count(*)
          FROM public.lit_outreach_history h
         WHERE h.campaign_id = c.id
           AND h.event_type = 'meeting_cancelled'::text )
  ) AS meetings,
  ( SELECT max(h.created_at)
      FROM public.lit_outreach_history h
     WHERE h.campaign_id = c.id ) AS last_event_at
FROM public.lit_campaigns c;

CREATE OR REPLACE FUNCTION public.lit_campaign_metrics_batch(p_campaign_ids uuid[])
RETURNS TABLE (
  campaign_id uuid,
  enrolled bigint,
  sent bigint,
  unique_sent bigint,
  opened bigint,
  clicked bigint,
  replied bigint,
  bounced bigint,
  suppressed bigint,
  meetings bigint,
  last_event_at timestamptz,
  open_rate numeric,
  click_rate numeric,
  reply_rate numeric,
  bounce_rate numeric
)
LANGUAGE sql STABLE
SET search_path TO 'public'
AS $function$
  SELECT
    v.campaign_id,
    v.enrolled,
    v.sent,
    v.unique_sent,
    v.opened,
    v.clicked,
    v.replied,
    v.bounced,
    v.suppressed,
    v.meetings,
    v.last_event_at,
    CASE WHEN v.sent > 0 THEN ROUND(100.0 * v.opened  / v.sent, 1) ELSE NULL END AS open_rate,
    CASE WHEN v.sent > 0 THEN ROUND(100.0 * v.clicked / v.sent, 1) ELSE NULL END AS click_rate,
    CASE WHEN v.sent > 0 THEN ROUND(100.0 * v.replied / v.sent, 1) ELSE NULL END AS reply_rate,
    CASE WHEN v.sent > 0 THEN ROUND(100.0 * v.bounced / v.sent, 1) ELSE NULL END AS bounce_rate
  FROM public.lit_campaign_funnel_v v
  WHERE v.campaign_id = ANY(p_campaign_ids);
$function$;

GRANT EXECUTE ON FUNCTION public.lit_campaign_metrics_batch(uuid[]) TO authenticated;

COMMIT;
