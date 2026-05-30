-- 20260530130000_subscriptions_organization_id_rls.sql
--
-- Phase 3 (corrected) of the subscriptions org-keyed migration.
--
-- Adds a NEW RLS read policy that lets every member of an org see that
-- org's subscription, alongside the existing user_id-scoped policy.
-- RLS SELECT policies are UNIONed; either policy matching makes the row
-- visible. This is the safe transition path before the Phase 6 cutover.
--
-- Apply order:
--   1. 20260530120000 (backfill) MUST be applied first so every active row
--      has organization_id populated. The backfill migration's exception
--      guard ensures this; without populated org_id this policy is a no-op
--      for those rows.
--   2. billing-webhook must already be writing organization_id (it is, as
--      of the 2026-05-30 deploy — no flag).
--
-- INSERT/UPDATE policies are intentionally NOT touched — writes from edge
-- functions all use service-role and bypass RLS. Frontend writes to the
-- subscriptions table are forbidden per CLAUDE.md.

begin;

drop policy if exists "Org members can read their org subscription" on public.subscriptions;

create policy "Org members can read their org subscription"
  on public.subscriptions
  for select
  to authenticated
  using (
    organization_id is not null
    and organization_id in (
      select org_id from public.org_members where user_id = auth.uid()
    )
  );

-- The legacy user_id-scoped policy stays in place. After 7+ clean days,
-- 20260530140000_subscriptions_pivot_to_organization_unique.sql will drop
-- it and cut over to organization_id as the sole access key.

commit;
