import { getPlanEntitlements, type FeatureKey } from "./entitlements";
import { getPlanLimits } from "./planLimits";

export type GlobalRole = "super_admin" | "internal_admin" | "customer_user";
export type OrgRole =
  | "org_admin"
  | "manager"
  | "standard_user"
  | "sales_user"
  | "trial_user"
  | "beta_user";

export type UsageSnapshot = Partial<{
  searches: number;
  saves: number;
  enrichments: number;
  aiBriefs: number;
}>;

export type AccessUser = {
  id?: string;
  email?: string | null;
  globalRole?: GlobalRole | string | null;
  orgRole?: OrgRole | string | null;
  plan?: string | null;
  featureOverrides?: Record<string, boolean>;
};

export function isSuperAdmin(user?: AccessUser | null) {
  return user?.globalRole === "super_admin";
}

export function isInternalAdmin(user?: AccessUser | null) {
  return user?.globalRole === "internal_admin" || isSuperAdmin(user);
}

export function canAccessFeature(
  user: AccessUser | null | undefined,
  feature: FeatureKey
): boolean {
  if (!user) return false;
  if (isSuperAdmin(user)) return true;

  const overrides = user.featureOverrides || {};
  if (typeof overrides[feature] === "boolean") {
    return overrides[feature];
  }

  const planEntitlements = getPlanEntitlements(user.plan);
  return !!planEntitlements[feature];
}

export function canAccessPage(user: AccessUser | null | undefined, pageKey: string): boolean {
  const pageToFeature: Record<string, FeatureKey> = {
    dashboard: "dashboard_access",
    search: "search_access",
    command_center: "command_center_access",
    settings: "settings_access",
    billing: "billing_access",
    profile: "profile_access",
    campaigns: "campaign_access",
    rfp: "rfp_studio_access",
    widgets: "widgets_access",
    affiliate: "affiliate_access",
    admin: "admin_access",
    prospecting: "lead_prospecting_access",
    cms: "cms_access",
    diagnostic: "debug_agent_access",
  };

  const feature = pageToFeature[pageKey];
  if (!feature) return false;
  return canAccessFeature(user, feature);
}

export function getRemainingUsage(
  user: AccessUser | null | undefined,
  usage: UsageSnapshot = {}
) {
  const limits = getPlanLimits(user?.plan);

  return {
    searches: Math.max(limits.searches - (usage.searches || 0), 0),
    saves: Math.max(limits.saves - (usage.saves || 0), 0),
    enrichments: Math.max(limits.enrichments - (usage.enrichments || 0), 0),
    aiBriefs:
      limits.aiBriefs === null
        ? null
        : Math.max((limits.aiBriefs || 0) - (usage.aiBriefs || 0), 0),
  };
}

export function isOverLimit(
  user: AccessUser | null | undefined,
  usage: UsageSnapshot,
  metric: "searches" | "saves" | "enrichments" | "aiBriefs"
) {
  const remaining = getRemainingUsage(user, usage);
  const value = remaining[metric];
  if (value === null) return false;
  return value <= 0;
}

export function getUpgradeMessage(
  user: AccessUser | null | undefined,
  metric: "searches" | "saves" | "enrichments" | "aiBriefs"
) {
  const plan = user?.plan || "free_trial";

  if (plan === "free_trial") {
    if (metric === "searches") {
      return "You’ve used all 10 trial searches. Upgrade to continue.";
    }
    if (metric === "saves") {
      return "You’ve reached the 5 saved company trial limit. Upgrade to continue.";
    }
    if (metric === "enrichments") {
      return "You’ve reached the 5 contact enrichment trial limit. Upgrade to continue.";
    }
    if (metric === "aiBriefs") {
      return "AI Brief is available on paid plans.";
    }
  }

  return "You’ve reached your plan limit. Upgrade your subscription to continue.";
}
