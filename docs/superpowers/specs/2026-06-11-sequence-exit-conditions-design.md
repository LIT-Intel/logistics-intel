# Sub-project O — Sequence Exit Conditions

**Date:** 2026-06-11
**Branch lock:** `claude/review-dashboard-deploy-3AmMD`
**Scope:** Automatically remove a recipient from an active sequence when their behavior or CRM state means further sends would be wrong. Covers reply, bounce, unsubscribe, meeting-booked, and Attio funnel-stage exit. Org-wide defaults + per-campaign overrides.

## Problem

LIT currently keeps emailing recipients after they've already replied, booked a meeting, unsubscribed, or been marked Won in the CRM. Today only **reply** auto-stops (verified on Test Campaign 1.2 — vraymond's `next_send_at` went to NULL after his reply). Bounce stop is implicit via send-campaign-email's `WHERE status='queued'` filter, but the other three paths leak: meetings get booked while sends keep firing, no unsubscribe link exists, and Attio CRM changes don't propagate back.

This is the basic sales-funnel hygiene that every B2B outreach tool ships — Outreach, Apollo, Smartlead, Lemlist all have it. We have to.

## Design (locked by user picks: C / recommendations / A)

1. **Org-wide defaults + per-campaign overrides** (Q1=C). One settings row per org, optional override per campaign. Override merges atop default.
2. **Default-on auto-exits**:
   - Always on, no toggle: reply, bounce, unsubscribe
   - Default on, togglable: meeting booked, Attio "Won"-stage move
3. **Attio integration: webhook (push)** (Q3=A). New `attio-webhook` edge fn receives stage-change events from Attio's outbound webhook.

## Architecture

### Database

**New table `lit_org_exit_settings`** — one row per org:

```sql
CREATE TABLE lit_org_exit_settings (
  org_id uuid PRIMARY KEY REFERENCES org_members(org_id) ON DELETE CASCADE,
  -- always-on (these are read but immutable from the UI)
  exit_on_reply boolean NOT NULL DEFAULT true,
  exit_on_bounce boolean NOT NULL DEFAULT true,
  exit_on_unsubscribe boolean NOT NULL DEFAULT true,
  -- togglable
  exit_on_meeting_booked boolean NOT NULL DEFAULT true,
  exit_on_attio_won boolean NOT NULL DEFAULT true,
  attio_won_stages text[] NOT NULL DEFAULT ARRAY['Won','Closed Won','Customer']::text[],
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
```

**Extend `lit_campaigns`** with override jsonb:

```sql
ALTER TABLE lit_campaigns
  ADD COLUMN exit_overrides jsonb NOT NULL DEFAULT '{}'::jsonb;
-- jsonb shape (any field may be omitted → inherit from org defaults):
--   { "exit_on_meeting_booked": false, "exit_on_attio_won": true,
--     "exit_on_url_clicked": "https://example.com/pricing" }
```

**Helper SQL function `lit_effective_exit_rules(p_campaign_id uuid) RETURNS jsonb`** — merges org defaults with campaign overrides.

### New recipient exit statuses

Currently `lit_campaign_contacts.status` carries: `queued`, `pending`, `replied`, `bounced`, `unsubscribed` (today inconsistent), `sent`, `completed`, `paused`, `suppressed`. Add:
- `meeting_booked` — set by cal-webhook when matched recipient books
- `funnel_exited` — set by attio-webhook when deal moves to Won stage

The dispatcher's existing `WHERE status IN ('queued','pending')` filter excludes all exit statuses automatically. **No dispatcher code change needed.** Only the *exit triggers* need to write the right status.

### Triggers

**Reply (existing — standardize)**
- Already handled by `reply-receiver`: sets status='replied', next_send_at=NULL on matched send row's recipient
- Verify the recipient row update happens (separate from history row) — if not, add it
- Effective-rules check: skip exit if `exit_on_reply=false` (but this is always-on per design)

**Bounce (existing — standardize)**
- `resend-events-webhook` (or whichever handles email.bounced) sets recipient.status='bounced', next_send_at=NULL
- Verify and add if missing

