# Sub-project J — Sequence Schedule Persistence Implementation Plan

> **For agentic workers:** Execute task-by-task on branch `claude/review-dashboard-deploy-3AmMD`. Each task ends with a commit. Spec: `docs/superpowers/specs/2026-06-10-sequence-schedule-persistence-design.md`.

**Goal:** Persist the campaign launch time so the schedule no longer resets to "now" on re-login. Hybrid design — absolute `lit_campaigns.scheduled_start_at` anchor + existing relative `lit_campaign_steps.delay_*` offsets. Edits to launch time after launch propagate only to recipients still queued (Q3=A).

**Architecture:** 1 migration (+1 trigger), 1 edge fn modification, 3 frontend files modified, 1 new picker component. 6 files total.

**Supabase project:** `jkmrfiaefxwgbvftohrb`

---

## Task 1: Migration — add scheduled_start_at + send_timezone + recompute trigger

**Files:**
- Create: `supabase/migrations/20260610200000_add_campaign_scheduled_start_at.sql`

### Step 1: Write the migration

```sql
-- Sub-project J: persist campaign launch time
-- (1) Two columns on lit_campaigns
ALTER TABLE lit_campaigns
  ADD COLUMN IF NOT EXISTS scheduled_start_at timestamptz,
  ADD COLUMN IF NOT EXISTS send_timezone text NOT NULL DEFAULT 'UTC';

COMMENT ON COLUMN lit_campaigns.scheduled_start_at IS
  'Absolute launch anchor. Step N send time = scheduled_start_at + cumulative step delays. NULL = launch immediately on click (legacy fallback).';
COMMENT ON COLUMN lit_campaigns.send_timezone IS
  'IANA TZ for display only. Persistence is always UTC.';

-- (2) Trigger: when scheduled_start_at changes, recompute next_send_at
--     for queued/pending recipients only (Q3=A — sent rows untouched).
CREATE OR REPLACE FUNCTION lit_recompute_pending_send_times()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.scheduled_start_at IS DISTINCT FROM OLD.scheduled_start_at THEN
    UPDATE lit_campaign_contacts cc
    SET next_send_at = NEW.scheduled_start_at
                       + COALESCE(s.delay_days, 0)    * interval '1 day'
                       + COALESCE(s.delay_hours, 0)   * interval '1 hour'
                       + COALESCE(s.delay_minutes, 0) * interval '1 minute',
        updated_at = now()
    FROM lit_campaign_steps s
    WHERE cc.campaign_id = NEW.id
      AND cc.status IN ('queued', 'pending')
      AND cc.current_step_id = s.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS lit_campaigns_recompute_pending ON lit_campaigns;
CREATE TRIGGER lit_campaigns_recompute_pending
  AFTER UPDATE ON lit_campaigns
  FOR EACH ROW
  EXECUTE FUNCTION lit_recompute_pending_send_times();
```

### Step 2: Apply via Supabase MCP

```
mcp__claude_ai_Supabase__apply_migration(
  project_id="jkmrfiaefxwgbvftohrb",
  name="add_campaign_scheduled_start_at",
  query="<the SQL above>"
)
```

### Step 3: Verify

Run:
```sql
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name='lit_campaigns'
  AND column_name IN ('scheduled_start_at','send_timezone');
```
Expected: 2 rows. `scheduled_start_at` nullable; `send_timezone` defaults to `'UTC'`.

```sql
SELECT proname FROM pg_proc WHERE proname='lit_recompute_pending_send_times';
SELECT tgname FROM pg_trigger WHERE tgname='lit_campaigns_recompute_pending';
```
Expected: both return 1 row.

### Step 4: Commit

```
git add supabase/migrations/20260610200000_add_campaign_scheduled_start_at.sql
git commit -m "feat(campaigns): add scheduled_start_at to lit_campaigns + recompute trigger

Sub-project J — persists campaign launch time so the schedule no
longer resets to 'now' on re-login. Hybrid model: scheduled_start_at
is the absolute anchor; existing lit_campaign_steps.delay_* are the
relative offsets. send_timezone is display-only (UTC persisted).

Trigger lit_campaigns_recompute_pending fires on UPDATE: when
scheduled_start_at changes, recipients with status IN (queued,pending)
get next_send_at recomputed; sent recipients untouched (Q3=A)."
```

---

## Task 2: Edge fn queue-campaign-recipients — anchor to scheduled_start_at

**Files:**
- Modify: `supabase/functions/queue-campaign-recipients/index.ts`

### Step 1: Identify the next_send_at computation

Use Grep on the file for `next_send_at`. The first-step compute should be near the recipient INSERT.

### Step 2: Update the computation

Replace whatever currently anchors first-step `next_send_at` to `now()` with:

