// Resolves the canonical subscription row for a user, handling the org-owner
// fallback for invited members. Extracted from get-billing-status so the
// logic is testable in isolation (the function body still has Stripe + auth
// concerns that aren't unit-testable without a live infra fixture).
//
// Once Phase 6 of the subscriptions org-keyed migration lands, this helper
// becomes the org-keyed primary lookup and the user-keyed branch is the
// legacy fallback. See
// docs/superpowers/plans/2026-05-28-subscriptions-org-keyed-design.md.

export interface SubscriptionRow {
  plan_code: string | null;
  status: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean | null;
  trial_ends_at: string | null;
  seat_quantity: number | null;
}

export interface MinimalSubsDb {
  /** Look up a single subscription by user_id, returning null if no row. */
  findByUserId(userId: string): Promise<SubscriptionRow | null>;
  /** Look up the user's earliest org_id + the org's owner_user_id. */
  findOrgOwner(userId: string): Promise<{ ownerUserId: string | null }>;
}

export type SubscriptionOwner = "self" | "org_owner" | "none";

export interface ResolveResult {
  sub: SubscriptionRow | null;
  owner: SubscriptionOwner;
}

/**
 * Phase-1 resolution: user-keyed primary, org-owner fallback.
 *
 *   self      — found a row owned by the caller
 *   org_owner — caller is an invited member; resolved through their org owner
 *   none      — no row anywhere; surface free_trial defaults at the call site
 */
export async function resolveSubscriptionForUser(
  userId: string,
  db: MinimalSubsDb,
): Promise<ResolveResult> {
  const self = await db.findByUserId(userId);
  if (self) return { sub: self, owner: "self" };

  const { ownerUserId } = await db.findOrgOwner(userId);
  if (!ownerUserId || ownerUserId === userId) {
    return { sub: null, owner: "none" };
  }
  const ownerSub = await db.findByUserId(ownerUserId);
  if (!ownerSub) return { sub: null, owner: "none" };
  return { sub: ownerSub, owner: "org_owner" };
}
