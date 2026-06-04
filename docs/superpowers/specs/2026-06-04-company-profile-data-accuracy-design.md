# Company Profile Data Accuracy — Design

**Status:** Approved 2026-06-04
**Goal:** Make every widget on `/app/companies/:id` show accurate, live shipment intelligence that matches what Pulse sees. Eliminate the 6 reported inaccuracies surfaced during user review.

---

## Background

User-reported issues with concrete root causes (all confirmed via parallel agent investigation):

1. **Top Trade Lanes counts wrong** — Summary widget has hardcoded `.slice(0, 8)` at `CDPSupplyChain.tsx:1686`; snapshot's `parsed_summary.top_routes` only carries 4-10 entries because the parser truncates; snapshot is 28 days stale.
2. **Suppliers tab missing country / flag / count, broken formatting** — `aggregateSuppliers()` reads `parsed_summary.top_suppliers` (a flat `string[]`) and falls back to BOL `shipper_name`. Parser strips structured supplier metadata when writing the snapshot.
3. **Drayage defaults to $1,200 regardless of company / destination** — Formula + OSRM solver + accessorial table all exist (`_shared/drayage_cost.ts`). The `lit_drayage_estimates` table was specced but never migrated. `CDPRevenueOpportunity.tsx` accepts a `drayageRollup` prop the parent never passes.
4. **Firmographics (Headcount / Revenue / Founded / Top mode) empty** — `lit_companies.headcount/revenue/founded_year/top_mode` are only populated on Apollo enrichment. Most saved companies were never enriched.
5. **"Top Forwarder" widget shows the top supplier** — `parsed_summary.top_forwarders` is `0` on every snapshot (parser never writes it). Widget falls back to BOL `shipper_name` (which is the supplier).
6. **Saved companies not refreshing automatically; manual refresh returns "getlyCompanyProfile failed: non-2xx"** — Two distinct bugs:
   - **Cron picker bug**: `pulse-refresh-tick::pickStaleSnapshots` selects 20 oldest stale snapshots WITHOUT joining to `lit_saved_companies` first. Orphan snapshots (from search-page browsing) sort to the top, fill all 20 slots, then get filtered out as non-active. **Result: 0 saved companies refreshed for 14 straight days.**
   - **Frontend error surface**: `getIyCompanyProfile` throws a generic supabase-js error string instead of surfacing the structured `code` field. User sees "non-2xx" instead of "limit reached" or "service temporarily unavailable".

---

## Resolved decisions

| # | Decision |
|---|---|
| Cron cadence | **Weekly per company.** Daily cron (03:00 UTC) processes up to 40 stalest saves with TTL 7 days. 279 saved / 40 per day = full sweep every ~7 days. ImportYeti token-conscious. |
| Refresh button | On-demand manual refresh path, gated by existing `company_profile_view` quota in `importyeti-proxy`. User-initiated only. |
| Drayage strategy | Real OSRM-based calc (port → final destination distance × rate + accessorials). OSRM is free; no token-spend concern. |
| Firmographics | **One-time Apollo backfill** for the 279 saved companies. NOT a recurring cron. Going forward, new saves auto-enrich via existing `apollo-contact-enrich` / `normalize-company` flow at save time. |
| Total-shipments denominator | Standardize on **12-month rolling**, labeled "Shipments — last 12 months". Drop the lifetime number to eliminate same-company-two-numbers confusion. |
| Top Trade Lanes summary widget | Show **12 rows max**, with "View all" link to the full Trade Lanes tab. |
| `lit_unified_shipments` 50-BOL cap | **Leave as-is.** Expanding to full BOL history is a v2 architectural change. |

---

## Architecture

### Data flow (after the fix)

