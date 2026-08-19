-- Relationship Intelligence (2026-08-19): AI-researched company network profile.
--
-- One row per company slug (same key as lit_unified_shipments.company_id).
-- Populated ONLY by the `company-relationship-intel` edge function via the
-- service role, which calls Claude (claude-sonnet-4-6 + web search) to find:
--   * what the company does + company type (wholesaler/retailer/manufacturer/
--     distributor/3pl/other) with a 0-100 confidence
--   * warehouse/DC/plant/HQ locations published on the open web — corroborates
--     the BOL-observed facilities from lit_company_inland_freight
--   * PUBLISHED client/distributor/retail-partner relationships, each with a
--     citable public source URL + supporting quote (never invented)
--   * an outbound-FTL likelihood 0-100 + rationale: multi-warehouse wholesaler
--     or distributor with named downstream partners = high; single-location
--     importer = low. This is the "are they shipping FTL from their warehouses
--     to their distributors?" signal the sales team asked for.
--
-- Data here is derived from the public web (company sites, press releases,
-- store locators) — non-sensitive, so all authenticated org members may read.
-- Writes are service-role only (edge fn enforces auth + 7-day rate limit).
--
-- NOT APPLIED YET — deploy via supabase db push / auto-deploy workflow.

create table if not exists public.lit_company_relationship_intel (
  company_id               text primary key,
  company_type             text
                           check (company_type is null or company_type in
                             ('wholesaler','retailer','manufacturer','distributor','3pl','other')),
  company_type_confidence  int
                           check (company_type_confidence is null
                             or company_type_confidence between 0 and 100),
  -- 2-3 sentence freight-relevant profile.
  summary                  text,
  -- [{city, state, kind: 'warehouse'|'dc'|'hq'|'plant'|'store', source_url}]
  facilities               jsonb not null default '[]'::jsonb,
  -- [{name, kind: 'client'|'distributor'|'retail_partner'|'carrier',
  --   source_url, quote}] — ONLY relationships with a verifiable public source.
  relationships            jsonb not null default '[]'::jsonb,
  outbound_ftl_likelihood  int
                           check (outbound_ftl_likelihood is null
                             or outbound_ftl_likelihood between 0 and 100),
  outbound_ftl_rationale   text,
  -- [{url, title}] — every web source the model cited.
  sources                  jsonb not null default '[]'::jsonb,
  model                    text,
  refreshed_at             timestamptz not null default now(),
  requested_by             uuid
);

-- Async start-and-poll support: the research takes 30-90s (Claude + up to 8
-- web searches), too long to hold a single request open reliably. The edge fn
-- starts the research in the background (EdgeRuntime.waitUntil), marks the row
-- 'pending', and the UI polls until it flips to 'ok' or 'error'. error_detail
-- surfaces the REAL failure cause (Anthropic HTTP status, parse failure, etc.)
-- instead of a generic "failed". Error rows are exempt from the 7-day refresh
-- cache so a failed run can be retried immediately.
alter table public.lit_company_relationship_intel
  add column if not exists research_status text not null default 'ok'
    check (research_status in ('pending','ok','error')),
  add column if not exists error_detail text;

comment on table public.lit_company_relationship_intel is
  'AI-researched (Claude + web search) company network profile: company type, published warehouse/DC network, published client/distributor relationships (source-cited only), and an outbound-FTL likelihood score. Written only by the company-relationship-intel edge fn (service role, 7-day refresh cadence). Public-web-derived — readable by any authenticated user.';

alter table public.lit_company_relationship_intel enable row level security;

-- Read: any authenticated user. The data is public-web-derived and keyed by a
-- public ImportYeti slug — no tenant data inside.
drop policy if exists "lit_company_relationship_intel_read"
  on public.lit_company_relationship_intel;
create policy "lit_company_relationship_intel_read"
  on public.lit_company_relationship_intel
  for select to authenticated
  using (true);

-- Writes: service role only (no authenticated insert/update/delete policies).
drop policy if exists "lit_company_relationship_intel_service_all"
  on public.lit_company_relationship_intel;
create policy "lit_company_relationship_intel_service_all"
  on public.lit_company_relationship_intel
  for all to service_role
  using (true) with check (true);
