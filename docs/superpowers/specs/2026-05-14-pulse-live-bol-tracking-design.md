# Pulse LIVE — BOL Tracking, Drayage Opportunity & Branded Reports

**Date:** 2026-05-14
**Status:** Draft for review

## Goal

Add a "Pulse LIVE" tab to the company drawer that surfaces real-time container tracking for every BOL we can resolve, calculates defensible drayage opportunity value per shipment, and exports branded PDF/Excel reports salespeople can hand to prospects in meetings. Enrich the existing shipment tab and weekly digest email with the same new data (POD, final destination, arrival dates, service icons, drayage opportunity value).

## Why

Today the company drawer shows historical BOL data from `lit_importyeti_company_snapshot` (origin port, consignee, container count, HS code) but no signal about **what's happening to those containers right now**. Salespeople have no way to answer:

- "When does Acme's next container arrive at Long Beach?"
- "What's the drayage opportunity if we win their inland trucking?"
- "Can I bring a printable container schedule to my Friday meeting with Acme's logistics manager?"

This feature closes those three gaps. It also feeds the weekly digest a much richer signal — instead of "volume up 86%" we can say "volume up 86%, 14 containers arriving Long Beach next week, ~$8,400 drayage opportunity."

## Tech Stack

- Backend: Supabase edge functions (Deno), Postgres, pg_cron, pg_net
- Tracking: Maersk Track & Trace Plus (free OAuth2) + Hapag-Lloyd DCSA T&T 2.0 (free OAuth2)
- Distance: OSRM public demo (free, unlimited fair-use) with haversine fallback
- Drayage cost: deterministic formula, 2026 industry coefficients (DAT, ATRI, PierPASS)
- PDF: jspdf (already installed) + jspdf-autotable (new ~40 KB)
- Excel: xlsx (already installed)
- Frontend: existing React + Vite + lucide-react icons

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        pulse-bol-tracking-tick                  │
│           (new daily cron, 06:00 UTC, SKIP LOCKED)              │
│                                                                 │
│  1. Select active BOLs (bol_date <= 60d, no arrival_date yet)   │
│  2. Group by SCAC                                               │
│  3. Route MAEU/SUDU/SAFM/MCPU → Maersk client                   │
│  4. Route HLCU/HLXU → Hapag-Lloyd client                        │
│  5. Skip everything else, mark tracking_status='unsupported'    │
│  6. Upsert events into lit_bol_tracking_events                  │
│  7. Update unified_shipments.arrival_date when DCSA "DISC"      │
│     (discharged) event arrives                                  │
│  8. Generate drayage cost row in lit_drayage_estimates          │
└─────────────────────────────────────────────────────────────────┘
                            │
        ┌───────────────────┼────────────────────┐
        ▼                   ▼                    ▼
