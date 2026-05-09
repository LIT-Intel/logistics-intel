/**
 * Server-side entitlement validation
 * Single source of truth for plan features and usage limits
 * This replaces frontend-only validation with database-backed checks
 */

import { supabase } from './supabase';
import type { PlanCode, FeatureKey, UsageLimitKey } from './planLimits';

export interface PlanDefinition {
  code: PlanCode;
  name: string;
  features: Record<FeatureKey, boolean>;
  usage_limits: Record<UsageLimitKey, number | null>;
  seat_rules: {
    min: number;
    max: number | null;
    default: number;
  };
  per_seat_pricing: boolean;
  price_monthly: number | null;
  price_yearly: number | null;
}

export interface SubscriptionData {
  plan_code: PlanCode;
  status: string;
  seats: number;
  current_period_start: string;
  current_period_end: string;
  cancel_at_period_end: boolean;
  stripe_customer_id?: string;
  stripe_subscription_id?: string;
}

export interface EntitlementCheck {
  allowed: boolean;
  reason?: string;
  feature_available?: boolean;
  usage_remaining?: number;
  usage_limit?: number | null;
}

/**
 * Fetch plan definition from database (cached in-memory)
 */
let planCache: Map<string, PlanDefinition> | null = null;

async function fetchPlansFromDatabase(): Promise<Map<string, PlanDefinition>> {
  if (planCache) return planCache;

  try {
    const { data, error } = await supabase
      .from('plans')
      .select('code, name, features, usage_limits, seat_rules, per_seat_pricing, price_monthly, price_yearly')
      .eq('is_active', true);

    if (error) throw error;

    planCache = new Map();
    (data || []).forEach((plan: any) => {
      planCache!.set(plan.code, {
        code: plan.code,
        name: plan.name,
        features: plan.features || {},
        usage_limits: plan.usage_limits || {},
        seat_rules: plan.seat_rules || { min: 1, max: 1, default: 1 },
        per_seat_pricing: plan.per_seat_pricing || false,
        price_monthly: plan.price_monthly,
        price_yearly: plan.price_yearly,
      });
    });

    return planCache;
  } catch (error) {
    console.error('[serverEntitlements] Failed to fetch plans:', error);
    // Fallback to safe defaults
    return new Map();
  }
}

/**
 * Get plan definition by code
 */
export async function getPlanDefinition(planCode: string): Promise<PlanDefinition | null> {
  const plans = await fetchPlansFromDatabase();
  return plans.get(planCode) || null;
}

// Subscription statuses that gate the user out of paid features.
// 'trialing' and 'active' are the two statuses that grant access; every
// other status blocks feature use until the user subscribes/reactivates.
// Set comparison is case-insensitive at the call site.
const LOCKOUT_STATUSES = new Set([
  'expired',     // trial ran out (auto-set by cron lit-trial-expire-sweep)
  'incomplete',  // signup started, no payment method on file
  'unpaid',      // payment failed and grace period exhausted
  'past_due',    // payment failed, in grace period — Stripe will retry
  'cancelled',
  'canceled',
  'paused',
]);

export function isSubscriptionLockedOut(status: string | null | undefined): boolean {
  if (!status) return false;
  return LOCKOUT_STATUSES.has(String(status).toLowerCase());
}

/**
 * Check if user has access to a feature based on plan + subscription status.
 *
 * subscriptionStatus is optional for backwards compatibility — callers
 * that don't pass it get plan-based gating only. Callers that DO pass
 * it get full lockout enforcement: an expired/cancelled/past_due
 * subscription returns allowed:false regardless of plan, forcing the
 * user to land on Billing and reactivate before they can search,
 * view company data, run Pulse, or enrich contacts.
 */
export async function canAccessFeature(
  planCode: string,
  feature: FeatureKey,
  options?: boolean | { isAdmin?: boolean; subscriptionStatus?: string | null },
): Promise<EntitlementCheck> {
  // Backwards compat: old signature was (planCode, feature, isAdmin).
  // New shape is (planCode, feature, { isAdmin, subscriptionStatus }).
  const isAdmin = typeof options === 'boolean' ? options : !!options?.isAdmin;
  const subscriptionStatus = typeof options === 'object' ? options?.subscriptionStatus : undefined;

  // Admins have access to all features (but still respect usage limits)
  if (isAdmin) {
    return { allowed: true, feature_available: true };
  }

  // Subscription-status gate: if the caller knows the status and it's
  // a lockout state, deny everything regardless of plan_code. This is
  // what makes expired trials force the user to Billing.
  if (isSubscriptionLockedOut(subscriptionStatus)) {
    return {
      allowed: false,
      feature_available: false,
      reason: 'Your subscription is inactive. Reactivate or upgrade to use this feature.',
    };
  }

  const plan = await getPlanDefinition(planCode);
  if (!plan) {
    return { allowed: false, reason: 'Plan not found' };
  }

  const hasFeature = plan.features[feature];
  if (!hasFeature) {
    return {
      allowed: false,
      feature_available: false,
      reason: `Feature "${feature}" is not available on the ${plan.name} plan`,
    };
  }

  return { allowed: true, feature_available: true };
}

