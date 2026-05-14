# Pulse refresh + alert digest + Freightos benchmark sync

**Date:** 2026-05-14
**Branch:** `claude/review-dashboard-deploy-3AmMD`
**Status:** Validated, awaiting user review of this spec before implementation-plan phase

## Goal

Three coupled scheduled jobs that keep LIT's freight data fresh and notify users when meaningful things change:

1. **Saved-company refresh** — every 14 days, every saved company in `lit_saved_companies` gets its ImportYeti snapshot refreshed. Deltas vs the prior snapshot generate alert rows.
2. **Weekly alert digest** — Monday 09:00 UTC, every user with non-empty alerts gets one branded email summarizing the week's volume / shipment / lane changes, filtered by their opt-in preferences.
3. **Freightos benchmark sync** — Tuesday 15:00 UTC, scrape the 12 FBX lane rates + composite from `freightos.com/enterprise/terminal/…`, upsert into `lit_benchmark_rates`. Fire benchmark alerts when a lane shifts ≥10% week-over-week.

## Pre-launch checklist (gates before flipping cron on)

1. **Branded email mockup approved** — `docs/mockups/pulse-digest-sample.html` reviewed and approved by founder before any cron sends anything live.
2. **ImportYeti sales contact** — written API agreement covering per-call pricing at ~22k calls/mo, rate-limit ceiling, and ToS for cached-derivative usage in a customer dashboard.
3. **Postgres GUC set** — `ALTER DATABASE postgres SET app.lit_cron_secret = '<value>'` set via Supabase Dashboard → Database → Custom Postgres Config.
4. **Existing broken crons migrated** — `freight-rate-fetcher-weekly` and `lit-subscription-email-cron` refactored to the shared-secret header pattern in the same migration.
5. **Resend plan verified** — current tier supports existing volume + ~800 new digest emails/month. (Likely already covered.)

## Architecture

Three independent pg_cron jobs trigger three new Supabase edge functions via `pg_net.http_post` with a shared-secret header. The functions share two helper modules (`_shared/importyeti_fetch.ts`, `_shared/alert_diff.ts`) and write to a small set of new tables. The existing `importyeti-proxy` is untouched — it keeps its user-JWT contract for on-demand user fetches.

```
pg_cron tick (every 15 min)
    └── pg_net.http_post → /functions/v1/pulse-refresh-tick
            ├── advisory lock + SKIP LOCKED claim of 20 oldest snapshots
            ├── for each: _shared/importyeti_fetch.ts → upsert snapshot
            ├── _shared/alert_diff.ts → insert lit_pulse_alerts rows per user
            └── log run to lit_saved_company_refresh_runs

pg_cron tick (Monday 09:00 UTC)
    └── pg_net.http_post → /functions/v1/pulse-alert-digest
            ├── group alerts by user_id, filter by lit_user_alert_prefs
            ├── HAVING count > 0
            ├── render branded HTML via shared template
            ├── Resend send per user
            └── stamp digest_sent_at on included alerts

pg_cron tick (Tuesday 15:00 UTC)
    └── pg_net.http_post → /functions/v1/freightos-benchmark-sync
            ├── fetch composite + 12 lane pages from freightos.com
            ├── parse, validate (≥50% of expected lanes, all rate_usd > 0)
            ├── ABORT batch if parse fails — never overwrite good data with garbage
            ├── upsert lit_benchmark_rates on success
            └── compute WoW deltas ≥10% → insert benchmark alert rows
```

## Schema changes

### New tables

**`lit_pulse_alerts`** — one row per (user, company, alert_type) per refresh delta.

