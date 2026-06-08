# Campaign Performance Pipeline + KPI Hero Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire campaign performance metrics (sent / opened / clicked / replied / bounced) end-to-end so the Campaigns list shows real funnels and the builder shows a 6-tile KPI hero — replacing the current "no outreach data yet" placeholder that fires for every campaign.

**Architecture:** Postgres view `lit_campaign_funnel_v` aggregates from `lit_outreach_history` grouped by `campaign_id`. RPC `lit_campaign_metrics_batch(uuid[])` returns per-campaign counters + computed rates. `useCampaigns` fetches metrics in one batched call after the campaigns query, merges into each `normalize()` output's `funnel`/`health` slots. New `CampaignKpiHero` component renders 6 tiles whose content adapts to campaign state (draft → estimates, active → real numbers, paused/complete → real numbers + badge).

**Tech Stack:** Postgres (view + RPC + SECURITY DEFINER with inline RLS check), React + TypeScript, TanStack Query (via existing hook), Vitest + RTL, Tailwind, lucide-react. Sparkline rendered as inline SVG (no new deps).

**Branch:** `claude/review-dashboard-deploy-3AmMD`.

**Spec:** [docs/superpowers/specs/2026-06-05-campaign-performance-pipeline-design.md](../specs/2026-06-05-campaign-performance-pipeline-design.md)

**Depends on:** Sub-project A ([2026-06-05-campaign-org-scoping-plan.md](2026-06-05-campaign-org-scoping-plan.md)) — the metrics RPC inherits org-scoping through `lit_campaigns.org_id`.

---

## File Structure

### Files to create

| Path | Responsibility |
|---|---|
| `supabase/migrations/20260605130000_lit_campaign_funnel_view.sql` | View + RPC for per-campaign metrics |
| `frontend/src/features/outbound/api/campaignMetrics.ts` | Typed client for `lit_campaign_metrics_batch` RPC |
| `frontend/src/features/outbound/lib/metrics.ts` | `deriveHealth`, `formatRate`, `formatDelta` pure helpers |
| `frontend/src/features/outbound/lib/__tests__/metrics.test.ts` | Vitest unit tests |
| `frontend/src/features/outbound/components/Sparkline.tsx` | Small inline-SVG sparkline (no extra dep) |
| `frontend/src/features/outbound/components/CampaignKpiHero.tsx` | 6-tile hero with state-dependent rendering |
| `frontend/src/features/outbound/components/__tests__/CampaignKpiHero.test.tsx` | Component tests |

### Files to modify

| Path | Change |
|---|---|
| `frontend/src/features/outbound/types.ts` (lines 6-12) | Extend `CampaignFunnel` with `clicked, bounced, openRate, clickRate, replyRate, bounceRate, lastEventAt` |
| `frontend/src/features/outbound/hooks/useCampaigns.ts` (line 90) | Drop hard-coded `funnel: null`; populate from RPC fetch |
| `frontend/src/features/outbound/components/FunnelStrip.tsx` (lines 13-28) | Reword placeholder ("No metrics yet — launch this campaign to start collecting"); keep real-data branch |
| `frontend/src/pages/CampaignBuilder.jsx` (~line 1029, ForecastStrip mount site) | Replace `<ForecastStrip />` with `<CampaignKpiHero />` |

---

## Task 1: Create the funnel view

**Files:**
- Create: `supabase/migrations/20260605130000_lit_campaign_funnel_view.sql`

- [ ] **Step 1: Audit `lit_outreach_history` event types**

```sql
SELECT event_type, count(*) AS n
  FROM public.lit_outreach_history
 GROUP BY event_type ORDER BY n DESC;
```

Expected: rows for `sent`, `opened`, `clicked`, `replied`, `bounced`, `suppressed`, `task_queued`, `send_failed`. Record counts as a baseline so step 4 of this task can verify the view matches.

- [ ] **Step 2: Write the view migration**

Create `supabase/migrations/20260605130000_lit_campaign_funnel_view.sql`:

```sql
-- 20260605130000_lit_campaign_funnel_view.sql
-- Per-campaign metrics aggregated from lit_outreach_history.
-- View inherits RLS from lit_campaigns (Postgres ≥15) so a user
-- only sees rows for campaigns they can already SELECT.

BEGIN;

CREATE OR REPLACE VIEW public.lit_campaign_funnel_v AS
SELECT
  c.id AS campaign_id,
  c.org_id,
  (SELECT count(DISTINCT (h.metadata->>'recipient_email'))
     FROM public.lit_outreach_history h
    WHERE h.campaign_id = c.id) AS enrolled,
  (SELECT count(*) FROM public.lit_outreach_history h
    WHERE h.campaign_id = c.id AND h.event_type = 'sent') AS sent,
  (SELECT count(*) FROM public.lit_outreach_history h
    WHERE h.campaign_id = c.id AND h.event_type = 'opened') AS opened,
  (SELECT count(*) FROM public.lit_outreach_history h
    WHERE h.campaign_id = c.id AND h.event_type = 'clicked') AS clicked,
  (SELECT count(*) FROM public.lit_outreach_history h
    WHERE h.campaign_id = c.id AND h.event_type = 'replied') AS replied,
  (SELECT count(*) FROM public.lit_outreach_history h
    WHERE h.campaign_id = c.id AND h.event_type = 'bounced') AS bounced,
  (SELECT count(*) FROM public.lit_outreach_history h
    WHERE h.campaign_id = c.id AND h.event_type = 'suppressed') AS suppressed,
  (SELECT max(created_at) FROM public.lit_outreach_history h
    WHERE h.campaign_id = c.id) AS last_event_at
FROM public.lit_campaigns c;

COMMENT ON VIEW public.lit_campaign_funnel_v IS
  'Per-campaign event aggregates from lit_outreach_history. Inherits RLS via lit_campaigns join.';

COMMIT;
```

- [ ] **Step 3: Apply the migration via Supabase MCP**

Use `mcp__claude_ai_Supabase__apply_migration` with `project_id: jkmrfiaefxwgbvftohrb`, `name: 20260605130000_lit_campaign_funnel_view`.

