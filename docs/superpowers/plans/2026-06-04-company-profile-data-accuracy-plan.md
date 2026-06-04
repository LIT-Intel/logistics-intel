# Company Profile Data Accuracy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the 6 reported inaccuracies on `/app/companies/:id` — stale snapshots, capped trade lanes, broken suppliers tab, flat-$1,200 drayage, empty firmographics, mislabelled "Top Forwarder", and the manual-refresh non-2xx error.

**Architecture:** One root-cause fix unblocks most issues — `pulse-refresh-tick`'s picker query never joined to `lit_saved_companies`, so 80% of saves never got refreshed. Fix the picker (Tasks 1-2), then extend the parser to emit structured suppliers + uncapped routes (Task 3-4), rewrite Suppliers tab + rename Top Forwarder (Tasks 5-7), wire real OSRM-based drayage rollup (Tasks 8-11), backfill firmographics for the 279 existing saves (Task 12), surface structured manual-refresh errors (Task 13), and standardize denominators (Tasks 14-15). Manual acceptance at Task 16.

**Tech Stack:** Supabase edge functions (Deno + std@0.224.0), Postgres + pg_cron + pg_net, Supabase MCP, React 18 + TypeScript, Tailwind, lucide-react, existing `_shared/drayage_cost.ts` + `_shared/osrm_client.ts`.

**Spec:** [docs/superpowers/specs/2026-06-04-company-profile-data-accuracy-design.md](../specs/2026-06-04-company-profile-data-accuracy-design.md)

**Branch policy:** All work on `claude/review-dashboard-deploy-3AmMD`. Multi-file edge fn deploys explicitly authorized per task.

---

## File Structure

### New files
- `supabase/migrations/20260604_pick_stale_saved_snapshots_rpc.sql` — Component A picker fix
- `supabase/migrations/20260604_pulse_refresh_tick_cron_weekly.sql` — Cron schedule + GUC rebind
- `supabase/migrations/20260604_lit_drayage_tables.sql` — Drayage rollup + distance cache
- `supabase/functions/_shared/supplier-normalize.ts` — Object | string normalizer + Deno tests
- `supabase/functions/_shared/supplier-normalize.test.ts`
- `frontend/src/lib/api/drayageRollup.ts` — Hook + fetcher for `lit_drayage_estimates` rollup

### Modified files
- `supabase/functions/pulse-refresh-tick/index.ts` — Use RPC + tighter constants
- `supabase/functions/_shared/importyeti_fetch.ts` — Structured `pickTopSuppliers` + uncapped `topRoutes`
- `frontend/src/components/company/CDPSupplyChain.tsx` — SuppliersView rewrite, lane cap → 12, "View all" link
- `frontend/src/components/company/CDPDetailsPanel.tsx` — Top Forwarder → Top Supplier (rename + link)
- `frontend/src/components/company/CDPRevenueOpportunity.tsx` — Parent passes drayageRollup; drop $1,200 fallback
- `frontend/src/lib/revenueOpportunity.ts` — Drop hardcoded $1,200 fallback, replace with "not calculated" sentinel
- `frontend/src/lib/api.ts` — `getIyCompanyProfile` structured error surface

---

## Task 1: Add picker RPC migration

**Files:**
- Create: `supabase/migrations/20260604_pick_stale_saved_snapshots_rpc.sql`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260604_pick_stale_saved_snapshots_rpc.sql`:

```sql
-- Picks the oldest stale snapshots that ALSO belong to active saves.
-- Fixes the pulse-refresh-tick bug where the picker selected stalest
-- snapshots without joining to lit_saved_companies first — orphan
-- snapshots from search-page browsing sorted to the top, filled all
-- 20 slots, then got filtered out as non-active. Result: 0 saved
-- companies refreshed for 14 straight days.
--
-- DISTINCT ON dedupes the case where multiple users saved the same
-- company. SECURITY DEFINER so the cron-invoked edge fn can call it
-- against tables it doesn't have direct SELECT on.

CREATE OR REPLACE FUNCTION public.pick_stale_saved_snapshots(p_limit int, p_ttl_hours int)
RETURNS TABLE(source_company_key text, snapshot_updated_at timestamptz)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
$function$;
```

- [ ] **Step 2: Apply via Supabase MCP**

Use `mcp__claude_ai_Supabase__apply_migration`:
- project_id: `jkmrfiaefxwgbvftohrb`
- name: `pick_stale_saved_snapshots_rpc`
- query: contents of the migration file above

- [ ] **Step 3: Verify the RPC exists + returns the right shape**

Use `mcp__claude_ai_Supabase__execute_sql` with project_id `jkmrfiaefxwgbvftohrb`:

```sql
SELECT proname, pg_get_function_identity_arguments(oid) AS args
  FROM pg_proc WHERE proname = 'pick_stale_saved_snapshots';
```

Expected: one row, args `p_limit integer, p_ttl_hours integer`.

Test with realistic params:
```sql
SELECT * FROM pick_stale_saved_snapshots(40, 168) LIMIT 5;
```

Expected: up to 5 rows of `(source_company_key, snapshot_updated_at)` for the oldest saved+stale companies. Should include `eae-usa` and `lg-electronics-u-s-a` (both confirmed 28 days old in the audit).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260604_pick_stale_saved_snapshots_rpc.sql
git commit -m "feat(profile): add pick_stale_saved_snapshots RPC

Fixes the cron picker bug where the previous query selected the
oldest stale snapshots WITHOUT joining to lit_saved_companies.
Orphan snapshots (from search-page browsing) sorted to the top,
filled all 20 slots, then got filtered out — 0 saved companies
refreshed for 14 straight days.

The new RPC INNER JOINs saves → snapshots in a single query, so
the LIMIT applies after the saved-company filter. Returns the
oldest stale slugs per saved company (DISTINCT ON for multi-user
saves), SECURITY DEFINER so cron can call it."
```

---

## Task 2: Wire pulse-refresh-tick to the RPC + tighten cadence

**Files:**
- Modify: `supabase/functions/pulse-refresh-tick/index.ts` (constants + `pickStaleSnapshots`)
- Create: `supabase/migrations/20260604_pulse_refresh_tick_cron_weekly.sql`

- [ ] **Step 1: Read existing constants + picker**

```bash
sed -n '15,20p;95,120p' supabase/functions/pulse-refresh-tick/index.ts
```

Confirms: `BATCH_SIZE = 20`, `TTL_DAYS = 14`, `pickStaleSnapshots` lives lines 97-115.

- [ ] **Step 2: Update constants**

Open `supabase/functions/pulse-refresh-tick/index.ts`. Replace lines 15-17:

```typescript
// Weekly refresh cadence: cron runs once daily, processes up to 40
// stalest saves per tick. 279 saved companies / 40 per day ≈ full
// sweep every 7 days. TTL aligned with that cadence.
const BATCH_SIZE = 40;
const TTL_HOURS = 24 * 7; // 7 days
```

Remove the `TTL_DAYS` constant if any other code in the file references it (search and replace if needed).

- [ ] **Step 3: Replace `pickStaleSnapshots` body**

Find the function (lines ~97-115) and replace its body with a call to the new RPC:

```typescript
async function pickStaleSnapshots(supabase: any, limit: number): Promise<string[]> {
  // Delegate to pick_stale_saved_snapshots RPC. The RPC does the
  // INNER JOIN between lit_saved_companies and lit_importyeti_company_snapshot
  // so the LIMIT applies AFTER the active-save filter. Previous in-app
  // two-step query (select 20 oldest snapshots, then filter to saved)
  // shipped 0 candidates because orphan snapshots filled all 20 slots.
  const { data, error } = await supabase.rpc("pick_stale_saved_snapshots", {
    p_limit: limit,
    p_ttl_hours: TTL_HOURS,
  });
  if (error) {
    console.error("[pulse-refresh-tick] pick_stale_saved_snapshots RPC failed:", error);
    return [];
  }
  return (data ?? []).map((row: { source_company_key: string }) => row.source_company_key);
}
```

- [ ] **Step 4: Write the cron schedule migration**

Create `supabase/migrations/20260604_pulse_refresh_tick_cron_weekly.sql`:

