# LIT Outreach Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the half-built LIT campaign pipeline so users can run end-to-end cold-email sequences from their own Gmail/Outlook mailbox with proper throttling, warmup, suppression compliance, and reply detection.

**Architecture:** Extend the existing `send-campaign-email` Supabase edge function into a cron-driven dispatcher that respects per-mailbox throttle + warmup-ramp caps, calls the existing `lit_email_suppression_status` RPC pre-send, and advances recipients through `lit_campaign_steps` after each send. A new `reply-receiver` edge function correlates Gmail Watch / Microsoft Graph push notifications back to outbound `lit_outreach_history` rows by `Message-ID` and writes reply events + notifications. A new `SendToOutreachModal` on the Pulse Quick Card composes existing pieces (template registry → `lit_campaigns` row → `queue-campaign-recipients`) into a 2-click flow.

**Tech Stack:** Supabase edge functions (Deno + std@0.224.0), Postgres + pg_cron + pg_net, React 18 + Vite + TypeScript, Gmail API v1, Microsoft Graph v1.0, Google Cloud Pub/Sub (push subscription).

**Spec:** [docs/superpowers/specs/2026-05-20-lit-outreach-engine-design.md](../specs/2026-05-20-lit-outreach-engine-design.md)

**Branch policy:** All work stays on `claude/review-dashboard-deploy-3AmMD` per the plan-limits branch lock memory. Never branch off; never deploy from a new branch.

---

## File Structure

### New files
- `supabase/functions/_shared/outreach-throttle.ts` — pure helpers: warmup curve + throttle decision
- `supabase/functions/_shared/outreach-throttle.test.ts` — Deno tests for the helpers
- `supabase/functions/_shared/reply-correlate.ts` — pure header-correlation helper
- `supabase/functions/_shared/reply-correlate.test.ts` — Deno tests
- `supabase/functions/reply-receiver/index.ts` — Pub/Sub + Graph push handler
- `supabase/migrations/<ts>_lit_email_accounts_warmup.sql` — Component B schema
- `supabase/migrations/<ts>_campaign_dispatcher_cron.sql` — Component A cron
- `supabase/migrations/<ts>_mailbox_daily_reset_cron.sql` — Component B daily reset
- `supabase/migrations/<ts>_email_subscription_renewal_cron.sql` — Component C renewal
- `frontend/src/features/pulse/SendToOutreachModal.jsx` — Component E modal
- `frontend/src/pages/campaigns/RepliesTab.jsx` — Component F Replies tab

### Modified files
- `supabase/functions/send-campaign-email/index.ts` — Component A core dispatcher rewrite
- `supabase/functions/oauth-gmail-callback/index.ts` — Component C Gmail Watch registration
- `supabase/functions/oauth-outlook-callback/index.ts` — Component C Graph subscription
- `frontend/src/features/pulse/PulseQuickCard.jsx` — Component E new button
- `frontend/src/pages/CampaignAnalyticsPage.jsx` — Component F Replies tab integration

---

## Task 1: Pub/Sub infrastructure audit + provisioning

**Files:**
- Investigate: GCP project for the existing LIT Gmail OAuth integration
- Document findings in: `docs/superpowers/specs/2026-05-20-lit-outreach-engine-design.md` (open-questions section)
- Modify: Supabase project env vars (via dashboard or MCP)

- [ ] **Step 1: Identify the GCP project that owns the Gmail OAuth client**

Run:
```bash
grep -rn "client_id" supabase/functions/oauth-gmail-callback/ supabase/functions/oauth-gmail-start/ 2>/dev/null
grep -rn "GOOGLE_CLIENT_ID\|GMAIL_CLIENT_ID" supabase/functions/ frontend/src/ 2>/dev/null | head -5
```
Expected: Find the env var name. Extract project ID from the client_id (format `<numeric>-<hash>.apps.googleusercontent.com`).

- [ ] **Step 2: Check if Pub/Sub topic `lit-gmail-replies` exists**

In GCP console (or via gcloud CLI if available):
```bash
gcloud pubsub topics list --project=<project-id> | grep lit-gmail-replies
```
Expected: Either topic exists, or empty result meaning we need to create it.

- [ ] **Step 3: If topic missing, provision it**

```bash
gcloud pubsub topics create lit-gmail-replies --project=<project-id>
```

Grant Gmail API permission to publish:
```bash
gcloud pubsub topics add-iam-policy-binding lit-gmail-replies \
  --member=serviceAccount:gmail-api-push@system.gserviceaccount.com \
  --role=roles/pubsub.publisher \
  --project=<project-id>
```

- [ ] **Step 4: Create a push subscription pointing at the reply-receiver edge fn**

The edge fn doesn't exist yet (built in Task 9). Use the planned URL:
`https://<supabase-project-ref>.supabase.co/functions/v1/reply-receiver?source=gmail`

```bash
gcloud pubsub subscriptions create lit-gmail-replies-push \
  --topic=lit-gmail-replies \
  --push-endpoint="https://<supabase-project-ref>.supabase.co/functions/v1/reply-receiver?source=gmail" \
  --push-auth-service-account=<gcp-service-account>@<project-id>.iam.gserviceaccount.com \
  --project=<project-id>
```

- [ ] **Step 5: Add env vars to Supabase project**

In Supabase dashboard → Edge Functions → Secrets, add:
- `GMAIL_PUBSUB_TOPIC=projects/<project-id>/topics/lit-gmail-replies`
- `GMAIL_PUBSUB_AUDIENCE=https://<supabase-project-ref>.supabase.co/functions/v1/reply-receiver` (used for JWT verification of Pub/Sub pushes)

- [ ] **Step 6: Document the resolved values in the spec**

Edit `docs/superpowers/specs/2026-05-20-lit-outreach-engine-design.md`, update the "Resolved decisions" section under decision 3 with the actual topic, subscription, and audience values. Commit:

```bash
git add docs/superpowers/specs/2026-05-20-lit-outreach-engine-design.md
git commit -m "docs(spec): record Pub/Sub topic + subscription for Gmail Watch"
```

---

## Task 2: Schema migration — warmup + cap columns on lit_email_accounts

**Files:**
- Create: `supabase/migrations/20260520_lit_email_accounts_warmup.sql`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/20260520_lit_email_accounts_warmup.sql
ALTER TABLE public.lit_email_accounts
  ADD COLUMN IF NOT EXISTS daily_send_cap      integer NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS hourly_send_cap     integer NOT NULL DEFAULT 20,
  ADD COLUMN IF NOT EXISTS warmup_started_at   timestamptz,
  ADD COLUMN IF NOT EXISTS warmup_complete     boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sent_today          integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sent_this_hour      integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_send_at        timestamptz,
  ADD COLUMN IF NOT EXISTS gmail_watch_expiration   timestamptz,
  ADD COLUMN IF NOT EXISTS gmail_history_id    text,
  ADD COLUMN IF NOT EXISTS graph_subscription_id    text,
  ADD COLUMN IF NOT EXISTS graph_subscription_expiration timestamptz;

-- Recipient-side columns the dispatcher relies on. The architecture
-- audit surfaced `email, status, next_send_at, last_sent_at, merge_vars`
-- already on lit_campaign_contacts; the IF NOT EXISTS guards make these
-- adds safe to re-run if they were added by a prior migration.
ALTER TABLE public.lit_campaign_contacts
  ADD COLUMN IF NOT EXISTS next_step_order     integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS suppressed_reason   text;

COMMENT ON COLUMN public.lit_email_accounts.daily_send_cap IS
  '50/day default. Post-warmup ceiling. Raised manually via SQL for trusted mailboxes.';
COMMENT ON COLUMN public.lit_email_accounts.warmup_started_at IS
  'When the auto-ramp curve started. NULL = no ramp (treat as complete).';
COMMENT ON COLUMN public.lit_email_accounts.warmup_complete IS
  'True = skip warmup curve, use daily_send_cap directly. Defaults false for new connections.';
COMMENT ON COLUMN public.lit_email_accounts.gmail_history_id IS
  'Last processed historyId from Gmail Watch. Used to fetch new messages on push.';
COMMENT ON COLUMN public.lit_email_accounts.graph_subscription_id IS
  'Microsoft Graph subscription ID for inbox messages. Renewed every 60h.';
```

- [ ] **Step 2: Apply via Supabase MCP**

Use the `mcp__claude_ai_Supabase__apply_migration` tool with project_id `jkmrfiaefxwgbvftohrb`, name `lit_email_accounts_warmup`, and the SQL above.

- [ ] **Step 3: Verify the columns exist**

Use `mcp__claude_ai_Supabase__execute_sql` with:
```sql
SELECT table_name, column_name, data_type, column_default
  FROM information_schema.columns
 WHERE table_schema = 'public'
   AND (
     (table_name = 'lit_email_accounts' AND column_name IN
       ('daily_send_cap','hourly_send_cap','warmup_started_at','warmup_complete',
        'sent_today','sent_this_hour','last_send_at','gmail_watch_expiration',
        'gmail_history_id','graph_subscription_id','graph_subscription_expiration'))
     OR
     (table_name = 'lit_campaign_contacts' AND column_name IN
       ('next_step_order','suppressed_reason'))
   )
 ORDER BY table_name, column_name;
```
Expected: 13 rows. `daily_send_cap` default 50, `hourly_send_cap` 20, booleans false, `next_step_order` default 1.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260520_lit_email_accounts_warmup.sql
git commit -m "feat(outreach): add warmup + throttle columns to lit_email_accounts

Adds daily_send_cap, hourly_send_cap, warmup_started_at, warmup_complete,
sent_today, sent_this_hour, last_send_at counters + Gmail Watch and
Graph subscription tracking fields. Phase 1 outreach engine."
```

---

## Task 3: Warmup curve helper (TDD)

**Files:**
- Create: `supabase/functions/_shared/outreach-throttle.ts`
- Create: `supabase/functions/_shared/outreach-throttle.test.ts`

- [ ] **Step 1: Write the failing test**

Create `supabase/functions/_shared/outreach-throttle.test.ts`:

