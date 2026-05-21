# LIT Outreach Engine — Phase 1 Design

**Status:** Approved (2026-05-20)
**Goal:** Complete the half-built LIT campaign pipeline so the 4-email broker/forwarder sequences actually deliver end-to-end without third-party outreach platforms.

---

## Background

The campaign builder UI is polished and the data model is in place (`lit_campaigns`, `lit_campaign_steps`, `lit_campaign_contacts`, `lit_outreach_history`). But the send pipeline is incomplete:

1. **No scheduled dispatcher.** `send-campaign-email` runs only on manual HTTP trigger. Day-1 emails maybe send. Days 4 / 8 / 14 never fire. Recipients sit at `next_send_at` indefinitely.
2. **No mailbox throttling or domain warmup.** 200 leads through one Gmail in the same minute → Google flags spam → mailbox restricted within an hour. Fresh domains get nuked on first batch.
3. **No reply detection.** Resend webhooks tell us opens/clicks/bounces but never replies. Users have to manually check Gmail.
4. **Suppression list not enforced.** The marketing-side `lit_email_suppression_status` RPC exists but the campaign dispatcher doesn't call it. CAN-SPAM exposure.
5. **Pulse → campaign is a multi-screen flow.** From Pulse Quick Card to a launched campaign is ~6 clicks across 3 pages.

A vendor integration (Lemlist) was evaluated and ruled out because per-user paid seats don't fit LIT's audience or pricing. Decision: build it inside LIT.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                          Campaign Builder UI                        │
│           (existing, unchanged in Phase 1 except new "Send"         │
│            button in Pulse Quick Card)                              │
└──────────────────────────┬──────────────────────────────────────────┘
                           │ launch
                           ▼
            ┌─────────────────────────────┐
            │  queue-campaign-recipients  │  (existing)
            │  enrich-campaign-contacts   │  (existing)
            └──────────────┬──────────────┘
                           │ writes lit_campaign_contacts with next_send_at
                           ▼
   ┌────────────────────────────────────────────────────────┐
   │  pg_cron tick @ */1 * * * *                            │
   │    → POST /send-campaign-email (extended)              │
   │       ├─ pulls all rows where next_send_at < now()     │
   │       ├─ checks suppression  (NEW)                      │
   │       ├─ checks mailbox cap  (NEW)                      │
   │       ├─ sends via Gmail/Outlook/Resend                 │
   │       ├─ writes lit_outreach_history                    │
   │       └─ advances or terminates recipient               │
   └────────────────────────────────────────────────────────┘
                           │
                           ▼
   ┌────────────────────────────────────────────────────────┐
   │  Gmail Watch / Outlook Graph subscriptions (NEW)        │
   │   → POST /reply-receiver                                │
   │       ├─ correlates inbound message → lit_outreach_…    │
   │       ├─ pauses recipient sequence                      │
   │       ├─ writes lit_notifications + timeline event      │
   │       └─ surfaces in /app/campaigns/[id] Replies tab    │
   └────────────────────────────────────────────────────────┘
```

---

## Component A — Scheduled dispatcher

**Edge function:** keep the existing `send-campaign-email` name and extend its behavior. No rename — too many callers in the repo depend on the function URL and changing it risks dead references.

**Cron:** `pg_cron` job firing every minute, calls dispatcher via `pg_net.http_post`.

**Dispatcher loop (per tick):**

```sql
-- Pseudocode for the recipient query
SELECT cc.*, cs.*, c.user_id, c.metrics->>'sender_account_id' as sender_id
  FROM lit_campaign_contacts cc
  JOIN lit_campaigns c        ON c.id = cc.campaign_id
  JOIN lit_campaign_steps cs  ON cs.campaign_id = cc.campaign_id
                              AND cs.step_order = cc.next_step_order
 WHERE c.status = 'active'
   AND cc.status IN ('pending','sending')
   AND cc.next_send_at <= now()
   AND cc.next_send_at > now() - interval '24 hours'  -- skip stale
 ORDER BY cc.next_send_at
 LIMIT 500;  -- per-tick batch cap
```

For each recipient:
1. **Suppression check** — call `lit_email_suppression_status(email)`; if suppressed, mark recipient `status='suppressed'`, skip.
2. **Mailbox cap check** — see Component B. If over cap, push `next_send_at` forward by jittered interval, skip.
3. **Render** — apply merge-vars, run `validateEmailHtml`.
4. **Send** — through Gmail API / Outlook Graph / Resend depending on `sender_account.provider`.
5. **Log** — insert `lit_outreach_history` row (event_type='sent', provider_event_id from response).
6. **Advance** — if more steps remain: set `next_step_order++`, `next_send_at = now() + step.delay`. Else: mark recipient `status='completed'`.

**Idempotency:** dispatcher acquires a row-level advisory lock per recipient before sending; double-tick can't double-send.

---

## Component B — Mailbox throttling + warmup ramp

**Schema additions** (one migration):

```sql
alter table lit_email_accounts add column
  daily_send_cap      int     default 50,
  hourly_send_cap     int     default 20,
  warmup_started_at   timestamptz,
  warmup_complete     boolean default false,
  -- maintained by daily cron
  sent_today          int     default 0,
  sent_this_hour      int     default 0,
  last_send_at        timestamptz;
