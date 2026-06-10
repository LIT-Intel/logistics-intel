-- 2026-06-10 — Surface unique_sent on lit_campaign_metrics_batch RPC.
--
-- The view 20260610180100 added the unique_sent column. The RPC was
-- recreated in the same transaction as the view because PostgreSQL
-- requires DROP+CREATE when a view's column list shifts, which
-- cascades to its function consumers.
--
-- This migration re-asserts the RPC shape idempotently so the change
-- is explicitly traceable in the migration history. Running it after
-- 180100 is a no-op (CREATE OR REPLACE with identical signature).

BEGIN;

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