┌──────────────┐  ┌──────────────────┐  ┌────────────────────┐
│  Pulse LIVE  │  │ Shipment tab     │  │ Weekly digest      │
│  tab         │  │ enrichment       │  │ enrichment         │
│  - report 1  │  │ - all existing   │  │ - POD/dest/arrival │
│  - report 2  │  │   fields         │  │   on volume card   │
│  - report 3  │  │ - + arrival date │  │ - drayage value    │
│  - PDF/XLSX  │  │ - + final dest   │  │   per company      │
│  download    │  │ - + service icon │  │ - service icons    │
└──────────────┘  └──────────────────┘  └────────────────────┘
```

## Sub-Projects (Sequential)

The work splits into 6 dependent sub-projects. Each one ships working software on its own. Default ordering is A→B→C→D→E→F:

| # | Sub-project | What ships standalone | Approx |
|---|---|---|---|
| **A** | **Shipment tab enrichment** (no API calls) | Surface existing ImportYeti fields (POD, final dest, arrival date, service mode icon) that are already in `lit_importyeti_company_snapshot` but not currently rendered | 1-2 days |
| **B** | **Carrier tracking ingest** | `pulse-bol-tracking-tick` edge fn + Maersk + Hapag-Lloyd clients + `lit_bol_tracking_events` table + DCSA event mapping | 3-4 days |
| **C** | **Drayage cost engine** | `_shared/drayage_cost.ts` + OSRM client + `lit_drayage_distance_cache` table + `lit_drayage_estimates` table + replace flat $450 in `revenueOpportunity.ts` | 2 days |
| **D** | **Pulse LIVE tab UI** | New tab in `Workspace.tsx`, renders tracking + drayage data, three report views (arrival dates, drayage opportunity, carrier breakdown) | 3 days |
| **E** | **Branded PDF & Excel exports** | `exportPulseLiveReportPdf.ts` (jsPDF + autoTable, multi-page branded) + `exportPulseLiveReportXlsx.ts` (multi-sheet) | 2 days |
| **F** | **Digest enrichment** | Volume alert card gains POD/final dest/arrival date/service icons; new "Drayage opportunity" digest section keyed off `lit_drayage_estimates` | 2 days |

Total: ~13-15 working days. Each sub-project ends with a PR mergeable to main.

## Data Model

### New tables

**`lit_bol_tracking_events`** — one row per DCSA event per BOL
```sql
CREATE TABLE lit_bol_tracking_events (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bol_number        text NOT NULL,
  scac              text NOT NULL,
  carrier           text NOT NULL,                  -- 'Maersk' | 'Hapag-Lloyd'
  event_code        text NOT NULL,                  -- DCSA: 'LOAD','DEPA','ARRI','DISC','GTOT','DLV'
  event_classifier  text,                           -- 'PLN' (planned) | 'ACT' (actual) | 'EST'
  event_timestamp   timestamptz NOT NULL,
  location_name     text,
  location_unloc    text,                           -- UN/LOCODE
  vessel_name       text,
  voyage_number     text,
  container_number  text,
  raw_payload       jsonb,
  fetched_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (bol_number, event_code, event_timestamp, container_number)
);
CREATE INDEX ON lit_bol_tracking_events (bol_number, event_timestamp DESC);
CREATE INDEX ON lit_bol_tracking_events (scac, fetched_at DESC);
```

**`lit_drayage_distance_cache`** — `(pod, dest) → miles` lookup
```sql
CREATE TABLE lit_drayage_distance_cache (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pod_unloc           text NOT NULL,
  dest_city_norm      text NOT NULL,                -- lowercased, trimmed
  dest_state          text,
  miles               numeric NOT NULL,
  source              text NOT NULL,                -- 'osrm' | 'haversine'
  resolved_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (pod_unloc, dest_city_norm, dest_state)
);
```

**`lit_drayage_estimates`** — one row per BOL × dest pair
```sql
CREATE TABLE lit_drayage_estimates (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bol_number          text NOT NULL,
  source_company_key  text NOT NULL,
  pod_unloc           text NOT NULL,
  destination_city    text,
  destination_state   text,
  miles               numeric NOT NULL,
  containers_eq       numeric NOT NULL,
  est_cost_usd        numeric NOT NULL,
  est_cost_low_usd    numeric NOT NULL,             -- -25%
  est_cost_high_usd   numeric NOT NULL,             -- +25%
  formula_version     text NOT NULL DEFAULT 'v1',
  computed_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (bol_number, destination_city, destination_state)
);
CREATE INDEX ON lit_drayage_estimates (source_company_key);
```

### Modified tables

**`unified_shipments`** — add tracking-state columns:
```sql
ALTER TABLE unified_shipments
  ADD COLUMN IF NOT EXISTS tracking_status text,    -- 'tracked' | 'unsupported' | 'no_match' | 'pending'
  ADD COLUMN IF NOT EXISTS tracking_eta timestamptz,
  ADD COLUMN IF NOT EXISTS tracking_arrival_actual timestamptz,
  ADD COLUMN IF NOT EXISTS tracking_last_event_code text,
  ADD COLUMN IF NOT EXISTS tracking_last_event_at timestamptz,
  ADD COLUMN IF NOT EXISTS tracking_refreshed_at timestamptz;
