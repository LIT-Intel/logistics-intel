-- 20260605120200_lit_campaigns_rls_org_scoped.sql
-- Phase 3: Org-scoped RLS.

BEGIN;

-- Drop legacy policies (names verified via pg_policy inspection 2026-06-05).
DROP POLICY IF EXISTS lit_campaigns_select_owner_or_admin ON public.lit_campaigns;
DROP POLICY IF EXISTS "Users can insert their own campaigns" ON public.lit_campaigns;
DROP POLICY IF EXISTS "Users can update their own campaigns" ON public.lit_campaigns;
DROP POLICY IF EXISTS "Users can delete their own campaigns" ON public.lit_campaigns;
-- Defensive: if a previous run created the new policies, drop them so we recreate cleanly.
DROP POLICY IF EXISTS lit_campaigns_select ON public.lit_campaigns;
DROP POLICY IF EXISTS lit_campaigns_insert ON public.lit_campaigns;
DROP POLICY IF EXISTS lit_campaigns_update ON public.lit_campaigns;
DROP POLICY IF EXISTS lit_campaigns_delete ON public.lit_campaigns;

CREATE POLICY lit_campaigns_select ON public.lit_campaigns
  FOR SELECT
  USING (
    org_id IN (
      SELECT om.org_id FROM public.org_members om
       WHERE om.user_id = auth.uid() AND om.status = 'active'
    )
    OR EXISTS (
      SELECT 1 FROM public.platform_admins pa WHERE pa.user_id = auth.uid()
    )
  );

CREATE POLICY lit_campaigns_insert ON public.lit_campaigns
  FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND org_id IN (
      SELECT om.org_id FROM public.org_members om
       WHERE om.user_id = auth.uid() AND om.status = 'active'
    )
  );

CREATE POLICY lit_campaigns_update ON public.lit_campaigns
  FOR UPDATE
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM public.org_members om
       WHERE om.org_id = public.lit_campaigns.org_id
         AND om.user_id = auth.uid()
         AND om.role IN ('owner', 'admin')
         AND om.status = 'active'
    )
  );

CREATE POLICY lit_campaigns_delete ON public.lit_campaigns
  FOR DELETE
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM public.org_members om
       WHERE om.org_id = public.lit_campaigns.org_id
         AND om.user_id = auth.uid()
         AND om.role IN ('owner', 'admin')
         AND om.status = 'active'
    )
  );

COMMIT;
