# Subscriptions: pivot from user-keyed to org-keyed

**Date:** 2026-05-28
**Status:** PLAN — awaiting approval
**Branch lock:** `claude/review-dashboard-deploy-3AmMD`
**Owner:** Auth / Access / Billing / Admin
**Blocker resolved:** B-001 (Billing page does not match Stripe)
**Severity:** P0

---

## Problem

The `subscriptions` table is currently keyed `UNIQUE user_id` ([20260403_006_create_subscriptions_table.sql](../../../supabase/migrations/20260403_006_create_subscriptions_table.sql)):

```sql
user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE
```

RLS is scoped to `user_id = auth.uid()`. Every read in the codebase uses `.eq('user_id', ...)`:

- `frontend/src/pages/BillingNew.tsx:212`
- `frontend/src/pages/SettingsPage.tsx:247`
- `frontend/src/pages/OnboardingFlow.tsx:215` (write)
- `supabase/functions/get-billing-status/index.ts:133`
- `supabase/functions/pulse-search/index.ts` (deployed copy)
- `supabase/functions/subscription-email-cron/index.ts` (references `organization_id` field that doesn't exist — secondary bug)

**Consequence for invited members of a paid org:**
1. Org owner buys a plan → row written for `user_id = owner_id`
2. Owner invites teammate → new `auth.users` row
3. Teammate opens Billing → `subscriptions.user_id = teammate_id` returns nothing
4. Teammate sees `free_trial` on the billing page despite being on a paid plan
5. Teammate hits paid feature gates that succeed/fail inconsistently depending on whether the check goes through `get-entitlements` (which org-resolves) or a stale per-user query

**This is B-001 — "Billing page does not match Stripe."** The Stripe webhook is correct. The data model itself is broken for orgs.

**Schema map drift:** [LIT_SCHEMA_MAP.md](../../agents/LIT_SCHEMA_MAP.md) documents `subscriptions.org_id` as the canonical key. The doc is aspirational; the migration never landed.

## Tactical patch already shipped (2026-05-28)

`get-billing-status` now falls back to the org-owner subscription when no row exists for the current user. `BillingNew.tsx` and `SettingsPage.tsx` no longer query `subscriptions` directly — they go through `get-billing-status`. Frontend rule documented in [CLAUDE.md](../../../CLAUDE.md).

This **unblocks invited-member billing today** without a migration. It does not fix:
- Direct `subscriptions` queries in edge functions (cron, search, admin)
- The structural assumption that one user = one subscription (blocks seat-based pricing, ownership transfer, future SCIM)

## Durable structural fix (this plan)

### Goal

`subscriptions` becomes org-keyed: one row per active subscription per org. `user_id` is retained as `created_by_user_id` for audit but is no longer the lookup key or RLS subject.

### Migration sequence

**Phase 1 — schema (additive, zero downtime)**
1. New migration: add `org_id uuid REFERENCES organizations(id) ON DELETE CASCADE` to `subscriptions`. Nullable for now.
2. Add `idx_subscriptions_org_id` index.
3. Add `created_by_user_id uuid REFERENCES auth.users(id)` (alias for the legacy `user_id`).

**Phase 2 — backfill**
```sql
UPDATE subscriptions s
SET org_id = o.id,
    created_by_user_id = s.user_id
FROM organizations o
WHERE s.org_id IS NULL
  AND o.owner_user_id = s.user_id;

-- For any sub whose user_id is not an org owner, attribute to their first org.
UPDATE subscriptions s
SET org_id = om.org_id,
    created_by_user_id = s.user_id
FROM org_members om
WHERE s.org_id IS NULL
  AND om.user_id = s.user_id
  AND om.role IN ('owner','admin');
```
Manually triage remaining `org_id IS NULL` rows (test accounts, deleted orgs).

**Phase 3 — RLS update**
```sql
DROP POLICY IF EXISTS "Users can read their own subscription" ON subscriptions;
CREATE POLICY "Org members can read their org subscription"
  ON subscriptions FOR SELECT TO authenticated
  USING (
    org_id IN (
      SELECT org_id FROM org_members WHERE user_id = auth.uid()
    )
  );
```
Same pattern for INSERT/UPDATE (admin-only via `org_members.role IN ('owner','admin')`).

**Phase 4 — billing-webhook writes**
Update `supabase/functions/billing-webhook/index.ts` so every event resolves `stripe_customer_id → org_id` (via a `stripe_customer_id_to_org_id` lookup or by storing `org_id` in checkout session `metadata`) and writes that to the row. Continue writing `created_by_user_id` for audit.

**Phase 5 — read migration (parallel, can ship per-call)**
Replace `.eq('user_id', X)` with `.in('org_id', userOrgIds)` or `.eq('org_id', orgId)` in:
- `supabase/functions/get-billing-status/index.ts` (already has tactical fallback — replace with primary org_id lookup)
- `supabase/functions/pulse-search/index.ts`
- `supabase/functions/subscription-email-cron/index.ts` (also fix the bogus `organization_id` reference)
- `supabase/functions/admin-api/index.ts`
- `frontend/src/pages/OnboardingFlow.tsx` (write path on signup — upsert by `org_id`)

**Phase 6 — drop unique constraint on user_id**
Once all reads/writes are org-keyed and all rows have `org_id`, drop the `UNIQUE user_id` constraint and add `UNIQUE org_id`. Keep `user_id` column as nullable audit field.

### Rollback posture

- Each phase is independently revertible.
- RLS migration in phase 3 keeps the old policy until after the read migration in phase 5 — runs both policies during transition.
- If Stripe webhook writes start failing, the tactical fallback in `get-billing-status` still resolves invited members → no user-visible regression.

### Acceptance criteria

- [ ] Owner and every invited member of a paid org see the same plan + status on `/billing`
- [ ] Seat count derives from `org_members` count, capped at `plans.included_seats`
- [ ] `billing-webhook` writes `org_id` on every event
- [ ] All edge function reads of `subscriptions` use `org_id`
- [ ] No frontend file directly queries the `subscriptions` table
- [ ] RLS rejects cross-org reads
- [ ] Backfill leaves no `org_id IS NULL` rows for active subscriptions
- [ ] Old `UNIQUE user_id` constraint dropped after phase 5 ships clean for 7 days

### Effort estimate

| Phase | Work | Human | CC + gstack |
|---|---|---|---|
| 1 | Schema migration | 30 min | 5 min |
| 2 | Backfill SQL + dry-run on staging | 2 h | 20 min |
| 3 | RLS policy update | 1 h | 10 min |
| 4 | billing-webhook rewrite | 4 h | 30 min |
| 5 | Read migration across ~6 surfaces | 1 day | 1 h |
| 6 | Constraint pivot | 30 min | 5 min |
| | **Total** | **~2 days** | **~2 h** |

### Risks

- Stripe customer → org mapping must be unambiguous. Today every checkout creates a Stripe customer per user. To make `stripe_customer_id` org-unique we either (a) reuse the org owner's customer for the whole org or (b) accept multiple customers per org and treat the active subscription's customer as canonical. **Recommend (a)** — Stripe customer = org. Migrate existing data by merging customers via Stripe API where safe.
- Onboarding currently upserts `subscriptions` on user signup with `plan_code: 'free_trial'`. Pivot this to upsert by org_id after the org bootstrap trigger runs (the trigger already creates an org per signup — confirmed in `20260410_003_auto_org_bootstrap.sql`).
- `cancel-subscription` and `billing-portal` edge functions assume per-user subscription — re-audit during phase 5.

### Decisions needed before phase 1

1. **Stripe customer model:** one per org (recommended) vs one per user. Affects the data migration shape.
2. **What to do with existing subscriptions where the org has been deleted but the user remains.** Default: archive the row, treat the user as `free_trial`.
3. **Whether to ship phases 1–5 behind a feature flag.** Recommend: no flag, ship phase-by-phase with the dual-policy overlap providing the safety net.

## How this gets reviewed

Run `/plan-eng-review` against this file before touching production data. The migration is reversible but the Stripe customer merge is one-way. Treat as a one-way door.