/**
 * Check if usage is within limit for a given metric
 */
export async function checkUsageLimit(
  planCode: string,
  limitKey: UsageLimitKey,
  currentUsage: number,
  isAdmin?: boolean
): Promise<EntitlementCheck> {
  // Admins can exceed limits (usually)
  if (isAdmin) {
    return { allowed: true };
  }

  const plan = await getPlanDefinition(planCode);
  if (!plan) {
    return { allowed: false, reason: 'Plan not found' };
  }

  const limit = plan.usage_limits[limitKey];
  const isWithinLimit = limit === null || currentUsage < limit;

  return {
    allowed: isWithinLimit,
    usage_remaining: limit === null ? null : Math.max(0, limit - currentUsage),
    usage_limit: limit,
    reason: !isWithinLimit
      ? `${limitKey} limit reached for ${plan.name} plan (${currentUsage}/${limit})`
      : undefined,
  };
}

/**
 * Validate seat count for a plan
 */
export async function validateSeatAllocation(planCode: string, seatCount: number): Promise<EntitlementCheck> {
  const plan = await getPlanDefinition(planCode);
  if (!plan) {
    return { allowed: false, reason: 'Plan not found' };
  }

  const { min, max } = plan.seat_rules;
  const isValid = seatCount >= min && (max === null || seatCount <= max);

  return {
    allowed: isValid,
    reason: !isValid
      ? `Seat count must be between ${min} and ${max === null ? 'unlimited' : max} for ${plan.name} plan`
      : undefined,
  };
}

/**
 * Get all entitlements for a user's plan (comprehensive check).
 *
 * subscriptionStatus is optional. When provided AND in a lockout state
 * (expired / cancelled / past_due / etc), every feature returns false
 * — the user is forced to Billing to reactivate. Plan record is still
 * returned so the UI can show what they HAD before lockout.
 */
export async function getUserEntitlements(
  planCode: string,
  currentUsage?: Record<UsageLimitKey, number>,
  optionsOrIsAdmin?: boolean | { isAdmin?: boolean; subscriptionStatus?: string | null },
): Promise<{
  plan: PlanDefinition | null;
  features: Record<FeatureKey, boolean>;
  usage: Record<UsageLimitKey, EntitlementCheck>;
  can_upgrade: boolean;
  locked_out?: boolean;
}> {
  const isAdmin = typeof optionsOrIsAdmin === 'boolean' ? optionsOrIsAdmin : !!optionsOrIsAdmin?.isAdmin;
  const subscriptionStatus = typeof optionsOrIsAdmin === 'object' ? optionsOrIsAdmin?.subscriptionStatus : undefined;
  const lockedOut = !isAdmin && isSubscriptionLockedOut(subscriptionStatus);

  const plan = await getPlanDefinition(planCode);

  if (!plan) {
    return {
      plan: null,
      features: {},
      usage: {},
      can_upgrade: true,
      locked_out: lockedOut,
    };
  }

  // Lockout: keep the plan record (UI uses it for the "what you had" view)
  // but every feature is false → all gated UI paths route to Billing.
  if (lockedOut) {
    return {
      plan,
      features: {} as Record<FeatureKey, boolean>,
      usage: {} as Record<UsageLimitKey, EntitlementCheck>,
      can_upgrade: true,
      locked_out: true,
    };
  }

  // Get feature access
  const allFeatures = [
    'dashboard',
    'search',
    'command_center',
    'company_page',
    'campaign_builder',
    'pulse',
    'enrichment',
    'billing_admin',
    'seat_management',
    'credit_rating_ready',
    'contact_intel_ready',
  ] as FeatureKey[];

  const features: Record<FeatureKey, boolean> = {};
  for (const feature of allFeatures) {
    const check = await canAccessFeature(planCode, feature, isAdmin);
    features[feature] = check.allowed && check.feature_available;
  }

  // Get usage limits
  const usage: Record<UsageLimitKey, EntitlementCheck> = {};
  const usageLimits = [
    'searches_per_month',
    'company_views_per_month',
    'command_center_saves_per_month',
    'enrichment_credits_per_month',
    'pulse_runs_per_month',
  ] as UsageLimitKey[];

  for (const limitKey of usageLimits) {
    const current = currentUsage?.[limitKey] ?? 0;
    usage[limitKey] = await checkUsageLimit(planCode, limitKey, current, isAdmin);
  }

  return {
    plan,
    features,
    usage,
    can_upgrade: !['enterprise'].includes(planCode),
  };
}

/**
 * Invalidate plan cache (call after plan updates)
 */
export function invalidatePlanCache(): void {
  planCache = null;
}
