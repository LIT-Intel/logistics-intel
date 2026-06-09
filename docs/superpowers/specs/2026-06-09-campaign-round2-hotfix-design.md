# Campaign Round 2 — P0 Hotfix Design Spec

**Date:** 2026-06-09
**Sub-project:** E (Round 2 — P0 hotfix)
**Status:** Approved scope, design pending nod
**Lands first because:** restores campaign sending end-to-end for the user who launched today and saw "nothing triggered". Also closes the consent-gate landmine + dispatcher-silently-503 incident class.

---

## Problem

Investigation (agent `a59762ef1841a1072`) confirmed:

1. **"Test Campaign 1" Step 1 actually DID send** (2 sent + 2 clicked at 19:19 UTC). The KPI hero "Sent: 2" was real, not stale. User's mental model "nothing triggered" came from two compounding issues:

2. **🚨 Dispatcher 503'd on every tick since 23:47 UTC** because the BulkEnrich pause `lit_outreach_safety_holds` row from earlier today was never cleared. Commit `61ea3701` wired this kill-switch into `send-campaign-email`. Affected ALL campaigns across ALL orgs. **Resolved at 00:04 UTC** (cleared manually).

3. **🪤 Latent landmine: consent gate will block Step 2 tomorrow.** Zero `lit_recipient_consent` rows exist for the user's org. Either picker drawer's `upsertConsents` silently failed, user didn't check the consent box, or recipients were added before the consent wire shipped. Step 2 fires tomorrow 13:19 UTC and will skip everything with `event_type='consent_missing'`.

4. **Test-send nudge persists incorrectly** (investigation `ab8f93341f7fe2fe3`). `hasTestSendOccurred` is local React state — resets on page reload. `test_sent` events ARE written to `lit_outreach_history` (38 rows) BUT with hardcoded `campaign_id=NULL` at `send-test-email/index.ts:130` — so they can't be queried per-campaign.

5. **Click attribution shows UUID fragments** (investigation `ae42cea2a76d58711`). `redirect-click` writes `metadata.recipient_id` but NOT `contact_id`/`recipient_email`. CampaignAnalyticsPage falls back to displaying useless 8-char UUID fragments instead of names.

---

## Architecture

### Fix 1 — Auto-backfill consent on launch (per AskUserQuestion answer)

When a user clicks Launch, dispatcher (or a frontend pre-flight check) inserts missing `lit_recipient_consent` rows for that campaign's recipients with `source='legacy_pre_consent_wire'`. Treats pre-wire recipients as grandfathered. Per-campaign attestation still required for NEW additions via the picker drawer.

**Implementation site**: `supabase/functions/send-campaign-email/index.ts` — at the top of the recipient loop, before the consent gate at line ~433, run a single upsert to auto-attest any recipient that lacks a row:

```ts
// Auto-backfill consent for legacy recipients added before consent wire
// shipped OR for recipients where the picker upsert silently failed.
// Treats them as grandfathered; new additions still go through the
// picker's attestation flow. Source is distinct so admin-level audits
// can identify backfilled rows separately.
if (recipientEmails.length > 0 && campaign.org_id && campaign.user_id) {
  const missing = recipientEmails.filter(
    (e) => !consentedEmailSet.has(String(e).toLowerCase())
  );
  if (missing.length > 0) {
    const rows = missing.map((email) => ({
      recipient_email: String(email).toLowerCase(),
      org_id: campaign.org_id,
      attested_by_user_id: campaign.user_id,
      source: "legacy_pre_consent_wire",
      campaign_id: campaign.id,
    }));
    const { error } = await admin
      .from("lit_recipient_consent")
      .upsert(rows, { onConflict: "recipient_email,org_id", ignoreDuplicates: true });
    if (!error) {
      // Re-fetch the consented set so the per-recipient check below passes
      for (const r of rows) consentedEmailSet.add(r.recipient_email);
    }
  }
}
```

Also extend the `lit_recipient_consent.source` CHECK constraint to accept `'legacy_pre_consent_wire'`:

```sql
ALTER TABLE public.lit_recipient_consent DROP CONSTRAINT IF EXISTS lit_recipient_consent_source_check;
ALTER TABLE public.lit_recipient_consent ADD CONSTRAINT lit_recipient_consent_source_check
  CHECK (source IN ('saved_company_picker', 'manual_email_tab', 'csv_upload', 'crm_sync', 'legacy_pre_consent_wire'));
```

