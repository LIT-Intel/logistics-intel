-- Multi-tenant fix: org-scope lit_saved_companies, lit_rfps, lit_activity_events.
-- See 20260605120200_lit_campaigns_rls_org_scoped.sql for the reference pattern.
-- Applied to prod 2026-06-16 via Supabase MCP. Mirrored here so the auto-deploy
-- supabase db push treats it as idempotent.

BEGIN;

-- ── lit_saved_companies ────────────────────────────────────────────────
ALTER TABLE public.lit_saved_companies
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;

UPDATE public.lit_saved_companies sc
SET org_id = (
  SELECT om.org_id FROM public.org_members om
   WHERE om.user_id = sc.user_id AND om.status = 'active'
   ORDER BY om.joined_at ASC NULLS LAST
   LIMIT 1
)
WHERE sc.org_id IS NULL;

CREATE INDEX IF NOT EXISTS lit_saved_companies_org_id_idx ON public.lit_saved_companies(org_id);

DROP POLICY IF EXISTS "Users can view their own saved companies" ON public.lit_saved_companies;
DROP POLICY IF EXISTS "Users can insert their own saved companies" ON public.lit_saved_companies;
DROP POLICY IF EXISTS "Users can update their own saved companies" ON public.lit_saved_companies;
DROP POLICY IF EXISTS "Users can delete their own saved companies" ON public.lit_saved_companies;
DROP POLICY IF EXISTS lit_saved_companies_select ON public.lit_saved_companies;
DROP POLICY IF EXISTS lit_saved_companies_insert ON public.lit_saved_companies;
DROP POLICY IF EXISTS lit_saved_companies_update ON public.lit_saved_companies;
DROP POLICY IF EXISTS lit_saved_companies_delete ON public.lit_saved_companies;

CREATE POLICY lit_saved_companies_select ON public.lit_saved_companies
  FOR SELECT TO authenticated
  USING (
    org_id IS NOT NULL AND (
      org_id IN (SELECT om.org_id FROM public.org_members om WHERE om.user_id = auth.uid() AND om.status='active')
      OR EXISTS (SELECT 1 FROM public.platform_admins pa WHERE pa.user_id = auth.uid())
    )
  );

CREATE POLICY lit_saved_companies_insert ON public.lit_saved_companies
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND org_id IN (SELECT om.org_id FROM public.org_members om WHERE om.user_id = auth.uid() AND om.status='active')
  );

CREATE POLICY lit_saved_companies_update ON public.lit_saved_companies
  FOR UPDATE TO authenticated
  USING (
    auth.uid() = user_id
    OR EXISTS (SELECT 1 FROM public.org_members om WHERE om.org_id = lit_saved_companies.org_id AND om.user_id = auth.uid() AND om.role IN ('owner','admin') AND om.status='active')
  );

CREATE POLICY lit_saved_companies_delete ON public.lit_saved_companies
  FOR DELETE TO authenticated
  USING (
    auth.uid() = user_id
    OR EXISTS (SELECT 1 FROM public.org_members om WHERE om.org_id = lit_saved_companies.org_id AND om.user_id = auth.uid() AND om.role IN ('owner','admin') AND om.status='active')
  );

-- ── lit_rfps ───────────────────────────────────────────────────────────
ALTER TABLE public.lit_rfps ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS lit_rfps_org_id_idx ON public.lit_rfps(org_id);

DROP POLICY IF EXISTS "Users can view their own RFPs" ON public.lit_rfps;
DROP POLICY IF EXISTS "Users can insert their own RFPs" ON public.lit_rfps;
DROP POLICY IF EXISTS "Users can update their own RFPs" ON public.lit_rfps;
DROP POLICY IF EXISTS "Users can delete their own RFPs" ON public.lit_rfps;
DROP POLICY IF EXISTS lit_rfps_select ON public.lit_rfps;
DROP POLICY IF EXISTS lit_rfps_insert ON public.lit_rfps;
DROP POLICY IF EXISTS lit_rfps_update ON public.lit_rfps;
DROP POLICY IF EXISTS lit_rfps_delete ON public.lit_rfps;

CREATE POLICY lit_rfps_select ON public.lit_rfps FOR SELECT TO authenticated USING (
  org_id IS NOT NULL AND (
    org_id IN (SELECT om.org_id FROM public.org_members om WHERE om.user_id = auth.uid() AND om.status='active')
    OR EXISTS (SELECT 1 FROM public.platform_admins pa WHERE pa.user_id = auth.uid())
  )
);

CREATE POLICY lit_rfps_insert ON public.lit_rfps FOR INSERT TO authenticated WITH CHECK (
  auth.uid() = user_id AND org_id IN (SELECT om.org_id FROM public.org_members om WHERE om.user_id = auth.uid() AND om.status='active')
);

CREATE POLICY lit_rfps_update ON public.lit_rfps FOR UPDATE TO authenticated USING (
  auth.uid() = user_id OR EXISTS (SELECT 1 FROM public.org_members om WHERE om.org_id = lit_rfps.org_id AND om.user_id = auth.uid() AND om.role IN ('owner','admin') AND om.status='active')
);

CREATE POLICY lit_rfps_delete ON public.lit_rfps FOR DELETE TO authenticated USING (
  auth.uid() = user_id OR EXISTS (SELECT 1 FROM public.org_members om WHERE om.org_id = lit_rfps.org_id AND om.user_id = auth.uid() AND om.role IN ('owner','admin') AND om.status='active')
);

-- ── lit_activity_events ───────────────────────────────────────────────
ALTER TABLE public.lit_activity_events ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;

UPDATE public.lit_activity_events ae
SET org_id = (
  SELECT om.org_id FROM public.org_members om
   WHERE om.user_id = ae.user_id AND om.status='active'
   ORDER BY om.joined_at ASC NULLS LAST LIMIT 1
) WHERE ae.org_id IS NULL;

CREATE INDEX IF NOT EXISTS lit_activity_events_org_id_idx ON public.lit_activity_events(org_id);

DROP POLICY IF EXISTS "Users can view their own activity events" ON public.lit_activity_events;
DROP POLICY IF EXISTS "Users can insert their own activity events" ON public.lit_activity_events;
DROP POLICY IF EXISTS lit_activity_events_select ON public.lit_activity_events;
DROP POLICY IF EXISTS lit_activity_events_insert ON public.lit_activity_events;

CREATE POLICY lit_activity_events_select ON public.lit_activity_events FOR SELECT TO authenticated USING (
  org_id IS NOT NULL AND (
    org_id IN (SELECT om.org_id FROM public.org_members om WHERE om.user_id = auth.uid() AND om.status='active')
    OR EXISTS (SELECT 1 FROM public.platform_admins pa WHERE pa.user_id = auth.uid())
  )
);

CREATE POLICY lit_activity_events_insert ON public.lit_activity_events FOR INSERT TO authenticated WITH CHECK (
  auth.uid() = user_id AND org_id IN (SELECT om.org_id FROM public.org_members om WHERE om.user_id = auth.uid() AND om.status='active')
);

COMMIT;
