-- 20260528120000_subscriptions_add_org_id.sql
--
-- Phase 1 of the subscriptions org-keyed migration. See
-- docs/superpowers/plans/2026-05-28-subscriptions-org-keyed-design.md.
--
-- This migration is ADDITIVE and zero-downtime:
--   - Adds nullable `org_id` and `created_by_user_id` columns
--   - Adds an index on `org_id`
--   - Backfills `org_id` for rows where the owner relationship is unambiguous
--   - Does NOT change RLS yet (Phase 3) or drop the unique(user_id) constraint (Phase 6)
--
-- After this migration:
--   - All reads still work via user_id (existing code is unaffected)
--   - The tactical org-owner fallback in get-billing-status is unaffected
--   - New writes via billing-webhook should populate org_id (Phase 4 work)
--   - Reporting and admin surfaces can start consuming org_id where it's populated

begin;

alter table subscriptions
  add column if not exists org_id uuid references organizations(id) on delete cascade;

alter table subscriptions
  add column if not exists created_by_user_id uuid references auth.users(id);

create index if not exists idx_subscriptions_org_id
  on subscriptions(org_id);

-- Backfill 1: owner-keyed subscriptions where the org's owner_user_id matches.
update subscriptions s
set    org_id              = o.id,
       created_by_user_id  = coalesce(s.created_by_user_id, s.user_id)
from   organizations o
where  s.org_id is null
  and  o.owner_user_id = s.user_id;

-- Backfill 2: catch any remaining rows whose user is an owner/admin of an org.
-- Picks the user's earliest org membership where they have admin privileges.
update subscriptions s
set    org_id              = sub.org_id,
       created_by_user_id  = coalesce(s.created_by_user_id, s.user_id)
from   (
  select om.user_id, om.org_id
  from   org_members om
  where  om.role in ('owner','admin')
  order  by om.joined_at asc
) sub
where  s.org_id is null
  and  s.user_id = sub.user_id;

-- Reporting view: surface rows that need manual triage in Phase 6.
-- Run `select count(*) from subscriptions where org_id is null;` post-deploy
-- to size the remaining cleanup. Test accounts and orphaned subscriptions
-- (org deleted, user retained) typically explain the remainder.
comment on column subscriptions.org_id is
  'Tenant key. Populated by billing-webhook on every event from 2026-05-28 onward. NULL for legacy rows that need manual triage (Phase 6).';
comment on column subscriptions.created_by_user_id is
  'Audit field: the user who originated the subscription. Not used for lookups.';

commit;
