# Sub-project I — Tracking Pipeline Restoration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan.

**Goal:** Fix the silent click pipeline (FK violation), backfill orphaned engagement events, and fix the 200% sent-rate denominator bug. Restores accurate KPIs across every campaign system-wide.

**Branch:** `claude/review-dashboard-deploy-3AmMD`
**Spec:** [docs/superpowers/specs/2026-06-10-tracking-pipeline-restoration-design.md](../specs/2026-06-10-tracking-pipeline-restoration-design.md)

---

## File Structure

### Files to create

| Path | Responsibility |
|---|---|
| `supabase/migrations/20260610180000_backfill_engagement_campaign_id.sql` | One-shot UPDATE attaches campaign_id to orphaned engagement rows |
| `supabase/migrations/20260610180100_lit_campaign_funnel_v_add_unique_sent.sql` | Extend view with `unique_sent` + exclude `test_sent` from enrolled |
| `supabase/migrations/20260610180200_lit_campaign_metrics_batch_unique_sent.sql` | RPC returns `unique_sent` |

### Files to modify

| Path | Change |
|---|---|
| `supabase/functions/redirect-click/index.ts` | Drop `contact_id` from history insert + add `.throwOnError()` so future FK violations are loud |
| `frontend/src/features/outbound/types.ts` | Add `uniqueSent: number` to `CampaignFunnel` |
| `frontend/src/features/outbound/api/campaignMetrics.ts` | Plumb `unique_sent` from RPC response |
| `frontend/src/features/outbound/components/FunnelStrip.tsx` | Use RPC-computed rates; use `uniqueSent` for sent-bar denominator |

---

## Task 1: Fix `redirect-click` FK violation

**Files:**
- Modify: `supabase/functions/redirect-click/index.ts`

- [ ] **Step 1: Audit current state**

```bash
grep -nE "contact_id|throwOnError|insert.*lit_outreach_history" supabase/functions/redirect-click/index.ts | head -10
```

Locate the insert site (approximately lines 79-102). Identify the exact line where `contact_id` is set.

- [ ] **Step 2: Drop `contact_id` from the insert payload**

Edit the insert. Pattern:
```ts
const { error: insertError } = await supabase
  .from("lit_outreach_history")
  .insert({
    campaign_id: link.campaign_id,
    user_id: link.user_id,
    org_id: link.org_id,
    event_type: "clicked",
    status: "clicked",
    // contact_id: lookup.id, ← DELETE THIS LINE
    metadata: {
      recipient_id: link.recipient_id,
      slug: clickedSlug,
      ip_hash: ipHash,
      user_agent: req.headers.get("user-agent") || null,
      clicked_at: new Date().toISOString(),
    },
  })
  .throwOnError(); // NEW — surface any future FK violations in logs
```

Keep all other fields (campaign_id from link, recipient_id in metadata) — these provide attribution.

- [ ] **Step 3: Deploy edge function**

Use `mcp__claude_ai_Supabase__deploy_edge_function`:
- project_id: `jkmrfiaefxwgbvftohrb`
- name: `redirect-click`
- entrypoint_path: `index.ts`
- verify_jwt: (check current via `get_edge_function` first; preserve)
- Bundle any `_shared/*` imports referenced

Report old → new version.

- [ ] **Step 4: Smoke test**

```sql
-- Find an existing tracked link
SELECT slug, original_url, campaign_id FROM public.lit_outreach_links
 WHERE campaign_id = 'cdc8aaf6-79ef-4ead-8672-5d7941b31a03' LIMIT 1;
```

Hit the redirect URL in browser (or via curl):
```bash
curl -I "https://jkmrfiaefxwgbvftohrb.supabase.co/functions/v1/redirect-click?slug=<SLUG>" 2>&1 | head -3
```

Verify the click landed:
```sql
SELECT event_type, campaign_id, metadata->>'recipient_id' AS recipient
  FROM public.lit_outreach_history
 WHERE campaign_id = 'cdc8aaf6-79ef-4ead-8672-5d7941b31a03'
   AND event_type = 'clicked'
 ORDER BY created_at DESC LIMIT 1;
```

Expected: 1 row with `campaign_id` populated, `event_type='clicked'`. Pre-fix this query returned zero rows.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/redirect-click/index.ts
git commit -m "fix(analytics): redirect-click no longer hits FK constraint on contact_id

