# Campaign Round 2 — P0 Hotfix Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Ship 4 hotfixes — auto-backfill consent on launch, safety-hold auto-expire, test_sent gets campaign_id (+ builder rehydrates nudge), redirect-click populates contact_id/recipient_email. Restores Step 2 sends for in-flight campaigns, closes the silent-503 incident class, fixes the persistent "you haven't tested" nudge, and makes click events readable in the activity feed.

**Architecture:** All server-side. 2 migrations + 3 edge-fn redeploys + 3 frontend file edits. No new components.

**Branch:** `claude/review-dashboard-deploy-3AmMD`.

**Spec:** [docs/superpowers/specs/2026-06-09-campaign-round2-hotfix-design.md](../specs/2026-06-09-campaign-round2-hotfix-design.md)

---

## File Structure

### Files to create

| Path | Responsibility |
|---|---|
| `supabase/migrations/20260609100000_consent_source_legacy_pre_wire.sql` | Extend `lit_recipient_consent.source` CHECK constraint to include `'legacy_pre_consent_wire'` |
| `supabase/migrations/20260609100100_safety_holds_expires_at.sql` | Add `expires_at` to `lit_outreach_safety_holds`, backfill uncleared rows with `created_at + 24h` |

### Files to modify

| Path | Change |
|---|---|
| `supabase/functions/send-campaign-email/index.ts` | (a) safety-hold query respects `expires_at`, (b) auto-backfill consent block before existing gate |
| `supabase/functions/send-test-email/index.ts` | Parse `campaign_id` from body; write it instead of NULL at the `writeHistoryRow` invocation |
| `supabase/functions/redirect-click/index.ts` | Look up contact + email + company_id from `lit_campaign_contacts` using `recipient_id`; populate them in the insert payload |
| `frontend/src/lib/api.ts` | `sendTestEmail` accepts + sends `campaignId` in request body |
| `frontend/src/pages/CampaignBuilder.jsx` | (a) pass `editId` to `handleTestSend`, (b) add useEffect on builder mount to query `lit_outreach_history` and set `hasTestSendOccurred=true` if any `test_sent` rows exist |
| `frontend/src/pages/CampaignAnalyticsPage.jsx` | Recipient label fallback chain at lines 333 + 502: `e.metadata?.recipient_email || recipients.find(...)?.email || UUID slice || "—"` |

---

## Task 1: Migrations (consent source + safety-hold expires_at)

**Files:**
- Create: `supabase/migrations/20260609100000_consent_source_legacy_pre_wire.sql`
- Create: `supabase/migrations/20260609100100_safety_holds_expires_at.sql`

- [ ] **Step 1: Write migration 1 (consent source extension)**

Create `supabase/migrations/20260609100000_consent_source_legacy_pre_wire.sql`:
```sql
-- Extend lit_recipient_consent.source to allow legacy_pre_consent_wire
-- so the dispatcher can auto-backfill consent for recipients added
-- before the consent capture flow shipped (or for recipients where
-- the picker drawer's upsert silently failed).

BEGIN;

ALTER TABLE public.lit_recipient_consent
  DROP CONSTRAINT IF EXISTS lit_recipient_consent_source_check;

ALTER TABLE public.lit_recipient_consent
  ADD CONSTRAINT lit_recipient_consent_source_check
  CHECK (source IN ('saved_company_picker', 'manual_email_tab', 'csv_upload', 'crm_sync', 'legacy_pre_consent_wire'));

COMMIT;
```

- [ ] **Step 2: Write migration 2 (safety-hold expires_at)**

