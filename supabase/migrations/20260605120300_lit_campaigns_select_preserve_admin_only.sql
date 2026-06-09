-- Preserve is_admin_only=true gating on the org-scope SELECT branch.
-- Without this, the RLS rewrite in 20260605120200 widened admin-only
-- campaigns to all org members (regression vs the original
-- lit_campaigns_select_owner_or_admin policy which required is_admin_only=false).
-- Platform-admin branch unchanged — admins still see everything.

BEGIN;

DROP POLICY IF EXISTS lit_campaigns_select ON public.lit_campaigns;

CREATE POLICY lit_campaigns_select ON public.lit_campaigns
  FOR SELECT
  USING (
    (
      org_id IN (
        SELECT om.org_id FROM public.org_members om
         WHERE om.user_id = auth.uid() AND om.status = 'active'
      )
      AND COALESCE(is_admin_only, false) = false
    )
    OR EXISTS (
      SELECT 1 FROM public.platform_admins pa WHERE pa.user_id = auth.uid()
    )
  );

COMMIT;
