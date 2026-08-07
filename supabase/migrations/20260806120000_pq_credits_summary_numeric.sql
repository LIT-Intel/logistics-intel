-- lit_get_pq_credits_summary() has been throwing since ImportYeti began
-- reporting fractional credits: lit_internal_meta holds
-- {"credits_remaining": 99.2} and the old integer cast raises
-- `invalid input syntax for type integer: "99.2"`. Return numeric instead.
-- (Return-type change requires drop + recreate.)

drop function if exists public.lit_get_pq_credits_summary();

create function public.lit_get_pq_credits_summary()
returns table(
  credits_remaining numeric,
  credits_burned_30d numeric,
  last_sync_at timestamptz
)
language sql
stable security definer
set search_path to 'public'
as $$
  with meta as (
    select
      nullif(meta_value->>'credits_remaining', '')::numeric as credits_remaining,
      updated_at
    from public.lit_internal_meta
    where meta_key = 'importyeti_credits_remaining'
    limit 1
  ),
  burn as (
    select coalesce(sum(credits), 0)::numeric as burned
    from public.lit_credit_ledger
    where action = 'importyeti_powerquery_sync'
      and created_at > now() - interval '30 days'
  )
  select
    (select credits_remaining from meta),
    (select burned from burn),
    (select updated_at from meta);
$$;
