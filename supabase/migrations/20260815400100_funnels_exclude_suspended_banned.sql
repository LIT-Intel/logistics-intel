-- Add suspended/banned exclusion to the 3 admin funnel read RPCs. Same column
-- signatures + ordering as before; only the WHERE/join filters change so a
-- stale activation row (or an unrefreshed one) never counts a spam user.

-- Acquisition funnel: exclude suspended/banned alongside internal.
CREATE OR REPLACE FUNCTION public.lit_admin_acquisition_funnel()
 RETURNS TABLE(source text, signups bigint, searched bigint, saved bigint, trial_started bigint, converted bigint, new_mrr numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    COALESCE(ua.signup_source, 'direct/unknown') AS source,
    count(*)                                              AS signups,
    count(ua.first_search_at)                             AS searched,
    count(ua.first_save_at)                               AS saved,
    count(ua.trial_started_at)                            AS trial_started,
    count(ua.converted_paid_at)                           AS converted,
    COALESCE(SUM(
      CASE WHEN ua.converted_paid_at IS NOT NULL THEN
        CASE WHEN p.billing_interval = 'yearly' THEN COALESCE(p.price_yearly,0)/12.0
             ELSE COALESCE(p.price_monthly,0) END
      END
    ), 0)::numeric                                        AS new_mrr
  FROM public.lit_user_activation ua
  LEFT JOIN public.plans p ON p.code = ua.current_plan
  WHERE public.is_platform_admin(auth.uid())
    AND NOT public.is_internal_user(ua.user_id)   -- exclude internal/test identities
    AND NOT public.is_suspended_or_banned(ua.user_id)   -- exclude suspended/banned (spam)
  GROUP BY COALESCE(ua.signup_source, 'direct/unknown')
  ORDER BY signups DESC;
$function$;

-- Retention cohorts: exclude suspended/banned alongside internal.
CREATE OR REPLACE FUNCTION public.lit_admin_retention_cohorts(p_grain text DEFAULT 'week'::text)
 RETURNS TABLE(cohort date, cohort_size bigint, weeks_since integer, retained bigint, retained_pct numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH base AS (
    SELECT ua.user_id, ua.signup_at,
           CASE WHEN p_grain='month' THEN date_trunc('month', ua.signup_at)
                ELSE date_trunc('week', ua.signup_at) END AS cohort_ts
    FROM public.lit_user_activation ua
    WHERE ua.signup_at IS NOT NULL
      AND public.is_platform_admin(auth.uid())
      AND NOT public.is_internal_user(ua.user_id)   -- exclude internal/test identities
      AND NOT public.is_suspended_or_banned(ua.user_id)   -- exclude suspended/banned (spam)
  ),
  sizes AS (
    SELECT cohort_ts, count(*) AS cohort_size FROM base GROUP BY cohort_ts
  ),
  activity AS (
    SELECT b.user_id, b.cohort_ts,
           floor(EXTRACT(epoch FROM (act.ts - b.signup_at)) / 604800)::int AS weeks_since
    FROM base b
    JOIN LATERAL (
      SELECT a.created_at AS ts FROM lit_activity_events a WHERE a.user_id=b.user_id
      UNION ALL
      SELECT l.created_at FROM lit_usage_ledger l WHERE l.user_id=b.user_id
    ) act ON act.ts >= b.signup_at
  )
  SELECT
    s.cohort_ts::date            AS cohort,
    s.cohort_size,
    a.weeks_since,
    count(DISTINCT a.user_id)     AS retained,
    round(count(DISTINCT a.user_id)::numeric / NULLIF(s.cohort_size,0) * 100, 1) AS retained_pct
  FROM sizes s
  JOIN activity a ON a.cohort_ts = s.cohort_ts
  WHERE a.weeks_since >= 0
  GROUP BY s.cohort_ts, s.cohort_size, a.weeks_since
  ORDER BY s.cohort_ts, a.weeks_since;
$function$;

-- Campaign funnel: the invited set already filters internal signups; add
-- suspended/banned to the same guard (signed-up user only; null stays counted
-- as invited-but-not-signed).
CREATE OR REPLACE FUNCTION public.lit_admin_campaign_funnel()
 RETURNS TABLE(campaign text, invited bigint, delivered bigint, opened bigint, clicked bigint, clicked_resend bigint, signed_up bigint, trial_started bigint, converted bigint, revenue_mrr numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH inv AS (
    SELECT
      'demo_invite' AS campaign,
      di.prospect_email,
      di.sent_at, di.delivered_at, di.opened_at, di.clicked_at,
      di.signed_up_at, di.signed_up_user_id, di.trial_started_at, di.upgraded_at
    FROM public.lit_demo_invites di
    WHERE di.signed_up_user_id IS NULL
       OR (NOT public.is_internal_user(di.signed_up_user_id)   -- exclude internal signups
           AND NOT public.is_suspended_or_banned(di.signed_up_user_id))   -- exclude suspended/banned
  ),
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
$function$;