Create `supabase/migrations/20260609100100_safety_holds_expires_at.sql`:
```sql
-- Add expires_at to lit_outreach_safety_holds so operational holds
-- can't silently block production indefinitely. Today's incident:
-- BulkEnrich pause from 19:36 UTC blocked all dispatcher ticks for
-- 4.5h until manual clear. Default backfill = created_at + 24h.

BEGIN;

ALTER TABLE public.lit_outreach_safety_holds
  ADD COLUMN IF NOT EXISTS expires_at timestamptz;

COMMENT ON COLUMN public.lit_outreach_safety_holds.expires_at IS
  'Optional auto-expire timestamp. NULL = no auto-expire. Dispatcher treats holds as cleared once expires_at < now().';

UPDATE public.lit_outreach_safety_holds
   SET expires_at = created_at + interval '24 hours'
 WHERE cleared_at IS NULL AND expires_at IS NULL;

COMMIT;
```

- [ ] **Step 3: Apply both via Supabase MCP**

Use `mcp__claude_ai_Supabase__apply_migration` for each:
- `name: 20260609100000_consent_source_legacy_pre_wire`
- `name: 20260609100100_safety_holds_expires_at`

- [ ] **Step 4: Verify**

```sql
-- Verify constraint accepts new value
INSERT INTO public.lit_recipient_consent
  (recipient_email, org_id, attested_by_user_id, source)
SELECT 'constraint-test@example.com',
       (SELECT id FROM public.organizations LIMIT 1),
       (SELECT id FROM auth.users LIMIT 1),
       'legacy_pre_consent_wire'
ON CONFLICT DO NOTHING;
SELECT count(*) AS legacy_test_rows FROM public.lit_recipient_consent
 WHERE source = 'legacy_pre_consent_wire';
-- Cleanup test row
DELETE FROM public.lit_recipient_consent WHERE recipient_email = 'constraint-test@example.com';

-- Verify expires_at exists + backfill
SELECT column_name FROM information_schema.columns
 WHERE table_schema='public' AND table_name='lit_outreach_safety_holds' AND column_name='expires_at';
SELECT count(*) FILTER (WHERE expires_at IS NOT NULL) AS with_expiry,
       count(*) AS total
  FROM public.lit_outreach_safety_holds WHERE cleared_at IS NULL;
```

Expected: constraint test inserts cleanly; `expires_at` column exists; all uncleared rows now have expires_at populated.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260609100000_consent_source_legacy_pre_wire.sql supabase/migrations/20260609100100_safety_holds_expires_at.sql
git commit -m "feat(compliance): extend consent source + safety_holds expires_at

Migration 1: lit_recipient_consent.source CHECK accepts
'legacy_pre_consent_wire' for dispatcher auto-backfill of recipients
added before the consent capture wire shipped.

Migration 2: lit_outreach_safety_holds gains expires_at column;
existing uncleared rows backfilled to created_at + 24h so the
BulkEnrich-pause-style incident (silent 4.5h block) can't recur."
```

---

## Task 2: `send-campaign-email` — auto-backfill consent + respect expires_at

**File:**
- Modify: `supabase/functions/send-campaign-email/index.ts`

- [ ] **Step 1: Update safety-hold check (lines 219-236) to respect expires_at**

Find the existing safety-hold query block (search for `lit_outreach_safety_holds` near line 219). Replace the SELECT with one that excludes expired holds:
```ts
const { data: holds } = await admin
  .from("lit_outreach_safety_holds")
  .select("id, reason, expires_at")
  .is("cleared_at", null)
  .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
  .limit(1);