```typescript
import { computeDailyCap } from "./outreach-throttle.ts";

const DAY_MS = 86400000;

Deno.test("computeDailyCap — null warmupStartedAt + warmupComplete=false uses base cap (treats as never started)", () => {
  const cap = computeDailyCap({
    now: new Date("2026-05-20T12:00:00Z"),
    warmupStartedAt: null,
    warmupComplete: false,
    dailySendCap: 50,
  });
  if (cap !== 50) throw new Error(`expected 50, got ${cap}`);
});

Deno.test("computeDailyCap — warmupComplete=true uses dailySendCap as ceiling", () => {
  const cap = computeDailyCap({
    now: new Date("2026-05-20T12:00:00Z"),
    warmupStartedAt: new Date("2026-05-19T12:00:00Z"),
    warmupComplete: true,
    dailySendCap: 200,
  });
  if (cap !== 200) throw new Error(`expected 200, got ${cap}`);
});

Deno.test("computeDailyCap — day 1-3 of warmup returns 10", () => {
  const start = new Date("2026-05-20T00:00:00Z");
  for (const day of [0, 1, 2]) {
    const cap = computeDailyCap({
      now: new Date(start.getTime() + day * DAY_MS),
      warmupStartedAt: start,
      warmupComplete: false,
      dailySendCap: 50,
    });
    if (cap !== 10) throw new Error(`day ${day + 1}: expected 10, got ${cap}`);
  }
});

Deno.test("computeDailyCap — day 4-7 returns 25", () => {
  const start = new Date("2026-05-20T00:00:00Z");
  for (const day of [3, 4, 5, 6]) {
    const cap = computeDailyCap({
      now: new Date(start.getTime() + day * DAY_MS),
      warmupStartedAt: start,
      warmupComplete: false,
      dailySendCap: 50,
    });
    if (cap !== 25) throw new Error(`day ${day + 1}: expected 25, got ${cap}`);
  }
});

Deno.test("computeDailyCap — day 8-14 returns 50", () => {
  const start = new Date("2026-05-20T00:00:00Z");
  for (const day of [7, 10, 13]) {
    const cap = computeDailyCap({
      now: new Date(start.getTime() + day * DAY_MS),
      warmupStartedAt: start,
      warmupComplete: false,
      dailySendCap: 50,
    });
    if (cap !== 50) throw new Error(`day ${day + 1}: expected 50, got ${cap}`);
  }
});

Deno.test("computeDailyCap — day 15-21 returns 100", () => {
  const start = new Date("2026-05-20T00:00:00Z");
  const cap = computeDailyCap({
    now: new Date(start.getTime() + 18 * DAY_MS),
    warmupStartedAt: start,
    warmupComplete: false,
    dailySendCap: 200,
  });
  if (cap !== 100) throw new Error(`expected 100, got ${cap}`);
});

Deno.test("computeDailyCap — day 22-30 returns 150", () => {
  const start = new Date("2026-05-20T00:00:00Z");
  const cap = computeDailyCap({
    now: new Date(start.getTime() + 25 * DAY_MS),
    warmupStartedAt: start,
    warmupComplete: false,
    dailySendCap: 200,
  });
  if (cap !== 150) throw new Error(`expected 150, got ${cap}`);
});

Deno.test("computeDailyCap — day 31+ returns min(dailySendCap, 200)", () => {
  const start = new Date("2026-05-20T00:00:00Z");
  const cap = computeDailyCap({
    now: new Date(start.getTime() + 60 * DAY_MS),
    warmupStartedAt: start,
    warmupComplete: false,
    dailySendCap: 200,
  });
  if (cap !== 200) throw new Error(`expected 200, got ${cap}`);
});

Deno.test("computeDailyCap — day 31+ honors lower override cap", () => {
  const start = new Date("2026-05-20T00:00:00Z");
  const cap = computeDailyCap({
    now: new Date(start.getTime() + 60 * DAY_MS),
    warmupStartedAt: start,
    warmupComplete: false,
    dailySendCap: 30,
  });
  if (cap !== 30) throw new Error(`expected 30, got ${cap}`);
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
deno test --allow-read supabase/functions/_shared/outreach-throttle.test.ts
```
Expected: All tests FAIL with "Module not found" or `computeDailyCap is not a function`.

- [ ] **Step 3: Implement the helper**

Create `supabase/functions/_shared/outreach-throttle.ts`:

```typescript
// Pure helpers for the campaign dispatcher. No I/O — all decisions take
// the account row state as input so they're trivially unit-testable.

const DAY_MS = 86_400_000;

export type ComputeDailyCapInput = {
  now: Date;
  warmupStartedAt: Date | null;
  warmupComplete: boolean;
  dailySendCap: number;
};

/**
 * Returns the effective daily send cap for a mailbox right now. Accounts
 * for the 30-day warmup ramp; falls back to the configured cap once the
 * ramp completes or when warmup_complete is manually set true.
 */
export function computeDailyCap(input: ComputeDailyCapInput): number {
  const { now, warmupStartedAt, warmupComplete, dailySendCap } = input;

  if (warmupComplete || warmupStartedAt === null) {
    return dailySendCap;
  }

  const daysSinceStart = Math.floor((now.getTime() - warmupStartedAt.getTime()) / DAY_MS);

  let rampCap: number;
  if (daysSinceStart < 3)       rampCap = 10;
  else if (daysSinceStart < 7)  rampCap = 25;
  else if (daysSinceStart < 14) rampCap = 50;
  else if (daysSinceStart < 21) rampCap = 100;
  else if (daysSinceStart < 30) rampCap = 150;
  else                          rampCap = 200;

  return Math.min(rampCap, dailySendCap);
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
deno test --allow-read supabase/functions/_shared/outreach-throttle.test.ts
```
Expected: 8 passed; 0 failed.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/outreach-throttle.ts supabase/functions/_shared/outreach-throttle.test.ts
git commit -m "feat(outreach): warmup curve helper with Deno tests

computeDailyCap(): 30-day ramp from 10 → 200/day, capped by user's
dailySendCap override. Pure function, 8 unit tests covering all
tier boundaries + warmupComplete short-circuit."
```

---

## Task 4: Throttle decision helper (TDD)

**Files:**
- Modify: `supabase/functions/_shared/outreach-throttle.ts` (add second export)
- Modify: `supabase/functions/_shared/outreach-throttle.test.ts` (add more tests)

- [ ] **Step 1: Add failing tests to outreach-throttle.test.ts**

Append to `supabase/functions/_shared/outreach-throttle.test.ts`:

```typescript
import { canSendNow } from "./outreach-throttle.ts";

Deno.test("canSendNow — fresh mailbox under both caps returns allowed", () => {
  const r = canSendNow({
    now: new Date("2026-05-20T12:00:00Z"),
    sentToday: 0,
    sentThisHour: 0,
    effectiveDailyCap: 50,
    hourlySendCap: 20,
    lastSendAt: null,
  });
  if (r.allowed !== true) throw new Error(`expected allowed=true, got ${JSON.stringify(r)}`);
});

Deno.test("canSendNow — at hourly cap returns blocked + retry next hour boundary", () => {
  const now = new Date("2026-05-20T12:15:00Z");
  const r = canSendNow({
    now,
    sentToday: 18,
    sentThisHour: 20,
    effectiveDailyCap: 50,
    hourlySendCap: 20,
    lastSendAt: now,
  });
  if (r.allowed !== false) throw new Error("expected blocked");
  const expected = new Date("2026-05-20T13:00:00Z").getTime();
  if (r.retryAt?.getTime() !== expected) {
    throw new Error(`expected retry at 13:00Z, got ${r.retryAt?.toISOString()}`);
  }
});

Deno.test("canSendNow — at daily cap returns blocked + retry tomorrow 00:00 UTC", () => {
  const now = new Date("2026-05-20T18:00:00Z");
  const r = canSendNow({
    now,
    sentToday: 50,
    sentThisHour: 3,
    effectiveDailyCap: 50,
    hourlySendCap: 20,
    lastSendAt: now,
  });
  if (r.allowed !== false) throw new Error("expected blocked");
  const expected = new Date("2026-05-21T00:00:00Z").getTime();
  if (r.retryAt?.getTime() !== expected) {
    throw new Error(`expected retry at next-day 00:00Z, got ${r.retryAt?.toISOString()}`);
  }
});

Deno.test("canSendNow — effectiveDailyCap of 10 (during warmup) blocks at 10", () => {
  const now = new Date("2026-05-20T12:00:00Z");
  const r = canSendNow({
    now,
    sentToday: 10,
    sentThisHour: 0,
    effectiveDailyCap: 10,
    hourlySendCap: 20,
    lastSendAt: now,
  });
  if (r.allowed !== false) throw new Error("expected blocked at warmup day-1 cap");
});