```ts
// Sub-project J: anchor first send to campaign.scheduled_start_at when set,
// else fall back to now() (legacy behavior for campaigns predating this column).
const campaignRow = /* existing campaign fetch */;
const anchor = campaignRow.scheduled_start_at
  ? new Date(campaignRow.scheduled_start_at)
  : new Date();
const firstStepDelayMs =
  (firstStep.delay_days   ?? 0) * 86_400_000 +
  (firstStep.delay_hours  ?? 0) *  3_600_000 +
  (firstStep.delay_minutes?? 0) *     60_000;
const firstSendAt = new Date(anchor.getTime() + firstStepDelayMs);
// then: next_send_at: firstSendAt.toISOString() in the recipient row
```

Make sure the `select(...)` that fetches the campaign includes `scheduled_start_at`. If the existing select uses `*` you're fine. If it lists columns, append `scheduled_start_at`.

### Step 3: Deploy

Pattern verified earlier this session — use:

1. `mcp__claude_ai_Supabase__get_edge_function(project_id, slug="queue-campaign-recipients")` — capture current `verify_jwt`
2. `mcp__claude_ai_Supabase__deploy_edge_function(project_id, slug="queue-campaign-recipients", verify_jwt=<captured>, files=[...])` — bundle any `_shared/*` imports

### Step 4: Smoke verify

```sql
-- Create a draft campaign with scheduled_start_at 1 hour in the future,
-- then enroll one recipient and check that next_send_at matches
-- (scheduled_start_at + step[0].delay_*).
-- The actual SQL depends on which campaign / steps exist — use
-- Test Campaign 1.2 as the source of truth: insert a placeholder recipient
-- via the edge fn (not direct SQL) and confirm the materialized next_send_at.
```

If smoke result shows `next_send_at = now() + delay` rather than `scheduled_start_at + delay`, the wiring is wrong — STOP and report.

### Step 5: Commit

```
git add supabase/functions/queue-campaign-recipients/index.ts
git commit -m "feat(campaigns): queue-campaign-recipients anchors to scheduled_start_at

When a campaign has scheduled_start_at set, enrolled recipients'
next_send_at is computed from that anchor + step delays instead of
from now(). Campaigns with NULL scheduled_start_at continue to use
now() so legacy launches are unaffected."
```

---

## Task 3: Frontend — LaunchSchedulePicker component

**Files:**
- Create: `frontend/src/features/outbound/components/LaunchSchedulePicker.tsx`

### Step 1: Write the component

```tsx
/**
 * LaunchSchedulePicker — datetime-local + TZ select for setting the
 * campaign's scheduled_start_at. Sub-project J. The value is persisted
 * in UTC; TZ is display-only.
 */
import { useMemo } from "react";
import { CalendarClock } from "lucide-react";

interface Props {
  value: string | null;            // ISO-8601 UTC string or null
  timezone: string;                // IANA TZ
  onChange: (utcIso: string | null, tz: string) => void;
  disabled?: boolean;
}

// Convert UTC ISO to a "YYYY-MM-DDTHH:mm" string in the given TZ for the
// datetime-local input.
function utcToLocalInputValue(utcIso: string | null, tz: string): string {
  if (!utcIso) return "";
  try {
    const d = new Date(utcIso);
    // toLocaleString in the target TZ, then reformat to input shape.
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(d);
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
    return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
  } catch {
    return "";
  }
}

// Convert "YYYY-MM-DDTHH:mm" in target TZ → UTC ISO.
function localInputToUtcIso(local: string, tz: string): string | null {
  if (!local) return null;
  // Parse local as if it were UTC, then adjust for TZ offset at that instant.
  const naive = new Date(`${local}:00Z`);
  if (Number.isNaN(naive.getTime())) return null;
  // Compute offset between naive and the same wall-clock in `tz`.
  const partsNow = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(naive);
  const get = (t: string) => partsNow.find((p) => p.type === t)?.value ?? "00";
  const asUtcOfWall = Date.UTC(
    parseInt(get("year"), 10),
    parseInt(get("month"), 10) - 1,
    parseInt(get("day"), 10),
    parseInt(get("hour"), 10),
    parseInt(get("minute"), 10),
    parseInt(get("second"), 10),
  );
  const offsetMs = asUtcOfWall - naive.getTime();
  return new Date(naive.getTime() - offsetMs).toISOString();
}

const COMMON_TZS = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Europe/London",
  "Europe/Berlin",
  "Asia/Tokyo",
  "Asia/Singapore",
  "Australia/Sydney",
];

export function LaunchSchedulePicker({ value, timezone, onChange, disabled }: Props) {
  const tzOptions = useMemo(() => {
    const browser = (() => {
      try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return "UTC"; }
    })();
    const set = new Set([browser, ...COMMON_TZS, timezone].filter(Boolean));
    return Array.from(set);
  }, [timezone]);

  const localInput = utcToLocalInputValue(value, timezone);

  return (
    <div className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[11px] text-slate-700">
      <CalendarClock className="h-3 w-3 text-blue-600" />
      <span className="font-semibold uppercase tracking-[0.06em] text-slate-500">Launch</span>
      <input
        type="datetime-local"
        value={localInput}
        disabled={disabled}
        onChange={(e) => {
          const next = e.target.value
            ? localInputToUtcIso(e.target.value, timezone)
            : null;
          onChange(next, timezone);
        }}
        className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[11px] focus:outline-none focus:ring-1 focus:ring-blue-200 disabled:opacity-60"
      />
      <select
        value={timezone}
        disabled={disabled}
        onChange={(e) => onChange(value, e.target.value)}
        className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-mono focus:outline-none focus:ring-1 focus:ring-blue-200 disabled:opacity-60"
      >
        {tzOptions.map((tz) => (
          <option key={tz} value={tz}>{tz}</option>
        ))}
      </select>
    </div>
  );
}
```

