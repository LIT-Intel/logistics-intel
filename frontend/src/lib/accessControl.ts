export type UserRole = 'super_admin' | 'admin' | 'user';
export type UserPlan = 'free_trial' | 'standard' | 'pro' | 'enterprise';

export type FeatureKey =
  | 'search'
  | 'command_center'
  | 'settings'
  | 'billing'
  | 'enrichment'
  | 'campaigns'
  | 'rfp_studio'
  | 'team_users';

export type AccessMatrix = Record<UserPlan, Record<FeatureKey, boolean>>;

export type PlanLimits = {
  enrichmentPerMonth: number | null;
  savedCompanies: number | null;
  searchesPerMonth: number | null;
  teamUsers: number | null;
};

export type UsageState = {
  enrichmentUsedThisMonth?: number;
  savedCompaniesUsed?: number;
  searchesUsedThisMonth?: number;
  teamUsersUsed?: number;
};

export type AccessContext = {
  role: UserRole;
  plan: UserPlan;
  usage?: UsageState;
};

export const ACCESS_MATRIX: AccessMatrix = {
  free_trial: {
    search: true,
    command_center: true,
    settings: true,
    billing: true,
    enrichment: false,
    campaigns: false,
    rfp_studio: false,
    team_users: false,
  },
  standard: {
    search: true,
    command_center: true,
    settings: true,
    billing: true,
    enrichment: true,
    campaigns: false,
    rfp_studio: false,
    team_users: false,
  },
  pro: {
    search: true,
    command_center: true,
    settings: true,
    billing: true,
    enrichment: true,
    campaigns: true,
    rfp_studio: true,
    team_users: false,
  },
  enterprise: {
    search: true,
    command_center: true,
    settings: true,
    billing: true,
    enrichment: true,
    campaigns: true,
    rfp_studio: true,
    team_users: true,
  },
};

export const PLAN_LIMITS: Record<UserPlan, PlanLimits> = {
  free_trial: {
    enrichmentPerMonth: 0,
    savedCompanies: 25,
    searchesPerMonth: 250,
    teamUsers: 1,
  },
  standard: {
    enrichmentPerMonth: 50,
    savedCompanies: 500,
    searchesPerMonth: 5000,
    teamUsers: 1,
  },
  pro: {
    enrichmentPerMonth: 500,
    savedCompanies: 5000,
    searchesPerMonth: 25000,
    teamUsers: 5,
  },
  enterprise: {
    enrichmentPerMonth: null,
    savedCompanies: null,
    searchesPerMonth: null,
    teamUsers: null,
  },
};

export function normalizeRole(role?: string | null): UserRole {
  if (role === 'super_admin' || role === 'admin' || role === 'user') return role;
  return 'user';
}

export function normalizePlan(plan?: string | null): UserPlan {
  if (plan === 'free_trial' || plan === 'standard' || plan === 'pro' || plan === 'enterprise') {
    return plan;
  }
  return 'free_trial';
}

export function hasRole(role: UserRole, allowedRoles: UserRole[]): boolean {
  return allowedRoles.includes(role);
}

export function canAccessFeature(plan: UserPlan, feature: FeatureKey): boolean {
  return ACCESS_MATRIX[plan][feature];
}

export function getPlanLimits(plan: UserPlan): PlanLimits {
  return PLAN_LIMITS[plan];
}

export function isWithinLimit(used: number | undefined, limit: number | null): boolean {
  if (limit === null) return true;
  return (used ?? 0) < limit;
}

export function getAccessState(context: AccessContext) {
  const role = normalizeRole(context.role);
  const plan = normalizePlan(context.plan);
  const usage = context.usage ?? {};
  const limits = getPlanLimits(plan);

  return {
    role,
    plan,
    features: {
      search: canAccessFeature(plan, 'search'),
      commandCenter: canAccessFeature(plan, 'command_center'),
      settings: canAccessFeature(plan, 'settings'),
      billing: canAccessFeature(plan, 'billing'),
      enrichment: canAccessFeature(plan, 'enrichment'),
      campaigns: canAccessFeature(plan, 'campaigns'),
      rfpStudio: canAccessFeature(plan, 'rfp_studio'),
      teamUsers: canAccessFeature(plan, 'team_users'),
    },
    limits,
    usage,
    allowance: {
      enrichment:
        canAccessFeature(plan, 'enrichment') &&
        isWithinLimit(usage.enrichmentUsedThisMonth, limits.enrichmentPerMonth),

      savedCompanies: isWithinLimit(usage.savedCompaniesUsed, limits.savedCompanies),

      searches: isWithinLimit(usage.searchesUsedThisMonth, limits.searchesPerMonth),

      teamUsers:
        canAccessFeature(plan, 'team_users') &&
        isWithinLimit(usage.teamUsersUsed, limits.teamUsers),
    },
    isAdmin: role === 'admin' || role === 'super_admin',
    isSuperAdmin: role === 'super_admin',
  };
}

export function assertFeatureAccess(context: AccessContext, feature: FeatureKey) {
  const plan = normalizePlan(context.plan);

  if (!canAccessFeature(plan, feature)) {
    return {
      allowed: false,
      reason: `Feature "${feature}" is not available on the ${plan} plan.`,
    };
  }

  const state = getAccessState(context);

  if (feature === 'enrichment' && !state.allowance.enrichment) {
    return {
      allowed: false,
      reason: `Monthly enrichment limit reached for the ${plan} plan.`,
    };
  }

  if (feature === 'team_users' && !state.allowance.teamUsers) {
    return {
      allowed: false,
      reason: `Team user limit reached for the ${plan} plan.`,
    };
  }

  return { allowed: true, reason: null };
}
