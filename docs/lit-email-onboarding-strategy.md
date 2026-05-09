# LIT Email Onboarding Strategy

## Why these decisions

### Cadence: 6 emails over 14-day trial

| Day | Template | Behavioral gate |
|-----|----------|-----------------|
| 0 | Trial Welcome | None — fires on signup |
| 2 | Activation checklist | Skipped if user has any `lit_activity_events` since `started_at` |
| 3 | Founder note (Vincent) | None — every trial user gets it |
| 12 | Ending soon | None — fires 2 days before `trial_ends_at` |
| — | Paid plan welcome | Fires on plan activation (called by billing flow) |
| — | Upgrade confirmation | Fires on plan upgrade (called by billing flow) |

### Why Day 3 instead of Day 5 for founder note

Day 5 is too late. Users who are going to churn typically do so in the first 3 days — they got confused, didn't see value, or forgot the tab was open. A founder note on Day 3 hits while the trial is still fresh and before they've mentally written it off. It's also a "get unstuck" email, not a product pitch, which means it works even if they never opened Day 0.

### Why behavioral gate on Day 2 only

The activation checklist is for users who haven't tried the core workflow yet. Sending it to someone who's already run a Pulse search is noise — they know how the product works. The founder note (Day 3) fires for everyone because it's personal touch, not instructions. The ending-soon email (Day 12) fires for everyone because the urgency is real regardless of usage.

### Why no Day 5 value email

The original spec included a Day 5 email. It was dropped because:
1. It adds noise for active users who already saw value
2. The founder note on Day 3 covers the "is this working for you?" message more authentically
3. Four trial emails is enough — more risks deliverability

### Tone guide

Operator-to-operator. LIT sells to freight sales reps and brokers — people who get pitched constantly and ignore generic SaaS copy. Rules:
- No exclamation points in email bodies
- No "we're so excited" language
- Specifics over abstractions ("312 shipments in Q3" not "rich data")
- The founder note is written like a Slack message, not a press release
- CTAs are direct and functional ("Run a Pulse search") not salesy ("Start your journey!")

### List-Unsubscribe compliance

Every email includes `List-Unsubscribe` and `List-Unsubscribe-Post: List-Unsubscribe=One-Click` headers. This is required for Gmail and Yahoo bulk sender rules. Unsubscribes are recorded in `lit_email_unsubscribes` and checked before every send.

### Why no React Email

React Email requires a build step and adds a runtime dependency to the edge function bundle. Pure HTML with inline styles is more portable, renders identically across email clients, and is easier to debug. Outlook-safe `<table>` layouts are used throughout.

---

## Trigger points

| Email | Called from today | Future trigger |
|-------|------------------|---------------|
| `trial_welcome` | Manual / billing-webhook (TODO) | Stripe checkout.session.completed |
| `trial_day_2_activation` | `subscription-email-cron` daily at 10:00 UTC | — |
| `trial_day_3_founder_note` | `subscription-email-cron` daily at 10:00 UTC | — |
| `trial_ending_soon` | `subscription-email-cron` daily at 10:00 UTC | — |
| `paid_plan_welcome` | Manual / billing-webhook (TODO) | Stripe invoice.payment_succeeded |
| `upgrade_confirmation` | Manual / billing-webhook (TODO) | Stripe customer.subscription.updated |

To trigger manually (e.g., for QA or for the first trial subscriber):

```bash
curl -X POST https://jkmrfiaefxwgbvftohrb.supabase.co/functions/v1/send-subscription-email \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "recipient_email": "you@example.com",
    "first_name": "Vincent",
    "plan_slug": "trial",
    "event_type": "trial_welcome"
  }'
```

---

## Schema discovered (subscriptions table)

The `subscriptions` table uses:
- `status` values: `'trialing'`, `'active'`, `'incomplete'` (NOT `'trial'`)
- `started_at` for trial start (NOT `trial_started_at`)
- `trial_ends_at` for trial expiry (exists, nullable)
- `plan_code` for the plan identifier (NOT `plan_slug`)
- `organization_id` (NOT `org_id`) for the org FK

The cron query uses these exact column names.

---

## Test plan

### 1. Template preview (local)

HTML previews are written to `tmp/email-previews/<event_type>.html`. Open in a browser to verify layout, then paste into https://www.mail-tester.com or Litmus for client rendering.

### 2. Send to self via Resend test mode

Set `LIT_RESEND_API_KEY` to a Resend test-mode key. Call the edge function with `"recipient_email": "your@email.com"` and `"event_type": "trial_welcome"`. Check the Resend dashboard for delivery.

### 3. Idempotency test

Call the same payload twice. Second call should return `{ ok: true, skipped: true, reason: "already_sent" }`.

### 4. Suppression test

Insert a row into `lit_email_unsubscribes` with the test email. Call the edge function. Should return `{ ok: true, skipped: true, reason: "unsubscribed" }`.

### 5. Cron dry run

Call `subscription-email-cron` with service-role auth. With no trialing subscriptions in the day windows it returns `{ processed: { day_2: 0, day_3: 0, day_12: 0 } }`. Set `started_at` on a test subscription to `now() - interval '2.5 days'` to trigger a Day 2 send.

### 6. Log inspection

```bash
supabase functions logs send-subscription-email --project-ref jkmrfiaefxwgbvftohrb
supabase functions logs subscription-email-cron --project-ref jkmrfiaefxwgbvftohrb
```

Or use Supabase Dashboard > Edge Functions > Logs.

---

## Environment variables required

Set these in Supabase Dashboard > Project Settings > Edge Functions > Secrets:

| Key | Value | Default if missing |
|-----|-------|-------------------|
| `LIT_RESEND_API_KEY` | Resend API key (from resend.com) | None — emails won't send |
| `LIT_EMAIL_FROM` | `LIT <hello@updates.logisticintel.com>` | `LIT <hello@updates.logisticintel.com>` |
| `LIT_EMAIL_REPLY_TO` | `hello@logisticintel.com` | `hello@logisticintel.com` |
| `LIT_APP_URL` | `https://app.logisticintel.com` | `https://app.logisticintel.com` |
| `LIT_SITE_URL` | `https://www.logisticintel.com` | `https://www.logisticintel.com` |

**CRITICAL — set before first live send:** `LIT_RESEND_API_KEY`

---

## Future work (NOT in this task)

- **Stripe webhook → `send-subscription-email`**: Wire `checkout.session.completed` to `trial_welcome`, `invoice.payment_succeeded` to `paid_plan_welcome`, `customer.subscription.updated` to `upgrade_confirmation`. The edge function is ready — it just needs a caller.
- **Day 7 re-engagement**: For trial users with zero activity after 7 days, a second founder note offering a live 15-min walkthrough. Segment by `lit_activity_events` count = 0 since `started_at + 6d`.
- **In-app trial ending notification**: Surface a banner/modal when `trial_ends_at < now() + 3 days`. The DB schema is ready.
- **Resend webhook → unsubscribe sync**: The `resend-webhook` edge function already exists — add a handler for `email.complained` and `email.bounced` events to auto-populate `lit_email_unsubscribes`.
- **HTML → JPG swap**: When real product screenshots are ready, drop JPGs into `marketing/public/email-assets/` with the same basename as the SVGs and update the extension in `emailAssets.ts`.
- **A/B subject testing**: The audit table stores `payload_json` — add a `subject_variant` field to enable subject line A/B without schema changes.
