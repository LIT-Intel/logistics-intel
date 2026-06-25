-- ============================================================================
-- Quoting Phase 1
--
-- Additive migration for the Quoting module. Creates 4 new tables
-- (lit_quotes, lit_quote_line_items, lit_quote_events, lit_quote_counters),
-- a per-org sequential quote-number function, the org_settings.quote_defaults
-- column, org-scoped RLS mirroring lit_campaigns / lit_rfps, and a `quoting`
-- plan-gating feature key in plan_entitlements.
--
-- The legacy lit_rfps table is intentionally left untouched.
--
-- Schema verified against repo migrations (2026-06-24):
--   organizations(id), lit_companies(id, source, source_company_key, name),
--   org_settings(org_id PK), org_members(user_id, org_id, role, status,
--   joined_at), platform_admins(user_id), plans(id, code),
--   plan_entitlements(plan_id FK plans.id, feature_key, enabled)  <-- NOT
--   (plan_code, feature_key). The get_entitlements RPC reads
--   `plan_entitlements WHERE plan_id = plans.id` aggregating (feature_key,
--   enabled), so the plan-gating INSERT below joins plans on code and writes
--   plan_id.
-- ============================================================================

BEGIN;

-- ============ 1. Quotes ============
create table if not exists public.lit_quotes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  company_id uuid not null references public.lit_companies(id) on delete restrict,
  contact_id uuid,
  created_by uuid not null,
  owner_user_id uuid,
  quote_number text not null,
  status text not null default 'draft'
    check (status in ('draft','sent','viewed','approved','closed_won','closed_lost','expired')),
  mode text check (mode in ('ocean','air','drayage','ftl','ltl')),
  service_type text,
  shipment_type text,
  incoterms text,
  origin_name text, origin_address text, origin_city text, origin_state text,
  origin_country text, origin_postal text, origin_port text,
  destination_name text, destination_address text, destination_city text, destination_state text,
  destination_country text, destination_postal text, destination_port text,
  distance_miles numeric,
  equipment_type text, container_count numeric, weight_lbs numeric,
  volume_cbm numeric, pallet_count numeric, commodity text, hs_code text,
  cargo_value numeric, hazmat boolean default false, temp_controlled boolean default false,
  currency text default 'USD',
  subtotal_cost numeric default 0, subtotal_sell numeric default 0,
  fuel_surcharge_pct numeric, fuel_surcharge_amount numeric default 0,
  accessorial_total numeric default 0,
  total_cost numeric default 0, total_sell numeric default 0,
  gross_profit numeric default 0, gross_margin_pct numeric default 0,
  benchmark_low numeric, benchmark_high numeric, benchmark_source text, benchmark_confidence text,
  revenue_opportunity numeric, revenue_opportunity_confidence text,
  pdf_storage_path text, pdf_signed_url text, pdf_expires_at timestamptz, pdf_generated_at timestamptz,
  share_token uuid not null default gen_random_uuid(),
  notes text, terms_text text,
  valid_until date,
  sent_at timestamptz, approved_at timestamptz, closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, quote_number)
);
create index if not exists idx_lit_quotes_org_status on public.lit_quotes(org_id, status);
create index if not exists idx_lit_quotes_company on public.lit_quotes(company_id);
create index if not exists idx_lit_quotes_share on public.lit_quotes(share_token);

