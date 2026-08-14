-- CRM Phase 2 — reporting / forecasting + natural-language pipeline answers.
--
-- Adds a per-stage win probability (drives the weighted-forecast KPI in the
-- new Reports view) and a single security-definer RPC, lit_pipeline_summary(),
-- that returns a fully org-scoped JSON snapshot of the workspace pipeline for
-- the Ask-LIT / Pulse Coach pipeline prompt chips.
--
-- Org-scoping model (mirrors Phase 1): the RPC resolves the caller's active
-- org from org_members (first active membership, joined_at ASC — the same
-- resolution crm.ts uses client-side) and filters every aggregate to that org.
-- No cross-org leakage; a solo user with no active membership gets an empty
-- snapshot rather than an error.
--
-- Applied to prod jkmrfiaefxwgbvftohrb via Supabase MCP; mirrored here so the
-- auto-deploy `supabase db push` treats it as idempotent.

BEGIN;

-- ════════════════════════════════════════════════════════════════════════
-- 1. Per-stage win probability (0–100). Defaults seeded by name below.
--    Weighted forecast = Σ(open deal value × stage probability / 100).
-- ════════════════════════════════════════════════════════════════════════
ALTER TABLE public.lit_deal_stages
  ADD COLUMN IF NOT EXISTS win_probability numeric NOT NULL DEFAULT 10;

-- Seed sensible defaults on EXISTING rows by canonical stage name. Only
-- touches rows still at the column default (10) so any org that later tunes
-- its own probabilities is never overwritten by a re-run.
UPDATE public.lit_deal_stages s
SET win_probability = v.prob
FROM (VALUES
  ('New', 10), ('Qualified', 25), ('Quoted', 50),
  ('Negotiation', 75), ('Won', 100), ('Lost', 0)
) AS v(name, prob)
WHERE lower(s.name) = lower(v.name)
  AND s.win_probability = 10;

-- Won/Lost flag-based backstop so any custom won/lost stage is correct even
-- if it isn't named exactly "Won"/"Lost".
UPDATE public.lit_deal_stages SET win_probability = 100 WHERE is_won  AND win_probability <> 100;
UPDATE public.lit_deal_stages SET win_probability = 0   WHERE is_lost AND win_probability <> 0;

