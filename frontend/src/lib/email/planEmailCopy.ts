// Plan-specific copy used in lifecycle emails.
// This file is the SINGLE SOURCE OF TRUTH for plan benefits in emails.
// Do NOT hardcode benefit text in template files — reference this map.

export type PlanSlug = "trial" | "free" | "starter" | "pro" | "team" | "enterprise";

export interface PlanEmailCopy {
  name: string;
  headline: string;
  benefits: string[];
  primaryCta: string;
  primaryPath: string;
}

export const PLAN_EMAIL_COPY: Record<PlanSlug, PlanEmailCopy> = {
  trial: {
    name: "Free Trial",
    headline: "Your LIT trial is live",
    benefits: [
      "Search and filter 500,000+ active freight shippers by lane, volume, and commodity",
      "View full shipment history, carrier relationships, and trade lane patterns",
      "Save up to 10 companies to your workspace for follow-up",
      "Run Pulse AI briefs to surface buying signals and conversation starters",
      "Access contact discovery on saved companies",
    ],
    primaryCta: "Start finding shippers",
    primaryPath: "/pulse",
  },
  free: {
    name: "Free Trial",
    headline: "Your LIT trial is live",
    benefits: [
      "Search and filter 500,000+ active freight shippers by lane, volume, and commodity",
      "View full shipment history, carrier relationships, and trade lane patterns",
      "Save up to 10 companies to your workspace for follow-up",
      "Run Pulse AI briefs to surface buying signals and conversation starters",
      "Access contact discovery on saved companies",
    ],
    primaryCta: "Start finding shippers",
    primaryPath: "/pulse",
  },
  starter: {
    name: "Starter",
    headline: "Welcome to LIT Starter",
    benefits: [
      "Unlimited shipper searches with advanced lane and commodity filters",
      "Save up to 50 companies with full shipment timeline access",
      "25 Pulse AI briefs per month for targeted outreach intelligence",
      "Contact discovery and email export on all saved companies",
      "CSV export for your CRM or outreach tools",
    ],
    primaryCta: "Start prospecting",
    primaryPath: "/pulse",
  },
  pro: {
    name: "Pro",
    headline: "Welcome to LIT Pro",
    benefits: [
      "Unlimited shipper searches and company saves",
      "100 Pulse AI briefs per month with deeper competitor and lane analysis",
      "Full contact discovery with direct emails and phone numbers",
      "Campaign builder — build and launch multi-touch email sequences from LIT",
      "Market benchmark reports by lane, mode, and commodity",
      "Priority support and onboarding session",
    ],
    primaryCta: "Open your workspace",
    primaryPath: "/pulse",
  },
  team: {
    name: "Team",
    headline: "Welcome to LIT Team",
    benefits: [
      "Everything in Pro for up to 5 team seats",
      "Shared company saves and Pulse lists across your team",
      "Team campaign library — share and standardize outreach sequences",
      "Usage analytics across reps — see who is prospecting and converting",
      "Admin controls for seat management and org-wide suppression lists",
      "Dedicated customer success contact",
    ],
    primaryCta: "Set up your team",
    primaryPath: "/settings/team",
  },
  enterprise: {
    name: "Enterprise",
    headline: "Welcome to LIT Enterprise",
    benefits: [
      "Unlimited seats and org-wide shipper intelligence",
      "Custom data integrations and CRM sync (Salesforce, HubSpot)",
      "White-glove onboarding and quarterly business reviews",
      "API access for embedding LIT data in your existing stack",
      "Custom reporting and lane-level market intelligence packages",
      "SLA-backed support with named account manager",
    ],
    primaryCta: "Schedule your kickoff",
    primaryPath: "/settings/billing",
  },
};
