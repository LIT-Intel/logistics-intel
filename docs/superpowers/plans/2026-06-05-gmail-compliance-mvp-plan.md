# Gmail Compliance MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the minimum-viable Gmail compliance set — consent attestation, per-mailbox daily cap, sender-guidelines education, test account — so we can resubmit LIT to Google Gmail API verification within 48 hours.

**Architecture:** New `lit_recipient_consent` table records explicit per-recipient consent. Audience picker drawer requires a consent checkbox before Confirm; on confirm, client upserts one row per recipient. The `send-campaign-email` dispatcher gates each send on `(consent exists for recipient+org)` AND `(mailbox daily count < 50)`; failures defer or log and skip. Plus a small UI note linking Google's Email Sender Guidelines + an ops doc with a test account walkthrough for the Google reviewer.

**Tech Stack:** Postgres (RLS), Deno edge functions (`send-campaign-email`), React + TypeScript, Vitest + RTL, Tailwind, lucide-react.

**Branch:** `claude/review-dashboard-deploy-3AmMD`.

**Spec:** [docs/superpowers/specs/2026-06-05-gmail-compliance-mvp-design.md](../specs/2026-06-05-gmail-compliance-mvp-design.md)

**Depends on:** Sub-project A's `lit_campaigns.org_id` column already landed (commits `4876ad59`/`423690f4`/`0229b9f7`/`15d59d5b`) — needed for the RLS predicate on `lit_recipient_consent`. ✅ available.

---

## File Structure

### Files to create

| Path | Responsibility |
|---|---|
| `supabase/migrations/20260605150000_lit_recipient_consent.sql` | Consent table + RLS + index + helper RPC |
| `frontend/src/features/outbound/api/recipientConsent.ts` | Typed client: `upsertConsents()`, `lookupConsents()` |
| `frontend/src/features/outbound/api/__tests__/recipientConsent.test.ts` | Unit tests |
| `frontend/src/features/outbound/components/ConsentAttestationCheckbox.tsx` | Required checkbox with sender-guidelines link |
| `frontend/src/features/outbound/components/__tests__/ConsentAttestationCheckbox.test.tsx` | Component tests |
| `frontend/src/features/outbound/components/SenderGuidelinesNote.tsx` | Inline note near Launch button |
| `docs/ops/google-gmail-verification-test-account.md` | Reviewer walkthrough + credentials placeholder |

### Files to modify

| Path | Change |
|---|---|
| `frontend/src/features/outbound/components/AudiencePickerDrawer.tsx` (~lines 640-650) | Mount `ConsentAttestationCheckbox`; gate Confirm button; upsert consent on confirm |
| `frontend/src/pages/CampaignBuilder.jsx` | Mount `SenderGuidelinesNote` in the launch button area |
| `supabase/functions/send-campaign-email/index.ts` (~line 286 — the recipient loop) | Add consent check + daily-cap check before each send; log `consent_missing` or `daily_cap_reached` to `lit_outreach_history` |

---

## Task 1: Create `lit_recipient_consent` table + RLS + helper RPC

**Files:**
- Create: `supabase/migrations/20260605150000_lit_recipient_consent.sql`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260605150000_lit_recipient_consent.sql`:

```sql
-- 20260605150000_lit_recipient_consent.sql
-- Per-recipient consent attestation for Gmail API compliance.
-- Records the user (attested_by_user_id) who confirmed that a given
-- recipient consented to receive commercial email from their org.
-- Required by Google's Workspace API user-data policy for re-verification.

BEGIN;

CREATE TABLE IF NOT EXISTS public.lit_recipient_consent (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_email text NOT NULL,
  org_id uuid NOT NULL REFERENCES public.organizations(id),
  attested_by_user_id uuid NOT NULL REFERENCES auth.users(id),
  attested_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL CHECK (source IN ('saved_company_picker', 'manual_email_tab', 'csv_upload', 'crm_sync')),
  campaign_id uuid REFERENCES public.lit_campaigns(id) ON DELETE SET NULL,
  notes text,
  UNIQUE (recipient_email, org_id)
);

CREATE INDEX IF NOT EXISTS lit_recipient_consent_email_idx
  ON public.lit_recipient_consent(lower(recipient_email));
CREATE INDEX IF NOT EXISTS lit_recipient_consent_org_id_idx
  ON public.lit_recipient_consent(org_id);

ALTER TABLE public.lit_recipient_consent ENABLE ROW LEVEL SECURITY;

-- SELECT: any active org member OR platform admin (matches lit_campaigns pattern)
CREATE POLICY lit_recipient_consent_select ON public.lit_recipient_consent
  FOR SELECT USING (
    org_id IN (
      SELECT om.org_id FROM public.org_members om
       WHERE om.user_id = auth.uid() AND om.status = 'active'
    )
    OR EXISTS (
      SELECT 1 FROM public.platform_admins pa WHERE pa.user_id = auth.uid()
    )
  );

-- INSERT: caller must be an active org member; attested_by_user_id must be them
CREATE POLICY lit_recipient_consent_insert ON public.lit_recipient_consent
  FOR INSERT WITH CHECK (
    auth.uid() = attested_by_user_id
    AND org_id IN (
      SELECT om.org_id FROM public.org_members om
       WHERE om.user_id = auth.uid() AND om.status = 'active'
    )
  );

