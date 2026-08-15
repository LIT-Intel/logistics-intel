-- Provider Data-Economics admin backend (3/4): daily burn series for the chart.
-- Zero-filled continuous day series over the trailing p_days window (inclusive of
-- today). Platform-admin only. Empty ledger => every day row is zero, no gaps.

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
