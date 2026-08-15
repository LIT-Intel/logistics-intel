-- Provider Data-Economics admin backend (1/4): headline scoreboard summary.
-- Platform-admin only. Reads the Phase-2 cost ledger (provider_usage_events),
-- live provider_pricing ($/credit is NEVER hardcoded), the live ImportYeti
-- balance from lit_internal_meta, and subscriptions/plans for paid-customer +
-- (partial) revenue economics. Returns sane zeros/nulls on an empty ledger.
--
-- Exhaustion forecast: trailing 7-day average daily credit burn EXCLUDING cache
-- hits. avg_daily_burn = (sum credits_consumed over last 7 full-ish days where
-- cache_hit is not true) / 7. days_remaining = credits_remaining / avg_daily_burn.
-- projected_exhaustion_date = now() + days_remaining days. Zero burn => nulls.

create or replace function public.lit_admin_provider_economics_summary()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_credits_remaining numeric;
  v_balance_updated_at timestamptz;
  v_now timestamptz := now();
  v_today_start timestamptz := date_trunc('day', v_now);
  v_7d_start timestamptz := v_now - interval '7 days';
  v_period_start timestamptz := date_trunc('month', v_now);

  v_credits_used_today numeric;
  v_credits_used_7d numeric;
  v_credits_used_period numeric;
  v_cost_today numeric;
  v_cost_7d numeric;
  v_cost_period numeric;
  v_calls_today bigint;
  v_cache_true_7d bigint;
  v_total_7d bigint;
  v_cache_hit_rate_7d numeric;

  v_burn_7d numeric;          -- credits consumed last 7d excluding cache hits
  v_avg_daily_burn numeric;
  v_days_remaining numeric;
  v_exhaustion_date timestamptz;

  v_active_paid int;
  v_cost_per_paid numeric;

  v_mrr numeric;              -- derivable MRR from known plan prices
  v_mrr_complete boolean;     -- false if any paid active sub has unknown price
  v_contribution_margin numeric;

  v_is_placeholder boolean;