```sql
CREATE TABLE public.lit_pulse_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_company_key text,            -- nullable for benchmark_alerts
  alert_type text NOT NULL CHECK (alert_type IN ('volume','shipment','lane','benchmark','baseline')),
  severity text NOT NULL DEFAULT 'info' CHECK (severity IN ('info','warning','high')),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  digest_sent_at timestamptz,
  dismissed_at timestamptz,
  digest_send_attempts int NOT NULL DEFAULT 0,
  digest_last_error text
);

CREATE INDEX lit_pulse_alerts_user_pending_idx
  ON public.lit_pulse_alerts (user_id, digest_sent_at)
  WHERE digest_sent_at IS NULL;

-- Garbage-collect alerts older than 60d (function + monthly cron, not in v1)

ALTER TABLE public.lit_pulse_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY lit_pulse_alerts_self_read ON public.lit_pulse_alerts
  FOR SELECT TO authenticated USING (user_id = auth.uid());
-- service_role full access via default role
```

**`lit_user_alert_prefs`** — per-user opt-in toggles + pause.

```sql
CREATE TABLE public.lit_user_alert_prefs (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  volume_alerts boolean NOT NULL DEFAULT true,
  shipment_alerts boolean NOT NULL DEFAULT true,
  lane_alerts boolean NOT NULL DEFAULT true,
  benchmark_alerts boolean NOT NULL DEFAULT false,  -- opt-in, lower personal relevance
  paused_until timestamptz,
  unsubscribe_token text UNIQUE,  -- signed token for List-Unsubscribe URL
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.lit_user_alert_prefs ENABLE ROW LEVEL SECURITY;
CREATE POLICY lit_user_alert_prefs_self ON public.lit_user_alert_prefs
  FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
```

Row auto-created on first read via `INSERT … ON CONFLICT DO NOTHING` from the digest fn.

**`lit_benchmark_rates`** — Freightos FBX rates by week × lane × mode.

```sql
CREATE TABLE public.lit_benchmark_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  week_of date NOT NULL,
  lane text NOT NULL,                 -- e.g. 'FBX01: China → NA West Coast'
  lane_code text,                     -- e.g. 'fbx-01'
  mode text NOT NULL DEFAULT 'FCL_40HC',
  rate_usd numeric(10,2) NOT NULL CHECK (rate_usd > 0),
  volatility_pct numeric(5,2),
  source_url text NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  parse_confidence numeric(3,2) NOT NULL DEFAULT 1.0,
  CONSTRAINT lit_benchmark_rates_unique UNIQUE (week_of, lane_code, mode)
);

CREATE INDEX lit_benchmark_rates_recent_idx
  ON public.lit_benchmark_rates (lane_code, week_of DESC);

-- Public read (rates are non-sensitive, attribution is required by Freightos ToS)
ALTER TABLE public.lit_benchmark_rates ENABLE ROW LEVEL SECURITY;
CREATE POLICY lit_benchmark_rates_read ON public.lit_benchmark_rates
  FOR SELECT TO authenticated USING (true);
```

**`lit_saved_company_refresh_runs`** — per-tick telemetry.

```sql
CREATE TABLE public.lit_saved_company_refresh_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  processed_count int NOT NULL DEFAULT 0,
  alert_count int NOT NULL DEFAULT 0,
  error_count int NOT NULL DEFAULT 0,
  importyeti_credits_used int NOT NULL DEFAULT 0,
  notes text
);
```

### Column adds

**`lit_importyeti_company_snapshot`**:
- `previous_parsed_summary jsonb` — copy of `parsed_summary` before each refresh, for diff. Backfilled NULL; first refresh after migration silent-baselines per-company.

**`lit_saved_companies`**:
- `refresh_status text NOT NULL DEFAULT 'active'` — `'active' | 'untrackable' | 'paused'`. Set to `'untrackable'` after 3 consecutive 404s from ImportYeti.
- `refresh_status_updated_at timestamptz`
- `consecutive_refresh_failures int NOT NULL DEFAULT 0`

## Pick query (the heart of the refresh tick)

