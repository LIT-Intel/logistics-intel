-- reply-receiver writes replies as an UPDATE to the SEND row in
-- lit_outreach_history: status='replied', replied_at=<ts>. The original
-- row keeps event_type='sent'. So filtering on event_type='replied'
-- returned 0 even though the reply was captured. Same shape applies if
-- a tracker writes opens/clicks to the _at column without inserting a
-- fresh row.
--
-- Fix: count each event by (event_type match) OR (_at column non-null
-- where present) OR (status flip where the tracker uses that).
--
-- Reproduced 2026-06-09: Test Campaign 1 had a real reply from
-- vraymond@logisticintel.com at 17:50:52 (replied_at populated on the
-- 17:29 send row). Reply Rate KPI showed 0 / drill-in showed empty.
-- After this migration: funnel.replied = 1, drill-in returns 1 recipient.

BEGIN;

CREATE OR REPLACE VIEW public.lit_campaign_funnel_v AS
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
  (SELECT max(created_at) FROM public.lit_outreach_history h
    WHERE h.campaign_id = c.id) AS last_event_at
FROM public.lit_campaigns c;

COMMIT;

-- Drill-in RPC: matching disjunction so the right-rail sidebar shows recipients.
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
      OR (p_event_type = 'opened'  AND h.opened_at  IS NOT NULL)
      OR (p_event_type = 'clicked' AND h.clicked_at IS NOT NULL)
      OR (p_event_type = 'replied' AND (h.replied_at IS NOT NULL OR h.status = 'replied'))
      OR (p_event_type = 'bounced' AND h.status = 'bounced')
    )
  GROUP BY cc.id, cc.email
  ORDER BY last_event_at DESC;
$function$;

REVOKE ALL ON FUNCTION public.lit_campaign_engagement_recipients(uuid, text, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lit_campaign_engagement_recipients(uuid, text, timestamptz) TO authenticated;