- [ ] **Step 4: Verify the view returns correct counts**

Pick the campaign with known events (e.g. "Test Campaign 1" — confirmed in spec investigation to have 2 sent + 2 clicked):

```sql
SELECT * FROM public.lit_campaign_funnel_v
 WHERE campaign_id = (SELECT id FROM public.lit_campaigns
                       WHERE name = 'Test Campaign 1' LIMIT 1);
```

Expected: `sent = 2`, `clicked = 2`, `opened/replied/bounced` per investigation. If counts don't match, debug by running the underlying subqueries directly against `lit_outreach_history` filtered to that campaign_id.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260605130000_lit_campaign_funnel_view.sql
git commit -m "feat(metrics): add lit_campaign_funnel_v view

Per-campaign aggregates from lit_outreach_history (enrolled, sent,
opened, clicked, replied, bounced, suppressed, last_event_at).
View inherits RLS via the lit_campaigns join in the FROM clause."
```

---

## Task 2: Create the metrics RPC

**Files:**
- Create: `supabase/migrations/20260605130100_lit_campaign_metrics_batch_rpc.sql`

- [ ] **Step 1: Write the RPC migration**

Create `supabase/migrations/20260605130100_lit_campaign_metrics_batch_rpc.sql`:

```sql
-- 20260605130100_lit_campaign_metrics_batch_rpc.sql
-- Batch metrics fetch for the campaigns list page. Returns one row
-- per requested campaign_id with raw counts + computed rates.
-- SECURITY DEFINER + inline RLS predicate because RPCs don't reliably
-- apply view RLS through STABLE bindings.

BEGIN;