begin
  if not public.is_platform_admin(auth.uid()) then
    raise exception 'not authorized';
  end if;

  -- Live ImportYeti balance from meta (may be absent).
  select (meta_value->>'credits_remaining')::numeric,
         coalesce((meta_value->>'updated_at')::timestamptz, updated_at)
    into v_credits_remaining, v_balance_updated_at
  from public.lit_internal_meta
  where meta_key = 'importyeti_credits_remaining';

  -- Ledger aggregates (all coalesced so empty ledger -> zeros).
  select
    coalesce(sum(credits_consumed) filter (where created_at >= v_today_start), 0),
    coalesce(sum(credits_consumed) filter (where created_at >= v_7d_start), 0),
    coalesce(sum(credits_consumed) filter (where created_at >= v_period_start), 0),
    coalesce(sum(estimated_cost_usd) filter (where created_at >= v_today_start), 0),
    coalesce(sum(estimated_cost_usd) filter (where created_at >= v_7d_start), 0),
    coalesce(sum(estimated_cost_usd) filter (where created_at >= v_period_start), 0),
    coalesce(count(*) filter (where created_at >= v_today_start), 0),
    coalesce(count(*) filter (where created_at >= v_7d_start and cache_hit is true), 0),
    coalesce(count(*) filter (where created_at >= v_7d_start), 0),
    coalesce(sum(credits_consumed) filter (where created_at >= v_7d_start and cache_hit is not true), 0)
  into
    v_credits_used_today, v_credits_used_7d, v_credits_used_period,
    v_cost_today, v_cost_7d, v_cost_period,
    v_calls_today, v_cache_true_7d, v_total_7d, v_burn_7d
  from public.provider_usage_events;

  v_cache_hit_rate_7d := case when v_total_7d > 0
    then round(v_cache_true_7d::numeric / v_total_7d, 4) else 0 end;

  -- Exhaustion forecast on trailing-7d burn (excl cache hits). Zero-burn safe.
  v_avg_daily_burn := v_burn_7d / 7.0;
  if v_avg_daily_burn > 0 and v_credits_remaining is not null then
    v_days_remaining := round(v_credits_remaining / v_avg_daily_burn, 2);
    v_exhaustion_date := v_now + (v_days_remaining || ' days')::interval;
  else
    v_days_remaining := null;
    v_exhaustion_date := null;
  end if;

  -- Active paid customers: active (status + stripe_status) on a non-free plan.
  -- Enterprise counts as paid even though its price_monthly is NULL (custom).
  select count(*)
    into v_active_paid
  from public.subscriptions s
  join public.plans p on p.code = s.plan_code
  where s.status = 'active'
    and s.stripe_status = 'active'
    and s.plan_code <> 'free_trial'
    and coalesce(p.price_monthly, 1) > 0;  -- excludes explicit $0 plans; NULL(custom) kept

  v_cost_per_paid := case when v_active_paid > 0
    then round(v_cost_period / v_active_paid, 4) else null end;

  -- Derivable MRR from KNOWN plan prices only. If any qualifying paid active sub
  -- has an unknown price (e.g. enterprise custom = NULL), MRR is incomplete and
  -- we do NOT fabricate it: contribution margin is then withheld (null).
  select
    coalesce(sum(
      case when p.billing_interval = 'year' or s.billing_interval = 'year'
        then coalesce(p.price_yearly,0) / 12.0
        else coalesce(p.price_monthly,0) end
    ), 0),
    bool_and(p.price_monthly is not null or p.price_yearly is not null)
  into v_mrr, v_mrr_complete
  from public.subscriptions s
  join public.plans p on p.code = s.plan_code
  where s.status = 'active'
    and s.stripe_status = 'active'
    and s.plan_code <> 'free_trial'
    and coalesce(p.price_monthly, 1) > 0;

  if v_active_paid = 0 then
    v_mrr := 0;
    v_mrr_complete := true;  -- trivially complete: nothing owed
  end if;

  if v_mrr_complete and v_mrr > 0 then
    v_contribution_margin := round(((v_mrr - v_cost_period) / v_mrr) * 100, 2);
  else
    v_contribution_margin := null;  -- unknown revenue -> no fabricated margin
  end if;

  -- Placeholder-pricing badge: any ACTIVE importyeti row still at 0.02 $/credit.
  select exists(
    select 1 from public.provider_pricing
    where provider = 'importyeti' and active is true and usd_cost_per_credit = 0.02
  ) into v_is_placeholder;

  return jsonb_build_object(
    'credits_remaining', v_credits_remaining,
    'balance_updated_at', v_balance_updated_at,
    'credits_used_today', v_credits_used_today,
    'credits_used_7d', v_credits_used_7d,
    'credits_used_period', v_credits_used_period,
    'cost_usd_today', round(v_cost_today, 4),
    'cost_usd_7d', round(v_cost_7d, 4),
    'cost_usd_period', round(v_cost_period, 4),
    'calls_today', v_calls_today,
    'cache_hit_rate_7d', v_cache_hit_rate_7d,
    'active_paid_customers', v_active_paid,
    'cost_per_paid_customer_period', v_cost_per_paid,
    'avg_daily_burn_7d', round(v_avg_daily_burn, 4),
    'days_remaining', v_days_remaining,
    'projected_exhaustion_date', v_exhaustion_date,
    'mrr_usd', case when v_mrr_complete then round(v_mrr, 2) else null end,
    'mrr_is_complete', v_mrr_complete,
    'contribution_margin_pct', v_contribution_margin,
    'is_placeholder_pricing', v_is_placeholder,
    'period_start', v_period_start,
    'generated_at', v_now
  );
end;
$function$;

revoke all on function public.lit_admin_provider_economics_summary() from public;
grant execute on function public.lit_admin_provider_economics_summary() to authenticated;
