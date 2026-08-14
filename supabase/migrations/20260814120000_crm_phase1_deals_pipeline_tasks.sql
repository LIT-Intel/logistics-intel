-- CRM Phase 1 — Deals + configurable pipeline stages + tasks + deal timeline.
-- CEO-approved freight-broker CRM core. Evolves the per-company "CRM stage"
-- label on lit_saved_companies into real, org-scoped deals on a pipeline board.
--
-- Org-scoping model (mirrors 20260616_org_scope_saved_companies_rfps_activity):
--   all four tables are readable/writable by ACTIVE members of the owning org
--   (join org_members). No cross-org leakage. Platform admins can read.
--
-- RLS invariant (a recent bug shipped policies WITHOUT grants): every table
-- gets EXPLICIT base GRANTs to authenticated alongside its policies. Policies
-- filter rows; grants unlock the table verb. Both are required.
--
-- Applied to prod jkmrfiaefxwgbvftohrb via Supabase MCP; mirrored here so the
-- auto-deploy `supabase db push` treats it as idempotent.

BEGIN;

-- ── helper: active org membership predicate is inlined per-policy ──────────
-- (kept inline rather than a function so the query planner can use the
--  org_members index directly, consistent with the saved-companies policies.)

-- ════════════════════════════════════════════════════════════════════════
-- 1. lit_deal_stages — per-org configurable pipeline stages
-- ════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.lit_deal_stages (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name        text NOT NULL,
  position    int  NOT NULL DEFAULT 0,
  is_won      boolean NOT NULL DEFAULT false,
  is_lost     boolean NOT NULL DEFAULT false,
  color       text NOT NULL DEFAULT '#64748B',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lit_deal_stages_org_pos_idx
  ON public.lit_deal_stages(org_id, position);

-- ════════════════════════════════════════════════════════════════════════
-- 2. lit_deals
-- ════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.lit_deals (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id             uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  saved_company_id   uuid REFERENCES public.lit_saved_companies(id) ON DELETE SET NULL,
  company_id         text,                       -- source_company_key / company key
  title              text NOT NULL,
  value_amount       numeric,
  currency           text NOT NULL DEFAULT 'USD',
  stage_id           uuid NOT NULL REFERENCES public.lit_deal_stages(id) ON DELETE RESTRICT,
  status             text NOT NULL DEFAULT 'open' CHECK (status IN ('open','won','lost')),
  expected_close_date date,
  primary_contact_id uuid REFERENCES public.lit_contacts(id) ON DELETE SET NULL,
  owner_user_id      uuid NOT NULL DEFAULT auth.uid(),
  notes              text,
  created_by         uuid NOT NULL DEFAULT auth.uid(),
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  closed_at          timestamptz
);
CREATE INDEX IF NOT EXISTS lit_deals_org_stage_idx ON public.lit_deals(org_id, stage_id);
CREATE INDEX IF NOT EXISTS lit_deals_org_owner_idx ON public.lit_deals(org_id, owner_user_id);

-- ════════════════════════════════════════════════════════════════════════
-- 3. lit_tasks
-- ════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.lit_tasks (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  deal_id           uuid REFERENCES public.lit_deals(id) ON DELETE CASCADE,
  saved_company_id  uuid REFERENCES public.lit_saved_companies(id) ON DELETE SET NULL,
  contact_id        uuid REFERENCES public.lit_contacts(id) ON DELETE SET NULL,
  title             text NOT NULL,
  due_date          timestamptz,
  status            text NOT NULL DEFAULT 'open' CHECK (status IN ('open','done')),
  assignee_user_id  uuid NOT NULL DEFAULT auth.uid(),
  created_by        uuid NOT NULL DEFAULT auth.uid(),
  created_at        timestamptz NOT NULL DEFAULT now(),
  completed_at      timestamptz
);
CREATE INDEX IF NOT EXISTS lit_tasks_org_assignee_status_due_idx
  ON public.lit_tasks(org_id, assignee_user_id, status, due_date);
CREATE INDEX IF NOT EXISTS lit_tasks_deal_idx ON public.lit_tasks(deal_id);

-- ════════════════════════════════════════════════════════════════════════
-- 4. lit_deal_activity — deal timeline
-- ════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.lit_deal_activity (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id        uuid NOT NULL REFERENCES public.lit_deals(id) ON DELETE CASCADE,
  org_id         uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  kind           text NOT NULL CHECK (kind IN ('stage_change','note','task','email','meeting','created')),
  body           jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor_user_id  uuid DEFAULT auth.uid(),
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lit_deal_activity_deal_idx ON public.lit_deal_activity(deal_id, created_at DESC);

-- ════════════════════════════════════════════════════════════════════════
-- Seed defaults: freight-broker pipeline for a given org.
-- New / Qualified / Quoted / Negotiation / Won / Lost.
-- Idempotent — only seeds when the org has no stages yet.
-- ════════════════════════════════════════════════════════════════════════
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
  INSERT INTO public.lit_deal_stages (org_id, name, position, is_won, is_lost, color) VALUES
    (p_org_id, 'New',         0, false, false, '#6366F1'),
    (p_org_id, 'Qualified',   1, false, false, '#0EA5E9'),
    (p_org_id, 'Quoted',      2, false, false, '#F59E0B'),
    (p_org_id, 'Negotiation', 3, false, false, '#8B5CF6'),
    (p_org_id, 'Won',         4, true,  false, '#22C55E'),
    (p_org_id, 'Lost',        5, false, true,  '#94A3B8');
END;
$$;
REVOKE ALL ON FUNCTION public.lit_seed_deal_stages(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.lit_seed_deal_stages(uuid) TO authenticated, service_role;

-- Seed the internal org now.
SELECT public.lit_seed_deal_stages('7a16be7f-b6b9-499e-8618-533373970f7c');

-- ════════════════════════════════════════════════════════════════════════
-- Triggers. Split by timing because the activity rows FK to lit_deals(id):
--   BEFORE (ins+upd): derive status + closed_at from the new stage's
--                     is_won/is_lost flags + stamp updated_at (mutates NEW).
--   AFTER  (ins+upd): log the 'created' / 'stage_change' activity row — must
--                     run after the deal row exists or the FK fails.
-- ════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.lit_deals_stage_derive()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_won boolean; v_is_lost boolean;
BEGIN
  SELECT is_won, is_lost INTO v_is_won, v_is_lost
    FROM public.lit_deal_stages WHERE id = NEW.stage_id;
  NEW.status := CASE WHEN v_is_won THEN 'won' WHEN v_is_lost THEN 'lost' ELSE 'open' END;
  IF NEW.status IN ('won','lost') THEN NEW.closed_at := COALESCE(NEW.closed_at, now());
  ELSE NEW.closed_at := NULL; END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.lit_deals_log_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_name text; v_old_name text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT name INTO v_new_name FROM public.lit_deal_stages WHERE id = NEW.stage_id;
    INSERT INTO public.lit_deal_activity (deal_id, org_id, kind, body, actor_user_id)
    VALUES (NEW.id, NEW.org_id, 'created',
            jsonb_build_object('stage', v_new_name, 'title', NEW.title), NEW.created_by);
  ELSIF TG_OP = 'UPDATE' AND NEW.stage_id IS DISTINCT FROM OLD.stage_id THEN
    SELECT name INTO v_new_name FROM public.lit_deal_stages WHERE id = NEW.stage_id;
    SELECT name INTO v_old_name FROM public.lit_deal_stages WHERE id = OLD.stage_id;
    INSERT INTO public.lit_deal_activity (deal_id, org_id, kind, body, actor_user_id)
    VALUES (NEW.id, NEW.org_id, 'stage_change',
            jsonb_build_object('from', v_old_name, 'to', v_new_name), auth.uid());
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS lit_deals_stage_sync_ins ON public.lit_deals;
DROP TRIGGER IF EXISTS lit_deals_stage_sync_upd ON public.lit_deals;
DROP TRIGGER IF EXISTS lit_deals_derive_ins ON public.lit_deals;
DROP TRIGGER IF EXISTS lit_deals_derive_upd ON public.lit_deals;
DROP TRIGGER IF EXISTS lit_deals_log_ins ON public.lit_deals;
DROP TRIGGER IF EXISTS lit_deals_log_upd ON public.lit_deals;

CREATE TRIGGER lit_deals_derive_ins BEFORE INSERT ON public.lit_deals
  FOR EACH ROW EXECUTE FUNCTION public.lit_deals_stage_derive();
CREATE TRIGGER lit_deals_derive_upd BEFORE UPDATE ON public.lit_deals
  FOR EACH ROW EXECUTE FUNCTION public.lit_deals_stage_derive();
CREATE TRIGGER lit_deals_log_ins AFTER INSERT ON public.lit_deals
  FOR EACH ROW EXECUTE FUNCTION public.lit_deals_log_activity();
CREATE TRIGGER lit_deals_log_upd AFTER UPDATE ON public.lit_deals
  FOR EACH ROW EXECUTE FUNCTION public.lit_deals_log_activity();

-- These fire only as triggers; never expose them as REST RPCs (they are
-- SECURITY DEFINER — a direct call could forge activity rows).
REVOKE ALL ON FUNCTION public.lit_deals_stage_derive() FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.lit_deals_log_activity() FROM public, anon, authenticated;

-- ════════════════════════════════════════════════════════════════════════
-- RLS — enable + org-scoped policies + EXPLICIT base grants.
-- ════════════════════════════════════════════════════════════════════════
ALTER TABLE public.lit_deal_stages   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lit_deals         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lit_tasks         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lit_deal_activity ENABLE ROW LEVEL SECURITY;

-- Base grants (REQUIRED alongside policies).
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lit_deal_stages   TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lit_deals         TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lit_tasks         TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lit_deal_activity TO authenticated;

-- ── lit_deal_stages policies ──────────────────────────────────────────────
DROP POLICY IF EXISTS lit_deal_stages_select ON public.lit_deal_stages;
DROP POLICY IF EXISTS lit_deal_stages_insert ON public.lit_deal_stages;
DROP POLICY IF EXISTS lit_deal_stages_update ON public.lit_deal_stages;
DROP POLICY IF EXISTS lit_deal_stages_delete ON public.lit_deal_stages;

CREATE POLICY lit_deal_stages_select ON public.lit_deal_stages FOR SELECT TO authenticated USING (
  org_id IN (SELECT om.org_id FROM public.org_members om WHERE om.user_id = auth.uid() AND om.status='active')
  OR EXISTS (SELECT 1 FROM public.platform_admins pa WHERE pa.user_id = auth.uid())
);
CREATE POLICY lit_deal_stages_insert ON public.lit_deal_stages FOR INSERT TO authenticated WITH CHECK (
  org_id IN (SELECT om.org_id FROM public.org_members om WHERE om.user_id = auth.uid() AND om.status='active')
);
CREATE POLICY lit_deal_stages_update ON public.lit_deal_stages FOR UPDATE TO authenticated USING (
  org_id IN (SELECT om.org_id FROM public.org_members om WHERE om.user_id = auth.uid() AND om.status='active')
) WITH CHECK (
  org_id IN (SELECT om.org_id FROM public.org_members om WHERE om.user_id = auth.uid() AND om.status='active')
);
CREATE POLICY lit_deal_stages_delete ON public.lit_deal_stages FOR DELETE TO authenticated USING (
  EXISTS (SELECT 1 FROM public.org_members om WHERE om.org_id = lit_deal_stages.org_id AND om.user_id = auth.uid() AND om.role IN ('owner','admin') AND om.status='active')
);

-- ── lit_deals policies ────────────────────────────────────────────────────
DROP POLICY IF EXISTS lit_deals_select ON public.lit_deals;
DROP POLICY IF EXISTS lit_deals_insert ON public.lit_deals;
DROP POLICY IF EXISTS lit_deals_update ON public.lit_deals;
DROP POLICY IF EXISTS lit_deals_delete ON public.lit_deals;

CREATE POLICY lit_deals_select ON public.lit_deals FOR SELECT TO authenticated USING (
  org_id IN (SELECT om.org_id FROM public.org_members om WHERE om.user_id = auth.uid() AND om.status='active')
  OR EXISTS (SELECT 1 FROM public.platform_admins pa WHERE pa.user_id = auth.uid())
);
CREATE POLICY lit_deals_insert ON public.lit_deals FOR INSERT TO authenticated WITH CHECK (
  org_id IN (SELECT om.org_id FROM public.org_members om WHERE om.user_id = auth.uid() AND om.status='active')
);
CREATE POLICY lit_deals_update ON public.lit_deals FOR UPDATE TO authenticated USING (
  org_id IN (SELECT om.org_id FROM public.org_members om WHERE om.user_id = auth.uid() AND om.status='active')
) WITH CHECK (
  org_id IN (SELECT om.org_id FROM public.org_members om WHERE om.user_id = auth.uid() AND om.status='active')
);
CREATE POLICY lit_deals_delete ON public.lit_deals FOR DELETE TO authenticated USING (
  owner_user_id = auth.uid()
  OR created_by = auth.uid()
  OR EXISTS (SELECT 1 FROM public.org_members om WHERE om.org_id = lit_deals.org_id AND om.user_id = auth.uid() AND om.role IN ('owner','admin') AND om.status='active')
);

-- ── lit_tasks policies ────────────────────────────────────────────────────
DROP POLICY IF EXISTS lit_tasks_select ON public.lit_tasks;
DROP POLICY IF EXISTS lit_tasks_insert ON public.lit_tasks;
DROP POLICY IF EXISTS lit_tasks_update ON public.lit_tasks;
DROP POLICY IF EXISTS lit_tasks_delete ON public.lit_tasks;

CREATE POLICY lit_tasks_select ON public.lit_tasks FOR SELECT TO authenticated USING (
  org_id IN (SELECT om.org_id FROM public.org_members om WHERE om.user_id = auth.uid() AND om.status='active')
  OR EXISTS (SELECT 1 FROM public.platform_admins pa WHERE pa.user_id = auth.uid())
);
CREATE POLICY lit_tasks_insert ON public.lit_tasks FOR INSERT TO authenticated WITH CHECK (
  org_id IN (SELECT om.org_id FROM public.org_members om WHERE om.user_id = auth.uid() AND om.status='active')
);
CREATE POLICY lit_tasks_update ON public.lit_tasks FOR UPDATE TO authenticated USING (
  org_id IN (SELECT om.org_id FROM public.org_members om WHERE om.user_id = auth.uid() AND om.status='active')
) WITH CHECK (
  org_id IN (SELECT om.org_id FROM public.org_members om WHERE om.user_id = auth.uid() AND om.status='active')
);
CREATE POLICY lit_tasks_delete ON public.lit_tasks FOR DELETE TO authenticated USING (
  assignee_user_id = auth.uid()
  OR created_by = auth.uid()
  OR EXISTS (SELECT 1 FROM public.org_members om WHERE om.org_id = lit_tasks.org_id AND om.user_id = auth.uid() AND om.role IN ('owner','admin') AND om.status='active')
);

-- ── lit_deal_activity policies (insert + select; timeline is append-only) ──
DROP POLICY IF EXISTS lit_deal_activity_select ON public.lit_deal_activity;
DROP POLICY IF EXISTS lit_deal_activity_insert ON public.lit_deal_activity;

CREATE POLICY lit_deal_activity_select ON public.lit_deal_activity FOR SELECT TO authenticated USING (
  org_id IN (SELECT om.org_id FROM public.org_members om WHERE om.user_id = auth.uid() AND om.status='active')
  OR EXISTS (SELECT 1 FROM public.platform_admins pa WHERE pa.user_id = auth.uid())
);
CREATE POLICY lit_deal_activity_insert ON public.lit_deal_activity FOR INSERT TO authenticated WITH CHECK (
  org_id IN (SELECT om.org_id FROM public.org_members om WHERE om.user_id = auth.uid() AND om.status='active')
);

COMMIT;
