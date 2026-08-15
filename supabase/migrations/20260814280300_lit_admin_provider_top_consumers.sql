-- Provider Data-Economics admin backend (4/4): top consumers drilldown.
-- Top orgs/users by credits over the trailing p_days window (unit-economics:
-- cost per org/user). Platform-admin only. Empty ledger => empty set, no error.

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
  group by e.organization_id, e.user_id
  order by credits_consumed desc, cost_usd desc
  limit greatest(p_limit, 1);
end;
$function$;

revoke all on function public.lit_admin_provider_top_consumers(int, int) from public;
grant execute on function public.lit_admin_provider_top_consumers(int, int) to authenticated;