Root cause of all click tracking being silently broken: the insert
set contact_id = lit_campaign_contacts.id, but lit_outreach_history.contact_id
FK targets lit_contacts.id (different table). Postgres rejected every
insert; logs showed lit_outreach_history_contact_id_fkey violations
at every click timestamp.

Drop contact_id from the insert — recipient attribution lives in
metadata.recipient_id which the engagement drill-in already uses.
Add .throwOnError() so any future FK violations surface in edge fn
logs instead of silently failing."
```

---

## Task 2: Backfill historical orphaned engagement events

**Files:**
- Create: `supabase/migrations/20260610180000_backfill_engagement_campaign_id.sql`

- [ ] **Step 1: Audit how many rows need backfill**

```sql
SELECT count(*) AS orphaned_engagement_rows
  FROM public.lit_outreach_history e
 WHERE e.campaign_id IS NULL
   AND (e.event_type IN ('opened','clicked','replied','bounced')
        OR e.opened_at IS NOT NULL OR e.clicked_at IS NOT NULL
        OR e.replied_at IS NOT NULL);
SELECT count(*) AS backfillable_via_message_id
  FROM public.lit_outreach_history e
  JOIN public.lit_outreach_history s
    ON s.metadata->>'message_id' = e.metadata->>'message_id'
   AND s.event_type = 'sent'
 WHERE e.campaign_id IS NULL
   AND (e.event_type IN ('opened','clicked','replied','bounced')
        OR e.opened_at IS NOT NULL OR e.clicked_at IS NOT NULL
        OR e.replied_at IS NOT NULL);
```

Record the two counts. Expected: backfillable should be most of the orphaned set.

- [ ] **Step 2: Write the migration**

Create `supabase/migrations/20260610180000_backfill_engagement_campaign_id.sql`:
```sql
-- 2026-06-10 — Backfill campaign_id + org_id on orphaned engagement rows.
-- Root cause: engagement-tracking writers (resend-webhook, reply-receiver,
-- track-open, etc.) historically wrote opened/clicked/replied/bounced rows
-- to lit_outreach_history but didn't backfill campaign_id from the
-- originating 'sent' row. The funnel view filters on h.campaign_id = c.id,
-- so every per-campaign KPI showed 0% engagement system-wide.
--
-- This UPDATE joins each orphaned engagement row to its sibling 'sent'
-- row by message_id (always set on sends) and copies campaign_id +
-- org_id over. Single transaction; idempotent (only updates where
-- campaign_id IS NULL).

BEGIN;

UPDATE public.lit_outreach_history e
   SET campaign_id = s.campaign_id,
       org_id = COALESCE(e.org_id, s.org_id)
  FROM public.lit_outreach_history s
 WHERE e.campaign_id IS NULL
   AND e.event_type IN ('opened', 'clicked', 'replied', 'bounced')
   AND s.event_type = 'sent'
   AND s.campaign_id IS NOT NULL
   AND s.metadata ? 'message_id'
   AND e.metadata ? 'message_id'
   AND s.metadata->>'message_id' = e.metadata->>'message_id';

COMMIT;
```

- [ ] **Step 3: Apply via Supabase MCP**

Use `mcp__claude_ai_Supabase__apply_migration` with name `20260610180000_backfill_engagement_campaign_id`.

- [ ] **Step 4: Verify recovery**

```sql
SELECT count(*) AS still_orphaned
  FROM public.lit_outreach_history e
 WHERE e.campaign_id IS NULL
   AND e.event_type IN ('opened','clicked','replied','bounced');
SELECT count(*) AS test_campaign_engagement_now
  FROM public.lit_outreach_history
 WHERE campaign_id = 'cdc8aaf6-79ef-4ead-8672-5d7941b31a03'
   AND event_type IN ('opened','clicked','replied','bounced');
```

Expected: `still_orphaned` should drop substantially; `test_campaign_engagement_now` should be > 0 if there were any engagement events for that campaign before.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260610180000_backfill_engagement_campaign_id.sql
git commit -m "fix(analytics): backfill campaign_id on orphaned engagement rows

Engagement writers (resend-webhook, reply-receiver, open-pixel tracker)
historically wrote opened/clicked/replied/bounced rows but didn't
attach campaign_id. Funnel view filters on h.campaign_id = c.id, so
every per-campaign KPI showed 0% engagement.

This UPDATE joins each orphaned engagement row to its sibling 'sent'
row by message_id and copies campaign_id + org_id. Single transaction.
Idempotent (only updates WHERE campaign_id IS NULL). Recovers years
of historical engagement data immediately."
```

