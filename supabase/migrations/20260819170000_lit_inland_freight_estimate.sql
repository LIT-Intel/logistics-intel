-- Inland Freight Estimate (Play 1, 2026-08-19): domestic FTL/LTL intelligence
-- computed from data LIT already owns. No public per-shipment domestic record
-- exists, but every imported container travels inland by truck from the port
-- of unlading to the consignee facility — and the BOLs hold both endpoints.
--
-- lit_company_inland_freight(p_company_id) returns, per company:
--   facilities: distinct consignee delivery locations (city/state/zip) with an
--     explicit 0-100 CONFIDENCE score and a class:
--       own_facility — consignee appears to be the company itself
--       3pl          — consignee name matches a forwarder/3PL dictionary
--                      (capped at 70: it's a real receiving point, but not
--                      "their warehouse")
--   flows: port → facility corridors with estimated truckloads/month,
--     reconciled to the company's REAL monthly cadence
--     (lit_company_time_series_monthly trailing-12) rather than the raw
--     ~50-BOL sample count. 1 truckload ≈ 1 container (FEU heuristic).
--   transfers: modeled facility↔facility replenishment hints, ONLY when 2+
--     high-confidence facilities exist. Confidence-capped at 70 and flagged
--     modeled=true — the UI shows >=80 by default and gates the rest behind a
--     "show modeled" toggle. We gate display; we do not inflate scores.
--
-- Facility confidence: observation volume (up to 40) + zip precision (10)
-- + recency vs the company's own latest data (15/8) + share of deliveries
-- (10) + container depth (10). Corroboration boost (+15, Apollo/website/
-- SmartWay) is Phase 2 — column reserved via 'corroborated'.
--
-- Read-only. Idempotent. US destinations only (domestic freight).