```sql
-- Inside pulse-refresh-tick, after pg_try_advisory_lock succeeds:
WITH due AS (
  SELECT s.company_id AS slug
  FROM public.lit_importyeti_company_snapshot s
  WHERE s.updated_at < now() - interval '14 days'
    AND s.company_id IN (
      -- Subset to companies that are currently saved by at least one user,
      -- and not marked untrackable. lit_saved_companies stores uuid; we
      -- resolve to slug via the snapshot's company_id field which already
      -- matches the ImportYeti slug.
      SELECT DISTINCT sc.source_company_key
      FROM public.lit_saved_companies sc
      WHERE sc.source_company_key IS NOT NULL
        AND sc.refresh_status = 'active'
    )
  ORDER BY s.updated_at ASC NULLS FIRST
  LIMIT 20
  FOR UPDATE OF s SKIP LOCKED
)
SELECT slug FROM due;
```

**Edge case:** A saved company that has NEVER been fetched has no row in `lit_importyeti_company_snapshot`, so the `updated_at < ...` predicate misses it. Handle in two steps:
1. Above query for "stale existing snapshots"
2. Second query for "saved companies with no snapshot yet" (`LEFT JOIN ... WHERE s.company_id IS NULL LIMIT 20 - first_query.count`)

## Auth: shared-secret header pattern

Cron call:

```sql
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
```

Edge fn verification (first thing each handler does):

```ts
const expected = Deno.env.get("LIT_CRON_SECRET") || "";
const provided = req.headers.get("X-Internal-Cron") || "";
if (!expected || provided !== expected) {
  return new Response("forbidden", { status: 403 });
}
```

The same migration that adds `pulse-refresh-tick` retargets `freight-rate-fetcher-weekly` and `lit-subscription-email-cron` to this pattern. Both crons today are silently 401-ing because `app.settings.service_role_key` is unset on prod — this sweep fixes that bug along the way.

## Shared modules

### `_shared/importyeti_fetch.ts`

Extracts the upstream fetch + snapshot upsert from `importyeti-proxy` so the cron can call it without the user-JWT quota gate.

```ts
export async function fetchAndUpsertSnapshot(
  supabase: SupabaseClient,
  companySlug: string,
  env: { IMPORTYETI_API_KEY: string }
): Promise<{ snapshot: SnapshotRecord; previous: any; httpStatus: number }> {
  const { data: prev } = await supabase
    .from("lit_importyeti_company_snapshot")
    .select("parsed_summary")
    .eq("company_id", companySlug)
    .maybeSingle();

  const { data, status } = await fetchCompanyByIdUpstream(companySlug, env);
  if (status === 404) return { snapshot: null!, previous: prev?.parsed_summary ?? null, httpStatus: 404 };
  if (status >= 400) throw new Error(`importyeti_${status}`);

  const parsed = buildParsedSummary(data);
  const snapshot = {
    company_id: companySlug,
    raw_payload: data,
    parsed_summary: parsed,
    previous_parsed_summary: prev?.parsed_summary ?? null,
    updated_at: new Date().toISOString(),
  };
  await supabase.from("lit_importyeti_company_snapshot").upsert(snapshot, { onConflict: "company_id" });
  return { snapshot, previous: prev?.parsed_summary ?? null, httpStatus: 200 };
}
```

`importyeti-proxy/index.ts` is refactored to import + call this same module. Behavior unchanged from the user's perspective.

### `_shared/alert_diff.ts`

Pure function: given `(previous_parsed_summary, new_parsed_summary, intent_or_null)`, returns an array of `{alert_type, severity, payload}` rows that the caller inserts (with user_id fanned out across all users who saved the company).

Delta rules (smart defaults, no per-user tuning):

- **Volume alert** — fires when `(new.total_shipments - prev.total_shipments) / prev.total_shipments ≥ 0.20` OR `(new.total_shipments - prev.total_shipments) ≥ 5`. `severity='high'` if Δ≥50%, else `warning`.
- **Shipment alert** — fires when `new.shipments_last_12m > prev.shipments_last_12m` AND the delta represents new BOLs (last_shipment_date is more recent than prev).
- **Lane alert** — fires when:
  - A new origin→destination route appears in `top_routes` that wasn't in prev's top_routes (`alert_type='lane'`, `payload.kind='new_route'`)
  - An existing top-route's shipment count jumped ≥50% week-over-week (`payload.kind='lane_volume_surge'`)