-- ============ 2. Line items (generated totals) ============
create table if not exists public.lit_quote_line_items (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.lit_quotes(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  type text,
  name text not null,
  description text,
  unit text,
  quantity numeric default 1,
  unit_cost numeric default 0,
  unit_sell numeric default 0,
  total_cost numeric generated always as (coalesce(quantity,0) * coalesce(unit_cost,0)) stored,
  total_sell numeric generated always as (coalesce(quantity,0) * coalesce(unit_sell,0)) stored,
  is_accessorial boolean default false,
  taxable boolean default false,
  sort_order int default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_lit_quote_line_items_quote on public.lit_quote_line_items(quote_id);

-- ============ 3. Events (append-only audit) ============
create table if not exists public.lit_quote_events (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.lit_quotes(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  company_id uuid,
  event_type text not null,
  event_payload jsonb default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists idx_lit_quote_events_quote on public.lit_quote_events(quote_id, created_at desc);

-- ============ 4. Per-org sequential counter (audit-grade numbering) ============
create table if not exists public.lit_quote_counters (
  org_id uuid not null references public.organizations(id) on delete cascade,
  year int not null,
  seq int not null default 0,
  primary key (org_id, year)
);

create or replace function public.assign_quote_number(p_org uuid)
returns text language plpgsql security definer set search_path = public as $$
declare v_year int := extract(year from now())::int; v_seq int;
begin
  insert into public.lit_quote_counters(org_id, year, seq) values (p_org, v_year, 1)
  on conflict (org_id, year) do update set seq = public.lit_quote_counters.seq + 1
  returning seq into v_seq;
  return 'Q-' || v_year || '-' || lpad(v_seq::text, 4, '0');
end $$;

-- ============ 5. Org quote defaults (branding + prefill) ============
alter table public.org_settings
  add column if not exists quote_defaults jsonb default '{}'::jsonb;

-- ============ 6. RLS (4-policy org pattern, mirrors lit_campaigns / lit_rfps) ============
alter table public.lit_quotes enable row level security;
alter table public.lit_quote_line_items enable row level security;
alter table public.lit_quote_events enable row level security;

-- Defensive drops so re-runs don't error on existing policies.
drop policy if exists lit_quotes_select on public.lit_quotes;
drop policy if exists lit_quotes_insert on public.lit_quotes;
drop policy if exists lit_quotes_update on public.lit_quotes;
drop policy if exists lit_quotes_delete on public.lit_quotes;
drop policy if exists lit_quote_li_all on public.lit_quote_line_items;
drop policy if exists lit_quote_events_select on public.lit_quote_events;
drop policy if exists lit_quote_events_insert on public.lit_quote_events;

create policy lit_quotes_select on public.lit_quotes for select to authenticated using (
  org_id in (select om.org_id from public.org_members om where om.user_id = auth.uid() and om.status='active')
  or exists (select 1 from public.platform_admins pa where pa.user_id = auth.uid())
);
create policy lit_quotes_insert on public.lit_quotes for insert to authenticated with check (
  auth.uid() = created_by and org_id in (
    select om.org_id from public.org_members om where om.user_id = auth.uid() and om.status='active')
);
create policy lit_quotes_update on public.lit_quotes for update to authenticated using (
  auth.uid() = created_by or exists (select 1 from public.org_members om
    where om.org_id = lit_quotes.org_id and om.user_id = auth.uid() and om.role in ('owner','admin') and om.status='active')
);
create policy lit_quotes_delete on public.lit_quotes for delete to authenticated using (
  auth.uid() = created_by or exists (select 1 from public.org_members om
    where om.org_id = lit_quotes.org_id and om.user_id = auth.uid() and om.role in ('owner','admin') and om.status='active')
);

create policy lit_quote_li_all on public.lit_quote_line_items for all to authenticated using (
  org_id in (select om.org_id from public.org_members om where om.user_id = auth.uid() and om.status='active')
) with check (
  org_id in (select om.org_id from public.org_members om where om.user_id = auth.uid() and om.status='active')
);

create policy lit_quote_events_select on public.lit_quote_events for select to authenticated using (
  org_id in (select om.org_id from public.org_members om where om.user_id = auth.uid() and om.status='active')
  or exists (select 1 from public.platform_admins pa where pa.user_id = auth.uid())
);
-- Append-only audit: org members may insert events for their own org.
create policy lit_quote_events_insert on public.lit_quote_events for insert to authenticated with check (
  org_id in (select om.org_id from public.org_members om where om.user_id = auth.uid() and om.status='active')
);

-- ============ 7. Plan gating feature key ============
-- Real plan_entitlements shape is (plan_id uuid FK plans.id, feature_key text,
-- enabled bool) -- verified via get_entitlements RPC + usage_enforcement
-- migration, which aggregate `plan_entitlements WHERE plan_id = plans.id`.
-- We therefore write plan_id, not plan_code. Enabled for growth/scale/
-- enterprise; disabled for free_trial/starter. Delete-then-insert avoids
-- depending on a named unique constraint we cannot confirm from repo
-- migrations (plan_entitlements is a baseline table not created in-repo).
delete from public.plan_entitlements where feature_key = 'quoting';

insert into public.plan_entitlements (plan_id, feature_key, enabled)
select p.id, 'quoting', p.code in ('growth','scale','enterprise')
from public.plans p;

COMMIT;
