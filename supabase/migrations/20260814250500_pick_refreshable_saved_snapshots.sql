-- Phase 2B (credit-control): tier + active-user aware picker for the background
-- refresher (pulse-refresh-tick). Replaces the blunt "sweep the whole active
-- saved base" logic that refreshed churned/inactive users and ignored plan tier.
--
-- Selection rules (all enforced in SQL so the LIMIT/cap applies AFTER filtering):
--   1. Save must be refresh_status='active' with a non-null source_company_key.
--   2. Owner must be ACTIVE: at least one row in lit_activity_events OR
--      lit_usage_ledger created within the last 30 days. Users with no activity
--      in 30 days are skipped (churn/dormancy guard).
--   3. Owner must NOT be churned: their most-recent subscription's status /
--      stripe_status must not be canceled/incomplete_expired/unpaid/past_due.
--      Users with no subscription row default to the 'free_trial' tier.
--   4. Plan tier auto_refresh_frequency gates cadence:
--        - 'none' or NULL  => tier gets NO background refresh (skipped).
--        - 'weekly'        => snapshot must be older than 7 days (or missing).
--        - 'daily'         => snapshot must be older than 24 hours (or missing).
--      Snapshot age uses lit_importyeti_company_snapshot.updated_at; a save with
--      no snapshot yet (never-fetched) is always eligible for a daily/weekly tier.
--
-- Returns the stalest-first candidates with the context ids the tick needs to
-- meter each call (user_id, org_id, saved_company_id, subscription_tier).
--
-- SECURITY DEFINER + fixed search_path, mirrors pick_stale_saved_snapshots.

create or replace function public.pick_refreshable_saved_snapshots(p_limit integer)
returns table(
  source_company_key text,
  saved_company_id uuid,
  user_id uuid,
  org_id uuid,
  subscription_tier text,
  snapshot_updated_at timestamptz
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  with active_users as (
    -- Users with any activity in the last 30 days (activity OR usage ledger).
    select distinct u.user_id
    from (
      select user_id, created_at from public.lit_activity_events
      where created_at >= now() - interval '30 days'
      union all
      select user_id, created_at from public.lit_usage_ledger
      where created_at >= now() - interval '30 days'
    ) u
    where u.user_id is not null
  ),
  user_plan as (
    -- Most-recent non-churned subscription per user -> resolved plan cadence.
    select distinct on (s.user_id)
           s.user_id,
           coalesce(s.plan_code, 'free_trial') as plan_code,
           s.status,
           s.stripe_status
      from public.subscriptions s
     where s.user_id is not null
       and coalesce(lower(s.status), '') not in
             ('canceled','cancelled','incomplete_expired','unpaid','past_due')
       and coalesce(lower(s.stripe_status), '') not in
             ('canceled','cancelled','incomplete_expired','unpaid','past_due')
     order by s.user_id, s.updated_at desc nulls last, s.created_at desc nulls last
  ),
  candidates as (
    select
      sc.source_company_key,
      sc.id            as saved_company_id,
      sc.user_id,
      sc.org_id,
      coalesce(up.plan_code, 'free_trial')            as plan_code,
      coalesce(pl.auto_refresh_frequency, p_free.auto_refresh_frequency) as freq,
      s.updated_at     as snapshot_updated_at
    from public.lit_saved_companies sc
    join active_users au on au.user_id = sc.user_id
    left join user_plan up on up.user_id = sc.user_id
    left join public.plans pl on pl.code = coalesce(up.plan_code, 'free_trial')
    left join public.plans p_free on p_free.code = 'free_trial'
    left join public.lit_importyeti_company_snapshot s
           on s.company_id = sc.source_company_key
    where sc.refresh_status = 'active'
      and sc.source_company_key is not null
  ),
  eligible as (
    select distinct on (source_company_key)
      source_company_key,
      saved_company_id,
      user_id,
      org_id,
      plan_code as subscription_tier,
      snapshot_updated_at
    from candidates
    where freq in ('weekly','daily')  -- 'none'/NULL tiers excluded
      and (
        snapshot_updated_at is null  -- never fetched: always eligible
        or (freq = 'weekly' and snapshot_updated_at < now() - interval '7 days')
        or (freq = 'daily'  and snapshot_updated_at < now() - interval '24 hours')
      )
    order by source_company_key, snapshot_updated_at asc nulls first
  )
  select
    source_company_key,
    saved_company_id,
    user_id,
    org_id,
    subscription_tier,
    snapshot_updated_at
  from eligible
  order by snapshot_updated_at asc nulls first
  limit p_limit;
$function$;

comment on function public.pick_refreshable_saved_snapshots(integer) is
  'Phase 2B: tier + active-user aware picker for pulse-refresh-tick. Returns stalest-first active-owner saves whose plan cadence (weekly=7d / daily=24h; none/NULL excluded) is due. Never-fetched saves for weekly/daily tiers are always eligible.';

revoke all on function public.pick_refreshable_saved_snapshots(integer) from public;
grant execute on function public.pick_refreshable_saved_snapshots(integer) to service_role;
