-- Phase 3 Activation & Attribution: 2/5 core milestone table + refresh function
CREATE TABLE IF NOT EXISTS public.lit_user_activation (
  user_id                    uuid PRIMARY KEY,
  org_id                     uuid,
  email                      text,
  signup_at                  timestamptz,
  signup_source              text,
  signup_landing             text,
  first_search_at            timestamptz,
  first_save_at              timestamptz,
  first_profile_view_at      timestamptz,
  first_enrichment_at        timestamptz,
  returned_d7_at             timestamptz,
  trial_started_at           timestamptz,
  converted_paid_at          timestamptz,
  current_plan               text,
  current_status             text,
  first_touch_utm_source     text,
  first_touch_utm_medium     text,
  first_touch_utm_campaign   text,
  first_touch_referrer       text,
  activity_count_30d         int,
  last_active_at             timestamptz,
  updated_at                 timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.lit_user_activation IS
  'One row per user: activation/attribution milestones for the Admin scoreboard. Kept fresh by refresh_user_activation() (intended pg_cron nightly). NOT trigger-maintained on hot save/search paths.';
COMMENT ON COLUMN public.lit_user_activation.returned_d7_at IS
  'Earliest user activity (lit_activity_events OR lit_usage_ledger) whose created_at is within [signup_at+7d, signup_at+14d). NULL if the user never returned in that window.';
COMMENT ON COLUMN public.lit_user_activation.converted_paid_at IS
  'When the user converted to a paid (non free_trial) subscription: earliest subscription where (status=''active'' OR stripe_status=''active'') AND plan_code <> ''free_trial''. Uses started_at, else current_period_start, else created_at.';
COMMENT ON COLUMN public.lit_user_activation.first_touch_utm_source IS
  'First-touch utm_source from auth.users.raw_user_meta_data->attribution. NOTE: as of 2026-08-14 the attribution blob only carries {ts, landing}; no utm keys exist yet, so this is read defensively and is NULL for all current users.';

CREATE INDEX IF NOT EXISTS idx_lit_user_activation_signup    ON public.lit_user_activation (signup_at);
CREATE INDEX IF NOT EXISTS idx_lit_user_activation_converted ON public.lit_user_activation (converted_paid_at);
CREATE INDEX IF NOT EXISTS idx_lit_user_activation_source    ON public.lit_user_activation (signup_source);

ALTER TABLE public.lit_user_activation ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS lit_user_activation_admin_read ON public.lit_user_activation;
CREATE POLICY lit_user_activation_admin_read ON public.lit_user_activation
  FOR SELECT TO authenticated USING (public.is_platform_admin(auth.uid()));

-- ---------------------------------------------------------------------------
-- refresh_user_activation(p_user_id) : idempotent upsert of one user or ALL.
-- SECURITY DEFINER so an admin / cron can maintain the table.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.refresh_user_activation(p_user_id uuid DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_count integer;
BEGIN
  WITH target AS (
    SELECT u.id AS user_id, u.email, u.created_at AS signup_at,
           u.raw_user_meta_data->'attribution' AS attr
    FROM auth.users u
    WHERE p_user_id IS NULL OR u.id = p_user_id
  ),
  -- org: prefer usage ledger, then activity, then saved, then subscription org
  org AS (
    SELECT t.user_id,
      COALESCE(
        (SELECT l.org_id FROM lit_usage_ledger l WHERE l.user_id=t.user_id AND l.org_id IS NOT NULL ORDER BY l.created_at LIMIT 1),
        (SELECT a.org_id FROM lit_activity_events a WHERE a.user_id=t.user_id AND a.org_id IS NOT NULL ORDER BY a.created_at LIMIT 1),
        (SELECT s.org_id FROM lit_saved_companies s WHERE s.user_id=t.user_id AND s.org_id IS NOT NULL ORDER BY s.created_at LIMIT 1)
      ) AS org_id
    FROM target t
  ),
  -- searched: usage ledger company_search UNION activity 'search'
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
  -- all activity timestamps (activity events + usage ledger) per user
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
  -- subscription rollups
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
  -- current plan/status: most recently updated subscription
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

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$fn$;

COMMENT ON FUNCTION public.refresh_user_activation(uuid) IS
  'Idempotent upsert of lit_user_activation for one user (p_user_id) or ALL users (NULL). Re-runnable. Intended cadence: pg_cron nightly (e.g. select cron.schedule(''refresh-user-activation'',''0 6 * * *'',$$select public.refresh_user_activation()$$)). Deliberately NOT a trigger on hot save/search paths.';

REVOKE ALL ON FUNCTION public.refresh_user_activation(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.refresh_user_activation(uuid) TO authenticated, service_role;

-- Initial backfill of all users.
SELECT public.refresh_user_activation(NULL);
