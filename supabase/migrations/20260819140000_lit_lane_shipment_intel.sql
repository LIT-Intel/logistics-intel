-- Central Intelligence Hub (2026-08-19): per-lane shipment intelligence.
--
-- The trade-lane maps only ever surfaced monthly shipment COUNTS. The raw BOL
-- table `lit_unified_shipments` (21k rows) carries far richer per-shipment
-- detail — carrier, transport mode, HS commodity, TEU, weight, freight spend,
-- FCL/LCL, ports — that nothing consumes today. This SECURITY DEFINER RPC
-- aggregates that detail server-side for one company + lane so the map's
-- on-click detail card can render carrier/mode/commodity/FCL-LCL breakdowns and
-- TEU/weight/spend stats WITHOUT shipping raw BOLs to the browser.
--
-- Data richness varies per company/lane (some lanes have carriers but no HS or
-- mode). The function returns every dimension; the UI shows only the non-empty
-- ones (honoring the app's "no fake mode toggles" rule). company_id here is the
-- same text slug used by lit_company_lane_months (e.g. 'behr-process'), and the
-- country names match ('China', 'United States of America').
--
-- Country matching is normalized: the map may pass the short display name
-- ("United States") while the BOL table stores "United States of America" (or
-- vice-versa), so both sides are run through _lit_norm_country (strip trailing
-- " of america", leading "the ", collapse whitespace) before comparing.
--
-- Read-only. Idempotent.

create or replace function public._lit_norm_country(t text)
returns text language sql immutable
set search_path to 'public'
as $$
  select regexp_replace(
           regexp_replace(
             regexp_replace(lower(btrim(coalesce(t, ''))), '\s+of\s+america$', ''),
             '^the\s+', ''),
           '\s+', ' ', 'g');
$$;

create or replace function public.lit_lane_shipment_intel(
  p_company_id   text,
  p_origin_country text,
  p_dest_country text default null
)
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $$
  with rows as (
    select *
    from public.lit_unified_shipments us
    where us.company_id = p_company_id
      and public._lit_norm_country(us.origin_country) = public._lit_norm_country(p_origin_country)
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
      'n_commodities',(select count(distinct hs_code) from rows where nullif(btrim(hs_code), '') is not null)
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

comment on function public.lit_lane_shipment_intel(text, text, text) is
  'Central Intelligence Hub: aggregates lit_unified_shipments for one company + lane into carrier/mode/commodity/FCL-LCL/port breakdowns + TEU/weight/spend totals for the map detail card. Every dimension returned; UI shows only non-empty ones.';

revoke all on function public.lit_lane_shipment_intel(text, text, text) from public;
grant execute on function public.lit_lane_shipment_intel(text, text, text) to authenticated;