### Step 2: TypeScript check

```
cd frontend && pnpm tsc --noEmit
```
Expected: clean. New file is self-contained.

### Step 3: Commit

```
git add frontend/src/features/outbound/components/LaunchSchedulePicker.tsx
git commit -m "feat(campaigns): LaunchSchedulePicker component (Sub-project J)

Datetime-local + IANA TZ select. Persists as UTC ISO; TZ is display
only. TZ list defaults to browser TZ plus common US/EU/Asia zones."
```

---

## Task 4: Wire ScheduleStrip to accept a persisted anchor

**Files:**
- Modify: `frontend/src/features/outbound/components/ScheduleStrip.tsx`

### Step 1: Add anchor prop

Change the function signature on line ~63 from:
```ts
export function ScheduleStrip({ steps, launching }: { steps: BuilderStep[]; launching?: boolean }) {
```
to:
```ts
export function ScheduleStrip({ steps, launching, anchor }: { steps: BuilderStep[]; launching?: boolean; anchor?: number }) {
```

### Step 2: Replace Date.now() on line 73

Find:
```ts
let cursor = Date.now();
```
Replace with:
```ts
let cursor = anchor ?? Date.now();
```

### Step 3: TypeScript check

```
cd frontend && pnpm tsc --noEmit
```
Expected: clean.

### Step 4: Commit

```
git add frontend/src/features/outbound/components/ScheduleStrip.tsx
git commit -m "feat(campaigns): ScheduleStrip accepts persisted anchor (Sub-project J)

Replaces Date.now() with optional anchor prop. Caller passes the
campaign's scheduled_start_at when set; falls back to now() for
draft campaigns where the launch time hasn't been chosen yet."
```

---

## Task 5: CampaignBuilder.jsx — state, mount, save payload

**Files:**
- Modify: `frontend/src/pages/CampaignBuilder.jsx`

### Step 1: Add state synced from details

Near the cluster of `useState` calls (search `setLaunchConfirmOpen`):

```jsx
const [scheduledStartAt, setScheduledStartAt] = useState(details?.scheduled_start_at ?? null);
const [sendTimezone, setSendTimezone] = useState(
  details?.send_timezone || (typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "UTC"),
);
```

Find the existing `useEffect` that syncs other state from `details` (likely near where `setSteps`/`setName` get called when details loads). Add:

```jsx
if (details?.scheduled_start_at !== undefined) {
  setScheduledStartAt(details.scheduled_start_at);
}
if (details?.send_timezone) {
  setSendTimezone(details.send_timezone);
}
```

### Step 2: Import + mount the picker

Add to the imports near the other `@/features/outbound/components/*` imports:
```jsx
import { LaunchSchedulePicker } from "@/features/outbound/components/LaunchSchedulePicker";
```
(Match the existing alias style if different.)

In the header action cluster (around line 1036–1099, the same area as the Activity button from Sub-project K), insert before the `<LaunchButton ... />`:

```jsx
<LaunchSchedulePicker
  value={scheduledStartAt}
  timezone={sendTimezone}
  onChange={(utc, tz) => {
    setScheduledStartAt(utc);
    setSendTimezone(tz);
  }}
  disabled={details?.status === "active" || details?.status === "archived"}
/>
```

### Step 3: Pass anchor to ScheduleStrip

Find the `<ScheduleStrip steps={...} />` usage. Add:
```jsx
anchor={scheduledStartAt ? Date.parse(scheduledStartAt) : undefined}
```

### Step 4: Thread into save payload

Find `handleSave` (search `saveCampaign(`). Add `scheduled_start_at` and `send_timezone` to whatever object is passed. If `saveCampaign` doesn't currently accept them, that's Task 6 — flag this and move on for now (the save will silently drop them until Task 6 lands).

### Step 5: Local TS check + dev smoke