**Unsubscribe (NEW)**
- New edge fn `unsubscribe` (verify_jwt=false, public link target)
- Token format: signed JWT containing `{campaign_id, recipient_id, exp}` — exp = launch_at + 90 days
- New table for token-revocation isn't needed; the JWT itself is the auth
- Endpoint: `GET /functions/v1/unsubscribe?token=<jwt>` → flips status, returns a confirmation HTML page
- Email body template: append `<a href="{{unsubscribe_url}}">Unsubscribe</a>` to every send via send-campaign-email's MJML/HTML rendering layer
- Effective-rules check: exit_on_unsubscribe (always true)

**Meeting booked (NEW — extends L's cal-webhook)**
- After cal-webhook attributes the meeting_booked event to a campaign + recipient (L's work), it ALSO does:
  ```sql
  UPDATE lit_campaign_contacts
  SET status='meeting_booked', next_send_at=NULL, updated_at=now()
  WHERE id = matched_recipient_id
    AND (SELECT (lit_effective_exit_rules(campaign_id) ->> 'exit_on_meeting_booked')::boolean);
  ```
- Effective-rules check ensures per-campaign override works

**Attio Won-stage (NEW)**
- New edge fn `attio-webhook` (verify_jwt=false, HMAC signature verified against `ATTIO_WEBHOOK_SECRET`)
- Receives Attio's `record.updated` events for the Deals object
- Filters: only events where `attributes.stage` changed AND new stage value matches the org's `attio_won_stages` list
- For each matching deal: extract the contact's email, find all matching recipients in lit_campaign_contacts with status IN ('queued','pending'), apply exit
- Effective-rules check: only exit if campaign's exit_on_attio_won=true

### UI

**Org settings (new section in `/app/settings`)**
- New tab "Sequence Exit Rules" (or under "Outreach")
- Renders read-only chips for the 3 always-on exits
- Toggles for meeting_booked + attio_won
- Multi-select chips for `attio_won_stages` (default ['Won','Closed Won','Customer'])
- "Save defaults" button writes to lit_org_exit_settings

**Campaign builder (new section)**
- New expandable panel below ScheduleStrip: "Exit conditions"
- Header: "Recipients automatically exit this sequence when:"
- Lines for the 3 always-on (greyed out)
- Toggles for meeting_booked + attio_won, each labeled "Inheriting org default: <ON/OFF>" with override switch
- Optional: "Also exit when a recipient clicks a specific URL" — adds to `extra_exit_rules` jsonb

**Recipient drill-in (existing EngagementDrillIn)**
- Add a "Remove from sequence" button per recipient (manual exit)
- Sets status='manual_exit', next_send_at=NULL

### API surface

- `GET /rest/v1/lit_org_exit_settings?org_id=eq.<x>` — reads (RLS-gated to org members)
- `PATCH /rest/v1/lit_org_exit_settings` — writes
- `PATCH /rest/v1/lit_campaigns?id=eq.<x>` — extends to include exit_overrides
- `POST /functions/v1/unsubscribe?token=<jwt>` — public unsubscribe handler
- `POST /functions/v1/attio-webhook` — Attio push receiver
- `POST /functions/v1/recipient-exit-manual` — manual remove (authed)

## Data flow (example: Attio Won-stage)

```
User marks deal "Won" in Attio
  ↓
Attio fires record.updated webhook
  ↓ HTTPS POST → /functions/v1/attio-webhook
attio-webhook:
  1. Verifies HMAC signature
  2. Extracts deal.email + new_stage
  3. Reads lit_org_exit_settings.attio_won_stages — checks new_stage ∈ list
  4. Finds active recipients matching email
  5. For each: checks effective rules per campaign → if exit_on_attio_won=true, applies exit
  6. Writes lit_outreach_history event_type='funnel_exit', metadata={attio_deal_id, new_stage}
  ↓
Dispatcher tick (every min): WHERE status IN ('queued','pending')
  → No longer matches the exited recipient → no further sends
```

## Error handling + edge cases

| Case | Behavior |
|---|---|
| Multiple recipients across multiple campaigns match the same email at Attio-Won time | All get exited (correct — same person shouldn't be in multiple active sequences after Won) |
| Org has no row in lit_org_exit_settings | Lazy-create on first read with all defaults |
| Campaign's exit_overrides jsonb has malformed keys | lit_effective_exit_rules ignores unknown keys, falls back to org defaults |
| Attio webhook HMAC fails | 401, log to Sentry |
| Unsubscribe token expired | 410 Gone, HTML page says "this link has expired" |
| Recipient already in exit status when new exit event arrives | UPDATE is idempotent — status stays in current exit state, no error |
| Manual remove on a recipient that already replied | Status flips to 'manual_exit' (overrides 'replied' for clarity, but lit_outreach_history preserves both events) |

## Testing — simulation matrix (REQUIRED before deploy)

Per user gate: "debug and run simulations before you deploy anything."

For each exit path, the implementer must produce a synthetic-test result in their report:

| # | Trigger | Simulation method | Expected state change | Verify dispatcher skips |
|---|---|---|---|---|
| 1 | Reply | Insert synthetic 'replied' status row, call reply-receiver fn with mock payload | recipient.status='replied', next_send_at=NULL | Wait 90s post-fix, check no new 'sent' event in history |
| 2 | Bounce | POST mock Resend bounce webhook | recipient.status='bounced', next_send_at=NULL | Same |
| 3 | Unsubscribe | Generate test JWT token, call /unsubscribe?token=<jwt> | recipient.status='unsubscribed', next_send_at=NULL | Same |
| 4 | Meeting booked | POST mock Cal.com webhook with attendee email matching a recipient | recipient.status='meeting_booked', next_send_at=NULL | Same |
| 5 | Attio Won | POST mock Attio webhook with deal.email matching a recipient and new_stage='Won' | recipient.status='funnel_exited', next_send_at=NULL | Same |
| 6 | Manual exit | Call recipient-exit-manual fn with auth | recipient.status='manual_exit', next_send_at=NULL | Same |
| 7 | Per-campaign override OFF | Same as #4 but with campaign.exit_overrides={"exit_on_meeting_booked":false} | recipient.status UNCHANGED (still queued) | Dispatcher CONTINUES sending |

All 7 must PASS for the dispatch to be reported DONE. Synthetic data cleaned up after each test.

## Out of scope (deferred to O.2)

- "Smart exits" based on engagement scoring (high open + high click = exit to "warm" bucket)
- Exit on inactivity (no opens for N days)
- Resume-from-exit (re-enroll after a cooldown)
- Sequence-of-sequences (recipient exits one → enrolls in another, beyond the click-no-book trigger which we have)

## Files touched

| File | Action |
|---|---|
| `supabase/migrations/2026-06-11_*_add_exit_settings.sql` | CREATE — lit_org_exit_settings, lit_campaigns.exit_overrides, lit_effective_exit_rules() |
| `supabase/functions/unsubscribe/index.ts` | CREATE — public unsub endpoint |
| `supabase/functions/attio-webhook/index.ts` | CREATE — Attio receiver |
| `supabase/functions/recipient-exit-manual/index.ts` | CREATE — manual exit handler |
| `supabase/functions/cal-webhook/index.ts` | MODIFY — after attribution, apply exit per effective rules |
| `supabase/functions/reply-receiver/index.ts` | MODIFY — apply exit to recipient row (was only updating send row) |
| `supabase/functions/resend-events-webhook/index.ts` | MODIFY — apply exit on bounce |
| `supabase/functions/send-campaign-email/index.ts` | MODIFY — inject `{{unsubscribe_url}}` template variable when building each email body |
| `frontend/src/pages/Settings.jsx` (or new `OutreachSettings.tsx`) | MODIFY — new "Sequence Exit Rules" tab |
| `frontend/src/features/outbound/components/ExitConditionsPanel.tsx` | CREATE — campaign builder panel |
| `frontend/src/pages/CampaignBuilder.jsx` | MODIFY — mount panel below ScheduleStrip |
| `frontend/src/features/outbound/components/EngagementDrillIn.tsx` | MODIFY — per-recipient "Remove from sequence" button |

12 files. 1 migration. 6 edge fns (3 new, 3 modified).

## Acceptance

- [ ] Reply → recipient stops getting sends (verify on Test Campaign 1.2 evan equivalent)
- [ ] Bounce → same
- [ ] Unsubscribe link in every sent email; click stops sends
- [ ] Cal.com booking stops sends (when meeting_booked exit enabled)
- [ ] Attio deal moved to Won → stops sends (when attio_won exit enabled)
- [ ] Manual "Remove from sequence" button in drill-in works
- [ ] Per-campaign override toggle works (verified in simulation #7)
- [ ] Org settings UI saves + reloads
- [ ] All 7 simulations PASS in implementer's report
- [ ] Vercel production deploy READY
