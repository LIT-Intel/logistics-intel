-- Engagement drill-in RPC was failing silently because the inner EXISTS
-- gate couldn't see auth.uid() reliably under SECURITY DEFINER. Frontend
-- saw "no data" for every tile click (Sent/Open/Click/Reply/Bounce) even
-- when the underlying join had matching rows.
--
-- Reproduced 2026-06-09: Test Campaign 1 (5249b682…) had 4 sent + 2 clicked
-- events in lit_outreach_history. RPC returned 0 rows under the previous
-- definition. With the EXISTS gate dropped: 2 recipients × 2 events.
--
-- Security preserved by:
--   1. EXECUTE granted only to authenticated role (PUBLIC is revoked).
--      Anon callers cannot hit this — PostgREST will return 401/permission-denied.
--   2. SECURITY INVOKER respects the caller's RLS on lit_outreach_history
--      and lit_campaign_contacts. RLS on those tables already scopes reads
--      to org membership / platform_admin.
--   3. The campaign_id is only discoverable via the campaign list, which
--      is org-scoped via lit_campaigns RLS.

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
    AND h.event_type = p_event_type
    AND h.created_at >= p_since
  GROUP BY cc.id, cc.email
  ORDER BY last_event_at DESC;
$function$;

REVOKE ALL ON FUNCTION public.lit_campaign_engagement_recipients(uuid, text, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lit_campaign_engagement_recipients(uuid, text, timestamptz) TO authenticated;
