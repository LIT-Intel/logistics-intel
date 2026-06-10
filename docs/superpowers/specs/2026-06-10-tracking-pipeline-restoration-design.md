# Tracking Pipeline Restoration — Design Spec

**Date:** 2026-06-10
**Sub-project:** I (Round 3 — campaign foundation)
**Status:** Design approved by user 2026-06-10
**Lands first because:** Every campaign in the system shows 0% open/click/reply rates. Click tracking has been entirely broken (FK constraint violation rejects every insert silently). This is the highest-impact P0 in the Round 3 punch list.

---

## Problem

Investigation (agents `aa8ea9ff7910b997a` + `ad7ebd03577f678c6`) confirmed three coordinated bugs:

### 1. `redirect-click` FK constraint violation (root cause of all click tracking)

`supabase/functions/redirect-click/index.ts` looks up `lit_campaign_contacts.id = link.recipient_id`, retrieves the row, then inserts into `lit_outreach_history` with `contact_id = lit_campaign_contacts.id`. But `lit_outreach_history.contact_id` FK targets a different table (`lit_contacts.id`, not `lit_campaign_contacts.id`). Postgres rejects every insert.

Smoking gun from Supabase postgres logs at the user's documented Test Campaign 1.2 click timestamps:
```
ERROR: insert or update on table "lit_outreach_history" violates foreign key constraint "lit_outreach_history_contact_id_fkey"
```