```
lit_saved_companies (279 rows)
        │
        │  daily cron (03:00 UTC, batch 40, TTL 7d)
        ▼
pulse-refresh-tick (fixed picker query) ──▶ importyeti_fetch ──▶ ImportYeti API
        │                                          │
        │                                          ▼
        │                                 lit_importyeti_company_snapshot
        │                                 (parsed_summary with structured
        │                                  top_suppliers + all top_routes)
        ▼
pulse-drayage-recompute (NEW backfill) ─▶ lit_drayage_estimates
                                          (per-company rollup keyed by
                                           destination port + dest city)
        ▼
apollo-contact-enrich (one-time backfill) ─▶ lit_companies
                                              (headcount, revenue, founded,
                                               top_mode populated)
        │
        ▼
        ┌──────────────────────────────────────────┐
        │  Company Profile UI (/app/companies/:id) │
        │  - Summary: top 12 lanes + "View all"    │
        │  - Trade Lanes tab: full routes          │
        │  - Suppliers tab: name + country + flag  │
        │    + shipment count + last shipment date │
        │  - Top Supplier widget (renamed from     │
        │    Top Forwarder; links to Suppliers tab)│
        │  - Revenue Opportunity: real drayage     │
        │    from lit_drayage_estimates            │
        │  - Firmographics: enriched fields        │
        └──────────────────────────────────────────┘
```

---

## Component A — Cron picker fix (THE BIG ONE)

**File:** `supabase/functions/pulse-refresh-tick/index.ts`

**Current bug** (`pickStaleSnapshots`, lines 97-115):
```ts
// Step 1: pull oldest 20 stale snapshots WITHOUT join to saves
.from("lit_importyeti_company_snapshot").select("company_id")
.lt("updated_at", ttl).order("updated_at", { ascending: true })
.limit(20);
// Step 2: filter that 20-slug set down to active saves — ALL FALL OUT
.from("lit_saved_companies").in("source_company_key", slugs)
.eq("refresh_status", "active");
```

**Fix** — single JOIN'd query via SQL RPC (PostgREST `select` embedding doesn't support ORDER BY on the join in this Supabase JS version):

```sql
-- New migration: pick_stale_saved_snapshots(p_limit int, p_ttl_hours int)
CREATE OR REPLACE FUNCTION public.pick_stale_saved_snapshots(p_limit int, p_ttl_hours int)
RETURNS TABLE(source_company_key text, snapshot_updated_at timestamptz)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT DISTINCT ON (sc.source_company_key)
         sc.source_company_key,
         s.updated_at AS snapshot_updated_at
    FROM lit_saved_companies sc
    INNER JOIN lit_importyeti_company_snapshot s
            ON s.company_id = sc.source_company_key
   WHERE sc.refresh_status = 'active'
     AND sc.source_company_key IS NOT NULL
     AND s.updated_at < (now() - (p_ttl_hours || ' hours')::interval)
   ORDER BY sc.source_company_key, s.updated_at ASC
   LIMIT p_limit;
$$;
```

**Tick body change:**
```ts
const { data: candidates } = await supa.rpc("pick_stale_saved_snapshots", {
  p_limit: BATCH_PER_TICK,    // 40
  p_ttl_hours: TTL_HOURS,     // 168 (7 days)
});
```

**Cron schedule change:** `*/15 * * * *` → `0 3 * * *` (daily at 03:00 UTC).

**Per-tick batch:** 20 → 40 (one tick covers a meaningful slice of 279 saves).

**TTL:** 14 days → 7 days (weekly refresh intent).

Net effect: 279 saved / 40 per day = full sweep every ~7 days, deterministic, ImportYeti-token-conscious.

---

## Component B — Snapshot parser: structured suppliers + all routes

**File:** `supabase/functions/_shared/importyeti_fetch.ts`

**Current parser output** (in `parsed_summary`):
```json
{
  "top_routes": [4-10 entries truncated],
  "top_suppliers": ["Supplier Name 1", "Supplier Name 2", ...]  // strings only
}
```

**New parser output:**
```json
{
  "top_routes": [<ALL routes from raw_payload, sorted by shipment count desc>],
  "top_suppliers": [
    {
      "name": "ACME Industries",
      "country": "China",
      "country_code": "CN",
      "shipment_count": 234,
      "last_shipment_date": "2026-05-15"
    },
    ...
  ]
}
```

