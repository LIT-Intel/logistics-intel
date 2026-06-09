# Campaign Performance Pipeline + KPI Hero — Design Spec

**Date:** 2026-06-05
**Sub-project:** B (of A/B/C decomposition)
**Status:** Approved decomposition, design pending user nod
**Lands after A because:** The aggregation view + RPC must respect org boundaries from day one. Building this before A would leak metrics across orgs (a metrics row is just an aggregate over `lit_outreach_history`, which has no org_id today — the join happens through `lit_campaigns.org_id`).

---

## Problem

Investigation (agent `a21fc87a0bcd6ccdd`) confirmed:

- **Write side works.** `send-campaign-email/index.ts:732-754` correctly inserts into `lit_outreach_history` for every send (event_type `sent`, `opened`, `clicked`, `replied`, `bounced`, `suppressed`). 150 rows in DB. Test Campaign 1 has 2 sent + 2 clicked; Boss Man has 2 sent.
- **Read side is silently null.** `frontend/src/features/outbound/hooks/useCampaigns.ts:90` hard-codes `funnel: null`. The comment at `:87-89` literally says: *"Funnel / spark / health remain null until there is a backed aggregation endpoint over lit_outreach_history."* That endpoint was never built.
- **Frontend then renders the empty state.** `FunnelStrip.tsx:14-28` shows *"No outreach data yet — appears once the first step sends."* Always. For every campaign.
- **The header KPI tile shows only Audience Size.** User explicitly asked: "this is a marketing campaign page, the user needs to see the campaign analytics performance at the top hero header."

---

## Architecture

### Aggregation layer (Postgres)

Create a view + an RPC. View is the canonical source; RPC is for efficient batch fetch from the list page.

**View — `lit_campaign_funnel_v`** (one row per campaign, aggregating its `lit_outreach_history` events):

```sql
CREATE OR REPLACE VIEW lit_campaign_funnel_v AS
SELECT
  c.id AS campaign_id,
  c.org_id,                  -- from sub-project A
  -- Enrolled = unique recipient_email touched by the campaign
  (SELECT count(DISTINCT (metadata->>'recipient_email'))
     FROM lit_outreach_history h
    WHERE h.campaign_id = c.id) AS enrolled,
  -- Sent = count of event_type='sent'
  (SELECT count(*) FROM lit_outreach_history h
    WHERE h.campaign_id = c.id AND h.event_type = 'sent') AS sent,
  -- Opened/clicked/replied/bounced = same pattern
  (SELECT count(*) FROM lit_outreach_history h
    WHERE h.campaign_id = c.id AND h.event_type = 'opened') AS opened,
  (SELECT count(*) FROM lit_outreach_history h
    WHERE h.campaign_id = c.id AND h.event_type = 'clicked') AS clicked,
  (SELECT count(*) FROM lit_outreach_history h
    WHERE h.campaign_id = c.id AND h.event_type = 'replied') AS replied,
  (SELECT count(*) FROM lit_outreach_history h
    WHERE h.campaign_id = c.id AND h.event_type = 'bounced') AS bounced,
  (SELECT count(*) FROM lit_outreach_history h
    WHERE h.campaign_id = c.id AND h.event_type = 'suppressed') AS suppressed,
  -- Most recent event timestamp for "last activity" surface
  (SELECT max(created_at) FROM lit_outreach_history h
    WHERE h.campaign_id = c.id) AS last_event_at
  FROM lit_campaigns c;
```

The view inherits `org_id` from `lit_campaigns`, which means an RLS policy on the underlying `lit_campaigns` table is enough — the view sees what the user sees. **No separate RLS on the view needed** because views inherit underlying-table RLS in Postgres ≥15.

**Performance note.** The 6 subqueries are ugly for read-heavy traffic. After A lands, profile this view. If `lit_outreach_history` grows past ~100K rows, replace with a single `GROUP BY campaign_id, event_type` materialized aggregation or trigger-maintained denormalized columns on `lit_campaigns`. For now (150 rows), the view is fine.

**RPC — `lit_campaign_metrics_batch(campaign_ids uuid[])`**:

```sql
CREATE OR REPLACE FUNCTION lit_campaign_metrics_batch(p_campaign_ids uuid[])
RETURNS TABLE (
  campaign_id uuid, enrolled bigint, sent bigint, opened bigint,
  clicked bigint, replied bigint, bounced bigint, suppressed bigint,
  last_event_at timestamptz, open_rate numeric, click_rate numeric,
  reply_rate numeric, bounce_rate numeric
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT
    v.campaign_id, v.enrolled, v.sent, v.opened, v.clicked, v.replied,
    v.bounced, v.suppressed, v.last_event_at,
    CASE WHEN v.sent > 0 THEN ROUND(100.0 * v.opened / v.sent, 1) ELSE NULL END AS open_rate,
    CASE WHEN v.sent > 0 THEN ROUND(100.0 * v.clicked / v.sent, 1) ELSE NULL END AS click_rate,
    CASE WHEN v.sent > 0 THEN ROUND(100.0 * v.replied / v.sent, 1) ELSE NULL END AS reply_rate,
    CASE WHEN v.sent > 0 THEN ROUND(100.0 * v.bounced / v.sent, 1) ELSE NULL END AS bounce_rate
    FROM lit_campaign_funnel_v v
   WHERE v.campaign_id = ANY(p_campaign_ids)
     AND (
       -- inline RLS check matching sub-project A's policy
       v.org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid() AND status = 'active')
       OR EXISTS (SELECT 1 FROM platform_admins WHERE user_id = auth.uid())
     );
$$;
```

SECURITY DEFINER + inline RLS check pattern is needed because RPCs don't auto-apply view RLS in all cases — make the check explicit.

### Frontend integration

**1. `useCampaigns.ts` — populate `funnel` from the RPC**

Replace the hard-coded `funnel: null` at line 90:

```ts
// After fetching campaigns from getCrmCampaigns
const ids = campaigns.map(c => c.id);
const { data: metrics } = await supabase.rpc('lit_campaign_metrics_batch', {
  p_campaign_ids: ids,
});
const metricsById = new Map((metrics ?? []).map(m => [m.campaign_id, m]));

// In normalize():
const m = metricsById.get(raw.id);
return {
  ...,
  funnel: m ? {
    enrolled: m.enrolled, sent: m.sent, opened: m.opened,
    clicked: m.clicked, replied: m.replied, bounced: m.bounced,
    openRate: m.open_rate, clickRate: m.click_rate,
    replyRate: m.reply_rate, bounceRate: m.bounce_rate,
  } : null,
  health: deriveHealth(m),  // simple function: red if bounce>5%, amber if reply==0 after N days, green otherwise
  spark: null,  // sparkline data — out of scope for v1, comes from time-series query later
};
```

**2. `FunnelStrip.tsx` — render real numbers**

Replace the placeholder branch at `:14-28` to render the 5-tile funnel when `funnel` is non-null. Keep the placeholder text but reword: *"No metrics yet — launch this campaign to start collecting."*

**3. Campaign Header KPI Hero (new)**

The CampaignBuilder header currently shows: `[DRAFT] [Preview as contact] [Test send] [Save draft] [Launch]` row + `AUDIENCE SIZE [—] select recipients` strip.

Replace the lone audience-size strip with a **6-tile KPI hero** that adapts to campaign state:

| State | Tiles shown |
|---|---|
| `draft` (no sends yet) | AUDIENCE SIZE, SCHEDULED, ESTIMATED REACH, EST. OPEN RATE\*, EST. CLICK RATE\*, EST. REPLY RATE\* — all marked with light tooltip *"Projection based on org's last 30d benchmarks"* |
| `active` (sends happening) | AUDIENCE SIZE, SENT, OPEN RATE, CLICK RATE, REPLY RATE, BOUNCE RATE — real numbers from the RPC |
| `paused` / `complete` | Same 6 as `active` but with grey "Paused" / "Complete" badge in top-right of strip |

\*Estimated rates use the org's median rates across other launched campaigns. If org has zero launched campaigns, default to industry-average placeholder (40% open / 8% click / 3% reply) with a clear "industry avg" tooltip.

Each tile is `120px × 88px` with: label (UPPERCASE, 10px gray), value (24px semibold), delta vs previous period (12px, green/red), sparkline (40px tall, last 14 days from `lit_outreach_history` grouped by day).

### Health derivation (simple v1)

```ts
function deriveHealth(m: Metrics | undefined): 'green' | 'amber' | 'red' | null {
  if (!m || m.sent === 0) return null;
  if (m.bounce_rate > 5) return 'red';        // bounce rate above 5%
  if (m.sent > 50 && m.reply_rate === 0) return 'amber';  // no replies after meaningful volume
  return 'green';
}
```