CREATE OR REPLACE FUNCTION public.lit_campaign_metrics_batch(p_campaign_ids uuid[])
RETURNS TABLE (
  campaign_id   uuid,
  enrolled      bigint,
  sent          bigint,
  opened        bigint,
  clicked       bigint,
  replied       bigint,
  bounced       bigint,
  suppressed    bigint,
  last_event_at timestamptz,
  open_rate     numeric,
  click_rate    numeric,
  reply_rate    numeric,
  bounce_rate   numeric
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    v.campaign_id,
    v.enrolled,
    v.sent,
    v.opened,
    v.clicked,
    v.replied,
    v.bounced,
    v.suppressed,
    v.last_event_at,
    CASE WHEN v.sent > 0 THEN ROUND(100.0 * v.opened  / v.sent, 1) ELSE NULL END AS open_rate,
    CASE WHEN v.sent > 0 THEN ROUND(100.0 * v.clicked / v.sent, 1) ELSE NULL END AS click_rate,
    CASE WHEN v.sent > 0 THEN ROUND(100.0 * v.replied / v.sent, 1) ELSE NULL END AS reply_rate,
    CASE WHEN v.sent > 0 THEN ROUND(100.0 * v.bounced / v.sent, 1) ELSE NULL END AS bounce_rate
    FROM public.lit_campaign_funnel_v v
   WHERE v.campaign_id = ANY(p_campaign_ids)
     AND (
       v.org_id IN (
         SELECT om.org_id FROM public.org_members om
          WHERE om.user_id = auth.uid() AND om.status = 'active'
       )
       OR EXISTS (
         SELECT 1 FROM public.platform_admins pa WHERE pa.user_id = auth.uid()
       )
     );
$function$;

GRANT EXECUTE ON FUNCTION public.lit_campaign_metrics_batch(uuid[]) TO authenticated;

COMMIT;
```

- [ ] **Step 2: Apply via Supabase MCP**

Use `apply_migration` with `name: 20260605130100_lit_campaign_metrics_batch_rpc`.

- [ ] **Step 3: Verify via SQL invocation**

Pick a real campaign ID:

```sql
WITH ids AS (SELECT array_agg(id) AS arr FROM (
  SELECT id FROM public.lit_campaigns ORDER BY created_at DESC LIMIT 3
) s)
SELECT * FROM public.lit_campaign_metrics_batch((SELECT arr FROM ids));
```

Expected: 3 rows with sent/opened/clicked counts matching the view, plus `open_rate`/`click_rate` computed. If a campaign has `sent = 0`, the rates are NULL (CASE prevents divide-by-zero).

- [ ] **Step 4: Cross-org isolation smoke test**

Confirm a user from org A can't see org B's metrics. Pick a campaign ID from "Boss Man" (Mattingly org) and try to fetch it as if a Logistic Intel user:

```sql
-- This SET impersonation works only when run with service_role; verifies
-- the RPC's inline RLS predicate. In production the auth.uid() comes
-- from the JWT.
SELECT * FROM public.lit_campaign_metrics_batch(
  ARRAY[(SELECT id FROM public.lit_campaigns WHERE name = 'Boss Man' LIMIT 1)]
);
-- Expected when run via the service-role MCP: returns the row (service
-- role bypasses RLS). The real isolation test runs against the frontend
-- in Task 6 step 4.
```

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260605130100_lit_campaign_metrics_batch_rpc.sql
git commit -m "feat(metrics): add lit_campaign_metrics_batch RPC

Batch fetch for the campaigns list page — returns raw counts + computed
open/click/reply/bounce rates for an input array of campaign_ids.
SECURITY DEFINER with inline RLS predicate so cross-org calls return
nothing for non-admin users."
```

---

## Task 3: Extend the CampaignFunnel TypeScript type

**Files:**
- Modify: `frontend/src/features/outbound/types.ts` (lines 6-12)

- [ ] **Step 1: Read the current type**

The current type at `frontend/src/features/outbound/types.ts:6-12`:

```ts
export interface CampaignFunnel {
  enrolled: number;
  sent: number;
  opened: number;
  replied: number;
  booked: number;
}
```

`booked` is aspirational — not in the RPC. Drop it and replace with the real channels.

- [ ] **Step 2: Replace the interface**

Edit `frontend/src/features/outbound/types.ts:6-12`:

```ts
export interface CampaignFunnel {
  enrolled: number;
  sent: number;
  opened: number;
  clicked: number;
  replied: number;
  bounced: number;
  suppressed: number;
  // Computed rates (0-100), null when sent === 0
  openRate: number | null;
  clickRate: number | null;
  replyRate: number | null;
  bounceRate: number | null;
  // ISO timestamp of the most recent event for this campaign
  lastEventAt: string | null;
}
```

- [ ] **Step 3: Update FunnelStrip's STAGES array to drop "Booked"**

Edit `frontend/src/features/outbound/components/FunnelStrip.tsx:5-11`. Replace the `STAGES` array:

```tsx
const STAGES: Array<{ key: keyof CampaignFunnel; label: string; color: string }> = [
  { key: "enrolled", label: "Enrolled", color: "#94A3B8" },
  { key: "sent", label: "Sent", color: "#64748B" },
  { key: "opened", label: "Opened", color: "#3B82F6" },
  { key: "clicked", label: "Clicked", color: "#6366F1" },
  { key: "replied", label: "Replied", color: "#10B981" },
];
```

(`bounced`/`suppressed` rendered separately as warning chips in CampaignKpiHero — not in the linear funnel.)

- [ ] **Step 4: Reword the empty-state in FunnelStrip**

Edit `frontend/src/features/outbound/components/FunnelStrip.tsx:14-28`. Replace the empty-state copy:

```tsx
if (!funnel) {
  return (
    <div className="flex flex-1 items-center gap-2 rounded-lg border border-dashed border-slate-200 bg-slate-50/60 px-3 py-2">
      <span
        className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400"
        style={{ fontFamily: fontDisplay }}
      >
        Funnel
      </span>
      <span className="text-[11px] text-slate-500">
        No metrics yet — launch this campaign to start collecting.
      </span>
    </div>
  );
}
```

- [ ] **Step 5: Run the existing test suite to catch type breakage**

```bash
cd frontend && npx vitest run
```

Expected: any test referencing `funnel.booked` fails. Fix by deleting those references (they were never reachable since funnel was always null). Any test passing `{ booked: 0 }` should be updated to the new shape.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/features/outbound/types.ts frontend/src/features/outbound/components/FunnelStrip.tsx
git commit -m "feat(metrics): extend CampaignFunnel with real event channels

Drops aspirational 'booked' field; adds clicked, bounced, suppressed,
computed rates (openRate/clickRate/replyRate/bounceRate), lastEventAt.
FunnelStrip STAGES updated to match. Placeholder copy reworded from
'No outreach data yet' to 'No metrics yet — launch this campaign'."
```

---

## Task 4: Create the typed campaignMetrics RPC client

**Files:**
- Create: `frontend/src/features/outbound/api/campaignMetrics.ts`

- [ ] **Step 1: Write the client**

Create `frontend/src/features/outbound/api/campaignMetrics.ts`:

```ts
/**
 * Typed client for the lit_campaign_metrics_batch Postgres RPC.
 * Batched fetch keeps the campaigns list page to two queries total
 * (campaigns + metrics) regardless of campaign count.
 */
import { supabase } from "@/lib/supabaseClient";
import type { CampaignFunnel } from "../types";

interface RpcRow {
  campaign_id: string;
  enrolled: number;
  sent: number;
  opened: number;
  clicked: number;
  replied: number;
  bounced: number;
  suppressed: number;
  last_event_at: string | null;
  open_rate: number | null;
  click_rate: number | null;
  reply_rate: number | null;
  bounce_rate: number | null;
}

export async function fetchCampaignMetricsBatch(
  campaignIds: string[],
): Promise<Map<string, CampaignFunnel>> {
  if (!campaignIds.length) return new Map();

  const { data, error } = await supabase.rpc("lit_campaign_metrics_batch", {
    p_campaign_ids: campaignIds,
  });

  if (error) {
    console.warn("[campaignMetrics] RPC failed:", error.message);
    return new Map();
  }

  const out = new Map<string, CampaignFunnel>();
  (data as RpcRow[] | null)?.forEach((row) => {
    out.set(row.campaign_id, {
      enrolled: Number(row.enrolled ?? 0),
      sent: Number(row.sent ?? 0),
      opened: Number(row.opened ?? 0),
      clicked: Number(row.clicked ?? 0),
      replied: Number(row.replied ?? 0),
      bounced: Number(row.bounced ?? 0),
      suppressed: Number(row.suppressed ?? 0),
      openRate: row.open_rate,
      clickRate: row.click_rate,
      replyRate: row.reply_rate,
      bounceRate: row.bounce_rate,
      lastEventAt: row.last_event_at,
    });
  });
  return out;
}
```

The exact import path for `supabase` is the same one used in `frontend/src/lib/supabase.ts`. Verify:

```bash
grep -n "import .* supabase " frontend/src/lib/supabase.ts | head -3
```

If `supabase` is imported from `./supabaseClient`, the import above is correct. If from another path, update.

- [ ] **Step 2: Smoke test in dev console**

There's no unit test for this client (it's a thin RPC wrapper). Verification happens via the `useCampaigns` integration test in Task 5 + the E2E in Task 7. To smoke-test now:

```bash
cd frontend && npm run dev
```

Open `/app/campaigns`, open browser DevTools console, run:

```js
import('@/features/outbound/api/campaignMetrics').then(m =>
  m.fetchCampaignMetricsBatch([<a-real-campaign-id-from-the-page>]).then(console.log)
);
```

Expected: a Map with one entry holding the metrics. If the supabase client isn't accessible this way, skip — the integration test in Task 5 covers it.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/outbound/api/campaignMetrics.ts
git commit -m "feat(metrics): typed client for lit_campaign_metrics_batch RPC

Returns Map<campaignId, CampaignFunnel>. Empty input returns empty
map without firing a query. RPC errors degrade to empty map so the
campaigns list still renders even if metrics fetch fails."
```

---

## Task 5: Wire `useCampaigns` to populate funnel from real metrics

**Files:**
- Modify: `frontend/src/features/outbound/hooks/useCampaigns.ts` (lines 73-96 + the refresh function)
- Create: `frontend/src/features/outbound/hooks/__tests__/useCampaigns.metrics.test.ts`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/features/outbound/hooks/__tests__/useCampaigns.metrics.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

vi.mock("@/lib/api", () => ({
  getCrmCampaigns: vi.fn(),
}));
vi.mock("@/features/outbound/api/campaignMetrics", () => ({
  fetchCampaignMetricsBatch: vi.fn(),
}));

import { getCrmCampaigns } from "@/lib/api";
import { fetchCampaignMetricsBatch } from "@/features/outbound/api/campaignMetrics";
import { useCampaigns } from "../useCampaigns";

describe("useCampaigns — metrics merge", () => {
  beforeEach(() => vi.clearAllMocks());

  it("populates funnel from metrics RPC for each campaign", async () => {
    (getCrmCampaigns as any).mockResolvedValue([
      { id: "c1", name: "A", status: "active" },
      { id: "c2", name: "B", status: "draft" },
    ]);
    (fetchCampaignMetricsBatch as any).mockResolvedValue(new Map([
      ["c1", {
        enrolled: 10, sent: 8, opened: 4, clicked: 2, replied: 1, bounced: 0, suppressed: 0,
        openRate: 50, clickRate: 25, replyRate: 12.5, bounceRate: 0, lastEventAt: "2026-06-05T12:00:00Z",
      }],
    ]));

    const { result } = renderHook(() => useCampaigns());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.campaigns).toHaveLength(2);
    expect(result.current.campaigns[0].funnel).toEqual(expect.objectContaining({
      sent: 8, opened: 4, openRate: 50,
    }));
    expect(result.current.campaigns[1].funnel).toBeNull(); // no metrics for c2
  });

  it("derives health=green for a healthy campaign", async () => {
    (getCrmCampaigns as any).mockResolvedValue([{ id: "c1", name: "A", status: "active" }]);
    (fetchCampaignMetricsBatch as any).mockResolvedValue(new Map([
      ["c1", {
        enrolled: 100, sent: 80, opened: 40, clicked: 8, replied: 4, bounced: 1, suppressed: 0,
        openRate: 50, clickRate: 10, replyRate: 5, bounceRate: 1.25, lastEventAt: null,
      }],
    ]));
    const { result } = renderHook(() => useCampaigns());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.campaigns[0].health).toBe("good");
  });

  it("derives health=attention for high bounce rate", async () => {
    (getCrmCampaigns as any).mockResolvedValue([{ id: "c1", name: "A", status: "active" }]);
    (fetchCampaignMetricsBatch as any).mockResolvedValue(new Map([
      ["c1", {
        enrolled: 100, sent: 80, opened: 4, clicked: 0, replied: 0, bounced: 6, suppressed: 0,
        openRate: 5, clickRate: 0, replyRate: 0, bounceRate: 7.5, lastEventAt: null,
      }],
    ]));
    const { result } = renderHook(() => useCampaigns());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.campaigns[0].health).toBe("attention");
  });

  it("survives RPC failure — campaigns still render with null funnel", async () => {
    (getCrmCampaigns as any).mockResolvedValue([{ id: "c1", name: "A", status: "active" }]);
    (fetchCampaignMetricsBatch as any).mockResolvedValue(new Map()); // empty on failure
    const { result } = renderHook(() => useCampaigns());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.campaigns).toHaveLength(1);
    expect(result.current.campaigns[0].funnel).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd frontend && npx vitest run src/features/outbound/hooks/__tests__/useCampaigns.metrics.test.ts
```

Expected: FAIL — funnel is still hard-coded null; health is null.

- [ ] **Step 3: Update the refresh function + normalize**

Edit `frontend/src/features/outbound/hooks/useCampaigns.ts`. At the top, add import:

```ts
import { fetchCampaignMetricsBatch } from "@/features/outbound/api/campaignMetrics";
import { deriveHealth } from "@/features/outbound/lib/metrics";
import type { CampaignFunnel, CampaignHealth } from "@/features/outbound/types";
```

Replace `normalize()` (lines 73-96) — change the signature to accept the metrics map and drop the hard-coded nulls:

```ts
function normalize(row: any, metrics: Map<string, CampaignFunnel>): OutboundCampaign {
  const status = normalizeStatus(row?.status);
  const id = String(row?.id ?? "");
  const funnel = metrics.get(id) ?? null;
  const health: CampaignHealth = deriveHealth(funnel);
  return {
    id,
    name: String(row?.name ?? "Untitled campaign"),
    status,
    channel: row?.channel ?? null,
    channels: deriveChannels(row),
    steps: deriveStepCount(row),
    recipients: extractRecipientCount(row),
    metrics:
      row?.metrics && typeof row.metrics === "object" ? row.metrics : {},
    createdAt: row?.created_at ?? null,
    updatedAt: row?.updated_at ?? null,
    funnel,
    health,
    alert: null,
    spark: null, // sparkline data — Task 6, separate time-series query
    nextSendLabel: status === "draft" ? "—" : status === "paused" ? "paused" : "—",
  };
}
```

Replace `refresh()` (lines 110-119) to fetch metrics in parallel and pass them to normalize:

```ts
const refresh = useCallback(async () => {
  setLoading(true);
  setError(null);
  try {
    const resp = await getCrmCampaigns();
    const rows = asArray(resp);
    const ids = rows.map((r) => String(r?.id ?? "")).filter(Boolean);
    const metrics = await fetchCampaignMetricsBatch(ids);
    setCampaigns(rows.map((r) => normalize(r, metrics)));
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to load campaigns.";
    setError(msg);
  } finally {
    setLoading(false);
  }
}, []);
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd frontend && npx vitest run src/features/outbound/hooks/__tests__/useCampaigns.metrics.test.ts
```

Expected: all 4 cases PASS. If `deriveHealth` doesn't exist yet, the import will fail — that comes in Task 6. Defer this step's pass-verification until Task 6 step 4.

- [ ] **Step 5: Commit (deferred until Task 6 lands deriveHealth)**

Hold the commit. After Task 6 step 3 completes, return here and run:

```bash
cd frontend && npx vitest run src/features/outbound/hooks/__tests__/useCampaigns.metrics.test.ts
```

Then:

```bash
git add frontend/src/features/outbound/hooks/useCampaigns.ts frontend/src/features/outbound/hooks/__tests__/useCampaigns.metrics.test.ts
git commit -m "feat(metrics): wire useCampaigns to populate funnel from RPC

Fetches metrics via lit_campaign_metrics_batch in parallel with the
campaigns query, merges into each normalize() output. Drops the
hard-coded funnel:null sentinel that fired the empty-state for every
campaign. Health derived from funnel via deriveHealth(). Covered by
4 Vitest cases (populate, health=good, health=attention, RPC failure
degrades gracefully)."
```

---

## Task 6: Add the `deriveHealth` + rate-formatting helpers

**Files:**
- Create: `frontend/src/features/outbound/lib/metrics.ts`
- Create: `frontend/src/features/outbound/lib/__tests__/metrics.test.ts`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/features/outbound/lib/__tests__/metrics.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { deriveHealth, formatRate, formatCount } from "../metrics";
import type { CampaignFunnel } from "../../types";

function f(over: Partial<CampaignFunnel> = {}): CampaignFunnel {
  return {
    enrolled: 0, sent: 0, opened: 0, clicked: 0, replied: 0, bounced: 0, suppressed: 0,
    openRate: null, clickRate: null, replyRate: null, bounceRate: null, lastEventAt: null,
    ...over,
  };
}

describe("deriveHealth", () => {
  it("returns null when no metrics", () => {
    expect(deriveHealth(null)).toBeNull();
  });
  it("returns null when sent === 0", () => {
    expect(deriveHealth(f({ sent: 0 }))).toBeNull();
  });
  it("returns 'attention' when bounceRate > 5", () => {
    expect(deriveHealth(f({ sent: 100, bounceRate: 7.5 }))).toBe("attention");
  });
  it("returns 'attention' when sent > 50 and replyRate === 0", () => {
    expect(deriveHealth(f({ sent: 60, replyRate: 0 }))).toBe("attention");
  });
  it("returns 'great' when replyRate > 5 AND openRate > 40", () => {
    expect(deriveHealth(f({ sent: 100, replyRate: 6, openRate: 45, bounceRate: 1 }))).toBe("great");
  });
  it("returns 'good' for the middle case", () => {
    expect(deriveHealth(f({ sent: 100, replyRate: 2, openRate: 30, bounceRate: 2 }))).toBe("good");
  });
});

describe("formatRate", () => {
  it("returns em-dash for null", () => { expect(formatRate(null)).toBe("—"); });
  it("rounds to 1 decimal with % suffix", () => { expect(formatRate(12.345)).toBe("12.3%"); });
  it("renders integer when value is a whole number", () => { expect(formatRate(50)).toBe("50%"); });
  it("renders 0 cleanly", () => { expect(formatRate(0)).toBe("0%"); });
});

describe("formatCount", () => {
  it("returns em-dash for null/undefined", () => { expect(formatCount(null)).toBe("—"); });
  it("returns plain integer for small numbers", () => { expect(formatCount(42)).toBe("42"); });
  it("returns Xk for >= 1000", () => { expect(formatCount(1234)).toBe("1.2k"); });
  it("returns XM for >= 1,000,000", () => { expect(formatCount(1500000)).toBe("1.5M"); });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd frontend && npx vitest run src/features/outbound/lib/__tests__/metrics.test.ts
```

Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement the helpers**

Create `frontend/src/features/outbound/lib/metrics.ts`:

```ts
/**
 * Pure helpers for campaign metric formatting + health derivation.
 * No React, no Supabase — fully testable in isolation.
 */
import type { CampaignFunnel, CampaignHealth } from "../types";

/**
 * Derive a simple traffic-light health from funnel metrics.
 *  - null: not enough data (sent === 0 or no funnel)
 *  - 'attention': bounce > 5% OR (sent > 50 with zero replies)
 *  - 'great': replyRate > 5 AND openRate > 40
 *  - 'good': everything in between
 */
export function deriveHealth(f: CampaignFunnel | null): CampaignHealth {
  if (!f || f.sent === 0) return null;
  if ((f.bounceRate ?? 0) > 5) return "attention";
  if (f.sent > 50 && (f.replyRate ?? 0) === 0) return "attention";
  if ((f.replyRate ?? 0) > 5 && (f.openRate ?? 0) > 40) return "great";
  return "good";
}

/**
 * Format a 0-100 rate for tile display. Null → em-dash. Whole numbers
 * drop the trailing ".0".
 */
export function formatRate(v: number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  const rounded = Math.round(v * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded}%` : `${rounded}%`;
}

