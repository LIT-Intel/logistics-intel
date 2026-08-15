-- Exclude flagged internal/test identities from every metric.
-- Each function below is the EXACT current definition with ONLY an added
-- `is_internal_user(...)` exclusion. No other logic changed.

-- 1) refresh_user_activation: never build an activation row for internal users.
CREATE OR REPLACE FUNCTION public.refresh_user_activation(p_user_id uuid DEFAULT NULL::uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_count integer;
BEGIN
  WITH target AS (
    SELECT u.id AS user_id, u.email, u.created_at AS signup_at,
           u.raw_user_meta_data->'attribution' AS attr
    FROM auth.users u
    WHERE (p_user_id IS NULL OR u.id = p_user_id)
      AND NOT public.is_internal_user(u.id)   -- exclude internal/test identities
  ),
  org AS (
    SELECT t.user_id,
      COALESCE(
        (SELECT l.org_id FROM lit_usage_ledger l WHERE l.user_id=t.user_id AND l.org_id IS NOT NULL ORDER BY l.created_at LIMIT 1),
        (SELECT a.org_id FROM lit_activity_events a WHERE a.user_id=t.user_id AND a.org_id IS NOT NULL ORDER BY a.created_at LIMIT 1),
        (SELECT s.org_id FROM lit_saved_companies s WHERE s.user_id=t.user_id AND s.org_id IS NOT NULL ORDER BY s.created_at LIMIT 1)
      ) AS org_id
    FROM target t
  ),
  fsearch AS (
    SELECT t.user_id, MIN(ts) AS first_search_at FROM target t
    JOIN LATERAL (
      SELECT l.created_at AS ts FROM lit_usage_ledger l WHERE l.user_id=t.user_id AND l.feature_key='company_search'
      UNION ALL
      SELECT a.created_at FROM lit_activity_events a WHERE a.user_id=t.user_id AND a.event_type='search'
    ) x ON true
    GROUP BY t.user_id
  ),
  fsave AS (
    SELECT t.user_id, MIN(s.created_at) AS first_save_at
    FROM target t JOIN lit_saved_companies s ON s.user_id=t.user_id
    GROUP BY t.user_id
  ),
  fview AS (
    SELECT t.user_id, MIN(l.created_at) AS first_profile_view_at
    FROM target t JOIN lit_usage_ledger l ON l.user_id=t.user_id AND l.feature_key='company_profile_view'
    GROUP BY t.user_id
  ),
  fenrich AS (
    SELECT t.user_id, MIN(l.created_at) AS first_enrichment_at
    FROM target t JOIN lit_usage_ledger l ON l.user_id=t.user_id AND l.feature_key='contact_enrichment'
    GROUP BY t.user_id
  ),
  activ AS (
    SELECT t.user_id, x.ts FROM target t
    JOIN LATERAL (
      SELECT a.created_at AS ts FROM lit_activity_events a WHERE a.user_id=t.user_id
      UNION ALL
      SELECT l.created_at FROM lit_usage_ledger l WHERE l.user_id=t.user_id
    ) x ON true
  ),
  d7 AS (
    SELECT a.user_id, MIN(a.ts) AS returned_d7_at
    FROM activ a JOIN target t ON t.user_id=a.user_id
    WHERE t.signup_at IS NOT NULL
      AND a.ts >= t.signup_at + interval '7 days'
      AND a.ts <  t.signup_at + interval '14 days'
    GROUP BY a.user_id
  ),
  lastact AS (
    SELECT user_id, MAX(ts) AS last_active_at,
           COUNT(*) FILTER (WHERE ts >= now() - interval '30 days') AS activity_count_30d
    FROM activ GROUP BY user_id
  ),
  sub_trial AS (
    SELECT s.user_id, MIN(COALESCE(s.started_at, s.trial_ends_at, s.created_at)) AS trial_started_at
    FROM subscriptions s JOIN target t ON t.user_id=s.user_id
    WHERE s.plan_code='free_trial' OR s.status='trialing' OR s.trial_ends_at IS NOT NULL
    GROUP BY s.user_id
  ),
  sub_conv AS (
    SELECT s.user_id, MIN(COALESCE(s.started_at, s.current_period_start, s.created_at)) AS converted_paid_at
    FROM subscriptions s JOIN target t ON t.user_id=s.user_id
    WHERE (s.status='active' OR s.stripe_status='active') AND COALESCE(s.plan_code,'') <> 'free_trial'
    GROUP BY s.user_id
  ),
  sub_cur AS (
    SELECT DISTINCT ON (s.user_id) s.user_id, s.plan_code AS current_plan, s.status AS current_status
    FROM subscriptions s JOIN target t ON t.user_id=s.user_id
    ORDER BY s.user_id, COALESCE(s.updated_at, s.created_at) DESC
  )
  INSERT INTO public.lit_user_activation AS ua (
    user_id, org_id, email, signup_at, signup_source, signup_landing,
    first_search_at, first_save_at, first_profile_view_at, first_enrichment_at,
    returned_d7_at, trial_started_at, converted_paid_at, current_plan, current_status,
    first_touch_utm_source, first_touch_utm_medium, first_touch_utm_campaign, first_touch_referrer,
    activity_count_30d, last_active_at, updated_at
  )
  SELECT
    t.user_id, o.org_id, t.email, t.signup_at,
    COALESCE(NULLIF(t.attr->>'utm_source',''), 'direct/unknown') AS signup_source,
    t.attr->>'landing' AS signup_landing,
    fsearch.first_search_at, fsave.first_save_at, fview.first_profile_view_at, fenrich.first_enrichment_at,
    d7.returned_d7_at, sub_trial.trial_started_at, sub_conv.converted_paid_at,
    sub_cur.current_plan, sub_cur.current_status,
    NULLIF(t.attr->>'utm_source','')   AS first_touch_utm_source,
    NULLIF(t.attr->>'utm_medium','')   AS first_touch_utm_medium,
    NULLIF(t.attr->>'utm_campaign','') AS first_touch_utm_campaign,
    NULLIF(t.attr->>'referrer','')     AS first_touch_referrer,
    COALESCE(lastact.activity_count_30d,0), lastact.last_active_at, now()
  FROM target t
  LEFT JOIN org o        ON o.user_id=t.user_id
  LEFT JOIN fsearch      ON fsearch.user_id=t.user_id
  LEFT JOIN fsave        ON fsave.user_id=t.user_id
  LEFT JOIN fview        ON fview.user_id=t.user_id
  LEFT JOIN fenrich      ON fenrich.user_id=t.user_id
  LEFT JOIN d7           ON d7.user_id=t.user_id
  LEFT JOIN lastact      ON lastact.user_id=t.user_id
  LEFT JOIN sub_trial    ON sub_trial.user_id=t.user_id
  LEFT JOIN sub_conv     ON sub_conv.user_id=t.user_id
  LEFT JOIN sub_cur      ON sub_cur.user_id=t.user_id
  ON CONFLICT (user_id) DO UPDATE SET
    org_id=EXCLUDED.org_id, email=EXCLUDED.email, signup_at=EXCLUDED.signup_at,
    signup_source=EXCLUDED.signup_source, signup_landing=EXCLUDED.signup_landing,
    first_search_at=EXCLUDED.first_search_at, first_save_at=EXCLUDED.first_save_at,
    first_profile_view_at=EXCLUDED.first_profile_view_at, first_enrichment_at=EXCLUDED.first_enrichment_at,
    returned_d7_at=EXCLUDED.returned_d7_at, trial_started_at=EXCLUDED.trial_started_at,
    converted_paid_at=EXCLUDED.converted_paid_at, current_plan=EXCLUDED.current_plan,
    current_status=EXCLUDED.current_status,
    first_touch_utm_source=EXCLUDED.first_touch_utm_source, first_touch_utm_medium=EXCLUDED.first_touch_utm_medium,
    first_touch_utm_campaign=EXCLUDED.first_touch_utm_campaign, first_touch_referrer=EXCLUDED.first_touch_referrer,
    activity_count_30d=EXCLUDED.activity_count_30d, last_active_at=EXCLUDED.last_active_at,
    updated_at=now();

  -- If an internal user already has a stale activation row (seeded before the
  -- exclusion), purge it so the scoreboard reflects exclusion immediately.
  DELETE FROM public.lit_user_activation ua
  WHERE public.is_internal_user(ua.user_id)
    AND (p_user_id IS NULL OR ua.user_id = p_user_id);

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$;

-- 2) acquisition funnel: exclude internal users.
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
  GROUP BY COALESCE(ua.signup_source, 'direct/unknown')
  ORDER BY signups DESC;
$function$;

-- 3) campaign funnel: exclude invites whose signup mapped to an internal user.
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
       OR NOT public.is_internal_user(di.signed_up_user_id)   -- exclude internal signups
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

-- 4) retention cohorts: exclude internal users.
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