```

### RLS

All new tables use the existing pattern: service_role-only writes, user reads gated by ownership of the parent `lit_saved_companies` row.

## Carrier Integration Details

### Maersk Track & Trace Plus

- **Auth:** OAuth2 client-credentials at `https://api.maersk.com/customer-identity/oauth/v2/access_token`
- **Endpoint:** `GET https://api.maersk.com/track-and-trace-plus/v3/shipment-events?carrierBookingReference={bol}` or `?transportDocumentReference={bol}`
- **Scope:** `OAUTH:track-and-trace-plus`
- **Rate limit:** undocumented in public, treat as 100 req/min, throttle to 30 req/min
- **SCAC coverage:** MAEU, SUDU (Sealand), SAFM (Safmarine), MCPU (Hamburg Süd)
- **Secrets:** `MAERSK_CLIENT_ID`, `MAERSK_CLIENT_SECRET` (env vars on `pulse-bol-tracking-tick`)
- **Token cache:** in-edge-fn memo with 50-minute TTL (tokens last 1h)

### Hapag-Lloyd DCSA T&T 2.0

- **Auth:** OAuth2 client-credentials at `https://api.hlag.com/oauth2/token`
- **Endpoint:** `GET https://api.hlag.com/track-trace/v2/events?transportDocumentReference={bol}`
- **Rate limit:** ~60 req/min documented
- **SCAC coverage:** HLCU, HLXU
- **Secrets:** `HAPAG_CLIENT_ID`, `HAPAG_CLIENT_SECRET`
- **Token cache:** same as Maersk

### Refresh Policy

Daily cron at 06:00 UTC. Select BOLs WHERE:
- `bol_date >= now() - 60 days` AND
- `tracking_arrival_actual IS NULL` AND
- (`tracking_refreshed_at IS NULL` OR `tracking_refreshed_at < now() - 12 hours`)

Cap at 500 BOLs/run. SKIP LOCKED + advisory lock to make concurrent ticks safe. Exponential backoff on 429/5xx.

### SCAC Routing

```typescript
const SCAC_TO_CARRIER: Record<string, 'maersk' | 'hapag' | null> = {
  'MAEU': 'maersk', 'SUDU': 'maersk', 'SAFM': 'maersk', 'MCPU': 'maersk',
  'HLCU': 'hapag',  'HLXU': 'hapag',
};
// Anything else → tracking_status = 'unsupported'
```

## UI / UX

### Sub-project A — Shipment tab enrichment

The existing `CompanyShipmentsPanel.tsx` and `Workspace.tsx:Shipments` tab render: Date / BOL / MBL / HS / TEU / Qty / Shipper / Consignee / Description / Cost. Add columns:

- **Origin port** (already in `ShipmentLite.origin_port`, just unhidden)
- **POD** (from `ShipmentLite.destination_port`)
- **Final destination** (consignee city/state, derived from ImportYeti record)
- **Arrival date** (from `unified_shipments.arrival_date` when present)
- **Service icon** — small lucide-react badge next to the row:
  - `<Ship />` for FCL
  - `<Container />` for LCL
  - `<Plane />` for air mode
  - `<Truck />` for trucking/drayage rows in reports

No new API calls. Pure data-already-collected → render.

### Sub-project D — Pulse LIVE tab

New tab in `Workspace.tsx`, position between "Shipments" and "RFP" or as a sibling to "Shipments". Three view modes (segmented control at top):

**View 1 — "Arrival Schedule"**
Sorted by ETA ascending. Shows: BOL · carrier badge · POD · final dest · containers · ETA / arrival actual · current event. Color-codes: green if arrived, blue if in-transit with known ETA, gray if untracked ("Live tracking not available — only Maersk and Hapag-Lloyd shipments support live tracking").