```

The rest of the block (the 503 return when holds.length > 0) stays unchanged.

- [ ] **Step 2: Insert consent auto-backfill before the existing consent gate**

Find the existing consent pre-fetch + per-recipient gate (around lines 305-476 — search for `lit_recipients_with_consent` to locate). The pre-fetch populates `consentedEmailSet`. Add the backfill block IMMEDIATELY AFTER the pre-fetch and BEFORE the recipient loop:

```ts
// Auto-backfill consent for legacy recipients added before the consent
// capture wire shipped OR for recipients where the picker upsert
// silently failed. Treats them as grandfathered via source distinct
// from the picker flows so audits can identify them separately.
if (recipientEmails.length > 0 && campaign.org_id && campaign.user_id) {
  const missing = recipientEmails.filter(
    (e: string) => !consentedEmailSet.has(String(e).toLowerCase())
  );
  if (missing.length > 0) {
    const rows = missing.map((email: string) => ({
      recipient_email: String(email).toLowerCase(),
      org_id: campaign.org_id,
      attested_by_user_id: campaign.user_id,
      source: "legacy_pre_consent_wire",
      campaign_id: campaign.id,
    }));
    const { error: backfillErr } = await admin
      .from("lit_recipient_consent")
      .upsert(rows, { onConflict: "recipient_email,org_id", ignoreDuplicates: true });
    if (backfillErr) {
      log.warn("consent_backfill_failed", { err: backfillErr.message, count: rows.length, campaign_id: campaign.id });
    } else {
      log.info("consent_backfill_ok", { count: rows.length, campaign_id: campaign.id });
      for (const r of rows) consentedEmailSet.add(r.recipient_email);
    }
  }
}
```

NOTE: variable names — confirm `admin`, `log`, `campaign.org_id`, `campaign.user_id`, `campaign.id`, `recipientEmails`, `consentedEmailSet` all match what's in scope. If any differ, adapt — do not invent.

- [ ] **Step 3: Deploy via Supabase MCP**

Use `mcp__claude_ai_Supabase__get_edge_function` first to read current `verify_jwt` setting + bundle list of `_shared/*` imports. Then `mcp__claude_ai_Supabase__deploy_edge_function` with all required files. Report old → new version.

- [ ] **Step 4: Smoke-test the auto-backfill via SQL**

```sql
-- Pick a campaign with recipients but no consent rows for those recipients
-- (likely Test Campaign 1 — campaign_id 5249b682-c19b-4fab-847f-0ca8cc86edab)
SELECT cc.email,
       EXISTS (SELECT 1 FROM public.lit_recipient_consent rc
                WHERE rc.org_id = c.org_id
                  AND lower(rc.recipient_email) = lower(cc.email)) AS has_consent
  FROM public.lit_campaign_contacts cc
  JOIN public.lit_campaigns c ON c.id = cc.campaign_id
 WHERE c.id = '5249b682-c19b-4fab-847f-0ca8cc86edab';
-- Expected: has_consent=false for both rows BEFORE next dispatcher tick
-- After next tick, has_consent=true with source='legacy_pre_consent_wire'
```

Trigger the dispatcher manually:
```sql
SELECT net.http_post(
  url := 'https://jkmrfiaefxwgbvftohrb.supabase.co/functions/v1/send-campaign-email',
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'X-Internal-Cron', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'LIT_CRON_SECRET')
  ),
  body := '{}'::jsonb,
  timeout_milliseconds := 60000
) AS request_id;
```

Wait ~5s, then re-check:
```sql
SELECT recipient_email, source FROM public.lit_recipient_consent
 WHERE source = 'legacy_pre_consent_wire' ORDER BY attested_at DESC LIMIT 5;
```

Expected: rows for the test campaign's recipients now appear.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/send-campaign-email/index.ts
git commit -m "feat(compliance): auto-backfill consent + respect safety_hold expires_at

(1) Safety-hold check now treats holds with expires_at in the past
as effectively cleared — closes the silent-503 incident class.

(2) Before the per-recipient consent gate, dispatcher upserts missing
consent rows with source='legacy_pre_consent_wire' for recipients
added before the consent capture wire shipped. Unblocks in-flight
campaigns whose recipients lack attestation rows."
```

---

## Task 3: `send-test-email` writes campaign_id + frontend sends it

**Files:**
- Modify: `supabase/functions/send-test-email/index.ts`
- Modify: `frontend/src/lib/api.ts`
- Modify: `frontend/src/pages/CampaignBuilder.jsx`

- [ ] **Step 1: Update the edge fn to parse and write campaign_id**

Read the current handler:
```bash
sed -n '70,150p' supabase/functions/send-test-email/index.ts
```

Find the body-parsing section (around lines 75-90 per investigation). Add:
```ts
const campaignId = body?.campaign_id ?? body?.campaignId ?? null;
```

Find the `writeHistoryRow` invocation (around line 466 per investigation, after a successful send). Locate the insert that hardcodes `campaign_id: null` at line ~130 inside the helper. Replace with the parsed value — pass it as a parameter to the helper, OR if the helper is called inline, just substitute. Easiest pattern: pass `campaignId` to the helper.

If the helper signature is `function writeHistoryRow(eventType, status, messageId)`, change to `function writeHistoryRow(eventType, status, messageId, campaignId = null)` and update the insert to use the param.

- [ ] **Step 2: Update `sendTestEmail` in `frontend/src/lib/api.ts`**

Find the function (around line 6517). Add `campaignId?: string | null` to its options/args interface. Include `campaign_id: opts.campaignId ?? null` in the request body.

- [ ] **Step 3: Update `handleTestSend` in `frontend/src/pages/CampaignBuilder.jsx`**

Find `handleTestSend` (around line 701 per prior chunks; grep if drifted: `grep -n "handleTestSend" frontend/src/pages/CampaignBuilder.jsx`). Find the `sendTestEmail(...)` call inside. Add `campaignId: editId` to the args.

- [ ] **Step 4: Deploy edge fn via Supabase MCP**

`mcp__claude_ai_Supabase__deploy_edge_function` for `send-test-email`. Preserve verify_jwt. Bundle `_shared/*` imports.

- [ ] **Step 5: Smoke test**

In the LIT app: open a saved campaign → click Test send. Then via SQL:
```sql
SELECT event_type, campaign_id, metadata, created_at
  FROM public.lit_outreach_history
 WHERE event_type = 'test_sent'
 ORDER BY created_at DESC LIMIT 3;
```
Expected: newest row has `campaign_id` populated (matches the editId of the opened campaign).

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/send-test-email/index.ts frontend/src/lib/api.ts frontend/src/pages/CampaignBuilder.jsx
git commit -m "feat(test-send): pipe campaign_id through test_sent history rows

Previously test_sent rows wrote campaign_id=NULL hardcoded — the
nudge persistence query couldn't scope to the current campaign so
it always defaulted to 'not yet tested'. Now the frontend passes
editId on test-send; edge fn parses + writes; subsequent builder
mounts can query for campaign-scoped test history."
```

---

## Task 4: `redirect-click` populates contact_id + recipient_email + company_id

**File:**
- Modify: `supabase/functions/redirect-click/index.ts`

- [ ] **Step 1: Read the current insert**

```bash
sed -n '60,100p' supabase/functions/redirect-click/index.ts
```

Find the insert into `lit_outreach_history` (around line 70-87 per investigation). It currently writes `contact_id: null, company_id: null` and the metadata has `recipient_id` but no `recipient_email`.

- [ ] **Step 2: Add the contact lookup before the insert**

Find where `recipientId` is in scope (the function already has it). Add immediately before the insert:
```ts
let contactId: string | null = null;
let recipientEmail: string | null = null;
let companyId: string | null = null;
if (recipientId) {
  const { data: contact } = await admin
    .from("lit_campaign_contacts")
    .select("id, email, company_id")
    .eq("id", recipientId)
    .maybeSingle();
  if (contact) {
    contactId = contact.id;
    recipientEmail = contact.email;
    companyId = contact.company_id;
  }
}
```

NOTE: `admin` may be named differently in this edge fn. Verify by reading near the top of the file. If the supabase client is named `supabase` or `service`, use that. Don't invent.

- [ ] **Step 3: Use the populated values in the insert**

Modify the existing insert payload — replace `contact_id: null, company_id: null` with the variables. Add `recipient_email` to the metadata:
```ts
{
  // ...existing fields...
  contact_id: contactId,
  company_id: companyId,
  metadata: { ...existing_metadata, recipient_email: recipientEmail },
}
```

If the existing metadata literal is `{ link_id, original_url, recipient_id, ua }`, the new version becomes `{ link_id, original_url, recipient_id, ua, recipient_email: recipientEmail }`.

- [ ] **Step 4: Deploy via Supabase MCP**

`mcp__claude_ai_Supabase__deploy_edge_function` for `redirect-click`. Preserve verify_jwt.

- [ ] **Step 5: Smoke test**

Trigger a click by opening a previously-sent campaign email and clicking its tracked link. Then:
```sql
SELECT contact_id, company_id, metadata->>'recipient_email' AS recipient_email
  FROM public.lit_outreach_history
 WHERE event_type = 'clicked'
 ORDER BY created_at DESC LIMIT 1;
```
Expected: latest row has all three populated (not null).

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/redirect-click/index.ts
git commit -m "fix(analytics): redirect-click populates contact_id + recipient_email

Previously hardcoded contact_id/company_id=null + omitted recipient_email
from metadata. Result: CampaignAnalyticsPage activity feed fell back
to displaying 8-char UUID fragments for click events. Now looks up
the contact from lit_campaign_contacts using recipient_id (already
in scope) and writes all three identifiers."
```

---

## Task 5: CampaignAnalyticsPage label fallback

**File:**
- Modify: `frontend/src/pages/CampaignAnalyticsPage.jsx` (lines 333 + 502)

- [ ] **Step 1: Find both locations**

```bash
grep -n "recipient_email.*recipient_id\|metadata\?\.recipient_email" frontend/src/pages/CampaignAnalyticsPage.jsx
```
Expected: 2 hits — lines 333 and 502 per investigation. Both look like:
```jsx
e.metadata?.recipient_email || e.metadata?.recipient_id?.slice(0, 8) || "—"
```

- [ ] **Step 2: Replace at line 333 and line 502 with the fallback chain**

```jsx
const displayName =
  e.metadata?.recipient_email
  || recipients.find((r) => r.id === e.metadata?.recipient_id)?.email
  || e.metadata?.recipient_id?.slice(0, 8)
  || "—";
```

(Then render `{displayName}` where the inline expression was.)

Verify `recipients` is in scope at both call sites — read 10 lines above each to confirm.

If `recipients` is named differently in scope (e.g. `campaignRecipients`, `contacts`), use that name.

- [ ] **Step 3: TS check**

```bash
cd frontend && npx tsc --noEmit 2>&1 | grep -E "CampaignAnalyticsPage" | head -5
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/CampaignAnalyticsPage.jsx
git commit -m "fix(analytics): resolve recipient_id to email in activity feed label

Falls back through metadata.recipient_email → recipients[].email
lookup → UUID slice. Combined with redirect-click's new payload,
historical click events also become readable via the recipients
array (works pre-redirect-click-deploy)."
```

---

## Task 6: CampaignBuilder rehydrates `hasTestSendOccurred` on mount

**File:**
- Modify: `frontend/src/pages/CampaignBuilder.jsx`

- [ ] **Step 1: Find the existing useEffects near line 362**

```bash
grep -n "useEffect" frontend/src/pages/CampaignBuilder.jsx | head -10
```

Pick a stable location near other campaign-load effects.

- [ ] **Step 2: Add the rehydration effect**

```jsx
// Rehydrate the "you haven't tested this email yet" nudge state
// from DB so it doesn't reset on page reload. Queries test_sent
// events scoped to this campaign (campaign_id is now populated by
// send-test-email per Task 3 of this hotfix plan).
useEffect(() => {
  if (!editId) return;
  let cancelled = false;
  (async () => {
    try {
      const { supabase } = await import("@/lib/supabase");
      const { count } = await supabase
        .from("lit_outreach_history")
        .select("id", { count: "exact", head: true })
        .eq("campaign_id", editId)
        .eq("event_type", "test_sent");
      if (!cancelled && (count ?? 0) > 0) setHasTestSendOccurred(true);
    } catch {
      // Non-fatal — nudge defaults to visible (safer UX: encourages testing)
    }
  })();
  return () => { cancelled = true; };
}, [editId]);
```

Place near the existing useEffect that loads campaign details from `useCampaign(editId)`.

- [ ] **Step 3: TS check**

```bash
cd frontend && npx tsc --noEmit 2>&1 | grep -E "CampaignBuilder" | head -5
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/CampaignBuilder.jsx
git commit -m "fix(campaigns): rehydrate hasTestSendOccurred from DB on builder mount

Per-session local state reset on every page reload — nudge kept
saying 'you haven't tested' even after a test send. Now queries
lit_outreach_history for any test_sent rows scoped to the current
editId; sets state if found. Combined with Task 3's campaign_id
piping, the nudge correctly disappears once the user has actually
tested THIS campaign's email."
```

---

## Task 7: Acceptance verification

**Files:** none — manual checks.

- [ ] **Step 1: Dispatcher unblocked**

```sql
-- Confirm the BulkEnrich hold is still cleared + nothing new active
SELECT count(*) AS active_holds FROM public.lit_outreach_safety_holds
 WHERE cleared_at IS NULL
   AND (expires_at IS NULL OR expires_at > now());
```
Expected: 0 (or only intentional holds).

- [ ] **Step 2: Verify Step 2 of Test Campaign 1 actually sends tomorrow at 13:19 UTC**

```sql
SELECT email, status, next_send_at
  FROM public.lit_campaign_contacts
 WHERE campaign_id = '5249b682-c19b-4fab-847f-0ca8cc86edab';
```
Expected before 13:19 UTC: status=queued, next_send_at in the future.
After 13:19 UTC: status=in_progress or sent.

- [ ] **Step 3: Test the nudge**

In the LIT app:
- Open Test Campaign 1 → "You haven't tested" nudge should be GONE if you've tested before
- Reload page → still gone (rehydrated from DB)
- For a brand new campaign → nudge SHOWS (no test_sent rows yet)
- Click Test send → nudge disappears (state set) and DB now has test_sent with campaign_id

- [ ] **Step 4: Click attribution**

In the LIT app:
- Open `/app/analytics` or wherever CampaignAnalyticsPage renders
- Activity feed for "clicked" rows now shows recipient email (not UUID fragment)

- [ ] **Step 5: Commit acceptance**

```bash
git commit --allow-empty -m "chore(campaigns): round 2 E hotfix acceptance verified

Auto-backfill consent unblocks in-flight campaigns. Safety hold
auto-expire prevents silent-503 incident class. Test-send nudge
persists correctly across reloads. Click attribution readable in
activity feed. Ready for sub-project F (builder polish + drill-in)."
```

---

## Self-Review

**Spec coverage:**

| Spec section | Covered by |
|---|---|
| Fix 1 — Auto-backfill consent on launch | Tasks 1, 2 |
| Fix 2 — Test-send nudge persistence (part A + B) | Tasks 3, 6 |
| Fix 3 — Safety hold auto-expire | Tasks 1, 2 |
| Fix 4 — Click attribution (server + frontend) | Tasks 4, 5 |

No gaps.

**Placeholder scan:** Scanned for "TODO" / "TBD" / "Add appropriate". One acceptance step references `Test Campaign 1` campaign_id — this is a real ID from production, not a placeholder.

**Type consistency:** `legacy_pre_consent_wire` source value consistent between migration (Task 1) + dispatcher backfill (Task 2). `editId` consistent between CampaignBuilder (Tasks 3+6) and sendTestEmail args (Task 3).

---

## Out of scope (deferred to Sub-project F or later)

- Per-recipient click drill-in slide-over (F)
- KPI hero brand colors (F)
- Page overflow architecture fix (F)
- Admin UI for managing/expiring safety holds (separate ticket)
- Historical click backfill to populate contact_id retroactively (separate one-shot SQL)
- Conditional sequences (G — architecture only)
