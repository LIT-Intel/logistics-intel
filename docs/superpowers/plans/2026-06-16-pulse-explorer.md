# Pulse Explorer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Pulse Explorer — a V6-style map-first sales intel surface — as a sibling tab to the existing Pulse Search page, fused with the existing NL search, gated behind a `pulse_explorer_v1` feature flag.

**Architecture:** Two sibling tabs at `/app/pulse` (`Search` preserved unchanged, `Explore` new). Explore tab uses Leaflet + SuperCluster for a bubble/cluster map, a `pulse-explore` edge fn that unions `lit_company_directory` (V6 seed) with live `lit_companies` (dedup), pre-computed opportunity scores via a nightly pg_cron job, and tiered freshness badges with ImportYeti on-demand refresh gated by a per-user daily quota. V1.5 items (Lane fit / SoW / Displacement / config UI / heat tabs / PNG export / dataset override) are out of scope.

**Tech Stack:** React 18 + Vite + react-leaflet 4.2.1 / leaflet 1.9.4 / supercluster (NEW dep), TanStack Query 5.87.4 (existing), Tailwind, Supabase Postgres + Edge Functions (Deno), pg_cron, ImportYeti API (via existing `importyeti-proxy`).

**Source spec:** [docs/superpowers/specs/2026-06-16-pulse-explorer-design.md](../specs/2026-06-16-pulse-explorer-design.md)

**Branch strategy:** This is a new workstream, NOT plan-limits. The `claude/review-dashboard-deploy-3AmMD` branch lock from CLAUDE.md does NOT apply. Cut a fresh branch off `main`:

```bash
git checkout main
git pull origin main
git checkout -b claude/pulse-explorer-v1
```

---

## File structure

### New files

```
scripts/
  ingest-v6-csv.ts                         # Phase 0: admin-only V6 CSV ingest

supabase/migrations/
  2026MMDDHHMMSS_pulse_explorer_schema.sql # Phase 1: V6 + opportunity columns,
                                           #   new tables (map_selections, quota)
  2026MMDDHHMMSS_pulse_explorer_cron.sql   # Phase 1: nightly opportunity recompute

supabase/functions/
  pulse-explore/index.ts                   # Phase 1: merged query, scoring, freshness
  pulse-map-selection-save/index.ts        # Phase 1: persist a saved map view
  pulse-map-selections-list/index.ts       # Phase 1: list user's saved views
  _shared/opportunity_scoring.ts           # Phase 1: 4 score formulas
  _shared/opportunity_scoring.test.ts      # Phase 1: unit tests
  _shared/canonical_name.ts                # Phase 1: name normalization
  _shared/canonical_name.test.ts           # Phase 1: unit tests
  _shared/region_presets.ts                # Phase 1: region → states mapping (shared FE/BE)

frontend/src/features/pulse/explore/
  PulseTabs.jsx                            # Phase 2: Search | Explore tab switcher
  PulseExploreTab.jsx                      # Phase 2: Explore tab shell
  ExploreToolbar.jsx                       # Phase 2: NL bar + chips + toggles
  FilterChipRow.jsx                        # Phase 2: filter chip row
  ColorModeToggle.jsx                      # Phase 2: industry/opportunity/workflow/state
  SizeModeToggle.jsx                       # Phase 2: TEU/Shipments/Spend/Opportunity
  SelectionBar.jsx                         # Phase 2: bulk action bar
  ExploreMap.jsx                           # Phase 2: Leaflet bubble + cluster
  TopInsightsRail.jsx                      # Phase 2: left rail, Overview tab v1
  ExploreAccountTable.jsx                  # Phase 2: virtualized table
  useExploreState.js                       # Phase 2: URL-synced state hook
  useExploreAccounts.js                    # Phase 2: TanStack Query hook → pulse-explore
  useExploreInsights.js                    # Phase 2: TanStack Query hook → insights
  useImportYetiRefresh.js                  # Phase 2: per-row refresh hook
  bubblePalettes.js                        # Phase 2: color palettes per mode
  coordLookup.js                           # Phase 2: city → metro → state → country fallback
  regionPresets.js                         # Phase 2: region → states (mirrors backend)
  exportCsv.js                             # Phase 3: CSV export utility
  BulkRefreshModal.jsx                     # Phase 3: bulk refresh with credit preview
  HeatOverlayToggle.jsx                    # Phase 3: heat overlay toggle

frontend/src/api/
  pulse-explore.js                         # Phase 2: client for pulse-explore edge fn
  pulse-map-selections.js                  # Phase 2: client for selection-save/list
```

### Modified files

```
supabase/functions/importyeti-proxy/index.ts     # Phase 1: add quota check + cache gate
supabase/functions/pulse-search/index.ts         # Phase 3: extend parser taxonomy
supabase/functions/get-entitlements/index.ts     # Phase 4: include pulse_explorer_v1 flag
frontend/src/pages/Pulse.jsx                     # Phase 2: wrap in PulseTabs
frontend/src/features/pulse/PulseQuickCard.jsx   # Phase 2: freshness chip + opportunity chips
frontend/src/api/pulse-search.js                 # Phase 3: extend parsed schema
frontend/src/hooks/useEntitlements.ts            # Phase 4: expose pulse_explorer_v1
```

---

## Conventions used throughout this plan

- **Migration timestamps:** use `date -u +%Y%m%d%H%M%S` to generate. When the plan shows `2026MMDDHHMMSS`, replace at run-time.
- **Commits:** every task ends with a commit. Conventional Commits style: `feat(pulse-explore): ...`, `chore(migrations): ...`, etc.
- **Tests:** Deno tests for edge fns + `_shared`. Vitest for frontend.
- **Edge fn auth:** use existing `_shared/auth.ts` `requireUser` for user-authenticated functions.
- **Edge fn logging:** use existing `_shared/logger.ts` `createLogger("<fn-name>")`.
- **Local edge fn run:** `cd supabase && supabase functions serve <fn-name> --env-file .env.local`.
- **Local test run (edge fn):** `cd supabase/functions && deno test --allow-env --allow-net _shared/<file>.test.ts`.
- **Local test run (frontend):** `cd frontend && npm run test -- <pattern>`.
- **Run frontend dev server:** `cd frontend && npm run dev`.

---

# Phase 0 — V6 CSV ingest (admin-only)

Goal: stand up the V6 dataset inside `lit_company_directory` so the rest of the plan has data to work against. **Run once by a developer; never exposed in UI.**

The V6 CSV is at the path the user provided. The script normalizes columns, dedups against existing directory rows, upserts. Re-runnable (idempotent).

---

### Task 1: Add V6 columns to `lit_company_directory`

**Files:**
- Create: `supabase/migrations/2026MMDDHHMMSS_pulse_explorer_v6_columns.sql`

This migration runs first because Task 2's ingest script writes to these columns.

- [ ] **Step 1: Create the migration file**

```sql
-- 2026MMDDHHMMSS_pulse_explorer_v6_columns.sql
-- Adds V6 (DSV Sales Explorer V6 / Revenue Vessel) seed columns to lit_company_directory.

alter table lit_company_directory
  add column if not exists vertical text,
  add column if not exists top_dimensions jsonb,
  add column if not exists gp_potential numeric;

comment on column lit_company_directory.vertical is 'V6 vertical taxonomy (broader than industry, e.g. "Food & Bev", "Industrial").';
comment on column lit_company_directory.top_dimensions is 'V6 lanes: jsonb array of { origin_country, dest_country, teu, share }.';
comment on column lit_company_directory.gp_potential is 'V6 gross-profit potential estimate in USD.';

-- Index for vertical filtering (chip / NL search).
create index if not exists lit_company_directory_vertical_idx
  on lit_company_directory (vertical)
  where vertical is not null;
```

- [ ] **Step 2: Apply migration to a Supabase preview branch**

Use the MCP Supabase tool or:

```bash
supabase db push --linked --branch <preview-branch-name>
```

Expected: migration applies cleanly, three columns exist on `lit_company_directory`.

- [ ] **Step 3: Verify column shape**

```sql
select column_name, data_type
from information_schema.columns
where table_name = 'lit_company_directory'
  and column_name in ('vertical', 'top_dimensions', 'gp_potential');
```

Expected: 3 rows, `text`, `jsonb`, `numeric`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/2026MMDDHHMMSS_pulse_explorer_v6_columns.sql
git commit -m "chore(migrations): add V6 columns to lit_company_directory"
```

---

### Task 2: Build the V6 CSV ingest script

**Files:**
- Create: `scripts/ingest-v6-csv.ts`
- Create: `scripts/ingest-v6-csv.test.ts`

The script reads the V6 CSV, normalizes columns, computes `canonical_name` + `canonical_domain`, upserts into `lit_company_directory`. Idempotent: re-running produces the same row count.

- [ ] **Step 1: Write the failing test for column mapping + normalization**

```ts
// scripts/ingest-v6-csv.test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { normalizeV6Row } from "./ingest-v6-csv.ts";

Deno.test("normalizeV6Row maps V6 columns to directory schema", () => {
  const input = {
    Account: "Acme Foods, Inc.",
    Location: "Atlanta, GA, USA",
    Industry: "Food Manufacturing",
    "TEU Vol.": "1,234",
    "Annual Sales": "$45,000,000",
    Vertical: "Food & Bev",
    "Top Dimensions": '[{"origin":"CN","dest":"US","teu":800}]',
    "GP Potential": "120000",
  };
  const out = normalizeV6Row(input);
  assertEquals(out.company_name, "Acme Foods, Inc.");
  assertEquals(out.canonical_name, "acme foods");
  assertEquals(out.city, "Atlanta");
  assertEquals(out.state, "GA");
  assertEquals(out.country, "USA");
  assertEquals(out.industry, "Food Manufacturing");
  assertEquals(out.teu, 1234);
  assertEquals(out.revenue, "45000000");
  assertEquals(out.vertical, "Food & Bev");
  assertEquals(out.top_dimensions, [{ origin: "CN", dest: "US", teu: 800 }]);
  assertEquals(out.gp_potential, 120000);
});

Deno.test("normalizeV6Row handles missing optional fields", () => {
  const out = normalizeV6Row({ Account: "Solo Inc.", Location: "Houston, TX, USA" });
  assertEquals(out.company_name, "Solo Inc.");
  assertEquals(out.vertical, null);
  assertEquals(out.top_dimensions, null);
  assertEquals(out.gp_potential, null);
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd scripts && deno test --allow-env ingest-v6-csv.test.ts
```

Expected: FAIL — `normalizeV6Row` not defined.

- [ ] **Step 3: Implement the script (minimal — just `normalizeV6Row`)**

```ts
// scripts/ingest-v6-csv.ts
// Admin-only one-shot V6 CSV ingest into lit_company_directory.
//
// Usage:
//   deno run --allow-read --allow-env --allow-net \
//     scripts/ingest-v6-csv.ts --csv ./path/to/v6.csv --dry-run
//
// Without --dry-run the script upserts rows. Re-runnable; dedups on
// canonical_domain → canonical_name+country+state.

import { parse as parseCsv } from "https://deno.land/std@0.224.0/csv/parse.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

export type V6Row = Record<string, string | undefined>;

export type NormalizedRow = {
  company_name: string;
  canonical_name: string;
  canonical_domain: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  industry: string | null;
  teu: number | null;
  revenue: string | null;
  vertical: string | null;
  top_dimensions: unknown | null;
  gp_potential: number | null;
  import_batch_name: string;
  source_file: string;
};

const SUFFIX_RE = /\s+(inc\.?|llc\.?|ltd\.?|corp\.?|co\.?|limited|sas|gmbh)$/i;

export function canonicalize(name: string): string {
  return name
    .toLowerCase()
    .replace(SUFFIX_RE, "")
    .replace(/[.,'"!?()]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeV6Row(
  row: V6Row,
  meta: { batch?: string; source?: string } = {},
): NormalizedRow {
  const company_name = (row.Account ?? "").trim();
  const [city, state, country] = (row.Location ?? "")
    .split(",")
    .map((s) => s.trim());
  const teuRaw = (row["TEU Vol."] ?? "").replace(/[,$\s]/g, "");
  const teu = teuRaw ? Number(teuRaw) : null;
  const revenue = (row["Annual Sales"] ?? "")
    .replace(/[,$\s]/g, "")
    .replace(/^[^\d]+/, "") || null;
  const gpRaw = (row["GP Potential"] ?? "").replace(/[,$\s]/g, "");
  const gp_potential = gpRaw ? Number(gpRaw) : null;
  let top_dimensions: unknown | null = null;
  if (row["Top Dimensions"]) {
    try { top_dimensions = JSON.parse(row["Top Dimensions"]); } catch { top_dimensions = null; }
  }
  return {
    company_name,
    canonical_name: canonicalize(company_name),
    canonical_domain: null,
    city: city || null,
    state: state || null,
    country: country || null,
    industry: row.Industry?.trim() || null,
    teu,
    revenue,
    vertical: row.Vertical?.trim() || null,
    top_dimensions,
    gp_potential,
    import_batch_name: meta.batch ?? `v6-${new Date().toISOString().slice(0, 10)}`,
    source_file: meta.source ?? "v6.csv",
  };
}

async function main() {
  const args = parseArgs(Deno.args);
  const csvPath = args.csv;
  if (!csvPath) { console.error("Missing --csv"); Deno.exit(2); }
  const dryRun = !!args["dry-run"];

  const text = await Deno.readTextFile(csvPath);
  const rows = await parseCsv(text, { skipFirstRow: true, columns: undefined }) as V6Row[];

  const normalized = rows.map((r) => normalizeV6Row(r, { source: csvPath }));
  console.log(`Parsed ${normalized.length} rows from ${csvPath}.`);

  if (dryRun) {
    console.log("Sample row:", normalized[0]);
    return;
  }

  const url = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const client = createClient(url, key);

  // Batch upserts to avoid huge payloads.
  const BATCH = 500;
  for (let i = 0; i < normalized.length; i += BATCH) {
    const chunk = normalized.slice(i, i + BATCH);
    const { error } = await client
      .from("lit_company_directory")
      .upsert(chunk, { onConflict: "canonical_name,country,state", ignoreDuplicates: false });
    if (error) { console.error(`Batch ${i}:`, error); Deno.exit(1); }
    console.log(`Upserted ${i + chunk.length}/${normalized.length}`);
  }
  console.log("Done.");
}

function parseArgs(argv: string[]) {
  const out: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const k = a.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith("--")) out[k] = true;
      else { out[k] = next; i++; }
    }
  }
  return out;
}

if (import.meta.main) await main();
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd scripts && deno test --allow-env ingest-v6-csv.test.ts
```

Expected: PASS, 2 tests.

- [ ] **Step 5: Dry-run the script against the V6 CSV**

```bash
deno run --allow-read --allow-env --allow-net \
  scripts/ingest-v6-csv.ts --csv "<path-to-v6.csv>" --dry-run
```

Expected: prints row count + one sample normalized row. No DB writes.

- [ ] **Step 6: Commit**

```bash
git add scripts/ingest-v6-csv.ts scripts/ingest-v6-csv.test.ts
git commit -m "feat(scripts): V6 CSV ingest script for lit_company_directory"
```

---

### Task 3: Run V6 ingest against preview branch + spot-check

**Files:** none new (operational task).

- [ ] **Step 1: Add a UNIQUE constraint backing the upsert key**

The upsert uses `onConflict: "canonical_name,country,state"`. Confirm the constraint exists or add it:

```sql
-- Run against preview branch. Skip if constraint already exists.
alter table lit_company_directory
  add constraint lit_company_directory_canonical_uniq
  unique (canonical_name, country, state);
```

If `canonical_name` is currently nullable and contains NULLs, first run:

```sql
update lit_company_directory
set canonical_name = lower(regexp_replace(coalesce(canonical_name, company_name, ''), '[.,''"!?()]', '', 'g'))
where canonical_name is null;
```

- [ ] **Step 2: Run the ingest against the preview branch**

```bash
SUPABASE_URL="<preview-url>" SUPABASE_SERVICE_ROLE_KEY="<preview-key>" \
  deno run --allow-read --allow-env --allow-net \
  scripts/ingest-v6-csv.ts --csv "<path-to-v6.csv>"
```

Expected: "Done." with no errors.

- [ ] **Step 3: Spot-check 20 random rows**

```sql
select company_name, canonical_name, city, state, country, vertical, gp_potential, top_dimensions
from lit_company_directory
where source_file = 'v6.csv'
order by random()
limit 20;
```

Expected: rows look correct, Location parsed, GP Potential numeric, Top Dimensions valid JSON.

- [ ] **Step 4: Verify dedup against existing Panjiva data**

```sql
select count(*) total,
       count(*) filter (where import_batch_name like 'panjiva%') as panjiva_only,
       count(*) filter (where source_file = 'v6.csv') as v6_touched,
       count(*) filter (where import_batch_name like 'panjiva%' and source_file = 'v6.csv') as merged
from lit_company_directory;
```

Expected: totals reasonable, `merged` > 0 (V6 overlapped existing Panjiva by `canonical_name + country + state`).

- [ ] **Step 5: Re-run ingest (idempotency check)**

Run the same command from Step 2 again. Then re-run the count query from Step 4. Expected: `total` unchanged.

- [ ] **Step 6: Commit (operational record)**

No files to commit; record the result by amending the plan checkbox or in a follow-up note.

---

# Phase 1 — Backend

Goal: schema additions, new tables, edge functions, nightly cron, ImportYeti quota enforcement.

---

### Task 4: Schema — opportunity score columns + Map Selections + ImportYeti quota

**Files:**
- Create: `supabase/migrations/2026MMDDHHMMSS_pulse_explorer_schema.sql`

- [ ] **Step 1: Write the migration**

```sql
-- 2026MMDDHHMMSS_pulse_explorer_schema.sql
-- Pulse Explorer Phase 1 — schema additions.

-- 1. Opportunity score columns on lit_company_directory.
alter table lit_company_directory
  add column if not exists opportunity_consolidation_score numeric,
  add column if not exists opportunity_vulnerable_score numeric,
  add column if not exists opportunity_velocity_score numeric,
  add column if not exists opportunity_composite_score numeric,
  add column if not exists last_opportunity_recompute_at timestamptz;

create index if not exists lit_company_directory_composite_idx
  on lit_company_directory (opportunity_composite_score desc nulls last);

-- 2. Map Selections (saved views — filters + selection IDs + map state).
create table if not exists lit_pulse_map_selections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  org_id uuid references organizations(id) on delete cascade,
  name text not null,
  filters jsonb not null default '{}'::jsonb,
  selection_ids text[] not null default '{}',
  map_state jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists lit_pulse_map_selections_user_idx
  on lit_pulse_map_selections (user_id, updated_at desc);

alter table lit_pulse_map_selections enable row level security;

create policy "user reads own map selections"
  on lit_pulse_map_selections for select to authenticated
  using (user_id = auth.uid()
         or (org_id is not null and exists (
           select 1 from org_members om
           where om.organization_id = lit_pulse_map_selections.org_id
             and om.user_id = auth.uid())));

create policy "user inserts own map selections"
  on lit_pulse_map_selections for insert to authenticated
  with check (user_id = auth.uid());

create policy "user updates own map selections"
  on lit_pulse_map_selections for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "user deletes own map selections"
  on lit_pulse_map_selections for delete to authenticated
  using (user_id = auth.uid());

-- 3. ImportYeti per-user daily quota.
create table if not exists lit_user_importyeti_quota (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  calls_count int not null default 0,
  primary key (user_id, day)
);

alter table lit_user_importyeti_quota enable row level security;

create policy "user reads own quota"
  on lit_user_importyeti_quota for select to authenticated
  using (user_id = auth.uid());

-- Service role bypasses RLS (used by importyeti-proxy edge fn for increments).
```

- [ ] **Step 2: Apply migration to preview branch**

Via MCP or `supabase db push --linked --branch <preview>`.

- [ ] **Step 3: Verify tables + RLS**

```sql
select tablename, policyname, cmd from pg_policies
where tablename in ('lit_pulse_map_selections', 'lit_user_importyeti_quota');
```

Expected: 4 policies on `lit_pulse_map_selections`, 1 on quota.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/2026MMDDHHMMSS_pulse_explorer_schema.sql
git commit -m "chore(migrations): pulse-explorer schema — opportunity scores, map selections, IY quota"
```

---

### Task 5: Shared canonical name helper

**Files:**
- Create: `supabase/functions/_shared/canonical_name.ts`
- Create: `supabase/functions/_shared/canonical_name.test.ts`

Lives in `_shared` so both the ingest script (Task 2 imports this in v1.5 refactor — out of scope for now) and the `pulse-explore` edge fn (Task 7) use the same normalization.

- [ ] **Step 1: Write the failing test**

```ts
// supabase/functions/_shared/canonical_name.test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { canonicalizeName } from "./canonical_name.ts";

Deno.test("strips legal suffixes", () => {
  assertEquals(canonicalizeName("Acme Foods, Inc."), "acme foods");
  assertEquals(canonicalizeName("ACME Foods LLC"), "acme foods");
  assertEquals(canonicalizeName("Acme Foods Corp."), "acme foods");
  assertEquals(canonicalizeName("Acme Foods GmbH"), "acme foods");
});

Deno.test("collapses whitespace and punctuation", () => {
  assertEquals(canonicalizeName("  Acme  Foods!  "), "acme foods");
});

Deno.test("handles empty / null safely", () => {
  assertEquals(canonicalizeName(""), "");
  assertEquals(canonicalizeName(null as unknown as string), "");
});
```

- [ ] **Step 2: Run to verify failure**

```bash
cd supabase/functions && deno test _shared/canonical_name.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
// supabase/functions/_shared/canonical_name.ts
const SUFFIX_RE = /\s+(inc\.?|llc\.?|ltd\.?|corp\.?|co\.?|limited|sas|gmbh)$/i;

export function canonicalizeName(name: string | null | undefined): string {
  if (!name) return "";
  return name
    .toLowerCase()
    .replace(SUFFIX_RE, "")
    .replace(/[.,'"!?()]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
```

- [ ] **Step 4: Run to verify passes**

```bash
cd supabase/functions && deno test _shared/canonical_name.test.ts
```

Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/canonical_name.ts supabase/functions/_shared/canonical_name.test.ts
git commit -m "feat(shared): canonical name normalization helper"
```

---

### Task 6: Opportunity scoring formulas

**Files:**
- Create: `supabase/functions/_shared/opportunity_scoring.ts`
- Create: `supabase/functions/_shared/opportunity_scoring.test.ts`

These pure functions are called by the nightly cron job (Task 8) and unit-tested in isolation. Defend-and-grow is derived on read inside `pulse-explore` (not in this file).

- [ ] **Step 1: Write the failing tests**

```ts
// supabase/functions/_shared/opportunity_scoring.test.ts
import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  consolidationScore,
  vulnerableScore,
  velocityScore,
  compositeScore,
} from "./opportunity_scoring.ts";