---

## Task 3: Extend `lit_campaign_funnel_v` with `unique_sent`

**Files:**
- Create: `supabase/migrations/20260610180100_lit_campaign_funnel_v_add_unique_sent.sql`

- [ ] **Step 1: Read current view definition**

```sql
SELECT pg_get_viewdef('lit_campaign_funnel_v'::regclass);
```

Confirm current shape: `enrolled` uses `count(DISTINCT metadata->>'recipient_email')` without filter (includes test_sent), `sent` uses `event_type='sent'`.

- [ ] **Step 2: Write the migration**

Create `supabase/migrations/20260610180100_lit_campaign_funnel_v_add_unique_sent.sql`:
```sql
-- 2026-06-10 — Add unique_sent to lit_campaign_funnel_v + exclude test_sent
-- from enrolled count.
--
-- unique_sent = count of DISTINCT recipient emails who received ANY 'sent'
-- event for this campaign. Used as the correct denominator for the
-- frontend's sent bar (currently uses enrolled, producing 200% for
-- multi-step campaigns where N recipients × 2 steps = 2N sent events).
--
-- enrolled also fixed to exclude test_sent — these inflate the count
-- when the user clicks Test send during builder iteration.

BEGIN;

CREATE OR REPLACE VIEW public.lit_campaign_funnel_v AS
SELECT
  c.id AS campaign_id,
  ( SELECT count(DISTINCT h.metadata->>'recipient_email')
      FROM public.lit_outreach_history h
     WHERE h.campaign_id = c.id
       AND h.event_type <> 'test_sent' ) AS enrolled,
  ( SELECT count(*)
      FROM public.lit_outreach_history h
     WHERE h.campaign_id = c.id
       AND h.event_type = 'sent' ) AS sent,
  ( SELECT count(DISTINCT h.metadata->>'recipient_email')
      FROM public.lit_outreach_history h
     WHERE h.campaign_id = c.id
       AND h.event_type = 'sent' ) AS unique_sent,
  ( SELECT count(*)
      FROM public.lit_outreach_history h
     WHERE h.campaign_id = c.id
       AND (h.event_type = 'opened' OR h.opened_at IS NOT NULL) ) AS opened,
  ( SELECT count(*)
      FROM public.lit_outreach_history h
     WHERE h.campaign_id = c.id
       AND (h.event_type = 'clicked' OR h.clicked_at IS NOT NULL) ) AS clicked,
  ( SELECT count(*)
      FROM public.lit_outreach_history h
     WHERE h.campaign_id = c.id
       AND (h.event_type = 'replied' OR h.replied_at IS NOT NULL OR h.status = 'replied') ) AS replied,
  ( SELECT count(*)
      FROM public.lit_outreach_history h
     WHERE h.campaign_id = c.id
       AND (h.event_type = 'bounced' OR h.status = 'bounced') ) AS bounced
FROM public.lit_campaigns c;

COMMIT;
```

- [ ] **Step 3: Apply via Supabase MCP**

Use `mcp__claude_ai_Supabase__apply_migration` with name `20260610180100_lit_campaign_funnel_v_add_unique_sent`.

- [ ] **Step 4: Verify**

```sql
SELECT * FROM public.lit_campaign_funnel_v
 WHERE campaign_id IN ('cdc8aaf6-79ef-4ead-8672-5d7941b31a03',
                       '100b3552-4070-438a-905a-a41973db8f1e');
```

Expected for Boss Man: `enrolled=2, sent=4, unique_sent=2` (matches reality: 2 recipients each got 2 sends). For Test Campaign 1.2: `enrolled=2, sent=4, unique_sent=2`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260610180100_lit_campaign_funnel_v_add_unique_sent.sql
git commit -m "feat(analytics): lit_campaign_funnel_v gets unique_sent + excludes test_sent

unique_sent counts DISTINCT recipient emails per campaign. Used by
FunnelStrip as the correct sent-bar denominator (replacing enrolled,
which produced 200% for multi-step campaigns).