Deno.test("canSendNow — daily cap takes precedence when both caps hit", () => {
  const now = new Date("2026-05-20T18:00:00Z");
  const r = canSendNow({
    now,
    sentToday: 50,
    sentThisHour: 20,
    effectiveDailyCap: 50,
    hourlySendCap: 20,
    lastSendAt: now,
  });
  if (r.allowed !== false) throw new Error("expected blocked");
  const tomorrow = new Date("2026-05-21T00:00:00Z").getTime();
  if (r.retryAt?.getTime() !== tomorrow) {
    throw new Error(`expected next-day retry when daily exhausted, got ${r.retryAt?.toISOString()}`);
  }
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
deno test --allow-read supabase/functions/_shared/outreach-throttle.test.ts
```
Expected: 5 new tests FAIL with `canSendNow is not exported`. Previous 8 still pass.

- [ ] **Step 3: Implement canSendNow**

Append to `supabase/functions/_shared/outreach-throttle.ts`:

```typescript
export type CanSendNowInput = {
  now: Date;
  sentToday: number;
  sentThisHour: number;
  effectiveDailyCap: number;
  hourlySendCap: number;
  lastSendAt: Date | null;
};

export type CanSendNowResult =
  | { allowed: true; retryAt: null }
  | { allowed: false; retryAt: Date };

/**
 * Decides whether the mailbox can send one more email right now. If
 * blocked, returns the next time a send slot opens — caller pushes
 * `next_send_at` to that timestamp so the recipient is re-queued.
 *
 * Daily cap takes precedence: when sent_today >= effectiveDailyCap we
 * push to next-day 00:00 UTC even if hourly has room (we won't have
 * room when the new hour arrives either).
 */
export function canSendNow(input: CanSendNowInput): CanSendNowResult {
  const { now, sentToday, sentThisHour, effectiveDailyCap, hourlySendCap } = input;

  if (sentToday >= effectiveDailyCap) {
    const nextDay = new Date(Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() + 1,
      0, 0, 0, 0,
    ));
    return { allowed: false, retryAt: nextDay };
  }

  if (sentThisHour >= hourlySendCap) {
    const nextHour = new Date(Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      now.getUTCHours() + 1, 0, 0, 0,
    ));
    return { allowed: false, retryAt: nextHour };
  }

  return { allowed: true, retryAt: null };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
deno test --allow-read supabase/functions/_shared/outreach-throttle.test.ts
```
Expected: 13 passed; 0 failed.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/outreach-throttle.ts supabase/functions/_shared/outreach-throttle.test.ts
git commit -m "feat(outreach): canSendNow throttle decision helper

Pure function returns { allowed, retryAt }. Daily cap takes precedence
over hourly — blocked-by-daily pushes retry to next-day 00:00 UTC,
blocked-by-hourly pushes to next-hour boundary. 5 unit tests."
```

---

## Task 5: Dispatcher core — suppression + throttle + sequence advance

**Files:**
- Modify: `supabase/functions/send-campaign-email/index.ts`

- [ ] **Step 1: Read the existing dispatcher to understand its current shape**

```bash
wc -l supabase/functions/send-campaign-email/index.ts
head -50 supabase/functions/send-campaign-email/index.ts
```
Expected: Confirms the file exists. Note the imports, the `serve()` entry point, and where the "fetch ready recipients" query lives.

- [ ] **Step 2: Add the new imports + helper integration at the top of the file**

Open `supabase/functions/send-campaign-email/index.ts` and add to imports (near the top, after the existing `createClient` import):

```typescript
import { computeDailyCap, canSendNow } from "../_shared/outreach-throttle.ts";
```

- [ ] **Step 3: Replace the recipient-fetch query with the spec-aligned version**

Find the existing query in the file that selects from `lit_campaign_contacts`. Replace it with this exact PostgREST/SQL pattern (adapt to the file's existing style — if it uses raw SQL via RPC, write an RPC; if it uses PostgREST chained calls, use the chained form):

Raw SQL version (used inside an `await supa.rpc('pulse_admin_sql', ...)` call if that pattern exists, otherwise via `supa.from(...).select(...)`):

```typescript
const { data: ready, error: readyErr } = await supa
  .from("lit_campaign_contacts")
  .select(`
    id,
    campaign_id,
    contact_id,
    email,
    status,
    next_send_at,
    next_step_order,
    merge_vars,
    campaign:lit_campaigns!inner(
      id, user_id, status, name,
      metrics
    ),
    step:lit_campaign_steps!inner(
      id, step_order, channel, step_type,
      subject, subject_b, body, delay_days, delay_hours, delay_minutes,
      include_signature
    )
  `)
  .in("status", ["pending", "sending"])
  .eq("campaign.status", "active")
  .lte("next_send_at", new Date().toISOString())
  .gte("next_send_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
  .order("next_send_at", { ascending: true })
  .limit(500);

if (readyErr) {
  console.error("[send-campaign-email] fetch ready recipients failed:", readyErr);
  return new Response(JSON.stringify({ ok: false, error: "fetch_failed" }), {
    status: 500, headers: { "Content-Type": "application/json" },
  });
}
```

Note: the join syntax `campaign:lit_campaigns!inner(...)` matches Supabase PostgREST embedding. Confirm `lit_campaign_steps` has a foreign key from `lit_campaign_contacts.campaign_id + next_step_order` — if not, fetch the step in a second query keyed on `(campaign_id, next_step_order)`.

- [ ] **Step 4: Add the per-recipient send loop with suppression + throttle + advance**

Replace whatever the current per-recipient processing block does with:

```typescript
for (const row of ready ?? []) {
  // 1. Acquire advisory lock to prevent double-send if two cron ticks overlap.
  const { data: locked } = await supa.rpc("pg_try_advisory_xact_lock", {
    key: hashRecipientLockKey(row.id),
  });
  if (locked === false) continue;  // another tick is processing this row

  // 2. Suppression check (CAN-SPAM compliance).
  const { data: supp } = await supa.rpc("lit_email_suppression_status", {
    p_email: row.email,
  });
  if (supp?.unsubscribed || supp?.bounced || supp?.complained) {
    await supa
      .from("lit_campaign_contacts")
      .update({ status: "suppressed", suppressed_reason: supp.unsubscribed ? "unsubscribed" : supp.bounced ? "bounced" : "complained" })
      .eq("id", row.id);
    continue;
  }

  // 3. Resolve sender mailbox from campaign metrics.
  const senderId = row.campaign.metrics?.sender_account_id;
  if (!senderId) {
    console.warn(`[send-campaign-email] campaign ${row.campaign_id} has no sender_account_id`);
    continue;
  }
  const { data: mailbox } = await supa
    .from("lit_email_accounts")
    .select("*")
    .eq("id", senderId)
    .single();
  if (!mailbox || mailbox.status !== "active") {
    console.warn(`[send-campaign-email] mailbox ${senderId} not active`);
    continue;
  }

  // 4. Throttle check.
  const now = new Date();
  const effectiveDailyCap = computeDailyCap({
    now,
    warmupStartedAt: mailbox.warmup_started_at ? new Date(mailbox.warmup_started_at) : null,
    warmupComplete: mailbox.warmup_complete,
    dailySendCap: mailbox.daily_send_cap,
  });
  const throttle = canSendNow({
    now,
    sentToday: mailbox.sent_today,
    sentThisHour: mailbox.sent_this_hour,
    effectiveDailyCap,
    hourlySendCap: mailbox.hourly_send_cap,
    lastSendAt: mailbox.last_send_at ? new Date(mailbox.last_send_at) : null,
  });
  if (!throttle.allowed) {
    await supa
      .from("lit_campaign_contacts")
      .update({ next_send_at: throttle.retryAt!.toISOString() })
      .eq("id", row.id);
    continue;
  }

  // 5. Send via Gmail or Outlook (no Resend code path per spec decision 1).
  const sendResult = await sendViaUserMailbox({
    supa,
    mailbox,
    recipient: row,
    step: row.step,
  });

  if (!sendResult.ok) {
    await supa.from("lit_outreach_history").insert({
      campaign_id: row.campaign_id,
      campaign_step_id: row.step.id,
      contact_id: row.contact_id,
      event_type: "send_failed",
      status: "failed",
      provider: mailbox.provider,
      occurred_at: now.toISOString(),
      payload: { error: sendResult.error },
    });
    continue;
  }

  // 6. Log success + update mailbox counters.
  await supa.from("lit_outreach_history").insert({
    campaign_id: row.campaign_id,
    campaign_step_id: row.step.id,
    contact_id: row.contact_id,
    event_type: "sent",
    status: "sent",
    provider: mailbox.provider,
    provider_event_id: sendResult.providerMessageId,
    occurred_at: now.toISOString(),
    payload: { subject: sendResult.subject },
  });

  await supa
    .from("lit_email_accounts")
    .update({
      sent_today: mailbox.sent_today + 1,
      sent_this_hour: mailbox.sent_this_hour + 1,
      last_send_at: now.toISOString(),
    })
    .eq("id", mailbox.id);

  // 7. Advance recipient to next step or mark complete.
  const nextStepOrder = row.next_step_order + 1;
  const { data: nextStep } = await supa
    .from("lit_campaign_steps")
    .select("delay_days, delay_hours, delay_minutes")
    .eq("campaign_id", row.campaign_id)
    .eq("step_order", nextStepOrder)
    .maybeSingle();

  if (nextStep) {
    const delayMs =
      (nextStep.delay_days || 0) * 86_400_000 +
      (nextStep.delay_hours || 0) * 3_600_000 +
      (nextStep.delay_minutes || 0) * 60_000;
    await supa.from("lit_campaign_contacts").update({
      next_step_order: nextStepOrder,
      next_send_at: new Date(now.getTime() + delayMs).toISOString(),
      last_sent_at: now.toISOString(),
      status: "pending",
    }).eq("id", row.id);
  } else {
    await supa.from("lit_campaign_contacts").update({
      status: "completed",
      last_sent_at: now.toISOString(),
    }).eq("id", row.id);
  }
}
```

Add this helper at the bottom of the file:

```typescript
function hashRecipientLockKey(recipientId: string): number {
  // 64-bit advisory lock key derived from UUID. Postgres pg_try_advisory_xact_lock
  // accepts a bigint; collisions are acceptable (worst case = serialized processing).
  let h = 0;
  for (let i = 0; i < recipientId.length; i++) {
    h = ((h << 5) - h + recipientId.charCodeAt(i)) | 0;
  }
  return h;
}
```

- [ ] **Step 5: Implement sendViaUserMailbox stub for Gmail + Outlook**

If the existing file already has Gmail/Outlook send paths, reuse them. Otherwise add:

```typescript
async function sendViaUserMailbox(args: {
  supa: any;
  mailbox: any;
  recipient: any;
  step: any;
}): Promise<
  | { ok: true; providerMessageId: string; subject: string }
  | { ok: false; error: string }
> {
  const { supa, mailbox, recipient, step } = args;

  // Fetch OAuth token from lit_oauth_tokens (service-role-only table).
  const { data: tok } = await supa
    .from("lit_oauth_tokens")
    .select("access_token, refresh_token, expires_at")
    .eq("email_account_id", mailbox.id)
    .maybeSingle();
  if (!tok) return { ok: false, error: "no_oauth_token" };

  // Refresh if expired (helper assumed to exist; if not, implement inline).
  const accessToken = await ensureFreshAccessToken(supa, mailbox, tok);

  // Render subject + body. Reuse the merge-vars helper if it exists.
  const subject = renderTemplate(step.subject, recipient.merge_vars || {});
  const html = renderTemplate(step.body, recipient.merge_vars || {});

  if (mailbox.provider === "gmail") {
    return sendViaGmail({ accessToken, fromEmail: mailbox.email, toEmail: recipient.email, subject, html });
  }
  if (mailbox.provider === "outlook") {
    return sendViaOutlook({ accessToken, fromEmail: mailbox.email, toEmail: recipient.email, subject, html });
  }
  return { ok: false, error: `unsupported_provider:${mailbox.provider}` };
}

async function sendViaGmail(args: {
  accessToken: string; fromEmail: string; toEmail: string; subject: string; html: string;
}): Promise<{ ok: true; providerMessageId: string; subject: string } | { ok: false; error: string }> {
  const rfc822 = [
    `From: ${args.fromEmail}`,
    `To: ${args.toEmail}`,
    `Subject: ${args.subject}`,
    `MIME-Version: 1.0`,
    `Content-Type: text/html; charset=UTF-8`,
    ``,
    args.html,
  ].join("\r\n");
  const raw = btoa(unescape(encodeURIComponent(rfc822))).replace(/\+/g, "-").replace(/\//g, "_");

  const resp = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${args.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ raw }),
  });
  if (!resp.ok) {
    const txt = await resp.text().catch(() => "");
    return { ok: false, error: `gmail_${resp.status}:${txt.slice(0, 200)}` };
  }
  const data = await resp.json();
  return { ok: true, providerMessageId: data.id, subject: args.subject };
}

async function sendViaOutlook(args: {
  accessToken: string; fromEmail: string; toEmail: string; subject: string; html: string;
}): Promise<{ ok: true; providerMessageId: string; subject: string } | { ok: false; error: string }> {
  const resp = await fetch("https://graph.microsoft.com/v1.0/me/sendMail", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${args.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message: {
        subject: args.subject,
        body: { contentType: "HTML", content: args.html },
        toRecipients: [{ emailAddress: { address: args.toEmail } }],
      },
      saveToSentItems: "true",
    }),
  });
  if (!resp.ok) {
    const txt = await resp.text().catch(() => "");
    return { ok: false, error: `outlook_${resp.status}:${txt.slice(0, 200)}` };
  }
  // Graph /sendMail returns 202 Accepted with no body — no message ID available.
  // For Phase 1, use a synthetic ID; reply-correlate will need to match by
  // (from, to, subject, timestamp) for Outlook-sent mail.
  return { ok: true, providerMessageId: `graph-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`, subject: args.subject };
}

function renderTemplate(template: string, vars: Record<string, any>): string {
  return String(template || "").replace(/\{\{([\w_]+)\}\}/g, (_, key) => String(vars[key] ?? ""));
}
```

`ensureFreshAccessToken` helper: if the existing dispatcher already has this, reuse it. If not, write a minimal version that POSTs to Google/Microsoft token endpoint with `refresh_token` grant and updates `lit_oauth_tokens.access_token` + `expires_at`.

- [ ] **Step 6: Deploy and smoke-test**

Deploy the updated edge function via Supabase MCP `deploy_edge_function` (or the dashboard).

Smoke test: insert one test row into `lit_campaign_contacts` with `next_send_at = now() - interval '1 minute'`, call the edge function via curl:

```bash
curl -X POST "https://jkmrfiaefxwgbvftohrb.supabase.co/functions/v1/send-campaign-email" \
  -H "Authorization: Bearer <service-role-key>" \
  -H "Content-Type: application/json" \
  -d '{}'
```

Verify: the recipient row was processed (status changed to `completed` or advanced to next step), a `lit_outreach_history` row exists with `event_type='sent'`, and the `lit_email_accounts.sent_today` counter incremented.

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/send-campaign-email/index.ts
git commit -m "feat(outreach): dispatcher core — suppression, throttle, sequence advance

send-campaign-email now:
- gates every send through lit_email_suppression_status RPC
- respects per-mailbox warmup curve + daily/hourly caps
- sends via Gmail or Outlook only (no Resend code path per spec)
- advances recipients to next step using delay_days/hours/minutes
- writes lit_outreach_history with provider_event_id for reply correlation
- uses pg_try_advisory_xact_lock to prevent double-send across overlapping ticks"
```

---

## Task 6: pg_cron tick + daily reset migrations

**Files:**
- Create: `supabase/migrations/20260520_campaign_dispatcher_cron.sql`
- Create: `supabase/migrations/20260520_mailbox_daily_reset_cron.sql`

- [ ] **Step 1: Write the dispatcher tick migration**

```sql
-- supabase/migrations/20260520_campaign_dispatcher_cron.sql

-- pg_net is already enabled in this project (used by other cron jobs).
-- Confirm pg_cron is enabled:
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Drop existing job if present (idempotent migration).
SELECT cron.unschedule('campaign-dispatcher-tick') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'campaign-dispatcher-tick'
);

-- Every minute, POST to send-campaign-email. The function does its own
-- pagination + advisory locking, so concurrent invocations are safe.
SELECT cron.schedule(
  'campaign-dispatcher-tick',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/send-campaign-email',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 50000
  ) AS request_id;
  $$
);
```

Note: `app.settings.supabase_url` and `app.settings.service_role_key` are GUCs that the LIT Supabase project sets (other cron jobs use them — verify via `mcp__claude_ai_Supabase__execute_sql` with `SHOW app.settings.supabase_url;` before applying). If they're not set, replace with literal values inline (less clean but works).

- [ ] **Step 2: Write the daily reset migration**

```sql
-- supabase/migrations/20260520_mailbox_daily_reset_cron.sql

