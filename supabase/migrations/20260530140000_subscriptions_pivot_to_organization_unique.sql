-- 20260530140000_subscriptions_pivot_to_organization_unique.sql
--
-- Phase 6 (corrected). APPLY ONLY AFTER:
--   1. 20260530120000 (backfill) is live + verified.
--   2. 20260530130000 (Phase 3 dual-policy RLS) has been live for >= 7 days
--      WITHOUT incident in the billing surface.
--   3. billing-webhook has been writing organization_id for >= 7 days.
--   4. All read consumers (get-billing-status, subscription-email-cron,
--      admin-api) prefer organization_id over user_id.
--
-- This migration is the irreversible cutover. After it, a user with no
-- org has no subscription. The legacy "owner_id = my user_id" path
-- becomes invalid; org membership IS the access boundary.

begin;

-- 1. Drop the legacy user_id-scoped read policy. The organization_id policy
--    from 20260530130000 covers the same access in the org-keyed model.
drop policy if exists "Users can read their own subscription" on public.subscriptions;

-- 2. Make organization_id NOT NULL. The backfill should have populated all
--    active rows; this guard catches any row that snuck in mid-transition.
do $$
declare
  null_count int;
begin
  select count(*) into null_count from public.subscriptions where organization_id is null;
  if null_count > 0 then
    raise exception
      'Cannot pivot subscriptions to org-keyed: % rows have NULL organization_id. Re-run backfill or triage those rows first.', null_count;
  end if;
end
$$;

alter table public.subscriptions alter column organization_id set not null;

-- 3. Drop the legacy UNIQUE on user_id and add UNIQUE on organization_id.
--    Detect by column rather than name in case the constraint was renamed.
do $$
declare
  constraint_name text;
begin
  select conname into constraint_name
  from pg_constraint c
  join pg_class t on t.oid = c.conrelid
  where t.relname = 'subscriptions'
    and c.contype = 'u'
    and (
      select array_agg(a.attname order by u.ord)
      from unnest(c.conkey) with ordinality as u(attnum, ord)
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = u.attnum
    ) = array['user_id'];
  if constraint_name is not null then
    execute format('alter table public.subscriptions drop constraint %I', constraint_name);
  end if;
end
$$;

alter table public.subscriptions
  add constraint subscriptions_organization_id_key unique (organization_id);

commit;
