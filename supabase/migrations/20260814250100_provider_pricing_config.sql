-- Phase 2A (data-economics): provider pricing/config. platform_admins read; service-role write.
create table if not exists public.provider_pricing (
  id                  uuid primary key default gen_random_uuid(),
  provider            text not null,
  operation           text not null,
  credit_cost         numeric not null default 1,
  usd_cost_per_credit numeric not null default 0.02,
  effective_date      date not null default current_date,
  active              boolean not null default true,
  created_at          timestamptz not null default now()
);

-- One active row per (provider, operation).
create unique index if not exists uq_provider_pricing_active
  on public.provider_pricing (provider, operation)
  where active;

alter table public.provider_pricing enable row level security;

drop policy if exists provider_pricing_admin_read on public.provider_pricing;
create policy provider_pricing_admin_read
  on public.provider_pricing
  for select
  to authenticated
  using (public.is_platform_admin(auth.uid()));

revoke all on public.provider_pricing from public, anon;
grant select on public.provider_pricing to authenticated;
grant select, insert, update, delete on public.provider_pricing to service_role;

-- Seed: importyeti operations. usd_cost_per_credit is a PLACEHOLDER (0.02);
-- OWNER MUST set the real ImportYeti $/credit before Phase 2B cost figures are trusted.
insert into public.provider_pricing (provider, operation, credit_cost, usd_cost_per_credit)
values
  ('importyeti', 'company_search',   1,   0.02),
  ('importyeti', 'company_lookup',   1,   0.02),
  ('importyeti', 'company_profile',  1,   0.02),
  ('importyeti', 'company_refresh',  1,   0.02),
  ('importyeti', 'shipment_history', 1,   0.02),
  ('importyeti', 'company_bols',     1,   0.02),
  ('importyeti', 'deep_history',     0.1, 0.02),
  ('importyeti', 'pulse_refresh',    1,   0.02),
  ('importyeti', 'lane_refresh',     1,   0.02),
  ('importyeti', 'other',            1,   0.02),
  -- Apollo placeholder so the model generalizes across providers.
  ('apollo',     'contact_enrichment', 1, 0.02)
on conflict do nothing;

comment on table public.provider_pricing is
  'Phase 2A pricing config. credit_cost per operation + usd_cost_per_credit. usd_cost_per_credit=0.02 is a PLACEHOLDER; owner must set real ImportYeti $/credit.';
comment on column public.provider_pricing.usd_cost_per_credit is
  'PLACEHOLDER 0.02 until owner sets the real provider $/credit. Used by Phase 2B to compute estimated_cost_usd.';
