-- 20260605130100_lit_campaign_metrics_batch_rpc.sql
-- Batch metrics fetch for the campaigns list page. Returns one row
-- per requested campaign_id with raw counts + computed rates.
-- SECURITY DEFINER + inline RLS predicate because RPCs don't reliably
-- apply view RLS through STABLE bindings.

BEGIN;

CREATE OR REPLACE FUNCTION public.lit_campaign_metrics_batch(p_campaign_ids uuid[])
RETURNS TABLE (
  campaign_id   uuid,
  enrolled      bigint,
  sent          bigint,
  opened        bigint,
  clicked       bigint,
  replied       bigint,
  bounced       bigint,
  suppressed    bigint,
  last_event_at timestamptz,
  open_rate     numeric,
  click_rate    numeric,
  reply_rate    numeric,
  bounce_rate   numeric
)
LANGUAGE sql
STABLE SECURITY DEFINER
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
    v.last_event_at,
    CASE WHEN v.sent > 0 THEN ROUND(100.0 * v.opened  / v.sent, 1) ELSE NULL END AS open_rate,
    CASE WHEN v.sent > 0 THEN ROUND(100.0 * v.clicked / v.sent, 1) ELSE NULL END AS click_rate,
    CASE WHEN v.sent > 0 THEN ROUND(100.0 * v.replied / v.sent, 1) ELSE NULL END AS reply_rate,
    CASE WHEN v.sent > 0 THEN ROUND(100.0 * v.bounced / v.sent, 1) ELSE NULL END AS bounce_rate
    FROM public.lit_campaign_funnel_v v
   WHERE v.campaign_id = ANY(p_campaign_ids)
     AND (
       v.org_id IN (
         SELECT om.org_id FROM public.org_members om
          WHERE om.user_id = auth.uid() AND om.status = 'active'
       )
       OR EXISTS (
         SELECT 1 FROM public.platform_admins pa WHERE pa.user_id = auth.uid()
       )
     );
$function$;

GRANT EXECUTE ON FUNCTION public.lit_campaign_metrics_batch(uuid[]) TO authenticated;

COMMIT;
