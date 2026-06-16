-- Pulse Explorer Phase 1 — geo canonicalization functions.
--
-- Problem: lit_company_directory and lit_unified_shipments use different
-- conventions for country and state values:
--   directory: country='United States', state='California'
--   shipments: destination_country='United States of America', dest_state='CA'
-- A naive JOIN on (canonical_name, country, state) produces 0 matches.
--
-- Fix: add canonical SQL functions for country and state. Use them on BOTH sides
-- of the JOIN in lit_recompute_opportunity_scores() and inside
-- lit_pulse_shipper_stats_mv. Canonical forms:
--   country: ISO-like short codes ('USA', 'CAN', 'MEX', etc) for common
--            cases; pass-through otherwise.
--   state  : 2-letter USPS code for US states; pass-through if input is
--            already 2 chars (assumed code); null otherwise.
--
-- We re-create the MV and recompute function so they pick up the new functions.

-- =====================================================================
-- 1. Country canonicalizer
-- =====================================================================
create or replace function lit_canonicalize_country(c text)
returns text
language sql
immutable
as $$
  select case lower(trim(coalesce(c, '')))
    when ''                              then null
    when 'united states'                 then 'USA'
    when 'united states of america'      then 'USA'
    when 'usa'                           then 'USA'
    when 'us'                            then 'USA'
    when 'u.s.a.'                        then 'USA'
    when 'canada'                        then 'CAN'
    when 'mexico'                        then 'MEX'
    when 'china'                         then 'CHN'
    when 'united kingdom'                then 'GBR'
    when 'great britain'                 then 'GBR'
    when 'uk'                            then 'GBR'
    when 'germany'                       then 'DEU'
    when 'france'                        then 'FRA'
    when 'italy'                         then 'ITA'
    when 'spain'                         then 'ESP'
    when 'netherlands'                   then 'NLD'
    when 'japan'                         then 'JPN'
    when 'south korea'                   then 'KOR'
    when 'korea, republic of'            then 'KOR'
    when 'taiwan'                        then 'TWN'
    when 'india'                         then 'IND'
    when 'vietnam'                       then 'VNM'
    when 'thailand'                      then 'THA'
    when 'singapore'                     then 'SGP'
    when 'brazil'                        then 'BRA'
    when 'colombia'                      then 'COL'
    when 'puerto rico'                   then 'PRI'
    when 'australia'                     then 'AUS'
    else upper(trim(c))
  end
$$;

-- =====================================================================
-- 2. State canonicalizer (USPS 2-letter codes for US states + DC + territories)
-- =====================================================================
create or replace function lit_canonicalize_state(s text)
returns text
language sql
immutable
as $$
  select case lower(trim(coalesce(s, '')))
    when ''               then null
    when 'alabama'        then 'AL' when 'alaska'         then 'AK'
    when 'arizona'        then 'AZ' when 'arkansas'       then 'AR'
    when 'california'     then 'CA' when 'colorado'       then 'CO'
    when 'connecticut'    then 'CT' when 'delaware'       then 'DE'
    when 'district of columbia' then 'DC'
    when 'florida'        then 'FL' when 'georgia'        then 'GA'
    when 'hawaii'         then 'HI' when 'idaho'          then 'ID'
    when 'illinois'       then 'IL' when 'indiana'        then 'IN'
    when 'iowa'           then 'IA' when 'kansas'         then 'KS'
    when 'kentucky'       then 'KY' when 'louisiana'      then 'LA'
    when 'maine'          then 'ME' when 'maryland'       then 'MD'
    when 'massachusetts'  then 'MA' when 'michigan'       then 'MI'
    when 'minnesota'      then 'MN' when 'mississippi'    then 'MS'
    when 'missouri'       then 'MO' when 'montana'        then 'MT'
    when 'nebraska'       then 'NE' when 'nevada'         then 'NV'
    when 'new hampshire'  then 'NH' when 'new jersey'     then 'NJ'
    when 'new mexico'     then 'NM' when 'new york'       then 'NY'
    when 'north carolina' then 'NC' when 'north dakota'   then 'ND'
    when 'ohio'           then 'OH' when 'oklahoma'       then 'OK'
    when 'oregon'         then 'OR' when 'pennsylvania'   then 'PA'
    when 'rhode island'   then 'RI' when 'south carolina' then 'SC'
    when 'south dakota'   then 'SD' when 'tennessee'      then 'TN'
    when 'texas'          then 'TX' when 'utah'           then 'UT'
    when 'vermont'        then 'VT' when 'virginia'       then 'VA'
    when 'washington'     then 'WA' when 'west virginia'  then 'WV'
    when 'wisconsin'      then 'WI' when 'wyoming'        then 'WY'
    when 'puerto rico'    then 'PR'
    -- Pass-through if input is already a 2-char code.
    else case when length(trim(s)) = 2 then upper(trim(s)) else upper(trim(s)) end
  end
