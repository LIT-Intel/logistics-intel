# Pulse Refresh + Alert Digest + Freightos Benchmark Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Three coupled scheduled jobs — bi-weekly ImportYeti snapshot refresh, weekly branded alert digest email, weekly Freightos FBX benchmark scrape — plus the supporting tables, settings UI, and unsubscribe endpoint.

**Architecture:** pg_cron 1.6.4 + pg_net 0.19.5 invoke three new Supabase edge functions over HTTP with a shared-secret header. Functions share two helper modules. Existing `importyeti-proxy` is refactored to share its IY-fetch core with the new cron function — its user-JWT contract stays intact. The Freightos scrape uses plain Deno `fetch()` against server-rendered HTML pages.

**Tech Stack:** Deno + Supabase Edge Functions, Postgres 15 + pg_cron + pg_net, Resend for email, React (Vite) frontend, Next.js (marketing app) for the unsubscribe endpoint.

**Spec:** [docs/superpowers/specs/2026-05-14-pulse-refresh-alert-digest-design.md](../specs/2026-05-14-pulse-refresh-alert-digest-design.md)

---

## Task 0: Verify spec is up to date + create feature branch checkpoint

**Files:**
- Read: `docs/superpowers/specs/2026-05-14-pulse-refresh-alert-digest-design.md`

- [ ] **Step 1:** Read the full spec end-to-end. Confirm: bi-weekly cadence, 20 companies per tick / 15 min, shared-secret cron auth, refactor importyeti-proxy to share `_shared/importyeti_fetch.ts`, advisory lock + SKIP LOCKED, Freightos abort-on-parse-failure, signed-token unsubscribe.

- [ ] **Step 2:** Confirm current branch is `claude/review-dashboard-deploy-3AmMD` (the branch lock per CLAUDE.md memory). Do NOT branch off.

Run: `git status && git log --oneline -1`
Expected: on `claude/review-dashboard-deploy-3AmMD`, latest commit references the spec.

---

## Task 1: Migration — new tables + column adds + RLS

**Files:**
- Create: `supabase/migrations/20260514100000_pulse_refresh_schema.sql`

- [ ] **Step 1:** Write the migration file with this exact content:

```sql
-- Pulse refresh + alert digest + benchmark schema (spec 2026-05-14)
-- Adds 4 new tables, 4 column adds, RLS policies, indexes.

BEGIN;

-- Per-user × per-company × per-alert-type delta row.
CREATE TABLE IF NOT EXISTS public.lit_pulse_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_company_key text,
  alert_type text NOT NULL CHECK (alert_type IN ('volume','shipment','lane','benchmark','baseline')),
  severity text NOT NULL DEFAULT 'info' CHECK (severity IN ('info','warning','high')),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  digest_sent_at timestamptz,
  dismissed_at timestamptz,
  digest_send_attempts int NOT NULL DEFAULT 0,
  digest_last_error text
);

CREATE INDEX IF NOT EXISTS lit_pulse_alerts_user_pending_idx
  ON public.lit_pulse_alerts (user_id, digest_sent_at)
  WHERE digest_sent_at IS NULL;

CREATE INDEX IF NOT EXISTS lit_pulse_alerts_recent_idx
  ON public.lit_pulse_alerts (created_at DESC);

ALTER TABLE public.lit_pulse_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lit_pulse_alerts_self_read ON public.lit_pulse_alerts;
CREATE POLICY lit_pulse_alerts_self_read ON public.lit_pulse_alerts
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS lit_pulse_alerts_self_update ON public.lit_pulse_alerts;
CREATE POLICY lit_pulse_alerts_self_update ON public.lit_pulse_alerts
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Per-user alert preferences (toggles + pause + unsubscribe token).
CREATE TABLE IF NOT EXISTS public.lit_user_alert_prefs (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  volume_alerts boolean NOT NULL DEFAULT true,
  shipment_alerts boolean NOT NULL DEFAULT true,
  lane_alerts boolean NOT NULL DEFAULT true,
  benchmark_alerts boolean NOT NULL DEFAULT false,
  paused_until timestamptz,
  unsubscribe_token text UNIQUE,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.lit_user_alert_prefs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lit_user_alert_prefs_self ON public.lit_user_alert_prefs;
CREATE POLICY lit_user_alert_prefs_self ON public.lit_user_alert_prefs
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Freightos FBX rates by week × lane × mode.
CREATE TABLE IF NOT EXISTS public.lit_benchmark_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  week_of date NOT NULL,
  lane text NOT NULL,
  lane_code text NOT NULL,
  mode text NOT NULL DEFAULT 'FCL_40HC',
  rate_usd numeric(10,2) NOT NULL CHECK (rate_usd > 0),
  volatility_pct numeric(5,2),
  source_url text NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  parse_confidence numeric(3,2) NOT NULL DEFAULT 1.0,
  CONSTRAINT lit_benchmark_rates_unique UNIQUE (week_of, lane_code, mode)
);

CREATE INDEX IF NOT EXISTS lit_benchmark_rates_recent_idx
  ON public.lit_benchmark_rates (lane_code, week_of DESC);

ALTER TABLE public.lit_benchmark_rates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lit_benchmark_rates_read ON public.lit_benchmark_rates;
CREATE POLICY lit_benchmark_rates_read ON public.lit_benchmark_rates
  FOR SELECT TO authenticated
  USING (true);

-- Per-tick telemetry.
CREATE TABLE IF NOT EXISTS public.lit_saved_company_refresh_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  processed_count int NOT NULL DEFAULT 0,
  alert_count int NOT NULL DEFAULT 0,
  error_count int NOT NULL DEFAULT 0,
  importyeti_credits_used int NOT NULL DEFAULT 0,
  notes text
);

CREATE INDEX IF NOT EXISTS lit_saved_company_refresh_runs_recent_idx
  ON public.lit_saved_company_refresh_runs (started_at DESC);

-- Add diff baseline column to existing snapshot table.
ALTER TABLE public.lit_importyeti_company_snapshot
  ADD COLUMN IF NOT EXISTS previous_parsed_summary jsonb;

-- Add refresh status columns to lit_saved_companies.
ALTER TABLE public.lit_saved_companies
  ADD COLUMN IF NOT EXISTS refresh_status text NOT NULL DEFAULT 'active'
    CHECK (refresh_status IN ('active','untrackable','paused'));

ALTER TABLE public.lit_saved_companies
  ADD COLUMN IF NOT EXISTS refresh_status_updated_at timestamptz;

ALTER TABLE public.lit_saved_companies
  ADD COLUMN IF NOT EXISTS consecutive_refresh_failures int NOT NULL DEFAULT 0;

COMMIT;
```

- [ ] **Step 2:** Apply via Supabase MCP:

```
mcp__claude_ai_Supabase__apply_migration with project_id=jkmrfiaefxwgbvftohrb, name='pulse_refresh_schema', query=<contents of file above>
```

Expected: success response.

- [ ] **Step 3:** Verify tables exist:

```sql
SELECT
  to_regclass('public.lit_pulse_alerts') AS alerts,
  to_regclass('public.lit_user_alert_prefs') AS prefs,
  to_regclass('public.lit_benchmark_rates') AS rates,
  to_regclass('public.lit_saved_company_refresh_runs') AS runs,
  (SELECT count(*) FROM information_schema.columns
   WHERE table_name='lit_importyeti_company_snapshot' AND column_name='previous_parsed_summary') AS prev_col,
  (SELECT count(*) FROM information_schema.columns
   WHERE table_name='lit_saved_companies' AND column_name='refresh_status') AS refresh_col;
```

Expected: all four `to_regclass` return their table names, `prev_col=1`, `refresh_col=1`.

- [ ] **Step 4:** Commit:

```bash
git add supabase/migrations/20260514100000_pulse_refresh_schema.sql
git commit -m "feat(pulse): schema for refresh + alerts + benchmark rates"
```

---

## Task 2: One-shot backfill — seed lit_user_alert_prefs for existing users

**Files:**
- Create: `supabase/migrations/20260514100100_pulse_alert_prefs_backfill.sql`

- [ ] **Step 1:** Write the migration:

```sql
-- Seed lit_user_alert_prefs for every existing auth.users row so the
-- pulse-alert-digest fn always finds a prefs row (or treats missing as defaults).
-- Also generate a signed unsubscribe token per user.

BEGIN;

INSERT INTO public.lit_user_alert_prefs (user_id, unsubscribe_token)
SELECT u.id, encode(gen_random_bytes(24), 'base64url')
FROM auth.users u
LEFT JOIN public.lit_user_alert_prefs p ON p.user_id = u.id
WHERE p.user_id IS NULL;

-- For any row missing a token (older inserts before this migration), backfill.
UPDATE public.lit_user_alert_prefs
SET unsubscribe_token = encode(gen_random_bytes(24), 'base64url')
WHERE unsubscribe_token IS NULL;

COMMIT;
```

- [ ] **Step 2:** Apply via Supabase MCP `apply_migration`.

- [ ] **Step 3:** Verify:

```sql
SELECT
  (SELECT count(*) FROM auth.users) AS total_users,
  (SELECT count(*) FROM public.lit_user_alert_prefs) AS prefs_rows,
  (SELECT count(*) FROM public.lit_user_alert_prefs WHERE unsubscribe_token IS NULL) AS missing_tokens;
```

Expected: `prefs_rows >= total_users`, `missing_tokens = 0`.

- [ ] **Step 4:** Commit:

```bash
git add supabase/migrations/20260514100100_pulse_alert_prefs_backfill.sql
git commit -m "feat(pulse): backfill alert_prefs + unsubscribe tokens for existing users"
```

---

## Task 3: Shared module — cron auth helper

**Files:**
- Create: `supabase/functions/_shared/cron_auth.ts`

- [ ] **Step 1:** Write the module:

```ts
// Shared cron-auth helper: verifies the X-Internal-Cron header against
// LIT_CRON_SECRET. Used by pulse-refresh-tick, pulse-alert-digest, and
// freightos-benchmark-sync (any edge fn invoked by pg_cron + pg_net).

export function verifyCronAuth(req: Request): { ok: true } | { ok: false; response: Response } {
  const expected = Deno.env.get("LIT_CRON_SECRET") || "";
  const provided = req.headers.get("X-Internal-Cron") || "";
  if (!expected) {
    console.error("[cron-auth] LIT_CRON_SECRET env var is not set");
    return { ok: false, response: new Response("server misconfigured", { status: 500 }) };
  }
  if (provided !== expected) {
    return { ok: false, response: new Response("forbidden", { status: 403 }) };
  }
  return { ok: true };
}
```

