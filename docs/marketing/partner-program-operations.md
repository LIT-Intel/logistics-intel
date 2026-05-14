# LIT Partner Program — operational handoff

**Owner:** Partnerships · **Updated:** 2026-05-11

How a public partner application moves through the system, end-to-end. Includes the bridge between the marketing inbox (Sanity) and the in-app affiliate pipeline (Supabase).

## End-to-end flow

```
1. Applicant submits /partners form
           │
           ▼
2. Sanity:  partnerApplication doc created  (Inbox → Partner applications)
           │
           ▼      ◄── partnerships team reviews
3. Bridge:  POST /api/admin/partner-invite  { sanityId }
           │      (writes affiliate_invites row + sends Resend invite email)
           ▼
4. Applicant clicks invite link → /affiliate/onboarding?token=...
           │
           ▼
5. Supabase: accept-affiliate-invite → auth.users created or matched
           │
           ▼
6. Applicant fills logged-in /partners/apply → affiliate-apply edge function
           │
           ▼
7. Super-admin approves via /admin/partners → affiliate-review creates
           affiliate_partners row with ref_code
           │
           ▼
8. Partner connects Stripe Connect Express
           │      (stripe-connect-onboard → stripe-connect-status)
           ▼
9. Partner shares /signup?ref=<ref_code>
           │      (RefBoot.tsx captures cookie)
           ▼
10. New customer signs up → claim-affiliate-referral → affiliate_referrals row
           │
           ▼
11. Customer subscribes / pays → stripe webhook → affiliate_commissions
           ledger row written
           │
           ▼
12. Partner views earned commissions at /affiliate/dashboard
           │
           ▼
13. Monthly payout batched → affiliate_payouts → Stripe Transfer
```

## Step 3 — Sanity → Supabase bridge (the gap Agent 2 filled today)

The bridge endpoint reads a Sanity partnerApplication and drops a row into the existing affiliate_invites pipeline so the rest of the flow (steps 4-13) just works.

### Trigger the bridge

```bash
curl -X POST https://logisticintel.com/api/admin/partner-invite \
  -H "Authorization: Bearer $PARTNER_INVITE_SECRET" \
  -H "content-type: application/json" \
  -d '{
    "sanityId": "<the partnerApplication _id from Studio>",
    "tierCode": "starter",
    "note": "Optional personalized message that lands in the invite email."
  }'
```

`tierCode` options: `"starter"` (default, 30%), `"launch_promo"` (40% — manual gate), `"partner"` (custom rate).

### Response shapes

```json
// success
{ "ok": true, "inviteId": "uuid", "emailOk": true }

// already invited (idempotent — no duplicate sends)
{ "ok": false, "error": "already_invited", "inviteId": "uuid" }  // HTTP 409

// applicant not found
{ "ok": false, "error": "application_not_found" }  // HTTP 404

// missing email on the Sanity doc
{ "ok": false, "error": "application_missing_email" }  // HTTP 400

// service-role / Sanity / Resend failure
{ "ok": false, "error": "...", "details": "..." }  // HTTP 500
```

After a successful invite, the Sanity doc is patched with:
- `inviteSent: true`
- `inviteId: <uuid>` (foreign key to `affiliate_invites.id`)
- `inviteSentAt: <ISO timestamp>`
- `status: "reviewing"`
- `inviteEmailLog: <Resend response JSON for audit>`

## Required environment variables (marketing/Vercel)

| Variable | Required? | Purpose |
|---|---|---|
| `PARTNER_INVITE_SECRET` | **YES** | Shared secret that gates `/api/admin/partner-invite` |
| `SUPABASE_SERVICE_ROLE_KEY` | **YES** | Service-role write to `affiliate_invites` |
| `NEXT_PUBLIC_SUPABASE_URL` (or `VITE_SUPABASE_URL`) | **YES** | Supabase project URL |
| `RESEND_API_KEY` | **YES** | Already set for /demo form |
| `RESEND_FROM_EMAIL` | **YES** | Already set for /demo form |
| `SANITY_API_WRITE_TOKEN` | **YES** | Already set — patches the Sanity doc |
| `APP_BASE_URL` | optional | Defaults to `https://logisticintel.com` |
| `PARTNER_INVITE_EXPIRY_DAYS` | optional | Defaults to 14 |

Set `PARTNER_INVITE_SECRET` to a long random string (`openssl rand -hex 24`) on the **lit-marketing** Vercel project. Share with the partnerships team via a password manager — never paste in chat.

## Step 11 — Commission ledger (Agent 1's pipeline)

For reference. This is already deployed; Agent 2 didn't touch it.

| Stripe event | Ledger action |
|---|---|
| `invoice.paid` for a customer in `affiliate_referrals` | Insert `affiliate_commissions` row with `amount_cents = invoice_amount * commission_pct / 100`, `status = 'pending'`, `clears_at = now() + 30 days` (chargeback hold) |
| `invoice.payment_failed` / `customer.subscription.deleted` | Mark referral subscription_status; if commission already paid, ignore (12-month window applies regardless of churn for already-earned periods) |
| Daily cron | Move `pending` commissions with `clears_at <= now()` to `earned` |
| Monthly cron | Aggregate `earned` commissions per partner, create `affiliate_payouts` batch, Stripe Transfer to connected account, mark commissions `paid` |

## How partnerships team works the inbox

1. **Open the Sanity inbox** — `https://logisticintel.com/studio/desk/partnerApplication`
2. **Review the application** — promotion plan, audience fit, channel quality
3. **If approved → fire the bridge** — paste the doc `_id` into the curl command above (or hit it from Postman/Hoppscotch with the saved bearer token). The applicant gets the invite email within seconds.
4. **Update the status** — Sanity status auto-moves to `reviewing` on bridge success. Manually move to `approved` or `declined` after the final decision.
5. **If declined → email manually** — write a personal note from `partnerships@logisticintel.com` and set Sanity status to `declined`.

## Known gaps (intentional — not Agent 2 scope)

- **No Sanity Studio "Send invite" button yet.** Plan is to add a document action in a future Studio plugin pass. Until then, partnerships team uses the curl. Easy enough that the workflow scales to ~10 applications/day without friction.
- **No automated decision tooling.** Every application gets human review — that is the policy, not a bug.
- **Stripe payout batching is monthly.** No daily settlement. Partners see `pending` → `earned` → `paid` lifecycle in the dashboard.

## Sanity Studio paths

- Inbox: `/studio/desk/partnerApplication`
- Single application: `/studio/desk/partnerApplication;<_id>`

## Supabase admin paths

- Partner program admin: `https://app.logisticintel.com/admin/partners`
- Affiliate dashboard (per-partner view): `https://app.logisticintel.com/affiliate/dashboard`
- Onboarding flow: `https://app.logisticintel.com/affiliate/onboarding?token=<invite-token>`

## Open a support ticket

If the bridge endpoint returns a non-2xx, copy the error response and the Sanity application `_id` into a Slack thread in `#partnerships` (or email partnerships@logisticintel.com). The endpoint logs every failure server-side with the same `[partner-invite]` prefix so on-call can correlate.