**View 2 — "Drayage Opportunity"**
Sorted by `est_cost_usd` desc. Shows: BOL · final dest · containers · miles · est. drayage value (with ±25% band) · arrival date. Footer: "Total drayage opportunity across X BOLs: $Y,YYY (range $Y,YYY–$Y,YYY)". Disclosure inline: "*Estimated based on distance, container type, and port. Actual quoted rates vary ±25%.*"

**View 3 — "Carrier Mix"**
Bar chart of containers by carrier with tracked vs. untracked split. Surfaces coverage honestly — "62% of this importer's BOLs are on carriers we don't yet support for live tracking."

Below the three views, a "Download report" button group: `[Download PDF]` / `[Download Excel]`.

### Sub-project F — Digest email enrichment

The existing volume alert card renders `company_name · city, state · before → after shipments · pct`. Add a second line:

```
POD: Long Beach, CA · Final dest: Chicago, IL · Next arrival: May 21
```

And a new digest section after VOLUME ALERTS:

```
DRAYAGE OPPORTUNITY · 3 shipments
Acme Logistics — 4 containers · LA → Chicago · Est. value $3,200 ±25%
Pacific Trade — 2 containers · NJ → Atlanta · Est. value $1,750 ±25%
```

Service icons rendered as inline SVGs (lucide React renders fine in email if we serialize the paths to inline SVG strings — `digest_render.ts` already does this for other badges).

## Drayage Cost Formula (v1)

```typescript
function estimateDrayageCost(input: {
  pod_unloc: string;
  dest_city: string;
  dest_state: string;
  container_count: number;
  container_type: '20FT' | '40FT' | '40HC' | 'LCL';
  miles: number;
}): { cost: number; low: number; high: number } {
  const TEU_FACTOR = { '20FT': 1, '40FT': 1.8, '40HC': 1.8, 'LCL': 1.0 };
  const containers_eq = input.container_count * TEU_FACTOR[input.container_type];
  const base_per_mile = 3.15;
  const chassis_per_day = 45;
  const per_container_fee = 175;
  const fuel_pct = 0.22;
  const port_fee_per_teu = PORT_FEES[input.pod_unloc] ?? 0;
  const est_days = Math.ceil(input.miles / 450) + 1;
  const linehaul = base_per_mile * input.miles * containers_eq;
  const chassis = chassis_per_day * est_days;
  const accessorials = per_container_fee * input.container_count + port_fee_per_teu * containers_eq;
  const fuel = fuel_pct * (linehaul + chassis);
  let subtotal = linehaul + chassis + accessorials + fuel;
  if (input.container_type === 'LCL') subtotal *= 0.35;
  if (input.miles < 60) subtotal = Math.max(subtotal, 450 * input.container_count);
  return { cost: Math.round(subtotal), low: Math.round(subtotal * 0.75), high: Math.round(subtotal * 1.25) };
}
const PORT_FEES: Record<string, number> = {
  USLAX: 39.62, USLGB: 39.62,                    // LA / Long Beach PierPASS
  USNYC: 45, USEWR: 45,                          // NY/NJ congestion
  // ...others $0
};
```

Output column labeled **"Est. drayage value"** with the ±25% band always visible.

## PDF & Excel Export

### PDF (`exportPulseLiveReportPdf.ts`)
- jsPDF + jspdf-autotable
- Pages: cover (LIT gradient header, company name, date range), KPI summary, arrival schedule table, drayage opportunity table, carrier mix chart (as image), footer disclosure
- Brand header on every page via `didDrawPage` hook
- Font: built-in helvetica (avoids font-embed weight)
- Filename: `LIT-PulseLIVE-{company_slug}-{YYYY-MM-DD}.pdf`

### Excel (`exportPulseLiveReportXlsx.ts`)
- xlsx package, multi-sheet workbook
- Sheets: `KPIs`, `Shipments`, `Drayage`, `Carriers`
- Column widths set per sheet; freeze header rows
- Filename: `LIT-PulseLIVE-{company_slug}-{YYYY-MM-DD}.xlsx`

