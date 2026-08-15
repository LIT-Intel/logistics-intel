-- Complete the Part-A exclusion: the three provider-economics DRILLDOWN RPCs
-- (usage_breakdown, burn_series, top_consumers) read provider_usage_events, which
-- carries user_id. The prior sprint migration (300002) only patched the
-- _summary aggregate; these three still counted internal/test traffic. Add the
-- same `not is_internal_user(e.user_id)` filter. Exact prior definitions with
-- ONLY that predicate added. Non-destructive; signatures/columns unchanged.
--
-- Today internal users have 0 provider_usage_events rows, so output is unchanged
-- right now; this makes the exclusion correct for the upcoming journey test (and
-- any future internal usage) rather than relying on that happening to be empty.

-- 2/4 usage breakdown -------------------------------------------------------
create or replace function public.lit_admin_provider_usage_breakdown(p_days int default 7)
returns table (
  operation text,
  calls bigint,
  credits_consumed numeric,
  cost_usd numeric,
  cache_hits bigint,
  cache_hit_rate numeric,
  distinct_users bigint,
  distinct_orgs bigint
)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
begin
  if not public.is_platform_admin(auth.uid()) then
    raise exception 'not authorized';
  end if;

  return query
  select
    coalesce(e.operation, 'unknown') as operation,
    count(*)::bigint as calls,
    coalesce(sum(e.credits_consumed), 0) as credits_consumed,
    round(coalesce(sum(e.estimated_cost_usd), 0), 4) as cost_usd,
    count(*) filter (where e.cache_hit is true)::bigint as cache_hits,
    case when count(*) > 0
      then round(count(*) filter (where e.cache_hit is true)::numeric / count(*), 4)
      else 0 end as cache_hit_rate,
    count(distinct e.user_id)::bigint as distinct_users,
    count(distinct e.organization_id)::bigint as distinct_orgs
  from public.provider_usage_events e
  where e.created_at >= now() - (greatest(p_days, 1) || ' days')::interval
    and not public.is_internal_user(e.user_id)   -- exclude internal/test identities
  group by coalesce(e.operation, 'unknown')
  order by cost_usd desc, credits_consumed desc;
end;
$function$;

revoke all on function public.lit_admin_provider_usage_breakdown(int) from public;
grant execute on function public.lit_admin_provider_usage_breakdown(int) to authenticated;

-- 3/4 burn series -----------------------------------------------------------
create or replace function public.lit_admin_provider_burn_series(p_days int default 30)
returns table (
  day date,
  credits_consumed numeric,
  cost_usd numeric,
  calls bigint,
  cache_hits bigint
)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_days int := greatest(p_days, 1);
begin
  if not public.is_platform_admin(auth.uid()) then
    raise exception 'not authorized';
  end if;

  return query
  with days as (
    select generate_series(
      (date_trunc('day', now()) - ((v_days - 1) || ' days')::interval)::date,
      date_trunc('day', now())::date,
      interval '1 day'
    )::date as day
  ),
  agg as (
    select
      date_trunc('day', e.created_at)::date as day,
      coalesce(sum(e.credits_consumed), 0) as credits_consumed,
      coalesce(sum(e.estimated_cost_usd), 0) as cost_usd,
      count(*)::bigint as calls,
      count(*) filter (where e.cache_hit is true)::bigint as cache_hits
    from public.provider_usage_events e
    where e.created_at >= (date_trunc('day', now()) - ((v_days - 1) || ' days')::interval)
      and not public.is_internal_user(e.user_id)   -- exclude internal/test identities
    group by 1
  )
  select
    d.day,
    coalesce(a.credits_consumed, 0) as credits_consumed,
    round(coalesce(a.cost_usd, 0), 4) as cost_usd,
    coalesce(a.calls, 0) as calls,
    coalesce(a.cache_hits, 0) as cache_hits
  from days d
  left join agg a on a.day = d.day
  order by d.day;
end;
$function$;

revoke all on function public.lit_admin_provider_burn_series(int) from public;
grant execute on function public.lit_admin_provider_burn_series(int) to authenticated;

-- 4/4 top consumers ---------------------------------------------------------
create or replace function public.lit_admin_provider_top_consumers(
  p_days int default 30,
  p_limit int default 20
)
returns table (
  organization_id uuid,
  user_id uuid,
  subscription_tier text,
  credits_consumed numeric,
  cost_usd numeric,
  calls bigint
)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
begin
  if not public.is_platform_admin(auth.uid()) then
    raise exception 'not authorized';
  end if;

  return query
  select
    e.organization_id,
    e.user_id,
    max(e.subscription_tier) as subscription_tier,
    coalesce(sum(e.credits_consumed), 0) as credits_consumed,
    round(coalesce(sum(e.estimated_cost_usd), 0), 4) as cost_usd,
    count(*)::bigint as calls
  from public.provider_usage_events e
  where e.created_at >= now() - (greatest(p_days, 1) || ' days')::interval
    and not public.is_internal_user(e.user_id)   -- exclude internal/test identities
  group by e.organization_id, e.user_id
  order by credits_consumed desc, cost_usd desc
  limit greatest(p_limit, 1);
end;
$function$;

revoke all on function public.lit_admin_provider_top_consumers(int, int) from public;
grant execute on function public.lit_admin_provider_top_consumers(int, int) to authenticated;