-- Helper RPC for the dispatcher: returns the set of recipient_emails (lowercased)
-- that have consent for a given org. SECURITY DEFINER because the dispatcher runs
-- as service role and needs to bypass the user-scoped RLS.
CREATE OR REPLACE FUNCTION public.lit_recipients_with_consent(
  p_org_id uuid,
  p_emails text[]
) RETURNS TABLE (recipient_email text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT DISTINCT lower(c.recipient_email)
    FROM public.lit_recipient_consent c
   WHERE c.org_id = p_org_id
     AND lower(c.recipient_email) = ANY(SELECT lower(unnest(p_emails)));
$function$;

GRANT EXECUTE ON FUNCTION public.lit_recipients_with_consent(uuid, text[]) TO service_role;

COMMIT;
```

- [ ] **Step 2: Apply via Supabase MCP**

Use `mcp__claude_ai_Supabase__apply_migration` with `project_id: jkmrfiaefxwgbvftohrb`, `name: 20260605150000_lit_recipient_consent`.

- [ ] **Step 3: Verify the table + policies exist**

```sql
SELECT column_name, is_nullable, data_type
  FROM information_schema.columns
 WHERE table_schema='public' AND table_name='lit_recipient_consent'
 ORDER BY ordinal_position;
-- Expected: 8 columns (id, recipient_email, org_id, attested_by_user_id, attested_at, source, campaign_id, notes)

SELECT polname, polcmd FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
 WHERE c.relname = 'lit_recipient_consent' ORDER BY polname;
-- Expected: lit_recipient_consent_insert, lit_recipient_consent_select

SELECT proname FROM pg_proc WHERE proname = 'lit_recipients_with_consent';
-- Expected: 1 row
```

- [ ] **Step 4: Smoke-test the RPC**

```sql
SELECT * FROM public.lit_recipients_with_consent(
  (SELECT id FROM public.organizations LIMIT 1),
  ARRAY['anybody@example.com']
);
-- Expected: 0 rows (no consent attested yet)
```

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260605150000_lit_recipient_consent.sql
git commit -m "feat(compliance): add lit_recipient_consent table + RLS + helper RPC

Per-recipient consent attestation required by Google Gmail API policy.
Unique (recipient_email, org_id) so one attestation per recipient per
org. Org-scoped RLS matches lit_campaigns pattern. SECURITY DEFINER
helper RPC lit_recipients_with_consent for the dispatcher's batch
consent-existence check."
```

---

## Task 2: Typed `recipientConsent` client

**Files:**
- Create: `frontend/src/features/outbound/api/recipientConsent.ts`
- Create: `frontend/src/features/outbound/api/__tests__/recipientConsent.test.ts`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/features/outbound/api/__tests__/recipientConsent.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const insertSpy = vi.fn().mockResolvedValue({ data: null, error: null });
const fromSpy = vi.fn(() => ({ insert: insertSpy, upsert: insertSpy }));

vi.mock("@/lib/supabaseClient", () => ({
  supabase: { from: fromSpy },
}));

import { upsertConsents } from "../recipientConsent";

describe("upsertConsents", () => {
  beforeEach(() => {
    insertSpy.mockClear();
    fromSpy.mockClear();
  });

  it("upserts one row per email with the given source + attester", async () => {
    await upsertConsents({
      emails: ["a@example.com", "b@example.com"],
      orgId: "org-1",
      attestedByUserId: "user-1",
      source: "manual_email_tab",
      campaignId: "camp-1",
    });
    expect(fromSpy).toHaveBeenCalledWith("lit_recipient_consent");
    const rows = insertSpy.mock.calls[0][0];
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      recipient_email: "a@example.com",
      org_id: "org-1",
      attested_by_user_id: "user-1",
      source: "manual_email_tab",
      campaign_id: "camp-1",
    });
  });

  it("lowercases recipient_email on upsert", async () => {
    await upsertConsents({
      emails: ["ALICE@EXAMPLE.COM"],
      orgId: "org-1",
      attestedByUserId: "user-1",
      source: "manual_email_tab",
    });
    const rows = insertSpy.mock.calls[0][0];
    expect(rows[0].recipient_email).toBe("alice@example.com");
  });

  it("returns early when emails array is empty (no query fired)", async () => {
    await upsertConsents({
      emails: [],
      orgId: "org-1",
      attestedByUserId: "user-1",
      source: "manual_email_tab",
    });
    expect(fromSpy).not.toHaveBeenCalled();
  });

  it("dedupes emails (case-insensitive) before upsert", async () => {
    await upsertConsents({
      emails: ["a@x.com", "A@X.COM", "b@x.com"],
      orgId: "org-1",
      attestedByUserId: "user-1",
      source: "manual_email_tab",
    });
    const rows = insertSpy.mock.calls[0][0];
    expect(rows).toHaveLength(2);
    expect(rows.map((r: any) => r.recipient_email)).toEqual(["a@x.com", "b@x.com"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd frontend && npx vitest run src/features/outbound/api/__tests__/recipientConsent.test.ts
```

Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement the client**

Create `frontend/src/features/outbound/api/recipientConsent.ts`:

```ts
/**
 * Typed client for the lit_recipient_consent table.
 * Used by the audience picker drawer to record an attestation that
 * each recipient consented to receive commercial mail. Required by
 * Google's Gmail API user-data policy.
 */
import { supabase } from "@/lib/supabaseClient";

export type ConsentSource =
  | "saved_company_picker"
  | "manual_email_tab"
  | "csv_upload"
  | "crm_sync";

interface UpsertConsentsArgs {
  emails: string[];
  orgId: string;
  attestedByUserId: string;
  source: ConsentSource;
  campaignId?: string | null;
}

/**
 * Upsert one consent row per recipient email. Deduplicates the input
 * array case-insensitively before writing. ON CONFLICT (email, org)
 * DO NOTHING — first attestation wins; we don't overwrite source or
 * attester on re-attestation.
 */
export async function upsertConsents(args: UpsertConsentsArgs): Promise<void> {
  if (!args.emails.length) return;

  const seen = new Set<string>();
  const rows: Array<{
    recipient_email: string;
    org_id: string;
    attested_by_user_id: string;
    source: ConsentSource;
    campaign_id: string | null;
  }> = [];

  for (const raw of args.emails) {
    const lower = raw.toLowerCase().trim();
    if (!lower || seen.has(lower)) continue;
    seen.add(lower);
    rows.push({
      recipient_email: lower,
      org_id: args.orgId,
      attested_by_user_id: args.attestedByUserId,
      source: args.source,
      campaign_id: args.campaignId ?? null,
    });
  }

  if (!rows.length) return;

  // Use insert with ignoreDuplicates pattern via upsert + onConflict
  const { error } = await supabase
    .from("lit_recipient_consent")
    .upsert(rows, { onConflict: "recipient_email,org_id", ignoreDuplicates: true });
  if (error) {
    console.warn("[recipientConsent] upsert failed:", error.message);
    throw new Error(`Consent upsert failed: ${error.message}`);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd frontend && npx vitest run src/features/outbound/api/__tests__/recipientConsent.test.ts
```

Expected: all 4 cases PASS. NOTE: the test mocks `from(...)` returning `{ insert, upsert }`; the implementation uses `upsert`. Both spies point to the same mock so the test passes regardless of which method the implementation calls.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/outbound/api/recipientConsent.ts frontend/src/features/outbound/api/__tests__/recipientConsent.test.ts
git commit -m "feat(compliance): typed recipientConsent client with dedupe + lowercase

upsertConsents() batches one row per (email, org) into
lit_recipient_consent. Lowercases + dedupes input. Empty array is a
no-op (no query). ON CONFLICT DO NOTHING preserves first attestation.
4 Vitest cases."
```

---

## Task 3: `ConsentAttestationCheckbox` component

**Files:**
- Create: `frontend/src/features/outbound/components/ConsentAttestationCheckbox.tsx`
- Create: `frontend/src/features/outbound/components/__tests__/ConsentAttestationCheckbox.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/features/outbound/components/__tests__/ConsentAttestationCheckbox.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ConsentAttestationCheckbox } from "../ConsentAttestationCheckbox";

describe("ConsentAttestationCheckbox", () => {
  it("renders the attestation text + sender-guidelines link", () => {
    render(<ConsentAttestationCheckbox checked={false} onChange={() => {}} />);
    expect(screen.getByText(/consented to receive/i)).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /sender guidelines/i });
    expect(link).toHaveAttribute("href", expect.stringContaining("google.com"));
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("calls onChange(true) when checkbox toggled on", () => {
    const onChange = vi.fn();
    render(<ConsentAttestationCheckbox checked={false} onChange={onChange} />);
    fireEvent.click(screen.getByRole("checkbox"));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("calls onChange(false) when checkbox toggled off", () => {
    const onChange = vi.fn();
    render(<ConsentAttestationCheckbox checked={true} onChange={onChange} />);
    fireEvent.click(screen.getByRole("checkbox"));
    expect(onChange).toHaveBeenCalledWith(false);
  });

  it("renders as checked when checked prop is true", () => {
    render(<ConsentAttestationCheckbox checked={true} onChange={() => {}} />);
    expect(screen.getByRole("checkbox")).toBeChecked();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd frontend && npx vitest run src/features/outbound/components/__tests__/ConsentAttestationCheckbox.test.tsx
```

Expected: FAIL — component doesn't exist.

- [ ] **Step 3: Implement the component**

Create `frontend/src/features/outbound/components/ConsentAttestationCheckbox.tsx`:

```tsx
/**
 * Required attestation checkbox for the audience picker.
 * User must affirm that recipients consented to receive commercial
 * mail before the Confirm button unlocks. Captures the attestation
 * fresh per picker confirm so the affirmation is auditable per
 * session (per Google compliance spec).
 */
import { ExternalLink } from "lucide-react";

interface Props {
  checked: boolean;
  onChange: (next: boolean) => void;
}

const SENDER_GUIDELINES_URL = "https://support.google.com/mail/answer/81126";

export function ConsentAttestationCheckbox({ checked, onChange }: Props) {
  return (
    <label className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-[12px] leading-snug text-amber-900">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-amber-600"
      />
      <span>
        I confirm these recipients have consented to receive commercial email
        from my organization (e.g., opted in via form, existing business
        relationship, or written consent).{" "}
        <a
          href={SENDER_GUIDELINES_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-0.5 font-semibold underline hover:text-amber-700"
        >
          Sender guidelines
          <ExternalLink className="h-2.5 w-2.5" />
        </a>
      </span>
    </label>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd frontend && npx vitest run src/features/outbound/components/__tests__/ConsentAttestationCheckbox.test.tsx
```

Expected: all 4 cases PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/outbound/components/ConsentAttestationCheckbox.tsx frontend/src/features/outbound/components/__tests__/ConsentAttestationCheckbox.test.tsx
git commit -m "feat(compliance): ConsentAttestationCheckbox for picker drawer

Amber-toned required checkbox with link to Google Email Sender
Guidelines. Controlled component — parent owns the checked state
and uses it to gate the Confirm button. 4 RTL cases."
```

---

## Task 4: Mount `ConsentAttestationCheckbox` in `AudiencePickerDrawer` + gate Confirm + upsert on confirm

**Files:**
- Modify: `frontend/src/features/outbound/components/AudiencePickerDrawer.tsx` (around lines 640-650 — Confirm button area)

- [ ] **Step 1: Inspect the current Confirm button + onConfirm handler**

```bash
grep -n "onConfirm\|onConfirmAudience\|setAudienceOpen(false)\|Confirm\|totalEmailable" frontend/src/features/outbound/components/AudiencePickerDrawer.tsx | head -20
```

Locate the Confirm button JSX (likely around line 640-650) and its onClick handler — that handler closes the drawer + commits the selection upstream.

- [ ] **Step 2: Add consent state + checkbox to the drawer**

Edit `frontend/src/features/outbound/components/AudiencePickerDrawer.tsx`. Near the top of the component body (with other `useState`s), add:

```tsx
const [consentAttested, setConsentAttested] = useState(false);
```

In the drawer footer (just above the Confirm button — look for the existing `{totalEmailable} email{totalEmailable === 1 ? "" : "s"} will be queued` line), insert:

```tsx
<div className="mb-2">
  <ConsentAttestationCheckbox
    checked={consentAttested}
    onChange={setConsentAttested}
  />
</div>
```

And the matching import at the top of the file:

```tsx
import { ConsentAttestationCheckbox } from "./ConsentAttestationCheckbox";
import { upsertConsents } from "../api/recipientConsent";
import { useAuth } from "@/auth/AuthProvider";
import { useEntitlements } from "@/hooks/useEntitlements";
```

- [ ] **Step 3: Gate the Confirm button on `consentAttested`**

Find the Confirm button. Add `consentAttested` to its `disabled` condition:

```tsx
<button
  type="button"
  onClick={handleConfirm}
  disabled={!consentAttested || totalEmailable === 0 || /* ...existing conditions */}
  title={
    !consentAttested
      ? "Check the consent box to confirm these recipients opted in."
      : totalEmailable === 0
        ? "Select at least one recipient."
        : "Add selected recipients to the campaign."
  }
  // ...existing className
>
  Confirm
</button>
```

(The exact existing condition may differ — keep all existing checks AND add `!consentAttested`.)

- [ ] **Step 4: Upsert consent rows in the `handleConfirm` handler**

Locate the existing confirm handler (likely named `handleConfirm` or inline `onClick`). Before it calls the parent's `onConfirm` / closes the drawer, add the upsert:

```tsx
const { user } = useAuth();
const { entitlements } = useEntitlements();

const handleConfirm = useCallback(async () => {
  const orgId = (entitlements as any)?.org_id ?? (entitlements as any)?.orgId;
  if (!orgId || !user?.id) {
    console.warn("[picker] Cannot record consent without org/user context");
    return;
  }

  // Collect ALL emails being attested: enriched contacts from selected
  // companies AND raw manual emails. Saved-company path emits each
  // contact's email; manual tab emits the typed strings.
  const companyEmails: string[] = [];
  // (Adapt: walk selectedCompanies → contacts → email; pattern exists
  // already in the parent component when building the send payload.)
  // Manual emails (already typed):
  const manualEmailStrings = manualEmails.map((m: any) => m.email).filter(Boolean);

  try {
    if (companyEmails.length > 0) {
      await upsertConsents({
        emails: companyEmails,
        orgId,
        attestedByUserId: user.id,
        source: "saved_company_picker",
        campaignId: campaignId ?? null,
      });
    }
    if (manualEmailStrings.length > 0) {
      await upsertConsents({
        emails: manualEmailStrings,
        orgId,
        attestedByUserId: user.id,
        source: "manual_email_tab",
        campaignId: campaignId ?? null,
      });
    }
  } catch (e) {
    console.warn("[picker] consent upsert failed:", e);
    // Continue — the dispatcher will skip un-consented recipients server-side
    // as a defense in depth.
  }

  // Existing confirm logic (preserve verbatim) — e.g.
  // onConfirm?.({ companies: selectedIds, manualEmails });
  // setAudienceOpen(false);
}, [user, entitlements, manualEmails, /* + existing deps */, campaignId]);
```

NOTE: the `companyEmails` collection depends on the existing component's shape (how it derives contact emails from selectedCompanies). If the existing onConfirm already builds a `recipients` array with `.email` fields, reuse that — collect the emails from there instead of re-walking. The key invariant: every email that will be sent to MUST get a consent row.

NOTE 2: `campaignId` may or may not be a prop on this drawer. If it's not passed in, accept it as a new prop in the interface and pass it from `CampaignBuilder.jsx`'s mount site.

- [ ] **Step 5: Visual + behavioral smoke test**

```bash
cd frontend && npm run dev
```

Open a new campaign → Pick Recipients drawer. Expected:
- Amber checkbox visible above Confirm button
- Confirm button disabled until checkbox checked
- Tooltip on disabled Confirm: "Check the consent box to confirm these recipients opted in."
- Add 1-2 manual emails, check the box → Confirm enables → click → drawer closes + (verify in DB):

```sql
SELECT recipient_email, source, attested_by_user_id, attested_at
  FROM public.lit_recipient_consent ORDER BY attested_at DESC LIMIT 5;
```

Expected: 1-2 fresh rows with `source='manual_email_tab'` and `attested_by_user_id` matching the current user.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/features/outbound/components/AudiencePickerDrawer.tsx
git commit -m "feat(compliance): consent checkbox gates picker Confirm + upserts on confirm

Required amber checkbox renders above Confirm; button disabled until
checked. On confirm, upserts one consent row per recipient (saved-
company tab → source='saved_company_picker'; manual tab →
'manual_email_tab'). Upsert failure is logged but non-fatal — the
dispatcher's server-side check is the security boundary."
```

---

## Task 5: `SenderGuidelinesNote` component + mount in CampaignBuilder

**Files:**
- Create: `frontend/src/features/outbound/components/SenderGuidelinesNote.tsx`
- Modify: `frontend/src/pages/CampaignBuilder.jsx` (near Launch button)

- [ ] **Step 1: Write the component**

Create `frontend/src/features/outbound/components/SenderGuidelinesNote.tsx`:

```tsx
/**
 * Inline reminder rendered near the Launch button. Explains the
 * 50/day-per-mailbox cap and links to Google's Email Sender Guidelines
 * so users understand why the cap exists. Required UX surface for
 * Google's Gmail API verification re-review.
 */
import { Info, ExternalLink } from "lucide-react";

const SENDER_GUIDELINES_URL = "https://support.google.com/mail/answer/81126";

export function SenderGuidelinesNote() {
  return (
    <div className="inline-flex items-center gap-1.5 rounded-md bg-slate-50 px-2 py-1 text-[10.5px] text-slate-600">
      <Info className="h-3 w-3 text-slate-400" />
      <span>
        Sends capped at 50/day per mailbox to protect deliverability.{" "}
        <a
          href={SENDER_GUIDELINES_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-0.5 font-semibold underline hover:text-slate-800"
        >
          Sender guidelines
          <ExternalLink className="h-2.5 w-2.5" />
        </a>
      </span>
    </div>
  );
}
```

- [ ] **Step 2: Mount in CampaignBuilder near the Launch button**

Edit `frontend/src/pages/CampaignBuilder.jsx`. Add import (near line 28):

```jsx
import { SenderGuidelinesNote } from "@/features/outbound/components/SenderGuidelinesNote";
```

Find the Launch button (around line 1005-1025 — the `<button onClick={handleLaunch}>` block — see existing CampaignBuilder map from plan C). Immediately AFTER the closing `</button>` of Launch and before the closing `</div>` of the button cluster at line 1026, insert:

```jsx
<SenderGuidelinesNote />
```

So the cluster ends as `Launch button → SenderGuidelinesNote → </div>`.

- [ ] **Step 3: Visual smoke test**

```bash
cd frontend && npm run dev
```

Open any campaign. Expected: small grey note appears right after the Launch button: "Sends capped at 50/day per mailbox to protect deliverability. Sender guidelines ↗"

- [ ] **Step 4: Commit**

```bash
git add frontend/src/features/outbound/components/SenderGuidelinesNote.tsx frontend/src/pages/CampaignBuilder.jsx
git commit -m "feat(compliance): SenderGuidelinesNote inline reminder near Launch

Small grey caption explaining the 50/day-per-mailbox cap + link to
Google's Email Sender Guidelines. Required UX surface for Gmail API
re-verification — Google reviewer can see at-a-glance that the app
enforces the cap and educates the user."
```

---

## Task 6: `send-campaign-email` consent + daily-cap gates

**Files:**
- Modify: `supabase/functions/send-campaign-email/index.ts` (around line 286 — the recipient loop)

This is the security boundary. Frontend checkbox is UX hint — this enforces it server-side.

- [ ] **Step 1: Read the existing recipient loop**

```bash
sed -n '280,420p' supabase/functions/send-campaign-email/index.ts
```

The loop iterates `for (const r of recipients)` at line 286. Each iteration checks suppression (line ~368-387), then sends + logs `event_type='sent'|'send_failed'` to `lit_outreach_history` (line 739).

We're adding TWO new gates BEFORE the existing suppression check:
- Consent gate: skip recipient + log `event_type='consent_missing'` if no consent record
- Daily-cap gate: defer recipient (set `next_send_at`) + log `event_type='daily_cap_reached'` if mailbox at 50

- [ ] **Step 2: Pre-fetch consented emails for the batch (single query)**

Before the recipient loop (~line 286), fetch the set of recipient emails that have consent for this campaign's org. The campaign row already has `org_id` (sub-project A landed). Pattern:

```ts
// Pre-fetch consented emails so the per-recipient check is O(1) set lookup.
// SECURITY DEFINER RPC bypasses the user-scoped RLS so the dispatcher
// (running as service role) can see all consent rows for the org.
const recipientEmails = recipients.map((r) => r.email).filter(Boolean);
let consentedSet = new Set<string>();
if (recipientEmails.length > 0 && campaign.org_id) {
  const { data: consented, error: consErr } = await admin.rpc(
    "lit_recipients_with_consent",
    { p_org_id: campaign.org_id, p_emails: recipientEmails },
  );
  if (consErr) {
    log.warn("consent_lookup_failed", { err: consErr.message, campaign_id: campaign.id });
    // Fail-open: log warning but proceed. The per-recipient check below
    // will treat consentedSet as empty and skip everything, which is the
    // correct fail-closed posture — but if THIS code path fails we'd block
    // every recipient. Better: surface as an alert. For v1, log + proceed
    // with empty set so the dispatcher reliably skips rather than crashes.
  } else {
    consentedSet = new Set((consented ?? []).map((r: any) => String(r.recipient_email).toLowerCase()));
  }
}
```

- [ ] **Step 3: Pre-fetch today's send counts per mailbox (single query)**

Also before the loop, fetch today's send counts grouped by sender_email:

```ts
// Pre-fetch today's sent count per mailbox for the per-recipient cap check.
const todayStart = new Date();
todayStart.setUTCHours(0, 0, 0, 0);
const { data: todaySends } = await admin
  .from("lit_outreach_history")
  .select("metadata, event_type")
  .eq("event_type", "sent")
  .gte("created_at", todayStart.toISOString());

const sendsByMailbox = new Map<string, number>();
for (const row of todaySends ?? []) {
  const sender = String((row.metadata as any)?.sender_email ?? "").toLowerCase();
  if (sender) sendsByMailbox.set(sender, (sendsByMailbox.get(sender) ?? 0) + 1);
}

const DAILY_CAP_PER_MAILBOX = 50;
```

- [ ] **Step 4: Insert consent + cap checks inside the recipient loop**

Find the loop body. After the existing setup (around line 287-360) but BEFORE the existing suppression check at line ~368, insert:

```ts
// GATE 1: Consent attestation required (Gmail API policy compliance).
if (!consentedSet.has(String(r.email).toLowerCase())) {
  await admin.from("lit_outreach_history").insert({
    campaign_id: campaign.id,
    user_id: campaign.user_id,
    event_type: "consent_missing",
    provider: "policy",
    metadata: { recipient_email: r.email, reason: "no_consent_record" },
    step_order: step?.step_order ?? null,
  });
  log.info("consent_skipped", { recipient: r.email, campaign_id: campaign.id });
  continue; // skip this recipient
}

// GATE 2: Per-mailbox daily cap (50/day).
const senderEmail = String(primaryEmail ?? "").toLowerCase();
const sentToday = sendsByMailbox.get(senderEmail) ?? 0;
if (sentToday >= DAILY_CAP_PER_MAILBOX) {
  await admin.from("lit_outreach_history").insert({
    campaign_id: campaign.id,
    user_id: campaign.user_id,
    event_type: "daily_cap_reached",
    provider: "policy",
    metadata: {
      recipient_email: r.email,
      sender_email: senderEmail,
      sent_today: sentToday,
      cap: DAILY_CAP_PER_MAILBOX,
    },
    step_order: step?.step_order ?? null,
  });
  // Defer to tomorrow by setting next_send_at on the campaign_contact row
  const tomorrow = new Date(todayStart);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  await admin
    .from("lit_campaign_contacts")
    .update({ next_send_at: tomorrow.toISOString() })
    .eq("id", r.contact_id ?? r.id);
  log.info("daily_cap_deferred", { recipient: r.email, sender: senderEmail, sent_today: sentToday });
  continue; // defer this recipient
}

// (existing suppression check at line ~368 follows)
```

NOTE: the exact variable names (`primaryEmail`, `r.contact_id`, `step`, `campaign`) need to match what's already in scope in the file. Read the loop body's existing declarations carefully and adjust the references. Don't invent new variable names — use what's already there.

NOTE: after a successful send, the existing code at line 739 already inserts `event_type='sent'` — increment the in-memory counter to avoid re-querying:

```ts
// After the existing successful-send insert at line 739:
if (sendRes.ok && senderEmail) {
  sendsByMailbox.set(senderEmail, (sendsByMailbox.get(senderEmail) ?? 0) + 1);
}
```

- [ ] **Step 5: Deploy via Supabase MCP**

Use `mcp__claude_ai_Supabase__deploy_edge_function`:
- project_id: `jkmrfiaefxwgbvftohrb`
- function_slug: `send-campaign-email`
- BEFORE deploying, `get_edge_function` to confirm current verify_jwt setting + bundle every `_shared/*.ts` file imported by index.ts in the deploy

Report old → new version number.

- [ ] **Step 6: Smoke test via SQL (optional — relies on a live campaign trigger)**

The dispatcher fires on `lit_campaign_contacts.next_send_at <= now()`. To test:

```sql
-- Insert a synthetic consent row for an existing test recipient
INSERT INTO public.lit_recipient_consent
  (recipient_email, org_id, attested_by_user_id, source)
SELECT 'test@example.com',
       (SELECT id FROM public.organizations LIMIT 1),
       (SELECT id FROM auth.users LIMIT 1),
       'manual_email_tab'
ON CONFLICT DO NOTHING;
-- Verify the helper RPC returns it
SELECT * FROM public.lit_recipients_with_consent(
  (SELECT id FROM public.organizations LIMIT 1),
  ARRAY['test@example.com', 'other@example.com']
);
-- Expected: 1 row — test@example.com (other@example.com NOT returned)
```

If the helper RPC behaves correctly, the dispatcher gate is correct because it just does set membership against that same lookup.

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/send-campaign-email/index.ts
git commit -m "feat(compliance): consent + daily-cap gates in send dispatcher

Two new server-side gates before the per-recipient send:
  1. Consent: skip + log 'consent_missing' if lit_recipient_consent
     has no row for (email, org). Pre-fetched as a Set for O(1) check.
  2. Daily cap: 50/day per mailbox. Pre-fetch today's send count per
     sender_email, increment in-memory on each successful send. When
     cap reached: defer to tomorrow via next_send_at + log
     'daily_cap_reached'.

Both gates are the actual security boundary per Google's Gmail API
policy — the frontend consent checkbox is a UX hint that helps users
not trip the gates.

Deployed: send-campaign-email v<old> → v<new>."
```

---

## Task 7: Ops doc — test account + walkthrough for Google reviewer

**Files:**
- Create: `docs/ops/google-gmail-verification-test-account.md`

- [ ] **Step 1: Draft the doc**

Create `docs/ops/google-gmail-verification-test-account.md`:

```markdown
# Google Gmail API Verification — Reviewer Test Account

This document provides the LIT test account and walkthrough for Google's Workspace API verification reviewer.

## Test account credentials

- **App URL:** https://app.logisticintel.com
- **Email:** `gmail-reviewer@logisticintel.com` *(to be provisioned by ops)*
- **Password:** *(provided separately via secure channel in the verification email reply)*
- **Plan:** Scale (full feature access)
- **Pre-seeded org:** "Gmail Compliance Demo" — contains 2 sample campaigns + 5 sample recipients with consent records

## Walkthrough — verifying compliance controls

### 1. Recipient consent attestation

1. Sign in at https://app.logisticintel.com
2. Navigate to **Campaigns** in the left sidebar
3. Click **New campaign** → name it anything → save
4. Click **Pick recipients**
5. Switch to the **Manual emails** tab
6. Type 2 test emails (e.g. `reviewer-test-1@example.com`, `reviewer-test-2@example.com`)
7. **Observe:** an amber checkbox at the bottom of the drawer reads:
   > "I confirm these recipients have consented to receive commercial email from my organization (e.g., opted in via form, existing business relationship, or written consent). [Sender guidelines]"
8. **Observe:** the **Confirm** button is disabled until the checkbox is checked
9. Check the box → Confirm enables → click → drawer closes
10. **DB verification:** each recipient now has a row in `lit_recipient_consent` with the reviewer's user_id as `attested_by_user_id` and `source = 'manual_email_tab'`

### 2. Per-mailbox daily send cap (50/day)

1. Open any active campaign
2. **Observe:** below the Launch button, a small caption reads:
   > "ℹ️ Sends capped at 50/day per mailbox to protect deliverability. [Sender guidelines ↗]"
3. **Enforcement:** the `send-campaign-email` edge function blocks any send beyond 50/day per mailbox and defers to the next day. Recipients deferred this way show `event_type = 'daily_cap_reached'` in `lit_outreach_history` with the sender_email + sent_today count in metadata.

### 3. Unsubscribe footer (already shipped pre-MVP)

1. Receive a campaign email at your test inbox
2. **Observe:** the email contains:
   - `List-Unsubscribe` header with mailto + URL (RFC 8058 compliant)
   - `List-Unsubscribe-Post: List-Unsubscribe=One-Click` header
   - Visible unsubscribe link in the footer
3. Click the unsubscribe link → confirmation page → `lit_email_preferences.unsubscribed_all = true` is set; future campaigns to that recipient are auto-suppressed

### 4. Bulk-sender policy compliance (Gmail/Yahoo Feb 2024)

| Requirement | Implementation |
|---|---|
| SPF | Configured on `logisticintel.com` DNS |
| DKIM | Configured on `logisticintel.com` DNS |
| DMARC | `p=quarantine` on `logisticintel.com` DNS |
| One-click unsubscribe | RFC 8058 headers + endpoint `email-unsubscribe` |
| Low complaint rate | Monitored via `resend-webhook` complaint events |
| Consent attestation | `lit_recipient_consent` table — per-recipient, per-org |
| Volume cap | 50/day per mailbox in `send-campaign-email` dispatcher |

## Reviewing the codebase

- Consent table schema: `supabase/migrations/20260605150000_lit_recipient_consent.sql`
- Consent UI: `frontend/src/features/outbound/components/ConsentAttestationCheckbox.tsx`
- Send dispatcher gates: `supabase/functions/send-campaign-email/index.ts` (search for `consent_missing` and `daily_cap_reached`)
- Sender guidelines education: `frontend/src/features/outbound/components/SenderGuidelinesNote.tsx`
- Unsubscribe endpoint: `supabase/functions/email-unsubscribe/index.ts`

## Contact

Engineering: `engineering@logisticintel.com`
```

- [ ] **Step 2: Commit**

```bash
git add docs/ops/google-gmail-verification-test-account.md
git commit -m "docs(ops): Google Gmail verification reviewer test-account walkthrough

Step-by-step doc for Google's Workspace API verification reviewer.
Covers all four compliance controls (consent attestation, 50/day cap,
unsubscribe footer, bulk-sender headers). Lists exact files for code
review. Includes placeholder for the reviewer test-account credentials
which ops will provision and provide via the verification email reply."
```

---

## Task 8: Evidence video walkthrough script

**Files:**
- Create: `docs/ops/google-gmail-verification-video-script.md`

This is the script for the 5-minute video you'll record (Loom / OBS / similar) and link to in your Google reply.

- [ ] **Step 1: Draft the script**

Create `docs/ops/google-gmail-verification-video-script.md`:

```markdown
# Google Gmail Verification — Evidence Video Script

Target length: **5 minutes**. Record at 1080p+ for legibility of UI text.

## Recording setup

- Browser: Chrome incognito (no extensions, clean state)
- Account: the reviewer test account (`gmail-reviewer@logisticintel.com`)
- Audio: narrate each step out loud
- Cursor: use a cursor-highlighter if your tool supports it

## Script

### 0:00 — Intro (10 sec)
> "Hi, this is a walkthrough of LIT's compliance controls for the Gmail API user-data policy. I'll show you four things: consent attestation, the daily send cap, the unsubscribe footer, and where to find each in the codebase."

### 0:10 — Sign in + navigate to Campaigns (15 sec)
- Sign in
- Click **Campaigns** in the sidebar
- Click **New campaign** → name it "Google Compliance Demo" → Save draft

### 0:25 — Show consent attestation flow (1:30)
- Click **Pick recipients**
- Switch to **Manual emails** tab
- Type 2 emails:
  - `compliance-demo-1@example.com`
  - `compliance-demo-2@example.com`
- **Pause + narrate:** "Notice the amber checkbox at the bottom of this drawer. It requires me — the sender — to confirm these recipients consented to receive commercial mail. The Confirm button is disabled until I check it."
- Hover the Confirm button → tooltip shows "Check the consent box to confirm these recipients opted in."
- Click the checkbox → Confirm button enables
- Click **Confirm** → drawer closes

### 1:55 — Show DB record of attestation (40 sec)
- Open Supabase SQL editor in a side tab
- Run:
  ```sql
  SELECT recipient_email, source, attested_by_user_id, attested_at
    FROM public.lit_recipient_consent
   WHERE recipient_email LIKE 'compliance-demo-%'
   ORDER BY attested_at DESC;
  ```
- **Narrate:** "You can see two consent rows just created, with my user_id, source='manual_email_tab', and a timestamp. This is the auditable record Google requires."

### 2:35 — Show 50/day cap UX (40 sec)
- Back in the campaign builder
- Point to the small caption below the Launch button: "Sends capped at 50/day per mailbox to protect deliverability. Sender guidelines ↗"
- Click the **Sender guidelines** link → opens Google's Email Sender Guidelines in a new tab
- **Narrate:** "Users are educated upfront. The cap is also enforced server-side — let me show you that next."

### 3:15 — Show the server-side enforcement (1:10)
- Open the codebase (GitHub or local IDE)
- Open `supabase/functions/send-campaign-email/index.ts`
- Scroll to the `GATE 1: Consent attestation` block — read it briefly
- **Narrate:** "Every recipient is checked against the consent table. If there's no consent row, we skip the send and log `event_type='consent_missing'`."
- Scroll to `GATE 2: Per-mailbox daily cap`
- **Narrate:** "Each mailbox is capped at 50 sends per day. When the cap is reached, the recipient is deferred to tomorrow via `next_send_at`, and we log `event_type='daily_cap_reached'`."

### 4:25 — Show unsubscribe footer + suppression (25 sec)
- Open a previously-sent campaign email in the reviewer's Gmail inbox
- Show the visible unsubscribe link in the footer
- Show Gmail's "Unsubscribe" chip at the top of the message (proves `List-Unsubscribe` headers are honored)
- Click unsubscribe → confirmation page
- **Narrate:** "RFC 8058 one-click unsubscribe is implemented and works in Gmail's native UI."

### 4:50 — Wrap (10 sec)
> "All four compliance controls — consent, daily cap, unsubscribe, sender education — are enforced server-side and surfaced to users. The full test account is in the ops doc linked in our reply. Thanks for reviewing."

## Post-recording

- Upload to YouTube **Unlisted** OR Google Drive (shared with `gmail-api-verification@google.com`)
- Get the shareable URL
- Reply to Google's verification denial email with:
  - Video URL
  - Test account credentials (from the ops doc)
  - Link to this walkthrough doc on GitHub (or a copy in the email)

## Reply email template

```
Subject: RE: [Google Gmail API verification] — Compliance updates and resubmission

Hi Google Trust & Safety Team,

Thank you for the detailed denial feedback. We've implemented the following compliance controls and are ready for re-verification:

1. **Consent attestation** — every recipient must have an explicit consent record before our dispatcher will send to them. UI requires the sender to attest consent before any campaign launches. Backend enforces it as a hard gate.

2. **Sender Guidelines compliance** — per-mailbox daily cap of 50/day (matches your "25-50 max per day" guidance), proper SPF/DKIM/DMARC, RFC 8058 one-click unsubscribe, monitored complaint rates via webhook.

3. **Evidence:**
   - Video walkthrough: [YOUR YOUTUBE/DRIVE URL]
   - Test account: gmail-reviewer@logisticintel.com (password in this email's body, redacted from any public copies of this reply)
   - Code review reference: https://github.com/LIT-Intel/logistics-intel/blob/main/docs/ops/google-gmail-verification-test-account.md

Please let us know if there's anything else needed.

Best,
Valesco Raymond
Logistic Intel
```
```

- [ ] **Step 2: Commit**

```bash
git add docs/ops/google-gmail-verification-video-script.md
git commit -m "docs(ops): Google Gmail verification 5-min evidence video script

Beat-by-beat narration for the resubmission video. Covers: consent
attestation flow + DB record, 50/day cap UX + server enforcement,
unsubscribe footer + Gmail native chip, code references. Includes
reply-email template for the verification denial thread."
```

---

## Self-Review

**Spec coverage:**

| Spec section | Covered by |
|---|---|
| `lit_recipient_consent` table + RLS + helper RPC | Task 1 |
| Frontend consent client (`upsertConsents`, dedupe, lowercase) | Task 2 |
| `ConsentAttestationCheckbox` component | Task 3 |
| Audience picker integration: gate + upsert | Task 4 |
| `SenderGuidelinesNote` near Launch | Task 5 |
| Dispatcher consent gate (`consent_missing` log + skip) | Task 6 |
| Dispatcher daily cap (`daily_cap_reached` log + defer) | Task 6 |
| Test account + ops walkthrough | Task 7 |
| Evidence video script + reply template | Task 8 |

No gaps.

**Placeholder scan:** Scanned for "TODO" / "TBD" / "implement later" / "Add appropriate" / "Similar to". Two pragmatic NOTEs in Task 4 (step 4) and Task 6 (step 4) calling out that the engineer must reuse existing in-scope variable names rather than inventing new ones — intentional, because the surrounding existing code's exact names need confirmation at edit time. Concrete fallback patterns are provided.

**Type consistency:**
- `ConsentSource` enum defined in Task 2; used in Task 4 (`source: 'manual_email_tab'` / `'saved_company_picker'`) and matches the table CHECK constraint in Task 1
- `upsertConsents` signature consistent between definition (Task 2) and call sites (Task 4)
- `lit_recipients_with_consent` RPC defined in Task 1; called in Task 6 with the same arg names (`p_org_id`, `p_emails`)
- Daily cap constant (`50`) consistent between Task 5 UI copy and Task 6 dispatcher constant

No drift.

---

## Out of scope (deferred to future workstreams)

- Double opt-in confirmation flow
- Per-org consent management UI (view / export / revoke consent records)
- Suppression list management UI
- Adjustable daily cap per plan tier
- CSV import with consent column
- Consent revocation API (user-facing)
- Webhook for CRM-synced consent
- Sender reputation dashboard
- Deferred-send UI ("X recipients deferred to tomorrow" — comes with Sub-project B's KPI hero)
