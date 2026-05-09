// Plan-specific copy used in lifecycle emails.
// SINGLE source of truth for plan benefits in emails. Do NOT hardcode
// benefit text inside template files — reference this map.
//
// Plan slugs MIRROR the canonical PlanCode enum from frontend/src/lib/planLimits.ts
// EXACTLY: free_trial, starter, growth, scale, enterprise. Older
// aliases (trial, pro, team) are accepted via normalizePlanSlug() for
// backwards compatibility with subscription rows that may carry legacy
// plan_code values.
//
// Trial entitlements (per planLimits.ts free_trial config + product
// confirmation from founder, 2026-05-08):
//   - Search shippers by name, lane, or commodity (search feature ON,
//     10/mo searches)
//   - View full company supply chain shipment data (company_page ON)
//   - View trade lanes + benchmark freight rates
//   - 10 saved contacts with up to 10 contact enrichments
//   - Pulse AI for company briefings (5 AI runs/mo)
//   - Revenue opportunity sizing per company
//   - NO Pulse search (lookalike discovery), NO outreach campaigns,
//     NO RFP studio, NO lead prospecting, NO team seats

export type PlanSlug = "free_trial" | "starter" | "growth" | "scale" | "enterprise";

// Legacy aliases the cron + Stripe webhook may emit. These all
// normalize to a canonical PlanSlug at the call site.
export type LegacyPlanSlug = "trial" | "free" | "pro" | "team" | PlanSlug;

export interface PlanEmailCopy {
  /** Display name shown in the email subject + body */
  name: string;
  /** Hero headline above the body */
  headline: string;
  /** Bulleted benefits — these become the "what's included" list */
  benefits: string[];
  /** Primary CTA button label */
  primaryCta: string;
  /** Path appended to {{app_url}} for the CTA destination */
  primaryPath: string;
}

/** Map any legacy plan slug to the canonical free_trial / starter /
 *  growth / scale / enterprise enum. Anything unknown falls back to
 *  free_trial since that's the safest default for an undefined state. */
export function normalizePlanSlug(value?: string | null): PlanSlug {
  const v = String(value || "").trim().toLowerCase();
  if (v === "free" || v === "free_trial" || v === "trial") return "free_trial";
  if (v === "standard" || v === "starter") return "starter";
  if (v === "pro" || v === "growth" || v === "growth_plus") return "growth";
  if (v === "team" || v === "scale") return "scale";
  if (v === "unlimited" || v.startsWith("enterprise")) return "enterprise";
  return "free_trial";
}

export const PLAN_EMAIL_COPY: Record<PlanSlug, PlanEmailCopy> = {
  free_trial: {
    name: "Free Trial",
    headline: "Welcome to LIT.",
    benefits: [
      "Search shipper companies by name, trade lane, or commodity",
      "View full supply chain shipment history per company",
      "See active trade lanes, shipping cadence, and carrier mix",
      "Compare benchmark freight rates by lane and mode",
      "Enrich up to 10 contacts with verified emails",
      "Run Pulse AI briefs for fast account intelligence",
      "Size revenue opportunity per shipper account",
    ],
    primaryCta: "Open your dashboard",
    primaryPath: "/dashboard",
  },

  starter: {
    name: "Starter",
    headline: "Your LIT Starter workspace is ready.",
    benefits: [
      "75 shipper searches per month with full lane and commodity filters",
      "Save up to 50 shippers with full shipment timeline access",
      "25 Pulse account briefs per month for fast research",
      "Launch outreach campaigns with up to 250 active recipients",
      "1 connected mailbox for sending from your own domain",
      "Email support",
    ],
    primaryCta: "Open your workspace",
    primaryPath: "/dashboard",
  },

  growth: {
    name: "Growth",
    headline: "Your LIT Growth team is ready.",
    benefits: [
      "350 shipper searches per month and 350 saves to Command Center",
      "100 Pulse AI briefs and 100 Pulse lookalike searches per month",
      "150 contact enrichments per month with verified emails",
      "1,000 active campaign recipients across your team",
      "3 team seats with 3 connected mailboxes",
      "RFP Studio, lead prospecting, and team analytics",
      "Saved Pulse lists for industry segmentation",
    ],
    primaryCta: "Invite your team",
    primaryPath: "/settings/team",
  },

  scale: {
    name: "Scale",
    headline: "Your LIT Scale workspace is ready.",
    benefits: [
      "1,000 shipper searches and 1,000 saves per month",
      "500 Pulse AI briefs and 500 Pulse lookalike searches per month",
      "500 contact enrichments per month with verified emails",
      "5 team seats with 5 connected mailboxes",
      "2,500 active campaign recipients and 100 RFP drafts",
      "Credit-rating ready and contact intelligence ready datasets",
      "Saved Pulse lists, lead prospecting, and full team analytics",
    ],
    primaryCta: "Open your workspace",
    primaryPath: "/dashboard",
  },

  enterprise: {
    name: "Enterprise",
    headline: "Welcome to LIT Enterprise.",
    benefits: [
      "Unlimited searches, company saves, Pulse runs, and enrichments",
      "10+ team seats with custom seat scaling",
      "Credit-rating ready and contact intelligence ready datasets",
      "Custom data integrations and CRM sync (Salesforce, HubSpot)",
      "White-glove onboarding and named customer success contact",
      "SLA-backed support with quarterly business reviews",
    ],
    primaryCta: "Schedule your kickoff",
    primaryPath: "/settings/billing",
  },
};

/** Convenience: take any plan-slug-like input and return its email copy. */
export function getPlanEmailCopy(slug?: string | null): PlanEmailCopy {
  return PLAN_EMAIL_COPY[normalizePlanSlug(slug)];
}