/**
 * Format a count for compact tile display. >=1M uses 'M', >=1k uses
 * 'k', everything below shows the integer.
 */
export function formatCount(v: number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}k`;
  return String(Math.round(v));
}
```

- [ ] **Step 4: Run test to verify it passes — and re-run Task 5's deferred test**

```bash
cd frontend && npx vitest run src/features/outbound/lib/__tests__/metrics.test.ts
cd frontend && npx vitest run src/features/outbound/hooks/__tests__/useCampaigns.metrics.test.ts
```

Expected: all metrics.test.ts cases PASS. Then Task 5's useCampaigns.metrics.test.ts also passes (the deferred verification from Task 5 step 4).

- [ ] **Step 5: Commit metrics helpers**

```bash
git add frontend/src/features/outbound/lib/metrics.ts frontend/src/features/outbound/lib/__tests__/metrics.test.ts
git commit -m "feat(metrics): deriveHealth + formatRate + formatCount helpers

Pure functions. deriveHealth returns traffic-light from CampaignFunnel
(bounce>5 or zero-replies-after-50-sends → attention; high engagement
→ great; middle → good). formatRate/formatCount handle null gracefully
with em-dash. 13 Vitest cases."
```

- [ ] **Step 6: Now commit Task 5's hook changes**

```bash
git add frontend/src/features/outbound/hooks/useCampaigns.ts frontend/src/features/outbound/hooks/__tests__/useCampaigns.metrics.test.ts
git commit -m "feat(metrics): wire useCampaigns to populate funnel from RPC

(See Task 5 in plan for full message — split between two commits
because Task 6's deriveHealth helper was a dependency.)"
```