- **Baseline (silent)** — when `previous_parsed_summary IS NULL`, generate ONE row with `alert_type='baseline'`, `severity='info'`. Digest renders these as "Now tracking: Acme Corp" if any exist; no diff alerts that week.

Each alert payload carries the before/after numbers, the route string (for lane alerts), and a relative-link path for the digest CTA.

## Per-company transaction order (failure recovery)

Inside the refresh tick, each company runs in its own transaction:

1. Compute new snapshot via `fetchAndUpsertSnapshot` (writes snapshot + previous_parsed_summary atomically)
2. Compute deltas via `alert_diff`
3. Fan out alerts to all users with that `source_company_key`:
   ```sql
   INSERT INTO lit_pulse_alerts (user_id, source_company_key, alert_type, severity, payload)
   SELECT DISTINCT sc.user_id, $1, $2, $3, $4
   FROM lit_saved_companies sc
   WHERE sc.source_company_key = $1 AND sc.refresh_status = 'active';
   ```
4. UPDATE `lit_saved_companies.last_alert_at = now()` for affected saves
5. Commit

If a transaction rolls back mid-flight, the snapshot stays at the prior `updated_at`, so the next tick re-picks the company and retries cleanly. No partial state.

If ImportYeti returns 404 three times in a row, set `refresh_status = 'untrackable'` and drop the row out of the pick query going forward.

## Digest fn: prefs-at-send-time + idempotency

Pseudo-flow:

```ts
1. Pull all unsent alerts in last 14 days: SELECT * FROM lit_pulse_alerts WHERE digest_sent_at IS NULL AND created_at >= now() - interval '14 days'
2. JOIN lit_user_alert_prefs by user_id (LEFT JOIN — missing row = all defaults, treat as opted-in to all)
3. Filter:
     - WHERE prefs.paused_until IS NULL OR prefs.paused_until < now()
     - WHERE (alert_type = 'volume'    AND prefs.volume_alerts) OR
             (alert_type = 'shipment'  AND prefs.shipment_alerts) OR
             (alert_type = 'lane'      AND prefs.lane_alerts) OR
             (alert_type = 'benchmark' AND prefs.benchmark_alerts) OR
             (alert_type = 'baseline')
4. GROUP BY user_id HAVING count(*) > 0
5. For each user with qualifying alerts:
     - Render HTML from shared template (see Email design below)
     - Resend send with List-Unsubscribe header
     - On 2xx: UPDATE alerts SET digest_sent_at = now() WHERE id IN (...)
     - On non-2xx: UPDATE digest_send_attempts = digest_send_attempts + 1, digest_last_error = '...'
6. Re-runnable every hour Mon 09:00-17:00 UTC via cron schedule `0 9-17 * * 1`; query naturally skips already-sent alerts. Stop retrying when digest_send_attempts ≥ 5.
```

Alerts that got suppressed by prefs at send-time are marked `digest_sent_at = now()` with `digest_last_error = 'suppressed_by_user_pref'` so they don't accumulate forever.

## Email design (branded sample required before live send)

Static HTML mockup gets committed to **`docs/mockups/pulse-digest-sample.html`** before any cron sends anything live. Founder reviews + approves. The template, once approved, becomes the literal Resend HTML in `pulse-alert-digest/index.ts`.

Required elements per Freightos ToS + CAN-SPAM + brand:

- LIT logo (cyan-on-dark, matches AppShell header treatment)
- Greeting with first name pulled from `profiles`
- One section per alert_type the user opted into, each with the smart-default delta description
- Inline preview of the top company (e.g. "Panasonic Automotive Systems · Peachtree City, GA · 136 shipments · +24% week-over-week")
- Per-row CTA → deep link to `/app/pulse?company={slug}` (or `/app/search?q={name}` for shipment data)
- Benchmark section (if opted in) with FBX composite + top 3 movers, **bearing "Source: Freightos Baltic Index — freightos.com/enterprise/terminal" attribution + link**
- Footer: physical address, unsubscribe URL with signed token, "Manage preferences" link to `/app/settings/notifications`
- `List-Unsubscribe: <https://app.logisticintel.com/api/unsubscribe?token=...>, <mailto:unsubscribe@logisticintel.com>` header
- `List-Unsubscribe-Post: List-Unsubscribe=One-Click` header (RFC 8058)