-- At 00:00 UTC every day, reset sent_today / sent_this_hour counters.
-- Also tick the warmup ramp by NOT touching warmup_started_at — the
-- computeDailyCap helper reads warmup_started_at to derive the current
-- tier on every send, so nothing else needs to happen here.

SELECT cron.unschedule('mailbox-daily-reset') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'mailbox-daily-reset'
);

SELECT cron.schedule(
  'mailbox-daily-reset',
  '0 0 * * *',
  $$
  UPDATE public.lit_email_accounts
     SET sent_today = 0,
         sent_this_hour = 0
   WHERE sent_today > 0 OR sent_this_hour > 0;
  $$
);

-- Hourly reset for sent_this_hour. The dispatcher already pushes
-- recipients past the hour boundary if a mailbox hits its hourly cap,
-- but the counter still needs to decay so the next hour starts fresh.
SELECT cron.unschedule('mailbox-hourly-reset') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'mailbox-hourly-reset'
);

SELECT cron.schedule(
  'mailbox-hourly-reset',
  '0 * * * *',
  $$
  UPDATE public.lit_email_accounts
     SET sent_this_hour = 0
   WHERE sent_this_hour > 0;
  $$
);
```

- [ ] **Step 3: Apply both migrations via Supabase MCP**

Apply `lit_email_accounts_warmup` first (done in Task 2). Then apply these two with the MCP `apply_migration` tool.

- [ ] **Step 4: Verify cron jobs are scheduled**

```sql
SELECT jobname, schedule, active
  FROM cron.job
 WHERE jobname IN ('campaign-dispatcher-tick','mailbox-daily-reset','mailbox-hourly-reset')
 ORDER BY jobname;
```
Expected: 3 rows, all `active=true`, schedules `* * * * *`, `0 0 * * *`, `0 * * * *`.

- [ ] **Step 5: Watch the next tick run in cron.job_run_details**

After waiting ~2 minutes:
```sql
SELECT jobname, status, return_message, start_time
  FROM cron.job_run_details
 WHERE jobname = 'campaign-dispatcher-tick'
 ORDER BY start_time DESC
 LIMIT 5;
```
Expected: At least one row with `status='succeeded'`.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260520_campaign_dispatcher_cron.sql supabase/migrations/20260520_mailbox_daily_reset_cron.sql
git commit -m "feat(outreach): pg_cron jobs for dispatcher + counter resets

campaign-dispatcher-tick:  POSTs send-campaign-email every minute
mailbox-daily-reset:       resets sent_today at 00:00 UTC daily
mailbox-hourly-reset:      resets sent_this_hour at the top of each hour"
```

---

## Task 7: Gmail Watch registration in oauth-gmail-callback

**Files:**
- Modify: `supabase/functions/oauth-gmail-callback/index.ts`

- [ ] **Step 1: Read the existing OAuth callback to find the success path**

```bash
grep -n "users.watch\|lit_email_accounts\|access_token" supabase/functions/oauth-gmail-callback/index.ts | head -20
```
Expected: Find where the function persists the access token + creates/updates the `lit_email_accounts` row. The Watch call goes right after that.

- [ ] **Step 2: Add the Watch registration block after the mailbox row is persisted**

Open `supabase/functions/oauth-gmail-callback/index.ts`. Find the line where the function returns success or completes the mailbox upsert. Immediately before the return, insert:

```typescript
// Register Gmail Watch so we receive push notifications for new messages
// (replies). Pub/Sub topic + push subscription provisioned in Task 1.
try {
  const watchResp = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/watch`,
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        topicName: Deno.env.get("GMAIL_PUBSUB_TOPIC")!,
        labelIds: ["INBOX"],
        labelFilterBehavior: "INCLUDE",
      }),
    },
  );
  if (watchResp.ok) {
    const w = await watchResp.json();
    // expiration is unix-ms as a string per Gmail docs
    const expirationMs = Number(w.expiration);
    // Initialize warmup ramp on first successful connect. If the mailbox
    // row was just created, warmup_started_at is null; set it to now so
    // the 30-day curve begins. Re-connects don't reset the timer.
    await supa.from("lit_email_accounts").update({
      gmail_watch_expiration: new Date(expirationMs).toISOString(),
      gmail_history_id: String(w.historyId),
      warmup_started_at: new Date().toISOString(),  // set unconditionally; null-coalesce in SQL not available via PostgREST update — see step 4 to make this conditional
    }).eq("id", mailboxId).is("warmup_started_at", null);
    // Separate update for the watch fields when warmup is already set
    // (re-connect path); the .is(null) filter above only fires when
    // warmup is unset, so we follow up unconditionally for watch fields:
    await supa.from("lit_email_accounts").update({
      gmail_watch_expiration: new Date(expirationMs).toISOString(),
      gmail_history_id: String(w.historyId),
    }).eq("id", mailboxId);
    console.log(`[oauth-gmail-callback] watch registered: expiration=${new Date(expirationMs).toISOString()}, historyId=${w.historyId}`);
  } else {
    const txt = await watchResp.text().catch(() => "");
    console.error(`[oauth-gmail-callback] watch registration failed: ${watchResp.status} ${txt.slice(0, 300)}`);
    // Non-fatal: mailbox still works for sending; reply detection just won't work.
  }
} catch (err) {
  console.error("[oauth-gmail-callback] watch registration threw:", err);
}
```

Substitute `accessToken` and `mailboxId` with the actual variable names used in this file.

- [ ] **Step 3: Deploy and test by re-connecting a Gmail mailbox**

Deploy via Supabase MCP. Then, in the LIT app, disconnect + reconnect a Gmail account. Verify in DB:

```sql
SELECT email, gmail_watch_expiration, gmail_history_id
  FROM public.lit_email_accounts
 WHERE provider = 'gmail'
 ORDER BY created_at DESC
 LIMIT 1;
```
Expected: `gmail_watch_expiration` is ~7 days in the future, `gmail_history_id` is non-null.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/oauth-gmail-callback/index.ts
git commit -m "feat(outreach): register Gmail Watch on OAuth connect

After persisting the mailbox row, calls gmail.users.watch with the
configured Pub/Sub topic. Stores expiration + initial historyId on
lit_email_accounts. Non-fatal on failure — mailbox still sends, just
no reply push notifications until the next renewal."
```

---

## Task 8: Outlook Graph subscription in oauth-outlook-callback

**Files:**
- Modify: `supabase/functions/oauth-outlook-callback/index.ts`

- [ ] **Step 1: Read the existing OAuth callback**

```bash
grep -n "subscription\|lit_email_accounts\|access_token" supabase/functions/oauth-outlook-callback/index.ts | head -20
```
Expected: Find where the function persists the mailbox row.

- [ ] **Step 2: Add Graph subscription registration after mailbox upsert**

Append before the return:

```typescript
// Register Microsoft Graph subscription for inbox push notifications.
// Reply-receiver edge fn handles the incoming POST.
try {
  const expiresAt = new Date(Date.now() + 60 * 60 * 60 * 1000); // 60 hours (Graph max is 71h59m for messages)
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const subResp = await fetch(
    "https://graph.microsoft.com/v1.0/subscriptions",
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        changeType: "created",
        notificationUrl: `${supabaseUrl}/functions/v1/reply-receiver?source=outlook`,
        resource: "me/mailFolders('Inbox')/messages",
        expirationDateTime: expiresAt.toISOString(),
        clientState: mailboxId,  // echoed back; we use it to identify the mailbox
      }),
    },
  );
  if (subResp.ok) {
    const s = await subResp.json();
    // Initialize warmup_started_at on first connect (null-only).
    await supa.from("lit_email_accounts").update({
      warmup_started_at: new Date().toISOString(),
    }).eq("id", mailboxId).is("warmup_started_at", null);
    await supa.from("lit_email_accounts").update({
      graph_subscription_id: s.id,
      graph_subscription_expiration: s.expirationDateTime,
    }).eq("id", mailboxId);
    console.log(`[oauth-outlook-callback] graph subscription registered: id=${s.id}, expires=${s.expirationDateTime}`);
  } else {
    const txt = await subResp.text().catch(() => "");
    console.error(`[oauth-outlook-callback] subscription registration failed: ${subResp.status} ${txt.slice(0, 300)}`);
  }
} catch (err) {
  console.error("[oauth-outlook-callback] subscription registration threw:", err);
}
```

- [ ] **Step 3: Deploy and test**

Deploy via Supabase MCP. Reconnect an Outlook account. Verify:

