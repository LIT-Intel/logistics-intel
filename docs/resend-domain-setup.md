# Resend marketing-subdomain setup

Step 7 of the unified campaign rebuild. This is the runbook for getting
LIT-authored Resend campaigns to land in inboxes instead of spam.

## Why a dedicated subdomain

`logisticintel.com` is your transactional + corporate domain. Sharing
its SPF / DKIM / reputation with bulk marketing sends is the fastest
way to break receipts, login emails, and password resets the day a
campaign trips Gmail's spam filter.

We move marketing to a dedicated subdomain — recommended:
`updates.logisticintel.com`. Reputation lives there. Transactional
mail stays on the apex. They warm up independently.

## DNS records to publish

Resend issues these from the dashboard once you create the domain. The
exact values come from Resend (host names + record values copy / paste
from their UI). The general shape:

| Type | Host                                      | Purpose |
|------|-------------------------------------------|---------|
| TXT  | `updates.logisticintel.com`               | SPF: `v=spf1 include:amazonses.com ~all` (Resend uses SES) |
| TXT  | `resend._domainkey.updates.logisticintel.com` | DKIM public key (1024 or 2048 bit) |
| MX   | `feedback-smtp.updates.logisticintel.com` | Bounce/complaint loop (priority 10) |
| TXT  | `_dmarc.logisticintel.com`                | DMARC policy — see below |

DMARC at the apex covers all subdomains. Recommended starter value:

```
v=DMARC1; p=quarantine; rua=mailto:dmarc@logisticintel.com; pct=10; sp=quarantine; aspf=r; adkim=r
```

`p=quarantine` with `pct=10` only enforces on 10% of failing mail —
catches problems early without shutting off legitimate sends. Move to
`p=quarantine pct=100` after two weeks of clean reports, then
`p=reject` once you're confident.

## Reply routing

Resend is send-only. Replies need a real inbox. Two options:

**A. Forwarding via the apex.**
Add an MX or alias on `replies@logisticintel.com` (handled by your
existing email provider) and set every campaign's `reply_to` to that
address. The dispatcher already passes `reply_to: from.email` for
Resend sends — change the `email` column on the `lit_email_accounts`
row for the Resend mailbox to the address you want replies to land at.

**B. Inbound webhook into lit_email_messages.**
Resend supports inbound parsing. Configure Resend → Inbound →
`replies@updates.logisticintel.com` → POST to a new edge function
(`resend-inbound-webhook`, build later) that inserts a row into
`lit_email_messages` keyed off `In-Reply-To` so threads show up in
`/app/inbox`. This is the "fully closed loop" version we'll wire when
the LinkedIn / reply-detection feature flag lifts.

For step 7, do A. It works with zero new code.

## Warmup

A fresh subdomain with no history goes to spam regardless of how good
your DKIM is. Resend's docs say new domains need a 30-day warmup. The
dispatcher's daily cap (`lit_inbox_sender_caps.daily_cap`) enforces
this server-side. Suggested ramp:

| Days   | Daily send cap |
|--------|----------------|
| 1–3    | 30             |
| 4–7    | 100            |
| 8–14   | 250            |
| 15–30  | 500            |
| 31+    | 1,000+         |

Update the cap row for the Resend `lit_email_accounts.id`:

```sql
insert into public.lit_inbox_sender_caps (email_account_id, daily_cap)
values ('<resend_account_id>', 30)
on conflict (email_account_id) do update set daily_cap = excluded.daily_cap;
```

## Pre-flight checklist

Before the first real send:

- [ ] Resend domain `updates.logisticintel.com` shows green on SPF, DKIM, MX in Resend dashboard
- [ ] DMARC TXT published at `_dmarc.logisticintel.com`
- [ ] Test send to a Gmail mailbox lands in **Inbox**, not Promotions
- [ ] Test send to an Outlook mailbox lands without a "this sender is new" warning
- [ ] [mail-tester.com](https://www.mail-tester.com) score ≥ 9/10
- [ ] Webhook endpoint registered in Resend → Webhooks pointing at
      `https://<project>.functions.supabase.co/resend-webhook`
- [ ] `LIT_RESEND_WEBHOOK_SECRET` env set on the resend-webhook edge function
- [ ] `LIT_RESEND_API_KEY` env set on the send-campaign-email edge function
- [ ] One Resend send completed end to end with the open + click events
      arriving in `lit_outreach_history`
- [ ] Daily cap row created for the Resend mailbox (start at 30)

## Troubleshooting

**Gmail shows "Be careful with this message"** — DKIM signed but DMARC
alignment failed. Usually the From header domain doesn't match the
DKIM signing domain. Make sure the Resend mailbox row's `email`
column uses the subdomain (`hello@updates.logisticintel.com`), not the
apex.

**Outlook shows "via amazonses.com"** — SPF aligned but the domain
isn't fully authenticated for Outlook. Add the BIMI record (optional)
and verify DMARC alignment is `r` (relaxed) on both `aspf` and `adkim`.

**Replies vanish** — `reply_to` defaults to the from address. If you
forwarded the from address through Resend without an inbox listener,
replies bounce. Set `reply_to` explicitly on the mailbox row.

**Webhook returns 401** — the signature check failed. Confirm
`LIT_RESEND_WEBHOOK_SECRET` matches the `whsec_…` value in the Resend
dashboard exactly. Re-roll the secret if in doubt.