```sql
-- Switch pulse-refresh-tick from every-15-min to daily-at-03:00 UTC.
-- Combined with BATCH_SIZE=40 + TTL=7 days inside the edge function,
-- this yields ~one refresh per saved company per week — the cadence
-- the operator approved for ImportYeti-token-conscious operation.

SELECT cron.unschedule('pulse-refresh-tick-15min')
 WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'pulse-refresh-tick-15min');

SELECT cron.unschedule('pulse-refresh-tick-daily')
 WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'pulse-refresh-tick-daily');

SELECT cron.schedule(
  'pulse-refresh-tick-daily',
  '0 3 * * *',
  $$
  SELECT net.http_post(
    url := 'https://jkmrfiaefxwgbvftohrb.supabase.co/functions/v1/pulse-refresh-tick',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Internal-Cron', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'LIT_CRON_SECRET')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  ) AS request_id;
  $$
);
```

- [ ] **Step 5: Apply the cron migration via MCP**

Use `mcp__claude_ai_Supabase__apply_migration`:
- project_id: `jkmrfiaefxwgbvftohrb`
- name: `pulse_refresh_tick_cron_weekly`
- query: contents above

- [ ] **Step 6: Verify cron job is scheduled**

```sql
SELECT jobname, schedule, active
  FROM cron.job
 WHERE jobname IN ('pulse-refresh-tick-15min', 'pulse-refresh-tick-daily');
```

Expected: exactly one row (`pulse-refresh-tick-daily`, `0 3 * * *`, active=true). The 15-min job should be gone (unscheduled).

- [ ] **Step 7: Deploy the updated edge function**

Use `mcp__claude_ai_Supabase__deploy_edge_function`. Multi-file deploy authorized — include the file + any `_shared` siblings the function imports:

```bash
grep -n "from \"../_shared" supabase/functions/pulse-refresh-tick/index.ts | head -5
```

Build the `files` array with `{ name: "index.ts", content }` plus one `{ name: "../_shared/<sibling>.ts", content }` per import found. project_id `jkmrfiaefxwgbvftohrb`, verify_jwt false (current setting; verify via `get_edge_function` first).

- [ ] **Step 8: Manually trigger the tick to kick off the back-fill immediately**

```bash
curl -X POST "https://jkmrfiaefxwgbvftohrb.supabase.co/functions/v1/pulse-refresh-tick" \
  -H "X-Internal-Cron: $(supabase secrets get LIT_CRON_SECRET 2>/dev/null || echo SKIP)" \
  -H "Content-Type: application/json" -d '{}' 2>&1 | tail -3
```

Expected response: `{"ok":true,"processed":N, ...}` where N > 0 (the function actually picks up saved companies now). If `processed=0`, the RPC isn't matching anything — verify the RPC returns rows via SQL (Step 3).

If the X-Internal-Cron header isn't easily fetchable from CLI, skip this step — the cron will fire at 03:00 UTC anyway.

- [ ] **Step 9: Verify EAE + LG actually got refreshed**

After the manual trigger (or after the next cron tick):

```sql
SELECT company_id, updated_at
  FROM lit_importyeti_company_snapshot
 WHERE company_id IN ('eae-usa', 'lg-electronics-u-s-a')
 ORDER BY updated_at DESC;
```

Expected: both rows have `updated_at` within the last few minutes (post-trigger) or hours (post-cron). If still stamped `2026-05-07`, investigate edge fn logs.

- [ ] **Step 10: Commit**

```bash
git add supabase/functions/pulse-refresh-tick/index.ts supabase/migrations/20260604_pulse_refresh_tick_cron_weekly.sql
git commit -m "feat(profile): pulse-refresh-tick uses RPC picker + weekly cadence

Constants: BATCH_SIZE 20→40, TTL_DAYS 14 → TTL_HOURS 168 (7 days).
pickStaleSnapshots now delegates to pick_stale_saved_snapshots RPC
which INNER JOINs lit_saved_companies → lit_importyeti_company_snapshot
in one query.

Cron schedule: '*/15 * * * *' (every 15 min, batch 20) → '0 3 * * *'
(daily 03:00 UTC, batch 40). 279 saved / 40 per day = full sweep
every ~7 days. ImportYeti-token-conscious per operator direction."
```

---

## Task 3: Extend importyeti_fetch parser — structured suppliers + uncapped routes

**Files:**
- Modify: `supabase/functions/_shared/importyeti_fetch.ts` (`pickTopSuppliers` + `topRoutes` slice)

- [ ] **Step 1: Read the current `pickTopSuppliers` function**

```bash
sed -n '716,732p' supabase/functions/_shared/importyeti_fetch.ts
```

Confirms: current shape returns `string[]` capped at 10, dropping country / count / dates.

- [ ] **Step 2: Add the structured supplier type + new `pickTopSuppliersStructured`**

Open `supabase/functions/_shared/importyeti_fetch.ts`. Find `function pickTopSuppliers(raw: any): string[]` (line 717). Replace with:

```typescript
type StructuredSupplier = {
  name: string;
  country: string | null;
  country_code: string | null;
  shipment_count: number | null;
  last_shipment_date: string | null;
};

/**
 * Returns structured supplier rows preserving country, shipment count,
 * last shipment date. Previous shape was `string[]` capped at 10 which
 * dropped every field the Suppliers tab needs (flag, count, date).
 *
 * Kept at top 30 (was 10) because the Suppliers tab now renders the
 * full list; "Show more" is the UI's job, not the parser's.
 */
function pickTopSuppliers(raw: any): StructuredSupplier[] {
  const rows = Array.isArray(raw?.suppliers_table) ? raw.suppliers_table : [];
  const seen = new Set<string>();
  const out: StructuredSupplier[] = [];
  for (const row of rows) {
    const name =
      normalizeString(row?.supplier) ??
      normalizeString(row?.supplier_name) ??
      normalizeString(row?.shipper) ??
      normalizeString(row?.name);
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    const country =
      normalizeString(row?.country) ??
      normalizeString(row?.supplier_country) ??
      null;
    const country_code =
      normalizeString(row?.country_code) ??
      normalizeString(row?.iso2) ??
      normalizeString(row?.country_iso) ??
      null;
    const shipment_count =
      normalizeNumber(row?.shipments) ??
      normalizeNumber(row?.shipment_count) ??
      normalizeNumber(row?.count) ??
      null;
    const last_shipment_date =
      normalizeString(row?.last_shipment_date) ??
      normalizeString(row?.last_date) ??
      normalizeString(row?.last_bol_date) ??
      null;

    out.push({ name, country, country_code, shipment_count, last_shipment_date });
    if (out.length >= 30) break;
  }
  // Sort by shipment_count desc, nulls last.
  out.sort((a, b) => (b.shipment_count ?? -1) - (a.shipment_count ?? -1));
  return out;
}
```

The caller at line 274 (`const topSuppliers = pickTopSuppliers(raw);`) stays the same; only the return shape changes.

- [ ] **Step 3: Uncap `topRoutes`**

Find lines 239-242:

```typescript
  topRoutes = topRoutes
    .filter((entry) => isUsableRouteLabel(entry?.route))
    .sort((a, b) => b.shipments - a.shipments)
    .slice(0, 10);
```

Replace with:

```typescript
  topRoutes = topRoutes
    .filter((entry) => isUsableRouteLabel(entry?.route))
    .sort((a, b) => b.shipments - a.shipments);
  // No truncation — Trade Lanes tab renders the full list; Summary
  // widget shows top 12 and links to the full tab. Capping here
  // permanently destroys routes 11+ from the snapshot, breaking the
  // full-list view downstream.
```

- [ ] **Step 4: Drop `top_forwarders` from the emitted `parsed_summary`**

If the file emits a `top_forwarders` key in the `parsed_summary` object (search the file: `grep -n "top_forwarders" supabase/functions/_shared/importyeti_fetch.ts`), delete that key. The parser never populated it correctly and no replacement data source exists. UI Components D + E remove the consumers.

