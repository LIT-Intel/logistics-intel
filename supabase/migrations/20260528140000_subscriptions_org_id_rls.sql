-- 20260528140000_subscriptions_org_id_rls.sql
--
-- Phase 3 of the subscriptions org-keyed migration.
--
-- Adds a NEW RLS read policy that lets every member of an org see that
-- org's subscription, alongside the existing user_id-scoped policy.
--
-- Critical invariant: RLS policies are UNIONed, not intersected. Two
-- SELECT policies means a row is visible if EITHER matches. This is the
-- safe transition path:
--
--   - Pre-Phase-1: only the user_id policy exists; nothing changes.
--   - Post-Phase-1, pre-Phase-3: same as above, org_id column populated
--     but no policy uses it yet.
--   - Post-Phase-3 (this migration): owners still see their own row;
--     invited members ALSO see the org's row because the new policy
--     matches via org_members lookup.
--   - Post-Phase-6: drop the user_id policy; org_id policy is the only
--     read gate.
--
-- INSERT/UPDATE policies are intentionally NOT touched here. They stay
-- user_id-scoped until the read migration in Phase 5 confirms every
-- write path also has org_id resolved. Writes from edge functions all
-- use service-role and bypass RLS anyway, so this is purely about
-- frontend RLS-scoped reads (currently forbidden from frontend per
-- CLAUDE.md, but the policy enforces the rule).

begin;

DROP POLICY IF EXISTS "Org members can read their org subscription" ON public.subscriptions;

CREATE POLICY "Org members can read their org subscription"
  ON public.subscriptions
  FOR SELECT
  TO authenticated
  USING (
    org_id IS NOT NULL
    AND org_id IN (
      SELECT org_id FROM public.org_members WHERE user_id = auth.uid()
    )
  );

-- The legacy policy stays in place during transition. Verify with:
--   SELECT polname FROM pg_policy WHERE polrelid = 'public.subscriptions'::regclass;
-- Expected after this migration:
--   - Users can read their own subscription          (legacy, user_id-scoped)
--   - Org members can read their org subscription    (new, org_id-scoped via org_members)

commit;
