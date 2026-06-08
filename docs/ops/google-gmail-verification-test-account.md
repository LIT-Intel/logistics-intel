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