For free-trial users: cap visible alerts at 3 total, append upsell footer "You're seeing 3 of N alerts — upgrade to unlock all".

## Freightos benchmark sync

```ts
// freightos-benchmark-sync/index.ts pseudocode
const FBX_LANES = [
  { code: 'fbx-01', url: '.../fbx-01-china-to-north-america-west-coast/', label: 'FBX01: China → NA West Coast' },
  { code: 'fbx-02', url: '.../fbx-02-north-america-west-coast-to-china/', label: 'FBX02: NA West Coast → China' },
  // ... 10 more
];
const COMPOSITE_URL = '.../freightos-baltic-index-global-container-pricing-index/';

async function handler() {
  const parsed: ParsedRate[] = [];
  for (const lane of [composite, ...FBX_LANES]) {
    const html = await fetch(lane.url, { redirect: 'follow' }).then(r => r.text());
    const rate = parseRateFromHtml(html);  // looks for "Current FBX: $X,XXX.XX" + "volatility Y.YY%"
    if (rate) parsed.push({ ...lane, rate_usd: rate.usd, volatility_pct: rate.vol });
  }

  // VALIDATION GATE — never overwrite good data with garbage:
  if (parsed.length < FBX_LANES.length * 0.5) {
    await logJobError('freightos_parse_failure', { found: parsed.length, expected: FBX_LANES.length });
    await pingAdminNotify('Freightos sync degraded — manual refresh needed');
    return;
  }
  if (parsed.some(p => !(p.rate_usd > 0))) {
    await logJobError('freightos_parse_zero_rate', { sample: parsed.slice(0,3) });
    return;
  }

  // Only after validation passes: upsert
  await supabase.from('lit_benchmark_rates').upsert(
    parsed.map(p => ({ week_of: monday(now()), lane_code: p.code, lane: p.label, mode: 'FCL_40HC',
                       rate_usd: p.rate_usd, volatility_pct: p.volatility_pct, source_url: p.url })),
    { onConflict: 'week_of,lane_code,mode' }
  );

  // Detect WoW deltas ≥10% and fire benchmark alerts to opted-in users
  await fireBenchmarkAlertsForLanes(parsed);
}
```

Hard rule: **`rate_usd` values never flow into Pulse-Coach or any LLM prompt**. Per Freightos ToS §2.10. Enforce with a `// freightos:no-llm` code comment at every read site.

## Settings UI (frontend)

New route: **`/app/notifications`** already exists as the inbox. Extend it with a top panel "Alert preferences":

- 4 toggle switches (Volume / Shipment / Lane / Benchmark)
- "Pause all alerts until..." date picker (sets `paused_until`)
- "Preview my next digest" button — calls a dry-run endpoint that returns rendered HTML for the user's current alerts without sending
- Save → `UPSERT lit_user_alert_prefs`

## Quota guard

- Per-org weekly ImportYeti credit ceiling — new column `lit_orgs.importyeti_weekly_ceiling int DEFAULT 5000`
- Refresh tick: at start, compute `credits_used_this_week` from `lit_saved_company_refresh_runs` summed across the past 7 days. If `ceiling - used < batch_size`, log + defer to next tick.
- At 80% ceiling: admin-notify alert to founder
- Deferred companies stay deferred — their old `updated_at` keeps them at the front of next week's queue (natural priority)

## Cron schedule summary

| Job | Schedule (UTC) | Purpose |
|---|---|---|
| `lit-pulse-refresh-tick` | `*/15 * * * *` | 20 companies per tick, rolling 14-day pool |
| `lit-pulse-alert-digest` | `7 9-17 * * 1` | Send digest, retry hourly Mon 09-17 UTC, off-the-hour minute |
| `lit-freightos-benchmark-sync` | `3 15 * * 2` | Tuesday 15:03 UTC, catches FBX Tues 14:00 UTC publish |
| `lit-freight-rate-fetcher-weekly` (existing, retargeted) | unchanged schedule | Now uses shared-secret pattern |
| `lit-subscription-email-cron` (existing, retargeted) | unchanged schedule | Now uses shared-secret pattern |

