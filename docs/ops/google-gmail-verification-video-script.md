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
- Scroll to the consent gate block (search for `consent_missing`)
- **Narrate:** "Every recipient is checked against the consent table. If there's no consent row, we skip the send and log `event_type='consent_missing'`."
- Scroll to the daily-cap audit block (search for `daily_cap_reached`)
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
