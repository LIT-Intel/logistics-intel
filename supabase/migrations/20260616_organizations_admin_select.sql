-- Normalize organizations SELECT policy: any org member (owner, admin, or
-- member) can SELECT their workspace row. There were three overlapping
-- SELECT policies previously ("Users can view orgs they belong to",
-- "Members can read organizations", plus an older owner-only variant in
-- some snapshots). Consolidating to one canonical policy avoids drift.
DROP POLICY IF EXISTS organizations_select_owner ON public.organizations;
DROP POLICY IF EXISTS organizations_select_member ON public.organizations;
DROP POLICY IF EXISTS "Users can view orgs they belong to" ON public.organizations;
DROP POLICY IF EXISTS "Members can read organizations" ON public.organizations;

CREATE POLICY organizations_select_member
  ON public.organizations
  FOR SELECT
  TO authenticated
  USING (
    owner_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.org_members om
      WHERE om.org_id = organizations.id
        AND om.user_id = auth.uid()
    )
  );

COMMENT ON POLICY organizations_select_member ON public.organizations IS
  'Any org member (owner, admin, or member) can SELECT their workspace row. Consolidates the previous owner/member overlapping SELECT policies into a single canonical rule.';
