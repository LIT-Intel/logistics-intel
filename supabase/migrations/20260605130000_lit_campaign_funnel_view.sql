-- 20260605130000_lit_campaign_funnel_view.sql
-- Per-campaign metrics aggregated from lit_outreach_history.
-- View inherits RLS from lit_campaigns (Postgres >= 15) so a user
-- only sees rows for campaigns they can already SELECT.

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
    WHERE h.campaign_id = c.id AND h.event_type = 'opened') AS opened,
  (SELECT count(*) FROM public.lit_outreach_history h
    WHERE h.campaign_id = c.id AND h.event_type = 'clicked') AS clicked,
  (SELECT count(*) FROM public.lit_outreach_history h
    WHERE h.campaign_id = c.id AND h.event_type = 'replied') AS replied,
  (SELECT count(*) FROM public.lit_outreach_history h
    WHERE h.campaign_id = c.id AND h.event_type = 'bounced') AS bounced,
  (SELECT count(*) FROM public.lit_outreach_history h
    WHERE h.campaign_id = c.id AND h.event_type = 'suppressed') AS suppressed,
  (SELECT max(created_at) FROM public.lit_outreach_history h
    WHERE h.campaign_id = c.id) AS last_event_at
FROM public.lit_campaigns c;

COMMENT ON VIEW public.lit_campaign_funnel_v IS
  'Per-campaign event aggregates from lit_outreach_history. Inherits RLS via lit_campaigns join.';

COMMIT;