```

**Warmup curve** (per mailbox, from `warmup_started_at`):

| Days since start | Daily cap |
|---|---|
| 1-3   | 10 |
| 4-7   | 25 |
| 8-14  | 50 |
| 15-21 | 100 |
| 22-30 | 150 |
| 30+   | 200 (or user override) |

User can manually set `warmup_complete=true` for established mailboxes to skip the ramp.

**Throttle decision** (called inside dispatcher loop):
```
allowed = (sent_today < daily_send_cap) && (sent_this_hour < hourly_send_cap)
delay_until_next_slot = 60s / hourly_send_cap (jittered ±20s)
```

If `!allowed`: push `next_send_at = now() + 1 hour` and skip recipient this tick.

**Daily reset cron:** `0 0 * * *` UTC resets `sent_today=0` and bumps warmup-ramp tier if applicable.

---

## Component C — Reply detection

Three paths, one per provider:

**Gmail (most common):**
- On user mailbox connect: call `users.watch` on the user's inbox with topic = `lit-gmail-replies` (a Pub/Sub topic).
- Pub/Sub push subscription forwards messages to `/reply-receiver` edge fn.
- Receiver calls `users.messages.get` to fetch the message, checks `In-Reply-To` or `References` header against `lit_outreach_history.provider_message_id`.
- On match: see "Common reply handling" below.

**Outlook (Microsoft Graph):**
- On connect: `POST /subscriptions` with `resource=me/mailFolders('Inbox')/messages`, `changeType=created`, `notificationUrl=/reply-receiver`.
- Renew subscription every 60h (Graph max lifetime is 3 days for messages).
- Receiver receives notification, fetches message, matches by header.

**Resend-sent mail (where the user used Resend not their own mailbox):**
- Replies don't come back through Resend (it's send-only). We set `Reply-To: <user_email>` on Resend sends so replies go to the user's actual Gmail/Outlook. If that Gmail/Outlook is *also* connected for OAuth, the Gmail Watch path catches it.
- If the user only uses Resend (no OAuth mailbox connected), we can't see replies. Surface this in settings: "Connect Gmail or Outlook to track replies on Resend-sent campaigns."

**Common reply handling:**
1. Insert `lit_outreach_history` row with `event_type='replied'`.
2. Update `lit_campaign_contacts.status='replied'`, freeze `next_send_at`.
3. Insert `lit_notifications` row for the campaign owner.
4. Emit a `lit_company_timeline_events` row visible on the company's profile.

**Subscription renewal cron:** `0 */6 * * *` checks Graph + Pub/Sub watch expiry, renews 24h before lapse.

---

## Component D — Suppression / unsubscribe wiring

**Already exists** (from the marketing-side build): `lit_email_suppression_status(p_email)` RPC returns `{ converted, unsubscribed, bounced, complained }`.

**Wire it in:**
1. **Dispatcher pre-send check** (Component A step 1) — call before every send.
2. **Unsubscribe footer** — every campaign email already has the unsubscribe link via `wrapV7`. The link routes to `/email-preferences?token=<signed>` which writes to `lit_email_preferences`. Confirm this is in the wrapV7 template (audit says it's in marketing templates, verify campaign templates inherit).
3. **One-click unsubscribe header** — add `List-Unsubscribe` + `List-Unsubscribe-Post` headers to outbound (Gmail/Yahoo require these as of Feb 2024 for bulk senders).

**No schema changes** — using existing tables.

---

## Component E — Pulse "Send to outreach" 1-click flow

**New Quick Card action** between Save and Add to List:

```
[ Save ]  [ Send to outreach ]  [ Add to list ]
              ↓
   ┌─────────────────────────────────────────────────┐
   │  Send 3 contacts at Patagonia                   │
   ├─────────────────────────────────────────────────┤
   │  Template      ◉ Freight broker (4 emails)      │
   │                ○ Freight forwarder (4 emails)   │
   │                ○ Pick existing campaign…        │
   │                                                 │
   │  Send from     [ user@sparkfusion.com ▾ ]       │
   │                                                 │
   │  Recipients                                     │
   │   ☑ Sarah Chen — VP Supply Chain                │
   │   ☑ Marcus Reed — Director Ops                  │
   │   ☑ Lia Park — Procurement Mgr                  │
   │                                                 │
   │  ℹ️  Sequence: today, +3d, +7d, +14d            │
   │     Replies pause that recipient automatically  │
   │                                                 │
   │  [Cancel]                       [Start outreach]│
   └─────────────────────────────────────────────────┘