$$;

-- =====================================================================
-- 3. Re-create MV with canonical country/state
-- =====================================================================
drop materialized view if exists lit_pulse_shipper_stats_mv;

create materialized view lit_pulse_shipper_stats_mv as
with base as (
  select
    lit_canonicalize_name(consignee_name) as canonical_name,
    lit_canonicalize_country(destination_country) as country,
    lit_canonicalize_state(dest_state) as state,
    carrier_name,
    teu,
    bol_date
  from lit_unified_shipments
  where bol_date > now() - interval '365 days'
    and consignee_name is not null
    and consignee_name <> ''
    and lit_canonicalize_name(consignee_name) <> ''
),
per_shipper as (
  select
    canonical_name, country, state,
    count(distinct carrier_name) as forwarder_count,
    sum(teu) as total_teu_12m,
    sum(case when bol_date > now() - interval '180 days' then teu else 0 end) as recent_6m_teu,
    sum(case when bol_date <= now() - interval '180 days' then teu else 0 end) as prior_6m_teu,
    extract(day from now() - max(bol_date))::numeric as days_since_last_shipment
  from base
  group by canonical_name, country, state
),
carrier_shares as (
  select canonical_name, country, state, carrier_name, sum(teu) as carrier_teu
  from base
  group by canonical_name, country, state, carrier_name
),
top_carrier_share as (
  select canonical_name, country, state,
         max(carrier_teu) / nullif(sum(carrier_teu), 0) as forwarder_concentration
  from carrier_shares
  group by canonical_name, country, state
)
select
  p.canonical_name,
  p.country,
  p.state,
  p.forwarder_count,
  p.total_teu_12m,
  p.recent_6m_teu,
  p.prior_6m_teu,
  p.days_since_last_shipment,
  coalesce(t.forwarder_concentration, 0) as forwarder_concentration
from per_shipper p
left join top_carrier_share t using (canonical_name, country, state);

create unique index if not exists lit_pulse_shipper_stats_mv_pk
  on lit_pulse_shipper_stats_mv (canonical_name, country, state);

-- =====================================================================
-- 4. Re-create recompute fn — join wraps directory side in canonicalizers
-- =====================================================================
create or replace function lit_recompute_opportunity_scores()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  with stats as (
    select
      d.canonical_name,
      d.country,
      d.state,
      coalesce(s.forwarder_count, 0) as forwarder_count,
      coalesce(s.total_teu_12m, 0) as total_teu_12m,
      coalesce(s.recent_6m_teu, 0) as recent_6m_teu,
      coalesce(s.prior_6m_teu, 0) as prior_6m_teu,
      coalesce(s.forwarder_concentration, 0) as forwarder_concentration,
      coalesce(s.days_since_last_shipment, 999) as days_since_last_shipment
    from lit_company_directory d
    left join lit_pulse_shipper_stats_mv s
      on s.canonical_name = d.canonical_name
     and s.country is not distinct from lit_canonicalize_country(d.country)
     and s.state   is not distinct from lit_canonicalize_state(d.state)
  ),
  with_percentile as (
    select *,
      percent_rank() over (order by total_teu_12m) as percentile_teu
    from stats
  ),
  scored as (
    select
      canonical_name, country, state,
      case
        when forwarder_count < 2 then 0
        else least(100, (forwarder_count - 1) * 25 + log(total_teu_12m + 1) * 8)
      end as consolidation,
      least(100,
        forwarder_concentration * 60
        + greatest(0, -((recent_6m_teu - prior_6m_teu) / greatest(prior_6m_teu, 1.0))) * 100
      ) as vulnerable,
      least(100,
        percentile_teu * 80 + greatest(0, 1 - days_since_last_shipment / 90.0) * 20
      ) as velocity
    from with_percentile
  ),
  with_composite as (
    select *,
      greatest(consolidation, vulnerable, velocity) * 0.7
      + ((consolidation + vulnerable + velocity
          - least(consolidation, vulnerable, velocity)) / 2.0) * 0.3 as composite
    from scored
  )
  update lit_company_directory d
  set opportunity_consolidation_score = c.consolidation,
      opportunity_vulnerable_score    = c.vulnerable,
      opportunity_velocity_score      = c.velocity,
      opportunity_composite_score     = c.composite,
      last_opportunity_recompute_at   = now()
  from with_composite c
  where d.canonical_name = c.canonical_name
    and d.country is not distinct from c.country
    and d.state   is not distinct from c.state;
end;
$$;
