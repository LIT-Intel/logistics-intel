# Gmail Compliance MVP — Design Spec

**Date:** 2026-06-05
**Sub-project:** D (Gmail Compliance, P0)
**Status:** Approved strategy, design pending user nod
**Goal:** Minimum viable compliance set to satisfy Google's three asks for re-verification of LIT's Gmail API access. Targets 48-hour ship + resubmit.

---

## Problem

Google denied LIT's Gmail API verification (email received 2026-06-05) with this citation:

> "After an extended review, we've determined that your application's use case is not compliant with the Appropriate access to and use of Google Gmail APIs requirement of the Workspace API user data and developer policy, which prohibits applications that distribute spam or unsolicited commercial mail. ... applications that send bulk commercial mail, such as customer relationship management, are allowed as long as the user consented to receive emails. Sending spam or emails to prospects that have not consented to receiving commercial emails is strictly prohibited."

Until Gmail verification clears, the LIT Gmail integration is stuck in Test Mode with severe user-count restrictions, blocking every Gmail-connected user from launching campaigns at scale.

Google's three concrete asks for resubmission:
1. **Limit recipients to consented leads** — enforce or attest that every recipient consented to receive commercial mail
2. **Meet Email Sender Guidelines** — proper SPF/DKIM/DMARC, reasonable volumes, list hygiene
3. **Provide evidence** — screenshots or video + test account for Google to review

---

## Existing infrastructure (good news)

Significant Gmail-compliance plumbing already shipped (audit done 2026-06-05):

| Surface | File | Status |
|---|---|---|
| RFC 8058 one-click unsubscribe | `supabase/functions/email-unsubscribe/index.ts` | ✅ deployed |
| `List-Unsubscribe` + `List-Unsubscribe-Post` headers on every send | `supabase/functions/send-campaign-email/index.ts:1008-1012` | ✅ shipped |
| Suppression table `lit_email_preferences.unsubscribed_all` | `supabase/migrations/20260519130000_lit_email_preferences.sql` | ✅ live |
| Cross-campaign suppression check before send | `supabase/functions/send-campaign-email/index.ts:387` | ✅ enforced |
| Bounce/complaint handling | `supabase/functions/resend-webhook/index.ts` | ✅ live |
| OAuth Gmail consent flow | `supabase/functions/oauth-gmail-callback/index.ts` | ✅ live |

**What's actually missing for Google MVP:**
1. Recipient-level consent attestation (no UI, no DB record)
2. Per-mailbox daily send cap (50/day proactive limit)
3. Sender Guidelines education in the campaign builder
4. Test account + ops documentation for Google reviewer
5. Evidence video walkthrough

---

## Architecture

### 1. Consent attestation

**New table** `lit_recipient_consent`:
```sql
CREATE TABLE public.lit_recipient_consent (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_email text NOT NULL,
  org_id uuid NOT NULL REFERENCES public.organizations(id),
  attested_by_user_id uuid NOT NULL REFERENCES auth.users(id),
  attested_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL CHECK (source IN ('saved_company_picker', 'manual_email_tab', 'csv_upload', 'crm_sync')),
  -- Optional context for later audit
  campaign_id uuid REFERENCES public.lit_campaigns(id) ON DELETE SET NULL,
  notes text,
  UNIQUE (recipient_email, org_id)
);
CREATE INDEX lit_recipient_consent_email_idx
  ON public.lit_recipient_consent(lower(recipient_email));
```

RLS: org-scoped (any active org_member can read+insert), platform_admin can read all.