```
cd frontend && pnpm tsc --noEmit
pnpm dev
```
Open the campaign builder; verify:
- Launch time picker visible in header
- Setting a date updates the ScheduleStrip projection (uses the picked anchor)
- Reloading the page preserves the value (assuming Task 6 has wired save)

### Step 6: Commit

```
git add frontend/src/pages/CampaignBuilder.jsx
git commit -m "feat(campaigns): wire LaunchSchedulePicker + persisted anchor (Sub-project J)

Adds scheduledStartAt/sendTimezone state synced from details. Mounts
the picker in the header cluster. Threads anchor into ScheduleStrip
so its projection uses the persisted launch time instead of Date.now().
Save payload extended; legacy launch (NULL anchor) still works."
```

---

## Task 6: API client — saveCampaign accepts scheduled_start_at + send_timezone

**Files:**
- Modify: `frontend/src/lib/api.ts`

### Step 1: Locate `saveCampaign`

Grep `frontend/src/lib/api.ts` for `saveCampaign`. Identify the request body shape — most likely a PATCH/PUT on `lit_campaigns` row.

### Step 2: Add the two fields

In the body, accept and forward `scheduled_start_at` (nullable ISO) and `send_timezone` (string). The backend update is a straight column write to `lit_campaigns` — no edge fn needed since this is part of the existing campaign update path.

If `saveCampaign` is currently a Supabase client `.update({...}).eq("id", ...)`, just include the new fields in the update payload. If it's an RPC call, that RPC needs extending too — flag and STOP if so.

### Step 3: TypeScript check

```
cd frontend && pnpm tsc --noEmit
```

### Step 4: Smoke verify

In the running dev server: edit a campaign, set a launch time, save, reload the page. Confirm the picker shows the persisted value (not "now").

Also confirm in the DB:
```sql
SELECT id, name, scheduled_start_at, send_timezone FROM lit_campaigns WHERE id='<the-test-campaign-id>';
```
Expected: row reflects what was saved.

### Step 5: Commit

```
git add frontend/src/lib/api.ts
git commit -m "feat(campaigns): saveCampaign persists scheduled_start_at + send_timezone

Closes Sub-project J. The UI value now round-trips through Supabase
so the campaign builder no longer resets the schedule to 'now' on
re-login."
```

---

## Task 7: End-to-end acceptance + push + merge

### Step 1: Acceptance

Manual smoke on dev:
1. Open a draft campaign
2. Set launch time = tomorrow 9:00 AM
3. Save
4. Sign out, sign back in, reopen the campaign
5. **EXPECT:** picker still shows "tomorrow 9:00 AM" (not the new "now")
6. ScheduleStrip shows step 1 at the picked time + step 2's delay

DB check:
```sql
SELECT id, name, scheduled_start_at, send_timezone FROM lit_campaigns WHERE name LIKE '%Test%' ORDER BY updated_at DESC LIMIT 5;
```

Enrollment check (if user actually clicks Launch with a future scheduled_start_at):
```sql
SELECT id, email, next_send_at, status FROM lit_campaign_contacts WHERE campaign_id='<id>' ORDER BY next_send_at;
```
Expected: every recipient's `next_send_at` >= `scheduled_start_at` from the campaign.

### Step 2: Push branch

```
git push origin claude/review-dashboard-deploy-3AmMD
```

### Step 3: Cherry-pick to main

```
git checkout main
git pull origin main
git cherry-pick <task-1-sha> <task-2-sha> <task-3-sha> <task-4-sha> <task-5-sha> <task-6-sha>
git push origin main
git checkout claude/review-dashboard-deploy-3AmMD
```

### Step 4: Verify Vercel production

```
mcp__claude_ai_Vercel__list_deployments(team_id="team_O3pR8pSBsZJIStgD0nmgEkBm", project_id="prj_qB3ZiAubrCCp0oHTZnjjZm6vGmFQ", limit=2)
```

Expect latest deploy targeting main with the cherry-picked HEAD SHA, state QUEUED → BUILDING → READY.

---

## Self-review

- ✅ Spec coverage: all 3 architecture decisions (hybrid timing, materialized per-recipient, edits-future-only) implemented. Out-of-scope items (step time-of-day, weekday-skip) explicitly deferred.
- ✅ Q3=A: trigger filters `status IN ('queued','pending')` AND `current_step_id` matches the step — sent rows untouched.
- ✅ No placeholders.
- ✅ Type consistency: `scheduled_start_at` snake_case at DB/API; `scheduledStartAt` camelCase in React state; `anchor` (number ms) in ScheduleStrip. All conversions explicit.
- ✅ Legacy fallback: campaigns with NULL `scheduled_start_at` use `now()` everywhere — no regression for already-launched work.
- ✅ Files: 6 (1 migration, 1 edge fn, 4 frontend). Matches spec.