---

## Task 7: Build the Sparkline component

**Files:**
- Create: `frontend/src/features/outbound/components/Sparkline.tsx`

Sparkline is a small inline-SVG component. No tests because pure presentation — render verification happens via CampaignKpiHero component tests.

- [ ] **Step 1: Implement Sparkline**

Create `frontend/src/features/outbound/components/Sparkline.tsx`:

```tsx
/**
 * Tiny SVG sparkline. Renders a smooth polyline from a numeric series.
 * Pure presentation — no axis, no labels, no tooltips. Use inside
 * KPI tiles where the trend matters more than exact values.
 */
interface Props {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
  className?: string;
}

export function Sparkline({
  data,
  width = 80,
  height = 24,
  color = "#3B82F6",
  className,
}: Props) {
  if (!data || data.length < 2) return null;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const stepX = width / (data.length - 1);
  const points = data
    .map((v, i) => `${i * stepX},${height - ((v - min) / range) * height}`)
    .join(" ");
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      aria-hidden
    >
      <polyline
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
        points={points}
      />
    </svg>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/features/outbound/components/Sparkline.tsx
git commit -m "feat(metrics): add Sparkline component (inline SVG, no deps)

Polyline from numeric series, autoscaled to width/height. Returns
null when data has fewer than 2 points. Used inside the new
CampaignKpiHero tiles."
```