The parser already reads `raw_payload.top_suppliers` from ImportYeti — the IY response carries country code + count + last shipment per supplier. Current code drops everything except `name`. The fix is to emit the full structured shape.

**Backward compatibility:** UI components must handle both old `string[]` rows (legacy snapshots before re-parse) AND new object array. Use a normalizer:

```ts
function normalizeSupplier(s: string | SupplierMeta): SupplierMeta {
  if (typeof s === "string") return { name: s };
  return s;
}
```

Drop the `top_forwarders` key entirely from `parsed_summary` — the parser never wrote it correctly and no replacement data source exists at the BOL level.

---

## Component C — Suppliers tab rewrite

**File:** `frontend/src/components/company/CDPSupplyChain.tsx` (`SuppliersView`, `aggregateSuppliers`)

Read the new structured `parsed_summary.top_suppliers` shape (object array). Render each row with:

- Country flag emoji via existing `getCountryFlag(country_code)` helper
- Supplier name
- Country name
- Shipment count (12-month rolling, from snapshot)
- Last shipment date (humanized: "3 weeks ago")

Sidebar reuse: pass selected supplier to the existing detail drawer pattern (same as Top Trade Lanes drill-in).

**Fallback** when `top_suppliers` is `string[]` (legacy snapshot): show name + "Country pending" placeholder. Triggers a re-refresh badge.

---

## Component D — Top Supplier widget (renamed from Top Forwarder)

**File:** `frontend/src/components/company/CDPDetailsPanel.tsx` (lines 223-259)

- Rename label: "Top Forwarder" → "Top Supplier"
- Data source: `parsed_summary.top_suppliers[0]` (after Component B re-parses)
- Click handler: navigate to Suppliers tab on the same profile (use existing tab state setter; preserve scroll position)
- Drop the BOL `shipper_name` fallback path — it's the source of the confusion

---

## Component E — Drayage real calc

**Migration:** Create two tables that were specced but never deployed.

```sql
-- Migration: lit_drayage_estimates + lit_drayage_distance_cache
CREATE TABLE public.lit_drayage_estimates (
  id              uuid primary key default gen_random_uuid(),
  company_id      text not null,
  bol_number      text,
  pod_unloc       text,
  dest_city       text,
  dest_state      text,
  miles           numeric,
  containers_eq   numeric,
  est_cost_usd    numeric,
  est_cost_low_usd  numeric,
  est_cost_high_usd numeric,
  computed_at     timestamptz default now(),
  unique (company_id, bol_number)
);
CREATE INDEX ON public.lit_drayage_estimates (company_id, computed_at desc);

CREATE TABLE public.lit_drayage_distance_cache (
  id              uuid primary key default gen_random_uuid(),
  pod_unloc       text not null,
  dest_city       text,
  dest_state      text,
  miles           numeric not null,
  source          text not null,  -- 'osrm' or 'haversine'
  computed_at     timestamptz default now(),
  unique (pod_unloc, dest_city, dest_state)
);
```

**Backfill job:** Run `pulse-drayage-recompute` against all `lit_unified_shipments` rows for saved companies (one-time). Then keep fresh as new BOLs arrive — same daily cron that picks stale snapshots can also recompute drayage for any company whose snapshot was just refreshed.

**Frontend wiring** (`CDPRevenueOpportunity.tsx` parent → `CompanyProfileV2.tsx`):

```ts
const { data: drayageRollup } = useQuery(["drayage-rollup", companyId], () =>
  supabase
    .from("lit_drayage_estimates")
    .select("dest_city, dest_state, pod_unloc, est_cost_usd, containers_eq")
    .eq("company_id", companyId)
    .order("computed_at", { ascending: false })
);

<CDPRevenueOpportunity drayageRollup={drayageRollup ?? []} ... />
```

The component already accepts the prop and uses it correctly — the bug is just that the parent never passes it. Drop the `$1,200 × FCL` fallback entirely; show "Drayage cost: not yet calculated" when rollup is empty (with a "Compute now" button that triggers `pulse-drayage-recompute` for that company).