-- Keep the seed function future-proof: newly-seeded orgs get probabilities
-- inline. (CREATE OR REPLACE — same signature as Phase 1.)
CREATE OR REPLACE FUNCTION public.lit_seed_deal_stages(p_org_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_org_id IS NULL THEN RETURN; END IF;
  IF EXISTS (SELECT 1 FROM public.lit_deal_stages WHERE org_id = p_org_id) THEN
    RETURN;
  END IF;
  INSERT INTO public.lit_deal_stages (org_id, name, position, is_won, is_lost, color, win_probability) VALUES
    (p_org_id, 'New',         0, false, false, '#6366F1', 10),
    (p_org_id, 'Qualified',   1, false, false, '#0EA5E9', 25),
    (p_org_id, 'Quoted',      2, false, false, '#F59E0B', 50),
    (p_org_id, 'Negotiation', 3, false, false, '#8B5CF6', 75),
    (p_org_id, 'Won',         4, true,  false, '#22C55E', 100),
    (p_org_id, 'Lost',        5, false, true,  '#94A3B8', 0);
END;
$$;
REVOKE ALL ON FUNCTION public.lit_seed_deal_stages(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.lit_seed_deal_stages(uuid) TO authenticated, service_role;

-- ════════════════════════════════════════════════════════════════════════
-- 2. lit_pipeline_summary() — org-scoped JSON snapshot for Ask-LIT.
--
--    SECURITY DEFINER but SAFE: it resolves the caller's OWN active org from
--    auth.uid() and hard-filters every aggregate to it. It never accepts an
--    org_id argument, so a caller can only ever read their own workspace.
--    "Stuck" = open deal whose latest activity (or creation, if none) is
--    older than 14 days. All money figures are REAL sums over lit_deals /
--    lit_deal_stages; the weighted forecast is the only modeled number
--    (value × stage probability), and the probabilities themselves are
--    real, admin-tunable column values.
-- ════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.lit_pipeline_summary()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org        uuid;
  v_result     jsonb;
  v_month_start timestamptz := date_trunc('month', now());
  v_stuck_before timestamptz := now() - interval '14 days';
BEGIN
  -- Resolve caller's active org (first active membership, joined_at ASC).
  SELECT om.org_id INTO v_org
  FROM public.org_members om
  WHERE om.user_id = auth.uid() AND om.status = 'active'
  ORDER BY om.joined_at ASC NULLS LAST
  LIMIT 1;

  IF v_org IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_active_org');
  END IF;

  WITH deal AS (
    SELECT d.*, s.name AS stage_name, s.win_probability, s.is_won, s.is_lost, s.position
    FROM public.lit_deals d
    JOIN public.lit_deal_stages s ON s.id = d.stage_id
    WHERE d.org_id = v_org
  ),
  -- latest activity per open deal (for the stuck-deal detection)
  last_act AS (
    SELECT a.deal_id, max(a.created_at) AS last_at
    FROM public.lit_deal_activity a
    WHERE a.org_id = v_org
    GROUP BY a.deal_id
  ),
  stuck AS (
    SELECT d.id, d.title, d.value_amount, d.stage_name,
           COALESCE(la.last_at, d.created_at) AS last_touch
    FROM deal d
    LEFT JOIN last_act la ON la.deal_id = d.id
    WHERE d.status = 'open'
      AND COALESCE(la.last_at, d.created_at) < v_stuck_before
    ORDER BY COALESCE(la.last_at, d.created_at) ASC
    LIMIT 10
  ),
  overdue_tasks AS (
    SELECT t.id, t.title, t.due_date, t.deal_id
    FROM public.lit_tasks t
    WHERE t.org_id = v_org AND t.status = 'open'
      AND t.due_date IS NOT NULL AND t.due_date < now()
    ORDER BY t.due_date ASC
    LIMIT 10
  ),
  stage_breakdown AS (
    SELECT s.id, s.name, s.position, s.win_probability, s.is_won, s.is_lost,
           COUNT(d.id) FILTER (WHERE d.status = 'open') AS open_count,
           COALESCE(SUM(d.value_amount) FILTER (WHERE d.status = 'open'), 0) AS open_value
    FROM public.lit_deal_stages s
    LEFT JOIN public.lit_deals d ON d.stage_id = s.id AND d.org_id = v_org
    WHERE s.org_id = v_org
    GROUP BY s.id, s.name, s.position, s.win_probability, s.is_won, s.is_lost
    ORDER BY s.position
  )
  SELECT jsonb_build_object(
    'ok', true,
    'generated_at', now(),
    'open_deal_count', (SELECT COUNT(*) FROM deal WHERE status = 'open'),
    'open_value', (SELECT COALESCE(SUM(value_amount),0) FROM deal WHERE status = 'open'),
    'weighted_forecast', (
      SELECT COALESCE(SUM(value_amount * win_probability / 100.0), 0)
      FROM deal WHERE status = 'open'
    ),
    'won_mtd_count', (SELECT COUNT(*) FROM deal WHERE status = 'won' AND closed_at >= v_month_start),
    'won_mtd_value', (SELECT COALESCE(SUM(value_amount),0) FROM deal WHERE status = 'won' AND closed_at >= v_month_start),
    'stage_breakdown', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'stage', name, 'open_count', open_count, 'open_value', open_value,
        'win_probability', win_probability, 'is_won', is_won, 'is_lost', is_lost
      )), '[]'::jsonb) FROM stage_breakdown),
    'stuck_deals', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', id, 'title', title, 'value', value_amount, 'stage', stage_name,
        'last_touch', last_touch,
        'days_stale', GREATEST(0, EXTRACT(DAY FROM (now() - last_touch))::int)
      )), '[]'::jsonb) FROM stuck),
    'stuck_count', (SELECT COUNT(*) FROM deal d LEFT JOIN last_act la ON la.deal_id = d.id
                    WHERE d.status='open' AND COALESCE(la.last_at, d.created_at) < v_stuck_before),
    'overdue_tasks', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', id, 'title', title, 'due_date', due_date
      )), '[]'::jsonb) FROM overdue_tasks)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.lit_pipeline_summary() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.lit_pipeline_summary() TO authenticated;

COMMIT;
