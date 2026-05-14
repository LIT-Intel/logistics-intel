# Pulse LIVE — BOL Tracking, Drayage Opportunity & Branded Reports Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Each task is a separate subagent dispatch. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a "Pulse LIVE" tab with free carrier-direct BOL tracking (Maersk + Hapag-Lloyd), deterministic drayage cost estimation, branded PDF/Excel exports, and digest email enrichment — zero ongoing API cost.

**Architecture:** Six sequential sub-projects (A–F). Carrier-direct OAuth2 for tracking; OSRM + 2026 industry coefficients for drayage cost; jspdf-autotable + xlsx for client-side branded reports. All shared modules live under `supabase/functions/_shared/` and `frontend/src/lib/pulse/`. Vendor-neutrality rules from the prior digest work continue, with one addition: carrier names (Maersk/Hapag-Lloyd) ARE allowed in user-facing copy.

**Tech Stack:** Supabase edge functions (Deno), Postgres + pg_cron + pg_net, React + Vite, lucide-react, jspdf 3.x + jspdf-autotable, xlsx 0.18.x. No new runtime dependencies on the server.

**Branch:** All work stays on `claude/review-dashboard-deploy-3AmMD` (per project branch lock). One commit per task; merge to main happens after Task F4 ships.

**Spec:** [`docs/superpowers/specs/2026-05-14-pulse-live-bol-tracking-design.md`](../specs/2026-05-14-pulse-live-bol-tracking-design.md)

---

## File Structure

### Sub-project A — Shipment tab enrichment

**Modify:**
- `frontend/src/components/company/CompanyDrawer.tsx` — add POD, final destination, arrival date columns
- `frontend/src/components/company/CompanyShipmentsPanel.tsx` — same enrichment
- `frontend/src/components/company/Workspace.tsx` — same enrichment to the Shipments tab table
- `frontend/src/types/importyeti.ts` — extend `ShipmentLite` (already has most fields; surface what's hidden)

**Create:**
- `frontend/src/components/pulse/ServiceModeIcon.tsx` — single component that picks a lucide-react icon based on `mode` + `lcl` flags

### Sub-project B — Carrier tracking ingest

**Create:**
- `supabase/migrations/20260515100000_pulse_live_tracking_schema.sql` — `lit_bol_tracking_events` table + `unified_shipments` column adds
- `supabase/functions/_shared/maersk_client.ts` — OAuth2 token + tracking client for Maersk
- `supabase/functions/_shared/hapag_client.ts` — same for Hapag-Lloyd
- `supabase/functions/_shared/dcsa_event_map.ts` — DCSA event code → internal taxonomy + ETA extraction
- `supabase/functions/_shared/scac_router.ts` — SCAC → carrier string
- `supabase/functions/pulse-bol-tracking-tick/index.ts` — daily cron edge fn
- `supabase/functions/_shared/maersk_client.test.ts`, `hapag_client.test.ts`, `dcsa_event_map.test.ts`, `scac_router.test.ts`

### Sub-project C — Drayage cost engine

**Create:**
- `supabase/migrations/20260515110000_pulse_drayage_schema.sql` — `lit_drayage_distance_cache` + `lit_drayage_estimates`
- `supabase/functions/_shared/drayage_cost.ts` — pure formula module
- `supabase/functions/_shared/drayage_cost.test.ts` — formula + edge-case tests
- `supabase/functions/_shared/osrm_client.ts` — OSRM caller with haversine fallback
- `supabase/functions/_shared/osrm_client.test.ts`
- `supabase/functions/pulse-drayage-recompute/index.ts` — backfill tick that fills `lit_drayage_estimates`

**Modify:**
- `frontend/src/lib/revenueOpportunity.ts` — replace flat $450 drayage with new estimator

### Sub-project D — Pulse LIVE tab UI

**Create:**
- `frontend/src/features/pulse/PulseLIVETab.tsx` — tab container with view selector
- `frontend/src/features/pulse/views/ArrivalScheduleView.tsx`
- `frontend/src/features/pulse/views/DrayageOpportunityView.tsx`
- `frontend/src/features/pulse/views/CarrierMixView.tsx`
- `frontend/src/lib/pulse/usePulseLiveData.ts` — fetches tracking + drayage for a saved company
- `frontend/src/lib/pulse/pulseLiveTypes.ts` — TypeScript types shared across views and reports

**Modify:**
- `frontend/src/components/company/Workspace.tsx` — insert new tab between Shipments and RFP

### Sub-project E — Branded PDF/Excel exports

**Create:**
- `frontend/src/lib/pulse/reportBrand.ts` — gradient stops, mark, wordmark constants
- `frontend/src/lib/pulse/exportPulseLiveReportPdf.ts` — jsPDF + autoTable
- `frontend/src/lib/pulse/exportPulseLiveReportXlsx.ts` — xlsx multi-sheet

**Modify:**
- `frontend/package.json` — add `jspdf-autotable`
- `frontend/src/features/pulse/PulseLIVETab.tsx` — wire download buttons

### Sub-project F — Digest enrichment

**Modify:**
- `supabase/functions/_shared/digest_render.ts` — extend volume row with POD/dest/arrival, new drayage section, service icon SVGs
- `supabase/functions/_shared/alert_diff.ts` — populate new payload fields (pod, final_dest, arrival_date)
- `supabase/functions/_shared/digest_render.test.ts`, `alert_diff.test.ts` — extend existing tests
- `supabase/functions/pulse-alert-digest/index.ts` — pull drayage estimates and inject into render args
- `supabase/functions/pulse-digest-draft-send/index.ts` — sample data exercises new sections

---

## Sub-Project A — Shipment Tab Enrichment

### Task A1: Service mode icon component

**Files:**
- Create: `frontend/src/components/pulse/ServiceModeIcon.tsx`

- [ ] **Step 1: Create the component**

```tsx
// frontend/src/components/pulse/ServiceModeIcon.tsx
import { Ship, Plane, Truck, Package } from 'lucide-react';

export type ServiceMode = 'fcl' | 'lcl' | 'air' | 'truck' | 'unknown';

export function deriveServiceMode(shipment: {
  mode?: string | null;
  lcl?: boolean | null;
}): ServiceMode {
  const mode = (shipment.mode || '').toLowerCase();
  if (mode.includes('air')) return 'air';
  if (mode.includes('truck') || mode.includes('road')) return 'truck';
  if (shipment.lcl === true) return 'lcl';
  if (mode.includes('sea') || mode.includes('ocean')) return 'fcl';
  return 'unknown';
}

const ICONS = {
  fcl: Ship,
  lcl: Package,
  air: Plane,
  truck: Truck,
  unknown: Ship,
} as const;

const LABELS = {
  fcl: 'FCL',
  lcl: 'LCL',
  air: 'Air',
  truck: 'Truck',
  unknown: 'Ocean',
} as const;

export function ServiceModeIcon(props: {
  shipment: { mode?: string | null; lcl?: boolean | null };
  size?: number;
  showLabel?: boolean;
  className?: string;
}) {
  const mode = deriveServiceMode(props.shipment);
  const Icon = ICONS[mode];
  return (
    <span className={`inline-flex items-center gap-1 text-xs text-slate-600 ${props.className || ''}`}>
      <Icon size={props.size ?? 14} aria-hidden />
      {props.showLabel !== false && <span>{LABELS[mode]}</span>}
    </span>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd frontend && npx tsc --noEmit -p tsconfig.json 2>&1 | grep -i "ServiceModeIcon" || echo "OK"`
Expected: prints "OK" (no errors involving ServiceModeIcon)

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/pulse/ServiceModeIcon.tsx
git commit -m "feat(pulse): ServiceModeIcon component for FCL/LCL/Air/Truck badges"
```

---

### Task A2: Enrich CompanyDrawer shipment table

**Files:**
- Modify: `frontend/src/components/company/CompanyDrawer.tsx`

- [ ] **Step 1: Read existing shipment table block**

Use `Read` tool on `frontend/src/components/company/CompanyDrawer.tsx`. Locate the table that renders columns: Date / BOL / MBL / HS Code / TEU / Qty / Unit / Shipper / Consignee / Description / Cost.

- [ ] **Step 2: Add new columns and reorder**

Replace the table's `<thead>` and `<tbody>` blocks so the column order becomes:
**Service · Date · BOL · MBL · HS · TEU · Qty · Origin Port · POD · Final Dest · Arrival · Shipper · Consignee · Cost**

Add cell renderers:
- **Service**: `<ServiceModeIcon shipment={s} />`
- **Origin Port**: `{s.origin_port || '—'}`
- **POD**: `{s.destination_port || '—'}`
- **Final Dest**: `{s.dest_city ? `${s.dest_city}${s.dest_country_code ? `, ${s.dest_country_code}` : ''}` : '—'}` *(if `dest_city` doesn't exist on ShipmentLite, fall back to `consignee_city` or omit — verify with Read)*
- **Arrival**: `{s.arrival_date ? new Date(s.arrival_date).toLocaleDateString('en-US') : '—'}`

Add import at top:
```tsx
import { ServiceModeIcon } from '@/components/pulse/ServiceModeIcon';
```

- [ ] **Step 3: Verify TypeScript**

Run: `cd frontend && npx tsc --noEmit -p tsconfig.json 2>&1 | head -40`
Expected: zero errors mentioning CompanyDrawer

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/company/CompanyDrawer.tsx
git commit -m "feat(pulse): enrich CompanyDrawer shipment table with POD/dest/arrival/service icon"
```

---

### Task A3: Mirror enrichment in Workspace.Shipments + CompanyShipmentsPanel

**Files:**
- Modify: `frontend/src/components/company/Workspace.tsx` (Shipments tab table)
- Modify: `frontend/src/components/company/CompanyShipmentsPanel.tsx`

- [ ] **Step 1: Read both files and locate shipment table sections**

Locate the same column set in `Workspace.tsx` (lines around 369-472 per the codebase inventory) and in `CompanyShipmentsPanel.tsx`.

- [ ] **Step 2: Apply identical column changes**

Same column order and renderers as Task A2:
**Service · Date · BOL · MBL · HS · TEU · Qty · Origin Port · POD · Final Dest · Arrival · Shipper · Consignee · Cost**

Use the same `ServiceModeIcon` import.

- [ ] **Step 3: Extend `ShipmentLite` type if `arrival_date` is missing**

In `frontend/src/types/importyeti.ts`, ensure `ShipmentLite` includes:
```ts
arrival_date?: string | null;
dest_city?: string | null;
dest_state?: string | null;
```

If they don't exist, add them as optional fields.

- [ ] **Step 4: Verify TypeScript**

Run: `cd frontend && npx tsc --noEmit -p tsconfig.json 2>&1 | head -40`
Expected: zero errors

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/company/Workspace.tsx \
        frontend/src/components/company/CompanyShipmentsPanel.tsx \
        frontend/src/types/importyeti.ts
git commit -m "feat(pulse): enrich Workspace.Shipments + CompanyShipmentsPanel with same columns"
```

---

## Sub-Project B — Carrier Tracking Ingest

### Task B1: Schema migration for tracking events

**Files:**
- Create: `supabase/migrations/20260515100000_pulse_live_tracking_schema.sql`

- [ ] **Step 1: Write the migration**

```sql
-- 20260515100000_pulse_live_tracking_schema.sql
BEGIN;

CREATE TABLE IF NOT EXISTS public.lit_bol_tracking_events (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bol_number        text NOT NULL,
  scac              text NOT NULL,
  carrier           text NOT NULL,
  event_code        text NOT NULL,
  event_classifier  text,
  event_timestamp   timestamptz NOT NULL,
  location_name     text,
  location_unloc    text,
  vessel_name       text,
  voyage_number     text,
  container_number  text,
  raw_payload       jsonb,
  fetched_at        timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS lit_bol_tracking_events_dedup
  ON public.lit_bol_tracking_events (bol_number, event_code, event_timestamp, coalesce(container_number, ''));
CREATE INDEX IF NOT EXISTS lit_bol_tracking_events_bol_idx
  ON public.lit_bol_tracking_events (bol_number, event_timestamp DESC);
CREATE INDEX IF NOT EXISTS lit_bol_tracking_events_scac_idx
  ON public.lit_bol_tracking_events (scac, fetched_at DESC);

ALTER TABLE public.lit_bol_tracking_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lit_bol_tracking_events_service_role_all"
  ON public.lit_bol_tracking_events
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);
CREATE POLICY "lit_bol_tracking_events_read_authenticated"
  ON public.lit_bol_tracking_events
  FOR SELECT TO authenticated
  USING (true);

ALTER TABLE public.unified_shipments
  ADD COLUMN IF NOT EXISTS tracking_status text,
  ADD COLUMN IF NOT EXISTS tracking_eta timestamptz,
  ADD COLUMN IF NOT EXISTS tracking_arrival_actual timestamptz,
  ADD COLUMN IF NOT EXISTS tracking_last_event_code text,
  ADD COLUMN IF NOT EXISTS tracking_last_event_at timestamptz,
  ADD COLUMN IF NOT EXISTS tracking_refreshed_at timestamptz;

CREATE INDEX IF NOT EXISTS unified_shipments_tracking_refresh_idx
  ON public.unified_shipments (tracking_refreshed_at NULLS FIRST)
  WHERE tracking_arrival_actual IS NULL;

COMMIT;
```

- [ ] **Step 2: Apply via Supabase MCP**

Use `mcp__claude_ai_Supabase__apply_migration` with `project_id="jkmrfiaefxwgbvftohrb"`, `name="20260515100000_pulse_live_tracking_schema"`, `query=<migration contents above>`.

- [ ] **Step 3: Verify schema**

Use `mcp__claude_ai_Supabase__execute_sql`:
```sql
SELECT count(*) FROM information_schema.tables WHERE table_name='lit_bol_tracking_events';
SELECT column_name FROM information_schema.columns WHERE table_name='unified_shipments' AND column_name LIKE 'tracking_%' ORDER BY column_name;
```
Expected: count=1, six tracking_* columns listed.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260515100000_pulse_live_tracking_schema.sql
git commit -m "feat(pulse-live): schema for BOL tracking events + unified_shipments tracking columns"
```

---

### Task B2: Maersk tracking client + tests

**Files:**
- Create: `supabase/functions/_shared/maersk_client.ts`
- Create: `supabase/functions/_shared/maersk_client.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// supabase/functions/_shared/maersk_client.test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { extractEventsFromMaerskResponse } from "./maersk_client.ts";

Deno.test("extractEventsFromMaerskResponse — empty", () => {
  assertEquals(extractEventsFromMaerskResponse({}), []);
  assertEquals(extractEventsFromMaerskResponse({ events: [] }), []);
});

Deno.test("extractEventsFromMaerskResponse — maps DCSA events", () => {
  const resp = {
    events: [
      {
        eventType: "TRANSPORT",
        eventDateTime: "2026-05-10T12:00:00Z",
        eventClassifierCode: "ACT",
        transportEventTypeCode: "DEPA",
        eventLocation: { locationName: "Shanghai", UNLocationCode: "CNSHA" },
        vesselName: "MAERSK SEMARANG",
        carrierVoyageNumber: "203E",
      },
      {
        eventType: "EQUIPMENT",
        eventDateTime: "2026-05-25T08:00:00Z",
        eventClassifierCode: "EST",
        equipmentEventTypeCode: "DISC",
        eventLocation: { locationName: "Long Beach", UNLocationCode: "USLGB" },
        equipmentReference: "MSKU7654321",
      },
    ],
  };
  const out = extractEventsFromMaerskResponse(resp);
  assertEquals(out.length, 2);
  assertEquals(out[0].event_code, "DEPA");
  assertEquals(out[0].event_classifier, "ACT");
  assertEquals(out[0].location_unloc, "CNSHA");
  assertEquals(out[1].event_code, "DISC");
  assertEquals(out[1].container_number, "MSKU7654321");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd supabase/functions/_shared && deno test maersk_client.test.ts --allow-net 2>&1 | tail -20`
Expected: FAIL — `extractEventsFromMaerskResponse` not exported.

- [ ] **Step 3: Implement maersk_client.ts**

```ts
// supabase/functions/_shared/maersk_client.ts
//
// Maersk Track & Trace Plus client.
// - OAuth2 client-credentials at /customer-identity/oauth/v2/access_token
// - GET /track-and-trace-plus/v3/shipment-events
// - Free tier; treat as ~30 req/min for safety.

const TOKEN_URL = "https://api.maersk.com/customer-identity/oauth/v2/access_token";
const EVENTS_URL = "https://api.maersk.com/track-and-trace-plus/v3/shipment-events";
const SCOPE = "OAUTH:track-and-trace-plus";

let tokenCache: { token: string; expiresAt: number } | null = null;

export interface TrackingEvent {
  event_code: string;
  event_classifier: string | null;
  event_timestamp: string;
  location_name: string | null;
  location_unloc: string | null;
  vessel_name: string | null;
  voyage_number: string | null;
  container_number: string | null;
  raw: any;
}

export async function getMaerskToken(env: {
  MAERSK_CLIENT_ID: string;
  MAERSK_CLIENT_SECRET: string;
}): Promise<string> {
  if (tokenCache && tokenCache.expiresAt > Date.now()) return tokenCache.token;
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    scope: SCOPE,
    client_id: env.MAERSK_CLIENT_ID,
    client_secret: env.MAERSK_CLIENT_SECRET,
  });
  const resp = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!resp.ok) throw new Error(`maersk_token_${resp.status}: ${await resp.text().catch(() => "")}`);
  const json = await resp.json();
  tokenCache = {
    token: json.access_token,
    expiresAt: Date.now() + (json.expires_in - 60) * 1000,
  };
  return tokenCache.token;
}

export async function fetchMaerskEvents(args: {
  bolNumber: string;
  env: { MAERSK_CLIENT_ID: string; MAERSK_CLIENT_SECRET: string };
}): Promise<{ ok: boolean; events: TrackingEvent[]; error?: string }> {
  try {
    const token = await getMaerskToken(args.env);
    const url = new URL(EVENTS_URL);
    url.searchParams.set("transportDocumentReference", args.bolNumber);
    const resp = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    });
    if (resp.status === 404) return { ok: true, events: [] };
    if (!resp.ok) return { ok: false, events: [], error: `maersk_${resp.status}` };
    const body = await resp.json();
    return { ok: true, events: extractEventsFromMaerskResponse(body) };
  } catch (err) {
    return { ok: false, events: [], error: String(err) };
  }
}

export function extractEventsFromMaerskResponse(body: any): TrackingEvent[] {
  const events = Array.isArray(body?.events) ? body.events : [];
  const out: TrackingEvent[] = [];
  for (const e of events) {
    const code =
      e.transportEventTypeCode ||
      e.equipmentEventTypeCode ||
      e.shipmentEventTypeCode ||
      e.eventType ||
      "";
    if (!code || !e.eventDateTime) continue;
    out.push({
      event_code: String(code),
      event_classifier: e.eventClassifierCode || null,
      event_timestamp: e.eventDateTime,
      location_name: e.eventLocation?.locationName || null,
      location_unloc: e.eventLocation?.UNLocationCode || null,
      vessel_name: e.vesselName || null,
      voyage_number: e.carrierVoyageNumber || e.exportVoyageNumber || null,
      container_number: e.equipmentReference || null,
      raw: e,
    });
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd supabase/functions/_shared && deno test maersk_client.test.ts --allow-net 2>&1 | tail -10`
Expected: `ok | 2 passed | 0 failed`

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/maersk_client.ts supabase/functions/_shared/maersk_client.test.ts
git commit -m "feat(pulse-live): Maersk OAuth2 client + DCSA event extractor"
```

---

### Task B3: Hapag-Lloyd tracking client + tests

**Files:**
- Create: `supabase/functions/_shared/hapag_client.ts`
- Create: `supabase/functions/_shared/hapag_client.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// supabase/functions/_shared/hapag_client.test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { extractEventsFromHapagResponse } from "./hapag_client.ts";

Deno.test("extractEventsFromHapagResponse — empty", () => {
  assertEquals(extractEventsFromHapagResponse({}), []);
  assertEquals(extractEventsFromHapagResponse({ events: [] }), []);
});

Deno.test("extractEventsFromHapagResponse — DCSA T&T 2.0 events", () => {
  const body = {
    events: [
      {
        eventDateTime: "2026-04-30T22:00:00Z",
        eventClassifierCode: "ACT",
        transportEventTypeCode: "LOAD",
        eventLocation: { locationName: "Hamburg", UNLocationCode: "DEHAM" },
        vesselName: "HAMBURG EXPRESS",
        carrierExportVoyageNumber: "012W",
      },
      {
        eventDateTime: "2026-05-22T14:00:00Z",
        eventClassifierCode: "EST",
        equipmentEventTypeCode: "DISC",
        eventLocation: { locationName: "New York", UNLocationCode: "USNYC" },
        equipmentReference: "HLXU8472100",
      },
    ],
  };
  const out = extractEventsFromHapagResponse(body);
  assertEquals(out.length, 2);
  assertEquals(out[0].event_code, "LOAD");
  assertEquals(out[1].event_code, "DISC");
  assertEquals(out[1].container_number, "HLXU8472100");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd supabase/functions/_shared && deno test hapag_client.test.ts --allow-net 2>&1 | tail -20`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement hapag_client.ts**

```ts
// supabase/functions/_shared/hapag_client.ts
//
// Hapag-Lloyd DCSA T&T 2.0 client. OAuth2 client-credentials.

import type { TrackingEvent } from "./maersk_client.ts";
export type { TrackingEvent };

const TOKEN_URL = "https://api.hlag.com/oauth2/token";
const EVENTS_URL = "https://api.hlag.com/track-trace/v2/events";

let tokenCache: { token: string; expiresAt: number } | null = null;

export async function getHapagToken(env: {
  HAPAG_CLIENT_ID: string;
  HAPAG_CLIENT_SECRET: string;
}): Promise<string> {
  if (tokenCache && tokenCache.expiresAt > Date.now()) return tokenCache.token;
  const basic = btoa(`${env.HAPAG_CLIENT_ID}:${env.HAPAG_CLIENT_SECRET}`);
  const resp = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ grant_type: "client_credentials" }),
  });
  if (!resp.ok) throw new Error(`hapag_token_${resp.status}: ${await resp.text().catch(() => "")}`);
  const json = await resp.json();
  tokenCache = { token: json.access_token, expiresAt: Date.now() + (json.expires_in - 60) * 1000 };
  return tokenCache.token;
}