Also: enrolled now excludes test_sent events. Previously a user
clicking Test send during builder iteration inflated the enrolled
count. Now only real campaign sends contribute."
```

---

## Task 4: Extend `lit_campaign_metrics_batch` RPC with `unique_sent`

**Files:**
- Create: `supabase/migrations/20260610180200_lit_campaign_metrics_batch_unique_sent.sql`

- [ ] **Step 1: Read current RPC definition**

```sql
SELECT pg_get_functiondef('lit_campaign_metrics_batch'::regproc);
```

Confirm current return columns.

- [ ] **Step 2: Write the migration**

Create `supabase/migrations/20260610180200_lit_campaign_metrics_batch_unique_sent.sql`:
```sql
-- 2026-06-10 — Surface unique_sent on lit_campaign_metrics_batch RPC.
-- The view 20260610180100 added the column; this RPC exposes it to
-- the frontend.

BEGIN;

CREATE OR REPLACE FUNCTION public.lit_campaign_metrics_batch(p_campaign_ids uuid[])
RETURNS TABLE (
  campaign_id uuid,
  enrolled bigint,
  sent bigint,
  unique_sent bigint,
  opened bigint,
  clicked bigint,
  replied bigint,
  bounced bigint,
  open_rate numeric,
  click_rate numeric,
  reply_rate numeric,
  bounce_rate numeric
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    v.campaign_id,
    v.enrolled,
    v.sent,
    v.unique_sent,
    v.opened,
    v.clicked,
    v.replied,
    v.bounced,
    CASE WHEN v.sent > 0 THEN ROUND(100.0 * v.opened / v.sent, 1) ELSE 0 END AS open_rate,
    CASE WHEN v.sent > 0 THEN ROUND(100.0 * v.clicked / v.sent, 1) ELSE 0 END AS click_rate,
    CASE WHEN v.sent > 0 THEN ROUND(100.0 * v.replied / v.sent, 1) ELSE 0 END AS reply_rate,
    CASE WHEN v.sent > 0 THEN ROUND(100.0 * v.bounced / v.sent, 1) ELSE 0 END AS bounce_rate
    FROM public.lit_campaign_funnel_v v
   WHERE v.campaign_id = ANY(p_campaign_ids);
$function$;

GRANT EXECUTE ON FUNCTION public.lit_campaign_metrics_batch(uuid[]) TO authenticated;

COMMIT;
```

- [ ] **Step 3: Apply via Supabase MCP**

Use `mcp__claude_ai_Supabase__apply_migration` with name `20260610180200_lit_campaign_metrics_batch_unique_sent`.

- [ ] **Step 4: Verify**

```sql
SELECT * FROM public.lit_campaign_metrics_batch(
  ARRAY['cdc8aaf6-79ef-4ead-8672-5d7941b31a03'::uuid,
        '100b3552-4070-438a-905a-a41973db8f1e'::uuid]
);
```

Expected: 2 rows, each with `unique_sent` populated + all rate columns 0-100.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260610180200_lit_campaign_metrics_batch_unique_sent.sql
git commit -m "feat(analytics): lit_campaign_metrics_batch surfaces unique_sent

Adds unique_sent to the RPC return type so the frontend FunnelStrip
can use it as the sent-bar denominator. Rate columns unchanged."
```

---

## Task 5: Frontend — thread `uniqueSent` through types + client

**Files:**
- Modify: `frontend/src/features/outbound/types.ts`
- Modify: `frontend/src/features/outbound/api/campaignMetrics.ts`

- [ ] **Step 1: Extend `CampaignFunnel` interface**

Edit `frontend/src/features/outbound/types.ts`. Find the `CampaignFunnel` interface. Add `uniqueSent: number`:
```ts
export interface CampaignFunnel {
  enrolled: number;
  sent: number;
  uniqueSent: number; // NEW — used as denominator for the sent bar
  opened: number;
  clicked: number;
  replied: number;
  bounced: number;
  openRate: number;
  clickRate: number;
  replyRate: number;
  bounceRate: number;
}
```

- [ ] **Step 2: Plumb through `campaignMetrics.ts`**

Edit `frontend/src/features/outbound/api/campaignMetrics.ts`. Find where the RPC response is mapped to `CampaignFunnel`. Add `uniqueSent: row.unique_sent ?? 0` to the mapping object. Example:
```ts
return {
  enrolled: Number(row.enrolled ?? 0),
  sent: Number(row.sent ?? 0),
  uniqueSent: Number(row.unique_sent ?? 0), // NEW
  opened: Number(row.opened ?? 0),
  clicked: Number(row.clicked ?? 0),
  replied: Number(row.replied ?? 0),
  bounced: Number(row.bounced ?? 0),
  openRate: Number(row.open_rate ?? 0),
  clickRate: Number(row.click_rate ?? 0),
  replyRate: Number(row.reply_rate ?? 0),
  bounceRate: Number(row.bounce_rate ?? 0),
};
```

- [ ] **Step 3: TypeScript check**

```bash
cd frontend && npx tsc --noEmit 2>&1 | grep -E "CampaignFunnel|campaignMetrics|types\.ts" | head -10
```

Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/features/outbound/types.ts frontend/src/features/outbound/api/campaignMetrics.ts
git commit -m "feat(analytics): plumb unique_sent through CampaignFunnel + metrics client

Mirrors the unique_sent column added to lit_campaign_metrics_batch.
Consumed in the next commit by FunnelStrip as the sent-bar denominator."
```

---

## Task 6: `FunnelStrip` uses RPC-computed rates + `uniqueSent` denominator

**Files:**
- Modify: `frontend/src/features/outbound/components/FunnelStrip.tsx`

- [ ] **Step 1: Locate the current denominator code**

```bash
grep -nE "const total|funnel.enrolled|pct.*=|value / total" frontend/src/features/outbound/components/FunnelStrip.tsx | head -10
```

Expected: line 30 area has `const total = funnel.enrolled || 1` and `const pct = (value / total) * 100`.

- [ ] **Step 2: Refactor to use RPC rates**

Edit the component. Replace the inline pct computation for opened/clicked/replied/bounced bars with the RPC values (they're already 0-100 numbers). For the sent bar, use `funnel.uniqueSent / funnel.enrolled` (caps at 100% naturally).

Pattern (locate the bar rendering loop and adapt to the actual code):
```tsx
const sentEnrolledDenominator = funnel.enrolled || 1;
const sentPct = Math.min(100, (funnel.uniqueSent / sentEnrolledDenominator) * 100);
const openedPct = funnel.openRate;     // already 0-100 from RPC
const clickedPct = funnel.clickRate;
const repliedPct = funnel.replyRate;
const bouncedPct = funnel.bounceRate;
```

Render each bar with its corresponding pct. The raw event counts (`funnel.opened`, `funnel.clicked`, etc.) still display as the numeric labels next to each bar — only the percentage fill changes.

- [ ] **Step 3: TypeScript + tests check**

```bash
cd frontend && npx tsc --noEmit 2>&1 | grep -E "FunnelStrip" | head -5
cd frontend && npx vitest run src/features/outbound/components/__tests__/FunnelStrip 2>&1 | tail -10
```

If existing tests break (because they mock funnel without `uniqueSent`/`openRate`), update the mocks to include the new fields.

- [ ] **Step 4: Manual smoke**

Open `/app/campaigns` in the running dev server. Expected:
- Boss Man's sent bar caps at 100% (was 200%)
- Test Campaign 1.2 shows real opened/clicked/replied rates if engagement exists

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/outbound/components/FunnelStrip.tsx
git commit -m "fix(campaigns): FunnelStrip uses RPC rates + uniqueSent denominator

Two bugs in one fix:
1. opened/clicked/replied/bounced bars now read the RPC's pre-computed
   open_rate/click_rate/reply_rate/bounce_rate columns instead of
   recomputing value/enrolled*100. RPC divides by sent (correct),
   frontend was dividing by enrolled (wrong).
2. Sent bar now uses unique_sent/enrolled instead of sent/enrolled.
   For multi-step campaigns, sent_event_count = recipients × steps,
   which made the sent bar overshoot to 200% on Boss Man (2 recipients
   × 2 steps = 4 sent events / 2 enrolled = 200%). unique_sent counts
   distinct recipients who received any send, so the bar caps at 100%."
```

---

## Task 7: Acceptance verification

**Files:** none — pure verification.

- [ ] **Step 1: System-wide engagement attribution**

```sql
-- Engagement orphan rate should be near-zero
SELECT
  count(*) FILTER (WHERE campaign_id IS NULL) AS orphaned,
  count(*) AS total,
  ROUND(100.0 * count(*) FILTER (WHERE campaign_id IS NULL) / GREATEST(count(*), 1), 1) AS pct_orphaned
  FROM public.lit_outreach_history
 WHERE event_type IN ('opened','clicked','replied','bounced');
```

Expected: pct_orphaned < 5% (some rows may have no message_id metadata and remain orphaned — acceptable for legacy data).

- [ ] **Step 2: Click pipeline working**

```sql
-- Latest click events
SELECT campaign_id IS NOT NULL AS has_campaign,
       count(*) AS count,
       max(created_at) AT TIME ZONE 'UTC' AS most_recent
  FROM public.lit_outreach_history
 WHERE event_type = 'clicked'
   AND created_at > now() - interval '1 hour'
 GROUP BY campaign_id IS NOT NULL;
```

After triggering a fresh click in the running app: expected at least 1 row with `has_campaign = true`.

- [ ] **Step 3: KPIs render correctly**

In the running app (production or local dev):
- Open `/app/campaigns` — every visible campaign's sent bar ≤ 100%
- Open Test Campaign 1.2's builder — KPI hero shows real Open Rate / Click Rate values

- [ ] **Step 4: Commit acceptance marker**

```bash
git commit --allow-empty -m "chore(campaigns): Sub-project I tracking pipeline restoration verified

Click pipeline: redirect-click no longer hits FK violation; new clicks
land in lit_outreach_history with campaign_id populated.

Backfill: orphaned engagement rows now attributed via message_id join.
KPIs across all existing campaigns reflect real engagement data.

Denominator: FunnelStrip uses unique_sent for sent bar (caps at 100%)
and RPC-computed rates for opened/clicked/replied/bounced bars.

Ready for Sub-project K (timeline drawer) next."
```

---

## Task 8: Push + merge to main

- [ ] **Step 1: Push feature branch**

```bash
git push origin claude/review-dashboard-deploy-3AmMD 2>&1 | tail -3
```

- [ ] **Step 2: Merge to main**

```bash
git checkout main
git pull origin main --ff-only
git merge claude/review-dashboard-deploy-3AmMD --no-ff -m "Merge claude/review-dashboard-deploy-3AmMD — Sub-project I tracking pipeline restoration

Three coordinated fixes:
1. redirect-click FK violation closed (was rejecting every click insert)
2. Orphaned engagement rows backfilled via message_id join
3. FunnelStrip uses RPC rates + unique_sent denominator (fixes 200% sent)

System-wide KPIs now reflect real engagement data."
git push origin main 2>&1 | tail -3
git checkout claude/review-dashboard-deploy-3AmMD
```

- [ ] **Step 3: Confirm Vercel auto-deploy fires**

Use `mcp__claude_ai_Vercel__list_deployments` and confirm a new `target=production` deploy is BUILDING for the merge SHA.

---

## Self-Review

**Spec coverage:**

| Spec section | Covered by |
|---|---|
| Backend fix (`redirect-click`) | Task 1 |
| Backfill (recover historical data) | Task 2 |
| View extension (`unique_sent` + exclude test_sent) | Task 3 |
| RPC extension | Task 4 |
| Frontend types + client | Task 5 |
| FunnelStrip denominator fix | Task 6 |
| Acceptance criteria | Task 7 |

No gaps.

**Placeholder scan:** Scanned for "TODO" / "TBD" / "Add appropriate". One reference to "actual code" in Task 6 step 2 — intentional, since the engineer needs to adapt to the exact JSX structure when editing (the pattern is concrete, the line-by-line spot may have drifted).

**Type consistency:**
- `CampaignFunnel` interface adds `uniqueSent: number` (Task 5) consumed by FunnelStrip (Task 6)
- RPC's `unique_sent` (Task 4) mapped to `uniqueSent` in client (Task 5)
- View's `unique_sent` column (Task 3) populates the RPC's column (Task 4)

No drift.

---

## Out of scope (other sub-projects in Round 3)

- Cal.com booking attendee matching improvements — Sub-project L
- Activity timeline → slide-over drawer — Sub-project K
- Scheduled-start persistence + delay_minutes migration — Sub-project J
