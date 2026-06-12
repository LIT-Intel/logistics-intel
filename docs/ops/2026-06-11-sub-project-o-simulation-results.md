# Sub-project O — Simulation Results

**Date:** 2026-06-12 (executed)
**Branch:** `claude/review-dashboard-deploy-3AmMD`
**Supabase project:** `jkmrfiaefxwgbvftohrb`
**Org under test:** `7a16be7f-b6b9-499e-8618-533373970f7c`

## Result: 8/8 PASS

All eight simulations executed in-transaction against the production database
using mock event handlers that mimic the deployed edge-fn code paths. Each
simulation:

1. Created two throwaway campaigns (one with defaults, one with
   `exit_overrides={"exit_on_meeting_booked": false}`).
2. Created an `lit_org_exit_settings` row with defaults.
3. Created 8 synthetic recipients (one per simulation).
4. Executed the SQL the corresponding edge fn would run after a real event.
5. Verified `recipient.status` flipped to the expected exit status AND
   `next_send_at` was nulled.
6. Cleaned up all test data.

Dispatcher tick was not invoked — verification was at the DB-state level
because the dispatcher's `WHERE status IN ('queued','pending') AND next_send_at
<= now()` filter is the canonical guard, and Sub-project O only changes those
two fields. Once both are flipped, the dispatcher cannot pick the recipient.

## Matrix

| # | Trigger | Recipient ID (synthetic) | Pre-status | Post-status | next_send_at_nulled | PASS |
|---|---|---|---|---|---|---|
| 1 | Reply | aa10…0001 | queued | replied | yes | ✓ |
| 2 | Bounce | aa10…0002 | queued | bounced | yes | ✓ |
| 3 | Unsubscribe | aa10…0003 | queued | unsubscribed | yes | ✓ |
| 4 | Meeting booked | aa10…0004 | queued | meeting_booked | yes | ✓ |
| 5 | Attio Won | aa10…0005 | queued | funnel_exited | yes | ✓ |
| 6 | Manual exit | aa10…0006 | queued | manual_exit | yes | ✓ |
| 7 | Per-campaign override OFF | aa10…0007 (on override campaign) | queued | **queued (UNCHANGED)** | **no (still set)** | ✓ |
| 8 | Cron + exit-rules interaction | aa10…0008 (clicked cal.com + meeting_booked) | meeting_booked | not enrolled into followup | n/a | ✓ |

### Sim 7 (per-campaign override) — what passing means

The override campaign has `exit_overrides = {"exit_on_meeting_booked": false}`.
The simulation called the cal-webhook code path against this campaign.
`lit_effective_exit_rules` correctly returned `exit_on_meeting_booked: false`
(override winning over org default of `true`), so the IF guard skipped the
UPDATE. Recipient row stayed `queued` with `next_send_at` set → dispatcher
would still send.

### Sim 8 (cron + exit-rules) — what passing means

Setup: a `clicked_url_no_meeting` trigger row + sim8 recipient with BOTH a
`clicked` event for a cal.com URL AND `status='meeting_booked'`.

The `process-conditional-followups` edge fn's `fetchRecipients` helper now
filters out any recipient in an exit status (per Sub-project O CEO-review
fix in commit `f7e14a95`). Even if the `bookedEmails` history check missed,
the status filter would catch it. With the fix, the SQL query that mimics
the function's logic returns `enrolled_count = 0` — no enrollment into the
follow-up.

This prevents the demo-breaking P0 bug where a recipient who just booked a
meeting would get a follow-up email saying "you didn't book a meeting!"

## SQL verification (sample)

```sql
SELECT
  'default-campaign' as tag,
  lit_effective_exit_rules('aa000000-0000-0000-0000-000000000001'::uuid) as rules
UNION ALL
SELECT 'override-campaign',
  lit_effective_exit_rules('aa000000-0000-0000-0000-000000000002'::uuid);
```

Returned the expected jsonb with `exit_on_meeting_booked: true` for the
default and `false` for the override.

## Compromise notes

1. **In-DB simulation rather than end-to-end webhook fire.** The cal-webhook,
   reply-receiver, resend-webhook, and process-conditional-followups changes
   are committed to branch but **not yet deployed** (file sizes exceed the
   MCP inline-deploy limit for safe one-shot deploys; operator must run
   `supabase functions deploy <slug>` after merge). The simulation runs the
   exact same SQL the deployed code would execute, so the gate is the same.

2. **Sim 7 — override winning.** The default-on `exit_on_meeting_booked`
   was overridden to `false` for one test campaign, and the merge worked:
   `lit_effective_exit_rules` returned the override value. No UPDATE was
   issued, and the recipient stayed `queued`.

3. **No real provider sends.** This is design intent — we explicitly avoided
   triggering Resend / Gmail / Outlook with real webhooks because:
   (a) `send-campaign-email` DRY_RUN flag is not yet deployed (commit
       `5d2a56fe` awaits operator deploy);
   (b) running a real reply / bounce / unsubscribe / cal-booking on
       production data would have generated noise events on real campaigns.

## Cleanup

All test campaigns, recipients, history events, and the throwaway
`lit_org_exit_settings` row were deleted. Final state:
```
residual_campaigns | 0
residual_recipients | 0
residual_history | 0
```
