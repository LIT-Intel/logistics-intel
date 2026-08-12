-- P0-L: full shipment-history ingestion + lane × month rollup.
--
-- 1. lit_unified_shipments gains provenance columns so deep-ingested history
--    rows can coexist with the 50-row snapshot materializer without being
--    deleted by its "stale BOL" sweep (materialize_bols.ts now only deletes
--    ingest_source='snapshot' rows).
-- 2. lit_company_lane_months: per-company lane × month rollup consumed by the
--    Company Profile Lane Matrix UI (P1, later agent).
-- 3. lit_company_history_ingest / lit_history_ingest_budget: per-company
--    pagination state + global daily page budget for the company-history-ingest
--    edge fn worker.
-- 4. lit_rebuild_company_lane_months(p_company_id): (re)builds one company's
--    rollup from its lit_unified_shipments rows.
-- 5. Tunable config row in lit_internal_meta ('company_history_ingest_config')
--    so the owner can adjust caps without a deploy.

-- ── 1. Provenance columns on lit_unified_shipments ──────────────────────────
alter table public.lit_unified_shipments
  add column if not exists ingest_source text not null default 'snapshot',
  add column if not exists source_page integer,
  add column if not exists origin_city text;

comment on column public.lit_unified_shipments.ingest_source is
  'snapshot = materialized from the 50-row parsed_summary.recent_bols blob (subject to stale-sweep); history = deep-ingested via company-history-ingest pagination (never swept).';
comment on column public.lit_unified_shipments.source_page is
  'Zero-based page index of the paginated /company/{slug}/bols pull that produced this row (history rows only).';

-- ── 2. Lane × month rollup table ────────────────────────────────────────────
create table if not exists public.lit_company_lane_months (
  id uuid primary key default gen_random_uuid(),
  company_id text not null,
  origin_country text not null default 'Unknown',
  origin_city text,
  dest_country text not null default 'Unknown',
  dest_state text,
  dest_city text,
  month date not null,
  shipments integer not null default 0,
  teu numeric,
  refreshed_at timestamptz not null default now()
);

create unique index if not exists lit_company_lane_months_lane_uniq
  on public.lit_company_lane_months (
    company_id,
    origin_country,
    coalesce(origin_city, ''),
    dest_country,
    coalesce(dest_state, ''),
    coalesce(dest_city, ''),
    month
  );

create index if not exists lit_company_lane_months_company_month_idx
  on public.lit_company_lane_months (company_id, month desc);

alter table public.lit_company_lane_months enable row level security;

drop policy if exists lit_company_lane_months_read_authenticated on public.lit_company_lane_months;
create policy lit_company_lane_months_read_authenticated
  on public.lit_company_lane_months for select to authenticated using (true);

drop policy if exists lit_company_lane_months_service_role_all on public.lit_company_lane_months;
create policy lit_company_lane_months_service_role_all
  on public.lit_company_lane_months for all to service_role using (true) with check (true);

-- Base GRANTs (policies without grants ship a dead table — recent bug).
revoke all on public.lit_company_lane_months from anon;
grant select on public.lit_company_lane_months to authenticated;
grant all on public.lit_company_lane_months to service_role;

-- ── 3. Ingest state + daily budget tables (service-role only) ───────────────
create table if not exists public.lit_company_history_ingest (
  company_id text primary key,
  window_started_at timestamptz,
  pages_fetched_window integer not null default 0,
  last_offset integer not null default 0,
  total_bols_ingested integer not null default 0,
  complete boolean not null default false,
  last_ingest_at timestamptz,
  last_error text,
  last_request_cost numeric,
  updated_at timestamptz not null default now()
);

create table if not exists public.lit_history_ingest_budget (
  day date primary key,
  pages_used integer not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.lit_company_history_ingest enable row level security;
alter table public.lit_history_ingest_budget enable row level security;

drop policy if exists lit_company_history_ingest_service_role_all on public.lit_company_history_ingest;
create policy lit_company_history_ingest_service_role_all
  on public.lit_company_history_ingest for all to service_role using (true) with check (true);

drop policy if exists lit_history_ingest_budget_service_role_all on public.lit_history_ingest_budget;
create policy lit_history_ingest_budget_service_role_all
  on public.lit_history_ingest_budget for all to service_role using (true) with check (true);

revoke all on public.lit_company_history_ingest from anon, authenticated;
revoke all on public.lit_history_ingest_budget from anon, authenticated;
grant all on public.lit_company_history_ingest to service_role;
grant all on public.lit_history_ingest_budget to service_role;

-- ── 4. Rollup rebuild function ──────────────────────────────────────────────
create or replace function public.lit_rebuild_company_lane_months(p_company_id text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inserted integer := 0;
begin
  delete from public.lit_company_lane_months where company_id = p_company_id;

  insert into public.lit_company_lane_months
    (company_id, origin_country, origin_city, dest_country, dest_state,
     dest_city, month, shipments, teu, refreshed_at)
  select
    s.company_id,
    coalesce(nullif(btrim(s.origin_country), ''), nullif(btrim(s.origin_country_code), ''), 'Unknown'),
    nullif(btrim(coalesce(s.origin_city, s.origin_port)), ''),
    coalesce(nullif(btrim(s.destination_country), ''), nullif(btrim(s.destination_country_code), ''), 'Unknown'),
    nullif(btrim(s.dest_state), ''),
    nullif(btrim(coalesce(s.dest_city, s.destination_port)), ''),
    date_trunc('month', s.bol_date)::date,
    count(*)::integer,
    sum(s.teu),
    now()
  from public.lit_unified_shipments s
  where s.company_id = p_company_id
    and s.bol_date is not null
  group by 1, 2, 3, 4, 5, 6, 7;

  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$$;

revoke all on function public.lit_rebuild_company_lane_months(text) from public, anon, authenticated;
grant execute on function public.lit_rebuild_company_lane_months(text) to service_role;

-- ── 5. Tunable config row (owner edits meta_value, no deploy needed) ────────
insert into public.lit_internal_meta (meta_key, meta_value, updated_at)
values (
  'company_history_ingest_config',
  -- Units: 1 "page" = one /company/{slug}/bols ID page (10 BOL IDs, 1.0 IY
  -- credit) plus up to 10 /bol/{id} detail fetches (0.1 credit each, skipped
  -- for BOLs we already hold). Worst case ≈ 2 credits per page.
  jsonb_build_object(
    'enabled', true,
    'max_pages_per_company_per_window', 20,
    'window_days', 30,
    'daily_page_budget', 12,
    'max_pages_per_run', 3,
    'refresh_stale_days', 30
  ),
  now()
)
on conflict (meta_key) do nothing;

-- ── 6. pg_cron: run the ingest worker every 30 minutes ──────────────────────
do $do$
begin
  perform cron.unschedule('company-history-ingest-30m');
exception when others then
  null;
end
$do$;

select cron.schedule(
  'company-history-ingest-30m',
  '*/30 * * * *',
  $cron$
  select net.http_post(
    url := 'https://jkmrfiaefxwgbvftohrb.supabase.co/functions/v1/company-history-ingest',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Internal-Cron', (select decrypted_secret from vault.decrypted_secrets where name = 'LIT_CRON_SECRET')
    ),
    body := '{}'::jsonb
  );
  $cron$
);