```

**Backend flow on Start:**
1. **Enrich any unrevealed emails** via existing `apollo-contact-enrich`.
2. **Create-or-find campaign:**
   - If "Pick existing": attach company + contacts to that campaign (existing `attachCompaniesToCampaign`).
   - If "Freight broker/forwarder": create new `lit_campaigns` row with `status='active'`, name = "{Company} — Broker outreach", seed `lit_campaign_steps` from the 4-email template registry.
3. **Queue recipients** — call existing `queue-campaign-recipients` with the contact IDs + sender_account_id.
4. **Dispatcher picks up on next tick** (≤60s).

**No new edge function** — composes existing pieces.

---

## Component F — Reply notifications + Replies tab

**Notifications bell** (already exists per the audit):
- New `lit_notifications` row on every reply.
- Bell badge increments; click opens panel; clicking the notification deep-links to the company profile.

**Campaign page Replies tab** (`/app/campaigns/[id]`):
- New tab next to existing Overview / Audience / Steps tabs.
- Reads `lit_outreach_history WHERE campaign_id=$1 AND event_type='replied'` joined to `lit_campaign_contacts` for the contact + company.
- Shows: timestamp, contact name + company, snippet (from `payload->>'snippet'`), "Open in Gmail/Outlook" deep link.
- **Full thread view is out of scope** — Phase 2 builds that via Gmail/Outlook conversation API.

**Company timeline entry:**
- Reuses the existing `lit_company_timeline_events` table (audit confirms it).
- Reply rows render with a `↩️` icon and "{Contact} replied to {Campaign}" copy.

---

## Schema changes summary

**One migration** (`alter_lit_email_accounts_warmup.sql`):
```sql
alter table lit_email_accounts add column
  daily_send_cap      int     default 50,
  hourly_send_cap     int     default 20,
  warmup_started_at   timestamptz,
  warmup_complete     boolean default false,
  sent_today          int     default 0,
  sent_this_hour      int     default 0,
  last_send_at        timestamptz;
```

**No other schema work.** Everything else uses tables that already exist.

---

## Out of scope (Phase 2+)

- **LinkedIn outreach automation** — no clean path without browser-extension dependency. Phase 1 leaves LinkedIn steps in the schema unused; UI can later add a "Copy LinkedIn message" button that opens `linkedin.com/messaging` with the message pre-copied to clipboard.
- **Full inbox / thread view** in LIT for replies (Phase 1 = notification + deep-link out).
- **Sender rotation** (mailbox A → B failover when A is throttled).
- **Conditional branching** beyond pause-on-reply (e.g., "if-clicked-then-step-X").
- **A/B beyond subject** (multivariate body, send-time optimization).
- **Pulse list bulk send** (Phase 1 = one company at a time from Quick Card; bulk push from a Pulse list is Phase 2).

## Out of scope (never)

- Routing all LIT users' email through a single shared mailbox.
- Building our own browser extension for LinkedIn.
- Direct SMTP servers — always go through provider APIs (Gmail / Outlook / Resend) for deliverability + IP reputation.

---

## Phase 1 acceptance criteria

A user can:

1. Connect their Gmail or Outlook mailbox in Settings → Integrations.
2. Run a Pulse search, click "Send to outreach" on a company card, pick the broker template, click Start.
3. Receive the Day 1 email in their test inbox within ~60 seconds.
4. Receive Days 4 / 8 / 14 emails on the correct days, throttled, never more than 20/hour from their mailbox.
5. Reply to one of the campaign emails from the recipient side → see a bell notification within 30 seconds → that recipient's remaining steps are paused.
6. Click "Unsubscribe" in a campaign email → that email is added to suppression → future sends to that address are blocked across all campaigns.
7. Visit `/app/campaigns/[id]/replies` and see the reply they just sent.

If all 7 work end-to-end, Phase 1 ships.

---

## Resolved decisions (2026-05-20)

1. **Resend stays internal-only.** Resend is the LIT-side channel for marketing emails and platform comms (signup, trial, lifecycle). It is **not** a user-selectable sender for outreach campaigns. The dispatcher does NOT need a Resend send code path — campaign sending is Gmail/Outlook only. Existing Resend edge functions (`subscription-email-cron`, marketing dispatchers) are unaffected.

2. **Daily send cap default = 50/day.** Post-warmup. Conservative to protect deliverability. Per-mailbox override stored on `lit_email_accounts.daily_send_cap` so users can raise it manually for known-good mailboxes. No Settings UI for it in Phase 1 — admin can edit directly via SQL or we expose later.

3. **Pub/Sub topic for Gmail Watch — investigation task.** Unknown whether the GCP project has a topic + service account set up. First implementation task should verify and, if missing, provision: one topic `lit-gmail-replies` + push subscription pointing at `/reply-receiver` edge fn + service-account permissions for Gmail Watch to publish.

## Implications of decision 1 (Resend only internal)

Component A dispatcher loop step 4 (**Send**) — simplifies to:
```
provider = sender_account.provider  // 'gmail' | 'outlook'
if provider === 'gmail':  send via gmail.users.messages.send (existing OAuth token)
if provider === 'outlook': send via Microsoft Graph /me/sendMail (existing OAuth token)
```
No `else` branch — campaigns without a connected Gmail/Outlook mailbox cannot launch. Campaign Builder UI should hide/disable the launch button until a user mailbox is connected.