---

## Component F — Firmographics backfill

**One-time job** (NOT a recurring cron per user direction):

```sql
-- Find saved companies missing firmographics
SELECT lc.id, lc.name, lc.domain
  FROM lit_companies lc
  INNER JOIN lit_saved_companies sc ON sc.company_id = lc.id
 WHERE lc.headcount IS NULL OR lc.revenue IS NULL OR lc.founded_year IS NULL;
```

For each, invoke `apollo-contact-enrich` (or `normalize-company` if Apollo already has the domain) to fill the fields. Existing edge functions; no new code.

**Going-forward**: `save-company` edge fn already invokes `normalize-company` on save → newly-saved companies get firmographics auto-populated. Verify this path is firing.

---

## Component G — Error-surface fix on manual refresh

**File:** `frontend/src/lib/api.ts` (`getIyCompanyProfile`, lines 2845-2960)

Current behavior throws a generic supabase-js error message. Fix: extract structured `code` + `message` from the response body and surface them in the toast.

```ts
if (resp.status === 403 && data?.code === "LIMIT_EXCEEDED") {
  const err = new Error(data.message ?? "Monthly refresh limit reached. Upgrade to refresh more frequently.");
  (err as any).code = "LIMIT_EXCEEDED";
  (err as any).limit = data;
  throw err;
}
if (resp.status >= 500) {
  throw new Error("Refresh temporarily unavailable. Try again in a few minutes.");
}
```

UI: catch the typed error in `CDPDetailsPanel.tsx`, show `UpgradeRequiredInline` for `LIMIT_EXCEEDED` (same pattern as Pulse), generic retry-able toast for 5xx.

---

## Standardize total-shipments denominator

**File:** `frontend/src/components/company/CDPDetailsPanel.tsx` + widgets

Stop reading `parsed_summary.total_shipments` (lifetime). Read only `lit_company_index.total_shipments` (12-month rolling). Label clearly: **"Shipments — last 12 months"**. Remove the lifetime number from the profile entirely.

Same standardization on the Pulse coach summary so the two surfaces never disagree.

---

## Out of scope (intentionally not in this round)

- Expanding `lit_unified_shipments` beyond the 50-BOL cap (v2 architectural change)
- Recurring weekly cron for firmographics or drayage (drayage is OSRM-based + free, runs only when snapshot refreshes; firmographics is one-time backfill per user direction)
- Real-time push from ImportYeti webhooks (no IY webhook product exists today)
- Per-org refresh-quota override (use existing `company_profile_view` quota in `importyeti-proxy`)

---

## Acceptance criteria

1. Open EAE's profile. The snapshot timestamp shows "Refreshed today" (or within the last 7 days), with current shipment counts matching what Pulse shows for the same company.
2. Top Trade Lanes summary widget shows 12 lanes; "View all" link opens the full Trade Lanes tab with every lane the snapshot carries.
3. Suppliers tab renders each row with: country flag, supplier name, country name, shipment count, last shipment date. Click opens detail drawer.
4. Revenue Opportunity tab shows a drayage cost that reflects the actual port → destination distance × rate + accessorials. No `$1,200 × FCL` flat value anywhere.
5. Firmographics block on all 279 saved companies shows non-null Headcount / Revenue / Founded / Top mode (or "Not available" with a clear reason — not just "—").
6. Top Supplier widget (renamed) shows the #1 supplier from the snapshot; clicking it navigates to the Suppliers tab on the same page.
7. Click Refresh button on a stale profile → snapshot updates within 30 seconds. If the user has hit the monthly quota, an `UpgradeRequiredInline` banner appears instead of a generic "non-2xx" error.
8. Cron query `SELECT count(*) FROM lit_importyeti_company_snapshot WHERE company_id IN (SELECT source_company_key FROM lit_saved_companies WHERE refresh_status='active') AND updated_at > now() - interval '7 days';` returns at least 250 (90% of 279 saved companies refreshed within the last week).