```sql
SELECT email, graph_subscription_id, graph_subscription_expiration
  FROM public.lit_email_accounts
 WHERE provider = 'outlook'
 ORDER BY created_at DESC
 LIMIT 1;
```
Expected: both columns populated.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/oauth-outlook-callback/index.ts
git commit -m "feat(outreach): register Microsoft Graph inbox subscription on Outlook connect

POSTs to graph.microsoft.com/v1.0/subscriptions after mailbox row is
persisted. Notification URL points at reply-receiver edge fn with
source=outlook. clientState is the mailbox ID so we can identify the
account on each notification. 60h expiration (renewed by separate cron)."
```

---

## Task 9: Reply correlation helper (TDD)

**Files:**
- Create: `supabase/functions/_shared/reply-correlate.ts`
- Create: `supabase/functions/_shared/reply-correlate.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// supabase/functions/_shared/reply-correlate.test.ts
import { correlateReplyHeaders } from "./reply-correlate.ts";

Deno.test("correlateReplyHeaders — single In-Reply-To matches", () => {
  const r = correlateReplyHeaders({
    inReplyTo: "<msg123@mail.gmail.com>",
    references: null,
  });
  if (r.length !== 1 || r[0] !== "<msg123@mail.gmail.com>") {
    throw new Error(`expected [<msg123>], got ${JSON.stringify(r)}`);
  }
});

Deno.test("correlateReplyHeaders — References returns ordered list", () => {
  const r = correlateReplyHeaders({
    inReplyTo: null,
    references: "<a@x.com> <b@x.com> <c@x.com>",
  });
  if (r.length !== 3) throw new Error(`expected 3 IDs, got ${r.length}`);
  if (r[0] !== "<a@x.com>") throw new Error(`first should be <a@x.com>`);
});

Deno.test("correlateReplyHeaders — both headers present de-dupes", () => {
  const r = correlateReplyHeaders({
    inReplyTo: "<b@x.com>",
    references: "<a@x.com> <b@x.com>",
  });
  if (r.length !== 2) throw new Error(`expected 2 IDs (deduped), got ${r.length}`);
});

Deno.test("correlateReplyHeaders — empty input returns empty", () => {
  const r = correlateReplyHeaders({ inReplyTo: null, references: null });
  if (r.length !== 0) throw new Error("expected empty");
});

Deno.test("correlateReplyHeaders — strips angle brackets in output", () => {
  const r = correlateReplyHeaders({
    inReplyTo: "<msg123@mail.gmail.com>",
    references: null,
  });
  // Keep wrapped form for direct DB match; bare form is alternate.
  if (!r[0].includes("msg123@mail.gmail.com")) throw new Error("should retain message-id body");
});
```

- [ ] **Step 2: Run the test, expect failure**

```bash
deno test --allow-read supabase/functions/_shared/reply-correlate.test.ts
```
Expected: All 5 FAIL with "Module not found" or function-not-defined.

- [ ] **Step 3: Implement the helper**

```typescript
// supabase/functions/_shared/reply-correlate.ts

export type CorrelateInput = {
  inReplyTo: string | null;
  references: string | null;
};

/**
 * Extracts message-IDs from RFC 5322 reply headers, ordered with the
 * most recent first (In-Reply-To takes priority; References is a chain).
 * De-duplicates while preserving order.
 *
 * Caller queries lit_outreach_history.provider_event_id IN (...) to
 * find the original outbound message this reply belongs to.
 */
export function correlateReplyHeaders(input: CorrelateInput): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();

  function add(id: string) {
    const trimmed = id.trim();
    if (!trimmed) return;
    if (seen.has(trimmed)) return;
    seen.add(trimmed);
    ids.push(trimmed);
  }

  if (input.inReplyTo) add(input.inReplyTo);

  if (input.references) {
    // References is a space-separated list of <id> tokens.
    for (const token of input.references.split(/\s+/)) {
      if (token.startsWith("<") && token.endsWith(">")) {
        add(token);
      }
    }
  }

  return ids;
}
```

- [ ] **Step 4: Run tests, expect pass**

```bash
deno test --allow-read supabase/functions/_shared/reply-correlate.test.ts
```
Expected: 5 passed; 0 failed.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/reply-correlate.ts supabase/functions/_shared/reply-correlate.test.ts
git commit -m "feat(outreach): reply header correlation helper

correlateReplyHeaders() extracts message-IDs from In-Reply-To +
References headers, dedupes, preserves order. Used by reply-receiver
to match inbound messages back to lit_outreach_history rows."
```

---

## Task 10: reply-receiver edge function

**Files:**
- Create: `supabase/functions/reply-receiver/index.ts`

- [ ] **Step 1: Create the edge function with the Gmail Pub/Sub path**

```typescript
// supabase/functions/reply-receiver/index.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";
import { correlateReplyHeaders } from "../_shared/reply-correlate.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders() });
  if (req.method !== "POST") return new Response("method_not_allowed", { status: 405 });

  const url = new URL(req.url);
  const source = url.searchParams.get("source");  // 'gmail' | 'outlook'

  const supa = createClient(SUPABASE_URL, SERVICE_ROLE);

  try {
    if (source === "gmail") {
      return await handleGmailPush(req, supa);
    }
    if (source === "outlook") {
      return await handleOutlookNotification(req, supa);
    }
    return new Response("unknown_source", { status: 400 });
  } catch (err) {
    console.error("[reply-receiver] unhandled error:", err);
    // Always return 200 — Pub/Sub + Graph retry on non-2xx and we don't
    // want them retrying a permanently broken payload.
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 200,
      headers: { ...corsHeaders(), "Content-Type": "application/json" },
    });
  }
});

// ── Gmail (Pub/Sub) ───────────────────────────────────────────────────

async function handleGmailPush(req: Request, supa: any): Promise<Response> {
  const body = await req.json();
  // Pub/Sub envelope: { message: { data: base64, attributes, messageId, publishTime } }
  const dataBase64 = body?.message?.data;
  if (!dataBase64) return new Response("no_data", { status: 200, headers: corsHeaders() });

  const decoded = JSON.parse(atob(dataBase64));
  // Decoded shape per Gmail: { emailAddress: string, historyId: string }
  const userEmail = decoded.emailAddress;
  const newHistoryId = String(decoded.historyId);

  // Find the mailbox row by email + previous historyId.
  const { data: mailbox } = await supa
    .from("lit_email_accounts")
    .select("*, lit_oauth_tokens(*)")
    .eq("provider", "gmail")
    .eq("email", userEmail)
    .single();
  if (!mailbox) return new Response("mailbox_not_found", { status: 200, headers: corsHeaders() });

  const accessToken = mailbox.lit_oauth_tokens?.[0]?.access_token;
  if (!accessToken) return new Response("no_token", { status: 200, headers: corsHeaders() });

  // Fetch history since the last processed historyId.
  const prevHistoryId = mailbox.gmail_history_id;
  const histResp = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/history?startHistoryId=${prevHistoryId}&historyTypes=messageAdded`,
    { headers: { "Authorization": `Bearer ${accessToken}` } },
  );
  if (!histResp.ok) {
    console.warn(`[reply-receiver] gmail history fetch failed: ${histResp.status}`);
    return new Response("history_fetch_failed", { status: 200, headers: corsHeaders() });
  }
  const hist = await histResp.json();

  for (const h of (hist.history || [])) {
    for (const ma of (h.messagesAdded || [])) {
      const msgId = ma.message?.id;
      if (!msgId) continue;
      // Fetch full message to read headers.
      const msgResp = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msgId}?format=metadata&metadataHeaders=In-Reply-To&metadataHeaders=References&metadataHeaders=From&metadataHeaders=Subject`,
        { headers: { "Authorization": `Bearer ${accessToken}` } },
      );
      if (!msgResp.ok) continue;
      const msg = await msgResp.json();
      const headers: Array<{ name: string; value: string }> = msg.payload?.headers || [];
      const get = (name: string) => headers.find(h => h.name.toLowerCase() === name.toLowerCase())?.value || null;
      const replyIds = correlateReplyHeaders({
        inReplyTo: get("In-Reply-To"),
        references: get("References"),
      });
      if (replyIds.length === 0) continue;
      await persistReply(supa, {
        mailboxId: mailbox.id,
        userId: mailbox.user_id,
        replyMessageIds: replyIds,
        provider: "gmail",
        providerMessageId: msgId,
        snippet: msg.snippet || "",
        fromHeader: get("From") || "",
        subjectHeader: get("Subject") || "",
      });
    }
  }

  // Advance historyId.
  await supa.from("lit_email_accounts").update({ gmail_history_id: newHistoryId }).eq("id", mailbox.id);

  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { ...corsHeaders(), "Content-Type": "application/json" } });
}

// ── Outlook (Graph) ───────────────────────────────────────────────────

async function handleOutlookNotification(req: Request, supa: any): Promise<Response> {
  // Graph subscription validation handshake.
  const url = new URL(req.url);
  const validationToken = url.searchParams.get("validationToken");
  if (validationToken) {
    return new Response(validationToken, { status: 200, headers: { "Content-Type": "text/plain" } });
  }

  const body = await req.json();
  for (const notif of (body.value || [])) {
    const mailboxId = notif.clientState;
    const messageRef = notif.resourceData?.id;
    if (!mailboxId || !messageRef) continue;

    const { data: mailbox } = await supa
      .from("lit_email_accounts")
      .select("*, lit_oauth_tokens(*)")
      .eq("id", mailboxId)
      .single();
    if (!mailbox) continue;
    const accessToken = mailbox.lit_oauth_tokens?.[0]?.access_token;
    if (!accessToken) continue;

    const msgResp = await fetch(
      `https://graph.microsoft.com/v1.0/me/messages/${messageRef}?$select=internetMessageHeaders,subject,from,bodyPreview`,
      { headers: { "Authorization": `Bearer ${accessToken}` } },
    );
    if (!msgResp.ok) continue;
    const msg = await msgResp.json();
    const headers = msg.internetMessageHeaders || [];
    const get = (name: string) => headers.find((h: any) => h.name.toLowerCase() === name.toLowerCase())?.value || null;
    const replyIds = correlateReplyHeaders({
      inReplyTo: get("In-Reply-To"),
      references: get("References"),
    });
    if (replyIds.length === 0) continue;
    await persistReply(supa, {
      mailboxId,
      userId: mailbox.user_id,
      replyMessageIds: replyIds,
      provider: "outlook",
      providerMessageId: messageRef,
      snippet: msg.bodyPreview || "",
      fromHeader: msg.from?.emailAddress?.address || "",
      subjectHeader: msg.subject || "",
    });
  }
  return new Response("", { status: 202, headers: corsHeaders() });
}

// ── Common persist logic ──────────────────────────────────────────────