If no `top_forwarders` key is currently emitted (audit said it's `0` on every snapshot — meaning the field is absent), no edit needed.

- [ ] **Step 5: Local type-check**

The file is a Deno module. Verify it parses:

```bash
"/c/Users/vraym/.deno/bin/deno.exe" check --quiet --no-config supabase/functions/_shared/importyeti_fetch.ts 2>&1 | tail -10
```

Expected: zero output (clean parse). If errors, fix them.

- [ ] **Step 6: Deploy via Supabase MCP**

`_shared` files are deployed as siblings of edge functions. Re-deploy ALL edge functions that import `_shared/importyeti_fetch.ts` so they pick up the new helper:

```bash
grep -rln "_shared/importyeti_fetch" supabase/functions/ 2>/dev/null
```

For each function listed (likely `pulse-refresh-tick`, `importyeti-proxy`), re-deploy via `mcp__claude_ai_Supabase__deploy_edge_function` with the updated `_shared/importyeti_fetch.ts` content alongside `index.ts`. Multi-file deploy authorized.

- [ ] **Step 7: Trigger a refresh for EAE to populate the new shape**

After Task 2 cron is live, the daily tick will eventually re-parse EAE. To verify the new shape sooner, hit the manual refresh path for EAE via the user's browser OR via SQL:

```sql
-- Force a refresh by clearing the snapshot for EAE so the next tick re-fetches
UPDATE lit_importyeti_company_snapshot
   SET updated_at = '2020-01-01'
 WHERE company_id = 'eae-usa';
```

Then manually trigger the tick (Task 2 Step 8) and verify the new shape:

```sql
SELECT jsonb_pretty(parsed_summary->'top_suppliers'->0) AS first_supplier
  FROM lit_importyeti_company_snapshot
 WHERE company_id = 'eae-usa';
```

Expected: object with `{ name, country, country_code, shipment_count, last_shipment_date }`. NOT a bare string.

- [ ] **Step 8: Commit**

```bash
git add supabase/functions/_shared/importyeti_fetch.ts
git commit -m "feat(profile): structured top_suppliers + uncapped top_routes

pickTopSuppliers returns StructuredSupplier[] (name + country +
country_code + shipment_count + last_shipment_date) instead of
string[]. Cap raised from 10 to 30 — UI handles 'Show more'.

topRoutes truncation .slice(0, 10) removed. The full Trade Lanes
tab needs every route; capping at parser-time permanently destroys
routes 11+ in the snapshot. The Summary widget will continue to
show top 12 with a 'View all' link to the full tab.

Backward compat: UI components (Tasks 5-6) include a normalizer
helper that accepts both string and object shapes during the
transition window where some snapshots still carry legacy shape."
```

---

## Task 4: Supplier normalizer helper (TDD)

**Files:**
- Create: `supabase/functions/_shared/supplier-normalize.ts`
- Create: `supabase/functions/_shared/supplier-normalize.test.ts`
- Mirror in `frontend/src/lib/`: `supplierNormalize.ts` (same logic, TS-typed for the React tree)

The same shape needs to be consumed in both edge functions (for downstream consumers) and the React UI. To avoid duplication risk, write the canonical helper once with tests, then mirror to the frontend.

- [ ] **Step 1: Write the failing Deno test**

Create `supabase/functions/_shared/supplier-normalize.test.ts`:

```typescript
import { normalizeSupplier, type Supplier } from "./supplier-normalize.ts";

Deno.test("normalizeSupplier — string input becomes name-only object", () => {
  const r = normalizeSupplier("Acme Industries");
  if (r.name !== "Acme Industries") throw new Error(`expected name='Acme Industries', got ${r.name}`);
  if (r.country !== null) throw new Error(`expected country=null, got ${r.country}`);
  if (r.country_code !== null) throw new Error(`expected country_code=null`);
  if (r.shipment_count !== null) throw new Error(`expected shipment_count=null`);
  if (r.last_shipment_date !== null) throw new Error(`expected last_shipment_date=null`);
});

Deno.test("normalizeSupplier — object input passes through with defaults", () => {
  const input = { name: "ACME", country: "China", country_code: "CN", shipment_count: 234, last_shipment_date: "2026-05-15" };
  const r = normalizeSupplier(input);
  if (r.name !== "ACME") throw new Error("name");
  if (r.country !== "China") throw new Error("country");
  if (r.country_code !== "CN") throw new Error("country_code");
  if (r.shipment_count !== 234) throw new Error("count");
  if (r.last_shipment_date !== "2026-05-15") throw new Error("date");
});

Deno.test("normalizeSupplier — object missing optional fields defaults to null", () => {
  const r = normalizeSupplier({ name: "X" });
  if (r.country !== null) throw new Error("country should default null");
  if (r.country_code !== null) throw new Error("country_code should default null");
  if (r.shipment_count !== null) throw new Error("shipment_count should default null");
  if (r.last_shipment_date !== null) throw new Error("last_shipment_date should default null");
});

Deno.test("normalizeSupplier — whitespace-only string returns empty name", () => {
  const r = normalizeSupplier("   ");
  if (r.name !== "") throw new Error(`expected name='', got '${r.name}'`);
});

Deno.test("normalizeSupplier — object without name returns empty name", () => {
  const r = normalizeSupplier({ country: "US" } as any);
  if (r.name !== "") throw new Error("name should be empty when missing");
  if (r.country !== "US") throw new Error("country should pass through");
});
```

- [ ] **Step 2: Run the test, expect failure**

```bash
"/c/Users/vraym/.deno/bin/deno.exe" test --no-check --allow-read supabase/functions/_shared/supplier-normalize.test.ts
```

Expected: All tests FAIL with "Module not found".

- [ ] **Step 3: Implement the helper**

Create `supabase/functions/_shared/supplier-normalize.ts`:

```typescript
/**
 * Normalizes legacy string-shaped suppliers + new structured suppliers
 * into a single shape that downstream consumers (Suppliers tab UI,
 * Top Supplier widget, drayage rollup grouper) can consume uniformly.
 *
 * Legacy: parsed_summary.top_suppliers used to be `string[]`. New
 * snapshots from importyeti_fetch v2 (Task 3) emit object array. UI
 * sees both during the transition window — this helper bridges.
 */

export type Supplier = {
  name: string;
  country: string | null;
  country_code: string | null;
  shipment_count: number | null;
  last_shipment_date: string | null;
};

export function normalizeSupplier(input: string | Partial<Supplier> | unknown): Supplier {
  if (typeof input === "string") {
    return {
      name: input.trim(),
      country: null,
      country_code: null,
      shipment_count: null,
      last_shipment_date: null,
    };
  }
  if (input && typeof input === "object") {
    const obj = input as Partial<Supplier>;
    return {
      name: typeof obj.name === "string" ? obj.name.trim() : "",
      country: typeof obj.country === "string" ? obj.country : null,
      country_code: typeof obj.country_code === "string" ? obj.country_code.toUpperCase() : null,
      shipment_count: typeof obj.shipment_count === "number" ? obj.shipment_count : null,
      last_shipment_date: typeof obj.last_shipment_date === "string" ? obj.last_shipment_date : null,
    };
  }
  return { name: "", country: null, country_code: null, shipment_count: null, last_shipment_date: null };
}
```

- [ ] **Step 4: Run the test, expect pass**

```bash
"/c/Users/vraym/.deno/bin/deno.exe" test --no-check --allow-read supabase/functions/_shared/supplier-normalize.test.ts
```

Expected: 5 passed; 0 failed.

- [ ] **Step 5: Mirror to frontend**

Create `frontend/src/lib/supplierNormalize.ts` with the same logic, TS-typed for the React tree:

```typescript
export type Supplier = {
  name: string;
  country: string | null;
  country_code: string | null;
  shipment_count: number | null;
  last_shipment_date: string | null;
};

export function normalizeSupplier(input: string | Partial<Supplier> | unknown): Supplier {
  if (typeof input === "string") {
    return {
      name: input.trim(),
      country: null,
      country_code: null,
      shipment_count: null,
      last_shipment_date: null,
    };
  }
  if (input && typeof input === "object") {
    const obj = input as Partial<Supplier>;
    return {
      name: typeof obj.name === "string" ? obj.name.trim() : "",
      country: typeof obj.country === "string" ? obj.country : null,
      country_code: typeof obj.country_code === "string" ? obj.country_code.toUpperCase() : null,
      shipment_count: typeof obj.shipment_count === "number" ? obj.shipment_count : null,
      last_shipment_date: typeof obj.last_shipment_date === "string" ? obj.last_shipment_date : null,
    };
  }
  return { name: "", country: null, country_code: null, shipment_count: null, last_shipment_date: null };
}
```

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/_shared/supplier-normalize.ts supabase/functions/_shared/supplier-normalize.test.ts frontend/src/lib/supplierNormalize.ts
git commit -m "feat(profile): supplier normalizer for legacy+new shapes

Helper that converts string | object inputs into a single Supplier
shape (name, country, country_code, shipment_count,
last_shipment_date). Consumed by SuppliersView (Task 5) and the
Top Supplier widget (Task 6).

5 Deno unit tests cover: string input, full object, partial object
defaults, whitespace-only string, object without name. Mirror lives
in frontend/src/lib/supplierNormalize.ts for the React tree."
```

---

## Task 5: SuppliersView rewrite (Component C)

**Files:**
- Modify: `frontend/src/components/company/CDPSupplyChain.tsx` (`SuppliersView` + `aggregateSuppliers` + summary preview at line 2632)

- [ ] **Step 1: Read the current SuppliersView + aggregateSuppliers**

```bash
grep -nE "function SuppliersView|function aggregateSuppliers|function SupplierRowInteractive" frontend/src/components/company/CDPSupplyChain.tsx | head -10
```

Note the line numbers. The audit identified `SuppliersView` (in `CDPSupplyChain.tsx`) as the main supplier-tab renderer, `aggregateSuppliers` as the data-prep helper, and `SupplierRowInteractive` (line ~2634 region) as the per-row component.

- [ ] **Step 2: Update aggregateSuppliers to normalize parsed_summary.top_suppliers via the new helper**

Add this import at the top of `CDPSupplyChain.tsx`:

```typescript
import { normalizeSupplier, type Supplier } from "@/lib/supplierNormalize";
```

Find `function aggregateSuppliers(...)`. Update its body to consume `profile.topSuppliers` (or `profile.top_suppliers`) through the normalizer FIRST, then enrich with BOL data only if the normalized supplier has null `shipment_count`:

```typescript
function aggregateSuppliers(
  profile: any,
  recentBols: any[],
  opts: { limit?: number } = {},
): Array<Supplier & { share: number; shipments: number }> {
  const limit = opts.limit ?? Infinity;

  // 1. Take canonical structured suppliers from the snapshot.
  const fromSnapshot = Array.isArray(profile?.topSuppliers ?? profile?.top_suppliers)
    ? (profile.topSuppliers ?? profile.top_suppliers).map(normalizeSupplier)
    : [];

  // 2. If snapshot has no count for a row, fall back to BOL frequency
  //    so the UI shows SOMETHING. Legacy snapshots (string[]) get
  //    name-only rows with count from BOL.
  const bolCountsByName = new Map<string, number>();
  for (const bol of recentBols ?? []) {
    const name = (bol?.shipper_name ?? bol?.supplier_name ?? bol?.raw?.shipper_name ?? "").toString().trim();
    if (!name) continue;
    bolCountsByName.set(name.toLowerCase(), (bolCountsByName.get(name.toLowerCase()) ?? 0) + 1);
  }

  // 3. Merge: snapshot rows are authoritative; BOL fallback only fills
  //    null counts. Compute share.
  const enriched = fromSnapshot.map((s) => {
    const count = s.shipment_count ?? bolCountsByName.get(s.name.toLowerCase()) ?? 0;
    return { ...s, shipments: count };
  });
  const total = enriched.reduce((sum, s) => sum + s.shipments, 0) || 1;
  return enriched
    .map((s) => ({ ...s, share: s.shipments / total }))
    .sort((a, b) => b.shipments - a.shipments)
    .slice(0, limit);
}
```

- [ ] **Step 3: Update the SupplierRowInteractive rendering for the new shape**

Find `SupplierRowInteractive` (and the row JSX around line 2593 region which currently does `{(s.country || "").slice(0, 2).toUpperCase() || "—"}`).

Replace the row body with:

```tsx
function SupplierRowInteractive({ supplier, hasStats }: { supplier: Supplier & { share: number; shipments: number }; hasStats: boolean }) {
  // Country flag emoji via existing helper (search the file for
  // getCountryFlag; if absent, use the inline regional indicator
  // codepoint trick).
  const flag = supplier.country_code && supplier.country_code.length === 2
    ? String.fromCodePoint(
        ...supplier.country_code.toUpperCase().split("").map((c) => 127397 + c.charCodeAt(0)),
      )
    : null;

  return (
    <button
      type="button"
      onClick={() => { /* existing drawer-open handler — preserve */ }}
      className="flex w-full items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-left transition hover:border-blue-300 hover:bg-slate-50"
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <span aria-hidden className="text-base leading-none">
          {flag ?? "🏢"}
        </span>
        <div className="min-w-0">
          <div className="font-display truncate text-sm font-semibold text-slate-900">
            {supplier.name || "—"}
          </div>
          <div className="font-body truncate text-[11px] text-slate-500">
            {supplier.country || "Country pending"}
            {supplier.last_shipment_date ? ` · last shipped ${humanizeDate(supplier.last_shipment_date)}` : null}
          </div>
        </div>
      </div>
      {hasStats && supplier.shipments > 0 ? (
        <div className="shrink-0 text-right">
          <div className="font-mono text-[13px] font-semibold text-slate-900">
            {supplier.shipments.toLocaleString()}
          </div>
          <div className="font-body text-[10px] text-slate-400">
            {(supplier.share * 100).toFixed(0)}% share
          </div>
        </div>
      ) : null}
    </button>
  );
}

function humanizeDate(iso: string): string {
  try {
    const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
    if (days <= 0) return "today";
    if (days === 1) return "yesterday";
    if (days < 7) return `${days}d ago`;
    if (days < 30) return `${Math.floor(days / 7)}w ago`;
    if (days < 365) return `${Math.floor(days / 30)}mo ago`;
    return `${Math.floor(days / 365)}y ago`;
  } catch {
    return iso.slice(0, 10);
  }
}
```

If the file already has a `humanizeDate` or similar helper imported, reuse it instead of redefining.

Preserve any existing drawer-open click handler — copy the existing `onClick` body into the new button's `onClick`.

- [ ] **Step 4: Update the summary widget preview (line ~2632) to render at most 6 with the new row component**

Find `{suppliers.slice(0, 6).map(...)}` at line ~2632. The slice cap stays; only the inner row uses the new component which now handles country + flag + count properly.

- [ ] **Step 5: Type-check**

```bash
cd frontend && npx tsc --noEmit 2>&1 | grep -E "CDPSupplyChain|supplierNormalize" | head -10
```

Expected: zero errors related to the changed file.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/company/CDPSupplyChain.tsx
git commit -m "feat(profile): SuppliersView reads structured suppliers + renders flag/count/date

aggregateSuppliers now normalizes parsed_summary.top_suppliers (both
legacy string[] and new object array) through normalizeSupplier(),
fills null shipment_count from BOL frequency as fallback, computes
share against the merged total.

SupplierRowInteractive renders:
- Country flag emoji (regional-indicator from country_code)
- Supplier name
- Country name + 'last shipped Nw ago' (humanized)
- Shipment count + share %

Legacy snapshots (string[]) get name-only rows with 'Country pending'
placeholder until next refresh re-parses them with the new shape."
```

---

## Task 6: Rename "Top Forwarder" → "Top Supplier" + link to Suppliers tab

**Files:**
- Modify: `frontend/src/components/company/CDPDetailsPanel.tsx` (`topForwarder` useMemo at lines 223-259, plus the label/JSX block that renders it)

- [ ] **Step 1: Locate the topForwarder useMemo + its render site**

```bash
grep -nE "topForwarder|Top Forwarder|topForwarders" frontend/src/components/company/CDPDetailsPanel.tsx | head -15
```

Note line numbers for: the useMemo (223-259), the render line (e.g. `<div>Top Forwarder</div>` or similar JSX), and any onClick handler.

- [ ] **Step 2: Add normalizer import**

At the top of `CDPDetailsPanel.tsx`:

```typescript
import { normalizeSupplier } from "@/lib/supplierNormalize";
```

- [ ] **Step 3: Replace the useMemo with a Top Supplier sourced from snapshot**

Replace lines 223-259:

```typescript
  // Top Supplier — sourced from parsed_summary.top_suppliers (the
  // structured shape introduced in importyeti_fetch v2). Renamed from
  // "Top Forwarder" because (a) parsed_summary.top_forwarders was
  // never populated, and (b) the BOL fallback that previously filled
  // the gap actually returned the supplier/shipper name. Labeling it
  // "Top Forwarder" was misleading. The widget now correctly shows
  // the highest-shipment supplier and links to the Suppliers tab.
  const topSupplier = useMemo(() => {
    const list = profile?.topSuppliers ?? profile?.top_suppliers;
    if (!Array.isArray(list) || list.length === 0) return null;
    const head = normalizeSupplier(list[0]);
    return head.name ? head : null;
  }, [profile?.topSuppliers, profile?.top_suppliers]);
```

- [ ] **Step 4: Update the render JSX**

Find the existing render block (search for `Top Forwarder` in the file). Replace the label with `Top Supplier`. If the existing block was a plain `<div>{topForwarder}</div>`, make it a clickable link that switches the active tab to `suppliers`:

```tsx
{topSupplier ? (
  <button
    type="button"
    onClick={() => setActiveTab?.("suppliers")}
    className="flex w-full items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-left transition hover:border-blue-300 hover:bg-slate-50"
  >
    <div className="min-w-0">
      <div className="font-display text-[10px] font-semibold uppercase tracking-wider text-slate-500">
        Top supplier
      </div>
      <div className="font-display mt-0.5 truncate text-sm font-semibold text-slate-900">
        {topSupplier.name}
      </div>
      {topSupplier.country ? (
        <div className="font-body truncate text-[11px] text-slate-500">{topSupplier.country}</div>
      ) : null}
    </div>
    <span aria-hidden className="text-slate-400">→</span>
  </button>
) : null}
```

If `setActiveTab` isn't already a prop on the component, look at how the existing tab switcher in `CompanyProfileV2.tsx` is wired. The parent likely passes `setActiveTab` or has a hash-router pattern (e.g. `navigate('?tab=suppliers')`). Use the same pattern.

- [ ] **Step 5: Drop the old `topForwarder` variable name entirely**

If anything else in the file still references `topForwarder` (search the file), rename to `topSupplier`. Delete the BOL-fallback code block from the useMemo (lines 233-258 in the original) — it's no longer needed since structured suppliers from the snapshot are authoritative.

- [ ] **Step 6: Type-check**

```bash
cd frontend && npx tsc --noEmit 2>&1 | grep -E "CDPDetailsPanel|topSupplier|topForwarder" | head -10
```

Expected: zero new errors.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/company/CDPDetailsPanel.tsx
git commit -m "feat(profile): rename Top Forwarder → Top Supplier; link to Suppliers tab

The widget previously labelled 'Top Forwarder' was actually showing
the top supplier via a BOL shipper_name fallback (parsed_summary
.top_forwarders was empty on every snapshot because the parser never
populated it; no replacement data source exists at the BOL level).

Renames to 'Top Supplier' and sources directly from
parsed_summary.top_suppliers (normalized via supplierNormalize).
Click navigates to the Suppliers tab on the same page. Drops the
BOL fallback path entirely."
```

---

## Task 7: Cap top trade lanes at 12 + "View all" link

**Files:**
- Modify: `frontend/src/components/company/CDPSupplyChain.tsx` (line 1797 — `rankedLanes.slice(0, 8)`)

- [ ] **Step 1: Confirm the line**

```bash
sed -n '1793,1802p' frontend/src/components/company/CDPSupplyChain.tsx
```

Confirms: `.slice(0, 8)` on line 1797. The globe at line 1686 stays at 8 (visual readability).

- [ ] **Step 2: Replace 8 with 12 + render a "View all" link below the list**

```typescript
  const rankedLanes = canonicalLanes
    .slice()
    .sort((a: any, b: any) => (Number(b?.shipments) || 0) - (Number(a?.shipments) || 0))
    .slice(0, 12);
```

Find the JSX that renders `rankedLanes` (search the file for `rankedLanes.map`). Below the list, add:

```tsx
{canonicalLanes.length > 12 ? (
  <button
    type="button"
    onClick={() => setActiveTab?.("trade-lanes")}
    className="font-body mt-2 inline-flex items-center gap-1 text-[12px] font-medium text-blue-600 hover:text-blue-700"
  >
    View all {canonicalLanes.length.toLocaleString()} lanes →
  </button>
) : null}
```

Same `setActiveTab` pattern as Task 6 — use whatever the existing component uses.

- [ ] **Step 3: Type-check + commit**

```bash
cd frontend && npx tsc --noEmit 2>&1 | grep -E "CDPSupplyChain" | head -5
git add frontend/src/components/company/CDPSupplyChain.tsx
git commit -m "feat(profile): top-lanes summary widget shows 12 + View all link

Cap raised from 8 to 12 lanes on the summary widget. 'View all N
lanes' link below switches to the Trade Lanes tab when the snapshot
has more than 12 routes. The full Trade Lanes tab renders every
route (no parser truncation since Task 3)."
```

---

## Task 8: Drayage tables migration

**Files:**
- Create: `supabase/migrations/20260604_lit_drayage_tables.sql`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/20260604_lit_drayage_tables.sql
-- Tables for per-BOL drayage estimates + cached OSRM distance lookups.
-- Specced in earlier work but never deployed. Without these, the
-- Revenue Opportunity tab on the company profile falls back to a
-- hardcoded $1,200 × FCL count default.

CREATE TABLE IF NOT EXISTS public.lit_drayage_estimates (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      text NOT NULL,
  bol_number      text,
  pod_unloc       text,
  dest_city       text,
  dest_state      text,
  miles           numeric,
  containers_eq   numeric,
  est_cost_usd    numeric,
  est_cost_low_usd  numeric,
  est_cost_high_usd numeric,
  computed_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, bol_number)
);
CREATE INDEX IF NOT EXISTS lit_drayage_estimates_company_idx
  ON public.lit_drayage_estimates (company_id, computed_at DESC);

CREATE TABLE IF NOT EXISTS public.lit_drayage_distance_cache (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pod_unloc       text NOT NULL,
  dest_city       text,
  dest_state      text,
  miles           numeric NOT NULL,
  source          text NOT NULL CHECK (source IN ('osrm','haversine')),
  computed_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (pod_unloc, dest_city, dest_state)
);

COMMENT ON TABLE public.lit_drayage_estimates IS
  'Per-BOL drayage cost from pulse-drayage-recompute. Frontend reads
   the rollup keyed by (company_id, pod_unloc, dest_city) to render
   Revenue Opportunity drayage panel.';

COMMENT ON TABLE public.lit_drayage_distance_cache IS
  'OSRM-derived port-to-destination distance, cached per route to
   avoid re-querying OSRM for the same port+dest pair across BOLs.';
```

- [ ] **Step 2: Apply via Supabase MCP**

`mcp__claude_ai_Supabase__apply_migration`:
- project_id: `jkmrfiaefxwgbvftohrb`
- name: `lit_drayage_tables`
- query: contents above

- [ ] **Step 3: Verify tables exist**

```sql
SELECT table_name, column_count
  FROM (
    SELECT table_name, count(*) AS column_count
      FROM information_schema.columns
     WHERE table_schema='public' AND table_name IN ('lit_drayage_estimates','lit_drayage_distance_cache')
     GROUP BY table_name
  ) t
 ORDER BY table_name;
```

Expected: 2 rows. `lit_drayage_estimates` has 11 columns; `lit_drayage_distance_cache` has 7 columns.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260604_lit_drayage_tables.sql
git commit -m "feat(profile): create lit_drayage_estimates + distance_cache tables

Tables specced in earlier work but never migrated. Required for
real drayage calc on the Revenue Opportunity tab — without them
the UI falls back to a hardcoded \$1,200 × FCL count default
regardless of company / destination.

pulse-drayage-recompute writes per-BOL rows into _estimates.
osrm_client writes per-route distance lookups into _distance_cache."
```

---

## Task 9: Drayage rollup hook for the frontend

**Files:**
- Create: `frontend/src/lib/api/drayageRollup.ts`

- [ ] **Step 1: Write the hook**

```typescript
// frontend/src/lib/api/drayageRollup.ts
// Fetches per-company drayage rollup from lit_drayage_estimates.
// Returns an array grouped by destination port + city for the
// Revenue Opportunity tab.

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export type DrayageRollupRow = {
  pod_unloc: string | null;
  dest_city: string | null;
  dest_state: string | null;
  miles: number | null;
  containers_eq: number | null;
  est_cost_usd: number | null;
  est_cost_low_usd: number | null;
  est_cost_high_usd: number | null;
  bol_count: number;
};

export function useDrayageRollup(companyId: string | null | undefined): {
  rollup: DrayageRollupRow[] | null;
  loading: boolean;
  error: string | null;
} {
  const [rollup, setRollup] = useState<DrayageRollupRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!companyId) {
      setRollup(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      const { data, error: e } = await supabase
        .from("lit_drayage_estimates")
        .select("pod_unloc, dest_city, dest_state, miles, containers_eq, est_cost_usd, est_cost_low_usd, est_cost_high_usd")
        .eq("company_id", companyId)
        .order("computed_at", { ascending: false })
        .limit(500);

      if (cancelled) return;
      if (e) {
        setError(e.message);
        setRollup(null);
      } else {
        // Group by (pod_unloc, dest_city, dest_state), aggregate costs.
        const groups = new Map<string, DrayageRollupRow>();
        for (const row of (data ?? [])) {
          const key = `${row.pod_unloc ?? ""}|${row.dest_city ?? ""}|${row.dest_state ?? ""}`;
          const existing = groups.get(key);
          if (!existing) {
            groups.set(key, {
              pod_unloc: row.pod_unloc,
              dest_city: row.dest_city,
              dest_state: row.dest_state,
              miles: row.miles,
              containers_eq: row.containers_eq ?? 0,
              est_cost_usd: row.est_cost_usd ?? 0,
              est_cost_low_usd: row.est_cost_low_usd ?? 0,
              est_cost_high_usd: row.est_cost_high_usd ?? 0,
              bol_count: 1,
            });
          } else {
            existing.containers_eq = (existing.containers_eq ?? 0) + (row.containers_eq ?? 0);
            existing.est_cost_usd = (existing.est_cost_usd ?? 0) + (row.est_cost_usd ?? 0);
            existing.est_cost_low_usd = (existing.est_cost_low_usd ?? 0) + (row.est_cost_low_usd ?? 0);
            existing.est_cost_high_usd = (existing.est_cost_high_usd ?? 0) + (row.est_cost_high_usd ?? 0);
            existing.bol_count += 1;
          }
        }
        const arr = Array.from(groups.values()).sort((a, b) => (b.est_cost_usd ?? 0) - (a.est_cost_usd ?? 0));
        setRollup(arr);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [companyId]);

  return { rollup, loading, error };
}
```

- [ ] **Step 2: Type-check + commit**

```bash
cd frontend && npx tsc --noEmit 2>&1 | grep -E "drayageRollup" | head -5
git add frontend/src/lib/api/drayageRollup.ts
git commit -m "feat(profile): useDrayageRollup hook for Revenue Opportunity tab

Fetches per-BOL drayage estimates from lit_drayage_estimates,
groups by (pod_unloc, dest_city, dest_state), aggregates cost +
container counts per route. Returns null when company has no rows
yet (CDPRevenueOpportunity renders 'not calculated' state)."
```

---

## Task 10: Wire CDPRevenueOpportunity + drop $1,200 fallback

**Files:**
- Modify: `frontend/src/components/company/CDPRevenueOpportunity.tsx` (parent uses the new hook)
- Modify: `frontend/src/lib/revenueOpportunity.ts` (drop the $1,200 fallback at line 282 + line 178)

- [ ] **Step 1: Drop the $1,200 fallback in revenueOpportunity.ts**

Open `frontend/src/lib/revenueOpportunity.ts`. Find both fallback sites (around lines 178 and 282).

Line ~178 (`const perShipment = 1200;`) — replace with:

```typescript
// Drayage fallback removed. When inputs.drayageRollup is empty the
// UI renders a 'not calculated' state with a 'Compute now' button
// instead of fabricating a flat per-shipment number that doesn't
// reflect reality.
const perShipment = null as number | null;
```

Line ~282 (`const DRAYAGE_PER_FCL_USD = 1200;` + the multiplication block) — replace with:

```typescript
// Drayage fallback removed — see note above.
const drayageSubtotal = null as number | null;
```

Adjust the rest of `sizeDrayage` to return a sentinel shape when `drayageSubtotal === null`:

```typescript
function sizeDrayage(inputs: SizeDrayageInputs): SizeDrayageOutput {
  if (!inputs.drayageRollup || inputs.drayageRollup.length === 0) {
    return {
      status: "not_calculated",
      reason: "No drayage estimates computed yet for this company. Click 'Compute now' to build the rollup from BOL data.",
      total_usd: null,
      breakdown: [],
    };
  }
  // ... existing real-rollup path stays unchanged ...
}
```

The exact return shape needs to mesh with the existing component. If `sizeDrayage`'s return type didn't have a `status` field, add it as a new union variant `{ status: "ok"; total_usd: number; breakdown: ... } | { status: "not_calculated"; reason: string; total_usd: null; breakdown: [] }`. Component will pattern-match on `status`.

- [ ] **Step 2: Wire `CDPRevenueOpportunity` parent to pass `drayageRollup`**

Open `frontend/src/components/company/CDPRevenueOpportunity.tsx`. Find where the component is instantiated by its parent (likely `CompanyProfileV2.tsx` or a section component in the profile-page tree).

In the parent file, add:

```tsx
import { useDrayageRollup } from "@/lib/api/drayageRollup";

// Inside the component body:
const { rollup: drayageRollup } = useDrayageRollup(companyId);

// Pass through to the existing usage:
<CDPRevenueOpportunity
  /* ...existing props... */
  drayageRollup={drayageRollup ?? []}
/>
```

Find the exact parent via `grep -n "CDPRevenueOpportunity" frontend/src/`.

- [ ] **Step 3: Update CDPRevenueOpportunity to render the 'not_calculated' state**

In `CDPRevenueOpportunity.tsx`, find the drayage rendering block (search for `sizeDrayage` or `Drayage`). Update to:

```tsx
{drayage.status === "not_calculated" ? (
  <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
    <div className="font-display text-sm font-semibold text-amber-900">
      Drayage cost — not yet calculated
    </div>
    <p className="font-body mt-1 text-xs text-amber-800">{drayage.reason}</p>
    <button
      type="button"
      onClick={handleComputeDrayageNow}
      disabled={computing}
      className="mt-3 inline-flex h-8 items-center rounded-lg bg-blue-600 px-3 text-[12px] font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-60"
    >
      {computing ? "Computing…" : "Compute now"}
    </button>
  </div>
) : (
  /* existing real-rollup rendering */
)}
```

`handleComputeDrayageNow` invokes the `pulse-drayage-recompute` edge function for this company:

```tsx
async function handleComputeDrayageNow() {
  setComputing(true);
  try {
    const { error } = await supabase.functions.invoke("pulse-drayage-recompute", {
      body: { company_id: companyId },
    });
    if (error) throw error;
    // Re-fetch the rollup after compute.
    window.location.reload();
  } catch (e) {
    console.error("[drayage] compute failed:", e);
    alert("Drayage compute failed. Try again or contact support.");
  } finally {
    setComputing(false);
  }
}
```

- [ ] **Step 4: Type-check + commit**

```bash
cd frontend && npx tsc --noEmit 2>&1 | grep -E "CDPRevenueOpportunity|revenueOpportunity" | head -10
git add frontend/src/lib/revenueOpportunity.ts frontend/src/components/company/CDPRevenueOpportunity.tsx frontend/src/pages/CompanyProfileV2.tsx
git commit -m "feat(profile): real drayage rollup wiring; drop \$1,200 fallback

revenueOpportunity.ts: sizeDrayage now returns
  { status: 'not_calculated', total_usd: null, ... }
when drayageRollup is empty, replacing the misleading
\$1,200 × FCL count default that displayed for every company
without actual rollup data.

CDPRevenueOpportunity parent fetches the rollup via the new
useDrayageRollup hook and passes it down. When status is
'not_calculated', UI shows an amber banner with a 'Compute now'
button that invokes pulse-drayage-recompute for this company."
```

---

## Task 11: One-time drayage backfill for saved companies

**Files:**
- None modified — script run only (one-shot, not checked in)

- [ ] **Step 1: Verify pulse-drayage-recompute is deployed**

Use `mcp__claude_ai_Supabase__get_edge_function`:
- project_id: `jkmrfiaefxwgbvftohrb`
- function_slug: `pulse-drayage-recompute`

Expected: status ACTIVE. If MISSING, deploy it first (the source is at `supabase/functions/pulse-drayage-recompute/index.ts` already in the repo).

- [ ] **Step 2: Identify saved companies that need backfill**

```sql
SELECT DISTINCT sc.source_company_key
  FROM lit_saved_companies sc
 WHERE sc.refresh_status = 'active'
   AND sc.source_company_key IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM lit_drayage_estimates de WHERE de.company_id = sc.source_company_key
   )
 ORDER BY sc.source_company_key;
```

Expected: a list of N company slugs that have zero drayage estimates. N should be ~279 minus however many were computed during testing.

- [ ] **Step 3: Trigger backfill in batches of 10**

For each slug from Step 2, invoke `pulse-drayage-recompute`:

```bash
# Bash loop — chunk the list to 10 at a time to avoid hammering OSRM
SLUGS=("slug1" "slug2" "...")  # paste from Step 2
for slug in "${SLUGS[@]}"; do
  curl -s -X POST "https://jkmrfiaefxwgbvftohrb.supabase.co/functions/v1/pulse-drayage-recompute" \
    -H "Authorization: Bearer <service-role-key>" \
    -H "Content-Type: application/json" \
    -d "{\"company_id\":\"$slug\"}" | jq -r .
  sleep 2  # OSRM is free but be a good citizen
done
```

If the operator doesn't have the service role key easily accessible, alternative: write a one-shot Supabase MCP SQL block that calls `net.http_post` for each slug.

- [ ] **Step 4: Verify backfill landed**

```sql
SELECT count(DISTINCT company_id) AS companies_with_estimates,
       count(*) AS total_estimate_rows
  FROM lit_drayage_estimates;
```

Expected: `companies_with_estimates` ≥ 250 (out of 279 saved). Some companies may have zero BOLs in `lit_unified_shipments` — that's OK, they'll show "Compute now" indefinitely until BOLs arrive.

- [ ] **Step 5: Commit (empty, just records the backfill milestone)**

```bash
git commit --allow-empty -m "chore(profile): drayage backfill complete for saved companies

Triggered pulse-drayage-recompute for all active saves with no
pre-existing rollup. Verified lit_drayage_estimates contains rows
for ≥250 of the 279 saved companies. Companies without BOLs in
lit_unified_shipments remain in 'not_calculated' state until BOLs
arrive."
```

---

## Task 12: One-time firmographics backfill (Component F)

**Files:**
- None modified — script run only

- [ ] **Step 1: Identify saved companies missing firmographics**

```sql
SELECT lc.id, lc.name, lc.domain
  FROM lit_companies lc
  INNER JOIN lit_saved_companies sc ON sc.company_id = lc.id OR sc.source_company_key = lc.canonical_company_key
 WHERE sc.refresh_status = 'active'
   AND (lc.headcount IS NULL OR lc.annual_revenue IS NULL OR lc.founded_year IS NULL)
 ORDER BY lc.name;
```

(The exact column names — `headcount` / `annual_revenue` / `founded_year` — may differ. Use `\d lit_companies` first to confirm; adapt the WHERE clause.)

- [ ] **Step 2: Verify normalize-company edge fn exists**

Use `mcp__claude_ai_Supabase__get_edge_function` with `function_slug=normalize-company`. Expected: ACTIVE.

- [ ] **Step 3: Trigger backfill via normalize-company per company**

```bash
# For each id from Step 1, POST to normalize-company
for company_id in $(...); do
  curl -s -X POST "https://jkmrfiaefxwgbvftohrb.supabase.co/functions/v1/normalize-company" \
    -H "Authorization: Bearer <service-role-key>" \
    -H "Content-Type: application/json" \
    -d "{\"company_id\":\"$company_id\",\"refresh\":true}" | jq -r .
  sleep 1
done
```

- [ ] **Step 4: Verify backfill landed**

```sql
SELECT
  count(*) FILTER (WHERE lc.headcount IS NOT NULL) AS with_headcount,
  count(*) FILTER (WHERE lc.annual_revenue IS NOT NULL) AS with_revenue,
  count(*) FILTER (WHERE lc.founded_year IS NOT NULL) AS with_founded,
  count(*) AS total
  FROM lit_companies lc
  INNER JOIN lit_saved_companies sc ON sc.company_id = lc.id
 WHERE sc.refresh_status = 'active';
```

Expected: each `with_*` count should be > 50% of `total`. Apollo doesn't have firmographics for every company; some will remain null and that's expected.

- [ ] **Step 5: Commit milestone**

```bash
git commit --allow-empty -m "chore(profile): firmographics backfill via normalize-company complete

One-time Apollo-backed firmographics backfill for the 279 saved
companies. Going forward, save-company edge fn auto-invokes
normalize-company on every new save."
```

---

## Task 13: Surface structured manual-refresh errors (Component G)

**Files:**
- Modify: `frontend/src/lib/api.ts` (`getIyCompanyProfile`, lines 2845-2960)
- Modify: `frontend/src/components/company/CDPDetailsPanel.tsx` (catch + render)

- [ ] **Step 1: Find the error-throw branch in getIyCompanyProfile**

```bash
sed -n '2930,2950p' frontend/src/lib/api.ts
```

Confirms line 2938 throws `getIyCompanyProfile failed: ...`.

- [ ] **Step 2: Update getIyCompanyProfile to surface structured codes**

Find the error block (around line 2920-2945). Replace with:

```typescript
if (error) {
  // supabase-js wraps non-2xx in FunctionsHttpError. Pull the
  // structured body so callers can route LIMIT_EXCEEDED to the
  // upgrade modal and 5xx to a retry toast — not a generic
  // 'non-2xx' string.
  let parsedBody: any = null;
  try {
    const ctx = (error as any)?.context;
    const cloned = ctx?.clone?.();
    parsedBody = await cloned?.json?.();
  } catch { /* non-JSON body */ }

  if (parsedBody?.code === "LIMIT_EXCEEDED") {
    const err: any = new Error(
      parsedBody.message || "Monthly profile refresh limit reached. Upgrade to refresh more frequently.",
    );
    err.code = "LIMIT_EXCEEDED";
    err.limit = parsedBody;
    throw err;
  }

  const status = (error as any)?.context?.status ?? 0;
  if (status >= 500) {
    const err: any = new Error(
      "Refresh temporarily unavailable. Try again in a few minutes.",
    );
    err.code = "TEMPORARY";
    throw err;
  }

  const bodyMsg = parsedBody?.message || (error as any).message || "";
  throw new Error(
    `getIyCompanyProfile failed: ${bodyMsg || "Unknown error"}`,
  );
}
```

- [ ] **Step 3: Update the refresh-button catch in CDPDetailsPanel**

Open `frontend/src/components/company/CDPDetailsPanel.tsx`. Find the refresh button's `onClick` handler (search for `onRefresh` or `handleRefresh`). Update its catch block to render the typed error:

```typescript
try {
  await onRefresh();
} catch (e: any) {
  if (e?.code === "LIMIT_EXCEEDED") {
    setLimitError(e.limit);  // local state to render <UpgradeRequiredInline limit={limitError} />
  } else if (e?.code === "TEMPORARY") {
    showToast({ tone: "warning", title: "Refresh unavailable", body: e.message });
  } else {
    showToast({ tone: "error", title: "Refresh failed", body: e?.message ?? "Unknown error" });
  }
}
```

Add the `<UpgradeRequiredInline>` render below the refresh button when `limitError` is set:

```tsx
{limitError ? <UpgradeRequiredInline limit={limitError} /> : null}
```

Import: `import { UpgradeRequiredInline } from "@/components/common/UpgradeRequired";`

If the file already uses a different toast pattern (e.g. `window.dispatchEvent("lit:toast", ...)`), use that instead of `showToast`.

- [ ] **Step 4: Type-check + commit**

```bash
cd frontend && npx tsc --noEmit 2>&1 | grep -E "api\.ts|CDPDetailsPanel" | head -10
git add frontend/src/lib/api.ts frontend/src/components/company/CDPDetailsPanel.tsx
git commit -m "feat(profile): surface structured errors from manual refresh

getIyCompanyProfile parses the structured body from
FunctionsHttpError.context and rethrows with:
- LIMIT_EXCEEDED → typed error carrying the limit payload
- TEMPORARY (5xx) → friendly retry message
- Generic → original 'getIyCompanyProfile failed: <body msg>'

CDPDetailsPanel refresh button catches the typed error and renders
UpgradeRequiredInline for LIMIT_EXCEEDED (same pattern as Pulse) or
a retry toast for 5xx. The bare 'non-2xx' string the user saw is
gone."
```

---

## Task 14: Standardize the total-shipments denominator to 12-month rolling

**Files:**
- Modify: `frontend/src/components/company/CDPDetailsPanel.tsx` (or wherever the "Total shipments" tile is rendered)
- Modify: `frontend/src/components/company/CDPSupplyChain.tsx` if it shows the lifetime number too

- [ ] **Step 1: Find every place that reads lifetime total_shipments**

```bash
grep -rnE "parsed_summary.*total_shipments|profile.*total_shipments|ps_total" frontend/src/components/company/ frontend/src/pages/CompanyProfileV2.tsx 2>/dev/null | head -20
```

For each hit, distinguish: does it read `parsed_summary.total_shipments` (lifetime) or `lit_company_index.total_shipments` (12-month)?

- [ ] **Step 2: Replace lifetime reads with the 12-month equivalent**

For each lifetime read identified in Step 1, replace with the 12-month rolling number. The data flow is:
- 12-month value lives on `lit_company_index.total_shipments` and is also exposed via the profile fetch as `profile.route_kpis.shipmentsLast12m` (from `importyeti_fetch.ts:routeKpis`).

In the UI, prefer `profile?.route_kpis?.shipmentsLast12m ?? profile?.shipments_last_12m` over `profile?.parsed_summary?.total_shipments`.

Update the label next to the number from "Total shipments" → "**Shipments — last 12 months**".

- [ ] **Step 3: Type-check + commit**

```bash
cd frontend && npx tsc --noEmit 2>&1 | grep -E "CDPDetailsPanel|CDPSupplyChain" | head -5
git add frontend/src/components/company/CDPDetailsPanel.tsx frontend/src/components/company/CDPSupplyChain.tsx
git commit -m "feat(profile): standardize 'total shipments' to 12-month rolling

Previously, two surfaces showed different denominators for the same
company: lit_company_index.total_shipments (12mo) on the search
result card vs parsed_summary.total_shipments (lifetime) on the
profile page. Same company, two numbers, looked like a bug to users.

All profile-page readers now use the 12-month rolling number
(profile.route_kpis.shipmentsLast12m) with the explicit label
'Shipments — last 12 months'."
```

---

## Task 15: Update most_recent_shipment_date to track actual data, not writer run

**Files:**
- Modify: `supabase/functions/_shared/importyeti_fetch.ts` (where `lit_companies.most_recent_shipment_date` is updated)

- [ ] **Step 1: Find the update site**

```bash
grep -nE "most_recent_shipment_date|updated_at.*now\(\)|lit_companies.*update" supabase/functions/_shared/importyeti_fetch.ts 2>/dev/null | head -10
```

- [ ] **Step 2: Only write most_recent_shipment_date when it actually changed**

In the upsert block, change the update to only set `most_recent_shipment_date` when the new value differs from the existing snapshot's. Approach: read prev, compare, only patch if `lastShipmentDate !== prev?.last_shipment_date`.

```typescript
// Only patch most_recent_shipment_date when the snapshot's actual
// last shipment date moved forward. Touching it every tick made the
// profile UI display 'Updated today' next to month-old shipment data
// (the writer's updated_at moved; the data didn't).
const prevLast = previousParsedSummary?.last_shipment_date ?? null;
const shouldPatchDate = lastShipmentDate && lastShipmentDate !== prevLast;
if (shouldPatchDate) {
  await supabase.from("lit_companies").update({
    most_recent_shipment_date: lastShipmentDate,
  }).eq("id", companyRow.id);
}
```

- [ ] **Step 3: Re-deploy via Supabase MCP** (same edge functions as Task 3 Step 6: pulse-refresh-tick + importyeti-proxy)

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/_shared/importyeti_fetch.ts
git commit -m "fix(profile): only patch most_recent_shipment_date when data actually changed

Previously the upsert touched lit_companies.most_recent_shipment_date
every refresh tick regardless of whether the underlying last shipment
date moved. UI displayed 'Updated today' next to April shipment data
because the writer's updated_at moved while the data didn't.

Now only patches when the new last_shipment_date differs from the
previous snapshot's. Other lit_companies fields keep their existing
behavior."
```

---

## Task 16: End-to-end manual acceptance test

**Files:** None modified — pure manual validation.

- [ ] **Step 1: Verify cron picked up EAE + LG**

After the daily cron tick (or after the manual trigger from Task 2 Step 8):

```sql
SELECT company_id, updated_at
  FROM lit_importyeti_company_snapshot
 WHERE company_id IN ('eae-usa', 'lg-electronics-u-s-a')
 ORDER BY updated_at DESC;
```

Expected: both rows have `updated_at` within the last 24h (not the stuck `2026-05-07`).

- [ ] **Step 2: Open EAE profile in browser → check Top Trade Lanes**

Navigate to EAE's profile. Verify:
- Summary tab "Top Trade Lanes" shows up to 12 rows
- If snapshot has >12 routes, "View all N lanes →" link appears below
- Click the link → switches to Trade Lanes tab → shows every route

- [ ] **Step 3: Suppliers tab**

Click Suppliers tab. Verify each row shows:
- Country flag emoji (or 🏢 fallback for missing country_code)
- Supplier name
- Country name OR "Country pending" (if legacy snapshot)
- Last shipment date (humanized) when available
- Shipment count + share % when available

- [ ] **Step 4: Top Supplier widget on Summary tab**

Verify:
- Label reads "Top supplier" (not "Top forwarder")
- Click navigates to Suppliers tab on the same page
- Name + country shown

- [ ] **Step 5: Revenue Opportunity tab — drayage**

If drayage backfill (Task 11) ran for this company:
- Drayage section shows a real per-route cost breakdown (not $1,200)
If no rollup yet:
- Amber "Drayage cost — not yet calculated" banner with "Compute now" button
- Click "Compute now" → loading state → reload → drayage breakdown appears

- [ ] **Step 6: Firmographics widget**

After Task 12 backfill, verify Headcount / Revenue / Founded / Top mode show real values for at least 5 random saved companies.

- [ ] **Step 7: Manual refresh button**

Click "Refresh enrichment" on EAE's profile:
- If user has quota → snapshot refreshes within 30s; "Updated today" appears next to actual current data (not month-old)
- If quota hit → `UpgradeRequiredInline` banner appears (not generic "non-2xx" toast)

- [ ] **Step 8: Total shipments label**

Verify the "Shipments" tile reads "Shipments — last 12 months" and the number matches what Pulse shows for the same company.

- [ ] **Step 9: Cron health check after 24h**

```sql
SELECT count(*) AS refreshed_in_last_24h
  FROM lit_importyeti_company_snapshot s
  INNER JOIN lit_saved_companies sc ON sc.source_company_key = s.company_id
 WHERE s.updated_at > now() - interval '24 hours' AND sc.refresh_status = 'active';
```

Expected: ≥ 40 (matches BATCH_SIZE per daily tick).

- [ ] **Step 10: Document any gaps**

If anything fails Step 1-9, file a follow-up issue with the exact symptom + the relevant SQL row state. If all pass:

```bash
git commit --allow-empty -m "chore(profile): data accuracy overhaul — acceptance complete

All 8 acceptance criteria from the spec verified end-to-end:
1. EAE + LG snapshots refreshed within 24h via daily cron
2. Top Trade Lanes summary shows 12 + View all link to full tab
3. Suppliers tab renders flag + country + count + last-date
4. Real drayage cost shown (no \$1,200 flat default)
5. Firmographics populated on saved companies
6. Top Supplier widget (renamed from Top Forwarder) links to tab
7. Manual refresh surfaces typed errors (LIMIT_EXCEEDED inline)
8. 'Shipments — last 12 months' label across all surfaces"
```

---

## Out of scope (Phase 2+)

- Expanding `lit_unified_shipments` beyond the 50-BOL cap (architectural change)
- Recurring weekly cron for firmographics or drayage (drayage refreshes when snapshot does; firmographics is one-time backfill per operator direction)
- Per-org refresh-quota override (use existing `company_profile_view` quota)
- Container-yard inland port coordinates for drayage (current port table is the 10 major US coastal ports — Memphis, Dallas inland CYs handled by state centroids)
- Real-time push from ImportYeti (no IY webhook product exists)
