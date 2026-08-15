-- is_internal_user is an internal SQL predicate, not a public REST RPC.
-- Revoke EXECUTE from anon/authenticated so it can't be probed via
-- /rest/v1/rpc/is_internal_user (would leak which user ids are internal).
-- The metric functions that call it are SECURITY DEFINER and run as their
-- owner, so they are unaffected. Clears the two advisor WARNs on this fn.
revoke execute on function public.is_internal_user(uuid) from anon, authenticated, public;
grant execute on function public.is_internal_user(uuid) to service_role;
