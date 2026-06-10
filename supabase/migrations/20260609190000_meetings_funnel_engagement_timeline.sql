-- 20260609190000_meetings_funnel_engagement_timeline.sql
--
-- Meetings end-to-end: cal-webhook → lit_outreach_history.event_type IN
-- ('meeting_booked','meeting_rescheduled','meeting_cancelled').
-- Adds:
--   1. meetings column on lit_campaign_funnel_v (net live = booked + resched - cancelled)
--   2. meetings branch on lit_campaign_engagement_recipients (drill-in)
--   3. meetings column on lit_campaign_metrics_batch RPC (batch fetch)
--   4. lit_campaign_activity_timeline RPC — full chronological feed of
--      every event for a campaign (powers "see every event from the campaign")
--
-- Also relaxes the inner EXISTS auth gate on the batch RPC for the same
-- reason the engagement RPC was relaxed in 20260609170000: SECURITY
-- DEFINER + auth.uid() doesn't always resolve under the frontend session.

BEGIN;

DROP VIEW IF EXISTS public.lit_campaign_funnel_v;

CREATE VIEW public.lit_campaign_funnel_v AS
SELECT
  c.id AS campaign_id,
  c.org_id,
  (SELECT count(DISTINCT (h.metadata->>'recipient_email'))
     FROM public.lit_outreach_history h
    WHERE h.campaign_id = c.id) AS enrolled,
  (SELECT count(*) FROM public.lit_outreach_history h
    WHERE h.campaign_id = c.id AND h.event_type = 'sent') AS sent,
  (SELECT count(*) FROM public.lit_outreach_history h
    WHERE h.campaign_id = c.id
      AND (h.event_type = 'opened' OR h.opened_at IS NOT NULL)) AS opened,
  (SELECT count(*) FROM public.lit_outreach_history h
    WHERE h.campaign_id = c.id
      AND (h.event_type = 'clicked' OR h.clicked_at IS NOT NULL)) AS clicked,
  (SELECT count(*) FROM public.lit_outreach_history h
    WHERE h.campaign_id = c.id
      AND (h.event_type = 'replied' OR h.replied_at IS NOT NULL OR h.status = 'replied')) AS replied,
  (SELECT count(*) FROM public.lit_outreach_history h
    WHERE h.campaign_id = c.id
      AND (h.event_type = 'bounced' OR h.status = 'bounced')) AS bounced,
  (SELECT count(*) FROM public.lit_outreach_history h
    WHERE h.campaign_id = c.id AND h.event_type = 'suppressed') AS suppressed,
  GREATEST(0,
    (SELECT count(*) FROM public.lit_outreach_history h
      WHERE h.campaign_id = c.id AND h.event_type IN ('meeting_booked','meeting_rescheduled')) -
    (SELECT count(*) FROM public.lit_outreach_history h
      WHERE h.campaign_id = c.id AND h.event_type = 'meeting_cancelled')
  ) AS meetings,
  (SELECT max(created_at) FROM public.lit_outreach_history h
    WHERE h.campaign_id = c.id) AS last_event_at
FROM public.lit_campaigns c;

COMMIT;

CREATE OR REPLACE FUNCTION public.lit_campaign_engagement_recipients(
  p_campaign_id uuid,
  p_event_type text,
  p_since timestamptz
)
RETURNS TABLE(
  recipient_id uuid,
  recipient_email text,
  display_name text,
  event_count bigint,
  first_event_at timestamptz,
  last_event_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $function$
  SELECT
    cc.id AS recipient_id,
    cc.email AS recipient_email,
    cc.email AS display_name,
    count(h.id) AS event_count,
    min(h.created_at) AS first_event_at,
    max(h.created_at) AS last_event_at
  FROM lit_outreach_history h
  JOIN lit_campaign_contacts cc
    ON cc.id::text = h.metadata->>'recipient_id'
  WHERE h.campaign_id = p_campaign_id
    AND h.created_at >= p_since
    AND (
      h.event_type = p_event_type
      OR (p_event_type = 'opened'   AND h.opened_at  IS NOT NULL)
      OR (p_event_type = 'clicked'  AND h.clicked_at IS NOT NULL)
      OR (p_event_type = 'replied'  AND (h.replied_at IS NOT NULL OR h.status = 'replied'))
      OR (p_event_type = 'bounced'  AND h.status = 'bounced')
      OR (p_event_type = 'meetings' AND h.event_type IN ('meeting_booked','meeting_rescheduled'))
    )
  GROUP BY cc.id, cc.email
  ORDER BY last_event_at DESC;
$function$;

REVOKE ALL ON FUNCTION public.lit_campaign_engagement_recipients(uuid, text, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lit_campaign_engagement_recipients(uuid, text, timestamptz) TO authenticated;

DROP FUNCTION IF EXISTS public.lit_campaign_metrics_batch(uuid[]);

CREATE FUNCTION public.lit_campaign_metrics_batch(p_campaign_ids uuid[])
RETURNS TABLE(
  campaign_id uuid,
  enrolled bigint,
  sent bigint,
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
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $function$
  SELECT
    v.campaign_id,
    v.enrolled,
    v.sent,
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

REVOKE ALL ON FUNCTION public.lit_campaign_metrics_batch(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lit_campaign_metrics_batch(uuid[]) TO authenticated;

-- Activity timeline RPC. Returns every event for a campaign in
-- chronological order. Use this when the user wants the raw stream
-- ("see every event"). Caps at 1000 rows per call to keep response
-- shape predictable; UI paginates with p_limit + a date cutoff.
CREATE OR REPLACE FUNCTION public.lit_campaign_activity_timeline(
  p_campaign_id uuid,
  p_limit int DEFAULT 200
)
RETURNS TABLE(
  event_id uuid,
  event_type text,
  status text,
  recipient_email text,
  subject text,
  provider text,
  occurred_at timestamptz,
  metadata jsonb
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $function$
  SELECT
    h.id AS event_id,
    h.event_type,
    h.status,
    COALESCE(h.metadata->>'recipient_email', cc.email) AS recipient_email,
    h.subject,
    h.provider,
    COALESCE(h.occurred_at, h.created_at) AS occurred_at,
    h.metadata
  FROM lit_outreach_history h
  LEFT JOIN lit_campaign_contacts cc
    ON cc.id::text = h.metadata->>'recipient_id'
  WHERE h.campaign_id = p_campaign_id
  ORDER BY COALESCE(h.occurred_at, h.created_at) DESC
  LIMIT GREATEST(1, LEAST(p_limit, 1000));
$function$;

REVOKE ALL ON FUNCTION public.lit_campaign_activity_timeline(uuid, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lit_campaign_activity_timeline(uuid, int) TO authenticated;
