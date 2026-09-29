-- White-label / org-settings save threw "permission denied for function
-- is_org_admin" for any non-owner: the organizations UPDATE policy
-- "Admins can update organizations" calls is_org_admin(id, auth.uid()), but
-- EXECUTE was granted only to postgres/service_role. The owner path uses a
-- separate policy (owner_id = auth.uid()) that never calls the fn, which is
-- why it worked as admin but not otherwise. is_org_admin is SECURITY DEFINER
-- so this grant only lets the role CALL it — authorization is unchanged.
-- Applied to prod via MCP same day.
grant execute on function is_org_admin(uuid) to authenticated;
grant execute on function is_org_admin(uuid, uuid) to authenticated;
