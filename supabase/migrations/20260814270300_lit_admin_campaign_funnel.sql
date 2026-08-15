-- Phase 3 Activation & Attribution: 4/5 campaign funnel from lit_demo_invites (+subs conversion/revenue, +Resend clicks)
-- Stage sources:
--   sent/delivered/opened/clicked/signed_up/trial : lit_demo_invites native timestamps
--   clicked (enrichment)                          : also lit_resend_events/email_webhook_events matched on recipient email
--   converted/revenue                             : subscriptions (via signed_up_user_id) + plans price
CREATE OR REPLACE FUNCTION public.lit_admin_campaign_funnel()
RETURNS TABLE (
  campaign        text,
  invited         bigint,
  delivered       bigint,
  opened          bigint,
  clicked         bigint,
  clicked_resend  bigint,
  signed_up       bigint,
  trial_started   bigint,
  converted       bigint,
  revenue_mrr     numeric
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
  WITH inv AS (
    SELECT
      -- No campaign column on lit_demo_invites; treat the demo-invite program as one campaign.
      'demo_invite' AS campaign,
      di.prospect_email,
      di.sent_at, di.delivered_at, di.opened_at, di.clicked_at,
      di.signed_up_at, di.signed_up_user_id, di.trial_started_at, di.upgraded_at
    FROM public.lit_demo_invites di
  ),
  -- Resend/webhook click enrichment: did this recipient email have a click event anywhere?
  resend_click AS (
    SELECT lower(email_to) AS email FROM public.lit_resend_events WHERE event_type='clicked'
    UNION
    SELECT lower(jsonb_array_elements_text(to_emails)) FROM public.email_webhook_events WHERE event_type='email.clicked'
  ),
  conv AS (
    SELECT s.user_id,
           bool_or((s.status='active' OR s.stripe_status='active') AND COALESCE(s.plan_code,'')<>'free_trial') AS is_converted,
           MAX(CASE WHEN (s.status='active' OR s.stripe_status='active') AND COALESCE(s.plan_code,'')<>'free_trial'
                    THEN CASE WHEN p.billing_interval='yearly' THEN COALESCE(p.price_yearly,0)/12.0 ELSE COALESCE(p.price_monthly,0) END
               END) AS mrr
    FROM public.subscriptions s
    LEFT JOIN public.plans p ON p.code = s.plan_code
    GROUP BY s.user_id
  )
  SELECT
    inv.campaign,
    count(*)                                                                          AS invited,
    count(inv.delivered_at)                                                           AS delivered,
    count(inv.opened_at)                                                              AS opened,
    count(inv.clicked_at)                                                             AS clicked,
    count(*) FILTER (WHERE rc.email IS NOT NULL)                                      AS clicked_resend,
    count(inv.signed_up_at)                                                           AS signed_up,
    count(inv.trial_started_at)                                                       AS trial_started,
    count(*) FILTER (WHERE conv.is_converted)                                         AS converted,
    COALESCE(SUM(conv.mrr) FILTER (WHERE conv.is_converted), 0)::numeric              AS revenue_mrr
  FROM inv
  LEFT JOIN resend_click rc ON rc.email = lower(inv.prospect_email)
  LEFT JOIN conv           ON conv.user_id = inv.signed_up_user_id
  WHERE public.is_platform_admin(auth.uid())
  GROUP BY inv.campaign
  ORDER BY invited DESC;
$fn$;

COMMENT ON FUNCTION public.lit_admin_campaign_funnel() IS
  'Platform-admin-gated campaign funnel reconstructed primarily from lit_demo_invites native timestamps (sent/delivered/opened/clicked/signed_up/trial). ''clicked_resend'' enriches clicks by matching prospect_email to lit_resend_events/email_webhook_events click events. converted/revenue_mrr come from subscriptions joined via signed_up_user_id (revenue from plans price; enterprise price NULL=0). lit_demo_invites has no campaign column, so the whole demo-invite program is a single ''demo_invite'' campaign.';

REVOKE ALL ON FUNCTION public.lit_admin_campaign_funnel() FROM public;
GRANT EXECUTE ON FUNCTION public.lit_admin_campaign_funnel() TO authenticated;
