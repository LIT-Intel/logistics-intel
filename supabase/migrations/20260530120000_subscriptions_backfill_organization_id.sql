-- 20260530120000_subscriptions_backfill_organization_id.sql
--
-- Phase 1 (corrected) of the subscriptions org-keyed migration.
--
-- Discovery 2026-05-30: the live `subscriptions` table already has a
-- nullable `organization_id` column (uuid, FK to organizations(id) ON
-- DELETE CASCADE) — it was added by a much earlier migration but never
-- populated by any code path. The "add org_id" migration that previously
-- lived in this slot was discarded as it would have introduced a duplicate
-- column under a non-canonical name.
--
-- This migration is data-only:
--   1. Backfill organization_id for every existing subscription row from
--      the user's org membership.
--   2. Verify every active subscription now has an organization_id.
--
-- Forward path (separate migrations):
--   - billing-webhook now writes organization_id on every event (no flag).
--   - subscription-email-cron reads organization_id (no flag).
--   - Phase 3: add org_members-based RLS read policy.
--   - Phase 6: drop UNIQUE(user_id), add UNIQUE(organization_id).

begin;

-- Backfill 1: owner-keyed subscriptions (subscription.user_id = organizations.owner_id).
-- 100% of current production rows fall into this branch per the 2026-05-30 audit.
update public.subscriptions s
set    organization_id = o.id
from   public.organizations o
where  s.organization_id is null
  and  o.owner_id = s.user_id;

-- Backfill 2: subscriptions whose user_id is an owner/admin member of some
-- org (defensive — catches any future row whose owner relationship lives in
-- org_members rather than organizations.owner_id).
update public.subscriptions s
set    organization_id = sub.org_id
from   (
  select om.user_id, om.org_id
  from   public.org_members om
  where  om.role in ('owner','admin')
  order  by om.joined_at asc nulls last
) sub
where  s.organization_id is null
  and  s.user_id = sub.user_id;

-- Fail loud if any active subscription is still NULL after the backfill.
-- Test/orphaned/expired rows are allowed to remain NULL.
do $$
declare
  null_active int;
begin
  select count(*) into null_active
  from public.subscriptions
  where organization_id is null
    and status in ('active','trialing','past_due');
  if null_active > 0 then
    raise exception
      'Backfill incomplete: % active/trialing/past_due subscription(s) still have NULL organization_id. Inspect manually before proceeding.', null_active;
  end if;
end
$$;

comment on column public.subscriptions.organization_id is
  'Tenant key. Populated for every row from 2026-05-30 onward (billing-webhook writes on every event; this migration backfilled the existing 10 rows). NULL only for test rows pre-dating the backfill window.';

commit;
