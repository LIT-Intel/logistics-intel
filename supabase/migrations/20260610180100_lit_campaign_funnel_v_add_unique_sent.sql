-- 2026-06-10 — Add unique_sent to lit_campaign_funnel_v + exclude test_sent
-- from enrolled count.
--
-- unique_sent = count of DISTINCT recipient emails who received ANY 'sent'
-- event for this campaign. Used as the correct denominator for the
-- frontend's sent bar (currently uses enrolled, producing 200% for
-- multi-step campaigns where N recipients × 2 steps = 2N sent events).
--
-- enrolled also fixed to exclude test_sent — these inflate the count
-- when the user clicks Test send during builder iteration.
--
-- All other columns (org_id, suppressed, meetings, last_event_at) are
-- preserved as in the live view so downstream consumers (RPC, admin
-- dashboards) keep working.
--
-- The lit_campaign_metrics_batch RPC depends on the view's column list,
-- so we drop+recreate both in the same transaction. The companion
-- migration 20260610180200_lit_campaign_metrics_batch_unique_sent is
-- kept as a no-op-equivalent traceable record of the RPC change.

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
  ( SELECT count(*)
      FROM public.lit_outreach_history h
     WHERE h.campaign_id = c.id
       AND (h.event_type = 'opened' OR h.opened_at IS NOT NULL) ) AS opened,
  ( SELECT count(*)
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