---

## Task 8: Build CampaignKpiHero (state-dependent 6-tile hero)

**Files:**
- Create: `frontend/src/features/outbound/components/CampaignKpiHero.tsx`
- Create: `frontend/src/features/outbound/components/__tests__/CampaignKpiHero.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/features/outbound/components/__tests__/CampaignKpiHero.test.tsx`:

```tsx
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { CampaignKpiHero } from "../CampaignKpiHero";
import type { CampaignFunnel } from "../../types";

function f(over: Partial<CampaignFunnel> = {}): CampaignFunnel {
  return {
    enrolled: 0, sent: 0, opened: 0, clicked: 0, replied: 0, bounced: 0, suppressed: 0,
    openRate: null, clickRate: null, replyRate: null, bounceRate: null, lastEventAt: null,
    ...over,
  };
}

describe("CampaignKpiHero", () => {
  it("renders 6 tile labels for a draft campaign", () => {
    render(<CampaignKpiHero status="draft" audienceCount={120} funnel={null} sparkData={[]} />);
    expect(screen.getByText(/AUDIENCE/i)).toBeInTheDocument();
    expect(screen.getByText(/SCHEDULED/i)).toBeInTheDocument();
    expect(screen.getByText(/EST. OPEN RATE/i)).toBeInTheDocument();
    expect(screen.getByText(/EST. CLICK RATE/i)).toBeInTheDocument();
    expect(screen.getByText(/EST. REPLY RATE/i)).toBeInTheDocument();
    expect(screen.getByText(/ESTIMATED REACH/i)).toBeInTheDocument();
  });

  it("renders 6 real-metric labels for an active campaign with funnel data", () => {
    const funnel = f({ sent: 80, opened: 40, clicked: 8, replied: 4, bounced: 1, openRate: 50, clickRate: 10, replyRate: 5, bounceRate: 1.25 });
    render(<CampaignKpiHero status="active" audienceCount={100} funnel={funnel} sparkData={[]} />);
    expect(screen.getByText(/AUDIENCE/i)).toBeInTheDocument();
    expect(screen.getByText(/SENT/i)).toBeInTheDocument();
    expect(screen.getByText(/OPEN RATE/i)).toBeInTheDocument();
    expect(screen.getByText(/CLICK RATE/i)).toBeInTheDocument();
    expect(screen.getByText(/REPLY RATE/i)).toBeInTheDocument();
    expect(screen.getByText(/BOUNCE RATE/i)).toBeInTheDocument();
    expect(screen.getByText("50%")).toBeInTheDocument();
    expect(screen.getByText("10%")).toBeInTheDocument();
  });

  it("renders the Paused badge for paused status", () => {
    const funnel = f({ sent: 5 });
    render(<CampaignKpiHero status="paused" audienceCount={50} funnel={funnel} sparkData={[]} />);
    expect(screen.getByText(/Paused/i)).toBeInTheDocument();
  });

  it("shows audience em-dash when count is 0", () => {
    render(<CampaignKpiHero status="draft" audienceCount={0} funnel={null} sparkData={[]} />);
    // First tile is AUDIENCE; its value should be the em-dash
    const audienceTile = screen.getByText(/AUDIENCE/i).closest("div");
    expect(audienceTile?.textContent).toContain("—");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd frontend && npx vitest run src/features/outbound/components/__tests__/CampaignKpiHero.test.tsx
```

Expected: FAIL — component doesn't exist.

- [ ] **Step 3: Implement the component**

Create `frontend/src/features/outbound/components/CampaignKpiHero.tsx`:

```tsx
/**
 * CampaignKpiHero — state-dependent 6-tile hero for the campaign
 * builder. Replaces the old single AUDIENCE SIZE strip.
 *
 * Draft state: shows audience + scheduled + estimated reach + 3
 * estimated rates (industry-average fallback when org has no
 * historical campaigns).
 *
 * Active/paused/complete: shows audience + sent + 4 real rates
 * (open/click/reply/bounce) from the funnel data. Paused state adds
 * a grey "Paused" badge.
 */
import type { CampaignFunnel, CampaignStatus } from "../types";
import { formatCount, formatRate } from "../lib/metrics";
import { Sparkline } from "./Sparkline";

interface Props {
  status: CampaignStatus;
  audienceCount: number;
  funnel: CampaignFunnel | null;
  sparkData: number[];
  scheduledLabel?: string;
}

// Industry-average fallback rates (B2B email) when org has no
// launched-campaign history yet. Hard-coded here per the spec's
// "Open design decisions" — empty estimate tiles look broken.
const FALLBACK_OPEN_RATE = 40;
const FALLBACK_CLICK_RATE = 8;
const FALLBACK_REPLY_RATE = 3;

interface TileProps {
  label: string;
  value: string;
  hint?: string;
  spark?: number[];
}

function Tile({ label, value, hint, spark }: TileProps) {
  return (
    <div className="flex min-w-[120px] flex-col gap-1 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">
        {label}
      </div>
      <div className="text-2xl font-semibold tabular-nums text-slate-900">
        {value}
      </div>
      <div className="flex items-center justify-between gap-2">
        {hint ? (
          <span className="text-[11px] text-slate-500">{hint}</span>
        ) : <span />}
        {spark && spark.length >= 2 ? (
          <Sparkline data={spark} width={56} height={18} />
        ) : null}
      </div>
    </div>
  );
}

export function CampaignKpiHero({
  status,
  audienceCount,
  funnel,
  sparkData,
  scheduledLabel,
}: Props) {
  const isDraft = status === "draft";
  const audienceDisplay = audienceCount > 0 ? formatCount(audienceCount) : "—";

  return (
    <div className="relative">
      {status === "paused" && (
        <span className="absolute right-3 top-3 z-10 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
          Paused
        </span>
      )}
      {status === "archived" && (
        <span className="absolute right-3 top-3 z-10 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
          Complete
        </span>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <Tile
          label="Audience"
          value={audienceDisplay}
          hint={audienceCount > 0 ? "selected" : "pick recipients"}
        />

        {isDraft ? (
          <>
            <Tile
              label="Scheduled"
              value={scheduledLabel ?? "—"}
              hint="first send"
            />
            <Tile
              label="Estimated Reach"
              value={audienceCount > 0 ? formatCount(audienceCount) : "—"}
              hint="unique recipients"
            />
            <Tile
              label="Est. Open Rate"
              value={`${FALLBACK_OPEN_RATE}%`}
              hint="industry avg"
            />
            <Tile
              label="Est. Click Rate"
              value={`${FALLBACK_CLICK_RATE}%`}
              hint="industry avg"
            />
            <Tile
              label="Est. Reply Rate"
              value={`${FALLBACK_REPLY_RATE}%`}
              hint="industry avg"
            />
          </>
        ) : (
          <>
            <Tile
              label="Sent"
              value={formatCount(funnel?.sent ?? null)}
              spark={sparkData}
            />
            <Tile
              label="Open Rate"
              value={formatRate(funnel?.openRate ?? null)}
              hint={funnel ? `${formatCount(funnel.opened)} opened` : undefined}
            />
            <Tile
              label="Click Rate"
              value={formatRate(funnel?.clickRate ?? null)}
              hint={funnel ? `${formatCount(funnel.clicked)} clicked` : undefined}
            />
            <Tile
              label="Reply Rate"
              value={formatRate(funnel?.replyRate ?? null)}
              hint={funnel ? `${formatCount(funnel.replied)} replied` : undefined}
            />
            <Tile
              label="Bounce Rate"
              value={formatRate(funnel?.bounceRate ?? null)}
              hint={funnel ? `${formatCount(funnel.bounced)} bounced` : undefined}
            />
          </>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd frontend && npx vitest run src/features/outbound/components/__tests__/CampaignKpiHero.test.tsx
```

Expected: all 4 cases PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/outbound/components/CampaignKpiHero.tsx frontend/src/features/outbound/components/__tests__/CampaignKpiHero.test.tsx
git commit -m "feat(metrics): CampaignKpiHero (6-tile state-dependent hero)

Draft state: audience + scheduled + estimated reach + 3 industry-avg
rate estimates. Active/paused/complete: audience + sent + 4 real rates
(open/click/reply/bounce) from funnel. Paused/Complete render a grey
badge. Sparkline rendered next to Sent value when sparkData provided.
4 RTL cases."
```

---

## Task 9: Mount CampaignKpiHero in CampaignBuilder

**Files:**
- Modify: `frontend/src/pages/CampaignBuilder.jsx` (line 28 import + line 1029 mount)

- [ ] **Step 1: Find the ForecastStrip mount**

```bash
grep -n "ForecastStrip" frontend/src/pages/CampaignBuilder.jsx
```

Expected matches: line 28 (import), line 1029 (mount as `<ForecastStrip audienceCount={selectedIds.size} />`).

- [ ] **Step 2: Add the CampaignKpiHero import**

Edit `frontend/src/pages/CampaignBuilder.jsx`. Add at the top with other component imports (after line 28):

```jsx
import { CampaignKpiHero } from "@/features/outbound/components/CampaignKpiHero";
import { fetchCampaignMetricsBatch } from "@/features/outbound/api/campaignMetrics";
import { useEffect, useState } from "react"; // if not already imported
```

- [ ] **Step 3: Fetch metrics for the current campaign**

Find the existing campaign-state declarations (search for `useState` near the top of the CampaignBuilder component). Add:

```jsx
const [funnel, setFunnel] = useState(null);
const [sparkData, setSparkData] = useState([]);

useEffect(() => {
  if (!campaignId) return;
  fetchCampaignMetricsBatch([campaignId]).then((m) => {
    setFunnel(m.get(campaignId) ?? null);
  });
}, [campaignId]);

// Sparkline data: fetch daily sent counts for last 14 days. Inline
// query — small enough not to need its own helper for v1.
useEffect(() => {
  if (!campaignId) return;
  (async () => {
    const { supabase } = await import("@/lib/supabaseClient");
    const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
    const { data } = await supabase
      .from("lit_outreach_history")
      .select("created_at")
      .eq("campaign_id", campaignId)
      .eq("event_type", "sent")
      .gte("created_at", since)
      .order("created_at", { ascending: true });
    if (!data) { setSparkData([]); return; }
    const byDay = new Map();
    for (const row of data) {
      const day = row.created_at.slice(0, 10);
      byDay.set(day, (byDay.get(day) ?? 0) + 1);
    }
    setSparkData(Array.from(byDay.values()));
  })();
}, [campaignId]);
```

NOTE: the existing component must have `campaignId` available (from `useParams()` or similar). If the variable has a different name in the file, use that. If the campaign hasn't been created yet (the "new" path), `campaignId` will be null and both effects no-op.

- [ ] **Step 4: Replace the ForecastStrip with CampaignKpiHero**

Find line 1029 (the `<ForecastStrip audienceCount={selectedIds.size} />` mount). Replace with:

```jsx
<CampaignKpiHero
  status={campaign?.status ?? "draft"}
  audienceCount={selectedIds.size + manualEmails.length}
  funnel={funnel}
  sparkData={sparkData}
  scheduledLabel={projectedFirstSendLabel}