create or replace function public.lit_company_inland_freight(p_company_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_monthly_shipments numeric;   -- trailing-12 avg shipments/month (real cadence)
  v_containers_per_bol numeric;  -- sample ratio to convert shipments -> truckloads
  v_est_tl_month numeric;
  v_latest date;
  v_facilities jsonb;
  v_flows jsonb;
  v_transfers jsonb;
  v_ftl int; v_lcl int;
begin
  -- Real monthly cadence from the 12-year monthly series (not the BOL sample).
  select avg(shipments)::numeric, max(month_date)::date
    into v_monthly_shipments, v_latest
  from (
    select shipments, month_date
    from public.lit_company_time_series_monthly
    where company_id = p_company_id
    order by month_date desc limit 12
  ) t;

  select coalesce(sum(container_count)::numeric / nullif(count(*), 0), 1.0)
    into v_containers_per_bol
  from public.lit_unified_shipments
  where company_id = p_company_id and container_count is not null;

  v_est_tl_month := round(coalesce(v_monthly_shipments, 0) * coalesce(v_containers_per_bol, 1.0), 1);

  select count(*) filter (where lcl is not true), count(*) filter (where lcl is true)
    into v_ftl, v_lcl
  from public.lit_unified_shipments where company_id = p_company_id;

  -- Facilities: distinct US consignee delivery points, scored.
  with base as (
    select
      initcap(lower(btrim(dest_city)))  as city,
      upper(btrim(dest_state))          as state,
      nullif(btrim(dest_zip), '')       as zip,
      count(*)                          as bols,
      coalesce(sum(container_count), 0) as containers,
      max(bol_date)::date               as last_seen,
      min(bol_date)::date               as first_seen,
      -- 3PL/forwarder detector on consignee names seen at this location.
      bool_or(coalesce(consignee_name, '') ~* '(dsv|dhl|kuehne|expeditors|schenker|geodis|ceva|bollore|sinotrans|panalpina|forward(ing|er)|logistics|3pl|freight)') as looks_3pl
    from public.lit_unified_shipments
    where company_id = p_company_id
      and coalesce(dest_state, '') <> ''            -- US-style rows only
      and coalesce(dest_city, '') <> ''
    group by 1, 2, 3
  ), tot as (
    select sum(bols)::numeric as all_bols from base
  ), scored as (
    select b.*,
      least(100,
        least(40, 10 + b.bols * 3)                                                   -- observation volume
        + case when b.zip is not null then 10 else 0 end                             -- zip precision
        + case when v_latest is null then 8
               when b.last_seen >= v_latest - interval '6 months' then 15
               when b.last_seen >= v_latest - interval '12 months' then 8
               else 0 end                                                            -- recency vs own latest
        + case when t.all_bols > 0 and b.bols / t.all_bols >= 0.10 then 10 else 0 end -- share of deliveries
        + case when b.containers >= 5 then 10 else 0 end                             -- container depth
      ) as raw_conf
    from base b cross join tot t
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'city', s.city, 'state', s.state, 'zip', s.zip,
      'bols', s.bols, 'containers', s.containers,
      'first_seen', s.first_seen, 'last_seen', s.last_seen,
      'class', case when s.looks_3pl then '3pl' else 'own_facility' end,
      'corroborated', false,
      'confidence', case when s.looks_3pl then least(s.raw_conf, 70) else s.raw_conf end
    ) order by s.bols desc), '[]'::jsonb)
  into v_facilities
  from scored s;

  -- Flows: port of unlading -> facility, TL/mo reconciled to real cadence.
  with fac as (
    select f->>'city' as city, f->>'state' as state,
           (f->>'bols')::numeric as bols, (f->>'confidence')::int as conf
    from jsonb_array_elements(v_facilities) f
  ), tot as (
    select sum(bols) as all_bols from fac
  ), corridors as (
    select
      nullif(btrim(us.destination_port), '') as port,
      initcap(lower(btrim(us.dest_city)))    as city,
      upper(btrim(us.dest_state))            as state,
      count(*) as bols
    from public.lit_unified_shipments us
    where us.company_id = p_company_id
      and coalesce(us.dest_state, '') <> '' and coalesce(us.dest_city, '') <> ''
    group by 1, 2, 3
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'origin_port', c.port,
      'dest_city', c.city, 'dest_state', c.state,
      'bols', c.bols,
      'est_tl_month', round(v_est_tl_month * (c.bols / nullif(t.all_bols, 0)), 1),
      'kind', 'drayage_inland_tl',
      'modeled', false,
      'confidence', least(95, coalesce(f.conf, 50) + 5)   -- observed flow rides its facility score
    ) order by c.bols desc), '[]'::jsonb)
  into v_flows
  from corridors c
  cross join tot t
  left join fac f on f.city = c.city and f.state = c.state;

  -- Transfers: modeled hub->spoke hints when 2+ high-confidence facilities.
  with fac as (
    select f->>'city' as city, f->>'state' as state,
           (f->>'bols')::numeric as bols, (f->>'confidence')::int as conf
    from jsonb_array_elements(v_facilities) f
    where (f->>'confidence')::int >= 60
  ), hub as (
    select city, state, bols from fac order by bols desc limit 1
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'from_city', h.city, 'from_state', h.state,
      'to_city', f.city, 'to_state', f.state,
      'kind', 'replenishment_transfer',
      'modeled', true,
      'confidence', least(70, ((h.bols + f.bols) / 4)::int + 40)
    )), '[]'::jsonb)
  into v_transfers
  from fac f cross join hub h
  where not (f.city = h.city and coalesce(f.state,'') = coalesce(h.state,''))
    and (select count(*) from fac) >= 2;

  return jsonb_build_object(
    'ok', true,
    'totals', jsonb_build_object(
      'est_tl_month', v_est_tl_month,
      'monthly_shipments', round(coalesce(v_monthly_shipments, 0), 1),
      'containers_per_shipment', round(coalesce(v_containers_per_bol, 1.0), 2),
      'ftl_bols', v_ftl, 'lcl_bols', v_lcl,
      'latest_month', v_latest
    ),
    'facilities', v_facilities,
    'flows', v_flows,
    'transfers', v_transfers
  );
end;
$$;

comment on function public.lit_company_inland_freight(text) is
  'Inland Freight Estimate: facilities (observed consignee delivery points, 0-100 confidence, 3PL-classified), port->facility flows with est truckloads/month reconciled to real monthly cadence, and modeled facility transfers (capped 70, modeled=true). UI shows >=80 by default.';

revoke all on function public.lit_company_inland_freight(text) from public;
grant execute on function public.lit_company_inland_freight(text) to authenticated;
