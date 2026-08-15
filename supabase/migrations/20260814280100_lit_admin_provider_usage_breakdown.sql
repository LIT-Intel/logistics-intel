-- Provider Data-Economics admin backend (2/4): per-operation breakdown.
-- "Where the credits go" over the trailing p_days window. Platform-admin only.
-- Returns an empty set (no rows) cleanly when the ledger has no events.

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
  group by coalesce(e.operation, 'unknown')
  order by cost_usd desc, credits_consumed desc;
end;
$function$;

revoke all on function public.lit_admin_provider_usage_breakdown(int) from public;
grant execute on function public.lit_admin_provider_usage_breakdown(int) to authenticated;
