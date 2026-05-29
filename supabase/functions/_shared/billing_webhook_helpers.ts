// Pure helpers extracted from billing-webhook for unit testing. The webhook
// itself can't be unit-tested without a Stripe + PostgREST fixture; these
// helpers carry the business logic that can.

export interface ResolveOrgIdDeps {
  /** Metadata bag from the Stripe Subscription object. */
  metadata?: Record<string, unknown> | null | undefined;
  /** Fetch the user's earliest org_members.org_id. Returns null if none. */
  earliestOrgIdForUser: (userId: string) => Promise<string | null>;
}

/**
 * Resolution order:
 *   1. metadata.supabase_org_id (set by checkout-session creators that know
 *      the org upfront — preferred because it survives org-membership
 *      shuffles).
 *   2. earliest org_members row for the user (DB lookup).
 *   3. null — user has no org yet (signup before org bootstrap, etc.).
 */
export async function resolveOrgIdForUser(
  userId: string,
  deps: ResolveOrgIdDeps,
): Promise<string | null> {
  const meta = deps.metadata?.supabase_org_id;
  if (typeof meta === "string" && meta) return meta;
  return await deps.earliestOrgIdForUser(userId);
}

export interface OrgIdWriteGate {
  /** Whether to include org_id + created_by_user_id in the upsert. */
  shouldWrite: boolean;
  /** Reason — surfaced in webhook logs for forensic tracing. */
  reason: "flag_off" | "flag_on";
}

/**
 * Returns whether the billing-webhook should write org_id +
 * created_by_user_id this event. Gated behind LIT_BILLING_WEBHOOK_WRITE_ORG_ID
 * because the columns only exist after migration 20260528120000 lands.
 */
export function getOrgIdWriteGate(env: { LIT_BILLING_WEBHOOK_WRITE_ORG_ID?: string }): OrgIdWriteGate {
  if (env.LIT_BILLING_WEBHOOK_WRITE_ORG_ID === "true") {
    return { shouldWrite: true, reason: "flag_on" };
  }
  return { shouldWrite: false, reason: "flag_off" };
}