Deno.test("consolidation: single forwarder = 0", () => {
  assertEquals(consolidationScore({ forwarder_count: 1, total_teu_12m: 5000 }), 0);
});

Deno.test("consolidation: many forwarders + big volume = high", () => {
  const s = consolidationScore({ forwarder_count: 4, total_teu_12m: 5000 });
  assert(s > 70, `expected > 70, got ${s}`);
  assert(s <= 100);
});

Deno.test("vulnerable: dominant forwarder + shrinking TEU = high", () => {
  const s = vulnerableScore({
    forwarder_concentration: 0.9,
    recent_6m_teu: 100,
    prior_6m_teu: 500,
  });
  assert(s > 70, `expected > 70, got ${s}`);
});

Deno.test("vulnerable: growing TEU + low concentration = low", () => {
  const s = vulnerableScore({
    forwarder_concentration: 0.3,
    recent_6m_teu: 500,
    prior_6m_teu: 200,
  });
  assert(s < 30, `expected < 30, got ${s}`);
});

Deno.test("velocity: top-quintile TEU + recent = high", () => {
  const s = velocityScore({ percentile_teu: 0.95, days_since_last_shipment: 10 });
  assert(s > 80, `expected > 80, got ${s}`);
});

Deno.test("composite: dominant score wins via the 0.7 weight", () => {
  const s = compositeScore({ consolidation: 0, vulnerable: 100, velocity: 0, defend: 0 });
  assert(s >= 70, `expected >= 70 from 100 * 0.7, got ${s}`);
});
```

- [ ] **Step 2: Run to verify failures**

```bash
cd supabase/functions && deno test _shared/opportunity_scoring.test.ts
```

Expected: FAIL — functions not defined.

- [ ] **Step 3: Implement**

```ts
// supabase/functions/_shared/opportunity_scoring.ts
// Pulse Explorer v1 opportunity scores. All return 0–100, normalized.

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));

export function consolidationScore(i: {
  forwarder_count: number;
  total_teu_12m: number;
}): number {
  if (!i.forwarder_count || i.forwarder_count < 2) return 0;
  return clamp(
    (i.forwarder_count - 1) * 25 + Math.log10((i.total_teu_12m ?? 0) + 1) * 8,
  );
}

export function vulnerableScore(i: {
  forwarder_concentration: number; // 0–1
  recent_6m_teu: number;
  prior_6m_teu: number;
}): number {
  const trend =
    (i.recent_6m_teu - i.prior_6m_teu) / Math.max(i.prior_6m_teu, 1);
  return clamp(i.forwarder_concentration * 60 + Math.max(0, -trend) * 100);
}

export function velocityScore(i: {
  percentile_teu: number; // 0–1
  days_since_last_shipment: number;
}): number {
  const recency = Math.max(0, 1 - i.days_since_last_shipment / 90);
  return clamp(i.percentile_teu * 80 + recency * 20);
}

export function compositeScore(i: {
  consolidation: number;
  vulnerable: number;
  velocity: number;
  defend: number;
}): number {
  const scores = [i.consolidation, i.vulnerable, i.velocity, i.defend];
  const max = Math.max(...scores);
  const top2 = [...scores].sort((a, b) => b - a).slice(0, 2);
  const avgTop2 = (top2[0] + top2[1]) / 2;
  return clamp(max * 0.7 + avgTop2 * 0.3);
}
```

- [ ] **Step 4: Run to verify passes**

```bash
cd supabase/functions && deno test _shared/opportunity_scoring.test.ts
```

Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/opportunity_scoring.ts supabase/functions/_shared/opportunity_scoring.test.ts
git commit -m "feat(shared): opportunity scoring formulas (consolidation, vulnerable, velocity, composite)"
```

---

### Task 7: Region presets shared module

**Files:**
- Create: `supabase/functions/_shared/region_presets.ts`
- Create: `supabase/functions/_shared/region_presets.test.ts`

Used by `pulse-search` (extended in Phase 3) and `pulse-explore`. Also re-exported on the frontend via `coordLookup.js`.

- [ ] **Step 1: Write failing test**

```ts
// supabase/functions/_shared/region_presets.test.ts
import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { expandRegion, REGION_KEYS } from "./region_presets.ts";

Deno.test("southeast expands to expected states", () => {
  const states = expandRegion("southeast");
  assert(states.includes("FL"));
  assert(states.includes("GA"));
  assert(states.includes("TN"));
  assertEquals(states.length, 7);
});

Deno.test("unknown region returns empty list", () => {
  assertEquals(expandRegion("not-a-region"), []);
});

Deno.test("REGION_KEYS is a non-empty list of canonical keys", () => {
  assert(REGION_KEYS.length >= 4);
  assert(REGION_KEYS.includes("southeast"));
  assert(REGION_KEYS.includes("west_coast"));
});
```

- [ ] **Step 2: Verify failure**

```bash
cd supabase/functions && deno test _shared/region_presets.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
// supabase/functions/_shared/region_presets.ts
// Region → US state code mapping. Single source of truth shared FE/BE.

const REGION_TO_STATES: Record<string, string[]> = {
  southeast: ["FL", "GA", "NC", "SC", "TN", "AL", "MS"],
  west_coast: ["CA", "OR", "WA"],
  northeast: ["NY", "NJ", "MA", "CT", "RI", "PA", "VT", "NH", "ME"],
  midwest: ["IL", "IN", "MI", "OH", "WI", "MN", "IA", "MO", "KS", "NE", "ND", "SD"],
  southwest: ["TX", "OK", "NM", "AZ"],
  mountain: ["CO", "UT", "WY", "MT", "ID", "NV"],
};

export const REGION_KEYS = Object.keys(REGION_TO_STATES);

export function expandRegion(key: string | null | undefined): string[] {
  if (!key) return [];
  return REGION_TO_STATES[key.toLowerCase()] ?? [];
}

export function regionToStatesMap(): Record<string, string[]> {
  return { ...REGION_TO_STATES };
}
```

- [ ] **Step 4: Verify passes**

```bash
cd supabase/functions && deno test _shared/region_presets.test.ts
```

Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/region_presets.ts supabase/functions/_shared/region_presets.test.ts
git commit -m "feat(shared): region → states preset mapping"
```

---

### Task 8: Nightly opportunity recompute (cron)

**Files:**
- Create: `supabase/migrations/2026MMDDHHMMSS_pulse_explorer_cron.sql`

The recompute runs as SQL inside a pg_cron job. Pure SQL because (a) it avoids edge-fn cold starts, (b) the formulas are simple enough to inline, (c) it batches all rows in one statement.

- [ ] **Step 1: Write the migration**

```sql
-- 2026MMDDHHMMSS_pulse_explorer_cron.sql
-- Nightly opportunity recompute for lit_company_directory rows.
-- Inline SQL versions of consolidation, vulnerable, velocity, composite.

create or replace function lit_recompute_opportunity_scores()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  pct_table table (canonical_name text, country text, state text, pct numeric);
begin
  -- Pull aggregate stats from lit_unified_shipments, keyed by shipper company.
  -- Build a CTE pipeline that derives every input score formula needs, then
  -- writes the four scores back to lit_company_directory.

  with shipper_stats as (
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
     and s.country = d.country
     and s.state = d.state
  ),
  with_percentile as (
    select *,
      percent_rank() over (order by total_teu_12m) as percentile_teu
    from shipper_stats
  ),
  scored as (
    select
      canonical_name, country, state,
      -- Consolidation
      case when forwarder_count < 2 then 0
           else least(100, (forwarder_count - 1) * 25 + log(total_teu_12m + 1) * 8)
      end as consolidation,
      -- Vulnerable
      least(100, forwarder_concentration * 60 + greatest(0,
        -((recent_6m_teu - prior_6m_teu) / greatest(prior_6m_teu, 1.0))
      ) * 100) as vulnerable,
      -- Velocity
      least(100,
        percentile_teu * 80 + greatest(0, 1 - days_since_last_shipment / 90.0) * 20
      ) as velocity
    from with_percentile
  ),
  with_composite as (
    select
      *,
      greatest(consolidation, vulnerable, velocity) * 0.7
        + ((consolidation + vulnerable + velocity
            - least(consolidation, vulnerable, velocity)) / 2.0) * 0.3
        as composite
    from scored
  )
  update lit_company_directory d
  set opportunity_consolidation_score = c.consolidation,
      opportunity_vulnerable_score = c.vulnerable,
      opportunity_velocity_score = c.velocity,
      opportunity_composite_score = c.composite,
      last_opportunity_recompute_at = now()
  from with_composite c
  where d.canonical_name = c.canonical_name
    and d.country is not distinct from c.country
    and d.state is not distinct from c.state;
end;
$$;

-- NOTE: lit_pulse_shipper_stats_mv is a materialized view derived from
-- lit_unified_shipments. If it does not exist yet, create it here so the
-- function above resolves.
create materialized view if not exists lit_pulse_shipper_stats_mv as
with base as (
  select
    lower(regexp_replace(coalesce(consignee_name, ''), '\s+(inc\.?|llc\.?|ltd\.?|corp\.?|co\.?)$', '', 'i')) as canonical_name,
    consignee_country as country,
    consignee_state as state,
    forwarder_name,
    teu,
    shipment_date
  from lit_unified_shipments
  where shipment_date > now() - interval '365 days'
    and consignee_name is not null
)
select
  canonical_name,
  country,
  state,
  count(distinct forwarder_name) as forwarder_count,
  sum(teu) as total_teu_12m,
  sum(case when shipment_date > now() - interval '180 days' then teu else 0 end) as recent_6m_teu,
  sum(case when shipment_date <= now() - interval '180 days' then teu else 0 end) as prior_6m_teu,
  (
    select max(share) from (
      select sum(teu) / nullif(sum(sum(teu)) over (), 0) as share
      from lit_unified_shipments u2
      where u2.consignee_country = base.country
        and u2.consignee_state is not distinct from base.state
        and lower(regexp_replace(coalesce(u2.consignee_name, ''), '\s+(inc\.?|llc\.?|ltd\.?|corp\.?|co\.?)$', '', 'i')) = base.canonical_name
        and u2.shipment_date > now() - interval '365 days'
      group by u2.forwarder_name
    ) s
  ) as forwarder_concentration,
  extract(day from now() - max(shipment_date)) as days_since_last_shipment
from base
group by canonical_name, country, state;

create unique index if not exists lit_pulse_shipper_stats_mv_pk
  on lit_pulse_shipper_stats_mv (canonical_name, country, state);