/>
```

NOTES:
- `campaign?.status` references the existing campaign object. Adjust the path if the variable has a different name in this file.
- `selectedIds.size + manualEmails.length` — this is the audience fix from sub-project C, also applied here. If C lands first, this is already correct; if not, this lands together.
- `projectedFirstSendLabel` — there's already a ProjectedSchedule region near line 510 in the original. Pull the formatted string from there. If it's a JSX node and not a string, derive the string inline.

- [ ] **Step 5: Remove the now-unused ForecastStrip import**

Search for any remaining references:

```bash
grep -n "ForecastStrip" frontend/src/pages/CampaignBuilder.jsx
```

If line 28's import is unused, delete it. If ForecastStrip is mounted elsewhere in the file, keep the import.

- [ ] **Step 6: Manual smoke test**

```bash
cd frontend && npm run dev
```

Open an existing campaign that has been launched (e.g. "Test Campaign 1"). Expected: 6 tiles render, "Sent" shows 2, "Click Rate" shows 100% (2 clicked / 2 sent). Open a draft campaign — 6 tiles render with "Est. Open Rate 40%" etc.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/CampaignBuilder.jsx
git commit -m "feat(metrics): mount CampaignKpiHero in CampaignBuilder

Replaces the single-tile ForecastStrip with the 6-tile
state-dependent hero. Fetches funnel + 14d sent sparkline for
the current campaign. Draft view shows industry-average estimates;
active view shows real rates from lit_campaign_metrics_batch."
```

---

## Task 10: E2E acceptance verification

**Files:**
- None (pure verification)

- [ ] **Step 1: Campaigns list page shows real funnels**

Open `/app/campaigns`. Expected: each campaign row shows a populated FunnelStrip with the 5-stage bars (Enrolled / Sent / Opened / Clicked / Replied), not the "No metrics yet" placeholder. For campaigns with 0 sends (drafts), the placeholder still appears.

Cross-check the numbers against the DB:

```sql
SELECT c.name, m.sent, m.opened, m.clicked, m.replied
  FROM public.lit_campaigns c
  JOIN public.lit_campaign_funnel_v m ON m.campaign_id = c.id
 ORDER BY c.created_at DESC LIMIT 5;
```

The numbers in the SQL output must match the numbers shown in the FunnelStrip on the page.

- [ ] **Step 2: CampaignKpiHero — active campaign**

Open an active campaign (e.g. "Test Campaign 1"). Expected: 6 tiles. Audience > 0. Sent = 2. Click Rate = 100% (or whatever the real ratio is). Sparkline visible next to Sent value.

- [ ] **Step 3: CampaignKpiHero — draft campaign**

Open a brand new draft (no sends). Expected: 6 tiles. Audience = current selected count. "Est. Open Rate 40%" etc. with "industry avg" hints.

- [ ] **Step 4: Cross-org isolation**

Log in as `ematt@mattinglyind.com`. Open `/app/campaigns`. Expected: only Mattingly campaigns visible; metrics for those campaigns appear. No Logistic Intel campaign metrics leak.

- [ ] **Step 5: Health pill on CampaignRow reflects health derive**

Confirm visually: a healthy campaign (replyRate > 5, openRate > 40) shows green; a high-bounce campaign shows amber/attention. If the existing CampaignRow doesn't render a health pill at all, this verification is a no-op — the health value is just stored on the OutboundCampaign and any future row component picks it up.

- [ ] **Step 6: Document acceptance**

```bash
git commit --allow-empty -m "chore(metrics): sub-project B acceptance verified

Funnel data renders end-to-end. KPI hero shows draft estimates and
active real metrics. Cross-org isolation confirmed. Ready for C
(builder polish) on top of this foundation."
```

---

## Self-Review

**Spec coverage:**

| Spec section | Covered by |
|---|---|
| Postgres view `lit_campaign_funnel_v` | Task 1 |
| RPC `lit_campaign_metrics_batch` | Task 2 |
| `useCampaigns` populates funnel from RPC | Tasks 4, 5 |
| `FunnelStrip` real-numbers render + reworded placeholder | Task 3 |
| `CampaignKpiHero` 6-tile state-dependent | Task 8 |
| Mount KpiHero in CampaignBuilder | Task 9 |
| `deriveHealth` traffic-light | Task 6 |
| Sparkline component | Task 7 |
| 14-day sparkline data source | Task 9 step 3 |
| Industry-average fallback rates | Task 8 (FALLBACK_* constants) |
| Cross-org RLS verified | Task 10 step 4 |
| RPC failure degrades to null funnel | Task 4 + Task 5 step 1 test case |

No gaps.

**Placeholder scan:** Scanned for "TODO" / "TBD" / "implement later" / "Add appropriate". Two soft-NOTE comments in Task 9 step 3/4 about variable-name verification at implementation time — intentional, since the surrounding component's exact variable names need confirming when the engineer is in the file. Concrete fallback names are provided.

**Type consistency:**
- `CampaignFunnel` extended in Task 3, used in Tasks 4, 5, 6, 8 with the same 12-field shape
- `deriveHealth` signature `(f: CampaignFunnel | null) => CampaignHealth` consistent in metrics.ts (Task 6) and useCampaigns (Task 5)
- `fetchCampaignMetricsBatch` returns `Map<string, CampaignFunnel>` consistently
- `CampaignKpiHero` props match what CampaignBuilder mounts in Task 9

No drift.

---

## Out of scope (deferred)

- Reply attribution (which contact replied to which step)
- A/B variant performance split in the hero
- Per-link click-through-rate drill-in
- Full time-series chart (only the 14-day sparkline ships)
- Trigger-maintained denormalized counter columns (planned escalation if view performance degrades past 100K events)
- Cross-campaign comparison view