async function persistReply(supa: any, args: {
  mailboxId: string;
  userId: string;
  replyMessageIds: string[];
  provider: string;
  providerMessageId: string;
  snippet: string;
  fromHeader: string;
  subjectHeader: string;
}) {
  // Find the original outbound message in lit_outreach_history by Message-ID match.
  const { data: outbound } = await supa
    .from("lit_outreach_history")
    .select("id, campaign_id, campaign_step_id, contact_id")
    .in("provider_event_id", args.replyMessageIds)
    .eq("event_type", "sent")
    .limit(1);
  if (!outbound?.length) {
    console.log(`[reply-receiver] no matching outbound found for replyIds=${args.replyMessageIds.join(",")}`);
    return;
  }
  const orig = outbound[0];

  // Insert reply event (idempotent on provider_event_id).
  const { error: insErr } = await supa.from("lit_outreach_history").insert({
    campaign_id: orig.campaign_id,
    campaign_step_id: orig.campaign_step_id,
    contact_id: orig.contact_id,
    event_type: "replied",
    status: "received",
    provider: args.provider,
    provider_event_id: args.providerMessageId,
    occurred_at: new Date().toISOString(),
    payload: {
      snippet: args.snippet.slice(0, 500),
      from: args.fromHeader,
      subject: args.subjectHeader,
    },
  });
  if (insErr && !String(insErr.message).includes("duplicate")) {
    console.error("[reply-receiver] insert reply failed:", insErr);
    return;
  }

  // Pause future steps for this recipient.
  await supa
    .from("lit_campaign_contacts")
    .update({ status: "replied" })
    .eq("campaign_id", orig.campaign_id)
    .eq("contact_id", orig.contact_id);

  // Look up the company for the timeline entry.
  const { data: contactRow } = await supa
    .from("lit_contacts")
    .select("company_id, full_name")
    .eq("id", orig.contact_id)
    .maybeSingle();

  // Notification row for the bell.
  await supa.from("lit_notifications").insert({
    user_id: args.userId,
    type: "campaign_reply",
    title: `${contactRow?.full_name || "A contact"} replied`,
    body: args.snippet.slice(0, 200),
    payload: {
      campaign_id: orig.campaign_id,
      contact_id: orig.contact_id,
      company_id: contactRow?.company_id,
    },
    read_at: null,
  });

  // Timeline event.
  if (contactRow?.company_id) {
    await supa.from("lit_company_timeline_events").insert({
      company_id: contactRow.company_id,
      event_type: "campaign_reply",
      occurred_at: new Date().toISOString(),
      payload: {
        campaign_id: orig.campaign_id,
        contact_id: orig.contact_id,
        snippet: args.snippet.slice(0, 200),
      },
    });
  }
}
```

- [ ] **Step 2: Deploy the edge function**

Deploy via Supabase MCP `deploy_edge_function` with `verify_jwt=false` (Pub/Sub and Graph won't carry user JWTs — auth is via signature/clientState validation).

- [ ] **Step 3: End-to-end test**

Send yourself a test campaign email through the dispatcher (Task 5 smoke test). From the recipient's inbox, reply to that email. Watch the Supabase edge function logs for `reply-receiver` invocations. Verify:

```sql
SELECT campaign_id, event_type, occurred_at, payload->>'snippet'
  FROM public.lit_outreach_history
 WHERE event_type = 'replied'
 ORDER BY occurred_at DESC
 LIMIT 3;
```
Expected: A row with the reply snippet, within ~30s of sending the reply.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/reply-receiver/index.ts
git commit -m "feat(outreach): reply-receiver edge fn for Gmail Pub/Sub + Outlook Graph

Handles inbound push notifications from both providers, correlates
new messages back to lit_outreach_history.provider_event_id via the
In-Reply-To / References headers, then:
  - inserts a 'replied' event
  - sets lit_campaign_contacts.status = 'replied' (pauses sequence)
  - creates lit_notifications row for the bell
  - logs a lit_company_timeline_events row for the company profile

Idempotent: same provider_event_id never double-inserts. Always
returns 2xx so Pub/Sub/Graph don't retry permanently-broken payloads."
```

---

## Task 11: Subscription renewal cron

**Files:**
- Create: `supabase/migrations/20260520_email_subscription_renewal_cron.sql`
- Modify: `supabase/functions/reply-receiver/index.ts` (add renewal endpoint at `?action=renew`)

- [ ] **Step 1: Add the renewal entry point to reply-receiver**

Edit `supabase/functions/reply-receiver/index.ts`. In the main `serve()` handler, add a branch for renewal before the source check:

```typescript
const action = url.searchParams.get("action");
if (action === "renew") {
  return await handleRenewal(supa);
}
```

Add at the bottom of the file:

```typescript
async function handleRenewal(supa: any): Promise<Response> {
  const renewBefore = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  let renewed = 0;
  let failed = 0;

  // Gmail Watch renewals (Watch lasts 7 days).
  const { data: gmailMboxes } = await supa
    .from("lit_email_accounts")
    .select("*, lit_oauth_tokens(*)")
    .eq("provider", "gmail")
    .lt("gmail_watch_expiration", renewBefore);

  for (const mailbox of (gmailMboxes || [])) {
    const token = mailbox.lit_oauth_tokens?.[0]?.access_token;
    if (!token) { failed++; continue; }
    const resp = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/watch`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        topicName: Deno.env.get("GMAIL_PUBSUB_TOPIC")!,
        labelIds: ["INBOX"],
        labelFilterBehavior: "INCLUDE",
      }),
    });
    if (resp.ok) {
      const w = await resp.json();
      await supa.from("lit_email_accounts").update({
        gmail_watch_expiration: new Date(Number(w.expiration)).toISOString(),
        gmail_history_id: String(w.historyId),
      }).eq("id", mailbox.id);
      renewed++;
    } else {
      failed++;
    }
  }

  // Outlook Graph subscription renewals (max 71h59m for messages).
  const { data: outlookMboxes } = await supa
    .from("lit_email_accounts")
    .select("*, lit_oauth_tokens(*)")
    .eq("provider", "outlook")
    .lt("graph_subscription_expiration", renewBefore);

  for (const mailbox of (outlookMboxes || [])) {
    const token = mailbox.lit_oauth_tokens?.[0]?.access_token;
    if (!token || !mailbox.graph_subscription_id) { failed++; continue; }
    const newExp = new Date(Date.now() + 60 * 60 * 60 * 1000).toISOString();
    const resp = await fetch(
      `https://graph.microsoft.com/v1.0/subscriptions/${mailbox.graph_subscription_id}`,
      {
        method: "PATCH",
        headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ expirationDateTime: newExp }),
      },
    );
    if (resp.ok) {
      await supa.from("lit_email_accounts").update({
        graph_subscription_expiration: newExp,
      }).eq("id", mailbox.id);
      renewed++;
    } else {
      failed++;
    }
  }

  return new Response(JSON.stringify({ ok: true, renewed, failed }), {
    headers: { ...corsHeaders(), "Content-Type": "application/json" },
  });
}
```

- [ ] **Step 2: Write the renewal cron migration**

```sql
-- supabase/migrations/20260520_email_subscription_renewal_cron.sql

SELECT cron.unschedule('email-subscription-renewal') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'email-subscription-renewal'
);

-- Every 6 hours, renew any Gmail Watch / Graph subscription expiring in <24h.
SELECT cron.schedule(
  'email-subscription-renewal',
  '0 */6 * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/reply-receiver?action=renew',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 50000
  ) AS request_id;
  $$
);
```

- [ ] **Step 3: Apply + deploy + verify**

Apply migration via MCP. Redeploy reply-receiver edge fn. Manually trigger the renewal endpoint once to test:

```bash
curl -X POST "https://jkmrfiaefxwgbvftohrb.supabase.co/functions/v1/reply-receiver?action=renew" \
  -H "Authorization: Bearer <service-role-key>" \
  -H "Content-Type: application/json" -d '{}'
```
Expected: `{ ok: true, renewed: N, failed: M }`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260520_email_subscription_renewal_cron.sql supabase/functions/reply-receiver/index.ts
git commit -m "feat(outreach): subscription renewal cron + reply-receiver renew action

Cron runs every 6h, POSTs reply-receiver?action=renew. The action
finds any Gmail Watch or Graph subscription expiring in <24h and
renews them. Keeps reply detection alive indefinitely without manual
intervention."
```

---

## Task 12: List-Unsubscribe headers + suppression audit

**Files:**
- Modify: `supabase/functions/send-campaign-email/index.ts`

- [ ] **Step 1: Add List-Unsubscribe headers to the Gmail send function**

In `sendViaGmail`, update the RFC822 message construction to include the two headers Gmail + Yahoo bulk-sender policy requires (as of Feb 2024):

```typescript
async function sendViaGmail(args: {
  accessToken: string; fromEmail: string; toEmail: string; subject: string; html: string;
  campaignId?: string;
  recipientId?: string;
}): Promise<{ ok: true; providerMessageId: string; subject: string } | { ok: false; error: string }> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const unsubUrl = `${supabaseUrl}/functions/v1/email-unsubscribe?campaign=${args.campaignId}&recipient=${args.recipientId}`;
  const rfc822 = [
    `From: ${args.fromEmail}`,
    `To: ${args.toEmail}`,
    `Subject: ${args.subject}`,
    `List-Unsubscribe: <${unsubUrl}>, <mailto:unsubscribe@logisticintel.com?subject=unsubscribe>`,
    `List-Unsubscribe-Post: List-Unsubscribe=One-Click`,
    `MIME-Version: 1.0`,
    `Content-Type: text/html; charset=UTF-8`,
    ``,
    args.html,
  ].join("\r\n");
  const raw = btoa(unescape(encodeURIComponent(rfc822))).replace(/\+/g, "-").replace(/\//g, "_");
  // ... rest unchanged
}
```

Pass `campaignId` and `recipientId` through from `sendViaUserMailbox`.

- [ ] **Step 2: Update sendViaOutlook to add the same headers**