-- Schedule nightly at 03:15 UTC.
select cron.schedule(
  'lit-pulse-opportunity-recompute',
  '15 3 * * *',
  $$ refresh materialized view concurrently lit_pulse_shipper_stats_mv; select lit_recompute_opportunity_scores(); $$
);
```

- [ ] **Step 2: Apply migration**

```bash
supabase db push --linked --branch <preview>
```

Expected: migration applies; materialized view + function + cron job created.

- [ ] **Step 3: Trigger recompute manually + verify**

```sql
refresh materialized view lit_pulse_shipper_stats_mv;
select lit_recompute_opportunity_scores();

select count(*) filter (where opportunity_composite_score > 0) as scored,
       count(*) as total,
       max(last_opportunity_recompute_at) as last_run
from lit_company_directory;
```

Expected: `scored` > 0, `last_run` ≈ now.

- [ ] **Step 4: Verify cron registration**

```sql
select jobname, schedule, active from cron.job where jobname = 'lit-pulse-opportunity-recompute';
```

Expected: 1 row, schedule `15 3 * * *`, active true.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/2026MMDDHHMMSS_pulse_explorer_cron.sql
git commit -m "chore(migrations): nightly opportunity recompute cron + shipper stats MV"
```

---

### Task 9: Add quota check to `importyeti-proxy`

**Files:**
- Modify: `supabase/functions/importyeti-proxy/index.ts`

The proxy gains: (a) a cache-hit gate using existing `lit_importyeti_company_snapshot.last_refreshed_at` (24h TTL), (b) a per-user daily call counter (writes to `lit_user_importyeti_quota`), (c) a hard cap derived from plan entitlements.

- [ ] **Step 1: Read the current importyeti-proxy to understand its shape**

Open `supabase/functions/importyeti-proxy/index.ts` and identify the entry handler, the request shape, and where it calls ImportYeti. You'll wrap that call with quota + cache logic.

- [ ] **Step 2: Add the quota helpers above the request handler**

Add near the top of the file, after the env block:

```ts
// Per-tier daily refresh caps. Confirm with Stripe entitlements team; defaults
// match spec §11 open item.
const IMPORTYETI_DAILY_CAP: Record<string, number> = {
  free_trial: 5,
  starter: 25,
  growth: 50,
  scale: 200,
  enterprise: 1000,
};

const CACHE_TTL_HOURS = 24;

async function getCachedSnapshot(supabase: SupabaseClient, companyId: string) {
  const { data } = await supabase
    .from("lit_importyeti_company_snapshot")
    .select("*, last_refreshed_at")
    .eq("company_id", companyId)
    .maybeSingle();
  if (!data?.last_refreshed_at) return null;
  const ageMs = Date.now() - new Date(data.last_refreshed_at).getTime();
  if (ageMs < CACHE_TTL_HOURS * 3600 * 1000) return data;
  return null;
}

async function checkAndIncrementQuota(
  supabase: SupabaseClient, userId: string, planTier: string,
): Promise<{ ok: true } | { ok: false; cap: number; used: number }> {
  const cap = IMPORTYETI_DAILY_CAP[planTier] ?? IMPORTYETI_DAILY_CAP.free_trial;
  const today = new Date().toISOString().slice(0, 10);
  const { data: row } = await supabase
    .from("lit_user_importyeti_quota")
    .select("calls_count")
    .eq("user_id", userId)
    .eq("day", today)
    .maybeSingle();
  const used = row?.calls_count ?? 0;
  if (used >= cap) return { ok: false, cap, used };
  await supabase
    .from("lit_user_importyeti_quota")
    .upsert({ user_id: userId, day: today, calls_count: used + 1 });
  return { ok: true };
}
```

- [ ] **Step 3: Wrap the ImportYeti call**

Inside the request handler, BEFORE the existing ImportYeti API call, add:

```ts
// 1. Cache-hit gate.
if (!body.force) {
  const cached = await getCachedSnapshot(adminClient, body.company_id);
  if (cached) {
    log.info("served from cache", { company_id: body.company_id });
    return jsonResponse({ ok: true, source: "cache", data: cached });
  }
}

// 2. Quota check (uses user JWT identity + plan tier from entitlements).
const planTier = await loadPlanTier(adminClient, userId);
const quota = await checkAndIncrementQuota(adminClient, userId, planTier);
if (!quota.ok) {
  return jsonResponse(
    { ok: false, error: "quota_exceeded", cap: quota.cap, used: quota.used },
    429,
  );
}

// 3. Existing ImportYeti API call goes here unchanged.
```

If `loadPlanTier` doesn't exist in this function yet, add a simple version:

```ts
async function loadPlanTier(supabase: SupabaseClient, userId: string): Promise<string> {
  const { data } = await supabase
    .from("subscriptions")
    .select("plan_tier")
    .eq("user_id", userId)
    .maybeSingle();
  return data?.plan_tier ?? "free_trial";
}
```

- [ ] **Step 4: Deploy to preview**

```bash
supabase functions deploy importyeti-proxy --project-ref <preview-ref>
```

- [ ] **Step 5: Smoke-test quota path**

```bash
# Replace YOUR_USER_JWT and YOUR_COMPANY_ID.
for i in $(seq 1 6); do
  curl -s -X POST "https://<preview>.functions.supabase.co/importyeti-proxy" \
    -H "Authorization: Bearer YOUR_USER_JWT" \
    -H "Content-Type: application/json" \
    -d '{"company_id":"YOUR_COMPANY_ID","force":true}' | head -c 200; echo
done
```

Expected: first 5 succeed (cap = free_trial default), 6th returns `{"ok":false,"error":"quota_exceeded","cap":5,"used":5}`.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/importyeti-proxy/index.ts
git commit -m "feat(importyeti-proxy): add cache gate + per-user daily quota"
```

---

### Task 10: `pulse-explore` edge function

**Files:**
- Create: `supabase/functions/pulse-explore/index.ts`

Reads filters + viewport bbox, runs the merged CSV + live union with dedup, attaches freshness + opportunity scores, returns unified rows.

- [ ] **Step 1: Scaffold the function**

```ts
// supabase/functions/pulse-explore/index.ts
// Merged Pulse Explorer query: lit_company_directory ∪ lit_companies,
// deduped, with freshness + opportunity scores attached.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";
import { createLogger } from "../_shared/logger.ts";
import { requireUser } from "../_shared/auth.ts";
import { canonicalizeName } from "../_shared/canonical_name.ts";
import { expandRegion } from "../_shared/region_presets.ts";

const log = createLogger("pulse-explore");

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const MAX_ROWS = 10_000;

type Filters = {
  industry?: string[];
  geo?: {
    region?: string;
    states?: string[];
    metros?: string[];
    countries?: string[];
  };
  size?: { teu_min?: number; teu_max?: number; shipments_min?: number; shipments_max?: number };
  opportunity_types?: ("consolidation" | "vulnerable" | "velocity" | "defend")[];
  freshness_state?: ("live" | "saved" | "directory" | "stale")[];
  workflow_state?: string[];
  dataset_filter?: "directory_only" | "live_only" | "all";
};

type Viewport = { ne_lat: number; ne_lng: number; sw_lat: number; sw_lng: number } | null;

type Body = {
  filters?: Filters;
  viewport?: Viewport;
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders() });
  if (req.method !== "POST") return jsonResp({ ok: false, error: "method_not_allowed" }, 405);

  const auth = await requireUser(req);
  if (!auth.ok) return jsonResp({ ok: false, error: "unauthorized" }, 401);
  const { user } = auth;

  const body: Body = await req.json().catch(() => ({}));
  const filters = body.filters ?? {};
  const viewport = body.viewport ?? null;

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  // Expand region into states if needed.
  if (filters.geo?.region && (!filters.geo.states || filters.geo.states.length === 0)) {
    filters.geo.states = expandRegion(filters.geo.region);
  }

  const dataset = filters.dataset_filter ?? "all";

  const [directoryRows, liveRows] = await Promise.all([
    dataset === "live_only" ? [] : fetchDirectory(admin, filters, viewport),
    dataset === "directory_only" ? [] : fetchLive(admin, user.id, filters, viewport),
  ]);

  const merged = mergeAndDedup(directoryRows, liveRows);
  const withFreshness = await attachFreshness(admin, merged);
  const withDefend = await attachDefendScore(admin, user.id, withFreshness);

  const truncated = withFreshness.length > MAX_ROWS;
  const capped = truncated
    ? [...withDefend].sort((a, b) => (b.opportunity_composite_score ?? 0) - (a.opportunity_composite_score ?? 0)).slice(0, MAX_ROWS)
    : withDefend;

  return jsonResp({
    ok: true,
    rows: capped,
    totals: {
      total: withDefend.length,
      returned: capped.length,
      sources: tally(capped),
    },
    truncated,
  });
});

// --- helpers (fetchDirectory, fetchLive, mergeAndDedup, attachFreshness,
//     attachDefendScore, jsonResp, corsHeaders, tally) defined below ---
```

- [ ] **Step 2: Add `fetchDirectory` and `fetchLive` helpers**

Append to the same file:

```ts
async function fetchDirectory(admin: any, f: Filters, vp: Viewport) {
  let q = admin
    .from("lit_company_directory")
    .select(
      "id, company_name, canonical_name, canonical_domain, city, state, country, " +
      "industry, vertical, employee_count, revenue, teu, shipments, lcl, value_usd, " +
      "top_dimensions, gp_potential, " +
      "opportunity_consolidation_score, opportunity_vulnerable_score, " +
      "opportunity_velocity_score, opportunity_composite_score",
    );
  q = applyCommonFilters(q, f);
  q = applyViewport(q, vp);
  const { data, error } = await q.limit(MAX_ROWS);
  if (error) { log.error("directory query failed", { error }); return []; }
  return (data ?? []).map((r: any) => ({ ...r, data_sources: ["directory"] }));
}

async function fetchLive(admin: any, userId: string, f: Filters, vp: Viewport) {
  let q = admin
    .from("lit_companies")
    .select(
      "id, name as company_name, canonical_name, domain as canonical_domain, " +
      "city, state, country, industry, employee_count, revenue, " +
      "last_refreshed_at",
    );
  q = applyCommonFilters(q, f);
  q = applyViewport(q, vp);
  const { data, error } = await q.limit(MAX_ROWS);
  if (error) { log.error("live query failed", { error }); return []; }
  return (data ?? []).map((r: any) => ({ ...r, data_sources: ["live"] }));
}

function applyCommonFilters(q: any, f: Filters) {
  if (f.industry?.length) q = q.in("industry", f.industry);
  if (f.geo?.states?.length) q = q.in("state", f.geo.states);
  if (f.geo?.countries?.length) q = q.in("country", f.geo.countries);
  if (f.size?.teu_min != null) q = q.gte("teu", f.size.teu_min);
  if (f.size?.teu_max != null) q = q.lte("teu", f.size.teu_max);
  return q;
}

function applyViewport(q: any, vp: Viewport) {
  // Bbox filter requires latitude/longitude on rows. v1: no coords stored, so
  // skip server-side bbox; client-side viewport culling applies after fetch.
  // Hook left in place for v1.5 when we add lat/lng to directory.
  return q;
}
```

- [ ] **Step 3: Add `mergeAndDedup`**

```ts
function mergeAndDedup(directory: any[], live: any[]) {
  const out = new Map<string, any>();
  const keyDomain = (r: any) =>
    r.canonical_domain ? `d:${r.canonical_domain.toLowerCase()}` : null;
  const keyName = (r: any) =>
    r.canonical_name
      ? `n:${canonicalizeName(r.canonical_name)}|${r.country ?? ""}|${r.state ?? ""}`
      : null;

  // Live rows win when both match. Insert live first, then directory.
  for (const r of live) {
    const k = keyDomain(r) ?? keyName(r);
    if (k) out.set(k, r);
  }
  for (const r of directory) {
    const k = keyDomain(r) ?? keyName(r);
    if (!k) { continue; }
    const existing = out.get(k);
    if (!existing) { out.set(k, r); continue; }
    // Merge directory-only fields into existing live row. Live wins for shared.
    out.set(k, {
      ...existing,
      vertical: existing.vertical ?? r.vertical,
      top_dimensions: existing.top_dimensions ?? r.top_dimensions,
      gp_potential: existing.gp_potential ?? r.gp_potential,
      teu: existing.teu ?? r.teu,
      opportunity_consolidation_score:
        existing.opportunity_consolidation_score ?? r.opportunity_consolidation_score,
      opportunity_vulnerable_score:
        existing.opportunity_vulnerable_score ?? r.opportunity_vulnerable_score,
      opportunity_velocity_score:
        existing.opportunity_velocity_score ?? r.opportunity_velocity_score,
      opportunity_composite_score:
        existing.opportunity_composite_score ?? r.opportunity_composite_score,
      data_sources: ["directory", "live"],
    });
  }
  return Array.from(out.values());
}
```

- [ ] **Step 4: Add freshness + defend-and-grow attachers**

```ts
async function attachFreshness(admin: any, rows: any[]) {
  const ids = rows.map((r) => r.id).filter(Boolean);
  if (ids.length === 0) return rows.map(addFreshnessChip);
  const { data } = await admin
    .from("lit_importyeti_company_snapshot")
    .select("company_id, last_refreshed_at")
    .in("company_id", ids);
  const fresh = new Map<string, string>(
    (data ?? []).map((d: any) => [d.company_id, d.last_refreshed_at]),
  );
  return rows.map((r) => addFreshnessChip(r, fresh.get(r.id)));
}

function addFreshnessChip(r: any, lastRefreshedAt?: string | null) {
  let chip: "live" | "saved" | "directory" = "directory";
  let age_hours: number | null = null;
  if (lastRefreshedAt) {
    age_hours = (Date.now() - new Date(lastRefreshedAt).getTime()) / 3600_000;
    chip = age_hours < 24 ? "live" : "saved";
  } else if (r.data_sources?.includes("live")) {
    chip = "saved";
  }
  return { ...r, freshness: { chip, age_hours, last_refreshed_at: lastRefreshedAt ?? null } };
}

async function attachDefendScore(admin: any, userId: string, rows: any[]) {
  // Defend & grow = 80 + lane_growth_bonus IF company is in any of user's
  // Pulse Lists. v1: bonus omitted (lane growth comes from BOL trends not
  // present per-row here). Score = 80 if member, else 0.
  const ids = rows.map((r) => r.id).filter(Boolean);
  if (ids.length === 0) return rows;
  const { data } = await admin
    .from("lit_pulse_list_companies")
    .select("company_id, lit_pulse_lists!inner(user_id)")
    .eq("lit_pulse_lists.user_id", userId)
    .in("company_id", ids);
  const inList = new Set<string>((data ?? []).map((d: any) => d.company_id));
  return rows.map((r) => {
    const defend = inList.has(r.id) ? 80 : 0;
    const composite = Math.max(r.opportunity_composite_score ?? 0, defend * 0.7);
    return {
      ...r,
      opportunity_defend_score: defend,
      opportunity_composite_score: composite,
    };
  });
}

function tally(rows: any[]) {
  return {
    live: rows.filter((r) => r.freshness?.chip === "live").length,
    saved: rows.filter((r) => r.freshness?.chip === "saved").length,
    directory: rows.filter((r) => r.freshness?.chip === "directory").length,
  };
}

function jsonResp(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(), "content-type": "application/json" },
  });
}

function corsHeaders() {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "authorization, content-type",
  };
}
```

> **NOTE for the implementer:** `lit_pulse_list_companies` is the joining table name used in the codebase per the spec §11 open item. Verify this table name (`grep -ri 'lit_pulse_list' supabase/migrations` and `frontend/src/features/pulse/pulseListsApi.js`) before deploying. If the actual table name is different (e.g., `lit_pulse_lists_membership`), update the `from("lit_pulse_list_companies")` call.

- [ ] **Step 5: Deploy to preview**

```bash
supabase functions deploy pulse-explore --project-ref <preview-ref>
```

- [ ] **Step 6: Smoke-test**

```bash
curl -s -X POST "https://<preview>.functions.supabase.co/pulse-explore" \
  -H "Authorization: Bearer YOUR_USER_JWT" \
  -H "Content-Type: application/json" \
  -d '{"filters":{"geo":{"region":"southeast"}}}' | jq '.ok, .rows[0], .totals'
```

Expected: `ok: true`, first row has `freshness.chip`, `data_sources`, `opportunity_composite_score`. Totals show non-zero counts.

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/pulse-explore/index.ts
git commit -m "feat(edge-fn): pulse-explore — merged directory+live query with dedup, freshness, scores"
```

---

### Task 11: `pulse-map-selection-save` and `pulse-map-selections-list` edge functions

**Files:**
- Create: `supabase/functions/pulse-map-selection-save/index.ts`
- Create: `supabase/functions/pulse-map-selections-list/index.ts`

Two tiny CRUD-style endpoints over `lit_pulse_map_selections`.