## Out of scope (deferred to v2)

- Per-user timezone-aware digest scheduling (UTC for v1)
- ML / anomaly-based alert thresholds (smart defaults sufficient for v1)
- Snapshot-hash-based alert dedup (transaction ordering + advisory lock cover v1)
- Admin dashboard panel for credit burn-down / deferred-company visibility (v2 nice-to-have; v1 uses admin-notify pings at 80% ceiling)
- 60-day alert garbage collection cron (manual SQL until volume justifies)
- Per-company `watch_intensity` override (daily vs weekly per company)
- Apify ImportYeti fallback path (only triggered if direct API hits a wall)

## Pre-launch acceptance criteria

Cron does not fire live until ALL of these hold:

- [ ] `docs/mockups/pulse-digest-sample.html` reviewed + approved by founder
- [ ] ImportYeti API agreement signed with written pricing + ToS
- [ ] `app.lit_cron_secret` GUC set on prod
- [ ] `LIT_CRON_SECRET` env var set on all three new edge functions
- [ ] Existing `freight-rate-fetcher-weekly` + `lit-subscription-email-cron` migrated to shared-secret pattern and verified working
- [ ] `lit_user_alert_prefs` defaults seeded for all existing users (one-shot migration)
- [ ] Resend `RESEND_API_KEY` confirmed not the cold-outbound `LIT_RESEND_API_KEY`
- [ ] Test send to founder inbox renders correctly in Gmail + Outlook web
- [ ] `lit_benchmark_rates` populated with at least one week of real Freightos data before any benchmark alerts fire
- [ ] Unsubscribe URL endpoint (`/api/unsubscribe?token=…`) deployed and tested

## File touch list

New:
- `supabase/functions/_shared/importyeti_fetch.ts`
- `supabase/functions/_shared/alert_diff.ts`
- `supabase/functions/_shared/cron_auth.ts` (shared secret verification)
- `supabase/functions/pulse-refresh-tick/index.ts`
- `supabase/functions/pulse-alert-digest/index.ts`
- `supabase/functions/freightos-benchmark-sync/index.ts`
- `supabase/functions/pulse-digest-preview/index.ts` (dry-run for settings page preview button)
- `marketing/app/api/unsubscribe/route.ts` (signed-token unsubscribe handler) — OR an edge fn equivalent
- `supabase/migrations/20260514_pulse_refresh_schema.sql` (tables + columns + indexes + RLS)
- `supabase/migrations/20260514_cron_jobs_pulse.sql` (cron.schedule for 3 new + migrate 2 existing)
- `docs/mockups/pulse-digest-sample.html`
- `frontend/src/features/notifications/AlertPreferencesPanel.jsx` (4 toggles + pause + preview button)

Modified:
- `supabase/functions/importyeti-proxy/index.ts` — refactor IY fetch to use `_shared/importyeti_fetch.ts`
- `frontend/src/pages/Notifications.jsx` (or wherever `/app/notifications` renders) — mount AlertPreferencesPanel at top
- Any component that displays freight benchmark rates — read from `lit_benchmark_rates` instead of Freightos embed; add attribution

## Risks accepted

- ImportYeti pricing is currently undisclosed; design assumes a workable per-call price comes back from sales call. If pricing is prohibitive, fallback is the Apify `parseforge` actor at $30/1k (≈$650/mo at our volume) — workable but expensive.
- Freightos could paywall the `/enterprise/terminal/*` pages at any time. Mitigation: parser surfaces clear "fetch failed / stale data" banner, never silently shows old rates as current. Demo failure mode is visible, not silent.
- pg_cron edge-fn invocations use HTTP — if Supabase has a transient outage during a Monday digest window, the retry-hourly schedule (Mon 09-17 UTC) provides 9 attempts.
