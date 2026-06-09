-- RPC: aggregate skip/failure events for a campaign for the in-UI badge.
BEGIN;
CREATE OR REPLACE FUNCTION public.lit_campaign_skip_summary(p_campaign_id uuid)
RETURNS TABLE (
  event_type text, skip_count bigint, most_recent timestamptz,
  sample_reason text, sample_recipient text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT h.event_type, count(*) AS skip_count, max(h.created_at) AS most_recent,
    (array_agg(h.metadata->>'reason' ORDER BY h.created_at DESC)
       FILTER (WHERE h.metadata->>'reason' IS NOT NULL))[1] AS sample_reason,
    (array_agg(h.metadata->>'recipient_email' ORDER BY h.created_at DESC)
       FILTER (WHERE h.metadata->>'recipient_email' IS NOT NULL))[1] AS sample_recipient
    FROM lit_outreach_history h
   WHERE h.campaign_id = p_campaign_id
     AND h.event_type IN ('consent_missing', 'daily_cap_reached', 'suppressed', 'send_failed')
     AND h.created_at > now() - interval '7 days'
     AND (EXISTS (SELECT 1 FROM lit_campaigns c WHERE c.id = p_campaign_id
                   AND (c.org_id IN (SELECT org_id FROM org_members
                                     WHERE user_id = auth.uid() AND status='active')
                        OR EXISTS (SELECT 1 FROM platform_admins pa
                                   WHERE pa.user_id = auth.uid()))))
   GROUP BY h.event_type ORDER BY skip_count DESC;
$function$;
GRANT EXECUTE ON FUNCTION public.lit_campaign_skip_summary(uuid) TO authenticated;
COMMIT;