Shared brand constants in `frontend/src/lib/pulse/reportBrand.ts`:
```typescript
export const BRAND = {
  gradientStart: '#0F172A',
  gradientEnd: '#1E293B',
  accentCyan: '#00F0FF',
  mark: 'L',
  wordmark: 'Logistic Intel',
  footerCity: 'Atlanta, GA',
};
```

## Copy & Vendor-Neutrality Rules

Carryover from prior digest work, with one new exception:

- **Carrier names ARE allowed in user-facing copy** — Maersk, Hapag-Lloyd, Sealand, Safmarine, Hamburg Süd, etc. They are carriers (transport providers shippers use), not data-source vendors. Naming the carrier on a BOL is universal industry practice.
- **Vendor names still banned:** Vizion, Terminal49, ShipsGo, Project44, ImportYeti, Panjiva, Apollo, Lusha, Resend.
- **Freightos exception remains** — attribution required for FBX benchmarks only.
- **OSRM** — server-side only, never named in user copy. Distance attribution: "estimated based on standard logistics network".

UX helper text for the unsupported-carrier case (Sub-project A + D):

> *"Live container tracking is currently available for Maersk and Hapag-Lloyd shipments. We're working on expanding coverage to additional carriers."*

## Pre-Launch Checklist

- [ ] Maersk + Hapag-Lloyd developer accounts created, OAuth2 client credentials issued
- [ ] `MAERSK_CLIENT_ID`, `MAERSK_CLIENT_SECRET`, `HAPAG_CLIENT_ID`, `HAPAG_CLIENT_SECRET` set as env vars on `pulse-bol-tracking-tick`
- [ ] OSRM endpoint health-checked (have haversine fallback ready)
- [ ] jspdf-autotable installed (`npm i jspdf-autotable`)
- [ ] Brand constants verified against `docs/mockups/pulse-digest-sample.html`
- [ ] Manual draft of branded PDF reviewed by founder before public release
- [ ] One end-to-end test: pick a real Maersk BOL from `unified_shipments`, refresh tick, verify event appears in `lit_bol_tracking_events`, verify `unified_shipments.tracking_eta` populated
- [ ] Drayage formula calibrated against 3 known real quotes (sanity-check the ±25% band)
- [ ] Digest enrichment dry-run sent to `vraymond@logisticintel.com`

## Open Decisions (Defaults Marked)

These default values are baked into the spec above. Flag any you want to override before I write the plan:

1. **Sub-project order: sequential A→B→C→D→E→F** *(default)*. Alternative: ship A+F first as a "shipment page enriched + digest enriched" quick win in 3-4 days, then come back for B-E. Default is sequential because each piece compounds value with the next.

2. **Revenue Opportunity recompute: drayage only** *(default)*. The other 5 service lines (Ocean, Customs, Air, Warehousing, Trucking) already have real math in `revenueOpportunity.ts` and stay unchanged. Alternative: also recompute warehousing + trucking with real distance data now that we have OSRM.

3. **Refresh cadence: daily at 06:00 UTC** *(default)*. Carrier APIs update ~every 6h; daily refresh balances data freshness against API quota. Alternative: every-6h refresh on a smaller batch.

4. **Carrier coverage badge text** *(default)*: "Live container tracking is currently available for Maersk and Hapag-Lloyd shipments. We're working on expanding coverage to additional carriers." Override if you want different wording.

5. **Pulse LIVE tab position** *(default)*: between "Shipments" and "RFP" in `Workspace.tsx:341`. Override if you want it elsewhere (or as a sub-tab inside Shipments).

6. **Drayage formula confidence label**: shown inline as "*Estimated based on distance, container type, and port. Actual quoted rates vary ±25%.*" *(default)*. Override the disclosure wording if needed.