- [ ] **Step 2:** Commit:

```bash
git add supabase/functions/_shared/cron_auth.ts
git commit -m "feat(pulse): shared cron-auth header verification helper"
```

---

## Task 4: Shared module — ImportYeti fetch + snapshot upsert

**Files:**
- Read: `supabase/functions/importyeti-proxy/index.ts` (existing — find the upstream fetch + parsed-summary builder + snapshot upsert logic; we'll extract it)
- Create: `supabase/functions/_shared/importyeti_fetch.ts`

- [ ] **Step 1:** Read the existing proxy and identify these three concerns inside `importyeti-proxy/index.ts`:
   a. The upstream HTTPS fetch to ImportYeti
   b. The `parsed_summary` builder that transforms raw JSON into the shape stored in `lit_importyeti_company_snapshot`
   c. The actual upsert to `lit_importyeti_company_snapshot`

Use `Grep` to find them — relevant function names likely include `fetchCompanyByIdUpstream`, `buildParsedSummary`, and the upsert call site.

- [ ] **Step 2:** Write the shared module:

```ts
// Shared ImportYeti fetch + snapshot upsert.
//
// Used by:
//   - importyeti-proxy (user-flow, JWT-gated, quota-counted)
//   - pulse-refresh-tick (cron, bypasses user quota — credits counted at org level)
//
// Returns the new snapshot AND the previous parsed_summary so the caller can
// run diff alerts without an extra DB roundtrip.

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

export type EnvConfig = {
  IMPORTYETI_API_KEY: string;
  IMPORTYETI_API_BASE?: string;
};

export type FetchResult = {
  httpStatus: number;
  parsedSummary: Record<string, unknown> | null;
  previousParsedSummary: Record<string, unknown> | null;
  rawPayload: Record<string, unknown> | null;
};

const DEFAULT_BASE = "https://data.importyeti.com";

export async function fetchAndUpsertSnapshot(
  supabase: SupabaseClient,
  companySlug: string,
  env: EnvConfig,
): Promise<FetchResult> {
  // 1. Pull current snapshot (the about-to-be-previous payload).
  const { data: prev } = await supabase
    .from("lit_importyeti_company_snapshot")
    .select("parsed_summary")
    .eq("company_id", companySlug)
    .maybeSingle();

  // 2. Fetch upstream.
  const base = env.IMPORTYETI_API_BASE || DEFAULT_BASE;
  const url = `${base}/v1.0/company/${encodeURIComponent(companySlug)}`;
  const resp = await fetch(url, {
    headers: {
      "Authorization": `Bearer ${env.IMPORTYETI_API_KEY}`,
      "Accept": "application/json",
    },
  });

  if (resp.status === 404) {
    return { httpStatus: 404, parsedSummary: null, previousParsedSummary: prev?.parsed_summary ?? null, rawPayload: null };
  }
  if (!resp.ok) {
    throw new Error(`importyeti_upstream_${resp.status}`);
  }

  const rawPayload = await resp.json() as Record<string, unknown>;
  const parsedSummary = buildParsedSummary(rawPayload);

  // 3. Upsert with previous_parsed_summary preserved.
  const { error } = await supabase.from("lit_importyeti_company_snapshot").upsert({
    company_id: companySlug,
    raw_payload: rawPayload,
    parsed_summary: parsedSummary,
    previous_parsed_summary: prev?.parsed_summary ?? null,
    updated_at: new Date().toISOString(),
  }, { onConflict: "company_id" });

  if (error) throw new Error(`snapshot_upsert_failed: ${error.message}`);

  return {
    httpStatus: 200,
    parsedSummary,
    previousParsedSummary: prev?.parsed_summary ?? null,
    rawPayload,
  };
}

// Mirror of the parsed_summary shape stored today by importyeti-proxy.
// Extend this function to match the proxy's existing builder during refactor.
export function buildParsedSummary(raw: Record<string, unknown>): Record<string, unknown> {
  // Caller's responsibility to match the existing shape produced by importyeti-proxy.
  // After refactor (Task 5), both call sites share this exact function.
  return raw as Record<string, unknown>;
}
```

- [ ] **Step 3:** Commit (we'll wire the proxy refactor in Task 5):

```bash
git add supabase/functions/_shared/importyeti_fetch.ts
git commit -m "feat(pulse): _shared/importyeti_fetch.ts — IY fetch + snapshot upsert"
```

---

## Task 5: Refactor importyeti-proxy to use shared module

**Files:**
- Modify: `supabase/functions/importyeti-proxy/index.ts`

- [ ] **Step 1:** Locate the existing `fetchCompanyByIdUpstream` and `buildParsedSummary` functions (and the snapshot upsert call site) in `importyeti-proxy/index.ts`. They're in the area near line ~1317 (the BOLs-endpoint pagination comment) and the serve handler near line ~1786.

- [ ] **Step 2:** Move the parsed-summary build logic into `_shared/importyeti_fetch.ts` (replace the placeholder `buildParsedSummary` from Task 4 with the real implementation).

- [ ] **Step 3:** In `importyeti-proxy/index.ts`, replace the inline fetch+upsert with an import + call:

```ts
import { fetchAndUpsertSnapshot } from "../_shared/importyeti_fetch.ts";
// ... where the proxy currently does the fetch + upsert sequence:
const result = await fetchAndUpsertSnapshot(supabase, companySlug, {
  IMPORTYETI_API_KEY: Deno.env.get("IMPORTYETI_API_KEY") || "",
});
```

The proxy's existing user-JWT auth gate, quota check, and usage-consume logic stay exactly as they are — only the fetch+upsert internals are extracted.

- [ ] **Step 4:** Deploy via Supabase MCP `deploy_edge_function` (project `jkmrfiaefxwgbvftohrb`, name `importyeti-proxy`). Include the `_shared/importyeti_fetch.ts` file in the `files` array alongside `index.ts`.

- [ ] **Step 5:** Smoke-test against a known-good company slug (e.g. `the-gap`):

```bash
curl -X POST "https://jkmrfiaefxwgbvftohrb.supabase.co/functions/v1/importyeti-proxy" \
  -H "Authorization: Bearer <your_user_jwt>" \
  -H "Content-Type: application/json" \
  -d '{"action":"companyProfile","company_id":"the-gap"}'
```

Expected: same shape of response as before refactor. If the parsed_summary structure changed, the diff alerts later will misfire — verify the shape is byte-identical to the existing 268 rows.

- [ ] **Step 6:** Commit:

```bash
git add supabase/functions/importyeti-proxy/index.ts supabase/functions/_shared/importyeti_fetch.ts
git commit -m "refactor(pulse): extract IY fetch core into _shared/importyeti_fetch.ts"
```

---

## Task 6: Shared module — alert diff (pure function)

**Files:**
- Create: `supabase/functions/_shared/alert_diff.ts`

- [ ] **Step 1:** Write the diff helper:

```ts
// Pure diff function: given previous + new parsed_summary, return the set
// of alert rows that should be inserted (one per (user, company, alert_type)
// — caller fans out across all users who saved this company).
//
// Smart-default thresholds per spec:
//   - volume:   ≥0.20 OR ≥5 absolute new shipments. severity=high if ≥0.50, else warning
//   - shipment: new BOLs since last refresh
//   - lane:     new route in top_routes OR existing route +≥50% w/w
//   - baseline: previous_parsed_summary is NULL — emit ONE info row, no diff alerts

export type AlertCandidate = {
  alert_type: "volume" | "shipment" | "lane" | "baseline";
  severity: "info" | "warning" | "high";
  payload: Record<string, unknown>;
};

export function computeAlertCandidates(
  prev: Record<string, any> | null,
  next: Record<string, any>,
): AlertCandidate[] {
  if (!prev || Object.keys(prev).length === 0) {
    return [{
      alert_type: "baseline",
      severity: "info",
      payload: {
        company_name: next.company_name ?? null,
        total_shipments: numeric(next.total_shipments),
        total_teu: numeric(next.total_teu),
        last_shipment_date: next.last_shipment_date ?? null,
      },
    }];
  }

  const candidates: AlertCandidate[] = [];

  // 1. Volume alert.
  const prevShip = numeric(prev.total_shipments) ?? 0;
  const nextShip = numeric(next.total_shipments) ?? 0;
  const absDelta = nextShip - prevShip;
  const pctDelta = prevShip > 0 ? absDelta / prevShip : 0;
  if (absDelta >= 5 || pctDelta >= 0.20) {
    candidates.push({
      alert_type: "volume",
      severity: Math.abs(pctDelta) >= 0.50 ? "high" : "warning",
      payload: {
        before: prevShip,
        after: nextShip,
        abs_delta: absDelta,
        pct_delta: pctDelta,
        company_name: next.company_name ?? null,
      },
    });
  }

  // 2. Shipment alert — new BOLs since last refresh.
  const prev12m = numeric(prev.shipments_last_12m) ?? 0;
  const next12m = numeric(next.shipments_last_12m) ?? 0;
  const prevLastDate = prev.last_shipment_date ?? null;
  const nextLastDate = next.last_shipment_date ?? null;
  if (next12m > prev12m && nextLastDate && (!prevLastDate || nextLastDate > prevLastDate)) {
    candidates.push({
      alert_type: "shipment",
      severity: "info",
      payload: {
        before_12m: prev12m,
        after_12m: next12m,
        last_shipment_date: nextLastDate,
        company_name: next.company_name ?? null,
      },
    });
  }

  // 3. Lane alert — new route OR +≥50% surge on existing route.
  const prevRoutes = routeMap(prev.top_routes);
  const nextRoutes = routeMap(next.top_routes);
  const newRoutes: string[] = [];
  const surgedRoutes: Array<{ route: string; before: number; after: number }> = [];
  for (const [route, nextCount] of nextRoutes) {
    const prevCount = prevRoutes.get(route);
    if (prevCount === undefined) {
      newRoutes.push(route);
    } else if (prevCount > 0 && (nextCount - prevCount) / prevCount >= 0.5) {
      surgedRoutes.push({ route, before: prevCount, after: nextCount });
    }
  }
  if (newRoutes.length > 0) {
    candidates.push({
      alert_type: "lane",
      severity: "info",
      payload: { kind: "new_route", routes: newRoutes.slice(0, 5), company_name: next.company_name ?? null },
    });
  }
  if (surgedRoutes.length > 0) {
    candidates.push({
      alert_type: "lane",
      severity: "warning",
      payload: { kind: "lane_volume_surge", surges: surgedRoutes.slice(0, 5), company_name: next.company_name ?? null },
    });
  }

  return candidates;
}

function numeric(v: unknown): number | null {
  if (typeof v === "number") return v;
  if (typeof v === "string") { const n = Number(v); return Number.isFinite(n) ? n : null; }
  return null;
}

function routeMap(routes: unknown): Map<string, number> {
  const m = new Map<string, number>();
  if (!Array.isArray(routes)) return m;
  for (const r of routes) {
    if (!r || typeof r !== "object") continue;
    const key = String((r as any).route ?? "").trim();
    const count = numeric((r as any).shipments) ?? 0;
    if (key) m.set(key, count);
  }
  return m;
}
```

- [ ] **Step 2:** Write a sanity-check inline (no test framework dependency — Deno's built-in `assertEquals` works but we'll keep it minimal). Create `supabase/functions/_shared/alert_diff.test.ts`:

```ts
import { computeAlertCandidates } from "./alert_diff.ts";

const baseline = computeAlertCandidates(null, { company_name: "Acme", total_shipments: 10 });
console.assert(baseline.length === 1 && baseline[0].alert_type === "baseline", "baseline case");

const noChange = computeAlertCandidates(
  { total_shipments: 10, shipments_last_12m: 10, top_routes: [{ route: "China → US", shipments: 5 }] },
  { total_shipments: 10, shipments_last_12m: 10, top_routes: [{ route: "China → US", shipments: 5 }] },
);
console.assert(noChange.length === 0, "no-change case");

const volSurge = computeAlertCandidates(
  { total_shipments: 100, shipments_last_12m: 50, top_routes: [] },
  { total_shipments: 160, shipments_last_12m: 50, top_routes: [] },
);
console.assert(volSurge.some(c => c.alert_type === "volume" && c.severity === "high"), "volume high");

const newLane = computeAlertCandidates(
  { total_shipments: 10, top_routes: [{ route: "China → US", shipments: 5 }] },
  { total_shipments: 10, top_routes: [{ route: "China → US", shipments: 5 }, { route: "Vietnam → US", shipments: 3 }] },
);
console.assert(newLane.some(c => c.alert_type === "lane" && (c.payload as any).kind === "new_route"), "new lane");

console.log("alert_diff sanity-tests passed");
```

- [ ] **Step 3:** Run with Deno:

```bash
deno run --allow-net supabase/functions/_shared/alert_diff.test.ts
```

Expected: `alert_diff sanity-tests passed`. (If you don't have Deno locally, deploy the test file alongside one of the edge fns and check logs.)

- [ ] **Step 4:** Commit:

```bash
git add supabase/functions/_shared/alert_diff.ts supabase/functions/_shared/alert_diff.test.ts
git commit -m "feat(pulse): _shared/alert_diff.ts — smart-default delta detection"
```

---

## Task 7: pulse-refresh-tick — edge function (scaffolding + pick query)

**Files:**
- Create: `supabase/functions/pulse-refresh-tick/index.ts`

- [ ] **Step 1:** Write the function:

```ts
// pulse-refresh-tick — rolling refresh of saved companies via ImportYeti.
// Triggered every 15 min by pg_cron. Processes up to 20 companies per tick.
// Auth: X-Internal-Cron header against LIT_CRON_SECRET env.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";
import { verifyCronAuth } from "../_shared/cron_auth.ts";
import { fetchAndUpsertSnapshot } from "../_shared/importyeti_fetch.ts";
import { computeAlertCandidates } from "../_shared/alert_diff.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const IMPORTYETI_API_KEY = Deno.env.get("IMPORTYETI_API_KEY") || "";

const BATCH_SIZE = 20;
const TTL_DAYS = 14;
const LOCK_KEY = 7281990; // arbitrary 32-bit signed int identifying this cron lock

serve(async (req) => {
  const auth = verifyCronAuth(req);
  if (!auth.ok) return auth.response;

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  // 1. Advisory lock — abort if another tick is mid-flight.
  const { data: lockData } = await supabase.rpc("pg_try_advisory_lock", { key: LOCK_KEY }).catch(() => ({ data: null }));
  // Fallback raw query if rpc not exposed:
  const { data: lockRows } = await supabase
    .from("dummy_does_not_exist_ignore_error").select("*").limit(0)
    .then(() => ({ data: null }))
    .catch(() => ({ data: null }));
  // Use a raw rpc instead: define `pg_try_advisory_lock_int` server-side OR use pg_net to call cron.lock.
  // For v1 simplicity: query via the postgrest interface using the `rpc` helper to the standard function.
  // If rpc not defined yet, the lock will skip and we rely on SKIP LOCKED.

  // 2. Start run telemetry row.
  const { data: runRow } = await supabase
    .from("lit_saved_company_refresh_runs")
    .insert({ notes: "pulse-refresh-tick start" })
    .select("id")
    .single();
  const runId = runRow?.id;

  // 3. Claim up to BATCH_SIZE companies. Two passes: stale snapshots, then never-fetched saves.
  const stale = await pickStaleSnapshots(supabase, BATCH_SIZE);
  const remaining = BATCH_SIZE - stale.length;
  const neverFetched = remaining > 0 ? await pickNeverFetched(supabase, remaining) : [];
  const slugs = [...stale, ...neverFetched];

  // 4. Process each company.
  let processed = 0;
  let alertsCreated = 0;
  let errors = 0;
  for (const slug of slugs) {
    try {
      const result = await fetchAndUpsertSnapshot(supabase, slug, { IMPORTYETI_API_KEY });
      if (result.httpStatus === 404) {
        await markUntrackable(supabase, slug);
        continue;
      }
      const candidates = computeAlertCandidates(result.previousParsedSummary, result.parsedSummary!);
      if (candidates.length > 0) {
        alertsCreated += await fanOutAlerts(supabase, slug, candidates);
      }
      await resetFailureCount(supabase, slug);
      processed++;
    } catch (err) {
      errors++;
      console.error(`[pulse-refresh-tick] ${slug}:`, err?.message || err);
      await bumpFailureCount(supabase, slug);
    }
  }

  // 5. Close run row.
  if (runId) {
    await supabase.from("lit_saved_company_refresh_runs").update({
      finished_at: new Date().toISOString(),
      processed_count: processed,
      alert_count: alertsCreated,
      error_count: errors,
    }).eq("id", runId);
  }

  // 6. Release lock (no-op if we didn't acquire).
  // pg_advisory_unlock(LOCK_KEY) — omitted; session ends here, lock auto-releases.

  return new Response(JSON.stringify({
    ok: true, processed, alerts: alertsCreated, errors, slugs: slugs.length,
  }), { headers: { "Content-Type": "application/json" } });
});

async function pickStaleSnapshots(supabase: any, limit: number): Promise<string[]> {
  const ttl = new Date(Date.now() - TTL_DAYS * 86400 * 1000).toISOString();
  const { data } = await supabase
    .from("lit_importyeti_company_snapshot")
    .select("company_id")
    .lt("updated_at", ttl)
    .order("updated_at", { ascending: true, nullsFirst: true })
    .limit(limit);
  if (!data || data.length === 0) return [];
  // Filter to only company_ids that are CURRENTLY saved AND not untrackable.
  const slugs = data.map((r: any) => r.company_id);
  const { data: active } = await supabase
    .from("lit_saved_companies")
    .select("source_company_key")
    .in("source_company_key", slugs)
    .eq("refresh_status", "active");
  const activeSet = new Set((active || []).map((r: any) => r.source_company_key));
  return slugs.filter((s: string) => activeSet.has(s));
}

async function pickNeverFetched(supabase: any, limit: number): Promise<string[]> {
  // Pick saved companies that have NO row in lit_importyeti_company_snapshot yet.
  const { data: saves } = await supabase
    .from("lit_saved_companies")
    .select("source_company_key")
    .eq("refresh_status", "active")
    .not("source_company_key", "is", null);
  if (!saves || saves.length === 0) return [];
  const allSlugs = Array.from(new Set(saves.map((r: any) => r.source_company_key)));
  const { data: existing } = await supabase
    .from("lit_importyeti_company_snapshot")
    .select("company_id")
    .in("company_id", allSlugs);
  const existingSet = new Set((existing || []).map((r: any) => r.company_id));
  return allSlugs.filter((s: string) => !existingSet.has(s)).slice(0, limit);
}

async function fanOutAlerts(supabase: any, slug: string, candidates: any[]): Promise<number> {
  const { data: saves } = await supabase
    .from("lit_saved_companies")
    .select("user_id")
    .eq("source_company_key", slug)
    .eq("refresh_status", "active");
  if (!saves || saves.length === 0) return 0;
  const rows: any[] = [];
  for (const c of candidates) {
    for (const s of saves) {
      rows.push({
        user_id: s.user_id,
        source_company_key: slug,
        alert_type: c.alert_type,
        severity: c.severity,
        payload: c.payload,
      });
    }
  }
  const { error } = await supabase.from("lit_pulse_alerts").insert(rows);
  if (error) { console.error("[pulse-refresh-tick] alert insert failed:", error.message); return 0; }
  return rows.length;
}

async function markUntrackable(supabase: any, slug: string): Promise<void> {
  // Bump failure count; mark untrackable after 3 consecutive 404s.
  const { data: rows } = await supabase
    .from("lit_saved_companies")
    .select("id, consecutive_refresh_failures")
    .eq("source_company_key", slug);
  for (const r of rows || []) {
    const next = (r.consecutive_refresh_failures || 0) + 1;
    const updates: any = { consecutive_refresh_failures: next };
    if (next >= 3) {
      updates.refresh_status = "untrackable";
      updates.refresh_status_updated_at = new Date().toISOString();
    }
    await supabase.from("lit_saved_companies").update(updates).eq("id", r.id);
  }
}

async function bumpFailureCount(supabase: any, slug: string): Promise<void> {
  await supabase.rpc("increment_consecutive_refresh_failures", { p_slug: slug }).catch(() => {});
  // Fallback if RPC not defined: do nothing (next tick will retry).
}

async function resetFailureCount(supabase: any, slug: string): Promise<void> {
  await supabase
    .from("lit_saved_companies")
    .update({ consecutive_refresh_failures: 0 })
    .eq("source_company_key", slug)
    .neq("consecutive_refresh_failures", 0);
}
```

- [ ] **Step 2:** Add a small SQL helper (advisory lock + bump-failure RPC). Create migration `supabase/migrations/20260514100200_pulse_refresh_rpcs.sql`:

```sql
BEGIN;

CREATE OR REPLACE FUNCTION public.try_pulse_refresh_lock(p_key int)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN pg_try_advisory_lock(p_key);
END;
$$;

GRANT EXECUTE ON FUNCTION public.try_pulse_refresh_lock(int) TO service_role;

CREATE OR REPLACE FUNCTION public.increment_consecutive_refresh_failures(p_slug text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.lit_saved_companies
  SET consecutive_refresh_failures = consecutive_refresh_failures + 1
  WHERE source_company_key = p_slug;
END;
$$;

GRANT EXECUTE ON FUNCTION public.increment_consecutive_refresh_failures(text) TO service_role;

COMMIT;
```

Apply via `apply_migration`.

- [ ] **Step 3:** Replace the inline lock-attempt placeholder in `pulse-refresh-tick/index.ts` with the real RPC call:

```ts
const { data: lockOk } = await supabase.rpc("try_pulse_refresh_lock", { p_key: LOCK_KEY });
if (!lockOk) {
  return new Response(JSON.stringify({ ok: true, skipped: true, reason: "lock_held" }), { headers: { "Content-Type": "application/json" } });
}
```

- [ ] **Step 4:** Deploy via Supabase MCP:

```
mcp__claude_ai_Supabase__deploy_edge_function
  project_id: jkmrfiaefxwgbvftohrb
  name: pulse-refresh-tick
  entrypoint_path: index.ts
  verify_jwt: false
  files: [index.ts, _shared/cron_auth.ts, _shared/importyeti_fetch.ts, _shared/alert_diff.ts]
```

(verify_jwt is false because we use the shared-secret header instead of JWT.)

- [ ] **Step 5:** Test manually (set `LIT_CRON_SECRET` env var first via Supabase dashboard):

```bash
curl -X POST "https://jkmrfiaefxwgbvftohrb.supabase.co/functions/v1/pulse-refresh-tick" \
  -H "X-Internal-Cron: <your_secret>" \
  -H "Content-Type: application/json" \
  -d '{}'
```

Expected: `{"ok":true,"processed":N,"alerts":M,"errors":0,"slugs":N}` with `N>0` if there are stale or never-fetched companies.

- [ ] **Step 6:** Commit:

```bash
git add supabase/functions/pulse-refresh-tick/index.ts supabase/migrations/20260514100200_pulse_refresh_rpcs.sql
git commit -m "feat(pulse): pulse-refresh-tick edge fn + advisory lock RPC"
```

---

## Task 8: Branded email mockup (PRE-LAUNCH GATE)

**Files:**
- Create: `docs/mockups/pulse-digest-sample.html`

- [ ] **Step 1:** Write a complete, production-shape HTML email mockup using inline CSS (email-safe), with REAL sample data:

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Your Pulse Digest — Logistic Intel</title>
</head>
<body style="margin:0; padding:0; background:#F8FAFC; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#F8FAFC;">
  <tr>
    <td align="center" style="padding:32px 16px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px; background:#ffffff; border-radius:14px; box-shadow:0 4px 16px rgba(15,23,42,0.06); overflow:hidden;">

        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#0F172A 0%,#1E293B 100%); padding:24px 28px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
              <tr>
                <td>
                  <div style="display:inline-block; width:32px; height:32px; background:radial-gradient(circle at 30% 30%, rgba(0,240,255,0.32), transparent 65%), linear-gradient(135deg,#0F172A 0%,#1E293B 100%); border-radius:8px; vertical-align:middle; text-align:center; line-height:32px; color:#00F0FF; font-weight:bold;">L</div>
                  <span style="color:#ffffff; font-size:18px; font-weight:bold; margin-left:10px; vertical-align:middle;">Logistic Intel</span>
                </td>
                <td align="right" style="color:#94A3B8; font-size:12px;">Weekly digest · May 12 2026</td>
              </tr>
            </table>
            <h1 style="color:#ffffff; font-size:24px; line-height:30px; margin:18px 0 4px 0;">Hi Spark — 7 signals across your saved companies this week</h1>
            <p style="color:#CBD5E1; font-size:14px; line-height:20px; margin:0;">Volume changes, new shipment activity, and trade-lane shifts from the past 14 days.</p>
          </td>
        </tr>

        <!-- Volume alerts -->
        <tr>
          <td style="padding:24px 28px 8px 28px;">
            <div style="display:inline-block; font-size:10px; font-weight:bold; letter-spacing:0.08em; text-transform:uppercase; color:#3B82F6;">VOLUME ALERTS · 2</div>
          </td>
        </tr>
        <tr>
          <td style="padding:0 28px 16px 28px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border:1px solid #E2E8F0; border-radius:10px;">
              <tr>
                <td style="padding:14px 16px; border-bottom:1px solid #F1F5F9;">
                  <div style="font-size:14px; font-weight:bold; color:#0F172A;">Panasonic Automotive Systems</div>
                  <div style="font-size:12px; color:#64748B; margin-top:2px;">Peachtree City, GA · 136 → 169 shipments · <span style="color:#16A34A; font-weight:bold;">+24%</span></div>
                  <a href="https://app.logisticintel.com/app/search?q=Panasonic+Automotive+Systems" style="display:inline-block; margin-top:8px; font-size:11px; color:#3B82F6; font-weight:bold; text-decoration:none;">See full supply chain →</a>
                </td>
              </tr>
              <tr>
                <td style="padding:14px 16px;">
                  <div style="font-size:14px; font-weight:bold; color:#0F172A;">Hyundai Motor Mfg Alabama</div>
                  <div style="font-size:12px; color:#64748B; margin-top:2px;">Montgomery, AL · 39 → 62 shipments · <span style="color:#16A34A; font-weight:bold;">+59%</span> · <span style="color:#DC2626; font-weight:bold;">HIGH</span></div>
                  <a href="https://app.logisticintel.com/app/search?q=Hyundai+Motor+Mfg+Alabama" style="display:inline-block; margin-top:8px; font-size:11px; color:#3B82F6; font-weight:bold; text-decoration:none;">See full supply chain →</a>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Lane alerts -->
        <tr>
          <td style="padding:16px 28px 8px 28px;">
            <div style="display:inline-block; font-size:10px; font-weight:bold; letter-spacing:0.08em; text-transform:uppercase; color:#8B5CF6;">NEW TRADE LANES · 1</div>
          </td>
        </tr>
        <tr>
          <td style="padding:0 28px 16px 28px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border:1px solid #E2E8F0; border-radius:10px;">
              <tr>
                <td style="padding:14px 16px;">
                  <div style="font-size:14px; font-weight:bold; color:#0F172A;">The Gap</div>
                  <div style="font-size:12px; color:#64748B; margin-top:2px;">San Francisco, CA started shipping from <strong style="color:#0F172A;">Vietnam → San Francisco</strong> · 7 new shipments</div>
                  <a href="https://app.logisticintel.com/app/search?q=The+Gap" style="display:inline-block; margin-top:8px; font-size:11px; color:#3B82F6; font-weight:bold; text-decoration:none;">See full supply chain →</a>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Benchmark alert (only if opted in) -->
        <tr>
          <td style="padding:16px 28px 8px 28px;">
            <div style="display:inline-block; font-size:10px; font-weight:bold; letter-spacing:0.08em; text-transform:uppercase; color:#0891B2;">BENCHMARK RATE MOVERS · 1</div>
          </td>
        </tr>
        <tr>
          <td style="padding:0 28px 16px 28px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border:1px solid #E2E8F0; border-radius:10px;">
              <tr>
                <td style="padding:14px 16px;">
                  <div style="font-size:14px; font-weight:bold; color:#0F172A;">FBX01 · China → NA West Coast</div>
                  <div style="font-size:12px; color:#64748B; margin-top:2px;">$2,484 → $2,828 per 40HC · <span style="color:#DC2626; font-weight:bold;">+13.8%</span> WoW</div>
                  <div style="font-size:11px; color:#94A3B8; margin-top:6px;">Source: <a href="https://www.freightos.com/enterprise/terminal/freightos-baltic-index-global-container-pricing-index/" style="color:#94A3B8; text-decoration:underline;">Freightos Baltic Index</a></div>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:24px 28px; background:#F8FAFC; border-top:1px solid #E2E8F0;">
            <p style="font-size:12px; line-height:18px; color:#64748B; margin:0 0 8px 0;">Logistic Intel · Atlanta, GA</p>
            <p style="font-size:11px; line-height:16px; color:#94A3B8; margin:0;">
              You're receiving this weekly digest because you have saved companies in your Pulse Library.
              <a href="https://app.logisticintel.com/app/notifications" style="color:#3B82F6;">Manage preferences</a> ·
              <a href="https://app.logisticintel.com/api/unsubscribe?token={{UNSUBSCRIBE_TOKEN}}" style="color:#3B82F6;">Unsubscribe</a>
            </p>
          </td>
        </tr>

      </table>
    </td>
  </tr>
</table>
</body>
</html>
```

- [ ] **Step 2:** Open the file in a browser (`start docs/mockups/pulse-digest-sample.html` on Windows). Confirm:
   - Logo + "Logistic Intel" header renders
   - Three alert sections (volume / lane / benchmark) each have at least one card
   - Each card has a "See full supply chain →" CTA pointing at `/app/search?q=...`
   - Freightos attribution + link is visible on the benchmark section
   - Footer has Manage preferences + Unsubscribe links

- [ ] **Step 3:** Commit and STOP for founder review:

```bash
git add docs/mockups/pulse-digest-sample.html
git commit -m "feat(pulse): branded email digest mockup (founder review gate)"
```

> ⚠️ **GATE:** Do not proceed past this task until the founder has reviewed `docs/mockups/pulse-digest-sample.html` and approved the design. The digest cron fn (Task 11) will produce HTML matching this exact mockup.

---

## Task 9: Signed-token unsubscribe endpoint

**Files:**
- Create: `marketing/app/api/unsubscribe/route.ts`

- [ ] **Step 1:** Write the Next.js API route:

```ts
// POST /api/unsubscribe?token=<base64url>
// One-click unsubscribe per RFC 8058 (List-Unsubscribe-Post compatible).
// Token is the unsubscribe_token from lit_user_alert_prefs — a 24-byte random.
// Sets all 4 alert toggles to false + paused_until to year 2099 in one POST.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  return handle(req);
}

// Some clients send a GET to verify the URL is reachable; respond identically.
export async function GET(req: NextRequest) {
  return handle(req);
}

async function handle(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token") || "";
  if (!token || token.length < 16) {
    return NextResponse.json({ ok: false, error: "missing_token" }, { status: 400 });
  }

  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { error } = await supabase
    .from("lit_user_alert_prefs")
    .update({
      volume_alerts: false,
      shipment_alerts: false,
      lane_alerts: false,
      benchmark_alerts: false,
      paused_until: "2099-01-01T00:00:00Z",
      updated_at: new Date().toISOString(),
    })
    .eq("unsubscribe_token", token);

  if (error) {
    console.error("[unsubscribe] update failed:", error.message);
    return NextResponse.json({ ok: false, error: "internal" }, { status: 500 });
  }

  // Friendly HTML response (no auth required).
  return new NextResponse(
    `<!DOCTYPE html><html><body style="font-family:-apple-system,sans-serif;text-align:center;padding:48px;">
       <h1 style="color:#0F172A;">You're unsubscribed</h1>
       <p style="color:#64748B;">You won't receive any more Pulse digest emails. You can resubscribe anytime from your <a href="https://app.logisticintel.com/app/notifications">notification preferences</a>.</p>
     </body></html>`,
    { status: 200, headers: { "Content-Type": "text/html" } },
  );
}
```

- [ ] **Step 2:** Deploy via Vercel CLI (marketing project):

```bash
npx vercel deploy --prod --yes --cwd "marketing"
```

- [ ] **Step 3:** Smoke-test with a real unsubscribe token from the DB:

```sql
SELECT user_id, unsubscribe_token FROM public.lit_user_alert_prefs LIMIT 1;
```

```bash
curl -X POST "https://www.logisticintel.com/api/unsubscribe?token=<token>"
```

Expected: HTML response "You're unsubscribed", and the row's `volume_alerts/shipment_alerts/lane_alerts/benchmark_alerts` all become false.

- [ ] **Step 4:** Commit:

```bash
git add marketing/app/api/unsubscribe/route.ts
git commit -m "feat(pulse): signed-token unsubscribe endpoint (CAN-SPAM/Gmail one-click)"
```

---

## Task 10: pulse-alert-digest — edge function

**Files:**
- Create: `supabase/functions/pulse-alert-digest/index.ts`

- [ ] **Step 1:** Write the function:

```ts
// pulse-alert-digest — weekly Monday email digest.
// Runs hourly Mon 09–17 UTC; idempotent via digest_sent_at stamp.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";
import { verifyCronAuth } from "../_shared/cron_auth.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") || "";
const FROM_EMAIL = Deno.env.get("PULSE_DIGEST_FROM_EMAIL") || "Pulse <pulse@logisticintel.com>";

serve(async (req) => {
  const auth = verifyCronAuth(req);
  if (!auth.ok) return auth.response;
  if (!RESEND_API_KEY) return new Response("RESEND_API_KEY not set", { status: 500 });

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  // 1. Pull unsent alerts from past 14d.
  const fourteenDaysAgo = new Date(Date.now() - 14 * 86400 * 1000).toISOString();
  const { data: alerts } = await supabase
    .from("lit_pulse_alerts")
    .select("id, user_id, source_company_key, alert_type, severity, payload, created_at")
    .is("digest_sent_at", null)
    .gte("created_at", fourteenDaysAgo);
  if (!alerts || alerts.length === 0) {
    return json({ ok: true, sent: 0, reason: "no_alerts" });
  }

  // 2. Group by user_id.
  const byUser = new Map<string, any[]>();
  for (const a of alerts) {
    if (!byUser.has(a.user_id)) byUser.set(a.user_id, []);
    byUser.get(a.user_id)!.push(a);
  }

  // 3. Fetch prefs + emails for these users.
  const userIds = Array.from(byUser.keys());
  const { data: prefsRows } = await supabase
    .from("lit_user_alert_prefs")
    .select("user_id, volume_alerts, shipment_alerts, lane_alerts, benchmark_alerts, paused_until, unsubscribe_token")
    .in("user_id", userIds);
  const prefsByUser = new Map((prefsRows || []).map((r: any) => [r.user_id, r]));

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, email, first_name")
    .in("id", userIds);
  const profileByUser = new Map((profiles || []).map((r: any) => [r.id, r]));

  // 4. For each user, filter, render, send.
  let sent = 0;
  const sentAlertIds: string[] = [];
  const suppressedAlertIds: string[] = [];

  for (const [userId, userAlerts] of byUser.entries()) {
    const prefs = prefsByUser.get(userId) || {
      volume_alerts: true, shipment_alerts: true, lane_alerts: true,
      benchmark_alerts: false, paused_until: null, unsubscribe_token: null,
    };
    const profile = profileByUser.get(userId);
    if (!profile?.email) continue;

    // Paused?
    if (prefs.paused_until && new Date(prefs.paused_until) > new Date()) {
      suppressedAlertIds.push(...userAlerts.map((a: any) => a.id));
      continue;
    }

    const filtered = userAlerts.filter((a: any) =>
      (a.alert_type === "volume"    && prefs.volume_alerts) ||
      (a.alert_type === "shipment"  && prefs.shipment_alerts) ||
      (a.alert_type === "lane"      && prefs.lane_alerts) ||
      (a.alert_type === "benchmark" && prefs.benchmark_alerts) ||
      (a.alert_type === "baseline")
    );

    const suppressed = userAlerts.filter((a: any) => !filtered.includes(a));
    suppressedAlertIds.push(...suppressed.map((a: any) => a.id));

    if (filtered.length === 0) continue;

    const html = renderDigestHtml(profile, filtered, prefs.unsubscribe_token || "");
    const result = await sendResend(profile.email, html, prefs.unsubscribe_token || "");
    if (result.ok) {
      sentAlertIds.push(...filtered.map((a: any) => a.id));
      sent++;
    } else {
      // Bump send attempts.
      await supabase.from("lit_pulse_alerts").update({
        digest_send_attempts: (filtered[0].digest_send_attempts || 0) + 1,
        digest_last_error: result.error,
      }).in("id", filtered.map((a: any) => a.id));
    }
  }

  // 5. Mark sent + suppressed.
  if (sentAlertIds.length > 0) {
    await supabase.from("lit_pulse_alerts").update({ digest_sent_at: new Date().toISOString() }).in("id", sentAlertIds);
  }
  if (suppressedAlertIds.length > 0) {
    await supabase.from("lit_pulse_alerts").update({
      digest_sent_at: new Date().toISOString(),
      digest_last_error: "suppressed_by_user_pref",
    }).in("id", suppressedAlertIds);
  }

  return json({ ok: true, sent, alerts_sent: sentAlertIds.length, suppressed: suppressedAlertIds.length });
});

function renderDigestHtml(profile: any, alerts: any[], unsubscribeToken: string): string {
  // Match docs/mockups/pulse-digest-sample.html shape exactly.
  // Bucket alerts by type, then render the section for each non-empty bucket.
  const buckets = {
    volume: alerts.filter(a => a.alert_type === "volume"),
    shipment: alerts.filter(a => a.alert_type === "shipment"),
    lane: alerts.filter(a => a.alert_type === "lane"),
    benchmark: alerts.filter(a => a.alert_type === "benchmark"),
    baseline: alerts.filter(a => a.alert_type === "baseline"),
  };
  const firstName = profile.first_name || "there";
  const unsubUrl = `https://www.logisticintel.com/api/unsubscribe?token=${encodeURIComponent(unsubscribeToken)}`;

  // Build sections — see mockup file for exact HTML structure.
  // (For brevity in this plan, the implementation should mirror the mockup
  //  HTML, swapping the hardcoded company names/numbers for {{alert.payload.*}}
  //  template substitutions. Keep all inline styles byte-identical.)
  return buildDigestHtml({ firstName, buckets, unsubUrl, dateLabel: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) });
}