- [ ] **Step 1: Write `pulse-map-selection-save`**

```ts
// supabase/functions/pulse-map-selection-save/index.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";
import { createLogger } from "../_shared/logger.ts";
import { requireUser } from "../_shared/auth.ts";

const log = createLogger("pulse-map-selection-save");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "authorization, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return resp({ ok: false, error: "method_not_allowed" }, 405);

  const auth = await requireUser(req);
  if (!auth.ok) return resp({ ok: false, error: "unauthorized" }, 401);

  const body = await req.json().catch(() => ({}));
  const { id, name, filters, selection_ids, map_state, org_id } = body;
  if (!name || typeof name !== "string") return resp({ ok: false, error: "name_required" }, 400);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const row = {
    user_id: auth.user.id,
    org_id: org_id ?? null,
    name,
    filters: filters ?? {},
    selection_ids: selection_ids ?? [],
    map_state: map_state ?? {},
    updated_at: new Date().toISOString(),
  };

  // Auto-suffix on name collision.
  let attemptName = name;
  for (let i = 0; i < 5; i++) {
    const { data: existing } = await admin
      .from("lit_pulse_map_selections")
      .select("id")
      .eq("user_id", auth.user.id)
      .eq("name", attemptName)
      .maybeSingle();
    if (!existing || existing.id === id) break;
    attemptName = `${name} (${i + 2})`;
  }
  row.name = attemptName;

  const query = id
    ? admin.from("lit_pulse_map_selections").update(row).eq("id", id).eq("user_id", auth.user.id)
    : admin.from("lit_pulse_map_selections").insert(row);
  const { data, error } = await query.select().single();
  if (error) { log.error("save failed", { error }); return resp({ ok: false, error: error.message }, 500); }
  return resp({ ok: true, selection: data });
});

function resp(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "content-type": "application/json" } });
}
```

- [ ] **Step 2: Write `pulse-map-selections-list`**

```ts
// supabase/functions/pulse-map-selections-list/index.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";
import { createLogger } from "../_shared/logger.ts";
import { requireUser } from "../_shared/auth.ts";

const log = createLogger("pulse-map-selections-list");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, OPTIONS",
  "access-control-allow-headers": "authorization, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const auth = await requireUser(req);
  if (!auth.ok) return resp({ ok: false, error: "unauthorized" }, 401);
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const { data, error } = await admin
    .from("lit_pulse_map_selections")
    .select("id, name, filters, selection_ids, map_state, updated_at")
    .eq("user_id", auth.user.id)
    .order("updated_at", { ascending: false });
  if (error) { log.error("list failed", { error }); return resp({ ok: false, error: error.message }, 500); }
  return resp({ ok: true, selections: data ?? [] });
});

function resp(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "content-type": "application/json" } });
}
```

- [ ] **Step 3: Deploy both**

```bash
supabase functions deploy pulse-map-selection-save --project-ref <preview-ref>
supabase functions deploy pulse-map-selections-list --project-ref <preview-ref>
```

- [ ] **Step 4: Round-trip smoke test**

```bash
curl -s -X POST "https://<preview>.functions.supabase.co/pulse-map-selection-save" \
  -H "Authorization: Bearer YOUR_USER_JWT" -H "Content-Type: application/json" \
  -d '{"name":"Test view","filters":{"industry":["Food Manufacturing"]},"selection_ids":["a","b"],"map_state":{"center":[33.7,-84.4],"zoom":6}}'

curl -s "https://<preview>.functions.supabase.co/pulse-map-selections-list" \
  -H "Authorization: Bearer YOUR_USER_JWT" | jq '.selections[0]'
```

Expected: save returns `ok: true` with selection, list includes it.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/pulse-map-selection-save supabase/functions/pulse-map-selections-list
git commit -m "feat(edge-fn): pulse-map-selection save + list"
```

---

# Phase 2 — Frontend

Goal: tabs + map + toolbar + filter chips + selection bar + quick card re-skin + virtualized table. Wires up the backend from Phase 1.

---

### Task 12: Install supercluster + react-virtualized

**Files:**
- Modify: `frontend/package.json` + lockfile

- [ ] **Step 1: Install deps**

```bash
cd frontend
npm install supercluster@^8.0.1 react-virtualized@^9.22.5
npm install --save-dev @types/supercluster@^7.1.3
```

- [ ] **Step 2: Verify build still works**

```bash
cd frontend && npm run build
```

Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add frontend/package.json frontend/package-lock.json
git commit -m "chore(deps): supercluster + react-virtualized for Pulse Explorer"
```

---

### Task 13: API client for `pulse-explore` and map selections

**Files:**
- Create: `frontend/src/api/pulse-explore.js`
- Create: `frontend/src/api/pulse-map-selections.js`

- [ ] **Step 1: Write `pulse-explore.js`**

```js
// frontend/src/api/pulse-explore.js
import { supabase } from '@/lib/supabase';

export async function fetchExploreAccounts({ filters = {}, viewport = null } = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('not_authenticated');
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/pulse-explore`;
  const r = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ filters, viewport }),
  });
  if (!r.ok) throw new Error(`pulse-explore ${r.status}`);
  return await r.json();
}
```

- [ ] **Step 2: Write `pulse-map-selections.js`**

```js
// frontend/src/api/pulse-map-selections.js
import { supabase } from '@/lib/supabase';

async function authed(path, init = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('not_authenticated');
  return fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${path}`, {
    ...init,
    headers: {
      ...(init.headers || {}),
      'Authorization': `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    },
  });
}

export async function saveMapSelection(payload) {
  const r = await authed('pulse-map-selection-save', { method: 'POST', body: JSON.stringify(payload) });
  if (!r.ok) throw new Error(`save selection ${r.status}`);
  return await r.json();
}

