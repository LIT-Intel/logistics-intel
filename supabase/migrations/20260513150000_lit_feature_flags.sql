-- Phase 3C — Feature flags table + admin RPC.
--
-- Mirrors what the admin dashboard's Feature Flags panel expects per
-- the design handoff. Per-plan boolean columns (free/growth/scale/
-- enterprise), global kill-switches, and a 0-100 rollout percentage.
-- Read access is admin-only; write access goes through
-- lit_admin_set_flag(), which is superadmin-only and audits every
-- mutation.

CREATE TABLE IF NOT EXISTS public.lit_feature_flags (
  key text PRIMARY KEY,
  label text NOT NULL,
  description text,
  scope text NOT NULL CHECK (scope IN ('per-plan','global')),
  free boolean,
  growth boolean,
  scale boolean,
  enterprise boolean,
  global_kill boolean NOT NULL DEFAULT false,
  rollout int NOT NULL DEFAULT 100 CHECK (rollout BETWEEN 0 AND 100),
  owner text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.lit_feature_flags ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS lit_feature_flags_admin_read ON public.lit_feature_flags;
CREATE POLICY lit_feature_flags_admin_read ON public.lit_feature_flags
  FOR SELECT TO authenticated USING (public.is_admin_caller());
GRANT SELECT ON public.lit_feature_flags TO authenticated;

DROP TRIGGER IF EXISTS trg_lit_feature_flags_touch ON public.lit_feature_flags;
CREATE TRIGGER trg_lit_feature_flags_touch
BEFORE UPDATE ON public.lit_feature_flags
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

INSERT INTO public.lit_feature_flags (key, label, description, scope, free, growth, scale, enterprise, rollout, owner) VALUES
  ('ai_insights_v2',       'AI Insights v2',           'Second-gen company brief with LLM summary',           'per-plan', false, false, true, true,  100, 'eng-insights'),
  ('predictive_score',     'Predictive buyer score',   'Shipment-based propensity model (beta)',              'per-plan', false, false, false,true,  25,  'ml-platform'),
  ('multi_inbox',          'Multi-inbox sending',      'Multiple connected sender inboxes per campaign',      'per-plan', false, true,  true, true,  100, 'outreach'),
  ('deal_builder_exports', 'Deal Builder · CSV',       'Export RFP / quote benchmarks to CSV',                'per-plan', false, true,  true, true,  100, 'deals'),
  ('new_dashboard',        'Dashboard redesign',       'New KPI layout',                                      'per-plan', true,  true,  true, true,  100, 'design')
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.lit_feature_flags (key, label, description, scope, global_kill, rollout, owner) VALUES
  ('li_scraper_v2',        'LinkedIn scraper v2',      'New PhantomBuster agent pipeline',                    'global', false, 40, 'outreach'),
  ('maintenance_read_only','Read-only mode',           'Kill-switch for write endpoints during incident',     'global', false, 0,  'sre')
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.lit_admin_set_flag(
  p_key text, p_field text, p_value text
) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_actor uuid;
  v_is_super boolean;
  v_old jsonb;
  v_new jsonb;
BEGIN
  v_actor := auth.uid();
  SELECT EXISTS (SELECT 1 FROM public.platform_admins WHERE user_id = v_actor) INTO v_is_super;
  IF NOT v_is_super THEN RAISE EXCEPTION 'not_superadmin'; END IF;
  IF p_field NOT IN ('free','growth','scale','enterprise','global_kill','rollout') THEN
    RAISE EXCEPTION 'invalid_field %', p_field;
  END IF;
  SELECT to_jsonb(f) INTO v_old FROM public.lit_feature_flags f WHERE key = p_key;
  IF v_old IS NULL THEN RAISE EXCEPTION 'flag_not_found %', p_key; END IF;
  IF p_field = 'rollout' THEN
    UPDATE public.lit_feature_flags SET rollout = LEAST(100, GREATEST(0, p_value::int)) WHERE key = p_key;
  ELSE
    EXECUTE format('UPDATE public.lit_feature_flags SET %I = $1::boolean WHERE key = $2', p_field)
      USING NULLIF(p_value, 'null'), p_key;
  END IF;
  SELECT to_jsonb(f) INTO v_new FROM public.lit_feature_flags f WHERE key = p_key;
  PERFORM public.lit_audit_write(
    v_actor, 'superadmin', 'admin.flag.toggle',
    format('%s · %s → %s', p_key, p_field, p_value),
    CASE WHEN p_field = 'global_kill' AND p_value = 'true' THEN 'warn' ELSE 'info' END,
    'admin',
    jsonb_build_object('key', p_key, 'field', p_field, 'value', p_value, 'before', v_old, 'after', v_new)
  );
  RETURN p_value;
END;
$$;
GRANT EXECUTE ON FUNCTION public.lit_admin_set_flag(text, text, text) TO authenticated;
