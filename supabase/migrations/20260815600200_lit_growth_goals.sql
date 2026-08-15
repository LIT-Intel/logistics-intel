-- Growth Sprint DATA foundation 3/8: growth goals (sprint targets) + seed active sprint.
CREATE TABLE IF NOT EXISTS public.lit_growth_goals (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  metric      text NOT NULL,
  target      integer NOT NULL,
  start_at    timestamptz NOT NULL,
  end_at      timestamptz NOT NULL,
  active      boolean NOT NULL DEFAULT true,
  created_by  uuid,
  created_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.lit_growth_goals IS
  'Growth-sprint targets. lit_admin_growth_sprint_status() reports against the active goal. metric matches a countable milestone (e.g. trial_signup).';

ALTER TABLE public.lit_growth_goals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS lit_growth_goals_admin_read ON public.lit_growth_goals;
CREATE POLICY lit_growth_goals_admin_read ON public.lit_growth_goals
  FOR SELECT TO authenticated
  USING (public.is_platform_admin(auth.uid()));
-- Writes flow through service role (bypasses RLS). No authenticated write policy.

-- Seed the active 50 Subscriber Sprint (idempotent by name).
INSERT INTO public.lit_growth_goals (name, metric, target, start_at, end_at, active)
SELECT '50 Subscriber Sprint', 'trial_signup', 50,
       '2026-08-15T00:00:00Z'::timestamptz, '2026-08-22T00:00:00Z'::timestamptz, true
WHERE NOT EXISTS (
  SELECT 1 FROM public.lit_growth_goals WHERE name = '50 Subscriber Sprint'
);
