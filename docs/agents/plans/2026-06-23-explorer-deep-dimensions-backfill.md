# Plan — Explorer deep dimensions (commodity / ports / origin-country) data backfill

**Date:** 2026-06-23
**Owner:** Explorer / data
**Status:** Proposed — pending go/no-go
**Trigger:** User asked to enable trade-lane / commodity / port filtering in Pulse Explorer.

## TL;DR

Wiring the filters is trivial; the **data does not exist at scale**. The blocker
is coverage, not schema or code.

| Dimension | Source today | Coverage (of 78,177 directory cos) | Usable at scale? |
|---|---|---|---|
| Company geo (state/city/country) | `lit_company_directory` columns | full | ✅ already filterable |
| Industry, TEU, shipments, spend, revenue, employees | `lit_company_directory` | full | ✅ already filterable |
| Trade lane (origin↔dest **strings**) | `lit_company_directory.top_dimensions` (jsonb) | 31,022 (~40%) | ⚠️ fuzzy — port/city **names** only, no country, no HS |
| Forwarders | `lit_company_directory.top_forwarders` (jsonb) | 31,022 (~40%) | ⚠️ by name |
| **Commodity / HS code** | `lit_unified_shipments.hs_code` | **338 (0.4%)** | ❌ no |
| **Structured ports + origin country** | `lit_unified_shipments.origin_port/destination_port/origin_country_code` | **338 (0.4%)** | ❌ no |
| Transport mode / container type | `lit_unified_shipments` | 338 (0.4%) | ❌ no |

`lit_company_directory.raw_json` / `normalized_json` are **empty** (0 rows) — no
hidden detail to surface. `lit_unified_shipments.company_id` slugs (e.g.
`autoparts-components`) have **zero overlap** with the directory's
`source_company_key` — it is the small "tracked/refreshed" set tied to
`lit_companies`, not the searchable directory.

## Shipped now (no backfill required)

Client-side, in the results filter bar (`ResultsFilterBar.jsx`):
- **Lane / port** text filter — substring match against `top_dimensions` lane
  strings ("Shanghai - Los Angeles, California"). Works for any port/city named
  in a company's routes. ~40% coverage.
- **Forwarder** text filter — substring match against `top_forwarders` names.

Deliberately **not** wired the LLM `trade_lane.origin` (which extracts
**countries**, e.g. "China") to a server filter against the port-string lanes —
it would mostly return empty (port vs country mismatch) and read as broken.

## The real unlock: a shipment-level backfill

To make commodity (HS), structured ports, origin-country, mode, and precise lane
filtering work for the searchable population, we need BOL/shipment rows for tens
of thousands of directory companies, then per-company aggregates the Explorer can
filter on cheaply.

### Option A — Per-company aggregate table (recommended)

Build `lit_company_trade_profile` (one row per `source_company_key`):

```
source_company_key   text  primary key
origin_countries     text[]            -- ISO2, distinct
origin_ports         text[]            -- distinct
destination_ports    text[]            -- distinct
hs_codes             text[]            -- distinct, 2- or 4-digit chapters
hs_chapters          text[]            -- top-level commodity buckets
transport_modes      text[]
top_forwarders       text[]
last_shipment_at     timestamptz
shipment_count_12m   int
teu_12m              numeric
refreshed_at         timestamptz
```

- GIN-index the array columns → `origin_countries @> '{CN}'`, `hs_chapters && '{85}'`
  become fast, indexable filters in `pulse-explore` (no 5,000-row cap caveat).
- `pulse-explore` joins/filters this table when the parser emits
  `trade_lane` / `commodity` / `ports` / `mode`, then unions with the existing
  directory query.
- Parser already populates these dimensions — only the server filter + the
  aggregate table are missing.

### Backfill source + cost (the expensive part)

The 78k directory came from ImportYeti/Panjiva (`panjiva_profile_url` present).
Shipment detail must be pulled per company from the BOL provider
(ImportYeti / Explorium / the existing `lit_unified_shipments` ingestion path).

Estimate the real numbers before committing:
- **Volume:** ~78k companies (or a prioritized subset — e.g. the 31k with
  `top_dimensions`, or the top-N by opportunity score).
- **Provider cost:** $ per company / per BOL pull × volume (UNKNOWN — confirm with
  the data provider contract before approving).
- **Rate limits:** provider QPS → total wall-clock for the backfill (likely
  days/weeks via `pg_cron` batches, not a single run).
- **Freshness:** decide refresh cadence (e.g. re-pull on company view, + a rolling
  background refresh of the top-opportunity cohort).

### Phasing

1. **Phase 0 (done):** lane/forwarder client filter off `top_dimensions`.
2. **Phase 1:** create `lit_company_trade_profile` + GIN indexes; backfill ONLY
   the 338 companies already in `lit_unified_shipments` to prove the
   aggregate + `pulse-explore` filter path end-to-end (no provider spend).
3. **Phase 2:** prioritized backfill (top-N by opportunity, or the 31k with lane
   data) via batched `pg_cron`; measure provider cost on a 500-company pilot
   first.
4. **Phase 3:** full coverage + scheduled refresh; expose commodity/port/mode
   filters in the parser→server path and the filter bar.

## Open decisions (need product/owner input)

1. Backfill scope: all 78k, the 31k with lane data, or top-N by opportunity?
2. Provider + per-company cost ceiling (hard number before Phase 2).
3. Refresh cadence + whether on-view pulls are acceptable for trial users
   (interacts with the `pulse_search` / ImportYeti quota gating).

## Acceptance criteria (Phase 1)

- `lit_company_trade_profile` exists with GIN indexes on array columns.
- A `pulse-explore` request with `commodity.hs_codes:["85"]` or
  `geo.ports_discharge:["Long Beach"]` returns the correct subset for the 338
  seeded companies, verified by a direct SQL count match.
- No regression on existing Explorer searches (geo/industry/size still work).
