-- Allow org owners + admins to DELETE pending invites for their org.
-- Mirrors the existing UPDATE policy pattern on org_invites (which uses
-- the is_org_admin(org_id) helper). The Settings page Revoke button was
-- silently failing because no DELETE policy existed.
DROP POLICY IF EXISTS org_invites_delete_admin ON public.org_invites;
DROP POLICY IF EXISTS org_invites_delete_admins ON public.org_invites;
CREATE POLICY org_invites_delete_admins
  ON public.org_invites
  FOR DELETE
  TO authenticated
  USING (is_org_admin(org_id));

COMMENT ON POLICY org_invites_delete_admins ON public.org_invites IS
  'Org owners/admins can revoke (hard-delete) pending invites for their workspace. Mirrors the UPDATE policy pattern.';
