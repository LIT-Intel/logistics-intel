# P0-L: Deep shipment-history ingestion + lane × month rollup (SHIPPED 2026-08-12)

CEO-approved P0-L. Saved companies now accrete full BOL history beyond the
50-row `recent_bols` snapshot, and a per-company **lane × month** rollup table
exists for the Company Profile Lane Matrix UI.

> **P1 Lane Matrix UI SHIPPED 2026-08-12 (same day).** The Company Profile's
> Supply Chain tab now has a "Lane History" sub-tab rendering this rollup:
> `frontend/src/components/company/LaneHistoryMatrix.tsx` (pivot, filters,
> CSV export, freshness chip from `refreshed_at`, graceful "history builds
> automatically for saved companies" state with the 50-BOL sample labeled) +
> `frontend/src/api/laneHistory.ts` (24-month windowed query, authenticated
> RLS read). The trade-lanes globe was also rebuilt as a full-bleed dark hero
> (country-pair granularity unified between arcs and legend, arc hover flyout
> with real numbers, lane selection wired into the matrix filter).

## What exists now

### Tables / SQL (migrations `20260812220250` + `20260812220633`)

- **`lit_company_lane_months`** — the rollup the Lane Matrix UI reads.
  Columns: `company_id` (IY slug, = `lit_unified_shipments.company_id` =
  `lit_saved_companies.source_company_key`), `origin_country` (not null,
  'Unknown' fallback), `origin_city`, `dest_country`, `dest_state`,
  `dest_city`, `month` (date, month-start), `shipments` int, `teu` numeric,
  `refreshed_at`. RLS: `authenticated` SELECT (with base GRANT — verified),
  service_role all. Indexed `(company_id, month desc)`.
- **`lit_unified_shipments`** gained: `ingest_source` ('snapshot' | 'history'),
  `source_page`, `origin_city`.
- **`lit_rebuild_company_lane_months(p_company_id text) → int`** — security
  definer, service_role-execute only. Delete+reinsert of one company's rollup
  from its `lit_unified_shipments` rows (groups by lane fields +
  `date_trunc('month', bol_date)`).
- **`lit_company_history_ingest`** — per-company pagination state (offset,
  window page counter, complete flag, cumulative `last_request_cost` in IY
  credits). **`lit_history_ingest_budget`** — one row per UTC day,
  `pages_used`. Both service-role only.
- **Delete guard**: BEFORE DELETE trigger `lit_unified_shipments_history_guard`
  silently skips deletes of `ingest_source='history'` rows unless the session
  runs `select set_config('lit.allow_history_delete','on',true)`. This is what
  lets history rows survive the snapshot materializer's stale sweep even from
  stale fn bundles. (The TS sweep in `_shared/materialize_bols.ts` also
  excludes history rows.)

### Worker: `supabase/functions/company-history-ingest`

Cron: pg_cron `company-history-ingest-30m` every 30 min (X-Internal-Cron via
vault `LIT_CRON_SECRET`). Also callable server-to-server with the service-role
key as Bearer. Body: `{ company_id?, max_pages?, probe_path? }`.

**ImportYeti DMA facts (probed 2026-08-12, do not rediscover at credit cost):**
- `GET /company/{slug}/bols?offset=N` → `{ data: [bolNumber, ...] }` — always
  10 IDs per page, `limit` param is IGNORED, `offset` works. **1.0 credit/page.**
- `GET /bol/{bolId}` → full BOL detail (arrival_date is **MM/DD/YYYY** — unlike
  `recent_bols.date_formatted` which is DD/MM/YYYY — plus HS code, TEU, weight,
  containers, entry/exit port, geocoded company address with city/state/zip,
  supplier country/city, carrier SCAC, shipping_cost). **0.1 credit/BOL.**
- ≈ 2 credits per fully-hydrated page of 10 BOLs; BOL IDs already present in
  `lit_unified_shipments` (house OR master match) are just flipped to
  `ingest_source='history'` for free — no detail fetch.
- Everything cached 7d in `lit_importyeti_cache` (`bolsids:{slug}:{offset}`,
  `boldetail:{bolId}`); cache hits are free and don't consume budget.

**Cost knobs** (owner-tunable, no deploy):
`lit_internal_meta['company_history_ingest_config']` =
`{enabled, max_pages_per_company_per_window: 20, window_days: 30,
daily_page_budget: 12, max_pages_per_run: 3, refresh_stale_days: 30}`.
Defaults were set conservatively because the IY account had ~46 credits left on
ship day (daily worst case ≈ 24 credits at 12 pages). Raise
`daily_page_budget` after topping up credits.

## Query shape for the P1 Lane Matrix UI

```sql
select origin_country, origin_city, dest_country, dest_state, dest_city,
       month, shipments, teu
from lit_company_lane_months
where company_id = :slug            -- lit_saved_companies.source_company_key
  and month >= date_trunc('month', now())::date - interval '23 months'
order by month;
```

Pivot client-side: rows = lane (origin_country/origin_city →
dest_state/dest_city), columns = month, cells = shipments (+TEU tooltip).
`refreshed_at` on any row = last rollup rebuild time for the freshness chip.
Coverage grows automatically as the 30-min cron pages deeper; company-wide
totals for the same months live in `parsed_summary.monthly_volumes` if you
want a "coverage %" indicator (rollup shipments ÷ monthly_volumes shipments).

## Verified on ship day

tesla / trina-solar-u-s / pride-mobility-products ingested (2 ID pages each):
history rows landed, rollups materialized (tesla 29 lane-month rows, trina 23,
pride 31) with real city/state lanes, e.g. tesla 2026-07: Batam Island (SG) →
Kyle TX ×6 (11 TEU); Kendal (ID) → Kyle TX ×5; Tilburg (NL) → Austin TX ×2.
Delete-guard verified (plain DELETE skips history rows; set_config escape hatch
deletes them).

## Gotchas for future agents

- The GitHub auto-deploy workflow **skips `_shared/`-only diffs** — if you edit
  `_shared/materialize_bols.ts`, touch every fn dir that bundles it
  (importyeti-proxy, pulse-refresh-tick, pulse-unified-shipments-backfill,
  company-history-ingest) or redeploy via MCP.
- `probe_path` on company-history-ingest is a cron-authed raw DMA fetcher for
  endpoint archaeology. Each probe costs real credits.
- Deep ingestion is **saved-companies only** (owner rule). The worker 403s on
  non-saved slugs.