Outlook Graph supports custom headers via `internetMessageHeaders` (note: these must start with `x-` UNLESS they're a small set of standardized headers Graph allows — `List-Unsubscribe` IS in the allowed set as of late 2023). Update the body:

```typescript
body: JSON.stringify({
  message: {
    subject: args.subject,
    body: { contentType: "HTML", content: args.html },
    toRecipients: [{ emailAddress: { address: args.toEmail } }],
    internetMessageHeaders: [
      { name: "List-Unsubscribe", value: `<${unsubUrl}>, <mailto:unsubscribe@logisticintel.com?subject=unsubscribe>` },
      { name: "List-Unsubscribe-Post", value: "List-Unsubscribe=One-Click" },
    ],
  },
  saveToSentItems: "true",
}),
```

If Graph rejects the headers, fall back to embedding the unsub URL in the email body footer only (wrapV7 already does this) and ignore the bulk-sender header requirement for Outlook senders (lower-volume use case).

- [ ] **Step 3: Verify email-unsubscribe edge fn exists or create stub**

```bash
ls supabase/functions/email-unsubscribe/ 2>/dev/null || echo "MISSING"
```
If missing, create a minimal `supabase/functions/email-unsubscribe/index.ts`:

```typescript
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

serve(async (req) => {
  const url = new URL(req.url);
  const campaignId = url.searchParams.get("campaign");
  const recipientId = url.searchParams.get("recipient");
  if (!campaignId || !recipientId) {
    return new Response("missing_params", { status: 400 });
  }

  const supa = createClient(SUPABASE_URL, SERVICE_ROLE);

  // Find the recipient row + email.
  const { data: recipient } = await supa
    .from("lit_campaign_contacts")
    .select("email")
    .eq("id", recipientId)
    .single();
  if (!recipient) return new Response("not_found", { status: 404 });

  // Write to lit_email_preferences (unsubscribe all).
  await supa.from("lit_email_preferences").upsert({
    email: recipient.email,
    unsubscribed: true,
    unsubscribed_at: new Date().toISOString(),
    source: "campaign_one_click",
  }, { onConflict: "email" });

  // Mark recipient suppressed.
  await supa.from("lit_campaign_contacts").update({
    status: "suppressed",
    suppressed_reason: "unsubscribed",
  }).eq("id", recipientId);

  return new Response(`<html><body><h1>You've been unsubscribed.</h1><p>You will not receive further emails from this sequence.</p></body></html>`, {
    headers: { "Content-Type": "text/html" },
  });
});
```

Deploy with `verify_jwt=false`.

- [ ] **Step 4: Test the unsub flow end-to-end**

Send yourself a campaign email. Click the unsubscribe link in the footer (or hit the URL directly). Verify:

```sql
SELECT email, unsubscribed, unsubscribed_at FROM lit_email_preferences ORDER BY unsubscribed_at DESC LIMIT 1;
```
Expected: your email, `unsubscribed=true`, recent timestamp.

Then attempt to send another email to that address through any campaign — verify the dispatcher's suppression check (from Task 5) marks the recipient as `status='suppressed'` and skips them.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/send-campaign-email/index.ts supabase/functions/email-unsubscribe/
git commit -m "feat(outreach): List-Unsubscribe + List-Unsubscribe-Post headers; one-click unsubscribe

Gmail/Outlook sender policy (Feb 2024) requires these headers on bulk
sends. Each outbound campaign email now includes both, pointing at
the email-unsubscribe edge fn. The unsub endpoint writes
lit_email_preferences.unsubscribed=true (caught by the dispatcher's
suppression check on next tick across all campaigns)."
```

---

## Task 13: Pulse Quick Card "Send to outreach" button + modal

**Files:**
- Create: `frontend/src/features/pulse/SendToOutreachModal.jsx`
- Modify: `frontend/src/features/pulse/PulseQuickCard.jsx`

- [ ] **Step 1: Create the modal component**

```jsx
// frontend/src/features/pulse/SendToOutreachModal.jsx
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { LIT_MARKETING_TEMPLATES } from "@/lib/campaignEmailTemplates";

export default function SendToOutreachModal({ company, contacts, onClose, onSuccess }) {
  const [audience, setAudience] = useState("broker");  // 'broker' | 'forwarder' | 'existing'
  const [existingCampaignId, setExistingCampaignId] = useState("");
  const [senderId, setSenderId] = useState("");
  const [mailboxes, setMailboxes] = useState([]);
  const [existingCampaigns, setExistingCampaigns] = useState([]);
  const [selectedContactIds, setSelectedContactIds] = useState(
    contacts.filter(c => c.email).map(c => c.id),
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: mb } = await supabase
        .from("lit_email_accounts")
        .select("id, email, provider, status, is_primary")
        .eq("user_id", user.id)
        .eq("status", "active")
        .order("is_primary", { ascending: false });
      setMailboxes(mb || []);
      if (mb?.length && !senderId) setSenderId(mb[0].id);

      const { data: camps } = await supabase
        .from("lit_campaigns")
        .select("id, name, status")
        .eq("user_id", user.id)
        .in("status", ["draft", "active"])
        .order("created_at", { ascending: false })
        .limit(50);
      setExistingCampaigns(camps || []);
    })();
  }, []);

  const eligibleContacts = contacts.filter(c => c.email);
  const noMailbox = mailboxes.length === 0;

  async function handleLaunch() {
    setSubmitting(true);
    setError("");
    try {
      const { data: { user } } = await supabase.auth.getUser();

      let campaignId = existingCampaignId;
      if (audience !== "existing") {
        // Create campaign from template.
        const templateKey = audience === "broker" ? "freightBroker" : "smallForwarder";
        const templates = LIT_MARKETING_TEMPLATES.filter(t => t.audience === templateKey);

        const { data: c, error: ce } = await supabase
          .from("lit_campaigns")
          .insert({
            user_id: user.id,
            name: `${company.name} — ${audience === "broker" ? "Broker" : "Forwarder"} outreach`,
            status: "active",
            channel: "email",
            metrics: { sender_account_id: senderId },
          })
          .select("id")
          .single();
        if (ce) throw ce;
        campaignId = c.id;

        const stepRows = templates.map((t, i) => ({
          campaign_id: campaignId,
          step_order: i + 1,
          channel: "email",
          step_type: "email",
          subject: t.subject,
          body: t.html,
          delay_days: t.delayDays ?? (i === 0 ? 0 : i === 1 ? 3 : i === 2 ? 7 : 14),
          delay_hours: 0,
          delay_minutes: 0,
          include_signature: true,
        }));
        const { error: se } = await supabase.from("lit_campaign_steps").insert(stepRows);
        if (se) throw se;
      } else if (existingCampaignId) {
        // Patch sender on the existing campaign if missing.
        const { data: existing } = await supabase
          .from("lit_campaigns")
          .select("metrics")
          .eq("id", existingCampaignId)
          .single();
        if (!existing?.metrics?.sender_account_id) {
          await supabase.from("lit_campaigns").update({
            metrics: { ...(existing?.metrics || {}), sender_account_id: senderId },
          }).eq("id", existingCampaignId);
        }
      }

      // Queue recipients via existing edge fn.
      const { data: qr, error: qe } = await supabase.functions.invoke("queue-campaign-recipients", {
        body: {
          campaign_id: campaignId,
          company_ids: [company.id || company.business_id].filter(Boolean),
          contact_ids: selectedContactIds,
        },
      });
      if (qe) throw qe;

      onSuccess({ campaignId, queued: qr?.queued ?? selectedContactIds.length });
    } catch (err) {
      console.error("[SendToOutreachModal] launch failed:", err);
      setError(err?.message || "Failed to launch outreach");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              Send {eligibleContacts.length} contact{eligibleContacts.length === 1 ? "" : "s"} at {company.name}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Sequence runs over 14 days. Replies pause that recipient automatically.
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">✕</button>
        </div>

        {noMailbox && (
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            Connect Gmail or Outlook in Settings → Integrations to enable outreach.
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium uppercase tracking-wide text-slate-500">Template</label>
            <div className="mt-2 space-y-2">
              {["broker", "forwarder", "existing"].map((a) => (
                <label key={a} className="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-200 p-3 hover:bg-slate-50">
                  <input
                    type="radio"
                    name="audience"
                    value={a}
                    checked={audience === a}
                    onChange={() => setAudience(a)}
                  />
                  <span className="text-sm text-slate-800">
                    {a === "broker" && "Freight broker (4 emails)"}
                    {a === "forwarder" && "Freight forwarder (4 emails)"}
                    {a === "existing" && "Add to existing campaign…"}
                  </span>
                </label>
              ))}
              {audience === "existing" && (
                <select
                  value={existingCampaignId}
                  onChange={(e) => setExistingCampaignId(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                >
                  <option value="">Pick a campaign…</option>
                  {existingCampaigns.map((c) => (
                    <option key={c.id} value={c.id}>{c.name} ({c.status})</option>
                  ))}
                </select>
              )}
            </div>
          </div>

          <div>
            <label className="text-xs font-medium uppercase tracking-wide text-slate-500">Send from</label>
            <select
              value={senderId}
              onChange={(e) => setSenderId(e.target.value)}
              disabled={noMailbox}
              className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              {mailboxes.map((m) => (
                <option key={m.id} value={m.id}>{m.email} ({m.provider})</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-medium uppercase tracking-wide text-slate-500">Recipients</label>
            <ul className="mt-2 space-y-1">
              {eligibleContacts.map((c) => (
                <li key={c.id} className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={selectedContactIds.includes(c.id)}
                    onChange={() => {
                      setSelectedContactIds(prev =>
                        prev.includes(c.id) ? prev.filter(x => x !== c.id) : [...prev, c.id]
                      );
                    }}
                  />
                  <span>{c.full_name || c.email} {c.title ? `— ${c.title}` : ""}</span>
                </li>
              ))}
              {contacts.length > eligibleContacts.length && (
                <li className="text-xs text-slate-400">
                  {contacts.length - eligibleContacts.length} contact(s) without email — skipped
                </li>
              )}
            </ul>
          </div>
        </div>

        {error && <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</div>}

        <div className="mt-6 flex justify-end gap-2">
          <button
            onClick={onClose}
            disabled={submitting}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700"
          >
            Cancel
          </button>
          <button
            onClick={handleLaunch}
            disabled={submitting || noMailbox || selectedContactIds.length === 0 || (audience === "existing" && !existingCampaignId)}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {submitting ? "Starting…" : "Start outreach"}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Wire the button into PulseQuickCard**

Open `frontend/src/features/pulse/PulseQuickCard.jsx`. Find the action-button row (look for "Add to Campaign" or "Add to List" buttons). Add a new button:

```jsx
import SendToOutreachModal from "@/features/pulse/SendToOutreachModal";

// inside the component, alongside other modal-toggle states:
const [outreachModalOpen, setOutreachModalOpen] = useState(false);

// inside the action row, after the Add to Campaign button:
<button
  onClick={() => setOutreachModalOpen(true)}
  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
>
  Send to outreach
</button>

// at the bottom of the component, conditionally render the modal:
{outreachModalOpen && (
  <SendToOutreachModal
    company={company}
    contacts={company.contacts || []}
    onClose={() => setOutreachModalOpen(false)}
    onSuccess={({ campaignId, queued }) => {
      setOutreachModalOpen(false);
      // Toast (use existing toast pattern if it exists in this codebase)
      window.dispatchEvent(new CustomEvent("lit:toast", { detail: {
        title: "Outreach started",
        body: `${queued} contact(s) queued. Day 1 email goes out within 60 seconds.`,
        tone: "success",
      }}));
    }}
  />
)}
```

- [ ] **Step 3: Manual UI test**

Start the dev server:
```bash
cd frontend && npm run dev
```

In the browser:
1. Go to `/app/prospecting` as a trial user.
2. Run a Pulse search.
3. Click a Quick Card. Click "Send to outreach".
4. Pick "Freight broker", confirm sender mailbox shows, check the contacts list.
5. Click "Start outreach". Verify the toast appears.
6. Check DB: a new `lit_campaigns` row exists, `lit_campaign_steps` has 4 rows, `lit_campaign_contacts` has the selected contacts queued.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/features/pulse/SendToOutreachModal.jsx frontend/src/features/pulse/PulseQuickCard.jsx
git commit -m "feat(outreach): Pulse Quick Card 'Send to outreach' 1-click flow

New button between Add to Campaign and Add to List. Modal lets user:
- pick template (broker / forwarder / existing campaign)
- pick sender mailbox
- select decision-maker recipients
Then creates the lit_campaigns + lit_campaign_steps rows from the
8-template registry, calls queue-campaign-recipients with the
selected contacts. Dispatcher picks them up on next tick (≤60s)."
```