export async function fetchHapagEvents(args: {
  bolNumber: string;
  env: { HAPAG_CLIENT_ID: string; HAPAG_CLIENT_SECRET: string };
}): Promise<{ ok: boolean; events: TrackingEvent[]; error?: string }> {
  try {
    const token = await getHapagToken(args.env);
    const url = new URL(EVENTS_URL);
    url.searchParams.set("transportDocumentReference", args.bolNumber);
    const resp = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    });
    if (resp.status === 404) return { ok: true, events: [] };
    if (!resp.ok) return { ok: false, events: [], error: `hapag_${resp.status}` };
    const body = await resp.json();
    return { ok: true, events: extractEventsFromHapagResponse(body) };
  } catch (err) {
    return { ok: false, events: [], error: String(err) };
  }
}

export function extractEventsFromHapagResponse(body: any): TrackingEvent[] {
  const events = Array.isArray(body?.events) ? body.events : [];
  const out: TrackingEvent[] = [];
  for (const e of events) {
    const code =
      e.transportEventTypeCode ||
      e.equipmentEventTypeCode ||
      e.shipmentEventTypeCode ||
      "";
    if (!code || !e.eventDateTime) continue;
    out.push({
      event_code: String(code),
      event_classifier: e.eventClassifierCode || null,
      event_timestamp: e.eventDateTime,
      location_name: e.eventLocation?.locationName || null,
      location_unloc: e.eventLocation?.UNLocationCode || null,
      vessel_name: e.vesselName || null,
      voyage_number: e.carrierExportVoyageNumber || e.carrierVoyageNumber || null,
      container_number: e.equipmentReference || null,
      raw: e,
    });
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd supabase/functions/_shared && deno test hapag_client.test.ts --allow-net 2>&1 | tail -10`
Expected: `ok | 2 passed | 0 failed`

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/hapag_client.ts supabase/functions/_shared/hapag_client.test.ts
git commit -m "feat(pulse-live): Hapag-Lloyd OAuth2 client + DCSA event extractor"
```

---

### Task B4: SCAC router + DCSA event taxonomy

**Files:**
- Create: `supabase/functions/_shared/scac_router.ts`
- Create: `supabase/functions/_shared/scac_router.test.ts`
- Create: `supabase/functions/_shared/dcsa_event_map.ts`
- Create: `supabase/functions/_shared/dcsa_event_map.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// supabase/functions/_shared/scac_router.test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { routeBySCAC, isSupportedSCAC } from "./scac_router.ts";

Deno.test("routeBySCAC", () => {
  assertEquals(routeBySCAC("MAEU"), "maersk");
  assertEquals(routeBySCAC("SUDU"), "maersk");
  assertEquals(routeBySCAC("SAFM"), "maersk");
  assertEquals(routeBySCAC("MCPU"), "maersk");
  assertEquals(routeBySCAC("HLCU"), "hapag");
  assertEquals(routeBySCAC("HLXU"), "hapag");
  assertEquals(routeBySCAC("MEDU"), null);
  assertEquals(routeBySCAC("CMDU"), null);
  assertEquals(routeBySCAC(""), null);
  assertEquals(routeBySCAC("maeu"), "maersk"); // case-insensitive
});

Deno.test("isSupportedSCAC", () => {
  assertEquals(isSupportedSCAC("MAEU"), true);
  assertEquals(isSupportedSCAC("MEDU"), false);
});
```

```ts
// supabase/functions/_shared/dcsa_event_map.test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { summarizeEvents } from "./dcsa_event_map.ts";

Deno.test("summarizeEvents — empty", () => {
  const s = summarizeEvents([]);
  assertEquals(s.eta, null);
  assertEquals(s.arrivalActual, null);
  assertEquals(s.lastEventCode, null);
});

Deno.test("summarizeEvents — EST DISC sets ETA", () => {
  const s = summarizeEvents([
    { event_code: "DEPA", event_classifier: "ACT", event_timestamp: "2026-05-01T00:00:00Z" } as any,
    { event_code: "DISC", event_classifier: "EST", event_timestamp: "2026-05-22T14:00:00Z" } as any,
  ]);
  assertEquals(s.eta, "2026-05-22T14:00:00Z");
  assertEquals(s.arrivalActual, null);
  assertEquals(s.lastEventCode, "DEPA");
});

Deno.test("summarizeEvents — ACT DISC sets arrivalActual", () => {
  const s = summarizeEvents([
    { event_code: "DEPA", event_classifier: "ACT", event_timestamp: "2026-05-01T00:00:00Z" } as any,
    { event_code: "DISC", event_classifier: "ACT", event_timestamp: "2026-05-20T14:00:00Z" } as any,
  ]);
  assertEquals(s.arrivalActual, "2026-05-20T14:00:00Z");
  assertEquals(s.lastEventCode, "DISC");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd supabase/functions/_shared && deno test scac_router.test.ts dcsa_event_map.test.ts 2>&1 | tail -10`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement scac_router.ts**

```ts
// supabase/functions/_shared/scac_router.ts
const MAP: Record<string, "maersk" | "hapag"> = {
  MAEU: "maersk", SUDU: "maersk", SAFM: "maersk", MCPU: "maersk",
  HLCU: "hapag",  HLXU: "hapag",
};

export type SupportedCarrier = "maersk" | "hapag";

export function routeBySCAC(scac: string | null | undefined): SupportedCarrier | null {
  if (!scac) return null;
  return MAP[String(scac).toUpperCase()] ?? null;
}

export function isSupportedSCAC(scac: string | null | undefined): boolean {
  return routeBySCAC(scac) !== null;
}
```

- [ ] **Step 4: Implement dcsa_event_map.ts**

```ts
// supabase/functions/_shared/dcsa_event_map.ts
//
// Reduces an ordered list of DCSA TrackingEvent rows into a summary used to
// stamp unified_shipments tracking_* columns. Treat the latest ACT event as
// the "current" status; treat EST DISC as the ETA.

import type { TrackingEvent } from "./maersk_client.ts";

export interface EventSummary {
  eta: string | null;
  arrivalActual: string | null;
  lastEventCode: string | null;
  lastEventAt: string | null;
}

export function summarizeEvents(events: TrackingEvent[]): EventSummary {
  if (!events || events.length === 0) {
    return { eta: null, arrivalActual: null, lastEventCode: null, lastEventAt: null };
  }
  // Sort ascending by timestamp.
  const sorted = [...events].sort((a, b) =>
    new Date(a.event_timestamp).getTime() - new Date(b.event_timestamp).getTime()
  );
  let eta: string | null = null;
  let arrivalActual: string | null = null;
  let lastActEvent: TrackingEvent | null = null;
  for (const e of sorted) {
    if (e.event_code === "DISC") {
      if (e.event_classifier === "ACT") arrivalActual = e.event_timestamp;
      else if (e.event_classifier === "EST" && !arrivalActual) eta = e.event_timestamp;
    }
    if (e.event_classifier === "ACT") lastActEvent = e;
  }
  return {
    eta,
    arrivalActual,
    lastEventCode: lastActEvent?.event_code ?? null,
    lastEventAt: lastActEvent?.event_timestamp ?? null,
  };
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd supabase/functions/_shared && deno test scac_router.test.ts dcsa_event_map.test.ts 2>&1 | tail -10`
Expected: `ok | 5 passed | 0 failed`

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/_shared/scac_router.ts \
        supabase/functions/_shared/scac_router.test.ts \
        supabase/functions/_shared/dcsa_event_map.ts \
        supabase/functions/_shared/dcsa_event_map.test.ts
git commit -m "feat(pulse-live): SCAC router + DCSA event summarizer with tests"
```

---

### Task B5: pulse-bol-tracking-tick edge function

**Files:**
- Create: `supabase/functions/pulse-bol-tracking-tick/index.ts`

- [ ] **Step 1: Implement the edge function**

```ts
// supabase/functions/pulse-bol-tracking-tick/index.ts
//
// Daily cron at 06:00 UTC. Refreshes tracking for "active voyage" BOLs:
// shipped <= 60 days ago, no arrival_date yet, not refreshed in last 12h.
// Routes by SCAC to Maersk or Hapag-Lloyd client; everything else marked
// tracking_status='unsupported'. Advisory-locked so concurrent ticks are safe.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";
import { verifyCronAuth } from "../_shared/cron_auth.ts";
import { fetchMaerskEvents } from "../_shared/maersk_client.ts";
import { fetchHapagEvents } from "../_shared/hapag_client.ts";
import { routeBySCAC } from "../_shared/scac_router.ts";
import { summarizeEvents } from "../_shared/dcsa_event_map.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ENV = {
  MAERSK_CLIENT_ID: Deno.env.get("MAERSK_CLIENT_ID") || "",
  MAERSK_CLIENT_SECRET: Deno.env.get("MAERSK_CLIENT_SECRET") || "",
  HAPAG_CLIENT_ID: Deno.env.get("HAPAG_CLIENT_ID") || "",
  HAPAG_CLIENT_SECRET: Deno.env.get("HAPAG_CLIENT_SECRET") || "",
};
const BATCH_CAP = 500;
const ADVISORY_LOCK_KEY = 814715210;

serve(async (req) => {
  const auth = verifyCronAuth(req);
  if (!auth.ok) return auth.response;
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  // Advisory lock — concurrent ticks no-op.
  const { data: lockRows } = await supabase.rpc("try_pulse_advisory_lock", {
    p_key: ADVISORY_LOCK_KEY,
  });
  if (!lockRows) return json({ ok: true, skipped: "lock_held" });

  try {
    const sixtyDaysAgo = new Date(Date.now() - 60 * 86400 * 1000).toISOString();
    const twelveHoursAgo = new Date(Date.now() - 12 * 3600 * 1000).toISOString();
    const { data: candidates, error } = await supabase
      .from("unified_shipments")
      .select("id, bol_number, scac, bol_date, tracking_refreshed_at")
      .gte("bol_date", sixtyDaysAgo)
      .is("tracking_arrival_actual", null)
      .or(`tracking_refreshed_at.is.null,tracking_refreshed_at.lt.${twelveHoursAgo}`)
      .limit(BATCH_CAP);
    if (error) return json({ ok: false, error: error.message }, 500);

    let tracked = 0, unsupported = 0, errors = 0;
    for (const row of candidates || []) {
      const carrier = routeBySCAC(row.scac);
      if (!carrier) {
        await supabase.from("unified_shipments").update({
          tracking_status: "unsupported",
          tracking_refreshed_at: new Date().toISOString(),
        }).eq("id", row.id);
        unsupported++;
        continue;
      }
      const result = carrier === "maersk"
        ? await fetchMaerskEvents({ bolNumber: row.bol_number, env: ENV })
        : await fetchHapagEvents({ bolNumber: row.bol_number, env: ENV });
      if (!result.ok) {
        errors++;
        await supabase.from("unified_shipments").update({
          tracking_status: "error",
          tracking_refreshed_at: new Date().toISOString(),
        }).eq("id", row.id);
        continue;
      }
      // Insert events (ON CONFLICT DO NOTHING via unique index).
      for (const ev of result.events) {
        await supabase.from("lit_bol_tracking_events").upsert({
          bol_number: row.bol_number,
          scac: row.scac,
          carrier: carrier === "maersk" ? "Maersk" : "Hapag-Lloyd",
          event_code: ev.event_code,
          event_classifier: ev.event_classifier,
          event_timestamp: ev.event_timestamp,
          location_name: ev.location_name,
          location_unloc: ev.location_unloc,
          vessel_name: ev.vessel_name,
          voyage_number: ev.voyage_number,
          container_number: ev.container_number,
          raw_payload: ev.raw,
        }, { onConflict: "bol_number,event_code,event_timestamp,container_number", ignoreDuplicates: true });
      }
      const summary = summarizeEvents(result.events);
      await supabase.from("unified_shipments").update({
        tracking_status: result.events.length > 0 ? "tracked" : "no_match",
        tracking_eta: summary.eta,
        tracking_arrival_actual: summary.arrivalActual,
        tracking_last_event_code: summary.lastEventCode,
        tracking_last_event_at: summary.lastEventAt,
        tracking_refreshed_at: new Date().toISOString(),
      }).eq("id", row.id);
      tracked++;
      // Rate-limit: 1 req/sec across both carriers.
      await new Promise((r) => setTimeout(r, 1000));
    }

    return json({ ok: true, tracked, unsupported, errors, examined: candidates?.length || 0 });
  } finally {
    await supabase.rpc("release_pulse_advisory_lock", { p_key: ADVISORY_LOCK_KEY });
  }
});

function json(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
```

- [ ] **Step 2: Add the two RPCs the function depends on**

Create a small migration `supabase/migrations/20260515100050_pulse_tracking_lock_rpcs.sql`:

```sql
BEGIN;
CREATE OR REPLACE FUNCTION public.try_pulse_advisory_lock(p_key bigint)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN pg_try_advisory_lock(p_key);
END;
$$;

CREATE OR REPLACE FUNCTION public.release_pulse_advisory_lock(p_key bigint)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  PERFORM pg_advisory_unlock(p_key);
END;
$$;

REVOKE ALL ON FUNCTION public.try_pulse_advisory_lock(bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.release_pulse_advisory_lock(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.try_pulse_advisory_lock(bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_pulse_advisory_lock(bigint) TO service_role;
COMMIT;
```

Apply via MCP `apply_migration`.

- [ ] **Step 3: Deploy via MCP**

Use `mcp__claude_ai_Supabase__deploy_edge_function` with `name="pulse-bol-tracking-tick"`, `verify_jwt=false`, files = [index.ts, ../_shared/cron_auth.ts, ../_shared/maersk_client.ts, ../_shared/hapag_client.ts, ../_shared/scac_router.ts, ../_shared/dcsa_event_map.ts].

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/pulse-bol-tracking-tick/index.ts \
        supabase/migrations/20260515100050_pulse_tracking_lock_rpcs.sql
git commit -m "feat(pulse-live): pulse-bol-tracking-tick daily cron + advisory lock RPCs"
```

---

### Task B6: Cron schedule for pulse-bol-tracking-tick

**Files:**
- Create: `supabase/migrations/20260515100100_pulse_live_cron_jobs.sql`

- [ ] **Step 1: Write the migration**

```sql
-- 20260515100100_pulse_live_cron_jobs.sql
BEGIN;

SELECT cron.unschedule('pulse-bol-tracking-daily') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname='pulse-bol-tracking-daily'
);

SELECT cron.schedule(
  'pulse-bol-tracking-daily',
  '0 6 * * *',
  $$
  SELECT net.http_post(
    url := 'https://jkmrfiaefxwgbvftohrb.supabase.co/functions/v1/pulse-bol-tracking-tick',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Internal-Cron', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'LIT_CRON_SECRET')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 240000
  );
  $$
);

COMMIT;
```

- [ ] **Step 2: Apply migration**

Via MCP `apply_migration`.

- [ ] **Step 3: Verify cron is registered**

Run via MCP `execute_sql`:
```sql
SELECT jobname, schedule, active FROM cron.job WHERE jobname='pulse-bol-tracking-daily';
```
Expected: one row, schedule `0 6 * * *`, active `true`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260515100100_pulse_live_cron_jobs.sql
git commit -m "feat(pulse-live): schedule pulse-bol-tracking-daily at 06:00 UTC"
```

---

## Sub-Project C — Drayage Cost Engine

### Task C1: Drayage schema migration

**Files:**
- Create: `supabase/migrations/20260515110000_pulse_drayage_schema.sql`

- [ ] **Step 1: Write the migration**

```sql
-- 20260515110000_pulse_drayage_schema.sql
BEGIN;

CREATE TABLE IF NOT EXISTS public.lit_drayage_distance_cache (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pod_unloc       text NOT NULL,
  dest_city_norm  text NOT NULL,
  dest_state      text,
  miles           numeric NOT NULL,
  source          text NOT NULL,
  resolved_at     timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS lit_drayage_distance_cache_key
  ON public.lit_drayage_distance_cache (pod_unloc, dest_city_norm, coalesce(dest_state, ''));

CREATE TABLE IF NOT EXISTS public.lit_drayage_estimates (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bol_number          text NOT NULL,
  source_company_key  text NOT NULL,
  pod_unloc           text NOT NULL,
  destination_city    text,
  destination_state   text,
  miles               numeric NOT NULL,
  containers_eq       numeric NOT NULL,
  est_cost_usd        numeric NOT NULL,
  est_cost_low_usd    numeric NOT NULL,
  est_cost_high_usd   numeric NOT NULL,
  formula_version     text NOT NULL DEFAULT 'v1',
  computed_at         timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS lit_drayage_estimates_key
  ON public.lit_drayage_estimates (bol_number, coalesce(destination_city, ''), coalesce(destination_state, ''));
CREATE INDEX IF NOT EXISTS lit_drayage_estimates_company_idx
  ON public.lit_drayage_estimates (source_company_key);

ALTER TABLE public.lit_drayage_distance_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lit_drayage_estimates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lit_drayage_distance_cache_service_role_all"
  ON public.lit_drayage_distance_cache FOR ALL TO service_role
  USING (true) WITH CHECK (true);
CREATE POLICY "lit_drayage_distance_cache_read_authenticated"
  ON public.lit_drayage_distance_cache FOR SELECT TO authenticated USING (true);

CREATE POLICY "lit_drayage_estimates_service_role_all"
  ON public.lit_drayage_estimates FOR ALL TO service_role
  USING (true) WITH CHECK (true);
CREATE POLICY "lit_drayage_estimates_read_authenticated"
  ON public.lit_drayage_estimates FOR SELECT TO authenticated USING (true);

COMMIT;
```

- [ ] **Step 2: Apply via MCP**

`apply_migration` with above.

- [ ] **Step 3: Verify**

```sql
SELECT count(*) FROM information_schema.tables
WHERE table_name IN ('lit_drayage_distance_cache', 'lit_drayage_estimates');
```
Expected: 2.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260515110000_pulse_drayage_schema.sql
git commit -m "feat(pulse-live): drayage distance cache + estimates schema"
```

---

### Task C2: drayage_cost.ts formula module + tests

**Files:**
- Create: `supabase/functions/_shared/drayage_cost.ts`
- Create: `supabase/functions/_shared/drayage_cost.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// supabase/functions/_shared/drayage_cost.test.ts
import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { estimateDrayageCost, normalizeContainerType } from "./drayage_cost.ts";

Deno.test("normalizeContainerType", () => {
  assertEquals(normalizeContainerType("40HC"), "40HC");
  assertEquals(normalizeContainerType("40' HC"), "40HC");
  assertEquals(normalizeContainerType("20ft"), "20FT");
  assertEquals(normalizeContainerType("LCL"), "LCL");
  assertEquals(normalizeContainerType(""), "40FT"); // default
  assertEquals(normalizeContainerType(undefined), "40FT");
});

Deno.test("estimateDrayageCost — LA/LB to Chicago, 2x 40HC", () => {
  const { cost, low, high } = estimateDrayageCost({
    pod_unloc: "USLGB",
    dest_city: "Chicago",
    dest_state: "IL",
    container_count: 2,
    container_type: "40HC",
    miles: 2015,
  });
  // sanity: should be in $25k-45k range for cross-country 2x40HC
  assert(cost > 20000 && cost < 50000, `cost=${cost}`);
  assertEquals(low, Math.round(cost * 0.75));
  assertEquals(high, Math.round(cost * 1.25));
});

Deno.test("estimateDrayageCost — local move uses floor", () => {
  const { cost } = estimateDrayageCost({
    pod_unloc: "USLAX",
    dest_city: "Long Beach",
    dest_state: "CA",
    container_count: 1,
    container_type: "40FT",
    miles: 12,
  });
  assert(cost >= 450, `cost=${cost} should be >= floor 450`);
});

Deno.test("estimateDrayageCost — LCL factor reduces cost", () => {
  const fcl = estimateDrayageCost({
    pod_unloc: "USNYC", dest_city: "Atlanta", dest_state: "GA",
    container_count: 1, container_type: "40FT", miles: 870,
  });
  const lcl = estimateDrayageCost({
    pod_unloc: "USNYC", dest_city: "Atlanta", dest_state: "GA",
    container_count: 1, container_type: "LCL", miles: 870,
  });
  assert(lcl.cost < fcl.cost, `lcl ${lcl.cost} should be < fcl ${fcl.cost}`);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd supabase/functions/_shared && deno test drayage_cost.test.ts 2>&1 | tail -10`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement drayage_cost.ts**

```ts
// supabase/functions/_shared/drayage_cost.ts
//
// Deterministic drayage cost estimator. v1 formula:
//   linehaul   = base_per_mile * miles * containers_eq
//   chassis    = chassis_per_day * est_days
//   access     = per_container_fee * count + port_fee * containers_eq
//   fuel       = fuel_pct * (linehaul + chassis)
//   subtotal   = linehaul + chassis + access + fuel
//   if LCL:    subtotal *= 0.35
//   if <60mi:  subtotal = max(subtotal, 450 * count)
// 2026 coefficients from DAT, ATRI Operational Costs of Trucking, PierPASS.
// Disclose ±25% band to user; never present as a firm quote.

export type ContainerType = "20FT" | "40FT" | "40HC" | "LCL";

const TEU_FACTOR: Record<ContainerType, number> = {
  "20FT": 1, "40FT": 1.8, "40HC": 1.8, "LCL": 1,
};

const PORT_FEES: Record<string, number> = {
  USLAX: 39.62, USLGB: 39.62,
  USNYC: 45, USEWR: 45,
};

const BASE_PER_MILE = 3.15;
const CHASSIS_PER_DAY = 45;
const PER_CONTAINER_FEE = 175;
const FUEL_PCT = 0.22;
const LCL_FACTOR = 0.35;
const LOCAL_MILE_THRESHOLD = 60;
const LOCAL_FLOOR_PER_CONTAINER = 450;

export interface DrayageInput {
  pod_unloc: string;
  dest_city: string;
  dest_state: string;
  container_count: number;
  container_type: ContainerType;
  miles: number;
}

export interface DrayageOutput {
  cost: number;
  low: number;
  high: number;
  containers_eq: number;
  formula_version: "v1";
}

export function normalizeContainerType(raw: string | null | undefined): ContainerType {
  if (!raw) return "40FT";
  const s = String(raw).toUpperCase().replace(/['"\s]/g, "");
  if (s.includes("LCL")) return "LCL";
  if (s.includes("40HC") || s.includes("HC")) return "40HC";
  if (s.startsWith("20")) return "20FT";
  if (s.startsWith("40")) return "40FT";
  return "40FT";
}

export function estimateDrayageCost(input: DrayageInput): DrayageOutput {
  const count = Math.max(1, input.container_count);
  const teu = TEU_FACTOR[input.container_type];
  const containers_eq = count * teu;
  const miles = Math.max(0, input.miles);
  const port_fee_per_teu = PORT_FEES[input.pod_unloc] ?? 0;
  const est_days = Math.ceil(miles / 450) + 1;
  const linehaul = BASE_PER_MILE * miles * containers_eq;
  const chassis = CHASSIS_PER_DAY * est_days;
  const accessorials = PER_CONTAINER_FEE * count + port_fee_per_teu * containers_eq;
  const fuel = FUEL_PCT * (linehaul + chassis);
  let subtotal = linehaul + chassis + accessorials + fuel;
  if (input.container_type === "LCL") subtotal *= LCL_FACTOR;
  if (miles < LOCAL_MILE_THRESHOLD) {
    subtotal = Math.max(subtotal, LOCAL_FLOOR_PER_CONTAINER * count);
  }
  const cost = Math.round(subtotal);
  return {
    cost,
    low: Math.round(cost * 0.75),
    high: Math.round(cost * 1.25),
    containers_eq,
    formula_version: "v1",
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd supabase/functions/_shared && deno test drayage_cost.test.ts 2>&1 | tail -10`
Expected: `ok | 4 passed | 0 failed`

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/drayage_cost.ts supabase/functions/_shared/drayage_cost.test.ts
git commit -m "feat(pulse-live): drayage_cost formula module with 2026 coefficients + tests"
```

---

### Task C3: OSRM client with haversine fallback

**Files:**
- Create: `supabase/functions/_shared/osrm_client.ts`
- Create: `supabase/functions/_shared/osrm_client.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// supabase/functions/_shared/osrm_client.test.ts
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { haversineMiles, normalizeCityKey } from "./osrm_client.ts";

Deno.test("haversineMiles — LA to Chicago", () => {
  const m = haversineMiles(33.74, -118.27, 41.88, -87.63);
  assert(m > 1700 && m < 1900, `expected ~1745, got ${m}`);
});

Deno.test("normalizeCityKey", () => {
  assertEquals(normalizeCityKey("Chicago"), "chicago");
  assertEquals(normalizeCityKey("Long Beach "), "long beach");
  assertEquals(normalizeCityKey("ST. LOUIS"), "st. louis");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd supabase/functions/_shared && deno test osrm_client.test.ts 2>&1 | tail -10`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement osrm_client.ts**

```ts
// supabase/functions/_shared/osrm_client.ts
//
// OSRM public demo (project-osrm.org) for road distance.
// Falls back to haversine * 1.2 if OSRM is unreachable or slow.
//
// Cache the (POD, dest_city, dest_state) → miles lookup in
// public.lit_drayage_distance_cache to avoid hammering OSRM.

const OSRM_BASE = "https://router.project-osrm.org/route/v1/driving";
const HAVERSINE_ROAD_FACTOR = 1.2;
const KM_PER_MILE = 1.609344;

export function haversineMiles(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3958.7613; // earth radius in miles
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function normalizeCityKey(s: string): string {
  return String(s || "").trim().toLowerCase();
}

export interface RouteResult {
  miles: number;
  source: "osrm" | "haversine";
}

export async function routeMiles(args: {
  fromLat: number; fromLon: number;
  toLat: number; toLon: number;
}): Promise<RouteResult> {
  const url = `${OSRM_BASE}/${args.fromLon},${args.fromLat};${args.toLon},${args.toLat}?overview=false`;
  try {
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 5000);
    const resp = await fetch(url, { signal: ctrl.signal });
    clearTimeout(tid);
    if (!resp.ok) throw new Error(`osrm_${resp.status}`);
    const json = await resp.json();
    const meters = json?.routes?.[0]?.distance;
    if (typeof meters !== "number") throw new Error("osrm_no_route");
    return { miles: (meters / 1000) / KM_PER_MILE, source: "osrm" };
  } catch (_err) {
    const miles = haversineMiles(args.fromLat, args.fromLon, args.toLat, args.toLon) * HAVERSINE_ROAD_FACTOR;
    return { miles, source: "haversine" };
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd supabase/functions/_shared && deno test osrm_client.test.ts 2>&1 | tail -10`
Expected: `ok | 2 passed | 0 failed`

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/osrm_client.ts supabase/functions/_shared/osrm_client.test.ts
git commit -m "feat(pulse-live): OSRM client with haversine fallback + tests"
```

---

### Task C4: pulse-drayage-recompute edge fn

**Files:**
- Create: `supabase/functions/pulse-drayage-recompute/index.ts`

- [ ] **Step 1: Implement**

```ts
// supabase/functions/pulse-drayage-recompute/index.ts
//
// Daily tick at 07:00 UTC (1h after tracking refresh).
// For each unified_shipments row that has POD + dest city + container info,
// looks up cached distance (or resolves via OSRM), computes drayage cost,
// and upserts lit_drayage_estimates.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";
import { verifyCronAuth } from "../_shared/cron_auth.ts";
import { estimateDrayageCost, normalizeContainerType } from "../_shared/drayage_cost.ts";
import { routeMiles, normalizeCityKey } from "../_shared/osrm_client.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BATCH_CAP = 500;

// Minimal port → lat/lon map for v1. Extend as needed.
const PORT_COORDS: Record<string, { lat: number; lon: number }> = {
  USLAX: { lat: 33.74, lon: -118.27 },
  USLGB: { lat: 33.77, lon: -118.20 },
  USNYC: { lat: 40.68, lon: -74.04 },
  USEWR: { lat: 40.69, lon: -74.17 },
  USSAV: { lat: 32.13, lon: -81.14 },
  USHOU: { lat: 29.73, lon: -95.27 },
  USOAK: { lat: 37.80, lon: -122.32 },
  USSEA: { lat: 47.61, lon: -122.34 },
  USCHS: { lat: 32.78, lon: -79.93 },
  USMIA: { lat: 25.78, lon: -80.17 },
};

// Minimal US city → lat/lon for top inland destinations (extend on demand).
const CITY_COORDS: Record<string, { lat: number; lon: number }> = {
  "chicago,il": { lat: 41.88, lon: -87.63 },
  "atlanta,ga": { lat: 33.75, lon: -84.39 },
  "dallas,tx": { lat: 32.78, lon: -96.80 },
  "houston,tx": { lat: 29.76, lon: -95.37 },
  "memphis,tn": { lat: 35.15, lon: -90.05 },
  "columbus,oh": { lat: 39.96, lon: -82.99 },
  "kansas city,mo": { lat: 39.10, lon: -94.58 },
  "indianapolis,in": { lat: 39.77, lon: -86.16 },
  "nashville,tn": { lat: 36.16, lon: -86.78 },
  "phoenix,az": { lat: 33.45, lon: -112.07 },
};

function cityKey(city: string, state: string | null): string {
  return `${normalizeCityKey(city)},${(state || "").trim().toLowerCase()}`;
}

serve(async (req) => {
  const auth = verifyCronAuth(req);
  if (!auth.ok) return auth.response;
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { data: rows, error } = await supabase
    .from("unified_shipments")
    .select("id, bol_number, source_company_key, destination_port, dest_city, dest_state, container_count, container_type, lcl")
    .not("destination_port", "is", null)
    .not("dest_city", "is", null)
    .limit(BATCH_CAP);
  if (error) return json({ ok: false, error: error.message }, 500);

  let computed = 0, skipped = 0, missing_coords = 0;
  for (const r of rows || []) {
    const pod = r.destination_port?.toUpperCase();
    if (!pod || !PORT_COORDS[pod]) { missing_coords++; continue; }
    const ckey = cityKey(r.dest_city || "", r.dest_state);
    const cityCoord = CITY_COORDS[ckey];
    if (!cityCoord) { missing_coords++; continue; }

    // Check cache.
    const { data: cached } = await supabase
      .from("lit_drayage_distance_cache")
      .select("miles, source")
      .eq("pod_unloc", pod)
      .eq("dest_city_norm", normalizeCityKey(r.dest_city))
      .eq("dest_state", (r.dest_state || "").toUpperCase())
      .maybeSingle();
    let miles: number;
    if (cached?.miles) {
      miles = Number(cached.miles);
    } else {
      const route = await routeMiles({
        fromLat: PORT_COORDS[pod].lat, fromLon: PORT_COORDS[pod].lon,
        toLat: cityCoord.lat, toLon: cityCoord.lon,
      });
      miles = route.miles;
      await supabase.from("lit_drayage_distance_cache").upsert({
        pod_unloc: pod,
        dest_city_norm: normalizeCityKey(r.dest_city),
        dest_state: (r.dest_state || "").toUpperCase(),
        miles,
        source: route.source,
      }, { onConflict: "pod_unloc,dest_city_norm,dest_state" });
    }

    const container_type = r.lcl ? "LCL" : normalizeContainerType(r.container_type);
    const out = estimateDrayageCost({
      pod_unloc: pod,
      dest_city: r.dest_city,
      dest_state: r.dest_state || "",
      container_count: r.container_count || 1,
      container_type: container_type as any,
      miles,
    });
    await supabase.from("lit_drayage_estimates").upsert({
      bol_number: r.bol_number,
      source_company_key: r.source_company_key,
      pod_unloc: pod,
      destination_city: r.dest_city,
      destination_state: r.dest_state,
      miles,
      containers_eq: out.containers_eq,
      est_cost_usd: out.cost,
      est_cost_low_usd: out.low,
      est_cost_high_usd: out.high,
      formula_version: out.formula_version,
    }, { onConflict: "bol_number,destination_city,destination_state" });
    computed++;
  }

  return json({ ok: true, computed, missing_coords, skipped, examined: rows?.length || 0 });
});

function json(body: any, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
```

- [ ] **Step 2: Deploy via MCP**

`deploy_edge_function` with files = [index.ts, ../_shared/cron_auth.ts, ../_shared/drayage_cost.ts, ../_shared/osrm_client.ts]. `verify_jwt=false`.

- [ ] **Step 3: Schedule the cron**

Append to the cron migration created in B6 (or new file `20260515110100_pulse_drayage_cron.sql`):
```sql
SELECT cron.schedule(
  'pulse-drayage-recompute-daily',
  '0 7 * * *',
  $$
  SELECT net.http_post(
    url := 'https://jkmrfiaefxwgbvftohrb.supabase.co/functions/v1/pulse-drayage-recompute',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Internal-Cron', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'LIT_CRON_SECRET')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 180000
  );
  $$
);
```

Apply via MCP.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/pulse-drayage-recompute/index.ts \
        supabase/migrations/20260515110100_pulse_drayage_cron.sql
git commit -m "feat(pulse-live): pulse-drayage-recompute daily cron with port/city coord map"
```

---

### Task C5: Wire drayage estimate into revenueOpportunity.ts

**Files:**
- Modify: `frontend/src/lib/revenueOpportunity.ts`

- [ ] **Step 1: Read the file and locate the drayage line item**

Use `Read` on `frontend/src/lib/revenueOpportunity.ts`. Find where drayage cost is computed (likely a constant `$450` or a function called `computeDrayage()`).

- [ ] **Step 2: Add an estimator-aware drayage computation**

Replace the flat-$450 logic with a call that prefers `lit_drayage_estimates` rollup if available, else falls back to a per-FCL-shipment formula using the same coefficients:

```ts
// New function inside revenueOpportunity.ts:
export interface DrayageRollup {
  total_est_usd: number;
  total_low_usd: number;
  total_high_usd: number;
  bol_count: number;
}

export function computeDrayageRevenue(args: {
  rollup?: DrayageRollup | null;
  fclShipments12m: number;
}): { value: number; low: number; high: number; confidence: 'High' | 'Medium' | 'Low' } {
  if (args.rollup && args.rollup.bol_count > 0) {
    // Annualize the rollup if it's a 14d window:
    return {
      value: args.rollup.total_est_usd,
      low: args.rollup.total_low_usd,
      high: args.rollup.total_high_usd,
      confidence: 'Medium',
    };
  }
  // Fallback: flat estimate per FCL shipment, same coefficient family.
  const perShipment = 1200; // typical drayage per FCL shipment, blended US
  const value = args.fclShipments12m * perShipment;
  return {
    value,
    low: Math.round(value * 0.75),
    high: Math.round(value * 1.25),
    confidence: 'Low',
  };
}
```

In the existing service-line aggregator, replace the old drayage line with `computeDrayageRevenue({ rollup, fclShipments12m })`. The `rollup` will be fetched from `lit_drayage_estimates` by the caller.

- [ ] **Step 3: Verify TypeScript**

Run: `cd frontend && npx tsc --noEmit -p tsconfig.json 2>&1 | grep -i "revenueOpportunity" || echo OK`
Expected: `OK`.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/lib/revenueOpportunity.ts
git commit -m "feat(pulse-live): wire drayage estimate rollup into revenueOpportunity"
```

---

## Sub-Project D — Pulse LIVE Tab UI

### Task D1: Types + data hook

**Files:**
- Create: `frontend/src/lib/pulse/pulseLiveTypes.ts`
- Create: `frontend/src/lib/pulse/usePulseLiveData.ts`

- [ ] **Step 1: Create the types**

```ts
// frontend/src/lib/pulse/pulseLiveTypes.ts
export interface PulseTrackedShipment {
  bol_number: string;
  scac: string | null;
  carrier: string | null;
  origin_port: string | null;
  destination_port: string | null;
  dest_city: string | null;
  dest_state: string | null;
  container_count: number | null;
  container_type: string | null;
  lcl: boolean | null;
  hs_code: string | null;
  tracking_status: 'tracked' | 'unsupported' | 'no_match' | 'error' | 'pending' | null;
  tracking_eta: string | null;
  tracking_arrival_actual: string | null;
  tracking_last_event_code: string | null;
  tracking_last_event_at: string | null;
  bol_date: string | null;
}

export interface PulseDrayageEstimate {
  bol_number: string;
  destination_city: string | null;
  destination_state: string | null;
  miles: number;
  containers_eq: number;
  est_cost_usd: number;
  est_cost_low_usd: number;
  est_cost_high_usd: number;
}

export interface PulseLiveData {
  shipments: PulseTrackedShipment[];
  drayage: PulseDrayageEstimate[];
  carrierMix: { carrier: string; bol_count: number; container_count: number; tracked: boolean }[];
  loading: boolean;
  error: string | null;
}
```

- [ ] **Step 2: Create the hook**

```ts
// frontend/src/lib/pulse/usePulseLiveData.ts
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { PulseLiveData, PulseTrackedShipment, PulseDrayageEstimate } from './pulseLiveTypes';

export function usePulseLiveData(sourceCompanyKey: string | null): PulseLiveData {
  const [shipments, setShipments] = useState<PulseTrackedShipment[]>([]);
  const [drayage, setDrayage] = useState<PulseDrayageEstimate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sourceCompanyKey) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data: ships, error: shipErr } = await supabase
        .from('unified_shipments')
        .select(`
          bol_number, scac, origin_port, destination_port,
          dest_city, dest_state, container_count, container_type, lcl, hs_code,
          tracking_status, tracking_eta, tracking_arrival_actual,
          tracking_last_event_code, tracking_last_event_at, bol_date
        `)
        .eq('source_company_key', sourceCompanyKey)
        .order('bol_date', { ascending: false })
        .limit(200);
      if (cancelled) return;
      if (shipErr) { setError(shipErr.message); setLoading(false); return; }

      const { data: dray } = await supabase
        .from('lit_drayage_estimates')
        .select('bol_number, destination_city, destination_state, miles, containers_eq, est_cost_usd, est_cost_low_usd, est_cost_high_usd')
        .eq('source_company_key', sourceCompanyKey);
      if (cancelled) return;

      setShipments((ships || []).map((s: any) => ({
        ...s,
        carrier: deriveCarrierName(s.scac),
      })));
      setDrayage(dray || []);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [sourceCompanyKey]);

  const carrierMix = computeCarrierMix(shipments);
  return { shipments, drayage, carrierMix, loading, error };
}

function deriveCarrierName(scac: string | null): string | null {
  if (!scac) return null;
  const s = scac.toUpperCase();
  if (['MAEU', 'SUDU', 'SAFM', 'MCPU'].includes(s)) return 'Maersk';
  if (['HLCU', 'HLXU'].includes(s)) return 'Hapag-Lloyd';
  return s;
}

function computeCarrierMix(ships: PulseTrackedShipment[]) {
  const map = new Map<string, { bol_count: number; container_count: number; tracked: boolean }>();
  for (const s of ships) {
    const carrier = s.carrier || 'Unknown';
    const tracked = s.tracking_status === 'tracked';
    const prev = map.get(carrier) || { bol_count: 0, container_count: 0, tracked };
    prev.bol_count += 1;
    prev.container_count += s.container_count || 0;
    prev.tracked = prev.tracked || tracked;
    map.set(carrier, prev);
  }
  return Array.from(map.entries()).map(([carrier, v]) => ({ carrier, ...v }));
}
```

- [ ] **Step 3: Verify TypeScript**

Run: `cd frontend && npx tsc --noEmit -p tsconfig.json 2>&1 | head -30`
Expected: zero errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/lib/pulse/pulseLiveTypes.ts frontend/src/lib/pulse/usePulseLiveData.ts
git commit -m "feat(pulse-live): pulse-live types + data hook"
```

---

### Task D2: PulseLIVETab container + Arrival Schedule view

**Files:**
- Create: `frontend/src/features/pulse/PulseLIVETab.tsx`
- Create: `frontend/src/features/pulse/views/ArrivalScheduleView.tsx`

- [ ] **Step 1: Create ArrivalScheduleView**

```tsx
// frontend/src/features/pulse/views/ArrivalScheduleView.tsx
import { ServiceModeIcon } from '@/components/pulse/ServiceModeIcon';
import type { PulseTrackedShipment } from '@/lib/pulse/pulseLiveTypes';

export function ArrivalScheduleView({ shipments }: { shipments: PulseTrackedShipment[] }) {
  const rows = [...shipments].sort((a, b) => {
    const ax = a.tracking_eta || a.tracking_arrival_actual || a.bol_date || '';
    const bx = b.tracking_eta || b.tracking_arrival_actual || b.bol_date || '';
    return ax.localeCompare(bx);
  });
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-2 py-2 text-left">Service</th>
            <th className="px-2 py-2 text-left">BOL</th>
            <th className="px-2 py-2 text-left">Carrier</th>
            <th className="px-2 py-2 text-left">POD</th>
            <th className="px-2 py-2 text-left">Final dest</th>
            <th className="px-2 py-2 text-right">Containers</th>
            <th className="px-2 py-2 text-left">ETA / Arrived</th>
            <th className="px-2 py-2 text-left">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => (
            <tr key={s.bol_number} className="border-t border-slate-100">
              <td className="px-2 py-2"><ServiceModeIcon shipment={{ mode: undefined, lcl: s.lcl }} /></td>
              <td className="px-2 py-2 font-mono text-xs">{s.bol_number}</td>
              <td className="px-2 py-2">{s.carrier || '—'}</td>
              <td className="px-2 py-2">{s.destination_port || '—'}</td>
              <td className="px-2 py-2">{[s.dest_city, s.dest_state].filter(Boolean).join(', ') || '—'}</td>
              <td className="px-2 py-2 text-right">{s.container_count ?? '—'}</td>
              <td className="px-2 py-2">{formatEta(s)}</td>
              <td className="px-2 py-2"><StatusPill status={s.tracking_status} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && <div className="py-8 text-center text-slate-500 text-sm">No shipments yet.</div>}
    </div>
  );
}

function formatEta(s: PulseTrackedShipment): string {
  if (s.tracking_arrival_actual) return `Arrived ${new Date(s.tracking_arrival_actual).toLocaleDateString('en-US')}`;
  if (s.tracking_eta) return `ETA ${new Date(s.tracking_eta).toLocaleDateString('en-US')}`;
  return '—';
}

function StatusPill({ status }: { status: PulseTrackedShipment['tracking_status'] }) {
  const map: Record<string, { color: string; label: string }> = {
    tracked: { color: 'bg-blue-50 text-blue-700', label: 'Live' },
    unsupported: { color: 'bg-slate-100 text-slate-500', label: 'No live tracking' },
    no_match: { color: 'bg-amber-50 text-amber-700', label: 'No match' },
    error: { color: 'bg-rose-50 text-rose-700', label: 'Error' },
    pending: { color: 'bg-slate-50 text-slate-500', label: 'Pending' },
  };
  const v = status ? map[status] : { color: 'bg-slate-50 text-slate-500', label: '—' };
  return <span className={`inline-block rounded px-2 py-0.5 text-xs ${v.color}`}>{v.label}</span>;
}
```

- [ ] **Step 2: Create PulseLIVETab container**

```tsx
// frontend/src/features/pulse/PulseLIVETab.tsx
import { useState } from 'react';
import { usePulseLiveData } from '@/lib/pulse/usePulseLiveData';
import { ArrivalScheduleView } from './views/ArrivalScheduleView';

type View = 'arrival' | 'drayage' | 'carrier';

export function PulseLIVETab({ sourceCompanyKey }: { sourceCompanyKey: string | null }) {
  const [view, setView] = useState<View>('arrival');
  const data = usePulseLiveData(sourceCompanyKey);

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-900">
        Live container tracking is currently available for Maersk and Hapag-Lloyd shipments. We're working on expanding coverage to additional carriers.
      </div>
      <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1 text-sm w-fit">
        <Btn active={view === 'arrival'} onClick={() => setView('arrival')}>Arrival Schedule</Btn>
        <Btn active={view === 'drayage'} onClick={() => setView('drayage')}>Drayage Opportunity</Btn>
        <Btn active={view === 'carrier'} onClick={() => setView('carrier')}>Carrier Mix</Btn>
      </div>
      {data.loading && <div className="py-8 text-center text-slate-500 text-sm">Loading…</div>}
      {!data.loading && view === 'arrival' && <ArrivalScheduleView shipments={data.shipments} />}
      {/* DrayageOpportunityView + CarrierMixView wired in next task */}
    </div>
  );
}

function Btn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-md px-3 py-1.5 text-sm transition ${
        active ? 'bg-white shadow-sm text-slate-900' : 'text-slate-600 hover:text-slate-900'
      }`}
    >
      {children}
    </button>
  );
}
```

- [ ] **Step 3: Verify TypeScript + build**

Run: `cd frontend && npx tsc --noEmit -p tsconfig.json 2>&1 | head -30`
Expected: zero errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/features/pulse/PulseLIVETab.tsx \
        frontend/src/features/pulse/views/ArrivalScheduleView.tsx
git commit -m "feat(pulse-live): PulseLIVETab container + Arrival Schedule view"
```

---

### Task D3: Drayage Opportunity + Carrier Mix views

**Files:**
- Create: `frontend/src/features/pulse/views/DrayageOpportunityView.tsx`
- Create: `frontend/src/features/pulse/views/CarrierMixView.tsx`
- Modify: `frontend/src/features/pulse/PulseLIVETab.tsx`

- [ ] **Step 1: DrayageOpportunityView**

```tsx
// frontend/src/features/pulse/views/DrayageOpportunityView.tsx
import type { PulseDrayageEstimate, PulseTrackedShipment } from '@/lib/pulse/pulseLiveTypes';

export function DrayageOpportunityView({
  drayage, shipments,
}: { drayage: PulseDrayageEstimate[]; shipments: PulseTrackedShipment[] }) {
  const rows = [...drayage].sort((a, b) => b.est_cost_usd - a.est_cost_usd);
  const shipMap = new Map(shipments.map((s) => [s.bol_number, s]));
  const total = rows.reduce((acc, r) => acc + r.est_cost_usd, 0);
  const totalLow = rows.reduce((acc, r) => acc + r.est_cost_low_usd, 0);
  const totalHigh = rows.reduce((acc, r) => acc + r.est_cost_high_usd, 0);
  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
        <div className="font-semibold text-slate-900">Total estimated drayage opportunity</div>
        <div className="text-2xl font-bold mt-1">${total.toLocaleString('en-US')}</div>
        <div className="text-xs text-slate-500 mt-1">
          Range: ${totalLow.toLocaleString('en-US')} – ${totalHigh.toLocaleString('en-US')} (±25%)
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-2 py-2 text-left">BOL</th>
              <th className="px-2 py-2 text-left">Final dest</th>
              <th className="px-2 py-2 text-right">Containers</th>
              <th className="px-2 py-2 text-right">Miles</th>
              <th className="px-2 py-2 text-right">Est. value</th>
              <th className="px-2 py-2 text-right">Range</th>
              <th className="px-2 py-2 text-left">Arrival</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const s = shipMap.get(r.bol_number);
              const arrival = s?.tracking_arrival_actual || s?.tracking_eta || s?.bol_date;
              return (
                <tr key={r.bol_number} className="border-t border-slate-100">
                  <td className="px-2 py-2 font-mono text-xs">{r.bol_number}</td>
                  <td className="px-2 py-2">{[r.destination_city, r.destination_state].filter(Boolean).join(', ')}</td>
                  <td className="px-2 py-2 text-right">{s?.container_count ?? Math.ceil(r.containers_eq)}</td>
                  <td className="px-2 py-2 text-right">{Math.round(r.miles).toLocaleString('en-US')}</td>
                  <td className="px-2 py-2 text-right font-semibold">${r.est_cost_usd.toLocaleString('en-US')}</td>
                  <td className="px-2 py-2 text-right text-xs text-slate-500">${r.est_cost_low_usd.toLocaleString('en-US')}–${r.est_cost_high_usd.toLocaleString('en-US')}</td>
                  <td className="px-2 py-2">{arrival ? new Date(arrival).toLocaleDateString('en-US') : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-500 italic">
        Estimated based on distance, container type, and port. Actual quoted rates vary ±25%.
      </p>
    </div>
  );
}
```

- [ ] **Step 2: CarrierMixView**

```tsx
// frontend/src/features/pulse/views/CarrierMixView.tsx
import type { PulseLiveData } from '@/lib/pulse/pulseLiveTypes';

export function CarrierMixView({ data }: { data: PulseLiveData }) {
  const rows = [...data.carrierMix].sort((a, b) => b.container_count - a.container_count);
  const totalContainers = rows.reduce((acc, r) => acc + r.container_count, 0) || 1;
  const trackedContainers = rows.filter((r) => r.tracked).reduce((acc, r) => acc + r.container_count, 0);
  const coveragePct = Math.round((trackedContainers / totalContainers) * 100);
  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
        <div className="font-semibold text-slate-900">Live tracking coverage</div>
        <div className="text-2xl font-bold mt-1">{coveragePct}%</div>
        <div className="text-xs text-slate-500 mt-1">
          {trackedContainers} of {totalContainers} containers on supported carriers (Maersk, Hapag-Lloyd).
        </div>
      </div>
      <div className="space-y-2">
        {rows.map((r) => {
          const pct = Math.round((r.container_count / totalContainers) * 100);
          return (
            <div key={r.carrier} className="flex items-center gap-3 text-sm">
              <div className="w-32 truncate">{r.carrier}</div>
              <div className="flex-1 h-6 bg-slate-100 rounded relative overflow-hidden">
                <div
                  className={`h-full ${r.tracked ? 'bg-blue-500' : 'bg-slate-400'}`}
                  style={{ width: `${pct}%` }}
                />
                <div className="absolute inset-0 flex items-center px-2 text-xs text-white font-semibold">
                  {r.container_count} containers · {pct}%
                </div>
              </div>
              <div className="w-24 text-xs text-slate-500">
                {r.tracked ? 'Live tracking' : 'No live tracking'}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Wire views into PulseLIVETab**

In `PulseLIVETab.tsx`, add the new imports and replace the comment-placeholder block:
```tsx
import { DrayageOpportunityView } from './views/DrayageOpportunityView';
import { CarrierMixView } from './views/CarrierMixView';
// ...
{!data.loading && view === 'drayage' && <DrayageOpportunityView drayage={data.drayage} shipments={data.shipments} />}
{!data.loading && view === 'carrier' && <CarrierMixView data={data} />}
```

- [ ] **Step 4: Verify TypeScript**

Run: `cd frontend && npx tsc --noEmit -p tsconfig.json 2>&1 | head -30`
Expected: zero errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/pulse/views/DrayageOpportunityView.tsx \
        frontend/src/features/pulse/views/CarrierMixView.tsx \
        frontend/src/features/pulse/PulseLIVETab.tsx
git commit -m "feat(pulse-live): Drayage Opportunity + Carrier Mix views"
```

---

### Task D4: Insert Pulse LIVE tab into Workspace

**Files:**
- Modify: `frontend/src/components/company/Workspace.tsx`

- [ ] **Step 1: Read Workspace.tsx around line 341 (tab list)**

Use `Read` to find the `tabs` array (e.g. `["Overview", "Pre-Call", "Contacts", "Shipments", "RFP", "Activity", "Campaigns", "Settings"]`).

- [ ] **Step 2: Insert "Pulse LIVE" between Shipments and RFP**

Change the tabs array to:
```ts
["Overview", "Pre-Call", "Contacts", "Shipments", "Pulse LIVE", "RFP", "Activity", "Campaigns", "Settings"]
```

Add the rendering case (where existing tab content is switched on the active tab name):
```tsx
import { PulseLIVETab } from '@/features/pulse/PulseLIVETab';
// ...
{activeTab === 'Pulse LIVE' && <PulseLIVETab sourceCompanyKey={company?.source_company_key || null} />}
```

- [ ] **Step 3: Verify TypeScript + run dev server**

Run: `cd frontend && npx tsc --noEmit -p tsconfig.json 2>&1 | head -30`
Expected: zero errors.

Run (background) `cd frontend && npm run dev` and visually verify the new tab appears with the helper banner. Then stop the dev server.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/company/Workspace.tsx
git commit -m "feat(pulse-live): mount PulseLIVETab in Workspace between Shipments and RFP"
```

---

## Sub-Project E — Branded PDF & Excel Exports

### Task E1: Brand constants + install jspdf-autotable

**Files:**
- Create: `frontend/src/lib/pulse/reportBrand.ts`
- Modify: `frontend/package.json`

- [ ] **Step 1: Install jspdf-autotable**

Run: `cd frontend && npm install --save jspdf-autotable@^3`
Expected: package added, lockfile updated.

- [ ] **Step 2: Create brand constants**

```ts
// frontend/src/lib/pulse/reportBrand.ts
export const BRAND = {
  // Matches the dark gradient used in docs/mockups/pulse-digest-sample.html
  gradientStart: '#0F172A',
  gradientEnd:   '#1E293B',
  accentCyan:    '#00F0FF',
  mark:          'L',
  wordmark:      'Logistic Intel',
  footerCity:    'Atlanta, GA',
  primary:       '#3B82F6',
  textDark:      '#0F172A',
  textMuted:     '#64748B',
} as const;

export const PDF_PAGE = {
  width:  612,   // letter
  height: 792,
  marginX: 36,
  marginTop: 90,    // leaves room for branded header on every page
  marginBottom: 50, // leaves room for footer
} as const;
```

- [ ] **Step 3: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/src/lib/pulse/reportBrand.ts
git commit -m "feat(pulse-live): install jspdf-autotable + brand constants"
```

---

### Task E2: PDF export

**Files:**
- Create: `frontend/src/lib/pulse/exportPulseLiveReportPdf.ts`

- [ ] **Step 1: Implement**

```ts
// frontend/src/lib/pulse/exportPulseLiveReportPdf.ts
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { BRAND, PDF_PAGE } from './reportBrand';
import type { PulseTrackedShipment, PulseDrayageEstimate, PulseLiveData } from './pulseLiveTypes';

export interface PulseLiveReportData {
  companyName: string;
  generatedAt: Date;
  shipments: PulseTrackedShipment[];
  drayage: PulseDrayageEstimate[];
  carrierMix: PulseLiveData['carrierMix'];
}

export function exportPulseLiveReportPdf(data: PulseLiveReportData) {
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });

  drawBrandHeader(doc, data);
  drawKpiSummary(doc, data);
  drawArrivalTable(doc, data);
  drawDrayageTable(doc, data);
  drawCarrierMix(doc, data);
  drawFooterDisclosure(doc);

  const slug = data.companyName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const date = data.generatedAt.toISOString().slice(0, 10);
  doc.save(`LIT-PulseLIVE-${slug}-${date}.pdf`);
}

function drawBrandHeader(doc: jsPDF, data: PulseLiveReportData) {
  doc.setFillColor(BRAND.gradientStart);
  doc.rect(0, 0, PDF_PAGE.width, 70, 'F');
  doc.setFillColor(BRAND.accentCyan);
  doc.roundedRect(24, 18, 30, 30, 6, 6, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(11);
  doc.text(BRAND.mark, 39, 39, { align: 'center' });
  doc.setFontSize(16);
  doc.text(BRAND.wordmark, 66, 38);
  doc.setFontSize(9);
  doc.setTextColor(180);
  doc.text(`Pulse LIVE report · ${data.generatedAt.toLocaleDateString('en-US')}`, 66, 54);
  doc.setFontSize(18);
  doc.setTextColor(255, 255, 255);
  doc.text(data.companyName, PDF_PAGE.width - 24, 38, { align: 'right' });
}

function drawKpiSummary(doc: jsPDF, data: PulseLiveReportData) {
  const totalShipments = data.shipments.length;
  const totalContainers = data.shipments.reduce((acc, s) => acc + (s.container_count || 0), 0);
  const totalDrayage = data.drayage.reduce((acc, d) => acc + d.est_cost_usd, 0);
  const trackedPct = totalShipments
    ? Math.round(data.shipments.filter(s => s.tracking_status === 'tracked').length / totalShipments * 100)
    : 0;
  const y = 90;
  doc.setTextColor(BRAND.textDark);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('Snapshot', 36, y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`${totalShipments} shipments · ${totalContainers} containers · ${trackedPct}% live tracking coverage · $${totalDrayage.toLocaleString('en-US')} estimated drayage opportunity`, 36, y + 14);
}

function drawArrivalTable(doc: jsPDF, data: PulseLiveReportData) {
  autoTable(doc, {
    startY: 130,
    head: [['BOL', 'Carrier', 'POD', 'Final dest', 'Containers', 'ETA / Arrived', 'Status']],
    body: data.shipments.map((s) => [
      s.bol_number,
      s.carrier || '—',
      s.destination_port || '—',
      [s.dest_city, s.dest_state].filter(Boolean).join(', ') || '—',
      s.container_count ?? '—',
      s.tracking_arrival_actual ? `Arrived ${new Date(s.tracking_arrival_actual).toLocaleDateString('en-US')}` :
        s.tracking_eta ? `ETA ${new Date(s.tracking_eta).toLocaleDateString('en-US')}` : '—',
      s.tracking_status || '—',
    ]),
    styles: { fontSize: 8 },
    headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255] },
    didDrawPage: (data) => stampHeaderFooter(doc),
  });
}

function drawDrayageTable(doc: jsPDF, data: PulseLiveReportData) {
  doc.addPage();
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(BRAND.textDark);
  doc.text('Drayage Opportunity', 36, PDF_PAGE.marginTop);
  autoTable(doc, {
    startY: PDF_PAGE.marginTop + 12,
    head: [['BOL', 'Final dest', 'Miles', 'Est. value', 'Range (±25%)']],
    body: data.drayage.map((d) => [
      d.bol_number,
      [d.destination_city, d.destination_state].filter(Boolean).join(', ') || '—',
      Math.round(d.miles).toLocaleString('en-US'),
      `$${d.est_cost_usd.toLocaleString('en-US')}`,
      `$${d.est_cost_low_usd.toLocaleString('en-US')} – $${d.est_cost_high_usd.toLocaleString('en-US')}`,
    ]),
    styles: { fontSize: 8 },
    headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255] },
    didDrawPage: (data) => stampHeaderFooter(doc),
  });
}

function drawCarrierMix(doc: jsPDF, data: PulseLiveReportData) {
  doc.addPage();
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(BRAND.textDark);
  doc.text('Carrier Mix', 36, PDF_PAGE.marginTop);
  autoTable(doc, {
    startY: PDF_PAGE.marginTop + 12,
    head: [['Carrier', 'BOLs', 'Containers', 'Live tracking']],
    body: data.carrierMix.map((c) => [c.carrier, c.bol_count, c.container_count, c.tracked ? 'Yes' : 'No']),
    styles: { fontSize: 8 },
    headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255] },
    didDrawPage: (data) => stampHeaderFooter(doc),
  });
}

function drawFooterDisclosure(doc: jsPDF) {
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(BRAND.textMuted);
    doc.text(
      'Drayage estimates based on distance, container type, and port. Actual quoted rates vary ±25%.',
      36, PDF_PAGE.height - 32
    );
    doc.text(`Logistic Intel · ${BRAND.footerCity}`, 36, PDF_PAGE.height - 20);
    doc.text(`Page ${i} of ${pageCount}`, PDF_PAGE.width - 36, PDF_PAGE.height - 20, { align: 'right' });
  }
}

function stampHeaderFooter(_doc: jsPDF) {
  // header is drawn once on page 1; footer added in drawFooterDisclosure.
}
```

- [ ] **Step 2: Verify TypeScript**

Run: `cd frontend && npx tsc --noEmit -p tsconfig.json 2>&1 | head -30`
Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/pulse/exportPulseLiveReportPdf.ts
git commit -m "feat(pulse-live): branded PDF export with jspdf-autotable"
```

---

### Task E3: Excel export

**Files:**
- Create: `frontend/src/lib/pulse/exportPulseLiveReportXlsx.ts`

- [ ] **Step 1: Implement**

```ts
// frontend/src/lib/pulse/exportPulseLiveReportXlsx.ts
import * as XLSX from 'xlsx';
import type { PulseTrackedShipment, PulseDrayageEstimate, PulseLiveData } from './pulseLiveTypes';

export interface PulseLiveXlsxData {
  companyName: string;
  generatedAt: Date;
  shipments: PulseTrackedShipment[];
  drayage: PulseDrayageEstimate[];
  carrierMix: PulseLiveData['carrierMix'];
}

export function exportPulseLiveReportXlsx(data: PulseLiveXlsxData) {
  const wb = XLSX.utils.book_new();

  const kpis = [
    ['Logistic Intel — Pulse LIVE Report'],
    [`Company: ${data.companyName}`],
    [`Generated: ${data.generatedAt.toLocaleString('en-US')}`],
    [],
    ['Total shipments', data.shipments.length],
    ['Total containers', data.shipments.reduce((a, s) => a + (s.container_count || 0), 0)],
    ['Estimated drayage opportunity', `$${data.drayage.reduce((a, d) => a + d.est_cost_usd, 0).toLocaleString('en-US')}`],
    ['Live tracking coverage', `${Math.round(data.shipments.filter(s => s.tracking_status === 'tracked').length / Math.max(1, data.shipments.length) * 100)}%`],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(kpis), 'KPIs');

  const shipmentsSheet = data.shipments.map((s) => ({
    BOL: s.bol_number,
    Carrier: s.carrier || '',
    POD: s.destination_port || '',
    'Final dest': [s.dest_city, s.dest_state].filter(Boolean).join(', '),
    Containers: s.container_count ?? '',
    'ETA': s.tracking_eta ? new Date(s.tracking_eta).toISOString().slice(0, 10) : '',
    Arrived: s.tracking_arrival_actual ? new Date(s.tracking_arrival_actual).toISOString().slice(0, 10) : '',
    Status: s.tracking_status || '',
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(shipmentsSheet), 'Shipments');

  const drayageSheet = data.drayage.map((d) => ({
    BOL: d.bol_number,
    'Final dest': [d.destination_city, d.destination_state].filter(Boolean).join(', '),
    Miles: Math.round(d.miles),
    'Est. value (USD)': d.est_cost_usd,
    'Low (USD)': d.est_cost_low_usd,
    'High (USD)': d.est_cost_high_usd,
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(drayageSheet), 'Drayage');

  const carrierSheet = data.carrierMix.map((c) => ({
    Carrier: c.carrier,
    BOLs: c.bol_count,
    Containers: c.container_count,
    'Live tracking': c.tracked ? 'Yes' : 'No',
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(carrierSheet), 'Carriers');

  const slug = data.companyName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const date = data.generatedAt.toISOString().slice(0, 10);
  XLSX.writeFile(wb, `LIT-PulseLIVE-${slug}-${date}.xlsx`);
}
```

- [ ] **Step 2: Verify TypeScript**

Run: `cd frontend && npx tsc --noEmit -p tsconfig.json 2>&1 | head -30`
Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/pulse/exportPulseLiveReportXlsx.ts
git commit -m "feat(pulse-live): branded Excel export, multi-sheet"
```

---

### Task E4: Wire download buttons into PulseLIVETab

**Files:**
- Modify: `frontend/src/features/pulse/PulseLIVETab.tsx`

- [ ] **Step 1: Add buttons**

Add imports and a button row above the view selector:

```tsx
import { exportPulseLiveReportPdf } from '@/lib/pulse/exportPulseLiveReportPdf';
import { exportPulseLiveReportXlsx } from '@/lib/pulse/exportPulseLiveReportXlsx';
// ...
function downloadPdf() {
  exportPulseLiveReportPdf({
    companyName: companyName || 'Saved Company',
    generatedAt: new Date(),
    shipments: data.shipments,
    drayage: data.drayage,
    carrierMix: data.carrierMix,
  });
}
function downloadXlsx() {
  exportPulseLiveReportXlsx({
    companyName: companyName || 'Saved Company',
    generatedAt: new Date(),
    shipments: data.shipments,
    drayage: data.drayage,
    carrierMix: data.carrierMix,
  });
}
// JSX:
<div className="flex items-center justify-between">
  <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1 text-sm w-fit">
    {/* existing buttons */}
  </div>
  <div className="flex items-center gap-2">
    <button onClick={downloadPdf} className="text-xs rounded-md border border-slate-200 bg-white px-3 py-1.5 hover:bg-slate-50">Download PDF</button>
    <button onClick={downloadXlsx} className="text-xs rounded-md border border-slate-200 bg-white px-3 py-1.5 hover:bg-slate-50">Download Excel</button>
  </div>
</div>
```

The `companyName` prop needs to be passed into `PulseLIVETab` — extend its props signature in Task D4 if not already done:
```tsx
export function PulseLIVETab({ sourceCompanyKey, companyName }: { sourceCompanyKey: string | null; companyName?: string }) {
```

And update the Workspace mount call:
```tsx
<PulseLIVETab sourceCompanyKey={company?.source_company_key || null} companyName={company?.name} />
```

- [ ] **Step 2: Verify TypeScript**

Run: `cd frontend && npx tsc --noEmit -p tsconfig.json 2>&1 | head -30`
Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/pulse/PulseLIVETab.tsx \
        frontend/src/components/company/Workspace.tsx
git commit -m "feat(pulse-live): wire PDF + Excel download buttons in Pulse LIVE tab"
```

---

## Sub-Project F — Digest Email Enrichment

### Task F1: Extend alert_diff payload with POD/dest/arrival/drayage

**Files:**
- Modify: `supabase/functions/_shared/alert_diff.ts`
- Modify: `supabase/functions/_shared/alert_diff.test.ts`

- [ ] **Step 1: Add fields to AlertCandidate payload type and computeAlertCandidates output**

Inside `alert_diff.ts`, extend the payload type for the volume alert:
```ts
export interface VolumeAlertPayload {
  company_name: string;
  city: string | null;
  state: string | null;
  before: number;
  after: number;
  pct_delta: number;
  // NEW:
  pod: string | null;
  final_dest: string | null;
  next_arrival_date: string | null;   // ISO date string
  drayage_est_usd: number | null;
  drayage_est_low_usd: number | null;
  drayage_est_high_usd: number | null;
  drayage_container_count: number | null;
}
```

The computation that builds the volume alert payload now also takes a `liveContext` argument:
```ts
export interface LiveCompanyContext {
  pod: string | null;
  final_dest: string | null;
  next_arrival_date: string | null;
  drayage: {
    total_est_usd: number;
    total_low_usd: number;
    total_high_usd: number;
    container_count: number;
  } | null;
}
```

Update `computeAlertCandidates(prev, next, liveContext?)` so the volume alert payload includes the new fields when `liveContext` is supplied.

- [ ] **Step 2: Add a test**

```ts
Deno.test("computeAlertCandidates — includes live context in volume payload when provided", () => {
  const cands = computeAlertCandidates(
    { shipments_12m: 30, last_shipment_date: null, top_routes: [] },
    { shipments_12m: 60, last_shipment_date: null, top_routes: [] },
    {
      pod: "USLGB",
      final_dest: "Chicago, IL",
      next_arrival_date: "2026-05-25T00:00:00Z",
      drayage: { total_est_usd: 8400, total_low_usd: 6300, total_high_usd: 10500, container_count: 4 },
    },
  );
  const volume = cands.find((c) => c.alert_type === "volume");
  assert(volume);
  assertEquals(volume!.payload.pod, "USLGB");
  assertEquals(volume!.payload.final_dest, "Chicago, IL");
  assertEquals(volume!.payload.drayage_est_usd, 8400);
});
```

- [ ] **Step 3: Run tests**

Run: `cd supabase/functions/_shared && deno test alert_diff.test.ts 2>&1 | tail -10`
Expected: all green.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/_shared/alert_diff.ts supabase/functions/_shared/alert_diff.test.ts
git commit -m "feat(pulse-live): alert_diff supports POD/dest/arrival/drayage in volume payload"
```

---

### Task F2: Update digest_render to show POD/dest/arrival + drayage section + service icons

**Files:**
- Modify: `supabase/functions/_shared/digest_render.ts`
- Modify: `supabase/functions/_shared/digest_render.test.ts` (create if missing)

- [ ] **Step 1: Add service-icon SVG helper**

At top of `digest_render.ts`, add inline-SVG strings:

```ts
// Inline SVGs for email — lucide-react path strings.
const SERVICE_SVG: Record<string, string> = {
  fcl: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;"><path d="M2 21c.6.5 1.2 1 2.5 1c2.5 0 2.5-2 5-2c1.3 0 1.9.5 2.5 1c.6.5 1.2 1 2.5 1c2.5 0 2.5-2 5-2c1.3 0 1.9.5 2.5 1"/><path d="M19.38 20A11.6 11.6 0 0 0 21 14l-9-4-9 4c0 2.9.94 5.34 2.81 7.76"/><path d="M19 13V7a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v6"/></svg>',
  lcl: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;"><path d="M16.5 9.4 7.55 4.24"/><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>',
  air: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;"><path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/></svg>',
  truck: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;"><path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9"/><path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/></svg>',
};

export function serviceIconSvg(mode: 'fcl' | 'lcl' | 'air' | 'truck'): string {
  return SERVICE_SVG[mode] || SERVICE_SVG.fcl;
}
```

- [ ] **Step 2: Extend renderVolumeRow to show POD/dest/arrival/drayage**

Replace the existing `renderVolumeRow` so it renders a second-line context block when payload fields are present:

```ts
function renderVolumeRow(alert) {
  const p = alert.payload || {};
  const name = htmlEscape(p.company_name || "Saved company");
  const loc = formatLocation(p);
  const before = formatNum(p.before);
  const after = formatNum(p.after);
  const pctStr = formatPct(p.pct_delta);
  const pctColor = (typeof p.pct_delta === "number" && p.pct_delta < 0) ? "#DC2626" : "#16A34A";
  const sevTag = renderSeverity(alert.severity);
  const locPart = loc ? `${loc} · ` : "";
  const contextLine = [];
  if (p.pod) contextLine.push(`POD: ${htmlEscape(p.pod)}`);
  if (p.final_dest) contextLine.push(`Final dest: ${htmlEscape(p.final_dest)}`);
  if (p.next_arrival_date) {
    contextLine.push(`Next arrival: ${htmlEscape(new Date(p.next_arrival_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }))}`);
  }
  const contextHtml = contextLine.length
    ? `<div style="font-size:11px; color:#94A3B8; margin-top:4px;">${contextLine.join(' · ')}</div>`
    : '';
  const opportunity = (typeof p.drayage_est_usd === 'number' && p.drayage_est_usd > 0)
    ? `<div style="font-size:11px; color:#0F172A; margin-top:6px;"><strong>Drayage opportunity:</strong> $${Math.round(p.drayage_est_usd).toLocaleString('en-US')} (${Math.round(p.drayage_est_low_usd || 0).toLocaleString('en-US')}–${Math.round(p.drayage_est_high_usd || 0).toLocaleString('en-US')}, ${p.drayage_container_count} containers)</div>`
    : '';
  return `<div style="font-size:14px; font-weight:bold; color:#0F172A;">${name}</div>
          <div style="font-size:12px; color:#64748B; margin-top:2px;">${locPart}${before} → ${after} shipments · <span style="color:${pctColor}; font-weight:bold;">${pctStr}</span>${sevTag}</div>
          ${contextHtml}
          ${opportunity}
          <a href="https://app.logisticintel.com/app/search?q=${encodeURIComponent(p.company_name || "")}" style="display:inline-block; margin-top:8px; font-size:11px; color:#3B82F6; font-weight:bold; text-decoration:none;">See full supply chain →</a>`;
}
```

- [ ] **Step 3: Add a test for the new fields rendering**

Create `digest_render.test.ts` if it doesn't exist:
```ts
import { assert, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { renderDigestHtml } from "./digest_render.ts";

Deno.test("digest renders POD/final dest/arrival when present", () => {
  const html = renderDigestHtml({
    firstName: "Test",
    alerts: [{
      alert_type: "volume",
      severity: "warning",
      payload: {
        company_name: "Acme Inc",
        before: 30, after: 60, pct_delta: 1.0,
        pod: "USLGB", final_dest: "Chicago, IL",
        next_arrival_date: "2026-05-25T00:00:00Z",
        drayage_est_usd: 8400, drayage_est_low_usd: 6300, drayage_est_high_usd: 10500,
        drayage_container_count: 4,
      },
    }],
    unsubscribeToken: "x",
  });
  assertStringIncludes(html, "POD: USLGB");
  assertStringIncludes(html, "Final dest: Chicago, IL");
  assertStringIncludes(html, "Drayage opportunity:");
  assertStringIncludes(html, "$8,400");
});
```

- [ ] **Step 4: Run tests**

Run: `cd supabase/functions/_shared && deno test digest_render.test.ts 2>&1 | tail -10`
Expected: green.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/digest_render.ts supabase/functions/_shared/digest_render.test.ts
git commit -m "feat(pulse-live): digest renders POD/dest/arrival + drayage opportunity on volume cards"
```

---

### Task F3: Wire drayage rollup into pulse-alert-digest

**Files:**
- Modify: `supabase/functions/pulse-alert-digest/index.ts`

- [ ] **Step 1: Add a per-company drayage rollup pull**

Where the function currently maps alerts → render args, add a query that fetches the drayage rollup keyed by `source_company_key` from `lit_drayage_estimates`:

```ts
// After fetching alerts, gather distinct source_company_keys present in alerts.
const companyKeys = [...new Set((alerts || []).map((a: any) => a.source_company_key).filter(Boolean))];
let drayageByCompany = new Map<string, { sum: number; low: number; high: number; containers: number }>();
if (companyKeys.length > 0) {
  const { data: dray } = await supabase
    .from("lit_drayage_estimates")
    .select("source_company_key, est_cost_usd, est_cost_low_usd, est_cost_high_usd, containers_eq")
    .in("source_company_key", companyKeys);
  for (const d of dray || []) {
    const prev = drayageByCompany.get(d.source_company_key) || { sum: 0, low: 0, high: 0, containers: 0 };
    prev.sum += Number(d.est_cost_usd);
    prev.low += Number(d.est_cost_low_usd);
    prev.high += Number(d.est_cost_high_usd);
    prev.containers += Number(d.containers_eq);
    drayageByCompany.set(d.source_company_key, prev);
  }
}

// When building each user's alerts array for render:
const enriched = filtered.map((a: any) => {
  const dr = drayageByCompany.get(a.source_company_key);
  if (dr && a.alert_type === "volume") {
    return {
      ...a,
      payload: {
        ...(a.payload || {}),
        drayage_est_usd: Math.round(dr.sum),
        drayage_est_low_usd: Math.round(dr.low),
        drayage_est_high_usd: Math.round(dr.high),
        drayage_container_count: Math.round(dr.containers),
      },
    };
  }
  return a;
});
// pass `enriched` to renderDigestHtml instead of `filtered`
```

- [ ] **Step 2: Re-deploy via MCP**

`deploy_edge_function` with the updated index.ts + shared deps.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/pulse-alert-digest/index.ts
git commit -m "feat(pulse-live): pulse-alert-digest enriches volume payload with drayage rollup"
```

---

### Task F4: Update draft-send sample data to exercise new sections

**Files:**
- Modify: `supabase/functions/pulse-digest-draft-send/index.ts`

- [ ] **Step 1: Extend sampleAlerts() with new fields**

Replace the volume entries with:
```ts
{ alert_type: "volume", severity: "critical", payload: {
    company_name: "Acme Logistics Co.", city: "Long Beach", state: "CA",
    before: 42, after: 78, pct_delta: 0.857,
    pod: "USLGB", final_dest: "Chicago, IL",
    next_arrival_date: "2026-05-25T00:00:00Z",
    drayage_est_usd: 12600, drayage_est_low_usd: 9450, drayage_est_high_usd: 15750,
    drayage_container_count: 6,
}},
{ alert_type: "volume", severity: "warning", payload: {
    company_name: "Pacific Trade Imports", city: "Newark", state: "NJ",
    before: 31, after: 22, pct_delta: -0.29,
    pod: "USNYC", final_dest: "Columbus, OH",
    next_arrival_date: "2026-05-30T00:00:00Z",
    drayage_est_usd: 4200, drayage_est_low_usd: 3150, drayage_est_high_usd: 5250,
    drayage_container_count: 2,
}},
```

- [ ] **Step 2: Re-deploy via MCP**

`deploy_edge_function` with updated draft-send.

- [ ] **Step 3: Invoke and send a fresh draft**

Run:
```bash
curl -sS -X POST \
  -H "X-Internal-Cron: $LIT_CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"to":"vraymond@logisticintel.com","first_name":"Valesco","subject_prefix":"[DRAFT v2] "}' \
  "https://jkmrfiaefxwgbvftohrb.supabase.co/functions/v1/pulse-digest-draft-send"
```
Expected: `{"ok":true,...}` and a fresh email lands in the founder's inbox showing the new POD/dest/arrival/drayage rendering.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/pulse-digest-draft-send/index.ts
git commit -m "feat(pulse-live): draft-send sample data exercises new POD/dest/arrival/drayage payload"
```

---

## Pre-Launch Checklist

Before the first production cron tick, verify:

- [ ] `MAERSK_CLIENT_ID`, `MAERSK_CLIENT_SECRET` set as env vars on `pulse-bol-tracking-tick` (founder dashboard step — Supabase MCP has no env-var setter)
- [ ] `HAPAG_CLIENT_ID`, `HAPAG_CLIENT_SECRET` set as env vars on `pulse-bol-tracking-tick`
- [ ] `LIT_CRON_SECRET` env var set on `pulse-bol-tracking-tick`, `pulse-drayage-recompute` (already set via Vault on DB side)
- [ ] One manual test invocation of `pulse-bol-tracking-tick` against a known Maersk BOL — verify row appears in `lit_bol_tracking_events`
- [ ] One manual test invocation of `pulse-drayage-recompute` — verify row appears in `lit_drayage_estimates`
- [ ] Draft digest re-sent to `vraymond@logisticintel.com` with new POD/dest/arrival/drayage sections (Task F4)
- [ ] Visual QA in browser: Pulse LIVE tab on a saved company with both Maersk and CMA CGM BOLs (verify carrier mix view shows the gap honestly)
- [ ] PDF export downloaded and opened — verify branded header, all 3 sections, footer disclosure
- [ ] Excel export downloaded — verify 4 sheets with correct data

## Notes for Implementer

- All work stays on branch `claude/review-dashboard-deploy-3AmMD`.
- Each task has one commit; commit message follows the pattern in each step.
- After all 22 tasks land, open a single PR to `main` describing the full Pulse LIVE feature.
- The `pulse-digest-preview` function also has the `first_name` → `full_name` bug from prior work. Redeploy it with the same fix sometime during this sprint (separate small commit, not part of any task).
- Do NOT add Vizion / Terminal49 / Project44 dependencies. The spec explicitly defers them.
- Do NOT name OSRM, ImportYeti, Apollo, or any other data-source vendor in user-facing copy. Carriers (Maersk, Hapag-Lloyd) ARE allowed.
- DCSA event codes used here: LOAD (loaded), DEPA (departed), ARRI (arrived at port), DISC (discharged), GTOT (gate out), DLV (delivered). Reference: https://dcsa.org/standards/track-and-trace/