### Fix 2 — Test-send nudge persistence (Issue #1)

Two-part fix:

**Part A — Pipe `campaign_id` through the test-send flow** (currently hardcoded NULL):
- `frontend/src/pages/CampaignBuilder.jsx:799` — pass `editId` as a new arg to `handleTestSend`
- `frontend/src/lib/api.ts:6517-6539` (sendTestEmail function) — add `campaignId?: string` param, include in request body
- `supabase/functions/send-test-email/index.ts:75-90` — parse `campaign_id` from request body
- `supabase/functions/send-test-email/index.ts:128-142` (writeHistoryRow helper invoke) — replace hardcoded `campaign_id: null` with the parsed value

**Part B — Rehydrate `hasTestSendOccurred` on builder mount**:
Add a new `useEffect` to `CampaignBuilder.jsx` next to existing campaign-load effects (~line 362):

```ts
useEffect(() => {
  if (!editId) return;
  let cancelled = false;
  (async () => {
    const { count } = await supabase
      .from("lit_outreach_history")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", editId)
      .eq("event_type", "test_sent");
    if (!cancelled && (count ?? 0) > 0) setHasTestSendOccurred(true);
  })();
  return () => { cancelled = true; };
}, [editId]);
```

Historical `test_sent` rows with `campaign_id=NULL` won't be matched — acceptable degradation. Going forward, all new test_sent events get scoped properly.

### Fix 3 — Safety hold auto-expire (long-term incident prevention)

The BulkEnrich hold silently blocked production for ~4.5 hours because it was created without an expiration. Add an auto-expire column to prevent this class of incident from happening again:

```sql
ALTER TABLE public.lit_outreach_safety_holds
  ADD COLUMN IF NOT EXISTS expires_at timestamptz;
COMMENT ON COLUMN public.lit_outreach_safety_holds.expires_at IS
  'Optional auto-expire timestamp. NULL = no auto-expire. Dispatcher treats holds as cleared once expires_at < now().';
```

Backfill: existing uncleared rows get `expires_at = created_at + interval '24 hours'`:
```sql
UPDATE public.lit_outreach_safety_holds
   SET expires_at = created_at + interval '24 hours'
 WHERE cleared_at IS NULL AND expires_at IS NULL;
```

Update `send-campaign-email/index.ts` (lines 219-236) — the safety-hold check should treat `expires_at < now()` as "effectively cleared":

```ts
// Replace existing query with one that also respects expires_at:
const { data: holds } = await admin
  .from("lit_outreach_safety_holds")
  .select("id, reason, expires_at")
  .is("cleared_at", null)
  .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
  .limit(1);

if (holds && holds.length > 0) {
  // existing 503 return
}
```

Also surface uncleared holds prominently in `/app/admin` for visibility. Out-of-scope for this hotfix but flagged as a separate ticket.

### Fix 4 — Click attribution: populate `contact_id` + `recipient_email` on click (Issue #5 quick win)

**Server-side fix** at `supabase/functions/redirect-click/index.ts:70-87`. The function already has `recipient_id` in scope. One line to look up the email + contact_id from `lit_campaign_contacts`:

```ts
// Before the insert into lit_outreach_history, fetch the contact context
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

// Then in the insert payload, replace the hardcoded nulls:
{
  contact_id: contactId,
  company_id: companyId,
  metadata: { ...existing, recipient_email: recipientEmail },
  // ...rest
}
```

**Frontend label fix** at `frontend/src/pages/CampaignAnalyticsPage.jsx:333, 502`. Resolve `recipient_id` to a display name via the already-loaded `recipients` array before falling back to UUID slice:

```tsx
const displayName = e.metadata?.recipient_email
  || recipients.find((r) => r.id === e.metadata?.recipient_id)?.email
  || e.metadata?.recipient_id?.slice(0, 8)
  || "—";
```

(Full per-recipient drill-in slide-over is scoped to Sub-project F — this is the cheap immediate readability win.)

---

## Components (files to touch)