function buildDigestHtml(_args: any): string {
  // TODO during implementation: port docs/mockups/pulse-digest-sample.html
  // verbatim, then thread alert payload values into each card.
  return "<html><body>placeholder — see Task 10 step 2</body></html>";
}

async function sendResend(toEmail: string, html: string, unsubscribeToken: string): Promise<{ ok: boolean; error?: string }> {
  const unsubUrl = `https://www.logisticintel.com/api/unsubscribe?token=${encodeURIComponent(unsubscribeToken)}`;
  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: toEmail,
      subject: "Your weekly Pulse digest",
      html,
      headers: {
        "List-Unsubscribe": `<${unsubUrl}>, <mailto:unsubscribe@logisticintel.com>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    }),
  });
  if (resp.ok) return { ok: true };
  const text = await resp.text().catch(() => "");
  return { ok: false, error: `resend_${resp.status}: ${text.slice(0, 200)}` };
}

function json(body: any) {
  return new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } });
}
```

- [ ] **Step 2:** Replace the `buildDigestHtml` placeholder with a real template-render function that mirrors `docs/mockups/pulse-digest-sample.html` byte-identically (same inline styles, same section structure). Use template literals with safe string-escaping for any user-supplied content (`htmlEscape(payload.company_name)`).

- [ ] **Step 3:** Deploy via Supabase MCP:

```
mcp__claude_ai_Supabase__deploy_edge_function
  name: pulse-alert-digest
  verify_jwt: false
  files: [index.ts, _shared/cron_auth.ts]
```

- [ ] **Step 4:** Manual smoke test — invoke against your own user:

```bash
# First, seed a fake alert row for your own user_id:
INSERT INTO public.lit_pulse_alerts (user_id, source_company_key, alert_type, severity, payload)
VALUES ('<your_user_id>', 'panasonic-automotive-systems', 'volume', 'warning',
  '{"company_name":"Panasonic Automotive Systems","before":136,"after":169,"abs_delta":33,"pct_delta":0.243}');

# Then trigger the digest fn:
curl -X POST "https://jkmrfiaefxwgbvftohrb.supabase.co/functions/v1/pulse-alert-digest" \
  -H "X-Internal-Cron: <secret>" \
  -H "Content-Type: application/json" \
  -d '{}'
```

Expected: `{"ok":true,"sent":1,"alerts_sent":1,...}` and you receive the email in your inbox matching the mockup.

- [ ] **Step 5:** Commit:

```bash
git add supabase/functions/pulse-alert-digest/index.ts
git commit -m "feat(pulse): pulse-alert-digest edge fn + Resend send"
```

---

## Task 11: pulse-digest-preview — dry-run for settings page button

**Files:**
- Create: `supabase/functions/pulse-digest-preview/index.ts`

- [ ] **Step 1:** Write a minimal edge fn that takes the caller's JWT (NOT cron-auth), resolves their user_id, queries their would-be-included alerts under current prefs, renders the HTML, and returns it as a JSON-wrapped string (so the frontend can `dangerouslySetInnerHTML` it inside an iframe).

```ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors() });
  const auth = req.headers.get("Authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "");
  const supaAuth = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    global: { headers: token ? { Authorization: `Bearer ${token}` } : {} },
  });
  const { data: userResp } = await supaAuth.auth.getUser(token);
  const userId = userResp?.user?.id;
  if (!userId) return json({ ok: false, error: "unauthorized" }, 401);

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  // Use the SAME render function from pulse-alert-digest. For DRY, the render
  // can live in a _shared/digest_render.ts (created during Task 10 step 2).
  const fourteenDaysAgo = new Date(Date.now() - 14 * 86400 * 1000).toISOString();
  const { data: alerts } = await supabase
    .from("lit_pulse_alerts")
    .select("*")
    .eq("user_id", userId)
    .gte("created_at", fourteenDaysAgo);

  const { data: prefs } = await supabase
    .from("lit_user_alert_prefs")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  const filtered = (alerts || []).filter((a: any) =>
    (a.alert_type === "volume"    && prefs?.volume_alerts ?? true) ||
    (a.alert_type === "shipment"  && prefs?.shipment_alerts ?? true) ||
    (a.alert_type === "lane"      && prefs?.lane_alerts ?? true) ||
    (a.alert_type === "benchmark" && prefs?.benchmark_alerts ?? false) ||
    (a.alert_type === "baseline")
  );

  const { data: profile } = await supabase.from("profiles").select("first_name").eq("id", userId).maybeSingle();
  // renderDigestHtml() should be the EXACT same function used by pulse-alert-digest.
  // Recommend extracting into supabase/functions/_shared/digest_render.ts and importing here.
  const html = renderPreview(profile, filtered, prefs?.unsubscribe_token || "");
  return json({ ok: true, html, alert_count: filtered.length });
});

function renderPreview(profile: any, alerts: any[], unsub: string): string {
  // Identical to pulse-alert-digest's renderDigestHtml.
  return "<html><body>preview placeholder — share renderer with digest fn</body></html>";
}

function json(body: any, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors(), "Content-Type": "application/json" } });
}
function cors() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  };
}
```

- [ ] **Step 2:** Refactor so `pulse-alert-digest` AND `pulse-digest-preview` import a shared `_shared/digest_render.ts` module. Replace the two placeholder `renderPreview` / `renderDigestHtml` functions with that shared import. The render module owns the HTML template.

- [ ] **Step 3:** Deploy `_shared/digest_render.ts` (just exports a function — no own serve handler) AND re-deploy `pulse-alert-digest` + `pulse-digest-preview` so they import the shared file.

- [ ] **Step 4:** Smoke-test the preview from the dashboard (or via curl with your user JWT):

```bash
curl -X POST "https://jkmrfiaefxwgbvftohrb.supabase.co/functions/v1/pulse-digest-preview" \
  -H "Authorization: Bearer <your_user_jwt>" \
  -H "Content-Type: application/json" -d '{}'
```

Expected: `{"ok":true,"html":"<!DOCTYPE html...","alert_count":N}`.

- [ ] **Step 5:** Commit:

```bash
git add supabase/functions/pulse-digest-preview/index.ts supabase/functions/_shared/digest_render.ts
git commit -m "feat(pulse): pulse-digest-preview dry-run + shared render module"
```

---

## Task 12: freightos-benchmark-sync — edge function

**Files:**
- Create: `supabase/functions/freightos-benchmark-sync/index.ts`

- [ ] **Step 1:** Write the function:

```ts
// freightos-benchmark-sync — weekly Tuesday 15:03 UTC.
// Scrapes the FBX composite + 12 lane pages from freightos.com, parses rates
// from server-rendered HTML, validates, upserts into lit_benchmark_rates.
//
// HARD RULE: rate_usd values NEVER flow into any LLM prompt (Freightos ToS §2.10).

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";
import { verifyCronAuth } from "../_shared/cron_auth.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type Lane = { code: string; url: string; label: string };

const COMPOSITE: Lane = {
  code: "fbx-composite",
  url: "https://www.freightos.com/enterprise/terminal/freightos-baltic-index-global-container-pricing-index/",
  label: "FBX Composite",
};
const LANES: Lane[] = [
  { code: "fbx-01", url: "https://www.freightos.com/enterprise/terminal/fbx-01-china-to-north-america-west-coast/", label: "FBX01: China → NA West Coast" },
  { code: "fbx-02", url: "https://www.freightos.com/enterprise/terminal/fbx-02-north-america-west-coast-to-china/", label: "FBX02: NA West Coast → China" },
  { code: "fbx-03", url: "https://www.freightos.com/enterprise/terminal/fbx-03-china-to-north-america-east-coast/", label: "FBX03: China → NA East Coast" },
  { code: "fbx-04", url: "https://www.freightos.com/enterprise/terminal/fbx-04-north-america-east-coast-to-china/", label: "FBX04: NA East Coast → China" },
  { code: "fbx-11", url: "https://www.freightos.com/enterprise/terminal/fbx-11-china-to-northern-europe/", label: "FBX11: China → N. Europe" },
  { code: "fbx-12", url: "https://www.freightos.com/enterprise/terminal/fbx-12-northern-europe-to-china/", label: "FBX12: N. Europe → China" },
  { code: "fbx-13", url: "https://www.freightos.com/enterprise/terminal/fbx-13-china-to-mediterranean/", label: "FBX13: China → Mediterranean" },
  { code: "fbx-14", url: "https://www.freightos.com/enterprise/terminal/fbx-14-mediterranean-to-china/", label: "FBX14: Mediterranean → China" },
  { code: "fbx-21", url: "https://www.freightos.com/enterprise/terminal/fbx-21-north-america-east-coast-to-northern-europe/", label: "FBX21: NA East → N. Europe" },
  { code: "fbx-22", url: "https://www.freightos.com/enterprise/terminal/fbx-22-northern-europe-to-north-america-east-coast/", label: "FBX22: N. Europe → NA East" },
  { code: "fbx-25", url: "https://www.freightos.com/enterprise/terminal/fbx-25-northern-europe-to-south-america-east-coast/", label: "FBX25: N. Europe → SA East" },
  { code: "fbx-26", url: "https://www.freightos.com/enterprise/terminal/fbx-26-south-america-east-coast-to-northern-europe/", label: "FBX26: SA East → N. Europe" },
];

serve(async (req) => {
  const auth = verifyCronAuth(req);
  if (!auth.ok) return auth.response;

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const all = [COMPOSITE, ...LANES];

  const parsed: Array<{ lane: Lane; rate_usd: number; volatility_pct: number | null }> = [];
  for (const lane of all) {
    try {
      const html = await fetch(lane.url, { redirect: "follow" }).then(r => r.text());
      const rate = parseRateFromHtml(html);
      if (rate && rate.rate_usd > 0) parsed.push({ lane, ...rate });
    } catch (err) {
      console.error(`[freightos] ${lane.code} fetch failed:`, err?.message || err);
    }
  }

  // Validation gate — never overwrite good rates with garbage.
  const expected = all.length;
  if (parsed.length < Math.floor(expected * 0.5)) {
    await logJobError(supabase, "freightos_parse_failure", { found: parsed.length, expected });
    return json({ ok: false, error: "parse_failure_aborted", found: parsed.length, expected });
  }

  // Upsert.
  const weekOf = mondayOf(new Date());
  const rows = parsed.map(p => ({
    week_of: weekOf,
    lane: p.lane.label,
    lane_code: p.lane.code,
    mode: "FCL_40HC",
    rate_usd: p.rate_usd,
    volatility_pct: p.volatility_pct,
    source_url: p.lane.url,
    parse_confidence: 1.0,
  }));
  const { error } = await supabase.from("lit_benchmark_rates").upsert(rows, { onConflict: "week_of,lane_code,mode" });
  if (error) {
    await logJobError(supabase, "freightos_upsert_failed", { error: error.message });
    return json({ ok: false, error: error.message });
  }

  // Fire benchmark alerts for lanes that moved ≥10% WoW.
  const alertsCreated = await fireBenchmarkAlerts(supabase, parsed, weekOf);

  return json({ ok: true, parsed: parsed.length, alerts: alertsCreated });
});

function parseRateFromHtml(html: string): { rate_usd: number; volatility_pct: number | null } | null {
  // Targets phrases like: "Current FBX: $1,981.50" and "volatility 0.76%"
  const rateMatch = html.match(/Current\s+FBX[:\s]*\$?([0-9,]+\.?[0-9]*)/i);
  if (!rateMatch) return null;
  const rate_usd = Number(rateMatch[1].replace(/,/g, ""));
  if (!Number.isFinite(rate_usd) || rate_usd <= 0) return null;
  const volMatch = html.match(/volatility[:\s]*([0-9.]+)\s*%/i);
  const volatility_pct = volMatch ? Number(volMatch[1]) : null;
  return { rate_usd, volatility_pct };
}

function mondayOf(d: Date): string {
  const day = d.getUTCDay();
  const diff = (day + 6) % 7;
  const monday = new Date(d.getTime() - diff * 86400 * 1000);
  return monday.toISOString().slice(0, 10);
}

async function fireBenchmarkAlerts(supabase: any, parsed: any[], weekOf: string): Promise<number> {
  // For each lane, look up prior week's rate, compute WoW delta.
  const prevWeek = new Date(weekOf);
  prevWeek.setUTCDate(prevWeek.getUTCDate() - 7);
  const prevWeekStr = prevWeek.toISOString().slice(0, 10);
  const codes = parsed.map(p => p.lane.code);
  const { data: prior } = await supabase
    .from("lit_benchmark_rates")
    .select("lane_code, rate_usd")
    .eq("week_of", prevWeekStr)
    .in("lane_code", codes);
  const priorByCode = new Map((prior || []).map((r: any) => [r.lane_code, Number(r.rate_usd)]));

  const movers: any[] = [];
  for (const p of parsed) {
    const before = priorByCode.get(p.lane.code);
    if (!before || before <= 0) continue;
    const pct = (p.rate_usd - before) / before;
    if (Math.abs(pct) >= 0.10) {
      movers.push({ lane: p.lane, before, after: p.rate_usd, pct });
    }
  }
  if (movers.length === 0) return 0;

  // Fan out to all users with benchmark_alerts=true.
  const { data: optedIn } = await supabase
    .from("lit_user_alert_prefs")
    .select("user_id")
    .eq("benchmark_alerts", true);
  if (!optedIn || optedIn.length === 0) return 0;

  const rows: any[] = [];
  for (const u of optedIn) {
    for (const m of movers) {
      rows.push({
        user_id: u.user_id,
        source_company_key: null,
        alert_type: "benchmark",
        severity: Math.abs(m.pct) >= 0.25 ? "high" : "warning",
        payload: {
          lane: m.lane.label, lane_code: m.lane.code,
          before: m.before, after: m.after, pct,
          source_url: m.lane.url,
        },
      });
    }
  }
  await supabase.from("lit_pulse_alerts").insert(rows);
  return rows.length;
}

async function logJobError(supabase: any, source: string, payload: any) {
  await supabase.from("lit_job_errors").insert({ source, payload, occurred_at: new Date().toISOString() }).catch(() => {});
}

function json(body: any, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
```

- [ ] **Step 2:** Deploy via Supabase MCP `deploy_edge_function` with `verify_jwt: false` + files `[index.ts, _shared/cron_auth.ts]`.

- [ ] **Step 3:** Manual smoke-test:

```bash
curl -X POST "https://jkmrfiaefxwgbvftohrb.supabase.co/functions/v1/freightos-benchmark-sync" \
  -H "X-Internal-Cron: <secret>" -H "Content-Type: application/json" -d '{}'
```

Expected: `{"ok":true,"parsed":13,"alerts":N}` (13 = composite + 12 lanes). Verify:

```sql
SELECT week_of, lane_code, rate_usd FROM lit_benchmark_rates
WHERE week_of = (CURRENT_DATE - EXTRACT(dow FROM CURRENT_DATE)::int + 1) -- this week's Monday
ORDER BY lane_code;
```

Expected: 13 rows with real rate values.

- [ ] **Step 4:** Commit:

```bash
git add supabase/functions/freightos-benchmark-sync/index.ts
git commit -m "feat(pulse): freightos-benchmark-sync weekly scrape + WoW alerts"
```

---

## Task 13: Frontend — AlertPreferencesPanel.jsx

**Files:**
- Create: `frontend/src/features/notifications/AlertPreferencesPanel.jsx`
- Modify: `frontend/src/pages/Notifications.jsx` (or wherever `/app/notifications` route renders) to mount the panel at top

- [ ] **Step 1:** Write the panel:

```jsx
import { useEffect, useState } from "react";
import { Bell, Pause, Eye } from "lucide-react";
import { supabase } from "@/lib/supabase";

export default function AlertPreferencesPanel() {
  const [prefs, setPrefs] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewHtml, setPreviewHtml] = useState("");

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }
    const { data } = await supabase.from("lit_user_alert_prefs").select("*").eq("user_id", user.id).maybeSingle();
    setPrefs(data || {
      user_id: user.id, volume_alerts: true, shipment_alerts: true,
      lane_alerts: true, benchmark_alerts: false, paused_until: null,
    });
    setLoading(false);
  }

  async function save(updates) {
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    const merged = { ...prefs, ...updates, user_id: user.id, updated_at: new Date().toISOString() };
    const { error } = await supabase.from("lit_user_alert_prefs").upsert(merged, { onConflict: "user_id" });
    if (!error) setPrefs(merged);
    setSaving(false);
  }

  async function openPreview() {
    setPreviewOpen(true);
    setPreviewHtml("<p style='padding:24px;text-align:center;color:#64748B;'>Loading preview…</p>");
    const { data } = await supabase.functions.invoke("pulse-digest-preview", { body: {} });
    setPreviewHtml(data?.html || "<p style='padding:24px;text-align:center;'>No alerts to preview.</p>");
  }

  if (loading) return null;

  return (
    <div className="rounded-[14px] border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <Bell className="h-4 w-4 text-blue-600" />
        <h2 className="font-display text-[14px] font-bold text-slate-900">Alert preferences</h2>
      </div>

      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        <ToggleRow label="Volume changes" desc="≥20% or ≥5 new shipments" checked={prefs.volume_alerts} onChange={(v) => save({ volume_alerts: v })} disabled={saving} />
        <ToggleRow label="New shipments" desc="Fresh BOLs since last refresh" checked={prefs.shipment_alerts} onChange={(v) => save({ shipment_alerts: v })} disabled={saving} />
        <ToggleRow label="Trade lanes" desc="New routes or surges" checked={prefs.lane_alerts} onChange={(v) => save({ lane_alerts: v })} disabled={saving} />
        <ToggleRow label="Benchmark rate movers" desc="FBX lane shifts ≥10% WoW" checked={prefs.benchmark_alerts} onChange={(v) => save({ benchmark_alerts: v })} disabled={saving} />
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
        <button
          type="button"
          onClick={openPreview}
          className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-[12px] font-semibold text-slate-700 hover:bg-slate-50"
        >
          <Eye className="h-3 w-3" /> Preview my next digest
        </button>
        <PauseControl prefs={prefs} onSave={save} />
      </div>

      {previewOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4" onClick={() => setPreviewOpen(false)}>
          <div className="relative max-h-[90vh] w-full max-w-[640px] overflow-y-auto rounded-lg bg-white" onClick={(e) => e.stopPropagation()}>
            <iframe srcDoc={previewHtml} className="h-[800px] w-full border-0" />
            <button onClick={() => setPreviewOpen(false)} className="absolute right-2 top-2 rounded-md bg-white px-2 py-1 text-sm shadow">Close</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ToggleRow({ label, desc, checked, onChange, disabled }) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-md border border-slate-100 bg-slate-50 px-3 py-2.5">
      <div className="min-w-0 flex-1">
        <div className="font-display text-[12.5px] font-semibold text-slate-900">{label}</div>
        <div className="font-body text-[11px] text-slate-500">{desc}</div>
      </div>
      <input
        type="checkbox"
        checked={!!checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
        className="h-4 w-4 accent-blue-600"
      />
    </label>
  );
}

function PauseControl({ prefs, onSave }) {
  const paused = prefs.paused_until && new Date(prefs.paused_until) > new Date();
  return (
    <button
      type="button"
      onClick={() => {
        if (paused) onSave({ paused_until: null });
        else {
          const oneWeek = new Date(Date.now() + 7 * 86400 * 1000).toISOString();
          onSave({ paused_until: oneWeek });
        }
      }}
      className="inline-flex items-center gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-3 py-1.5 text-[12px] font-semibold text-amber-700 hover:bg-amber-100"
    >
      <Pause className="h-3 w-3" />
      {paused ? `Paused until ${new Date(prefs.paused_until).toLocaleDateString()} — Resume` : "Pause all for 7 days"}
    </button>
  );
}
```

- [ ] **Step 2:** Find the existing `/app/notifications` page in `frontend/src/pages/` or `frontend/src/features/notifications/`. Mount `<AlertPreferencesPanel />` at the top of that page, above the existing inbox list.

```bash
grep -rn "notifications" frontend/src/pages/ frontend/src/App.jsx | head
```

- [ ] **Step 3:** Build + deploy frontend:

```bash
npx vercel deploy --prod --yes --cwd "."
```

- [ ] **Step 4:** Visit `https://app.logisticintel.com/app/notifications` in a logged-in browser session. Confirm:
   - Panel renders at top with 4 toggles
   - Toggling a switch persists (refresh page → state retained)
   - "Pause all for 7 days" sets `paused_until` 7d in future, shows "Resume" CTA
   - "Preview my next digest" opens an iframe modal with the digest HTML

- [ ] **Step 5:** Commit:

```bash
git add frontend/src/features/notifications/AlertPreferencesPanel.jsx frontend/src/pages/Notifications.jsx
git commit -m "feat(pulse): AlertPreferencesPanel with 4 toggles + pause + digest preview"
```

---

## Task 14: Frontend — Benchmark display reads from lit_benchmark_rates

**Files:**
- Locate + modify: whichever component currently embeds Freightos rates (likely under `frontend/src/features/benchmark/` or `frontend/src/pages/Benchmark.jsx` — locate with `grep -rn freightos frontend/src/`)

- [ ] **Step 1:** Identify the existing benchmark component:

```bash
grep -rn "freightos\|FBX\|benchmark" frontend/src/pages/ frontend/src/features/ 2>&1 | head -20
```

- [ ] **Step 2:** Replace the existing Freightos embed (iframe or similar) with a query to `lit_benchmark_rates`:

```jsx
const { data: rates } = await supabase
  .from("lit_benchmark_rates")
  .select("*")
  .order("week_of", { ascending: false })
  .order("lane_code", { ascending: true })
  .limit(13); // composite + 12 lanes for the most recent week
```

Render a table with: lane, rate_usd, volatility_pct, "fetched X days ago" stamp. Below the table, mandatory attribution:

```jsx
<p className="font-body text-[10.5px] text-slate-400 mt-3">
  Source:{' '}
  <a href="https://www.freightos.com/enterprise/terminal/freightos-baltic-index-global-container-pricing-index/" target="_blank" rel="noreferrer" className="underline">
    Freightos Baltic Index
  </a>
  {' · '}rates updated weekly
</p>
```

- [ ] **Step 3:** Add a stale-data banner when most recent `fetched_at > 14 days`:

```jsx
{mostRecentFetchAge > 14 ? (
  <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
    Benchmark data is {Math.floor(mostRecentFetchAge)} days old. Most recent successful sync: {new Date(mostRecentFetchedAt).toLocaleDateString()}.
  </div>
) : null}
```

- [ ] **Step 4:** Deploy frontend.

- [ ] **Step 5:** Visit the benchmark page in a logged-in browser. Confirm:
   - 13 rows render with real Freightos values
   - "Source: Freightos Baltic Index" + link is visible
   - Stale banner is NOT shown (fresh data from Task 12's first sync)

- [ ] **Step 6:** Commit:

```bash
git add frontend/src/pages/Benchmark.jsx  # or whichever file
git commit -m "feat(pulse): benchmark page reads from lit_benchmark_rates with Freightos attribution"
```

---

## Task 15: Cron schedule — 3 new jobs + retarget 2 existing

**Files:**
- Create: `supabase/migrations/20260514100300_pulse_cron_jobs.sql`

- [ ] **Step 1:** **PREREQUISITE:** Set `app.lit_cron_secret` in Supabase Dashboard → Project Settings → Database → Custom Postgres Config. Use a strong random value (e.g. `openssl rand -hex 32`). Also set `LIT_CRON_SECRET` env var with the SAME value in each of the three edge fns (`pulse-refresh-tick`, `pulse-alert-digest`, `freightos-benchmark-sync`) via Supabase Dashboard → Edge Functions → Secrets.

- [ ] **Step 2:** Write the migration:

```sql
BEGIN;

-- New job: pulse-refresh-tick every 15 min.
SELECT cron.unschedule('lit-pulse-refresh-tick') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='lit-pulse-refresh-tick');
SELECT cron.schedule('lit-pulse-refresh-tick', '*/15 * * * *', $$
  SELECT net.http_post(
    url := 'https://jkmrfiaefxwgbvftohrb.supabase.co/functions/v1/pulse-refresh-tick',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Internal-Cron', current_setting('app.lit_cron_secret', true)
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
$$);

-- New job: pulse-alert-digest hourly Mon 09–17 UTC.
SELECT cron.unschedule('lit-pulse-alert-digest') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='lit-pulse-alert-digest');
SELECT cron.schedule('lit-pulse-alert-digest', '7 9-17 * * 1', $$
  SELECT net.http_post(
    url := 'https://jkmrfiaefxwgbvftohrb.supabase.co/functions/v1/pulse-alert-digest',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Internal-Cron', current_setting('app.lit_cron_secret', true)
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
$$);

-- New job: freightos-benchmark-sync Tuesday 15:03 UTC.
SELECT cron.unschedule('lit-freightos-benchmark-sync') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='lit-freightos-benchmark-sync');
SELECT cron.schedule('lit-freightos-benchmark-sync', '3 15 * * 2', $$
  SELECT net.http_post(
    url := 'https://jkmrfiaefxwgbvftohrb.supabase.co/functions/v1/freightos-benchmark-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Internal-Cron', current_setting('app.lit_cron_secret', true)
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
$$);

-- Retarget existing freight-rate-fetcher-weekly to shared-secret pattern.
SELECT cron.unschedule('freight-rate-fetcher-weekly') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='freight-rate-fetcher-weekly');
SELECT cron.schedule('freight-rate-fetcher-weekly', '0 16 * * 1', $$
  SELECT net.http_post(
    url := 'https://jkmrfiaefxwgbvftohrb.supabase.co/functions/v1/freight-rate-fetcher',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Internal-Cron', current_setting('app.lit_cron_secret', true)
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
$$);

-- Retarget existing lit-subscription-email-cron to shared-secret pattern.
SELECT cron.unschedule('lit-subscription-email-cron') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='lit-subscription-email-cron');
SELECT cron.schedule('lit-subscription-email-cron', '0 10 * * *', $$
  SELECT net.http_post(
    url := 'https://jkmrfiaefxwgbvftohrb.supabase.co/functions/v1/subscription-email-cron',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Internal-Cron', current_setting('app.lit_cron_secret', true)
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
$$);

COMMIT;
```

- [ ] **Step 3:** **DO NOT apply yet.** First, update `freight-rate-fetcher` and `subscription-email-cron` edge fns to use `verifyCronAuth` from `_shared/cron_auth.ts` instead of their current bearer-service-role pattern. Each fn gets a 2-line change at the top of its `serve()` handler (mirror Task 7's pattern).

- [ ] **Step 4:** Deploy the updated `freight-rate-fetcher` and `subscription-email-cron` edge fns (so they accept the new header before the cron retargets to it).

- [ ] **Step 5:** NOW apply the migration via `apply_migration`. Verify:

```sql
SELECT jobname, schedule FROM cron.job ORDER BY jobname;
```

Expected: 3 new jobs listed; 2 existing jobs unchanged in schedule but their command body now uses `X-Internal-Cron`.

- [ ] **Step 6:** Wait for the next 15-min tick (or `SELECT cron.schedule` invokes immediately for the new ones). Check:

```sql
SELECT * FROM lit_saved_company_refresh_runs ORDER BY started_at DESC LIMIT 3;
```

Expected: at least one row with `finished_at` set, `processed_count > 0`.

- [ ] **Step 7:** Commit:

```bash
git add supabase/migrations/20260514100300_pulse_cron_jobs.sql supabase/functions/freight-rate-fetcher/index.ts supabase/functions/subscription-email-cron/index.ts
git commit -m "feat(pulse): cron schedule 3 new jobs + retarget 2 existing to shared-secret pattern"
```

---

## Task 16: Pre-launch verification + enable production cron

- [ ] **Step 1:** Verify all pre-launch checklist items from the spec:

```bash
# 1. Mockup approved (you confirm verbally — file exists at docs/mockups/pulse-digest-sample.html)
ls docs/mockups/pulse-digest-sample.html

# 2. ImportYeti API agreement signed (you confirm)
# 3. Postgres GUC set:
psql ... -c "SELECT current_setting('app.lit_cron_secret', true);"
# Expected: non-empty string

# 4. Env var set on all three edge fns:
# (verify in Supabase Dashboard → Edge Functions → each fn → Secrets tab)

# 5. Existing crons retargeted: confirm freight-rate-fetcher last run succeeded
psql ... -c "SELECT runid, command_text, return_message FROM cron.job_run_details WHERE jobid IN (SELECT jobid FROM cron.job WHERE jobname IN ('freight-rate-fetcher-weekly','lit-subscription-email-cron')) ORDER BY start_time DESC LIMIT 5;"
# Expected: most recent runs show 200 status, not 401

# 6. lit_user_alert_prefs seeded (verified in Task 2)

# 7. Resend RESEND_API_KEY (NOT LIT_RESEND_API_KEY) used for digests — verify env var in pulse-alert-digest

# 8. Test send to founder inbox (manual trigger from Task 10 step 4)

# 9. lit_benchmark_rates populated:
psql ... -c "SELECT count(*) FROM lit_benchmark_rates WHERE week_of >= CURRENT_DATE - INTERVAL '7 days';"
# Expected: ≥ 13

# 10. Unsubscribe URL deployed + tested (verified in Task 9 step 3)
```

- [ ] **Step 2:** If any item is incomplete, STOP and resolve before proceeding.

- [ ] **Step 3:** Let the rolling refresh tick run for one full cycle (15 min) and verify telemetry:

```sql
SELECT
  (SELECT count(*) FROM lit_saved_company_refresh_runs WHERE started_at >= NOW() - INTERVAL '1 hour') AS recent_ticks,
  (SELECT sum(processed_count) FROM lit_saved_company_refresh_runs WHERE started_at >= NOW() - INTERVAL '1 hour') AS companies_processed,
  (SELECT sum(error_count) FROM lit_saved_company_refresh_runs WHERE started_at >= NOW() - INTERVAL '1 hour') AS errors,
  (SELECT count(*) FROM lit_pulse_alerts WHERE created_at >= NOW() - INTERVAL '1 hour') AS new_alerts;
```

Expected: `recent_ticks ≥ 4`, `companies_processed > 0`, `errors = 0`, `new_alerts ≥ 0`.

- [ ] **Step 4:** Final smoke: send yourself a test digest with at least 3 alert types and verify the email matches `docs/mockups/pulse-digest-sample.html`. Click the unsubscribe link → confirm prefs flip off. Re-enable prefs in the settings panel for next week's test.

- [ ] **Step 5:** Commit pre-launch verification notes:

```bash
git commit --allow-empty -m "chore(pulse): pre-launch checklist verified — cron LIVE"
```

- [ ] **Step 6:** Announce in #ops or DM to founder: "Pulse refresh + alert digest + Freightos benchmark sync is now live. Refresh tick every 15 min, digest Mon 09–17 UTC retry window, Freightos scrape Tuesday 15:03 UTC. First user-facing digest goes out next Monday."

---

## Self-review checklist (run after writing the full plan)

- [x] **Spec coverage:** every section/requirement in the spec maps to a task. Mapping:
  - Schema → Task 1, 2
  - Cron home (pg_cron + edge fns) → Task 7, 15
  - 14-day TTL bi-weekly → Task 7
  - 20 companies / 15 min → Task 7 (`BATCH_SIZE`, schedule)
  - Shared-secret cron auth → Task 3, 15
  - importyeti-proxy refactor → Task 4, 5
  - Advisory lock + SKIP LOCKED → Task 7 (lock RPC + pick query)
  - Per-company transaction order → Task 7 (`fetchAndUpsertSnapshot` writes snapshot first, alert insert second, no `last_refreshed_at` field — TTL lives on snapshot.updated_at which is updated atomically with the upsert)
  - Smart-default delta thresholds → Task 6
  - First-refresh silent baseline → Task 6 (returns single `baseline` candidate)
  - ImportYeti 404 → untrackable → Task 7 (`markUntrackable`)
  - Quota guard → DEFERRED to v2 follow-up (spec Section "Quota guard" allows admin-notify ping at 80%; not in v1 task list — flagged in Risks Accepted)
  - Weekly digest email → Task 10
  - Mid-week pause = prefs-at-send-time → Task 10 (paused_until check in filter)
  - Branded mockup gate → Task 8
  - Signed-token unsubscribe → Task 9, 10 (List-Unsubscribe header)
  - Free-trial users included with cap → Task 10 (filter runs for everyone; cap-3 + upsell footer is a follow-up to add in `digest_render.ts`)
  - Freightos scrape + validation gate → Task 12
  - Freightos ToS attribution + no LLM feed → Task 12 (code comment), Task 14 (attribution UI)
  - Settings panel `/app/notifications` → Task 13
  - Benchmark display → Task 14
  - Cron retarget for existing broken crons → Task 15

- [x] **Placeholder scan:** Reviewed for "TBD", "TODO", "fill in", "add error handling". Two intentional placeholders flagged:
  - Task 10 step 2: render function body — explicitly says "port docs/mockups/pulse-digest-sample.html verbatim" with sample code. Acceptable because the mockup file IS the spec for the rendered HTML.
  - Task 11 step 2: extract render into `_shared/digest_render.ts`. Acceptable because the shared file is defined inline; just needs to be created during implementation.

- [x] **Type consistency:** Function names checked across tasks:
  - `fetchAndUpsertSnapshot` (Task 4) called consistently in Task 5, Task 7
  - `computeAlertCandidates` (Task 6) called in Task 7
  - `verifyCronAuth` (Task 3) called in Task 7, 10, 12
  - `lit_pulse_alerts.alert_type` enum: `volume|shipment|lane|benchmark|baseline` consistent across schema (Task 1) and diff fn (Task 6)
  - `lit_user_alert_prefs` column names consistent across schema (Task 1), backfill (Task 2), digest (Task 10), preview (Task 11), panel (Task 13)

---

## v2 follow-ups (intentionally out of v1 scope)

- Per-user `digest_send_hour_local` + `digest_timezone` (TZ-aware delivery)
- Per-org weekly ImportYeti credit ceiling enforcement + admin panel burn-down
- Free-trial 3-alert cap + upsell footer in digest renderer
- ML/anomaly-based alert thresholds
- 60-day `lit_pulse_alerts` garbage-collection cron
- Per-company `watch_intensity` override (daily vs bi-weekly)
- Apify ImportYeti fallback path (only if direct API hits a wall)
