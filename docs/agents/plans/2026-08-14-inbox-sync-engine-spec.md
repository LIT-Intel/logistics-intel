# Inbox Sync Engine — build spec (2026-08-14)

**Status:** BUILT & DEPLOYED 2026-08-14 (commits d62903a1, dd75c0c1, 057c51f5,
f5e59940 on main). sync-inbox edge fn deployed (v41); migrations 20260814120000
+ 20260814130000 applied; pg_cron repointed to sync-inbox @ */15 with cron auth;
Sync-now buttons + conversation-type chips shipped. Verified end to end: cron
auth OK, token refresh OK. **Remaining OWNER ACTION:** Gmail read is blocked —
connected Gmail accounts only hold `gmail.send`; reading messages needs the
RESTRICTED `gmail.readonly` scope (added to oauth-gmail-start), which Google
grants only after CASA security review. Until then Gmail sync returns 403.
Outlook already has Mail.Read and works once an Outlook account reconnects.

## Root cause (verified)
The company-profile Inbox tab and `/app/inbox` read `public.lit_email_threads`
(+ messages), but **no backend writes to it** — the table is orphaned.
- `lit_email_threads` referenced only by frontend readers (`CompanyInboxTab.tsx`,
  `InboxPage.jsx`, `companyCrm.ts`) and its creation migration
  `20260504240000_inbox_threads_messages.sql`.
- There is **no `sync-inbox` edge function** in the repo. The pg_cron job
  `lit-sync-inbox-tick` (*/5) points at `sync-inbox-cron`, which does not exist
  in `supabase/functions/` (never built or removed).
- OAuth connect DOES work: `lit_email_accounts` has connected Gmail rows
  (evan@, gabriel@, vraymond@logisticintel.com) + an Outlook row, but
  `watch_active=false` on all and `last_synced_at` stale → no watch, no pull.

Net: connect works; the engine that pulls threads into `lit_email_threads`
was never built. `lit_email_threads` schema already exists (see migration).

## What to build
A Gmail + Microsoft Graph sync engine that populates `lit_email_threads`
(+ its messages table) for each connected `lit_email_accounts` row.

1. **Token refresh helper** (`_shared`): refresh Gmail/Graph access tokens from
   stored refresh tokens; write back; mark `status='error'`+`error_message` on
   invalid_grant (surfaces "reconnect" in Settings).
2. **`sync-inbox` edge fn** (cron-auth via `_shared/cron_auth.ts`; also callable
   per-account from a "Sync now" button):
   - Gmail: `users.messages.list` (incremental via stored `gmail_history_id`;
     full backfill of last ~90d on first run), fetch message metadata+body,
     thread by `threadId`, upsert threads+messages. Store new `gmail_history_id`.
   - Outlook/Graph: `/me/messages` delta query (store `graph delta token`),
     thread by `conversationId`.
   - Dedup on provider message id. Associate a thread to a company by matching
     any participant email to `lit_contacts.email` (→ `saved_company_id`), so
     the profile Inbox tab filters correctly.
3. **Watch registration** on connect + a daily renewal cron:
   - Gmail `users.watch` (Pub/Sub topic already used by `reply-receiver`),
     store `gmail_watch_expiration`.
   - Graph subscription, store `graph_subscription_id`/`_expiration`.
4. **Repoint / create the cron**: make `lit-sync-inbox-tick` call the real
   `sync-inbox` fn (every 5–15 min), or a poll fallback when watches are down.
5. **Frontend**: wire a working "Sync now" button (per-account in Settings +
   on the Inbox); the profile Inbox tab + `/app/inbox` already read the tables.
   Revert the interim empty-state copy in `CompanyInboxTab.tsx` (currently
   "coming soon") once live.

## Constraints
- RLS: threads/messages org-scoped, EXPLICIT grants (recent grants-missing bug).
- Never store tokens in the frontend; refresh server-side only.
- Idempotent; incremental (history/delta) so re-runs are cheap.
- Respect Gmail/Graph rate limits; backfill window bounded (e.g. 90d) to cap cost.

## Related existing plumbing to reuse
- `reply-receiver` already handles Gmail Pub/Sub push (writes campaign replies to
  `lit_outreach_history`) — reuse its Pub/Sub topic + OIDC (`LIT_PUBSUB_AUDIENCE`).
- `oauth-gmail-*` / `email-oauth-*` for the connect/token surface.
- CRM Phase 3 already auto-logs replies/meetings to deal timelines; once threads
  populate, deal↔inbox cross-links (shipped) light up.