**UI flow** (campaign builder's audience picker):
- A required checkbox at the bottom of the Pick Recipients drawer: *"I confirm these recipients have consented to receive commercial email from my organization (e.g., opted in via form, business relationship, or written consent)."* with link to Google's sender guidelines.
- Confirm button disabled until checked.
- On confirm: client upserts one row per recipient into `lit_recipient_consent` (unique per email+org), setting `attested_by_user_id = current_user`, `source = <picker tab>`.
- Persistent — once a recipient is attested for an org, future campaigns to that recipient don't re-prompt.

**Dispatcher gate** (`send-campaign-email`):
- Before sending to any recipient: check `lit_recipient_consent` exists for `(recipient_email, org_id)`. If not, log `event_type='consent_missing'` to `lit_outreach_history` and skip the send.
- Surfaces to UI as a launch-time warning: "N of M recipients lack consent records — they'll be skipped."

### 2. Per-mailbox daily send cap (50/day)

**Dispatcher gate** (`send-campaign-email`):
- Before each send, count `lit_outreach_history` rows where `event_type = 'sent'` AND `created_at >= date_trunc('day', now())` AND `metadata->>'sender_email' = <current mailbox>`.
- If count >= 50: defer the send to tomorrow (re-queue via `next_send_at = date_trunc('day', now()) + interval '1 day'`) and log `event_type='daily_cap_reached'` to `lit_outreach_history`.
- Surfaces in CampaignKpiHero (sub-project B) as "X / 50 daily sends remaining".

Hard-coded 50/day for v1. Future: configurable per-mailbox/per-plan.

### 3. Sender Guidelines education

**Two surfaces in the campaign builder:**
- **Consent checkbox copy** in the picker drawer (above) — includes inline link "Email Sender Guidelines"
- **Launch button area** — small "ℹ️ Recipients limited to 50/day per mailbox to protect deliverability" caption with link to Google's [Email Sender Guidelines](https://support.google.com/mail/answer/81126)

### 4. Test account + ops docs

**New doc:** `docs/ops/google-gmail-verification-test-account.md`
- Pre-configured test account credentials for Google reviewer
- Walkthrough steps: log in → create campaign → see consent checkbox → see daily cap → see unsubscribe footer
- Evidence video link (recorded separately)

### 5. Evidence video

Out-of-code work: 5-minute Loom/screen-record showing:
1. New campaign creation
2. Audience picker with consent checkbox + sender-guidelines link
3. Daily send cap surfaced in KPI hero (if B has shipped) OR in the launch dialog
4. Sample outbound email showing unsubscribe footer
5. Reviewing unsubscribe → confirms suppression list grows

---

## Components

### Files to create

| Path | Responsibility |
|---|---|
| `supabase/migrations/20260605150000_lit_recipient_consent.sql` | Table + RLS + index |
| `frontend/src/features/outbound/components/ConsentAttestationCheckbox.tsx` | Required checkbox UI + link to sender guidelines |
| `frontend/src/features/outbound/api/recipientConsent.ts` | Typed client for consent upsert + lookup |
| `frontend/src/features/outbound/components/SenderGuidelinesNote.tsx` | Small inline note near Launch button |
| `docs/ops/google-gmail-verification-test-account.md` | Reviewer setup + walkthrough |

### Files to modify

| Path | Change |
|---|---|
| `frontend/src/features/outbound/components/AudiencePickerDrawer.tsx` | Mount `ConsentAttestationCheckbox`; gate Confirm button on it; upsert consent rows on confirm |
| `frontend/src/pages/CampaignBuilder.jsx` | Mount `SenderGuidelinesNote` near Launch button area |
| `supabase/functions/send-campaign-email/index.ts` | Add consent check (skip + log `consent_missing`) and daily-cap check (defer + log `daily_cap_reached`) before each send |

---

## Data flow

**Consent capture:**
1. User opens Pick Recipients → adds recipients (any tab)
2. Confirm button disabled until consent checkbox is checked
3. On confirm: client upserts one `lit_recipient_consent` row per recipient (ON CONFLICT DO NOTHING — first attestation wins)
4. Picker drawer closes; recipients are now safe to send to

**Pre-send gate:**
1. `send-campaign-email` dispatcher iterates recipients
2. Per recipient: SELECT exists from `lit_recipient_consent` WHERE email+org match
3. If absent: log `event_type='consent_missing'`, skip
4. If present: continue to daily cap check
5. Count today's sends for this mailbox. If >= 50: log `daily_cap_reached`, set `next_send_at = tomorrow`
6. Else: proceed with send

**Unsubscribe (existing flow, no changes):**
1. Recipient clicks unsubscribe in email
2. `email-unsubscribe` edge fn flips `lit_email_preferences.unsubscribed_all = true`
3. Future sends check this in the existing suppression code path

---

## Error handling + edge cases

| Case | Behavior |
|---|---|
| User checks consent box but adds 0 recipients | Confirm proceeds (no rows to upsert); audience is empty; launch button still disabled by existing has-recipients check |
| Same recipient added in two campaigns same day | Consent upsert is ON CONFLICT DO NOTHING; second attestation is a no-op; existing attestation stands |
| Mailbox at 49 sends, campaign has 5 recipients | 1 sends today, 4 deferred to tomorrow. KpiHero surfaces this |
| User attempts to launch with 0 consented recipients | Launch dispatcher returns `{ skipped: N, sent: 0 }`; CampaignBuilder shows error "All recipients lack consent — review picker" |
| Org has 100 mailboxes connected | Daily cap is per-mailbox so 100 × 50 = 5,000/day org-level — adequate for v1 |
| Recipient unsubscribes mid-campaign | Existing `lit_email_preferences.unsubscribed_all` check kicks in; this MVP doesn't change that flow |

---

## Testing

| Test | Scope |
|---|---|
| Migration creates table + RLS | SQL audit after apply |
| Consent upsert is idempotent (same email+org twice → 1 row) | Integration test |
| RLS: non-admin org member can only INSERT consent for their own org | Integration test |
| `ConsentAttestationCheckbox` blocks Confirm button when unchecked | Component test |
| `send-campaign-email` skips recipients with no consent record + logs `consent_missing` | Integration / Deno test |
| `send-campaign-email` defers send when daily cap reached + logs `daily_cap_reached` | Integration / Deno test |
| Daily cap respects per-mailbox (mailbox A at cap, mailbox B still sends) | Integration test |
| E2E: full flow — create campaign → add recipients (with consent) → launch → verify sent count + suppression check | Manual / Cypress |

---

## Out of scope (deferred)

- Double opt-in confirmation flow
- Per-org consent management UI (view/export consent records)
- Suppression list management UI (the existing flow handles ingestion; admin export is future)
- Adjustable daily cap per plan tier
- CSV import with consent column
- Consent revocation API (user-facing)
- Webhook for CRM-synced consent
- Sender reputation dashboard

---

## Open design decisions surfaced

1. **Consent attestation surface — checkbox per picker confirm, OR persistent per-org "I attest all my recipients are consented" toggle?** Recommend per-confirm checkbox so the affirmation is fresh + auditable per session. A one-time toggle is easier to ignore.
2. **Daily cap hard-coded 50 vs configurable.** Recommend hard-coded 50 for v1 — Google explicitly named "25-50 max per day to avoid flagging" in your message. Configurable comes later when sender reputation data is collected.
3. **What happens to the deferred sends UI?** When 4 of 5 recipients are deferred to tomorrow, the CampaignKpiHero (B) needs a state for "queued for tomorrow" alongside Sent / Open Rate / etc. For this MVP: just log to `lit_outreach_history` and rely on the user re-checking the campaign tomorrow. Cleaner UI surface comes with B.
4. **Consent source enum.** Picker confirms get `source='saved_company_picker'` or `'manual_email_tab'` depending on tab. Future CSV / CRM sync gets its own source value when those flows ship.
