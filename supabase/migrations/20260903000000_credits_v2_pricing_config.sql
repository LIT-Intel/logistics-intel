-- Phase 0 — LIT Credits v2 pricing config. Purely ADDITIVE: existing plan
-- columns (stripe_price_id_monthly, monthly_credit_quota, price_monthly,
-- included_seats) are untouched so the existing subscriptions stay
-- grandfathered. The v2_* columns hold the new-model target; nothing reads
-- them until the Phase 2 checkout/webhook/pricing wiring lands.
-- Live Stripe (v2) price IDs created by the admin-stripe-setup edge fn.

alter table public.plans
  add column if not exists stripe_price_id_monthly_v2 text,
  add column if not exists monthly_credit_quota_v2 integer,
  add column if not exists price_monthly_v2 numeric,
  add column if not exists included_seats_v2 integer;

update public.plans set stripe_price_id_monthly_v2='price_1UBOCK30nhNIomhFxFgeqPFt', monthly_credit_quota_v2=300,  price_monthly_v2=150,  included_seats_v2=1  where code='starter';
update public.plans set stripe_price_id_monthly_v2='price_1UBOCK30nhNIomhFBunyJOrV', monthly_credit_quota_v2=1500, price_monthly_v2=499,  included_seats_v2=3  where code='growth';
update public.plans set stripe_price_id_monthly_v2='price_1UBOCL30nhNIomhFZEFjdORc', monthly_credit_quota_v2=4000, price_monthly_v2=1250, included_seats_v2=5  where code='scale';
update public.plans set stripe_price_id_monthly_v2='price_1UBOCM30nhNIomhFh8qv2zAv', monthly_credit_quota_v2=null, price_monthly_v2=2500, included_seats_v2=10 where code='enterprise';
update public.plans set monthly_credit_quota_v2=25, price_monthly_v2=0, included_seats_v2=1 where code='free_trial';

create table if not exists public.lit_credit_packages (
  id text primary key,
  credits integer not null,
  price_usd_cents integer not null,
  stripe_price_id text not null,
  stripe_product_id text,
  lookup_key text unique,
  is_most_popular boolean not null default false,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
comment on table public.lit_credit_packages is 'LIT Credits top-up packs (one-time Stripe prices). Read by pricing/purchase UI + billing-webhook to resolve a purchase to a credit grant. Service-role writes.';

insert into public.lit_credit_packages (id,credits,price_usd_cents,stripe_price_id,stripe_product_id,lookup_key,is_most_popular,sort_order) values
 ('250',   250,   2900, 'price_1UBOCM30nhNIomhFxovxDlAk','prod_VBljWlk29BA4nK','lit_pack_250',   false, 1),
 ('750',   750,   6900, 'price_1UBOCN30nhNIomhFSxGrKguS','prod_VBljW2rQgu0sMJ','lit_pack_750',   false, 2),
 ('2000',  2000,  14900,'price_1UBOCN30nhNIomhFg0WYGVnA','prod_VBljfvKPp7tuTL','lit_pack_2000',  true,  3),
 ('5000',  5000,  29900,'price_1UBOCO30nhNIomhFujmSkH5V','prod_VBlj9P96sV0hmj','lit_pack_5000',  false, 4),
 ('15000', 15000, 69900,'price_1UBOCP30nhNIomhFz5VhqkJx','prod_VBljsjzNtAX98Z','lit_pack_15000', false, 5)
on conflict (id) do update set
  credits=excluded.credits, price_usd_cents=excluded.price_usd_cents,
  stripe_price_id=excluded.stripe_price_id, stripe_product_id=excluded.stripe_product_id,
  lookup_key=excluded.lookup_key, is_most_popular=excluded.is_most_popular,
  sort_order=excluded.sort_order, active=true;

alter table public.lit_credit_packages enable row level security;
drop policy if exists lit_credit_packages_read on public.lit_credit_packages;
create policy lit_credit_packages_read on public.lit_credit_packages for select to authenticated using (active = true);