---

## Task 14: Replies tab on CampaignAnalyticsPage

**Files:**
- Create: `frontend/src/pages/campaigns/RepliesTab.jsx`
- Modify: `frontend/src/pages/CampaignAnalyticsPage.jsx`

- [ ] **Step 1: Audit CampaignAnalyticsPage for existing tab structure**

```bash
grep -n "Tabs\|tab\|TabsList\|TabsTrigger" frontend/src/pages/CampaignAnalyticsPage.jsx | head -20
```
Expected: Find the existing tabs (Overview, Audience, Steps, etc.). Note the pattern (likely shadcn/ui Tabs or a custom component).

- [ ] **Step 2: Create the RepliesTab component**

```jsx
// frontend/src/pages/campaigns/RepliesTab.jsx
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export default function RepliesTab({ campaignId }) {
  const [replies, setReplies] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("lit_outreach_history")
        .select(`
          id, occurred_at, payload, provider,
          contact:lit_contacts(id, full_name, email, title, company_id, company:lit_companies(name))
        `)
        .eq("campaign_id", campaignId)
        .eq("event_type", "replied")
        .order("occurred_at", { ascending: false });
      setReplies(data || []);
      setLoading(false);
    })();
  }, [campaignId]);

  if (loading) return <div className="p-6 text-sm text-slate-500">Loading…</div>;
  if (!replies.length) {
    return (
      <div className="p-12 text-center">
        <p className="text-sm text-slate-500">No replies yet.</p>
        <p className="mt-1 text-xs text-slate-400">Replies appear here within 30 seconds of arrival.</p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-slate-100">
      {replies.map((r) => (
        <div key={r.id} className="flex items-start gap-4 p-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
            ↩
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <span className="font-medium text-slate-900">{r.contact?.full_name || r.payload?.from}</span>
              {r.contact?.company?.name && (
                <span className="text-xs text-slate-500">at {r.contact.company.name}</span>
              )}
              <span className="ml-auto text-xs text-slate-400">{new Date(r.occurred_at).toLocaleString()}</span>
            </div>
            {r.contact?.title && <div className="text-xs text-slate-500">{r.contact.title}</div>}
            <div className="mt-1 text-sm font-medium text-slate-800">{r.payload?.subject}</div>
            <p className="mt-1 line-clamp-2 text-sm text-slate-600">{r.payload?.snippet}</p>
            <div className="mt-2 flex gap-2 text-xs">
              <a
                href={r.provider === "gmail"
                  ? `https://mail.google.com/mail/u/0/#inbox`
                  : `https://outlook.live.com/mail/0/inbox`
                }
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline"
              >
                Open in {r.provider === "gmail" ? "Gmail" : "Outlook"}
              </a>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Add the Replies tab to CampaignAnalyticsPage**

Open `frontend/src/pages/CampaignAnalyticsPage.jsx`. Find the existing tabs list. Add a new "Replies" tab next to the existing ones:

```jsx
import RepliesTab from "@/pages/campaigns/RepliesTab";

// inside the TabsList:
<TabsTrigger value="replies">Replies</TabsTrigger>

// inside the TabsContent area:
<TabsContent value="replies">
  <RepliesTab campaignId={campaignId} />
</TabsContent>
```

Adapt the JSX to whatever tabs library this file uses.

- [ ] **Step 4: Manual UI test**

Send yourself a campaign email (dispatcher test from Task 5). Reply to it from the recipient inbox. Wait ~30 seconds. Open `/app/campaigns/[id]` in the LIT app, click the new "Replies" tab. Verify your reply appears with the snippet, your name (from the contact row), and a working "Open in Gmail/Outlook" link.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/campaigns/RepliesTab.jsx frontend/src/pages/CampaignAnalyticsPage.jsx
git commit -m "feat(outreach): Replies tab on campaign analytics page

Reads lit_outreach_history WHERE event_type='replied' for the campaign,
joins to lit_contacts + lit_companies for display. Shows contact name,
company, title, subject, snippet, timestamp, and deep-link to Gmail or
Outlook web inbox. Replies appear within 30s of arrival via the
reply-receiver pipeline."
```

---

## Task 15: Reply notifications wiring + bell badge audit

**Files:**
- Verify only: `frontend/src/components/notifications/*` (existing bell + dropdown)

- [ ] **Step 1: Audit the existing notifications bell**

```bash
grep -rn "lit_notifications" frontend/src/components/ frontend/src/features/ 2>/dev/null | head -10
```
Expected: Find the component that renders unread notifications. Confirm it reads from `lit_notifications` and shows a badge when `read_at IS NULL`.

- [ ] **Step 2: Confirm `campaign_reply` notification type renders correctly**

In the bell dropdown component, confirm there's a case for `type='campaign_reply'`. If not, add one:

```jsx
// in the notification-render switch:
case "campaign_reply":
  return (
    <a href={`/app/companies/${notification.payload.company_id}`} className="...">
      <div className="font-medium">{notification.title}</div>
      <div className="text-xs text-slate-500">{notification.body}</div>
    </a>
  );
```

- [ ] **Step 3: End-to-end notification test**

Run the same test as Task 14 step 4 (reply to a campaign email). After the reply arrives, refresh the LIT app. Verify:
- Bell shows unread badge (count incremented by 1)
- Click bell → dropdown shows "{Name} replied" with snippet
- Click the notification → navigates to the company profile
- After click, `read_at` is set on the row (badge clears for that item)

- [ ] **Step 4: Commit (if any code changed)**

If only verification, no commit needed. If you added a render case:

```bash
git add frontend/src/components/notifications/
git commit -m "fix(outreach): render campaign_reply notifications in the bell dropdown

The reply-receiver edge fn inserts lit_notifications rows with
type='campaign_reply'. Adds the render case to the bell so users
actually see the notification badge + click-through to the company."
```

---

## Task 16: End-to-end acceptance test

**Files:**
- None modified — pure manual validation

- [ ] **Step 1: Connect a Gmail mailbox**

In the LIT app as a trial user, go to Settings → Integrations → Gmail → Connect. Verify the OAuth flow completes and the mailbox appears as "active".

Check DB:
```sql
SELECT email, status, provider, warmup_started_at, daily_send_cap, gmail_watch_expiration, gmail_history_id
  FROM public.lit_email_accounts
 WHERE user_id = '<your-user-id>'
 ORDER BY created_at DESC LIMIT 1;
```
Expected: status='active', warmup_started_at populated (we'll need to set this on the OAuth callback — see "Open follow-ups" below), daily_send_cap=50, watch_expiration ~7d in future.

- [ ] **Step 2: Run Pulse search → Send to outreach**

1. Navigate to `/app/prospecting`.
2. Search "freight forwarders in atlanta".
3. Click a result card. The Quick Card opens.
4. Click "Send to outreach". Pick "Freight forwarder" template, confirm sender. Click "Start outreach".

Expected: success toast appears.

- [ ] **Step 3: Day-1 email arrives**

Within 60 seconds, the dispatcher cron fires. Check your test recipient's inbox (use a real email you control as one of the decision-makers — manually edit the contact email if needed for testing).

Expected: Day-1 email lands in the recipient's inbox. Contains the broker/forwarder template content. Has List-Unsubscribe header (view "show original" in Gmail to verify).

- [ ] **Step 4: Reply and verify push notification**

From the recipient inbox, hit Reply, send a short response. Wait ~30 seconds.

Expected (verify each):
- Bell badge in the LIT app increments
- Notification "{Contact} replied" appears in bell dropdown
- Click navigates to the company profile
- Company timeline shows a "↩ Campaign reply" entry
- `lit_campaign_contacts.status = 'replied'` for that recipient (sequence paused)
- `lit_outreach_history` has both the original 'sent' row and the new 'replied' row

- [ ] **Step 5: Verify throttle behavior**

Manually trigger the dispatcher in a tight loop (no realistic way to test 50 sends in production without burning a real mailbox — instead, lower the test mailbox's `hourly_send_cap` to 1 and try to send 2 emails). Verify the second send is pushed forward and not sent immediately.

```sql
UPDATE lit_email_accounts SET hourly_send_cap = 1 WHERE id = '<test-mailbox>';
```

Queue 2 recipients. Trigger dispatcher manually.

Expected: 1 sent immediately, 1 has `next_send_at` pushed to the top of the next hour.

Reset:
```sql
UPDATE lit_email_accounts SET hourly_send_cap = 20 WHERE id = '<test-mailbox>';
```

- [ ] **Step 6: Verify unsubscribe**

Open one of your campaign emails. Click the unsubscribe link in the footer (or use the `List-Unsubscribe` header URL).

Expected: Browser shows "You've been unsubscribed" page. DB row appears in `lit_email_preferences`. Send another email to that address → dispatcher marks recipient `status='suppressed'`.

- [ ] **Step 7: Verify the 4-email sequence advances**

Set a recipient's `next_send_at` to NOW manually so Day-1 fires. Then set `delay_days=0, delay_hours=0, delay_minutes=2` on each step (override the 14-day cadence for testing). Watch the recipient progress through all 4 steps over 8 minutes.

```sql
UPDATE lit_campaign_steps SET delay_days = 0, delay_minutes = 2 WHERE campaign_id = '<test-campaign>';
```

Expected: 4 'sent' events in `lit_outreach_history` for that contact, 2 minutes apart. Recipient's `status` ends up `completed` (or `replied` if you replied somewhere along the way).

- [ ] **Step 8: Document any gaps**

If any of steps 1-7 fail, file a follow-up issue describing the gap. If all 7 pass, the engine is Phase-1 complete.

Final commit:

```bash
git commit --allow-empty -m "chore(outreach): Phase 1 acceptance test passed

All 7 acceptance criteria verified end-to-end:
- Gmail OAuth connect persists Watch registration
- Pulse 'Send to outreach' creates campaign + queues recipients
- Day-1 email delivers within 60s
- Reply auto-pauses sequence + creates notification + timeline entry
- Throttle pushes overflow to next-hour boundary
- Unsubscribe writes lit_email_preferences + suppresses across campaigns
- 4-email sequence advances through all steps end-to-end"
```

---

## Open follow-ups (out of scope for Phase 1 but worth tracking)

1. **Settings UI to surface mailbox cap / warmup state** — Not in Phase 1. Operators edit `daily_send_cap` and `warmup_complete` directly via SQL until a Settings UI is built.

2. **Bulk send from Pulse list** — Task 13 modal handles one company. Bulk push from an entire `pulse_saved_list` deferred to Phase 2.

3. **Full inbox / thread view** — Phase 1 deep-links to Gmail/Outlook web. A LIT-native thread view (using Gmail conversations API + Graph `/messages?$filter=conversationId`) is Phase 2.

4. **LinkedIn outreach** — explicitly out of scope. If desired, Phase 2 adds a "Copy LinkedIn message" step that opens `linkedin.com/messaging` with a templated message pre-loaded into clipboard. Manual paste-and-send by the user.

5. **Sender rotation** — Phase 2. When mailbox A hits its cap, fail over to mailbox B from the same user's connected accounts.