Health drives the CampaignRow status pill color.

---

## Components (files to touch)

| File | Change |
|---|---|
| `supabase/migrations/20260605_lit_campaign_funnel_view.sql` | NEW — create view + RPC |
| `frontend/src/features/outbound/hooks/useCampaigns.ts:73-96` | Replace hard-coded null funnel with RPC fetch + merge |
| `frontend/src/features/outbound/components/FunnelStrip.tsx` | Render real numbers when funnel non-null; keep empty-state for genuinely-empty campaigns |
| `frontend/src/features/outbound/components/CampaignKpiHero.tsx` | NEW — 6-tile hero with state-dependent rendering |
| `frontend/src/pages/CampaignBuilder.jsx` (or .tsx) | Mount `<CampaignKpiHero />` in place of the current single audience-size strip |
| `frontend/src/features/outbound/lib/metrics.ts` | NEW — `deriveHealth`, `formatRate`, `formatDelta` helpers |
| `frontend/src/features/outbound/components/Sparkline.tsx` | NEW — small SVG sparkline component (or use recharts if already in deps) |

---

## Data flow

1. User opens `/app/campaigns` → `useCampaigns()` fires
2. Hook fetches campaigns (with org filter from sub-project A)
3. Hook fires `lit_campaign_metrics_batch(p_campaign_ids: [...])` in parallel
4. `normalize()` merges metrics into each campaign's `funnel` slot + computes `health`
5. `FunnelStrip` renders real numbers for campaigns with metrics; placeholder for new campaigns

For the builder hero:
1. User opens `/app/campaigns/<id>` → `CampaignBuilder` mounts
2. Single-campaign fetch: `lit_campaign_metrics_batch(p_campaign_ids: [campaignId])`
3. `CampaignKpiHero` renders 6 tiles based on `campaign.status`
4. For sparklines, separate query: `lit_outreach_history` grouped by `date_trunc('day', created_at)` for last 14 days

---

## Error handling + edge cases

| Case | Behavior |
|---|---|
| RPC fails / times out | `funnel = null`, render placeholder. Don't block campaign list from loading |
| Campaign has `sent=0` but other events somehow > 0 | Render with `sent` = 0 and rates as `—` (CASE prevents divide-by-zero) |
| New campaign (status=draft) | KPI hero shows estimates with tooltip; no error state |
| Org has no historical campaigns (estimates fallback) | Use industry-average constants with clear "industry avg" tooltip |
| `lit_outreach_history` grows past 100K rows | View performance degrades. Switch to materialized view with `REFRESH MATERIALIZED VIEW CONCURRENTLY` on cron OR trigger-maintained counter columns on `lit_campaigns` |

---

## Testing

| Test | Scope |
|---|---|
| View aggregation correctness | SQL: insert 5 events of various types, verify view counts match |
| RPC respects org RLS | Integration: user from org A queries campaign IDs from org B → returns empty |
| `deriveHealth` returns correct color | Unit tests on each branch |
| `useCampaigns` merges metrics correctly | Mock RPC response, verify normalize output |
| `CampaignKpiHero` renders 6 tiles for each campaign state | Component tests |
| E2E: launch a test campaign, verify hero updates from estimates → real numbers as sends occur | Cypress / Playwright |

---

## Out of scope

- Reply attribution (which contact replied to which step) — separate workstream
- A/B variant performance split in the hero — needs separate UI design first
- Click-through-rate per link (link analytics drill-in) — separate workstream
- Time-series chart (the full chart, not just 14d sparkline) — separate workstream
- "Campaign comparison" view across campaigns — separate workstream

---

## Open design decisions surfaced for user

1. **Industry-average estimates fallback.** Should I hard-code `{open: 40%, click: 8%, reply: 3%}` as the fallback, or surface "no estimate yet" until org has 3+ launched campaigns? Defaulting to the hard-coded numbers because "—" tiles in a hero look broken.
2. **Sparkline range.** 14 days hard-coded for v1. Could be configurable later. Going with 14 to match typical campaign length.
3. **Health thresholds.** Bounce > 5% = red, no replies after 50 sends = amber. Picked from B2B email-marketing common defaults; tunable later via a `lit_org_settings` row.
