# Sub-project J — Sequence Schedule Persistence

**Date:** 2026-06-10
**Branch lock:** `claude/review-dashboard-deploy-3AmMD`
**Scope:** Persist campaign launch time so the schedule no longer resets to "now" on re-login. Hybrid model: absolute campaign launch + relative per-step delays.

## Problem

User report (verbatim, 2026-06-10):
> "after i sign out and sign back in at a different time, the campaign sequences date and time updates to the current time and it does not stay as per the original time that it was originaly created."

Root cause in [ScheduleStrip.tsx:73](../../frontend/src/features/outbound/components/ScheduleStrip.tsx#L73):
```ts
let cursor = Date.now();
```

The schedule is projected from `Date.now()` every render. There is no persisted launch time anywhere in the system. Worse, the campaign builder has no datetime picker at all: `handleLaunch` ([CampaignBuilder.jsx:862](../../frontend/src/pages/CampaignBuilder.jsx#L862)) fires `launchCampaign(editId, validManual)` immediately, never reading a "scheduled for" value.

Verified against `lit_campaigns`: no `scheduled_start_at`, no `send_timezone`. Verified against `lit_campaign_contacts`: `next_send_at` already exists (good — half the materialization layer is already there). Verified against `lit_campaign_steps`: `delay_days` + `delay_hours` + `delay_minutes` already exist (good — relative-offset infrastructure is already there).

## Decision

Following user picks (C, _, A):

1. **Hybrid timing model.** `lit_campaigns.scheduled_start_at` is the absolute anchor; existing `lit_campaign_steps.delay_*` columns remain the relative offsets. Step N's send time = scheduled_start_at + Σ delay_* through step N.

2. **Materialize per recipient.** `lit_campaign_contacts.next_send_at` is computed at enrollment from `scheduled_start_at + step delays`. The dispatcher tick continues to read `next_send_at` (no change to dispatcher logic — it already does the right thing).

3. **Edits apply only forward.** When `scheduled_start_at` changes on a launched campaign, only recipients with `status IN ('queued','pending')` AND `next_step_order` pointing at a not-yet-sent step get their `next_send_at` recomputed. In-flight recipients past that step are untouched.

### Out of scope (separate ticket — Sub-project J.2)

- Step-level `time_of_day_local` (e.g. "Day 2, 9am sender-local"). Today, "Day 2" means launch + 2×86400000ms, which inherits launch's exact time-of-day. That's acceptable for the first cut.
- Weekday-skip / business-hours-only.
- Per-recipient timezone shifting (today: sender timezone applies to all).

These can land as a follow-up once the core persistence works. Punching them now would triple the scope.

## Architecture

### Database (1 migration)

```sql
ALTER TABLE lit_campaigns
  ADD COLUMN scheduled_start_at timestamptz,
  ADD COLUMN send_timezone text NOT NULL DEFAULT 'UTC';
COMMENT ON COLUMN lit_campaigns.scheduled_start_at IS
  'Absolute launch anchor. Step N''s send time = scheduled_start_at + Σ delay_* through N. NULL means "launch immediately on click" (legacy fallback).';
COMMENT ON COLUMN lit_campaigns.send_timezone IS
  'IANA TZ for displaying scheduled_start_at. Persistence is always UTC; this is a display hint only.';
```

No backfill needed: existing campaigns with `scheduled_start_at IS NULL` continue to launch immediately (unchanged behavior).

### Edge function changes (1 modification)

`queue-campaign-recipients/index.ts` — when computing `next_send_at` for the FIRST step of a newly enrolled recipient, anchor to `scheduled_start_at` instead of `now()`:

```ts
const anchor = campaign.scheduled_start_at
  ? new Date(campaign.scheduled_start_at)
  : new Date();
const firstSendAt = new Date(anchor.getTime() + firstStepDelayMs);
// existing INSERT INTO lit_campaign_contacts ... next_send_at: firstSendAt.toISOString()
```

Critically: if `scheduled_start_at` is in the future, the dispatcher's existing `WHERE next_send_at <= now()` filter handles the wait automatically. No new scheduling logic.

### Edit-after-launch handling (1 RPC + 1 trigger)

When a user updates `lit_campaigns.scheduled_start_at` post-launch, propagate to recipients who haven't sent yet:

```sql
CREATE OR REPLACE FUNCTION lit_recompute_pending_send_times()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.scheduled_start_at IS DISTINCT FROM OLD.scheduled_start_at THEN
    UPDATE lit_campaign_contacts cc
    SET next_send_at = NEW.scheduled_start_at
                       + COALESCE(s.delay_days, 0)  * interval '1 day'
                       + COALESCE(s.delay_hours, 0) * interval '1 hour'
                       + COALESCE(s.delay_minutes, 0) * interval '1 minute'
    FROM lit_campaign_steps s
    WHERE cc.campaign_id = NEW.id
      AND cc.status IN ('queued','pending')
      AND cc.current_step_id = s.id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER lit_campaigns_recompute_pending
  AFTER UPDATE ON lit_campaigns
  FOR EACH ROW EXECUTE FUNCTION lit_recompute_pending_send_times();
```

This implements Q3=A exactly: only recipients whose `current_step_id` still points at a not-yet-sent step get touched. Anyone past their queued step keeps their existing `next_send_at`.

### Frontend (3 file modifications)

1. **New: `frontend/src/features/outbound/components/LaunchSchedulePicker.tsx`** — `<input type="datetime-local">` + TZ select (default to browser TZ via `Intl.DateTimeFormat().resolvedOptions().timeZone`). Min value = `now()` for new campaigns, `scheduled_start_at` for edits. Renders inline next to the Launch button.

2. **`ScheduleStrip.tsx:73`** — replace `Date.now()` with `props.anchor ?? Date.now()`. Add `anchor?: number` prop. Caller passes `details?.scheduled_start_at ? Date.parse(details.scheduled_start_at) : undefined`.

3. **`CampaignBuilder.jsx`** — (a) add `scheduledStartAt` state synced from `details.scheduled_start_at`. (b) mount `LaunchSchedulePicker` in the header cluster (left of Launch button). (c) pass `anchor` prop to `ScheduleStrip`. (d) thread `scheduled_start_at + send_timezone` through `handleSave` → `saveCampaign(...)` payload. (e) `launchCampaign` and `queue-campaign-recipients` already inherit from the persisted column — no payload change needed on launch.

### API surface (1 modification)

`frontend/src/lib/api.ts` `saveCampaign(...)` payload — add `scheduled_start_at` and `send_timezone` fields. Backend update via existing `lit_campaigns` row update.

## Data flow

```
User picks "Jun 15 9:00 AM" + TZ "America/New_York" in builder
  ↓
saveCampaign({ ..., scheduled_start_at: "2026-06-15T13:00:00Z", send_timezone: "America/New_York" })
  ↓
lit_campaigns.scheduled_start_at = "2026-06-15T13:00:00Z" persisted

User clicks Launch
  ↓
queue-campaign-recipients enrolls 50 recipients
  ↓
For each recipient: next_send_at = scheduled_start_at + step[0].delay_*
  ↓
Dispatcher tick (every minute): WHERE next_send_at <= now()
  → If scheduled_start_at is in future → no rows match → wait
  → If scheduled_start_at has passed → rows match → send

User edits scheduled_start_at to "Jun 16 9:00 AM" post-launch
  ↓
TRIGGER fires: UPDATE recipients SET next_send_at = ... WHERE status IN ('queued','pending')
  ↓
Recipients past their step keep prior next_send_at; queued recipients shift to new anchor
```

## Error handling + edge cases

| Case | Behavior |
|---|---|
| `scheduled_start_at` is in the past at launch | Dispatcher picks them up on next tick — sends immediately. Matches "Launch now" mental model. |
| `scheduled_start_at IS NULL` at launch (legacy campaigns) | queue-campaign-recipients uses `now()` — preserves current behavior. |
| User edits `scheduled_start_at` before launch (draft) | No trigger fires (no recipients enrolled yet). Just persisted. |
| User edits `scheduled_start_at` to "5 minutes ago" on a paused campaign | Trigger fires; queued recipients shift to now-5min. Dispatcher picks them up immediately. Acceptable — matches "I want this to fire now" intent. |
| Concurrent edits (user A edits while user B launches) | Postgres serializes UPDATE on lit_campaigns. Trigger fires after the winning update. No data race. |
| TZ misconfigured ("foo/bar") | `send_timezone` is display-only — persistence in UTC ignores it. Frontend gracefully falls back to browser TZ if Intl can't parse. |
| Recipient at `next_step_order > steps.count` (sequence complete) | Trigger UPDATE join on `current_step_id` returns no row — recipient untouched. |

## Testing

| Test | Method |
|---|---|
| Save campaign with future scheduled_start_at, reload page | scheduled_start_at persisted in `lit_campaigns`; UI shows the original time, not current time |
| Launch with future scheduled_start_at | All recipients' `next_send_at` = scheduled_start_at + step[0].delay_*; dispatcher does not send until then |
| Edit scheduled_start_at post-launch on queued campaign | Recipients with status='queued' get new `next_send_at`; sent recipients untouched |
| Launch with NULL scheduled_start_at | queue-campaign-recipients uses `now()` (legacy fallback works) |
| ScheduleStrip shows persisted time, not Date.now() | RTL: render builder with `details.scheduled_start_at` set; assert visible cells reference the persisted anchor |
| TZ select defaults to browser TZ | RTL: render LaunchSchedulePicker; assert default select value matches `Intl.DateTimeFormat().resolvedOptions().timeZone` |

## Acceptance

- [ ] User sets a future launch time, saves, signs out, signs back in → time is preserved
- [ ] User launches a future-scheduled campaign → recipients enrolled with future `next_send_at`; no sends fire until that time
- [ ] User edits launch time on a launched campaign → only queued recipients shift; sent recipients untouched
- [ ] Vercel production deploy READY on main
- [ ] No regression: campaigns with NULL scheduled_start_at launch immediately as before

## Files touched (final list)

| File | Action |
|---|---|
| `supabase/migrations/2026-06-10_*_add_scheduled_start_at.sql` | CREATE — column + trigger |
| `supabase/functions/queue-campaign-recipients/index.ts` | MODIFY — anchor to scheduled_start_at |
| `frontend/src/features/outbound/components/LaunchSchedulePicker.tsx` | CREATE — datetime + TZ picker |
| `frontend/src/features/outbound/components/ScheduleStrip.tsx` | MODIFY — accept `anchor` prop |
| `frontend/src/pages/CampaignBuilder.jsx` | MODIFY — wire state + mount picker + pass anchor + save payload |
| `frontend/src/lib/api.ts` | MODIFY — `saveCampaign` payload includes scheduled_start_at + send_timezone |

6 files. One DB migration. One edge fn redeploy.