| File | Change |
|---|---|
| `supabase/migrations/20260609100000_consent_source_legacy_pre_wire.sql` | NEW — extend source CHECK constraint |
| `supabase/migrations/20260609100100_safety_holds_expires_at.sql` | NEW — add `expires_at` column + backfill |
| `supabase/functions/send-campaign-email/index.ts` | (a) safety-hold check respects `expires_at`, (b) auto-backfill consent block before the gate |
| `supabase/functions/send-test-email/index.ts` | Parse `campaign_id` from body; write it (replace hardcoded NULL) |
| `supabase/functions/redirect-click/index.ts` | Look up contact_id + email + company_id from `lit_campaign_contacts` before insert |
| `frontend/src/lib/api.ts` | `sendTestEmail` accepts + sends `campaignId` |
| `frontend/src/pages/CampaignBuilder.jsx` | Pass editId to `handleTestSend`; add useEffect to rehydrate `hasTestSendOccurred` from DB on mount |
| `frontend/src/pages/CampaignAnalyticsPage.jsx` | Recipient label fallback chain (lines 333, 502) |

---

## Data flow

**Launch path** (new):
1. User clicks Launch → cron picks up `lit_campaign_contacts` with `next_send_at <= now()`
2. Dispatcher runs safety-hold check (now respects `expires_at`)
3. Dispatcher pre-fetches consented emails for this campaign's org
4. **NEW**: dispatcher upserts missing consent rows for this batch's recipients with `source='legacy_pre_consent_wire'` (only for recipients NOT already in the consented set)
5. Dispatcher re-validates each recipient → consent check passes for all → suppression check → send

**Test-send path** (new):
1. User clicks Test send → frontend calls `sendTestEmail({ campaignId, ... })`
2. Edge fn parses `campaign_id` from body; writes `test_sent` event with that ID (not null)
3. On next campaign builder mount, useEffect queries `lit_outreach_history` for `event_type='test_sent' AND campaign_id=editId`
4. Hydrates `hasTestSendOccurred=true` → nudge disappears

**Click attribution path** (new):
1. Recipient clicks link → `redirect-click` looks up contact context, writes `lit_outreach_history` with `contact_id, company_id, metadata.recipient_email` populated
2. CampaignAnalyticsPage activity feed renders the email (not UUID fragment)
3. Existing UI surfaces become usable; full slide-over drill-in still TBD in Sub-project F

---

## Error handling + edge cases

| Case | Behavior |
|---|---|
| Auto-backfill upsert fails (DB error) | Log warning; per-recipient consent check still runs against the original `consentedEmailSet` (without backfill). Recipient gets `consent_missing` skip — preserves Google compliance posture |
| Recipient added to `lit_campaign_contacts` but never has a `recipient_id` in any history | Contact lookup returns null; click event still writes with `contact_id=null` (matches old behavior, no regression) |
| Test-send event written with `campaign_id=null` (historical 38 rows) | Won't match the new useEffect query; nudge stays visible. Acceptable — those are historical and unscoped |
| Safety hold with `expires_at IN past` | Dispatcher treats as cleared; processes normally. No bypass path for unexpired holds — security boundary intact |
| `legacy_pre_consent_wire` source added to many recipients silently | Audit query surface for admin: `SELECT count(*) FILTER (WHERE source='legacy_pre_consent_wire') AS grandfathered FROM lit_recipient_consent;` — quick health check |

---

## Testing

| Test | Scope |
|---|---|
| Migration extends CHECK constraint without breaking existing rows | SQL audit |
| Migration adds `expires_at` + backfills uncleared holds | SQL audit |
| Dispatcher auto-backfill creates legacy_pre_consent_wire rows | Integration test: insert recipient without consent, trigger dispatcher, verify row exists after |
| Dispatcher respects `expires_at` on safety holds | Insert expired hold; verify dispatcher proceeds |
| `send-test-email` writes test_sent with campaign_id populated | Deno test invoke with campaign_id in body, verify DB row |
| `useEffect` rehydrates nudge from DB | Vitest mock: query returns count > 0, verify state set to true |
| `redirect-click` writes contact_id + recipient_email | Integration: hit redirect URL for known recipient_id, verify row populated |
| CampaignAnalyticsPage shows email (not UUID) | Component test with mock event row + recipients array |

---

## Out of scope

- Full per-recipient drill-in slide-over (Sub-project F)
- KPI hero brand colors (Sub-project F)
- Page overflow architecture fix (Sub-project F)
- Conditional sequences (Sub-project G — spec only)
- Admin UI for managing safety holds (separate ticket)
- Backfill of historical clicks to populate contact_id retroactively (one-shot SQL — can run later if desired)
