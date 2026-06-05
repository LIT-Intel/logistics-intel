# Subscriptions: pivot from user-keyed to organization-keyed

**Date originally drafted:** 2026-05-28
**Corrected:** 2026-05-30 (column name was wrong, see below)
**Status:** Phase 1 (backfill) READY TO APPLY
**Branch lock:** `claude/review-dashboard-deploy-3AmMD`
**Owner:** Auth / Access / Billing / Admin
**Blocker resolved:** B-001 (Billing page does not match Stripe)
**Severity:** P0

---

## 2026-05-30 correction

The original draft of this plan assumed `subscriptions` had a `user_id` UNIQUE NOT NULL column and no org column. Querying production showed both assumptions were wrong:

- `subscriptions` already has an **`organization_id`** column (uuid, nullable, FK to `organizations(id) ON DELETE CASCADE`) — added by an earlier migration but **never populated** for any of the 10 live rows.
- `user_id` is `UNIQUE` but **nullable**, not `NOT NULL`.
- `organizations.owner_id` exists (not `owner_user_id` as the schema map claims).
- The lifecycle-email trigger that references `NEW.organization_id` was **always correct** — it resolves to NULL today because the column is never populated, not because the column is missing. There is no trigger bug to fix.

Four migration files written 2026-05-28 (add `org_id`, rewrite the trigger to use `org_id`, RLS over `org_id`, cutover to `UNIQUE(org_id)`) were **discarded**. They would have created a duplicate column and broken the trigger.

This plan now uses `organization_id` end to end.

## Problem

Today: every active subscription has `user_id` set and `organization_id` NULL. The `get-billing-status` edge function uses a tactical owner-fallback to resolve the org owner's subscription when an invited member calls it; that works but is fragile, and the underlying data model already has the right column — it's just never written.

**Consequence for invited members of a paid org:**
1. Owner buys a plan; subscription row has `user_id = owner_id`, `organization_id = NULL`.
2. Owner invites teammate.
3. Teammate's billing page queries via `get-billing-status`, which does owner-fallback to find the right subscription. Works.
4. Any code path that bypasses `get-billing-status` and queries `subscriptions` directly returns nothing for the teammate → they see `free_trial`. B-001.

## Migration sequence

Three migration files, applied in order:

| Migration | Purpose | Status |
|---|---|---|
| `20260530120000_subscriptions_backfill_organization_id.sql` | Populate `organization_id` for all 10 existing rows from owner → org mapping. Fail-loud guard if any active row stays NULL. **APPLY NOW.** | Ready |
| `20260530130000_subscriptions_organization_id_rls.sql` | Add an `org_members`-based RLS read policy alongside the existing `user_id` one. Dual-policy during transition. **APPLY ~1 week after Phase 1 + billing-webhook deploy.** | Ready |
| `20260530140000_subscriptions_pivot_to_organization_unique.sql` | Drop the legacy `user_id` policy, make `organization_id NOT NULL`, swap the UNIQUE constraint from `user_id` to `organization_id`. **APPLY ONLY AFTER 7+ clean days post-Phase-3.** Irreversible. | Ready |

## Code changes already shipped (2026-05-30)

- **billing-webhook**: `resolveOrganizationId(sub, userId)` resolves the org via Stripe metadata (`supabase_organization_id`, legacy `supabase_org_id` accepted as fallback) then DB lookup via `org_members`. Writes `organization_id` on every event. No env flag required.
- **subscription-email-cron**: reads `organization_id` directly. No flag.
- **`_shared/billing_webhook_helpers.ts`**: extracted `resolveOrganizationIdForUser` for unit testing. 6 Deno tests cover metadata precedence, legacy key fallback, DB fallback, null path, non-string metadata, etc.

## Frontend tactical fix shipped 2026-05-28 (still relevant)

`get-billing-status` falls back to the org owner's subscription when no row exists for the current user. This works before AND after the backfill — it's a belt-and-braces fallback that handles edge cases where `organization_id` is not yet populated for a row.

`BillingNew.tsx` and `SettingsPage.tsx` no longer query `subscriptions` directly; they route through `get-billing-status`.

## Acceptance criteria

- [ ] Backfill migration applied; `select count(*) from subscriptions where organization_id is null and status in ('active','trialing','past_due')` returns 0
- [ ] Owner and every invited member of a paid org see the same plan on `/billing`
- [ ] `billing-webhook` writes `organization_id` on every event (verify via DB log: `select count(*) from subscriptions where organization_id is not null` grows over time)
- [ ] All edge function reads of `subscriptions` use `organization_id` where applicable
- [ ] No frontend file directly queries the `subscriptions` table
- [ ] RLS rejects cross-org reads (after Phase 3)
- [ ] Old `UNIQUE user_id` constraint dropped after Phase 6 ships clean for 7 days

## Effort estimate

| Phase | Work | Human | CC + gstack |
|---|---|---|---|
| 1 | Backfill (3 lines of SQL after the corrected discovery) | 5 min | done |
| 3 | Add RLS policy | 5 min | done |
| 6 | Constraint pivot | 5 min | done |
| | Code (webhook + cron + helper + tests) | 30 min | done |
| | **Total deploy work** | **~30 min** | **already shipped in code** |

## Risks

- **Stripe customer ↔ org mapping for future signups.** Today every checkout creates a Stripe customer per user. The webhook resolution preserves the current behavior (look up the user's org via `org_members`) so existing flows keep working without a Stripe data migration. If you later want one Stripe customer per org, that's a separate (one-way) migration. Recommend deferring.
- **Onboarding upserts to `subscriptions`** at signup with `plan_code: 'free_trial'`. The org bootstrap trigger creates an org per signup, so by the time the next webhook event fires, `org_members` is populated and the resolver finds the org cleanly. Not a deploy blocker.
- **Rows where the user has been removed from all their orgs** but the subscription still exists. After Phase 6, those rows fail the NOT NULL guard. Recommend a one-off `delete from subscriptions where ... status = 'expired'` cleanup before Phase 6 if any exist.

## How this gets reviewed

Run `/plan-eng-review` against this file before applying Phase 6 (the irreversible cutover). Phases 1 and 3 are additive + dual-policy and can be applied without ceremony.
