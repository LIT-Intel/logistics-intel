-- 20260814290100_lit_admin_set_provider_price.sql
-- Admin Data Economics: let the platform owner set the REAL $/credit for a
-- provider operation from the Admin Command Deck, clearing the 0.02 placeholder.
--
-- Updates the ACTIVE provider_pricing row for (provider, operation). Returns the
-- updated row. Guards p_usd_cost_per_credit >= 0.
--
-- SECURITY DEFINER + self-gated on is_platform_admin(auth.uid()). Additive.

create or replace function public.lit_admin_set_provider_price(
  p_provider text,
  p_operation text,
  p_usd_cost_per_credit numeric
)
returns table(
  provider text,
  operation text,
  credit_cost numeric,
  usd_cost_per_credit numeric,
  active boolean
)
language plpgsql
volatile
security definer
set search_path to 'public'
as $function$
begin
  if not public.is_platform_admin(auth.uid()) then
    raise exception 'not authorized';
  end if;

  if p_usd_cost_per_credit is null or p_usd_cost_per_credit < 0 then
    raise exception 'usd_cost_per_credit must be >= 0';
  end if;

  update public.provider_pricing pp
     set usd_cost_per_credit = p_usd_cost_per_credit
   where pp.provider = p_provider
     and pp.operation = p_operation
     and pp.active is true;

  if not found then
    raise exception 'no active provider_pricing row for %/%', p_provider, p_operation;
  end if;

  return query
    select pp.provider, pp.operation, pp.credit_cost, pp.usd_cost_per_credit, pp.active
    from public.provider_pricing pp
    where pp.provider = p_provider
      and pp.operation = p_operation
      and pp.active is true;
end;
$function$;

revoke all on function public.lit_admin_set_provider_price(text, text, numeric) from public, anon;
grant execute on function public.lit_admin_set_provider_price(text, text, numeric) to authenticated;
