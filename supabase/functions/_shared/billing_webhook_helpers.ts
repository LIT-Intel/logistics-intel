// Pure helpers extracted from billing-webhook for unit testing. The webhook
// itself can't be unit-tested without a Stripe + PostgREST fixture; these
// helpers carry the business logic that can.

export interface ResolveOrganizationIdDeps {
  /** Metadata bag from the Stripe Subscription object. */
  metadata?: Record<string, unknown> | null | undefined;
  /** Fetch the user's earliest org_members.org_id. Returns null if none. */
  earliestOrgIdForUser: (userId: string) => Promise<string | null>;
}

/**
 * Resolution order:
 *   1. metadata.supabase_organization_id (set by checkout-session creators that
 *      know the org upfront — preferred because it survives org-membership
 *      shuffles). Accepts legacy key `supabase_org_id` as fallback for
 *      sessions created before the 2026-05-30 standardisation.
 *   2. earliest org_members row for the user (DB lookup).
 *   3. null — user has no org yet (signup before org bootstrap, etc.).
 *
 * Mirrors billing-webhook's resolveOrganizationId so the contract is
 * exercised by tests.
 */
export async function resolveOrganizationIdForUser(
  userId: string,
  deps: ResolveOrganizationIdDeps,
): Promise<string | null> {
  const meta = deps.metadata?.supabase_organization_id
    ?? deps.metadata?.supabase_org_id;
  if (typeof meta === "string" && meta) return meta;
  return await deps.earliestOrgIdForUser(userId);
}
