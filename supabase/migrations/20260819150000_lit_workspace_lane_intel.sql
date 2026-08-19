-- Central Intelligence Hub — DASHBOARD (workspace) variant (2026-08-19).
--
-- The company-profile map has lit_lane_shipment_intel (one company). The
-- dashboard "Workspace trade lanes" map is aggregated across EVERY saved
-- account, so it needs a workspace-scoped aggregate: for a given lane, roll up
-- lit_unified_shipments BOL detail across all companies the caller's workspace
-- has saved (lit_saved_companies.source_company_key -> lit_unified_shipments.
-- company_id). Scoped by the caller's own saved rows OR any active org they
-- belong to. Same output shape as lit_lane_shipment_intel plus n_companies.
--
-- Read-only. Idempotent. Reuses _lit_norm_country for the country match so
-- "United States" and "United States of America" both resolve.

create or replace function public.lit_workspace_lane_intel(
  p_origin_country text,
  p_dest_country text default null
)
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $$
  with my_companies as (
    select distinct sc.source_company_key
    from public.lit_saved_companies sc
    where sc.source_company_key is not null
      and (
        sc.user_id = auth.uid()
        or sc.org_id in (
          select om.org_id from public.org_members om
          where om.user_id = auth.uid() and om.status = 'active'
        )
      )
  ),
  rows as (
    select us.*
    from public.lit_unified_shipments us
    join my_companies mc on mc.source_company_key = us.company_id
    where public._lit_norm_country(us.origin_country) = public._lit_norm_country(p_origin_country)
      and (
        p_dest_country is null
        or public._lit_norm_country(us.destination_country) = public._lit_norm_country(p_dest_country)
      )
  )
  select jsonb_build_object(
    'ok', true,
    'totals', jsonb_build_object(
      'bols',        (select count(*) from rows),
      'teu',         (select round(sum(teu)::numeric, 1) from rows),
      'weight_kg',   (select round(sum(weight_kg)::numeric, 0) from rows),
      'spend_usd',   (select round(sum(shipping_cost_usd)::numeric, 0) from rows),
      'containers',  (select sum(container_count) from rows),
      'n_carriers',  (select count(distinct carrier_name) from rows where nullif(btrim(carrier_name), '') is not null),
      'n_commodities',(select count(distinct hs_code) from rows where nullif(btrim(hs_code), '') is not null),
      'n_companies', (select count(distinct company_id) from rows)
    ),
    'carriers', (select coalesce(jsonb_agg(x order by x.bols desc), '[]'::jsonb) from (
        select carrier_name as name, count(*)::int as bols
        from rows where nullif(btrim(carrier_name), '') is not null
        group by carrier_name order by count(*) desc limit 8) x),
    'modes', (select coalesce(jsonb_agg(x order by x.bols desc), '[]'::jsonb) from (
        select transport_mode as name, count(*)::int as bols
        from rows where nullif(btrim(transport_mode), '') is not null
        group by transport_mode order by count(*) desc) x),
    'commodities', (select coalesce(jsonb_agg(x order by x.bols desc), '[]'::jsonb) from (
        select hs_code as code, max(product_description) as description,
               count(*)::int as bols, round(sum(weight_kg)::numeric, 0) as kg
        from rows where nullif(btrim(hs_code), '') is not null
        group by hs_code order by count(*) desc limit 8) x),
    'load_types', (select coalesce(jsonb_agg(x order by x.bols desc), '[]'::jsonb) from (
        select case when lcl is true then 'LCL' else 'FCL' end as name, count(*)::int as bols
        from rows group by (lcl is true)) x),
    'origin_ports', (select coalesce(jsonb_agg(x order by x.bols desc), '[]'::jsonb) from (
        select origin_port as name, count(*)::int as bols
        from rows where nullif(btrim(origin_port), '') is not null
        group by origin_port order by count(*) desc limit 5) x)
  );
$$;

comment on function public.lit_workspace_lane_intel(text, text) is
  'Central Intelligence Hub (dashboard): aggregates lit_unified_shipments across the caller''s workspace saved companies for one lane. Same shape as lit_lane_shipment_intel + totals.n_companies. auth.uid()-scoped via lit_saved_companies / org_members.';

revoke all on function public.lit_workspace_lane_intel(text, text) from public;
grant execute on function public.lit_workspace_lane_intel(text, text) to authenticated;
