/**
 * Plan limits and helpers for gating & usage checks.
 */
export const PLAN_LIMITS = {
  free:       { users: 3,    outreachPerDay: 50,    enrichPerMonth: 100 },
  pro:        { users: 50,   outreachPerDay: 500,   enrichPerMonth: 5000 },
  enterprise: { users: 2000, outreachPerDay: 10000, enrichPerMonth: 200000 }
};

export const PLAN_ORDER = { free: 0, pro: 1, enterprise: 2 };

/**
 * Return the numeric limits for a given plan.
 */
export function getPlanLimits(plan) {
  const key = String(plan || 'free').toLowerCase();
  return PLAN_LIMITS[key] || PLAN_LIMITS.free;
}

/**
 * Check if the user's plan meets a minimum plan requirement.
 * requirement:
 *   - 'free' | 'pro' | 'enterprise'
 *   - { minPlan: 'pro' }
 *   - anything else -> allowed
 */
export function checkFeatureAccess(plan, requirement) {
  const p = String(plan || 'free').toLowerCase();
  const planRank = PLAN_ORDER[p] ?? 0;

  if (typeof requirement === 'string') {
    const reqRank = PLAN_ORDER[String(requirement).toLowerCase()] ?? 0;
    return planRank >= reqRank;
  }

  if (requirement && typeof requirement === 'object' && requirement.minPlan) {
    const reqRank = PLAN_ORDER[String(requirement.minPlan).toLowerCase()] ?? 0;
    return planRank >= reqRank;
  }

  return true; // no requirement specified
}

/**
 * Check a specific usage counter against plan limits.
 *
 * @param {Object} args
 * @param {'free'|'pro'|'enterprise'} args.plan
 * @param {'outreachPerDay'|'enrichPerMonth'|'users'|string} args.metric
 * @param {number} args.current - current usage count
 *
 * @returns {{
 *   allowed: boolean,
 *   remaining: number,
 *   limit: number,
 *   overBy: number
 * }}
 */
export function checkUsageLimit({ plan = 'free', metric, current = 0 }) {
  const limits = getPlanLimits(plan);
  const limit = Number(limits?.[metric] ?? 0);
  const remaining = Math.max(0, limit - Number(current || 0));
  const allowed = remaining > 0;
  const overBy = allowed ? 0 : Math.abs(remaining);

  return { allowed, remaining, limit, overBy };
}

export default getPlanLimits;
