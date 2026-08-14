-- lit_pipeline_summary: add optional p_owner_user_id ("view as [user]" for owner/admin).
--
-- The function is SECURITY DEFINER (bypasses RLS), so owner-scoping is re-applied
-- in-body to match the new owner-scoped RLS on lit_deals/lit_tasks/lit_deal_activity:
--   * member:  ALWAYS forced to their own uid; p_owner_user_id is ignored (no spoof).
--   * owner/admin: p_owner_user_id filters to that member's pipeline; NULL = whole org.
--
-- Drop the old zero-arg signature so the new DEFAULT-NULL overload isn't ambiguous
-- when called with no args.
DROP FUNCTION IF EXISTS public.lit_pipeline_summary();

CREATE OR REPLACE FUNCTION public.lit_pipeline_summary(p_owner_user_id uuid DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_org        uuid;
  v_uid        uuid := auth.uid();
  v_is_manager boolean := false;
  v_owner      uuid;    -- effective owner filter (NULL = all deals in org)
  v_result     jsonb;
  v_month_start timestamptz := date_trunc('month', now());
  v_stuck_before timestamptz := now() - interval '14 days';
BEGIN
  SELECT om.org_id INTO v_org
  FROM public.org_members om
  WHERE om.user_id = v_uid AND om.status = 'active'
  ORDER BY om.joined_at ASC NULLS LAST
  LIMIT 1;

  IF v_org IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_active_org');
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.org_members om
    WHERE om.org_id = v_org AND om.user_id = v_uid
      AND om.role = ANY (ARRAY['owner','admin']) AND om.status = 'active'
  ) INTO v_is_manager;

  -- Effective owner scope:
  --  * manager: honour p_owner_user_id when provided, else all deals (NULL).
  --  * member:  always forced to their own uid (ignore p_owner_user_id).
  IF v_is_manager THEN
    v_owner := p_owner_user_id;   -- may be NULL = whole org
  ELSE
    v_owner := v_uid;
  END IF;

  WITH deal AS (
    SELECT d.*, s.name AS stage_name, s.win_probability, s.is_won, s.is_lost, s.position
    FROM public.lit_deals d
    JOIN public.lit_deal_stages s ON s.id = d.stage_id
    WHERE d.org_id = v_org
      AND (v_owner IS NULL OR d.owner_user_id = v_owner)
  ),
  last_act AS (
    SELECT a.deal_id, max(a.created_at) AS last_at
    FROM public.lit_deal_activity a
    WHERE a.org_id = v_org
      AND (v_owner IS NULL OR a.deal_id IN (SELECT id FROM deal))
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
      AND (v_owner IS NULL OR t.assignee_user_id = v_owner)
    ORDER BY t.due_date ASC
    LIMIT 10
  ),
  stage_breakdown AS (
    SELECT s.id, s.name, s.position, s.win_probability, s.is_won, s.is_lost,
           COUNT(d.id) FILTER (WHERE d.status = 'open') AS open_count,
           COALESCE(SUM(d.value_amount) FILTER (WHERE d.status = 'open'), 0) AS open_value
    FROM public.lit_deal_stages s
    LEFT JOIN public.lit_deals d
      ON d.stage_id = s.id AND d.org_id = v_org
      AND (v_owner IS NULL OR d.owner_user_id = v_owner)
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
$function$;

GRANT EXECUTE ON FUNCTION public.lit_pipeline_summary(uuid) TO authenticated;
