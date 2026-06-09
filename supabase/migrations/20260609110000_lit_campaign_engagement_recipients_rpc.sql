-- RPCs powering the per-recipient engagement drill-in slide-over.
--
-- lit_campaign_contacts has no `full_name` column (verified
-- 2026-06-09 against the live schema), so display_name falls back
-- to cc.email. If/when full_name lands, swap the SELECT for
-- coalesce(cc.full_name, cc.email) and re-add it to GROUP BY.

BEGIN;

CREATE OR REPLACE FUNCTION public.lit_campaign_engagement_recipients(
  p_campaign_id uuid,
  p_event_type text,
  p_since timestamptz
) RETURNS TABLE (
  recipient_id uuid,
  recipient_email text,
  display_name text,
  event_count bigint,
  first_event_at timestamptz,
  last_event_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER
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
     AND h.event_type = p_event_type
     AND h.created_at >= p_since
     AND (
       EXISTS (SELECT 1 FROM lit_campaigns c
                WHERE c.id = p_campaign_id
                  AND (c.org_id IN (SELECT org_id FROM org_members
                                    WHERE user_id = auth.uid() AND status='active')
                       OR EXISTS (SELECT 1 FROM platform_admins pa
                                  WHERE pa.user_id = auth.uid())))
     )
   GROUP BY cc.id, cc.email
   ORDER BY last_event_at DESC;
$function$;

GRANT EXECUTE ON FUNCTION public.lit_campaign_engagement_recipients(uuid, text, timestamptz) TO authenticated;

CREATE OR REPLACE FUNCTION public.lit_recipient_link_clicks(
  p_recipient_id uuid,
  p_campaign_id uuid
) RETURNS TABLE (
  link_id uuid,
  original_url text,
  click_count integer,
  first_clicked_at timestamptz,
  last_clicked_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT id AS link_id, original_url, click_count, first_clicked_at, last_clicked_at
    FROM lit_outreach_links
   WHERE recipient_id = p_recipient_id
     AND campaign_id = p_campaign_id
   ORDER BY click_count DESC;
$function$;

GRANT EXECUTE ON FUNCTION public.lit_recipient_link_clicks(uuid, uuid) TO authenticated;

COMMIT;
