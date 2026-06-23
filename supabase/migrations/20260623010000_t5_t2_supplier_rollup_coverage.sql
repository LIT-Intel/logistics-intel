-- T5 + T2 — backend supplier 12-month rollup + coverage diagnostic.
--
-- T5: materialize the rich per-supplier data (lit_importyeti_company_snapshot
--     .raw_payload.data.suppliers_table) into real columns on
--     lit_pq_supplier_aggregates so 12M metrics are queryable/joinable
--     server-side (scoring inputs, diagnostics) without re-parsing JSONB at
--     read time. Mirrors frontend/src/lib/suppliers/suppliersTable.ts.
-- T2: lit_supplier_coverage_diagnostic() — single-call coverage snapshot.
--
-- Non-destructive: additive columns + functions + one nightly cron. The
-- frontend Suppliers UI keeps parsing client-side; this is the server-side
-- source of truth for analytics.

-- ── T5: columns ──────────────────────────────────────────────────────────
alter table public.lit_pq_supplier_aggregates
  add column if not exists source_company_key text,
  add column if not exists country_code text,
  add column if not exists shipments_12m integer,
  add column if not exists shipments_12_24m integer,
  add column if not exists teu_12m numeric,
  add column if not exists total_teus numeric,
  add column if not exists share_pct numeric,
  add column if not exists hs_chapters text[],
  add column if not exists computed_at timestamptz;

create index if not exists idx_pq_supplier_agg_company_key
  on public.lit_pq_supplier_aggregates (source_company_key);

-- ── T5: rebuild function ─────────────────────────────────────────────────
-- DISTINCT ON (buyer, supplier) dedups the same pair appearing across multiple
-- snapshots (the unique constraint is on source+buyer+supplier); we keep the
-- highest-12m-volume, most-recently-fetched row. teu_12m sums the supplier's
-- trailing-12-month time-series TEU.
create or replace function public.lit_rebuild_supplier_aggregates()
returns integer
language plpgsql
as $$
declare _n integer;
begin
  delete from public.lit_pq_supplier_aggregates where source = 'iy_snapshot_rollup';

  insert into public.lit_pq_supplier_aggregates (
    source, source_company_key, buyer_company_name, supplier_name, supplier_country,
    country_code, shipment_count, shipments_12m, shipments_12_24m, teu_12m, total_teus,
    share_pct, first_shipment_date, last_shipment_date, hs_chapters, top_products,
    computed_at, fetched_at
  )
  select distinct on (x.buyer_company_name, x.supplier_name)
    'iy_snapshot_rollup', x.source_company_key, x.buyer_company_name, x.supplier_name,
    x.supplier_country, x.country_code, x.shipments_12m, x.shipments_12m, x.shipments_12_24m,
    x.teu_12m, x.total_teus, x.share_pct, x.first_shipment_date, x.last_shipment_date,
    x.hs_chapters, x.top_products, now(), x.upd
  from (
    select
      ss.company_id as source_company_key,
      coalesce(nullif(ss.parsed_summary->>'companyName',''), nullif(ss.parsed_summary->>'company_name',''), ss.company_id) as buyer_company_name,
      s->>'supplier_name' as supplier_name,
      s->>'country' as supplier_country,
      s->>'country_code' as country_code,
      nullif(s->>'shipments_12m','')::int as shipments_12m,
      nullif(s->>'shipments_12_24m','')::int as shipments_12_24m,
      (select sum((v.value->>'teu')::numeric)
         from jsonb_each(s->'supplier_time_series') v
         where v.key ~ '^\d{2}/\d{2}/\d{4}$'
           and to_date(v.key,'DD/MM/YYYY') > (
             select max(to_date(k.key,'DD/MM/YYYY'))
             from jsonb_each(s->'supplier_time_series') k
             where k.key ~ '^\d{2}/\d{2}/\d{4}$'
           ) - interval '12 months') as teu_12m,
      nullif(s->>'total_teus','')::numeric as total_teus,
      nullif(s->>'shipments_percents_company','')::numeric as share_pct,
      case when s->>'first_shipment' ~ '^\d{2}/\d{2}/\d{4}$' then to_date(s->>'first_shipment','DD/MM/YYYY') end as first_shipment_date,
      case when s->>'most_recent_shipment' ~ '^\d{2}/\d{2}/\d{4}$' then to_date(s->>'most_recent_shipment','DD/MM/YYYY') end as last_shipment_date,
      (select array_agg(c->>'name') from jsonb_array_elements(case when jsonb_typeof(s->'hs_code_chapters')='array' then s->'hs_code_chapters' else '[]'::jsonb end) c where c->>'name' is not null) as hs_chapters,
      (select array_agg(p) from jsonb_array_elements_text(case when jsonb_typeof(s->'product_descriptions')='array' then s->'product_descriptions' else '[]'::jsonb end) p) as top_products,
      ss.updated_at as upd
    from public.lit_importyeti_company_snapshot ss,
      lateral jsonb_array_elements(case when jsonb_typeof(ss.raw_payload->'data'->'suppliers_table')='array' then ss.raw_payload->'data'->'suppliers_table' else '[]'::jsonb end) s
    where coalesce(s->>'supplier_name','') not in ('', 'Missing in source document')
  ) x
  order by x.buyer_company_name, x.supplier_name, x.shipments_12m desc nulls last, x.upd desc nulls last;

  get diagnostics _n = row_count;
  return _n;
end$$;

-- Populate now + keep fresh nightly (mirrors lit-pulse-opportunity-recompute).
select public.lit_rebuild_supplier_aggregates();
select cron.schedule('lit-supplier-aggregates-rebuild', '30 3 * * *', $$select public.lit_rebuild_supplier_aggregates();$$);

-- ── T2: coverage diagnostic ──────────────────────────────────────────────
create or replace function public.lit_supplier_coverage_diagnostic()
returns table(metric text, value numeric)
language sql stable
as $$
  select 'directory_companies'::text, (select count(*)::numeric from lit_company_directory)
  union all select 'snapshots', (select count(*) from lit_importyeti_company_snapshot)
  union all select 'snapshots_with_suppliers', (select count(*) from lit_importyeti_company_snapshot where jsonb_typeof(raw_payload->'data'->'suppliers_table')='array' and jsonb_array_length(raw_payload->'data'->'suppliers_table') > 0)
  union all select 'supplier_rollup_rows', (select count(*) from lit_pq_supplier_aggregates where source='iy_snapshot_rollup')
  union all select 'supplier_rollup_companies', (select count(distinct source_company_key) from lit_pq_supplier_aggregates where source='iy_snapshot_rollup')
  union all select 'supplier_rollup_with_teu12m', (select count(*) from lit_pq_supplier_aggregates where source='iy_snapshot_rollup' and teu_12m is not null)
  union all select 'saved_companies', (select count(*) from lit_companies)
  union all select 'saved_with_snapshot', (select count(*) from lit_companies c where exists(select 1 from lit_importyeti_company_snapshot ss where ss.company_id=c.source_company_key))
  union all select 'directory_nonzero_opp_score', (select count(*) from lit_company_directory where opportunity_composite_score > 0)
  union all select 'directory_opp_recompute_fresh_2d', (select count(*) from lit_company_directory where last_opportunity_recompute_at > now() - interval '2 days')
  union all select 'opp_shipper_stats_mv_rows', (select count(*) from lit_pulse_shipper_stats_mv);
$$;