`lit_outreach_links` correctly captures click_count (`HNJWSVEFCQMH` slug → 1, `ATHSE93J7HTV` slug → 3 for the user's test campaign clicks), but no corresponding `clicked` row ever lands in `lit_outreach_history`. The redirect-click edge fn returns 302 to the user (so the user sees their browser navigate correctly), but the audit row fails silently.

### 2. Orphaned engagement events (`campaign_id = NULL`)

Across the entire `lit_outreach_history` table, every row with `event_type IN ('opened', 'clicked', 'replied')` OR with a non-null `opened_at`/`clicked_at`/`replied_at` column has `campaign_id = NULL`. The engagement-tracking writers (resend-webhook, reply-receiver, the open-pixel tracker) write events but don't backfill `campaign_id` from the originating `sent` row.

Funnel view (`lit_campaign_funnel_v`) filters on `h.campaign_id = c.id` — orphaned events are invisible to per-campaign KPIs. Result: every campaign's opened/clicked/replied KPI shows 0% even when engagement data exists.

### 3. `FunnelStrip` denominator bug (200% sent rate)

`frontend/src/features/outbound/components/FunnelStrip.tsx:30`:
```ts
const total = funnel.enrolled || 1;
const pct = (value / total) * 100;
```

For a 2-recipient campaign with 2 sent steps, `sent_count = 4`, `enrolled = 2`, so `pct = 4 / 2 * 100 = 200%`. Boss Man on the user's `/app/campaigns` page shows 200% sent.

The RPC `lit_campaign_metrics_batch` already returns correctly-computed `open_rate`/`click_rate`/`reply_rate` columns (divided by `sent`, not `enrolled`). The frontend ignores them.

---

## Architecture

### Backend fix — `redirect-click` (drop `contact_id` from insert)

Edit `supabase/functions/redirect-click/index.ts` to drop `contact_id` from the `lit_outreach_history` insert. `metadata.recipient_id` already provides per-recipient drill-in attribution; `contact_id` was a convenience that wasn't actually used by any consumer of the engagement RPC. Add `.throwOnError()` to make any future FK violation surface in edge fn logs immediately instead of silently failing.

### Backfill — recover historical engagement data

One-shot SQL UPDATE attaches `campaign_id` + `org_id` to existing orphaned engagement rows by joining `lit_outreach_history e` against itself on `message_id` against the originating `sent` row.

```sql
UPDATE public.lit_outreach_history e
   SET campaign_id = s.campaign_id,
       org_id = COALESCE(e.org_id, s.org_id)
  FROM public.lit_outreach_history s
 WHERE e.campaign_id IS NULL
   AND e.event_type IN ('opened', 'clicked', 'replied', 'bounced')
   AND s.event_type = 'sent'
   AND s.metadata->>'message_id' = e.metadata->>'message_id'
   AND s.message_id IS NOT NULL;
```

Single transaction; small data volume (engagement rows are in the thousands, not millions).

### View — extend `lit_campaign_funnel_v` with `unique_sent`

Add a column representing the count of DISTINCT recipient emails that received any send event for this campaign. Used as the correct denominator for the sent-bar (instead of `enrolled`):

```sql
( SELECT count(DISTINCT h.metadata->>'recipient_email')
    FROM public.lit_outreach_history h
   WHERE h.campaign_id = c.id
     AND h.event_type = 'sent' ) AS unique_sent
```

Also exclude `test_sent` events from all counts (these inflate `enrolled` and `sent` when the user clicks Test send during builder iteration). The current view counts them in `enrolled` (via `count(DISTINCT recipient_email)` without a filter) but excludes them from `sent` (via `event_type = 'sent'` strict match). Make both consistent — exclude `test_sent` from enrolled too.

### RPC — surface `unique_sent`

Extend `lit_campaign_metrics_batch` return type to include `unique_sent`. Frontend reads it as the denominator for the sent bar.

### Frontend — `FunnelStrip` uses RPC-computed rates

Two changes to `FunnelStrip.tsx`:
1. Use the RPC's `open_rate`/`click_rate`/`reply_rate`/`bounce_rate` columns directly instead of recomputing `value / enrolled` for those bars.
2. For the sent bar specifically, use `unique_sent / enrolled` (caps at 100%) instead of `sent_event_count / enrolled` (which produced the 200% bug).

Plumb `unique_sent`, `openRate`, `clickRate`, `replyRate`, `bounceRate` through `campaignMetrics.ts` typed client → `CampaignFunnel` interface → `FunnelStrip` consumer.

---

## Components (files to touch)

| File | Action |
|---|---|
| `supabase/functions/redirect-click/index.ts` | MODIFY — drop `contact_id` from insert; add `.throwOnError()` |
| `supabase/migrations/20260610180000_backfill_engagement_campaign_id.sql` | NEW — one-shot UPDATE |
| `supabase/migrations/20260610180100_lit_campaign_funnel_v_add_unique_sent.sql` | NEW — extend view with `unique_sent` + exclude `test_sent` from enrolled |
| `supabase/migrations/20260610180200_lit_campaign_metrics_batch_unique_sent.sql` | NEW — RPC returns `unique_sent` |
| `frontend/src/features/outbound/types.ts` | MODIFY — `CampaignFunnel` gains `uniqueSent: number` |
| `frontend/src/features/outbound/api/campaignMetrics.ts` | MODIFY — plumb `unique_sent` from RPC response |
| `frontend/src/features/outbound/components/FunnelStrip.tsx` | MODIFY — use RPC-computed rates; use `uniqueSent` for sent-bar denominator |

7 files. Single PR.

---

## Data flow (post-fix)

**Click ingress:**
1. Recipient clicks tracked link
2. `redirect-click` looks up `lit_outreach_links` row → gets `campaign_id` + `recipient_id`
3. Inserts `lit_outreach_history` with `campaign_id` populated, `contact_id` NULL, `metadata.recipient_id` populated
4. Returns 302 to original URL

**KPI read:**
1. `useCampaigns()` calls `fetchCampaignMetricsBatch([campaignId])`
2. RPC `lit_campaign_metrics_batch` returns `{ enrolled, sent, unique_sent, opened, clicked, replied, bounced, open_rate, click_rate, reply_rate, bounce_rate }`
3. `campaignMetrics.ts` maps to `CampaignFunnel` with `uniqueSent` + the four rates
4. `FunnelStrip` renders:
   - Enrolled tile: `enrolled` as integer
   - Sent bar: `unique_sent / enrolled` percentage (caps at 100%)
   - Opened bar: `open_rate` (already a 0-100 number from RPC)
   - Clicked bar: `click_rate`
   - Replied bar: `reply_rate`
   - Bounced bar: `bounce_rate`

---

## Error handling + edge cases

| Case | Behavior |
|---|---|
| Recipient row in `lit_campaign_contacts` deleted between click and log | Click still logs with `metadata.recipient_id` set, just no contact lookup. Per-recipient drill-in still works via metadata lookup. |
| Multiple `sent` events for same recipient on the same campaign (relaunch) | Backfill joins on `message_id` — each engagement row attaches to its matching send. No duplicate attribution. |
| Engagement row with no `message_id` in metadata | Backfill leaves it orphaned (still NULL `campaign_id`). Logged for manual review via post-migration audit query. Estimated rare per current data sample. |
| Click on a Cal.com link by an email that doesn't match any send recipient | `clicked` event logs with `campaign_id` populated (from `lit_outreach_links` row), but per-recipient drill-in can't resolve the recipient. Sub-project L improves attendee matching for the booking-side analog. |
| 200%+ rates cached client-side by TanStack Query | 30-second staleTime — refresh on next mount. No cache invalidation needed. |
| Concurrent dispatcher tick during backfill | The UPDATE acquires a row-level lock; new inserts use the new code path with `campaign_id` set at write time. No conflict. |

---

## Testing

| Test | Method |
|---|---|
| Edge fn no longer hits FK constraint | After deploy: trigger a click on a tracked link from a test campaign; verify `lit_outreach_history` row lands with `event_type='clicked'`, `campaign_id` populated |
| Backfill recovers Test Campaign 1.2 engagement | Post-migration: `SELECT count(*) FROM lit_outreach_history WHERE campaign_id = 'cdc8aaf6-79ef-4ead-8672-5d7941b31a03' AND event_type IN ('clicked','opened','replied')` should be > 0 |
| Boss Man no longer shows 200% sent | Open `/app/campaigns` — Boss Man's sent bar shows ≤100% |
| Test Campaign 1.2 shows real engagement on `/app/campaigns` list | After backfill: open/click/reply rates non-zero |
| RPC returns `unique_sent` column | Direct SQL: `SELECT * FROM lit_campaign_metrics_batch(ARRAY['cdc8aaf6-79ef-4ead-8672-5d7941b31a03']::uuid[])` includes `unique_sent` |
| `FunnelStrip` renders without recomputing | Component test: pass mock funnel with `openRate=42, clicked=99, enrolled=1` — opened bar shows 42%, NOT 9900% |
| Post-fix smoke: send + click a Test Campaign email | Within 30s, KPI hero shows clicked count = 1 |

---

## Out of scope (other sub-projects in Round 3)

- Cal.com booking attendee matching improvements — **Sub-project L**
- Activity timeline → slide-over drawer — **Sub-project K**
- Scheduled-start persistence + delay_minutes migration — **Sub-project J**
- Per-recipient engagement drill-in updates — already shipped, no change needed
- Dashboard-level analytics across campaigns — separate workstream

---

## Three design decisions (locked at brainstorm time)

1. **`contact_id` strategy**: DROP from insert (don't try to resolve to `lit_contacts.id`). Recipient drill-in already works via `metadata.recipient_id`. Resolving would require a `lit_campaign_contacts.contact_id` column join that adds latency to a hot path for no consumer benefit.

2. **Backfill scope**: ALL historical orphaned engagement rows. Small data volume; no perf concern. Recovers maximum historical data.

3. **`unique_sent` migration shape**: ADDITIVE to existing `lit_campaign_funnel_v` (extend, don't replace). No breaking change for any current consumer; new column flows through RPC + types + frontend.

---

## Acceptance criteria

A reasonable engineer reviewing this spec should be able to answer YES to all of these after implementation:

1. ✅ A fresh click on a tracked link writes a row to `lit_outreach_history` with `campaign_id` and `event_type='clicked'` populated.
2. ✅ The Postgres logs show ZERO `lit_outreach_history_contact_id_fkey` errors for new click inserts.
3. ✅ For every existing campaign in the system, `lit_outreach_history` engagement rows are attributed via `campaign_id` (the orphan count for engagement events drops to near-zero after backfill).
4. ✅ The `/app/campaigns` list page shows real (non-zero, non-200%) opened/clicked/replied rates for campaigns that have actual engagement.
5. ✅ The CampaignBuilder KPI hero ticks the Sent / Open Rate / Click Rate / Reply Rate / Bounce Rate tiles to non-zero values for Test Campaign 1.2.
6. ✅ Boss Man's sent bar caps at 100% (the 200% bug is fixed).
7. ✅ `test_sent` events are no longer counted in the funnel `enrolled` or `sent` columns (only real campaign sends contribute to KPIs).
