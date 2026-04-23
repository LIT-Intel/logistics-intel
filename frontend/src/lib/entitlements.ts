import type { PlanCode } from "./planLimits";
import { normalizePlan } from "./planLimits";

export type FeatureKey =
  | "dashboard_access"
  | "search_access"
  | "command_center_access"
  | "settings_access"
  | "billing_access"
  | "profile_access"
  | "contact_enrichment_access"
  | "ai_brief_access"
  | "export_pdf_access"
  | "similar_companies_access"
  | "credit_rating_access"
  | "campaign_access"
  | "rfp_studio_access"
  | "widgets_access"
  | "team_management_access"
  | "seat_management_access"
  | "usage_reporting_access"
  | "org_settings_access"
  | "affiliate_access"
  | "admin_access"
  | "lead_prospecting_access"
  | "cms_access"
  | "debug_agent_access";

export const ALL_FEATURE_KEYS: FeatureKey[] = [
  "dashboard_access",
  "search_access",
  "command_center_access",
  "settings_access",
  "billing_access",
  "profile_access",
  "contact_enrichment_access",
  "ai_brief_access",
  "export_pdf_access",
  "similar_companies_access",
  "credit_rating_access",
  "campaign_access",
  "rfp_studio_access",
  "widgets_access",
  "team_management_access",
  "seat_management_access",
  "usage_reporting_access",
  "org_settings_access",
  "affiliate_access",
  "admin_access",
  "lead_prospecting_access",
  "cms_access",
  "debug_agent_access",
];

export const PLAN_ENTITLEMENTS: Record<PlanCode, Record<FeatureKey, boolean>> = {
  free_trial: {
    dashboard_access: true,
    search_access: true,
    command_center_access: true,
    settings_access: true,
    billing_access: true,
    profile_access: true,
    contact_enrichment_access: false,
    ai_brief_access: false,
    export_pdf_access: false,
    similar_companies_access: false,
    credit_rating_access: false,
    campaign_access: false,
    rfp_studio_access: false,
    widgets_access: false,
    team_management_access: false,
    seat_management_access: false,
    usage_reporting_access: false,
    org_settings_access: false,
    affiliate_access: false,
    admin_access: false,
    lead_prospecting_access: false,
    cms_access: false,
    debug_agent_access: false,
  },
  starter: {
    dashboard_access: true,
    search_access: true,
    command_center_access: true,
    settings_access: true,
    billing_access: true,
    profile_access: true,
    contact_enrichment_access: true,
    ai_brief_access: true,
    export_pdf_access: false,
    similar_companies_access: true,
    credit_rating_access: false,
    campaign_access: false,
    rfp_studio_access: false,
    widgets_access: false,
    team_management_access: true,
    seat_management_access: false,
    usage_reporting_access: true,
    org_settings_access: true,
    affiliate_access: false,
    admin_access: false,
    lead_prospecting_access: false,
    cms_access: false,
    debug_agent_access: false,
  },
  growth: {
    dashboard_access: true,
    search_access: true,
    command_center_access: true,
    settings_access: true,
    billing_access: true,
    profile_access: true,
    contact_enrichment_access: true,
    ai_brief_access: true,
    export_pdf_access: true,
    similar_companies_access: true,
    credit_rating_access: true,
    campaign_access: true,
    rfp_studio_access: true,
    widgets_access: true,
    team_management_access: true,
    seat_management_access: true,
    usage_reporting_access: true,
    org_settings_access: true,
    affiliate_access: false,
    admin_access: false,
    lead_prospecting_access: true,
    cms_access: false,
    debug_agent_access: false,
  },
  enterprise: {
    dashboard_access: true,
    search_access: true,
    command_center_access: true,
    settings_access: true,
    billing_access: true,
    profile_access: true,
    contact_enrichment_access: true,
    ai_brief_access: true,
    export_pdf_access: true,
    similar_companies_access: true,
    credit_rating_access: true,
    campaign_access: true,
    rfp_studio_access: true,
    widgets_access: true,
    team_management_access: true,
    seat_management_access: true,
    usage_reporting_access: true,
    org_settings_access: true,
    affiliate_access: true,
    admin_access: false,
    lead_prospecting_access: true,
    cms_access: false,
    debug_agent_access: false,
  },
};

export function getPlanEntitlements(plan?: string | null): Record<FeatureKey, boolean> {
  const code = normalizePlan(plan) as PlanCode;
  return PLAN_ENTITLEMENTS[code] ?? PLAN_ENTITLEMENTS.free_trial;
}

export function canAccessFeatureByPlan(
  plan: string | null | undefined,
  feature: FeatureKey,
  isAdmin = false
): boolean {
  if (isAdmin && (feature === "admin_access" || feature === "cms_access" || feature === "debug_agent_access")) {
    return true;
  }
  return getPlanEntitlements(plan)[feature] === true;
}
