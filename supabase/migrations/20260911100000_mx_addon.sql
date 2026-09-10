-- 20260911100000_mx_addon.sql
-- Mexico Trade Intelligence PAID ADD-ON ($99/mo on top of a paid base plan).
--
-- Catalog table (lit_addons) follows the plans-table pattern: the row maps an
-- addon_key to a Stripe price id. stripe_price_id ships NULL — the owner
-- creates the $99/mo recurring Product+Price in the Stripe dashboard and
-- pastes the price id into this row; everything (checkout, webhook routing,
-- the mx-company-search server gate, the billing UI purchase button)
-- activates the moment it lands. No code change needed. NULL price id means
-- "not yet purchasable": lit_org_has_addon returns false and billing-checkout
-- refuses to create a session (no fake billing paths — CLAUDE.md rule 3/7).
--
-- lit_org_addon_subscriptions is the webhook-owned entitlement table,
-- mirroring lit_crm_subscriptions. Add-on purchases are SEPARATE Stripe
-- subscriptions and must NOT be recorded on public.subscriptions: that table
-- is one-row-per-user (unique user_id) and is owned by the main-plan webhook
-- path — letting an add-on event write there would clobber the base plan's
-- stripe_subscription_id / stripe_price_id.

create table if not exists public.lit_addons (
  addon_key text primary key,
  name text not null,
  stripe_price_id text,
  monthly_price_usd numeric not null default 0,
  included_credits integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.lit_addons enable row level security;

-- Harmless catalog data (like plans): readable by signed-in users so the
-- billing UI can render price/state. Writes are service-role/console only.
drop policy if exists lit_addons_read_authenticated on public.lit_addons;
create policy lit_addons_read_authenticated on public.lit_addons
  for select to authenticated using (active = true);

insert into public.lit_addons
  (addon_key, name, stripe_price_id, monthly_price_usd, included_credits, active)
values
  ('mx_trade', 'Mexico Trade Intelligence', null, 99, 1000, true)
on conflict (addon_key) do nothing;

create table if not exists public.lit_org_addon_subscriptions (
  org_id uuid not null references public.organizations(id) on delete cascade,
  addon_key text not null references public.lit_addons(addon_key) on delete cascade,
  status text not null default 'incomplete',
  stripe_subscription_id text,
  stripe_customer_id text,
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (org_id, addon_key)
);

-- Service-role (billing-webhook) writes; reads go through the SECURITY
-- DEFINER RPCs below. RLS enabled with no policies = no direct client access.
alter table public.lit_org_addon_subscriptions enable row level security;

create index if not exists lit_org_addon_subs_stripe_sub_idx
  on public.lit_org_addon_subscriptions (stripe_subscription_id);

-- ── RPC: fetch an active add-on row (catalog read for the billing UI).
-- Returns a NULL-field composite when the key is unknown/inactive — callers
-- check addon_key IS NOT NULL.
create or replace function public.lit_get_addon(p_key text)
returns public.lit_addons
language sql stable security definer
set search_path = public
as $$
  select * from public.lit_addons where addon_key = p_key and active = true;
$$;

revoke all on function public.lit_get_addon(text) from public;
grant execute on function public.lit_get_addon(text) to authenticated, service_role;

-- ── RPC: does the CALLING user's org hold an active add-on subscription?
-- True when any org the caller belongs to has either (a) a webhook-written
-- lit_org_addon_subscriptions row, or (b) a subscriptions row carrying the
-- add-on's stripe_price_id — in status active/trialing/past_due. NULL
-- stripe_price_id on the catalog row ⇒ false (not yet purchasable).
create or replace function public.lit_org_has_addon(p_addon_key text)
returns boolean
language plpgsql stable security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_price text;
begin
  if v_uid is null then
    return false;
  end if;

  select stripe_price_id into v_price
    from public.lit_addons
   where addon_key = p_addon_key and active = true;

  if v_price is null then
    -- Unknown/inactive add-on, or the owner hasn't pasted the Stripe price
    -- id yet — nothing can have been legitimately purchased.
    return false;
  end if;

  -- Canonical: webhook-owned add-on entitlement table.
  if exists (
    select 1
      from public.lit_org_addon_subscriptions oas
      join public.org_members om on om.org_id = oas.org_id
     where om.user_id = v_uid
       and oas.addon_key = p_addon_key
       and oas.status in ('active','trialing','past_due')
  ) then
    return true;
  end if;

  -- Belt-and-suspenders: any org subscriptions row carrying the add-on price.
  return exists (
    select 1
      from public.subscriptions s
      join public.org_members om on om.org_id = s.organization_id
     where om.user_id = v_uid
       and s.stripe_price_id = v_price
       and s.status in ('active','trialing','past_due')
  );
end;
$$;

revoke all on function public.lit_org_has_addon(text) from public;
grant execute on function public.lit_org_has_addon(text) to authenticated, service_role;
