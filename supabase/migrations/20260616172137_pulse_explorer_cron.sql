-- Pulse Explorer Phase 1 — nightly opportunity recompute.
--
-- Deviations from spec docs/superpowers/specs/2026-06-16-pulse-explorer-design.md §4.4:
-- The original plan referenced lit_unified_shipments columns that don't exist
-- under those names. Adjusted to actual schema:
--   forwarder_name → carrier_name        (no forwarder column in BOLs; carrier
--                                         is the best available proxy. ocean
--                                         BOLs surface carrier line / NVOCC
--                                         which captures who controls the move
--                                         for sales-targeting purposes)
--   consignee_country → destination_country
--   consignee_state   → dest_state
--   shipment_date     → bol_date
--
-- Also: the original plan's MV used a simpler in-line lowercase+regex for
-- canonical_name. That would NOT match lit_company_directory.canonical_name
-- (which was backfilled with full JS canonicalizeName semantics: strip
-- legal suffixes, strip punctuation, collapse whitespace). To make the join
-- between MV and directory work, we add a SQL function lit_canonicalize_name()
-- that mirrors supabase/functions/_shared/canonical_name.ts exactly.

-- =====================================================================
-- 1. Shared SQL canonicalizer — mirrors _shared/canonical_name.ts
-- =====================================================================

create or replace function lit_canonicalize_name(raw text)
returns text
language sql
immutable
as $$
  select case
    when raw is null or raw = '' then ''
    else trim(
      regexp_replace(
        regexp_replace(
          regexp_replace(
            lower(raw),
            '\s+(inc\.?|llc\.?|ltd\.?|corp\.?|co\.?|limited|sas|gmbh)$', '', 'i'),
          '[.,''"!?()]', '', 'g'),
        '\s+', ' ', 'g')
    )
  end
$$;

-- =====================================================================
-- 2. Shipper stats MV — aggregates from lit_unified_shipments
-- =====================================================================

drop materialized view if exists lit_pulse_shipper_stats_mv;

create materialized view lit_pulse_shipper_stats_mv as
with base as (
  select
    lit_canonicalize_name(consignee_name) as canonical_name,
    destination_country as country,
    dest_state as state,
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
  select
    canonical_name, country, state, carrier_name,
    sum(teu) as carrier_teu
  from base
  group by canonical_name, country, state, carrier_name
),
top_carrier_share as (
  select
    canonical_name, country, state,
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
-- 3. Recompute function — writes scores back to lit_company_directory.
--    Mirrors _shared/opportunity_scoring.ts formulas line-for-line.
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
     and s.country is not distinct from d.country
     and s.state   is not distinct from d.state
  ),
  with_percentile as (
    select *,
      percent_rank() over (order by total_teu_12m) as percentile_teu
    from stats
  ),
  scored as (
    select
      canonical_name, country, state,
      -- consolidationScore: single forwarder → 0; else (n-1)*25 + log10(teu+1)*8, clamped 0..100
      case
        when forwarder_count < 2 then 0
        else least(100,
               (forwarder_count - 1) * 25
               + log(total_teu_12m + 1) * 8
             )
      end as consolidation,
      -- vulnerableScore: concentration*60 + max(0, -trend)*100, clamped 0..100
      least(100,
        forwarder_concentration * 60
        + greatest(0,
            -((recent_6m_teu - prior_6m_teu) / greatest(prior_6m_teu, 1.0))
          ) * 100
      ) as vulnerable,
      -- velocityScore: percentile_teu*80 + recency*20, clamped 0..100
      least(100,
        percentile_teu * 80
        + greatest(0, 1 - days_since_last_shipment / 90.0) * 20
      ) as velocity
    from with_percentile
  ),
  with_composite as (
    select
      *,
      -- compositeScore: max*0.7 + avg(top-2)*0.3 from the 3 stored scores.
      -- (defend score is derived at read time in pulse-explore; we omit it here.)
      greatest(consolidation, vulnerable, velocity) * 0.7
      + (
          (consolidation + vulnerable + velocity
            - least(consolidation, vulnerable, velocity)) / 2.0
        ) * 0.3 as composite
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

-- =====================================================================
-- 4. Schedule nightly at 03:15 UTC
-- =====================================================================

select cron.unschedule('lit-pulse-opportunity-recompute')
where exists (select 1 from cron.job where jobname = 'lit-pulse-opportunity-recompute');

select cron.schedule(
  'lit-pulse-opportunity-recompute',
  '15 3 * * *',
  $cron$
    refresh materialized view concurrently lit_pulse_shipper_stats_mv;
    select lit_recompute_opportunity_scores();
  $cron$
);