export async function listMapSelections() {
  const r = await authed('pulse-map-selections-list', { method: 'GET' });
  if (!r.ok) throw new Error(`list selections ${r.status}`);
  return await r.json();
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/api/pulse-explore.js frontend/src/api/pulse-map-selections.js
git commit -m "feat(api): clients for pulse-explore + map selections"
```

---

### Task 14: Coordinate lookup + region presets (frontend)

**Files:**
- Create: `frontend/src/features/pulse/explore/coordLookup.js`
- Create: `frontend/src/features/pulse/explore/regionPresets.js`
- Create: `frontend/src/features/pulse/explore/coordLookup.test.js`

Extract the existing US_STATE_CENTROIDS / US_METRO_COORDS / COUNTRY_COORDS from `PulseMap.jsx` so the new ExploreMap can reuse them without coupling.

- [ ] **Step 1: Write the failing test**

```js
// frontend/src/features/pulse/explore/coordLookup.test.js
import { describe, it, expect } from 'vitest';
import { lookupCoords } from './coordLookup';

describe('lookupCoords fallback chain', () => {
  it('returns city coord when city + state known', () => {
    const c = lookupCoords({ city: 'Los Angeles', state: 'CA', country: 'USA' });
    expect(c).toBeTruthy();
    expect(c.source).toBe('metro');
  });

  it('falls back to state centroid when city unknown', () => {
    const c = lookupCoords({ city: 'Nowhere', state: 'TX', country: 'USA' });
    expect(c.source).toBe('state');
  });

  it('falls back to country centroid when state unknown', () => {
    const c = lookupCoords({ city: 'Nowhere', state: 'XX', country: 'CHN' });
    expect(c.source).toBe('country');
  });

  it('returns null when nothing resolves', () => {
    expect(lookupCoords({ city: 'Nowhere' })).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify failure**

```bash
cd frontend && npm run test -- coordLookup
```

Expected: FAIL.

- [ ] **Step 3: Implement `regionPresets.js`**

Mirrors the backend `_shared/region_presets.ts` so the frontend can pre-expand for the geo chip UI.

```js
// frontend/src/features/pulse/explore/regionPresets.js
export const REGION_PRESETS = {
  southeast: ['FL','GA','NC','SC','TN','AL','MS'],
  west_coast: ['CA','OR','WA'],
  northeast: ['NY','NJ','MA','CT','RI','PA','VT','NH','ME'],
  midwest: ['IL','IN','MI','OH','WI','MN','IA','MO','KS','NE','ND','SD'],
  southwest: ['TX','OK','NM','AZ'],
  mountain: ['CO','UT','WY','MT','ID','NV'],
};

export const REGION_LABELS = {
  southeast: 'Southeast',
  west_coast: 'West Coast',
  northeast: 'Northeast',
  midwest: 'Midwest',
  southwest: 'Southwest',
  mountain: 'Mountain',
};

export function expandRegion(key) {
  return REGION_PRESETS[key] ?? [];
}
```

- [ ] **Step 4: Implement `coordLookup.js`**

```js
// frontend/src/features/pulse/explore/coordLookup.js
// Coordinate resolution for ExploreMap bubble positioning.
// Chain: metro (city+state) → state centroid → country centroid → null.

import { US_STATE_CENTROIDS, US_METRO_COORDS, COUNTRY_COORDS } from '@/features/pulse/PulseMap';

function metroKey(city, state) {
  if (!city || !state) return null;
  return `${city.trim().toLowerCase()}|${state.trim().toUpperCase()}`;
}

export function lookupCoords({ city, state, country }) {
  const mk = metroKey(city, state);
  if (mk && US_METRO_COORDS[mk]) {
    return { ...US_METRO_COORDS[mk], source: 'metro' };
  }
  if (state && US_STATE_CENTROIDS[state.toUpperCase()]) {
    return { ...US_STATE_CENTROIDS[state.toUpperCase()], source: 'state' };
  }
  if (country && COUNTRY_COORDS[country.toUpperCase()]) {
    return { ...COUNTRY_COORDS[country.toUpperCase()], source: 'country' };
  }
  return null;
}
```

- [ ] **Step 5: Export the centroid maps from PulseMap.jsx**

Open `frontend/src/features/pulse/PulseMap.jsx`. The constants `US_STATE_CENTROIDS`, `US_METRO_COORDS`, `COUNTRY_COORDS` are defined around lines 14-111 per session recon. Add `export` keywords so they're importable:

```js
export const US_STATE_CENTROIDS = { ... };  // was: const
export const US_METRO_COORDS = { ... };     // was: const
export const COUNTRY_COORDS = { ... };      // was: const
```

- [ ] **Step 6: Run test to verify passes**

```bash
cd frontend && npm run test -- coordLookup
```

Expected: PASS, 4 tests.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/features/pulse/explore/coordLookup.js \
        frontend/src/features/pulse/explore/coordLookup.test.js \
        frontend/src/features/pulse/explore/regionPresets.js \
        frontend/src/features/pulse/PulseMap.jsx
git commit -m "feat(pulse-explore): coordinate lookup + region presets, export centroids from PulseMap"
```

---

### Task 15: Bubble palettes module

**Files:**
- Create: `frontend/src/features/pulse/explore/bubblePalettes.js`

- [ ] **Step 1: Implement**

```js
// frontend/src/features/pulse/explore/bubblePalettes.js
// Color palettes per bubble color mode. Tailwind 500-series base hues.
// All passed through a colorblind-safe check (Okabe-Ito-leaning).

export const INDUSTRY_PALETTE = {
  'Manufacturing': '#EF4444', // red-500
  'Retail': '#3B82F6',        // blue-500
  'Transportation': '#10B981',// emerald-500
  'Energy': '#F59E0B',        // amber-500
  'Technology': '#A855F7',    // purple-500
  'Food Manufacturing': '#F97316', // orange-500
  'Wholesale': '#06B6D4',     // cyan-500
  'Construction': '#84CC16',  // lime-500
  'Healthcare': '#EC4899',    // pink-500
  'Other': '#94A3B8',         // slate-400
};

export const WORKFLOW_PALETTE = {
  saved: '#06B6D4',           // cyan
  in_campaign: '#A855F7',     // purple
  meeting_booked: '#10B981',  // emerald
  unsaved: '#94A3B8',         // slate-400
};

// Sequential blue → red for Opportunity score (0–100).
export const OPPORTUNITY_STOPS = [
  { at: 0,   color: '#3B82F6' },
  { at: 25,  color: '#60A5FA' },
  { at: 50,  color: '#FBBF24' },
  { at: 75,  color: '#F59E0B' },
  { at: 100, color: '#DC2626' },
];

export function industryColor(industry) {
  return INDUSTRY_PALETTE[industry] ?? INDUSTRY_PALETTE.Other;
}

export function workflowColor(state) {
  return WORKFLOW_PALETTE[state] ?? WORKFLOW_PALETTE.unsaved;
}

export function opportunityColor(score) {
  const s = Math.max(0, Math.min(100, score ?? 0));
  for (let i = 1; i < OPPORTUNITY_STOPS.length; i++) {
    const prev = OPPORTUNITY_STOPS[i - 1];
    const next = OPPORTUNITY_STOPS[i];
    if (s <= next.at) {
      const t = (s - prev.at) / (next.at - prev.at);
      return mixHex(prev.color, next.color, t);
    }
  }
  return OPPORTUNITY_STOPS[OPPORTUNITY_STOPS.length - 1].color;
}

function mixHex(a, b, t) {
  const ah = parseInt(a.slice(1), 16);
  const bh = parseInt(b.slice(1), 16);
  const ar = (ah >> 16) & 0xff, ag = (ah >> 8) & 0xff, ab = ah & 0xff;
  const br = (bh >> 16) & 0xff, bg = (bh >> 8) & 0xff, bb = bh & 0xff;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return `#${((r << 16) | (g << 8) | bl).toString(16).padStart(6, '0')}`;
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/features/pulse/explore/bubblePalettes.js
git commit -m "feat(pulse-explore): bubble palettes per color mode"
```

---

### Task 16: `useExploreState` hook (URL-synced state)

**Files:**
- Create: `frontend/src/features/pulse/explore/useExploreState.js`

Central state: filters, color mode, size mode, selection, map state. Synced to URL params so views are deep-linkable.

- [ ] **Step 1: Implement**

```js
// frontend/src/features/pulse/explore/useExploreState.js
// Central Explore tab state. URL-synced via search params.

import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

const DEFAULT = {
  filters: {},
  color: 'industry',
  size: 'teu',
  selection: [],
};

function decode(sp) {
  const raw = sp.get('explore');
  if (!raw) return DEFAULT;
  try { return { ...DEFAULT, ...JSON.parse(decodeURIComponent(raw)) }; }
  catch { return DEFAULT; }
}

function encode(state) {
  // Don't persist selection beyond ~50 items in URL — too long.
  const trimmed = { ...state, selection: (state.selection ?? []).slice(0, 50) };
  return encodeURIComponent(JSON.stringify(trimmed));
}

export function useExploreState() {
  const [sp, setSp] = useSearchParams();
  const state = useMemo(() => decode(sp), [sp]);

  const update = useCallback((patch) => {
    setSp((prev) => {
      const next = new URLSearchParams(prev);
      next.set('explore', encode({ ...state, ...patch }));
      return next;
    }, { replace: true });
  }, [setSp, state]);

  const setFilters = useCallback((filters) => update({ filters }), [update]);
  const setColor = useCallback((color) => update({ color }), [update]);
  const setSize = useCallback((size) => update({ size }), [update]);
  const setSelection = useCallback((selection) => update({ selection }), [update]);
  const clearAll = useCallback(() => {
    setSp((prev) => { const n = new URLSearchParams(prev); n.delete('explore'); return n; }, { replace: true });
  }, [setSp]);

  return { state, setFilters, setColor, setSize, setSelection, clearAll };
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/features/pulse/explore/useExploreState.js
git commit -m "feat(pulse-explore): URL-synced state hook"
```

---

### Task 17: `useExploreAccounts` + `useExploreInsights` + `useImportYetiRefresh` hooks

**Files:**
- Create: `frontend/src/features/pulse/explore/useExploreAccounts.js`
- Create: `frontend/src/features/pulse/explore/useExploreInsights.js`
- Create: `frontend/src/features/pulse/explore/useImportYetiRefresh.js`

TanStack Query wrappers.

- [ ] **Step 1: Implement `useExploreAccounts`**

```js
// frontend/src/features/pulse/explore/useExploreAccounts.js
import { useQuery } from '@tanstack/react-query';
import { fetchExploreAccounts } from '@/api/pulse-explore';

export function useExploreAccounts(filters, viewport) {
  return useQuery({
    queryKey: ['pulse-explore', filters, viewport],
    queryFn: () => fetchExploreAccounts({ filters, viewport }),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
}
```

- [ ] **Step 2: Implement `useExploreInsights`**

Derived client-side from the same `pulse-explore` response. v1 doesn't need a separate edge fn — Overview aggregates run cheaply on the already-fetched rows.

```js
// frontend/src/features/pulse/explore/useExploreInsights.js
import { useMemo } from 'react';

export function useExploreInsights(rows) {
  return useMemo(() => {
    if (!rows?.length) return null;
    const total = rows.length;
    const totalTeu = rows.reduce((a, r) => a + (r.teu ?? 0), 0);
    const totalShipments = rows.reduce((a, r) => a + (r.shipments ?? 0), 0);
    const avgOpp = rows.reduce((a, r) => a + (r.opportunity_composite_score ?? 0), 0) / total;

    const topBy = (key, n = 5) => {
      const counts = new Map();
      for (const r of rows) {
        const v = r[key]; if (!v) continue;
        counts.set(v, (counts.get(v) ?? 0) + 1);
      }
      return [...counts.entries()]
        .sort((a, b) => b[1] - a[1]).slice(0, n)
        .map(([label, count]) => ({ label, count, pct: count / total }));
    };

    return {
      total,
      totalTeu,
      totalShipments,
      avgOpp,
      topIndustries: topBy('industry'),
      topCountries: topBy('country'),
      topMetros: topBy('city'),
    };
  }, [rows]);
}
```

- [ ] **Step 3: Implement `useImportYetiRefresh`**

```js
// frontend/src/features/pulse/explore/useImportYetiRefresh.js
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';

async function refresh(companyId, { force = false } = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  const r = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/importyeti-proxy`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${session?.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ company_id: companyId, force }),
  });
  const body = await r.json();
  if (!r.ok || !body.ok) {
    if (body.error === 'quota_exceeded') {
      throw new Error(`Daily refresh limit reached (${body.used} of ${body.cap}).`);
    }
    throw new Error(body.error || `refresh ${r.status}`);
  }
  return body;
}

export function useImportYetiRefresh() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ companyId, force }) => refresh(companyId, { force }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pulse-explore'] });
      toast.success('Refreshed from ImportYeti');
    },
    onError: (e) => toast.error(e.message),
  });
}
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/features/pulse/explore/useExploreAccounts.js \
        frontend/src/features/pulse/explore/useExploreInsights.js \
        frontend/src/features/pulse/explore/useImportYetiRefresh.js
git commit -m "feat(pulse-explore): data hooks (accounts, insights, refresh)"
```

---

### Task 18: `ExploreMap` component (Leaflet + supercluster)

**Files:**
- Create: `frontend/src/features/pulse/explore/ExploreMap.jsx`

- [ ] **Step 1: Implement**

```jsx
// frontend/src/features/pulse/explore/ExploreMap.jsx
// Leaflet bubble map with supercluster for low-zoom aggregation.

import { useMemo, useRef, useEffect, useState, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import Supercluster from 'supercluster';
import { lookupCoords } from './coordLookup';
import { industryColor, workflowColor, opportunityColor } from './bubblePalettes';
import 'leaflet/dist/leaflet.css';

const US_CENTER = [39.5, -98.35];
const DEFAULT_ZOOM = 4;

function sizeFor(row, mode, maxValue) {
  const v = mode === 'teu' ? row.teu
    : mode === 'shipments' ? row.shipments
    : mode === 'spend' ? row.value_usd
    : row.opportunity_composite_score;
  if (!v || !maxValue) return 6;
  const ratio = Math.log10(v + 1) / Math.log10(maxValue + 1);
  return Math.max(6, Math.min(28, 6 + ratio * 22));
}

function colorFor(row, mode) {
  if (mode === 'opportunity') return opportunityColor(row.opportunity_composite_score);
  if (mode === 'workflow') return workflowColor(row._workflow_state ?? 'unsaved');
  return industryColor(row.industry);
}

function borderFor(row) {
  const chip = row.freshness?.chip;
  if (chip === 'live') return 'solid 2px white';
  if (chip === 'saved') return 'dashed 2px white';
  return 'none';
}

function bubbleIcon(row, mode, sizeMode, maxValue, isSelected) {
  const size = sizeFor(row, sizeMode, maxValue);
  const color = colorFor(row, mode);
  return L.divIcon({
    className: 'pulse-bubble',
    iconSize: [size, size],
    html: `<div style="
      width:${size}px;height:${size}px;border-radius:50%;
      background:${color};border:${borderFor(row)};
      box-shadow:${isSelected ? '0 0 0 2px #06B6D4' : 'none'};
      opacity:0.85;
    "></div>`,
  });
}

function ZoomListener({ onZoom }) {
  useMapEvents({ zoomend: (e) => onZoom(e.target.getZoom()) });
  return null;
}

export default function ExploreMap({ rows, colorMode, sizeMode, selection, onBubbleClick }) {
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);

  const points = useMemo(() => {
    return rows
      .map((r) => {
        const c = lookupCoords({ city: r.city, state: r.state, country: r.country });
        if (!c) return null;
        return { type: 'Feature', geometry: { type: 'Point', coordinates: [c.lng, c.lat] }, properties: { row: r } };
      })
      .filter(Boolean);
  }, [rows]);

  const cluster = useMemo(() => {
    const s = new Supercluster({ radius: 60, maxZoom: 8 });
    s.load(points);
    return s;
  }, [points]);

  const maxValue = useMemo(() => {
    const key = sizeMode === 'teu' ? 'teu'
      : sizeMode === 'shipments' ? 'shipments'
      : sizeMode === 'spend' ? 'value_usd'
      : 'opportunity_composite_score';
    return rows.reduce((a, r) => Math.max(a, r[key] ?? 0), 0);
  }, [rows, sizeMode]);

  const selSet = useMemo(() => new Set(selection ?? []), [selection]);

  // Use viewport bbox to ask supercluster for clusters/leaves.
  const [bbox, setBbox] = useState([-130, 20, -65, 50]);

  const items = useMemo(() => {
    return cluster.getClusters(bbox, zoom);
  }, [cluster, bbox, zoom]);

  return (
    <MapContainer center={US_CENTER} zoom={DEFAULT_ZOOM} style={{ height: '100%', width: '100%' }}>
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png"
        attribution='&copy; OpenStreetMap &copy; CARTO'
      />
      <ZoomListener onZoom={setZoom} />
      <BboxTracker onBbox={setBbox} />
      {items.map((it) => {
        const [lng, lat] = it.geometry.coordinates;
        if (it.properties.cluster) {
          return (
            <Marker
              key={`c-${it.properties.cluster_id}`}
              position={[lat, lng]}
              icon={clusterIcon(it.properties.point_count)}
            />
          );
        }
        const row = it.properties.row;
        return (
          <Marker
            key={row.id}
            position={[lat, lng]}
            icon={bubbleIcon(row, colorMode, sizeMode, maxValue, selSet.has(row.id))}
            eventHandlers={{ click: () => onBubbleClick?.(row) }}
          />
        );
      })}
    </MapContainer>
  );
}

function BboxTracker({ onBbox }) {
  const map = useMap();
  useEffect(() => {
    const update = () => {
      const b = map.getBounds();
      onBbox([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()]);
    };
    update();
    map.on('moveend', update);
    return () => { map.off('moveend', update); };
  }, [map, onBbox]);
  return null;
}

function clusterIcon(count) {
  const size = 28 + Math.min(28, Math.log10(count) * 12);
  return L.divIcon({
    className: 'pulse-cluster',
    iconSize: [size, size],
    html: `<div style="
      width:${size}px;height:${size}px;border-radius:50%;
      background:rgba(6,182,212,0.85);color:#fff;
      display:flex;align-items:center;justify-content:center;
      font-weight:600;font-size:12px;
      box-shadow:0 0 0 4px rgba(6,182,212,0.2);
    ">${count}</div>`,
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/features/pulse/explore/ExploreMap.jsx
git commit -m "feat(pulse-explore): ExploreMap — Leaflet + supercluster bubble/cluster layer"
```

---

### Task 19: `ColorModeToggle`, `SizeModeToggle`, `FilterChipRow`, `SelectionBar`

**Files:**
- Create: `frontend/src/features/pulse/explore/ColorModeToggle.jsx`
- Create: `frontend/src/features/pulse/explore/SizeModeToggle.jsx`
- Create: `frontend/src/features/pulse/explore/FilterChipRow.jsx`
- Create: `frontend/src/features/pulse/explore/SelectionBar.jsx`

Small isolated UI components.

- [ ] **Step 1: `ColorModeToggle.jsx`**

```jsx
// frontend/src/features/pulse/explore/ColorModeToggle.jsx
const MODES = [
  { id: 'industry', label: 'Industry' },
  { id: 'opportunity', label: 'Opportunity' },
  { id: 'workflow', label: 'Workflow' },
];

export default function ColorModeToggle({ value, onChange }) {
  return (
    <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 text-xs">
      {MODES.map((m) => (
        <button
          key={m.id}
          type="button"
          onClick={() => onChange(m.id)}
          className={`px-2.5 py-1.5 rounded-md transition ${
            value === m.id ? 'bg-slate-900 text-white' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: `SizeModeToggle.jsx`**

```jsx
// frontend/src/features/pulse/explore/SizeModeToggle.jsx
const MODES = [
  { id: 'teu', label: 'TEU' },
  { id: 'shipments', label: 'Shipments' },
  { id: 'spend', label: 'Spend' },
  { id: 'opportunity', label: 'Opp. Score' },
];

export default function SizeModeToggle({ value, onChange }) {
  return (
    <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 text-xs">
      {MODES.map((m) => (
        <button
          key={m.id}
          type="button"
          onClick={() => onChange(m.id)}
          className={`px-2.5 py-1.5 rounded-md transition ${
            value === m.id ? 'bg-slate-900 text-white' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: `FilterChipRow.jsx`**

```jsx
// frontend/src/features/pulse/explore/FilterChipRow.jsx
// Renders active filter chips with remove buttons + a "Clear all" link.

import { X } from 'lucide-react';
import { REGION_LABELS } from './regionPresets';

function chipLabel(category, value) {
  if (category === 'geo.region') return REGION_LABELS[value] ?? value;
  return value;
}

function flattenFilters(filters) {
  const chips = [];
  if (filters.industry?.length) {
    for (const v of filters.industry) chips.push({ category: 'industry', value: v, label: v });
  }
  if (filters.geo?.region) {
    chips.push({ category: 'geo.region', value: filters.geo.region, label: chipLabel('geo.region', filters.geo.region) });
  }
  if (filters.geo?.states?.length && !filters.geo?.region) {
    chips.push({ category: 'geo.states', value: filters.geo.states.join(','), label: `${filters.geo.states.length} states` });
  }
  if (filters.geo?.countries?.length) {
    chips.push({ category: 'geo.countries', value: filters.geo.countries.join(','), label: filters.geo.countries.join(', ') });
  }
  if (filters.opportunity_types?.length) {
    for (const v of filters.opportunity_types) chips.push({ category: 'opportunity_types', value: v, label: `Opp: ${v}` });
  }
  if (filters.freshness_state?.length) {
    for (const v of filters.freshness_state) chips.push({ category: 'freshness_state', value: v, label: `Freshness: ${v}` });
  }
  if (filters.dataset_filter && filters.dataset_filter !== 'all') {
    chips.push({ category: 'dataset_filter', value: filters.dataset_filter, label: filters.dataset_filter });
  }
  return chips;
}

function removeChip(filters, chip) {
  const next = { ...filters, geo: { ...(filters.geo || {}) } };
  if (chip.category === 'industry') {
    next.industry = (next.industry ?? []).filter((v) => v !== chip.value);
  } else if (chip.category === 'geo.region') {
    delete next.geo.region;
    delete next.geo.states;
  } else if (chip.category === 'geo.states') {
    delete next.geo.states;
  } else if (chip.category === 'geo.countries') {
    delete next.geo.countries;
  } else if (chip.category === 'opportunity_types') {
    next.opportunity_types = (next.opportunity_types ?? []).filter((v) => v !== chip.value);
  } else if (chip.category === 'freshness_state') {
    next.freshness_state = (next.freshness_state ?? []).filter((v) => v !== chip.value);
  } else if (chip.category === 'dataset_filter') {
    next.dataset_filter = 'all';
  }
  return next;
}

export default function FilterChipRow({ filters, onChange }) {
  const chips = flattenFilters(filters);
  if (!chips.length) return null;
  return (
    <div className="flex flex-wrap gap-2 items-center">
      {chips.map((c, i) => (
        <span
          key={`${c.category}:${c.value}:${i}`}
          className="inline-flex items-center gap-1 rounded-full bg-slate-100 text-slate-700 px-2.5 py-1 text-xs"
        >
          {c.label}
          <button
            type="button"
            className="ml-0.5 hover:text-slate-900"
            onClick={() => onChange(removeChip(filters, c))}
            aria-label={`Remove ${c.label}`}
          >
            <X size={12} />
          </button>
        </span>
      ))}
      <button
        type="button"
        className="text-xs text-slate-500 hover:text-slate-900 underline-offset-2 hover:underline"
        onClick={() => onChange({})}
      >
        Clear all
      </button>
    </div>
  );
}
```

- [ ] **Step 4: `SelectionBar.jsx`**

```jsx
// frontend/src/features/pulse/explore/SelectionBar.jsx
import { Download, FolderPlus, Bookmark, RefreshCw, Send } from 'lucide-react';

export default function SelectionBar({
  selectionCount,
  onExport,
  onSaveToList,
  onSaveAsView,
  onBulkRefresh,
  onAddToCampaign,
}) {
  if (!selectionCount) return null;
  return (
    <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
      <span className="font-medium text-slate-700">{selectionCount} selected</span>
      <span className="h-4 w-px bg-slate-200" />
      <BarBtn icon={<FolderPlus size={14} />} label="Save to list" onClick={onSaveToList} />
      <BarBtn icon={<Bookmark size={14} />} label="Save view" onClick={onSaveAsView} />
      <BarBtn icon={<Send size={14} />} label="Add to campaign" onClick={onAddToCampaign} />
      <BarBtn icon={<RefreshCw size={14} />} label="Bulk refresh" onClick={onBulkRefresh} />
      <BarBtn icon={<Download size={14} />} label="Export CSV" onClick={onExport} />
    </div>
  );
}

function BarBtn({ icon, label, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-slate-600 hover:bg-slate-100 hover:text-slate-900"
    >
      {icon}{label}
    </button>
  );
}
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/pulse/explore/ColorModeToggle.jsx \
        frontend/src/features/pulse/explore/SizeModeToggle.jsx \
        frontend/src/features/pulse/explore/FilterChipRow.jsx \
        frontend/src/features/pulse/explore/SelectionBar.jsx
git commit -m "feat(pulse-explore): toolbar widgets — color/size toggles, filter chips, selection bar"
```

---

### Task 20: `ExploreToolbar` (composes the toolbar widgets)

**Files:**
- Create: `frontend/src/features/pulse/explore/ExploreToolbar.jsx`

- [ ] **Step 1: Implement**

```jsx
// frontend/src/features/pulse/explore/ExploreToolbar.jsx
import { Search } from 'lucide-react';
import ColorModeToggle from './ColorModeToggle';
import SizeModeToggle from './SizeModeToggle';
import FilterChipRow from './FilterChipRow';
import SelectionBar from './SelectionBar';

export default function ExploreToolbar({
  query, onQuery, onSubmit,
  filters, onFiltersChange,
  color, onColor,
  size, onSize,
  selectionCount, selectionActions,
}) {
  return (
    <div className="flex flex-col gap-3 border-b border-slate-200 bg-white/80 backdrop-blur px-4 py-3">
      <form onSubmit={(e) => { e.preventDefault(); onSubmit?.(); }} className="flex items-center gap-2">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input
            type="text"
            value={query ?? ''}
            onChange={(e) => onQuery(e.target.value)}
            placeholder='Try "vulnerable incumbents in the southeast"'
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 focus:border-slate-400 focus:outline-none text-sm"
          />
        </div>
        <ColorModeToggle value={color} onChange={onColor} />
        <SizeModeToggle value={size} onChange={onSize} />
      </form>
      <div className="flex items-center gap-3">
        <FilterChipRow filters={filters} onChange={onFiltersChange} />
        <div className="ml-auto"><SelectionBar selectionCount={selectionCount} {...selectionActions} /></div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/features/pulse/explore/ExploreToolbar.jsx
git commit -m "feat(pulse-explore): ExploreToolbar composition"
```

---

### Task 21: `TopInsightsRail` (left rail — Overview tab only)

**Files:**
- Create: `frontend/src/features/pulse/explore/TopInsightsRail.jsx`

- [ ] **Step 1: Implement**

```jsx
// frontend/src/features/pulse/explore/TopInsightsRail.jsx
import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

function fmtNum(n) {
  if (n == null) return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toLocaleString();
}

export default function TopInsightsRail({ insights }) {
  const [open, setOpen] = useState(true);
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="self-start h-10 w-6 border-r border-slate-200 bg-white flex items-center justify-center hover:bg-slate-50"
        aria-label="Open insights"
      >
        <ChevronRight size={16} />
      </button>
    );
  }
  if (!insights) {
    return (
      <aside className="w-72 shrink-0 border-r border-slate-200 bg-white p-4 text-sm text-slate-500">
        No data in current view.
      </aside>
    );
  }
  return (
    <aside className="w-72 shrink-0 border-r border-slate-200 bg-white">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
        <h2 className="font-semibold text-slate-900 text-sm">Top Insights</h2>
        <button type="button" onClick={() => setOpen(false)} aria-label="Close insights">
          <ChevronLeft size={16} />
        </button>
      </div>
      <div className="px-4 py-3 space-y-4 overflow-auto" style={{ maxHeight: 'calc(100vh - 200px)' }}>
        <section>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <Kpi label="Accounts" value={fmtNum(insights.total)} />
            <Kpi label="Avg Opp" value={insights.avgOpp.toFixed(0)} />
            <Kpi label="TEU 12m" value={fmtNum(insights.totalTeu)} />
            <Kpi label="Shipments 12m" value={fmtNum(insights.totalShipments)} />
          </div>
        </section>
        <TopList title="Top industries" items={insights.topIndustries} />
        <TopList title="Top countries" items={insights.topCountries} />
        <TopList title="Top metros" items={insights.topMetros} />
      </div>
    </aside>
  );
}

function Kpi({ label, value }) {
  return (
    <div className="rounded-md border border-slate-100 p-2">
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className="font-semibold text-slate-900">{value}</div>
    </div>
  );
}

function TopList({ title, items }) {
  if (!items?.length) return null;
  return (
    <section>
      <div className="text-xs font-medium text-slate-700 mb-2">{title}</div>
      <ul className="space-y-1">
        {items.map((it) => (
          <li key={it.label} className="flex items-center justify-between text-xs text-slate-600">
            <span className="truncate">{it.label}</span>
            <span className="ml-2 text-slate-400">{(it.pct * 100).toFixed(0)}%</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/features/pulse/explore/TopInsightsRail.jsx
git commit -m "feat(pulse-explore): TopInsightsRail (Overview tab v1)"
```

---

### Task 22: `ExploreAccountTable` (virtualized)

**Files:**
- Create: `frontend/src/features/pulse/explore/ExploreAccountTable.jsx`

- [ ] **Step 1: Implement**

```jsx
// frontend/src/features/pulse/explore/ExploreAccountTable.jsx
import { AutoSizer, List } from 'react-virtualized';
import { CheckSquare, Square } from 'lucide-react';
import 'react-virtualized/styles.css';

const ROW_HEIGHT = 44;

function FreshnessChip({ chip }) {
  const map = {
    live: ['bg-emerald-50 text-emerald-700', 'Live'],
    saved: ['bg-amber-50 text-amber-700', 'Saved'],
    directory: ['bg-slate-100 text-slate-600', 'Directory'],
  };
  const [klass, label] = map[chip] ?? map.directory;
  return <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${klass}`}>{label}</span>;
}

export default function ExploreAccountTable({ rows, selection, onToggle, onRowClick }) {
  const selSet = new Set(selection ?? []);
  const renderRow = ({ index, key, style }) => {
    const row = rows[index];
    const checked = selSet.has(row.id);
    return (
      <div
        key={key}
        style={style}
        className="flex items-center gap-3 border-b border-slate-100 px-3 hover:bg-slate-50 cursor-pointer"
        onClick={() => onRowClick?.(row)}
      >
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onToggle?.(row.id); }}
          className="text-slate-500"
          aria-label={checked ? 'Deselect' : 'Select'}
        >
          {checked ? <CheckSquare size={14} className="text-cyan-600" /> : <Square size={14} />}
        </button>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-slate-900 truncate">{row.company_name}</div>
          <div className="text-xs text-slate-500 truncate">
            {[row.city, row.state, row.country].filter(Boolean).join(', ')} · {row.industry ?? '—'}
          </div>
        </div>
        <div className="text-xs tabular-nums text-slate-600">{(row.teu ?? 0).toLocaleString()} TEU</div>
        <div className="text-xs tabular-nums text-slate-600">
          {(row.opportunity_composite_score ?? 0).toFixed(0)} Opp
        </div>
        <FreshnessChip chip={row.freshness?.chip} />
      </div>
    );
  };
  return (
    <div className="flex-1 min-h-0">
      <AutoSizer>
        {({ height, width }) => (
          <List
            height={height}
            width={width}
            rowCount={rows.length}
            rowHeight={ROW_HEIGHT}
            rowRenderer={renderRow}
          />
        )}
      </AutoSizer>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/features/pulse/explore/ExploreAccountTable.jsx
git commit -m "feat(pulse-explore): virtualized account table"
```

---

### Task 23: Re-skin `PulseQuickCard` — freshness chip + opportunity chips + new actions

**Files:**
- Modify: `frontend/src/features/pulse/PulseQuickCard.jsx`

The card already exists. Add: freshness chip in header, opportunity chips in a new section, Refresh button in the action row, Open in Command Center route action.

- [ ] **Step 1: Read the existing component to find the right insertion points**

```bash
cd frontend && grep -n "Actions\|Identity\|Key signals" src/features/pulse/PulseQuickCard.jsx | head -20
```

Identify the JSX block for the Identity header and the Actions section. Note line numbers — you'll add the freshness chip into the Identity block and the new actions into the Actions block.

- [ ] **Step 2: Add a `FreshnessChip` helper at the top of the component file (after imports)**

```jsx
function FreshnessChip({ freshness }) {
  if (!freshness) return null;
  const { chip, age_hours } = freshness;
  const ageLabel = age_hours == null
    ? 'never refreshed'
    : age_hours < 24 ? `${Math.round(age_hours)}h ago`
    : `${Math.round(age_hours / 24)}d ago`;
  const styles = {
    live: 'bg-emerald-50 text-emerald-700',
    saved: 'bg-amber-50 text-amber-700',
    directory: 'bg-slate-100 text-slate-600',
  };
  const label = chip === 'live' ? 'Live' : chip === 'saved' ? 'Saved' : 'Directory';
  return (
    <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${styles[chip] ?? styles.directory}`}>
      {label} · {ageLabel}
    </span>
  );
}
```

- [ ] **Step 3: Render `<FreshnessChip />` inside the Identity header block**

Place it next to the company name + domain.

- [ ] **Step 4: Add the Opportunity chip section**

After Identity, before "Key signals":

```jsx
{(row.opportunity_composite_score > 0) && (
  <section className="px-5 py-3 border-b border-slate-100">
    <div className="text-[10px] uppercase tracking-wide text-slate-500 mb-1.5">Opportunities</div>
    <div className="flex flex-wrap gap-1.5">
      {topOpportunities(row).map((o) => (
        <span key={o.type} className={`px-2 py-0.5 rounded text-[11px] font-medium ${opportunityChipClass(o.type)}`}>
          {opportunityLabel(o.type)} · {o.score.toFixed(0)}
        </span>
      ))}
    </div>
  </section>
)}
```

Add helpers in the same file:

```jsx
function topOpportunities(r) {
  return [
    { type: 'vulnerable', score: r.opportunity_vulnerable_score ?? 0 },
    { type: 'consolidation', score: r.opportunity_consolidation_score ?? 0 },
    { type: 'velocity', score: r.opportunity_velocity_score ?? 0 },
    { type: 'defend', score: r.opportunity_defend_score ?? 0 },
  ].filter((o) => o.score > 0).sort((a, b) => b.score - a.score).slice(0, 2);
}

function opportunityLabel(t) {
  return ({
    vulnerable: 'Vulnerable incumbent',
    consolidation: 'Consolidation',
    velocity: 'High-velocity',
    defend: 'Defend & grow',
  })[t] ?? t;
}

function opportunityChipClass(t) {
  return ({
    vulnerable: 'bg-red-50 text-red-700',
    consolidation: 'bg-amber-50 text-amber-700',
    velocity: 'bg-emerald-50 text-emerald-700',
    defend: 'bg-cyan-50 text-cyan-700',
  })[t] ?? 'bg-slate-100 text-slate-700';
}
```

- [ ] **Step 5: Add Refresh + Open-in-Command-Center actions**

In the Actions block, replace or augment the existing "Open in Search" button:

```jsx
<button
  type="button"
  onClick={() => navigate(`/app/companies/${row.id}?tab=overview`)}
  className="..."
>
  Open in Command Center →
</button>
<button
  type="button"
  onClick={() => refresh.mutate({ companyId: row.id })}
  disabled={refresh.isPending || (row.freshness?.chip === 'live' && (row.freshness?.age_hours ?? 99) < 24)}
  className="..."
  title={row.freshness?.chip === 'live' ? 'Cached — fresh' : 'Refresh from ImportYeti'}
>
  <RefreshCw size={14} /> Refresh
</button>
```

Wire `refresh = useImportYetiRefresh()` and `navigate = useNavigate()` near the top of the component.

- [ ] **Step 6: Verify build**

```bash
cd frontend && npm run build
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/features/pulse/PulseQuickCard.jsx
git commit -m "feat(pulse-quick-card): freshness chip, opportunity chips, refresh + CC actions"
```

---

### Task 24: `PulseExploreTab` — assemble everything

**Files:**
- Create: `frontend/src/features/pulse/explore/PulseExploreTab.jsx`

- [ ] **Step 1: Implement**

```jsx
// frontend/src/features/pulse/explore/PulseExploreTab.jsx
import { useState, useCallback } from 'react';
import { useExploreState } from './useExploreState';
import { useExploreAccounts } from './useExploreAccounts';
import { useExploreInsights } from './useExploreInsights';
import ExploreToolbar from './ExploreToolbar';
import TopInsightsRail from './TopInsightsRail';
import ExploreMap from './ExploreMap';
import ExploreAccountTable from './ExploreAccountTable';
import PulseQuickCard from '@/features/pulse/PulseQuickCard';

export default function PulseExploreTab() {
  const { state, setFilters, setColor, setSize, setSelection } = useExploreState();
  const [query, setQuery] = useState('');
  const [activeRow, setActiveRow] = useState(null);
  const { data, isLoading, error } = useExploreAccounts(state.filters, null);
  const rows = data?.rows ?? [];
  const insights = useExploreInsights(rows);

  const toggleSelection = useCallback((id) => {
    const cur = new Set(state.selection ?? []);
    if (cur.has(id)) cur.delete(id); else cur.add(id);
    setSelection(Array.from(cur));
  }, [state.selection, setSelection]);

  const selectionActions = {
    onExport: () => { /* Phase 3 */ },
    onSaveToList: () => { /* opens AddToListPicker; wired in Phase 3 polish */ },
    onSaveAsView: () => { /* opens save-as-view modal; wired in Phase 3 polish */ },
    onBulkRefresh: () => { /* Phase 3 */ },
    onAddToCampaign: () => { /* opens AddToCampaignModal; wired in Phase 3 polish */ },
  };

  return (
    <div className="flex flex-col h-full">
      <ExploreToolbar
        query={query} onQuery={setQuery}
        onSubmit={() => { /* NL parse wires in Phase 3 */ }}
        filters={state.filters} onFiltersChange={setFilters}
        color={state.color} onColor={setColor}
        size={state.size} onSize={setSize}
        selectionCount={(state.selection ?? []).length}
        selectionActions={selectionActions}
      />
      <div className="flex flex-1 min-h-0">
        <TopInsightsRail insights={insights} />
        <div className="flex-1 min-w-0 min-h-0 relative">
          {isLoading && <div className="absolute inset-0 grid place-items-center bg-white/60 text-slate-500 text-sm z-10">Loading…</div>}
          {error && <div className="absolute inset-0 grid place-items-center text-red-600 text-sm z-10">Failed to load: {String(error.message)}</div>}
          <div className="h-1/2 border-b border-slate-200">
            <ExploreMap
              rows={rows}
              colorMode={state.color}
              sizeMode={state.size}
              selection={state.selection}
              onBubbleClick={setActiveRow}
            />
          </div>
          <div className="h-1/2 flex flex-col">
            <ExploreAccountTable
              rows={rows}
              selection={state.selection}
              onToggle={toggleSelection}
              onRowClick={setActiveRow}
            />
          </div>
        </div>
        {activeRow && (
          <div className="w-[420px] shrink-0 border-l border-slate-200 bg-white">
            <PulseQuickCard
              row={activeRow}
              onClose={() => setActiveRow(null)}
            />
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/features/pulse/explore/PulseExploreTab.jsx
git commit -m "feat(pulse-explore): PulseExploreTab assembly"
```

---

### Task 25: `PulseTabs` wrapper + integrate into `Pulse.jsx`

**Files:**
- Create: `frontend/src/features/pulse/explore/PulseTabs.jsx`
- Modify: `frontend/src/pages/Pulse.jsx`

- [ ] **Step 1: Write `PulseTabs.jsx`**

```jsx
// frontend/src/features/pulse/explore/PulseTabs.jsx
import { useSearchParams } from 'react-router-dom';
import { Compass, Search } from 'lucide-react';

export default function PulseTabs({ children, exploreEnabled }) {
  const [sp, setSp] = useSearchParams();
  const tab = sp.get('tab') === 'explore' ? 'explore' : 'search';
  const setTab = (t) => {
    setSp((prev) => {
      const next = new URLSearchParams(prev);
      if (t === 'search') next.delete('tab'); else next.set('tab', t);
      return next;
    }, { replace: true });
  };
  return (
    <div className="flex flex-col h-full">
      <div className="border-b border-slate-200 bg-white px-4 pt-3">
        <div className="flex gap-1">
          <Tab active={tab === 'search'} onClick={() => setTab('search')} icon={<Search size={14} />}>Search</Tab>
          {exploreEnabled && (
            <Tab active={tab === 'explore'} onClick={() => setTab('explore')} icon={<Compass size={14} />}>Explore</Tab>
          )}
        </div>
      </div>
      <div className="flex-1 min-h-0">
        {typeof children === 'function' ? children({ tab }) : children}
      </div>
    </div>
  );
}

function Tab({ active, onClick, icon, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-3 py-2 text-sm border-b-2 transition ${
        active ? 'border-slate-900 text-slate-900 font-medium' : 'border-transparent text-slate-500 hover:text-slate-900'
      }`}
    >
      {icon}{children}
    </button>
  );
}
```

- [ ] **Step 2: Wrap `Pulse.jsx`**

Open `frontend/src/pages/Pulse.jsx`. Wrap the existing return body in `<PulseTabs>` and render the appropriate tab. Until Phase 4 the flag is hardcoded `true` for dev; Phase 4 plumbs it from entitlements.

```jsx
// At top of Pulse.jsx imports
import PulseTabs from '@/features/pulse/explore/PulseTabs';
import PulseExploreTab from '@/features/pulse/explore/PulseExploreTab';

// Then inside the component body — wrap the entire existing return:
export default function PulsePage() {
  // ... existing logic ...
  const exploreEnabled = true; // TODO Phase 4: from useEntitlements()

  return (
    <PulseTabs exploreEnabled={exploreEnabled}>
      {({ tab }) => (
        tab === 'explore' ? <PulseExploreTab />
        : <PulseSearchBody {...existingProps} />  // wrap existing JSX as PulseSearchBody
      )}
    </PulseTabs>
  );
}

// PulseSearchBody = the existing search UI extracted into a sub-component
// (Identify the existing JSX block returned by PulsePage today and extract
//  it. Keep all hooks at the top-level of PulsePage so they don't move.)
```

> Implementation note: extracting the search body cleanly may require some refactor. If extracting becomes thorny, the simpler alternative is to keep the existing search JSX inline and gate the explore JSX with a sibling conditional — both versions are equivalent, pick whichever yields the smaller diff.

- [ ] **Step 3: Run dev server + smoke-test both tabs**

```bash
cd frontend && npm run dev
```

Open `http://localhost:5173/app/pulse`. Click Explore tab. Expect the map + insights rail + table to render with data from the preview-deployed `pulse-explore`. Click Search tab. Expect the existing search experience unchanged.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/features/pulse/explore/PulseTabs.jsx frontend/src/pages/Pulse.jsx
git commit -m "feat(pulse): wrap page in PulseTabs (Search | Explore)"
```

---

# Phase 3 — NL search taxonomy + polish + CSV export

Goal: extend the NL parser so chips light up from a query, ship the polish items (CSV export, bulk refresh modal, heat overlay, save-to-list / save-as-view modals).

---

### Task 26: Extend `pulse-search` parser taxonomy

**Files:**
- Modify: `supabase/functions/pulse-search/index.ts`

- [ ] **Step 1: Open `supabase/functions/pulse-search/index.ts` and locate `ParsedIntent`**

It's around line 48 per session recon. Extend it with the new fields.

- [ ] **Step 2: Extend `ParsedIntent`**

```ts
type ParsedIntent = {
  raw_query: string;
  intent: "find_companies" | "find_contacts" | "ask_question";
  audience_type: string[];
  industry_terms: string[];
  service_terms: string[];
  geo: {
    region: string | null;
    states: string[];
    metros: string[];
    cities: string[];
    postal_codes: string[];
    countries: string[];
    ports: string[];
  };
  size: { /* unchanged */ };
  shipment_filters: { /* unchanged */ } | null;
  trade_filters: { /* unchanged */ };
  // NEW for Pulse Explorer:
  opportunity_types: ("consolidation" | "vulnerable" | "velocity" | "defend")[];
  freshness_state: ("live" | "saved" | "directory" | "stale")[];
  workflow_state: string[];
  dataset_filter: "directory_only" | "live_only" | "all";
};
```

- [ ] **Step 3: Add a validator that drops unknown enum values**

Add near the top of the file:

```ts
const VALID_OPPORTUNITY = new Set(["consolidation", "vulnerable", "velocity", "defend"]);
const VALID_FRESHNESS = new Set(["live", "saved", "directory", "stale"]);
const VALID_DATASET = new Set(["directory_only", "live_only", "all"]);

function sanitizeParsed(p: any): ParsedIntent {
  return {
    ...p,
    opportunity_types: (p.opportunity_types ?? []).filter((v: string) => VALID_OPPORTUNITY.has(v)),
    freshness_state: (p.freshness_state ?? []).filter((v: string) => VALID_FRESHNESS.has(v)),
    workflow_state: p.workflow_state ?? [],
    dataset_filter: VALID_DATASET.has(p.dataset_filter) ? p.dataset_filter : "all",
  };
}
```

Call `sanitizeParsed` on the LLM output before using it.

- [ ] **Step 4: Update the LLM prompt with new taxonomy examples**

Find the system prompt for the parser (likely in a constant string near the parse function). Append a TAXONOMY EXAMPLES block:

```
TAXONOMY EXAMPLES (pulse-explorer):
- "vulnerable incumbents in the southeast" → opportunity_types: ["vulnerable"], geo.region: "southeast"
- "consolidation candidates with multiple forwarders" → opportunity_types: ["consolidation"]
- "high-velocity manufacturers" → opportunity_types: ["velocity"], industry_terms: ["Manufacturing"]
- "defend my book" / "my accounts" → opportunity_types: ["defend"]
- "stale data" / "needs refresh" → freshness_state: ["stale"]
- "live data only" → freshness_state: ["live"]
- "directory only" / "haven't been refreshed" → freshness_state: ["directory"]
- "in my campaigns" → workflow_state: ["in_campaign"]
- "meeting booked" → workflow_state: ["meeting_booked"]
- "live data only" → dataset_filter: "live_only"
- "directory only" / "from the seed list" → dataset_filter: "directory_only"
```

- [ ] **Step 5: Deploy + smoke-test**

```bash
supabase functions deploy pulse-search --project-ref <preview-ref>

curl -s -X POST "https://<preview>.functions.supabase.co/pulse-search" \
  -H "Authorization: Bearer YOUR_JWT" -H "Content-Type: application/json" \
  -d '{"query":"vulnerable incumbents in the southeast"}' \
  | jq '.parsed.opportunity_types, .parsed.geo.region'
```

Expected: `["vulnerable"]`, `"southeast"`.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/pulse-search/index.ts
git commit -m "feat(pulse-search): extend parser taxonomy for Explorer (opportunity, freshness, workflow, dataset)"
```

---

### Task 27: Wire NL search → filter chips on the Explore tab

**Files:**
- Modify: `frontend/src/features/pulse/explore/PulseExploreTab.jsx`
- Modify: `frontend/src/api/pulse-search.js` (if it needs to expose the new parsed fields)

- [ ] **Step 1: Verify `searchPulseV2` returns the parsed object**

Open `frontend/src/api/pulse-search.js`. Confirm the returned shape includes `parsed`. If parsed fields are typed (TS) tighten the types or remove them if untyped.

- [ ] **Step 2: Add `parsedToFilters` helper**

Create `frontend/src/features/pulse/explore/parsedToFilters.js`:

```js
// frontend/src/features/pulse/explore/parsedToFilters.js
// Convert pulse-search parsed intent → Explore filter object.

export function parsedToFilters(parsed) {
  if (!parsed) return {};
  return {
    industry: parsed.industry_terms ?? [],
    geo: {
      region: parsed.geo?.region ?? undefined,
      states: parsed.geo?.states ?? [],
      countries: parsed.geo?.countries ?? [],
    },
    size: {
      teu_min: parsed.shipment_filters?.teu_min ?? undefined,
      teu_max: parsed.shipment_filters?.teu_max ?? undefined,
    },
    opportunity_types: parsed.opportunity_types ?? [],
    freshness_state: parsed.freshness_state ?? [],
    workflow_state: parsed.workflow_state ?? [],
    dataset_filter: parsed.dataset_filter ?? 'all',
  };
}
```

- [ ] **Step 3: Wire `onSubmit` in `PulseExploreTab.jsx`**

```jsx
import { searchPulseV2 } from '@/api/pulse-search';
import { parsedToFilters } from './parsedToFilters';

// In the component:
const onSubmit = async () => {
  if (!query.trim()) return;
  const r = await searchPulseV2({ query, mode: 'parse_only' });
  setFilters(parsedToFilters(r.parsed));
};

// Pass to <ExploreToolbar onSubmit={onSubmit} />
```

If `searchPulseV2` doesn't support a `parse_only` mode, fall through using the existing call shape — we only consume the `parsed` field. Discard the rest.

- [ ] **Step 4: Smoke-test in dev**

Type "vulnerable incumbents in the southeast" → Enter. Expect: Opportunity chip "vulnerable" lights up, Geo chip "Southeast" lights up, map filters down.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/pulse/explore/parsedToFilters.js \
        frontend/src/features/pulse/explore/PulseExploreTab.jsx
git commit -m "feat(pulse-explore): NL query → filter chip wiring via parsedToFilters"
```

---

### Task 28: CSV export

**Files:**
- Create: `frontend/src/features/pulse/explore/exportCsv.js`
- Modify: `frontend/src/features/pulse/explore/PulseExploreTab.jsx` (wire `onExport`)

- [ ] **Step 1: Implement `exportCsv.js`**

```js
// frontend/src/features/pulse/explore/exportCsv.js

const COLUMNS = [
  { key: 'company_name', label: 'Company' },
  { key: 'canonical_domain', label: 'Domain' },
  { key: 'industry', label: 'Industry' },
  { key: 'vertical', label: 'Vertical' },
  { key: 'city', label: 'City' },
  { key: 'state', label: 'State' },
  { key: 'country', label: 'Country' },
  { key: 'employee_count', label: 'Employees' },
  { key: 'revenue', label: 'Revenue' },
  { key: 'teu', label: 'TEU 12m' },
  { key: 'shipments', label: 'Shipments 12m' },
  { key: 'value_usd', label: 'Spend 12m USD' },
  { key: 'gp_potential', label: 'GP Potential' },
  { key: 'opportunity_composite_score', label: 'Opp Composite' },
  { key: 'opportunity_consolidation_score', label: 'Opp Consolidation' },
  { key: 'opportunity_vulnerable_score', label: 'Opp Vulnerable' },
  { key: 'opportunity_velocity_score', label: 'Opp Velocity' },
  { key: 'opportunity_defend_score', label: 'Opp Defend' },
  { key: 'freshness_chip', label: 'Freshness' },
];

function escape(v) {
  if (v == null) return '';
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function rowsToCsv(rows) {
  const lines = [COLUMNS.map((c) => c.label).join(',')];
  for (const r of rows) {
    const flat = { ...r, freshness_chip: r.freshness?.chip ?? '' };
    lines.push(COLUMNS.map((c) => escape(flat[c.key])).join(','));
  }
  return lines.join('\n');
}

export function downloadCsv(rows, filename = 'pulse-explorer.csv') {
  const csv = rowsToCsv(rows);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
}
```

- [ ] **Step 2: Wire `onExport` in `PulseExploreTab.jsx`**

```jsx
import { downloadCsv } from './exportCsv';

const selectionActions = {
  onExport: () => {
    const sel = new Set(state.selection ?? []);
    const subset = sel.size > 0 ? rows.filter((r) => sel.has(r.id)) : rows;
    downloadCsv(subset, `pulse-explorer-${new Date().toISOString().slice(0,10)}.csv`);
  },
  // ... other handlers
};
```

- [ ] **Step 3: Smoke-test**

In dev: select 3 bubbles → Export CSV → open downloaded file. Expect: 3 rows + header.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/features/pulse/explore/exportCsv.js \
        frontend/src/features/pulse/explore/PulseExploreTab.jsx
git commit -m "feat(pulse-explore): CSV export of selection or filtered view"
```

---

### Task 29: Bulk refresh modal

**Files:**
- Create: `frontend/src/features/pulse/explore/BulkRefreshModal.jsx`
- Modify: `frontend/src/features/pulse/explore/PulseExploreTab.jsx`

- [ ] **Step 1: Implement modal**

```jsx
// frontend/src/features/pulse/explore/BulkRefreshModal.jsx
import { useState } from 'react';
import { useImportYetiRefresh } from './useImportYetiRefresh';

const MAX_BULK = 25;

export default function BulkRefreshModal({ open, onClose, rows }) {
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(0);
  const [failed, setFailed] = useState([]);
  const refresh = useImportYetiRefresh();
  if (!open) return null;
  const targets = rows.slice(0, MAX_BULK);
  const skipped = rows.length - targets.length;

  const run = async () => {
    setRunning(true);
    setDone(0);
    setFailed([]);
    // Parallel 5-at-a-time.
    const queue = [...targets];
    const worker = async () => {
      while (queue.length) {
        const r = queue.shift();
        try { await refresh.mutateAsync({ companyId: r.id, force: false }); setDone((n) => n + 1); }
        catch { setFailed((f) => [...f, r.id]); }
      }
    };
    await Promise.all(Array.from({ length: 5 }, worker));
    setRunning(false);
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/30">
      <div className="w-[400px] rounded-lg bg-white shadow-xl p-5">
        <h3 className="font-semibold text-slate-900">Bulk refresh</h3>
        <p className="text-sm text-slate-600 mt-1">
          Will refresh <strong>{targets.length}</strong> accounts from ImportYeti.
          {skipped > 0 && <> Skipping <strong>{skipped}</strong> (cap is {MAX_BULK}/run).</>}
        </p>
        <p className="text-xs text-slate-500 mt-2">
          Each refresh counts against your daily ImportYeti quota.
        </p>
        {running && (
          <div className="mt-3 text-xs text-slate-600">
            Done: {done}/{targets.length} · Failed: {failed.length}
          </div>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} disabled={running} className="px-3 py-1.5 rounded text-sm text-slate-600 hover:bg-slate-100">
            {running ? 'Running…' : 'Cancel'}
          </button>
          <button onClick={run} disabled={running} className="px-3 py-1.5 rounded bg-slate-900 text-white text-sm hover:bg-slate-700">
            Refresh
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Wire from `PulseExploreTab.jsx`**

```jsx
import BulkRefreshModal from './BulkRefreshModal';

// inside the component:
const [bulkOpen, setBulkOpen] = useState(false);
const selectedRows = rows.filter((r) => new Set(state.selection).has(r.id));

const selectionActions = {
  // ...
  onBulkRefresh: () => setBulkOpen(true),
};

// before closing JSX:
<BulkRefreshModal open={bulkOpen} onClose={() => setBulkOpen(false)} rows={selectedRows} />
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/pulse/explore/BulkRefreshModal.jsx \
        frontend/src/features/pulse/explore/PulseExploreTab.jsx
git commit -m "feat(pulse-explore): bulk refresh modal with 25-cap and credit reminder"
```

---

### Task 30: Save-to-list + Save-as-view modals (reuse `AddToListPicker`, new view modal)

**Files:**
- Modify: `frontend/src/features/pulse/explore/PulseExploreTab.jsx`
- Create: `frontend/src/features/pulse/explore/SaveAsViewModal.jsx`

- [ ] **Step 1: Implement `SaveAsViewModal.jsx`**

```jsx
// frontend/src/features/pulse/explore/SaveAsViewModal.jsx
import { useState } from 'react';
import { saveMapSelection } from '@/api/pulse-map-selections';
import { toast } from 'sonner';

export default function SaveAsViewModal({ open, onClose, state, mapCenter, mapZoom }) {
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  if (!open) return null;
  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      await saveMapSelection({
        name: name.trim(),
        filters: state.filters,
        selection_ids: state.selection,
        map_state: { center: mapCenter, zoom: mapZoom, color_mode: state.color, size_mode: state.size },
      });
      toast.success('View saved');
      onClose();
    } catch (e) {
      toast.error(e.message);
    } finally { setSaving(false); }
  };
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/30">
      <form onSubmit={submit} className="w-[360px] rounded-lg bg-white shadow-xl p-5">
        <h3 className="font-semibold text-slate-900">Save map view</h3>
        <p className="text-sm text-slate-600 mt-1">
          Saves the current filters, selection, and map zoom — not the companies themselves.
        </p>
        <input
          type="text" value={name} onChange={(e) => setName(e.target.value)}
          placeholder="View name" autoFocus
          className="mt-3 w-full px-3 py-2 rounded border border-slate-200 text-sm"
        />
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-3 py-1.5 rounded text-sm text-slate-600 hover:bg-slate-100">Cancel</button>
          <button type="submit" disabled={saving || !name.trim()} className="px-3 py-1.5 rounded bg-slate-900 text-white text-sm">
            {saving ? 'Saving…' : 'Save view'}
          </button>
        </div>
      </form>
    </div>
  );
}
```

- [ ] **Step 2: Wire it in `PulseExploreTab.jsx`**

```jsx
import SaveAsViewModal from './SaveAsViewModal';
import AddToListPicker from '@/features/pulse/AddToListPicker';

const [viewOpen, setViewOpen] = useState(false);
const [listOpen, setListOpen] = useState(false);

const selectionActions = {
  // ...
  onSaveToList: () => setListOpen(true),
  onSaveAsView: () => setViewOpen(true),
};

// JSX:
<SaveAsViewModal open={viewOpen} onClose={() => setViewOpen(false)} state={state} mapCenter={[39.5,-98.35]} mapZoom={4} />
{listOpen && (
  <AddToListPicker
    open={listOpen} onClose={() => setListOpen(false)}
    companyIds={state.selection}
    onAdded={() => { setListOpen(false); toast.success('Added to list'); }}
  />
)}
```

> The exact `AddToListPicker` API is what the existing component supports. Open `frontend/src/features/pulse/AddToListPicker.jsx` and confirm the prop names — adjust above call to match.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/pulse/explore/SaveAsViewModal.jsx \
        frontend/src/features/pulse/explore/PulseExploreTab.jsx
git commit -m "feat(pulse-explore): Save-to-list and Save-as-view modals"
```

---

### Task 31: Heat overlay toggle

**Files:**
- Create: `frontend/src/features/pulse/explore/HeatOverlayToggle.jsx`
- Modify: `frontend/src/features/pulse/explore/ExploreMap.jsx`
- Modify: `frontend/src/features/pulse/explore/PulseExploreTab.jsx`
- Modify: `frontend/package.json` (`leaflet.heat`)

- [ ] **Step 1: Install leaflet.heat**

```bash
cd frontend && npm install leaflet.heat@^0.2.0
```

- [ ] **Step 2: Toggle component**

```jsx
// frontend/src/features/pulse/explore/HeatOverlayToggle.jsx
import { Flame } from 'lucide-react';

export default function HeatOverlayToggle({ on, onChange }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      className={`inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs ${
        on ? 'bg-orange-100 text-orange-700' : 'text-slate-600 hover:bg-slate-100'
      }`}
    >
      <Flame size={14} /> Heat
    </button>
  );
}
```

- [ ] **Step 3: Add a `HeatLayer` to `ExploreMap`**

```jsx
import 'leaflet.heat';

function HeatLayer({ rows, sizeMode, on }) {
  const map = useMap();
  useEffect(() => {
    if (!on) return;
    const data = rows.map((r) => {
      const c = lookupCoords({ city: r.city, state: r.state, country: r.country });
      if (!c) return null;
      const w = sizeMode === 'teu' ? r.teu
        : sizeMode === 'shipments' ? r.shipments
        : sizeMode === 'spend' ? r.value_usd
        : r.opportunity_composite_score;
      return [c.lat, c.lng, Math.log10((w ?? 0) + 1)];
    }).filter(Boolean);
    const layer = L.heatLayer(data, { radius: 25, blur: 18, maxZoom: 8 });
    layer.addTo(map);
    return () => { map.removeLayer(layer); };
  }, [map, rows, sizeMode, on]);
  return null;
}
```

Render `<HeatLayer rows={rows} sizeMode={sizeMode} on={heatOn} />` inside the `MapContainer`. Add a `heatOn` prop and lift the toggle to the toolbar via `PulseExploreTab`.

- [ ] **Step 4: Commit**

```bash
git add frontend/package.json frontend/package-lock.json \
        frontend/src/features/pulse/explore/HeatOverlayToggle.jsx \
        frontend/src/features/pulse/explore/ExploreMap.jsx \
        frontend/src/features/pulse/explore/PulseExploreTab.jsx
git commit -m "feat(pulse-explore): heat overlay toggle (off by default)"
```

---

### Task 32: Loading skeletons + empty / error states polish

**Files:**
- Modify: `frontend/src/features/pulse/explore/PulseExploreTab.jsx`

- [ ] **Step 1: Replace the bare "Loading…" with a skeleton**

```jsx
function ExploreSkeleton() {
  return (
    <div className="absolute inset-0 grid place-items-center bg-white/70 backdrop-blur-sm z-10">
      <div className="text-center">
        <div className="h-8 w-8 rounded-full border-2 border-slate-300 border-t-slate-700 animate-spin mx-auto" />
        <div className="mt-3 text-sm text-slate-500">Loading accounts…</div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add an empty state when `rows.length === 0`**

```jsx
{!isLoading && rows.length === 0 && (
  <div className="absolute inset-0 grid place-items-center z-10 text-center">
    <div>
      <p className="text-slate-700 font-medium">No accounts match these filters.</p>
      <button onClick={() => setFilters({})} className="mt-2 text-sm text-cyan-700 hover:underline">
        Clear filters
      </button>
    </div>
  </div>
)}
```

- [ ] **Step 3: Wrap error state similarly**

- [ ] **Step 4: Commit**

```bash
git add frontend/src/features/pulse/explore/PulseExploreTab.jsx
git commit -m "feat(pulse-explore): loading skeleton + empty / error polish"
```

---

# Phase 4 — Gated rollout

Goal: feature flag, entitlements wiring, internal + design-partner monitoring.

---

### Task 33: `pulse_explorer_v1` feature flag in entitlements

**Files:**
- Create: `supabase/migrations/2026MMDDHHMMSS_pulse_explorer_feature_flag.sql`
- Modify: `supabase/functions/get-entitlements/index.ts`

- [ ] **Step 1: Migration to seed the flag in `lit_feature_flags`**

```sql
-- 2026MMDDHHMMSS_pulse_explorer_feature_flag.sql
insert into lit_feature_flags (key, default_enabled, description)
values ('pulse_explorer_v1', false, 'Pulse Explorer (V6-style map intel surface). Gradual rollout.')
on conflict (key) do nothing;
```

> If the existing `lit_feature_flags` schema differs, adapt the insert to the actual columns (verify via `\d lit_feature_flags` or by reading `supabase/migrations/20260513150000_lit_feature_flags.sql`).

- [ ] **Step 2: Modify `get-entitlements/index.ts` to include the flag**

Locate where the function reads `lit_feature_flags` (or returns the entitlements object). Add `pulse_explorer_v1` to the returned shape:

```ts
const flagsRows = await loadFeatureFlagsFor(userId);
return {
  // ...existing...
  features: {
    ...existingFeatures,
    pulse_explorer_v1: flagsRows.find((f) => f.key === 'pulse_explorer_v1')?.enabled ?? false,
  },
};
```

If the entitlements function uses a different mechanism, follow that pattern instead — the principle is: a stable boolean `features.pulse_explorer_v1` reaches the frontend.

- [ ] **Step 3: Deploy migration + function**

```bash
supabase db push --linked --branch <preview>
supabase functions deploy get-entitlements --project-ref <preview-ref>
```

- [ ] **Step 4: Verify in DB**

```sql
select key, default_enabled from lit_feature_flags where key = 'pulse_explorer_v1';
```

Expected: 1 row.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/2026MMDDHHMMSS_pulse_explorer_feature_flag.sql \
        supabase/functions/get-entitlements/index.ts
git commit -m "feat(entitlements): pulse_explorer_v1 feature flag"
```

---

### Task 34: Expose `pulse_explorer_v1` in `useEntitlements`

**Files:**
- Modify: `frontend/src/hooks/useEntitlements.ts`
- Modify: `frontend/src/pages/Pulse.jsx`

- [ ] **Step 1: Add the field to the entitlements hook type**

Find the type returned by `useEntitlements()` (likely `Entitlements` or similar). Add:

```ts
features: {
  // ...existing
  pulse_explorer_v1: boolean;
};
```

If types live in a separate file (`frontend/src/types/entitlements.ts` or similar), edit there.

- [ ] **Step 2: Pass it into `PulseTabs`**

In `Pulse.jsx`:

```jsx
import { useEntitlements } from '@/hooks/useEntitlements';

const { data: ent } = useEntitlements();
const exploreEnabled = !!ent?.features?.pulse_explorer_v1;

return (
  <PulseTabs exploreEnabled={exploreEnabled}>
    {/* ... */}
  </PulseTabs>
);
```

- [ ] **Step 3: Verify gated behavior**

In dev with the flag OFF: open `/app/pulse`, expect Explore tab absent. Toggle the flag ON for your user (admin SQL: insert a `lit_feature_flag_overrides` row or however overrides work in this codebase). Re-load. Explore tab appears.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/hooks/useEntitlements.ts frontend/src/pages/Pulse.jsx
git commit -m "feat(pulse): gate Explore tab behind pulse_explorer_v1 entitlement"
```

---

### Task 35: Internal rollout — enable for internal accounts + 3 design partners

**Files:** none (operational).

- [ ] **Step 1: Enable for internal/admin accounts via SQL on production**

```sql
-- Replace user_ids with actual internal + design-partner user IDs.
insert into lit_feature_flag_overrides (user_id, key, enabled)
values
  ('<internal-user-1>', 'pulse_explorer_v1', true),
  ('<internal-user-2>', 'pulse_explorer_v1', true),
  ('<design-partner-1>', 'pulse_explorer_v1', true),
  ('<design-partner-2>', 'pulse_explorer_v1', true),
  ('<design-partner-3>', 'pulse_explorer_v1', true)
on conflict (user_id, key) do update set enabled = excluded.enabled;
```

> If the override table name or schema differs, adapt — check `supabase/migrations/20260513150000_lit_feature_flags.sql` for the actual column names.

- [ ] **Step 2: Set up monitoring queries**

Add to a tracked dashboard / pinned doc — actual implementations go in your existing analytics/Sentry surfaces:

- **ImportYeti spend per user / day:** `select user_id, day, calls_count from lit_user_importyeti_quota where day > current_date - 7 order by calls_count desc;`
- **`pulse-explore` p95 latency:** check Supabase Edge Function logs.
- **Sentry error rate by fn:** filter `pulse-explore`, `pulse-map-selection-save`, `importyeti-proxy`.
- **DAU on Explore tab vs Search tab:** add a lightweight telemetry call from `PulseExploreTab` mount → `lit_pulse_search_events` with a new event type `explore_tab_view`.

- [ ] **Step 3: Wait 7 days; if stable, open to all paid tiers**

Operational decision — record the result + rollout date in the spec follow-up note.

---

### Task 36: Open to all paid tiers

**Files:** none (operational).

- [ ] **Step 1: Set the flag default ON for paid tiers**

```sql
-- Method depends on existing flag system. One pattern:
update lit_feature_flags set default_enabled = true where key = 'pulse_explorer_v1';
-- or set tier-scoped enablement if the schema supports it.
```

- [ ] **Step 2: Announce to customers**

Done outside this plan (marketing / customer success).

---

# Plan self-review

Spec coverage check against [docs/superpowers/specs/2026-06-16-pulse-explorer-design.md](../specs/2026-06-16-pulse-explorer-design.md):

- §2 Q1 Search/Explore tabs → Task 25.
- §2 Q2a size toggle → Task 19.
- §2 Q2b dedup → Tasks 5, 10.
- §2 Q3 NL parser → Tasks 26, 27.
- §2 Q4 color modes → Tasks 15, 19.
- §2 Q5 hybrid selection → Tasks 11, 19, 30.
- §2 Q6 freshness + bridge → Tasks 9, 10, 17, 23.
- §2 Q7 4-type opportunities → Tasks 6, 8, 10.
- §2 Top Insights Overview → Task 21.
- §2 Map tools → Tasks 18 (click, supercluster), 22 (table multi-select). **Gap fixed inline below: lasso + "Select all in view" need explicit task** — see Task 22.5.
- §2 CSV export → Task 28.
- §2 Admin-only CSV ingest → Tasks 1–3.
- §3 Architecture, component tree → Tasks 12–25.
- §3.5 Backend schema → Tasks 1, 4, 8.
- §3.5 `pulse-explore` → Task 10.
- §3.5 `pulse-map-selection-save` → Task 11.
- §3.6 NL taxonomy schema → Task 26.
- §4.1 Three render modes → Task 18 (cluster + bubble; metro jitter is a sub-step inside Task 18).
- §4.2 PulseQuickCard re-skin → Task 23.
- §4.3 Chip categories → Tasks 19, 27.
- §4.4 Scoring formulas → Task 6.
- §4.5 Dedup → Task 10.
- §4.6 Map Selection persistence → Tasks 11, 30.
- §4.7 CSV admin ingest → Tasks 1–3.
- §5 Error handling → covered across Tasks 9 (quota), 18 (coord miss fallback chain in `coordLookup`), 17 (refresh fail toast), 32 (empty / error UI).
- §6 Performance budgets → addressed by viewport culling (Task 18) + virtualization (Task 22) + truncation (Task 10).
- §7 Testing → unit tests in Tasks 2, 5, 6, 7, 14. **Gap: integration test for `pulse-explore` + E2E happy-path NOT explicitly tasked.** See Task 32.5 and Task 32.6 added below.
- §8 Rollout phases → Tasks 33–36 cover Phase 4. Phases 0–3 align with the task sequence.
- §10 Out-of-scope items: confirmed not present in plan.
- §11 Open items (per-tier quotas, pulse-list-companies table name, region values): noted inline in Tasks 9, 10, 7.

**Gaps fixed inline:** added Tasks 22.5 (lasso + select-all-in-view), 32.5 (pulse-explore integration test), 32.6 (E2E happy-path).

---

### Task 22.5: Map tools — Lasso select + "Select all in view"

**Files:**
- Modify: `frontend/src/features/pulse/explore/ExploreMap.jsx`
- Modify: `frontend/src/features/pulse/explore/PulseExploreTab.jsx`
- Modify: `frontend/package.json` (`leaflet-draw`)

- [ ] **Step 1: Install leaflet-draw**

```bash
cd frontend && npm install leaflet-draw@^1.0.4
```

- [ ] **Step 2: Add a "Select all in view" button to the toolbar**

In `ExploreToolbar.jsx`, near the SelectionBar, add:

```jsx
<button onClick={onSelectAllInView} className="px-2 py-1 text-xs rounded text-slate-600 hover:bg-slate-100">
  Select all in view
</button>
```

In `PulseExploreTab.jsx`, implement: when clicked, take the rows currently filtered + within the current map bbox (the map exposes bbox via the same `BboxTracker` hook from Task 18; lift that bbox into state) and union the IDs into `state.selection`.

- [ ] **Step 3: Add lasso (polygon draw → contains check)**

Inside `ExploreMap`, add a `FeatureGroup` and `EditControl`:

```jsx
import 'leaflet-draw/dist/leaflet.draw.css';
import { FeatureGroup } from 'react-leaflet';
import { EditControl } from 'react-leaflet-draw';
// (react-leaflet-draw is a thin wrapper; if it doesn't play with rl 4.x,
//  fall back to a manual draw control on the map instance.)

function onPolygonComplete(e, points, onSelect) {
  const poly = e.layer.getLatLngs()[0];
  // Simple ray-casting point-in-polygon check.
  const inside = points.filter(({ row }) => {
    const c = lookupCoords({ city: row.city, state: row.state, country: row.country });
    return c && pointInPolygon([c.lat, c.lng], poly);
  });
  onSelect(inside.map((p) => p.row.id));
}
```

Inline the `pointInPolygon` utility (small, no need for a dep).

- [ ] **Step 4: Verify build**

```bash
cd frontend && npm run build
```

- [ ] **Step 5: Smoke-test in dev**

Draw a polygon over a region → expect map selection state to update + table to highlight selected rows.

- [ ] **Step 6: Commit**

```bash
git add frontend/package.json frontend/package-lock.json \
        frontend/src/features/pulse/explore/ExploreMap.jsx \
        frontend/src/features/pulse/explore/ExploreToolbar.jsx \
        frontend/src/features/pulse/explore/PulseExploreTab.jsx
git commit -m "feat(pulse-explore): lasso select + select all in view"
```

---

### Task 32.5: Integration test for `pulse-explore` edge fn

**Files:**
- Create: `supabase/functions/pulse-explore/index.test.ts`

- [ ] **Step 1: Write the test using Supabase test client + seeded fixtures**

```ts
// supabase/functions/pulse-explore/index.test.ts
import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

const TEST_URL = Deno.env.get("TEST_SUPABASE_URL")!;
const TEST_KEY = Deno.env.get("TEST_SUPABASE_SERVICE_ROLE_KEY")!;
const TEST_JWT = Deno.env.get("TEST_USER_JWT")!; // a JWT for a test user

Deno.test("pulse-explore returns deduped rows with freshness chips", async () => {
  const admin = createClient(TEST_URL, TEST_KEY);
  // Seed: one row in lit_company_directory and a matching live row in lit_companies.
  await admin.from("lit_company_directory").upsert({
    canonical_name: "test-explore-a",
    company_name: "Test Explore A",
    country: "USA", state: "GA", city: "Atlanta",
    industry: "Food Manufacturing",
    teu: 1000,
    canonical_domain: "test-explore-a.com",
  }, { onConflict: "canonical_name,country,state" });
  await admin.from("lit_companies").upsert({
    canonical_name: "test-explore-a",
    name: "Test Explore A",
    domain: "test-explore-a.com",
    country: "USA", state: "GA", city: "Atlanta", industry: "Food Manufacturing",
  }, { onConflict: "canonical_name" });

  // Call the edge fn.
  const r = await fetch(`${TEST_URL}/functions/v1/pulse-explore`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${TEST_JWT}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ filters: { geo: { states: ["GA"] } } }),
  });
  const body = await r.json();
  assert(body.ok, JSON.stringify(body));

  // Should appear once (deduped), data_sources = ['directory','live'].
  const match = body.rows.filter((x: any) => x.canonical_name === "test-explore-a");
  assertEquals(match.length, 1);
  assertEquals(match[0].data_sources.sort(), ["directory", "live"]);
  assert(["live","saved","directory"].includes(match[0].freshness?.chip));
});
```

- [ ] **Step 2: Run against preview**

```bash
TEST_SUPABASE_URL=... TEST_SUPABASE_SERVICE_ROLE_KEY=... TEST_USER_JWT=... \
  deno test --allow-env --allow-net supabase/functions/pulse-explore/index.test.ts
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/pulse-explore/index.test.ts
git commit -m "test(pulse-explore): integration test — dedup + freshness join"
```

---

### Task 32.6: E2E happy-path Playwright test

**Files:**
- Create: `frontend/e2e/pulse-explorer.spec.ts`

> Skip this task if the project does not currently have a Playwright setup. If it does (look for `frontend/playwright.config.ts` or similar), add this spec.

- [ ] **Step 1: Write the spec**

```ts
// frontend/e2e/pulse-explorer.spec.ts
import { test, expect } from '@playwright/test';

test('pulse explorer: NL search → chip → bubble → save to list', async ({ page }) => {
  await page.goto('/app/pulse?tab=explore');
  await page.fill('input[placeholder*="vulnerable"]', 'vulnerable incumbents in the southeast');
  await page.keyboard.press('Enter');
  // Chips appear.
  await expect(page.getByText(/Opp: vulnerable/i)).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(/Southeast/i)).toBeVisible();
  // Click a bubble (first marker on the map).
  await page.locator('.pulse-bubble').first().click();
  await expect(page.getByText(/Open in Command Center/i)).toBeVisible();
  await page.getByRole('button', { name: /Save to list/i }).click();
  // (assert the AddToListPicker appears)
  await expect(page.getByText(/Add to list/i)).toBeVisible();
});
```

- [ ] **Step 2: Run**

```bash
cd frontend && npx playwright test pulse-explorer.spec.ts
```

- [ ] **Step 3: Commit**

```bash
git add frontend/e2e/pulse-explorer.spec.ts
git commit -m "test(e2e): pulse explorer happy-path — NL → chip → bubble → save"
```

---

## End of plan

Plan complete and saved to `docs/superpowers/plans/2026-06-16-pulse-explorer.md`.

**Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
