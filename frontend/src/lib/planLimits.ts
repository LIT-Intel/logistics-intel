// 2026-04-29 billing-truth catalog rewrite.
//
// Single frontend source of truth for plan codes, prices, included seats,
// and rough usage limits. Aligned with the Supabase `plans` table so what
// a user sees on the Billing page matches what the backend enforces.
//
// PRICING MODEL: every paid plan is a flat package price. There is NO
// per-seat multiplication for Starter, Growth, or Scale. Growth includes
// 3 seats at $387/mo as a package. Scale includes 5 seats at $625/mo as a
// package. Additional Scale seats can be added later as a separate Stripe
// add-on line item; until that ships the seat selector is hidden.
//
// PLAN CODES IN DB (verified 2026-04-29):
//   free_trial  $0
//   starter     $125/mo, $1,250/yr
//   growth      $387/mo, $3,870/yr  (3 seats included)
//   scale       $625/mo, $6,250/yr  (5 seats included)
//   enterprise  Custom

export type PlanCode = "free_trial" | "starter" | "growth" | "scale" | "enterprise";
export type BillingInterval = "monthly" | "yearly";

export type FeatureKey =
  | "dashboard"
  | "search"
  | "command_center"
  | "company_page"
  | "campaign_builder"
  | "pulse"
  | "rfp_studio"
  | "lead_prospecting"
  | "enrichment"
  | "billing_admin"
  | "seat_management"
  | "widgets"
  | "credit_rating_ready"
  | "contact_intel_ready";

export type UsageLimitKey =
  | "searches_per_month"
  | "company_views_per_month"
  | "command_center_saves_per_month"
  | "enrichment_credits_per_month"
  | "campaigns_active"
  | "rfp_drafts"
  | "team_seats"
  | "connected_mailboxes"
  | "pulse_runs_per_month";

export type SeatRules = {
  /** Minimum seats required to checkout. For package plans this equals the
   *  included count and the user has no choice. */
  min: number;
  /** Maximum seats allowed via the Billing UI. `null` = no UI cap (Scale
   *  add-on flow / Enterprise custom). */
  max: number | null;
  /** Default seat count to seed the UI with. For package plans this equals
   *  `min` so the package size is the only visible option. */
  default: number;
};

export type PlanUsageLimits = Record<UsageLimitKey, number | null>;
export type PlanFeatures = Record<FeatureKey, boolean>;

export type PlanPricing = {
  /** Total monthly package price in dollars (NOT per-seat). `null` =
   *  Custom (Enterprise). */
  monthly: number | null;
  /** Total yearly package price in dollars. `null` = Custom. */
  yearly: number | null;
  /** Always `false` for the current catalog. Kept on the type so downstream
   *  callers can still inspect it; per-seat add-ons are modelled as
   *  separate Stripe line items, not as `perSeat: true` here. */
  perSeat: false;
};

export type PlanConfig = {
  code: PlanCode;
  label: string;
  pricing: PlanPricing;
  seatRules: SeatRules;
  /** Number of seats bundled in the package price. Use this for display. */
  includedSeats: number | null;
  features: PlanFeatures;
  limits: PlanUsageLimits;
};

export const PLAN_LIMITS: Record<PlanCode, PlanConfig> = {
  free_trial: {
    code: "free_trial",
    label: "Free Trial",
    pricing: { monthly: 0, yearly: 0, perSeat: false },
    seatRules: { min: 1, max: 1, default: 1 },
    includedSeats: 1,
    features: {
      dashboard: true,
      search: true,
      command_center: true,
      company_page: false,
      campaign_builder: false,
      pulse: false,
      rfp_studio: false,
      lead_prospecting: false,
      enrichment: false,
      billing_admin: true,
      seat_management: false,
      widgets: false,
      credit_rating_ready: false,
      contact_intel_ready: false,
    },
    // 2026-04-29 plan limits v3 — Pulse for free trial bumped from 0 to a
    // small allowance (3) so trial users can preview Pulse once or twice.
    // Treat the per-month value as effective total — the trial expires
    // when the search/save caps are exhausted.
    limits: {
      searches_per_month: 10,
      company_views_per_month: 10,
      command_center_saves_per_month: 10,
      enrichment_credits_per_month: 0,
      campaigns_active: 0,
      rfp_drafts: 0,
      team_seats: 1,
      connected_mailboxes: 0,
      pulse_runs_per_month: 3,
    },
  },

  starter: {
    code: "starter",
    label: "Starter",
    pricing: { monthly: 125, yearly: 1250, perSeat: false },
    seatRules: { min: 1, max: 1, default: 1 },
    includedSeats: 1,
    features: {
      dashboard: true,
      search: true,
      command_center: true,
      company_page: true,
      campaign_builder: false,
      pulse: false,
      rfp_studio: false,
      lead_prospecting: false,
      enrichment: false,
      billing_admin: true,
      seat_management: false,
      widgets: false,
      credit_rating_ready: false,
      contact_intel_ready: false,
    },
    // 2026-04-29 plan limits v3 (P&L review). Search tightened 250 -> 100
    // (high variable cost). Pulse 25 -> 10. Campaign now included
    // (0 -> 250). Enrichment dropped to 0 — Starter is search/save only.
    limits: {
      searches_per_month: 100,
      company_views_per_month: 100,
      command_center_saves_per_month: 50,
      enrichment_credits_per_month: 0,
      campaigns_active: 250,
      rfp_drafts: 0,
      team_seats: 1,
      connected_mailboxes: 1,
      pulse_runs_per_month: 10,
    },
  },

  growth: {
    code: "growth",
    label: "Growth",
    pricing: { monthly: 387, yearly: 3870, perSeat: false },
    // 3 included as a package — the seat selector is hidden in the UI.
    seatRules: { min: 3, max: 3, default: 3 },
    includedSeats: 3,
    features: {
      dashboard: true,
      search: true,
      command_center: true,
      company_page: true,
      campaign_builder: true,
      pulse: true,
      rfp_studio: true,
      lead_prospecting: true,
      enrichment: true,
      billing_admin: true,
      seat_management: true,
      widgets: true,
      credit_rating_ready: false,
      contact_intel_ready: true,
    },
    // 2026-04-29 plan limits v3 (P&L review). Search 1000 -> 750 to
    // tighten variable API cost exposure. Pulse 100 -> 35. Enrichment
    // 200 -> 75. Campaign volume kept (1000); cheap to send.
    limits: {
      searches_per_month: 750,
      company_views_per_month: 500,
      command_center_saves_per_month: 250,
      enrichment_credits_per_month: 75,
      campaigns_active: 1000,
      rfp_drafts: 50,
      team_seats: 3,
      connected_mailboxes: 3,
      pulse_runs_per_month: 35,
    },
  },

  scale: {
    code: "scale",
    label: "Scale",
    pricing: { monthly: 625, yearly: 6250, perSeat: false },
    // 5 included as a package. Additional seats ($125/user/mo) ship as a
    // Stripe add-on line item later; until then the selector is hidden.
    seatRules: { min: 5, max: 5, default: 5 },
    includedSeats: 5,
    features: {
      dashboard: true,
      search: true,
      command_center: true,
      company_page: true,
      campaign_builder: true,
      pulse: true,
      rfp_studio: true,
      lead_prospecting: true,
      enrichment: true,
      billing_admin: true,
      seat_management: true,
      widgets: true,
      credit_rating_ready: true,
      contact_intel_ready: true,
    },
    // 2026-04-29 plan limits v3. Search stays at 2000. Pulse 250 -> 80.
    // Campaign 500 -> 2500 (cheap volume that drives conversion).
    // Enrichment 200 kept.
    limits: {
      searches_per_month: 2000,
      company_views_per_month: 1500,
      command_center_saves_per_month: 1500,
      enrichment_credits_per_month: 200,
      campaigns_active: 2500,
      rfp_drafts: 100,
      team_seats: 5,
      connected_mailboxes: 5,
      pulse_runs_per_month: 80,
    },
  },

  enterprise: {
    code: "enterprise",
    label: "Enterprise",
    pricing: { monthly: null, yearly: null, perSeat: false },
    // Enterprise is sold via sales — the Billing UI never renders a seat
    // selector for it. Min/default kept for downstream code that still
    // calls normalizeSeatCount on enterprise plans.
    seatRules: { min: 6, max: null, default: 20 },
    includedSeats: null,
    features: {
      dashboard: true,
      search: true,
      command_center: true,
      company_page: true,
      campaign_builder: true,
      pulse: true,
      rfp_studio: true,
      lead_prospecting: true,
      enrichment: true,
      billing_admin: true,
      seat_management: true,
      widgets: true,
      credit_rating_ready: true,
      contact_intel_ready: true,
    },
    limits: {
      searches_per_month: null,
      company_views_per_month: null,
      command_center_saves_per_month: null,
      enrichment_credits_per_month: null,
      campaigns_active: null,
      rfp_drafts: null,
      team_seats: 20,
      connected_mailboxes: 10,
      pulse_runs_per_month: null,
    },
  },
};

export const DEFAULT_PLAN: PlanCode = "free_trial";
export const DEFAULT_BILLING_INTERVAL: BillingInterval = "monthly";

/**
 * Normalize legacy/stale plan strings to canonical PlanCode.
 * Historical aliases ('free', 'standard', 'pro', 'growth_plus', 'unlimited')
 * map to current codes. Anything unknown falls back to free_trial — the
 * UI then defers to whatever the subscriptions row actually says.
 */
export function normalizePlan(value?: string | null): PlanCode {
  const v = String(value || "").trim().toLowerCase();
  if (v === "free" || v === "free_trial") return "free_trial";
  if (v === "standard" || v === "starter") return "starter";
  if (v === "pro" || v === "growth" || v === "growth_plus") return "growth";
  if (v === "scale") return "scale";
  if (v === "unlimited" || v.startsWith("enterprise")) return "enterprise";
  return "free_trial";
}

export function isPlanCode(value?: string | null): value is PlanCode {
  return (
    value === "free_trial" ||
    value === "starter" ||
    value === "growth" ||
    value === "scale" ||
    value === "enterprise"
  );
}

export function isBillingInterval(value?: string | null): value is BillingInterval {
  return value === "monthly" || value === "yearly";
}

export function getPlanLimits(plan?: string | null): PlanConfig {
  const code = normalizePlan(plan);
  return PLAN_LIMITS[code];
}

export function getPlanConfig(plan?: string | null): PlanConfig {
  return getPlanLimits(plan);
}

export function getPlanFeatures(plan?: string | null): PlanFeatures {
  return getPlanConfig(plan).features;
}

export function getPlanUsageLimits(plan?: string | null): PlanUsageLimits {
  return getPlanConfig(plan).limits;
}

export function getSeatRules(plan?: string | null): SeatRules {
  return getPlanConfig(plan).seatRules;
}

export function canAccessFeature(
  plan: string | null | undefined,
  feature: FeatureKey
): boolean {
  return getPlanFeatures(plan)[feature] === true;
}

/**
 * Validate seats for a checkout request. With every paid plan now a flat
 * package, this only really fires for free_trial (which can't checkout) or
 * for an out-of-range value passed by a stale UI. Kept for safety.
 */
export function validateSeatCount(
  plan: string | null | undefined,
  seats: number
): { valid: boolean; message: string | null } {
  const { min, max } = getSeatRules(plan);

  if (!Number.isFinite(seats) || seats < 1) {
    return { valid: false, message: "Seat count must be at least 1." };
  }
  if (seats < min) {
    return { valid: false, message: `This plan requires at least ${min} seat${min === 1 ? "" : "s"}.` };
  }
  if (max !== null && seats > max) {
    return { valid: false, message: `This plan supports a maximum of ${max} seat${max === 1 ? "" : "s"}.` };
  }
  return { valid: true, message: null };
}

export function normalizeSeatCount(
  plan: string | null | undefined,
  seats?: number | null
): number {
  const { min, max, default: defaultSeats } = getSeatRules(plan);
  if (!Number.isFinite(seats as number) || (seats as number) < 1) return defaultSeats;
  const parsed = Math.floor(seats as number);
  if (parsed < min) return min;
  if (max !== null && parsed > max) return max;
  return parsed;
}

export function getPriceForInterval(
  plan: string | null | undefined,
  interval: BillingInterval
): number | null {
  return getPlanConfig(plan).pricing[interval];
}

/**
 * Returns the displayed price for a plan/interval combo. The `seats` arg
 * is accepted for backward-compatible signature but is **ignored** — every
 * paid plan in the catalog is a flat package price now. Per-seat add-ons
 * (e.g., extra Scale users at $125/seat) will be modelled separately.
 */
export function getTotalPrice(
  plan: string | null | undefined,
  interval: BillingInterval,
  _seats?: number | null,
): number | null {
  return getPlanConfig(plan).pricing[interval];
}

export function hasUsageLimit(
  plan: string | null | undefined,
  key: UsageLimitKey
): boolean {
  return getPlanUsageLimits(plan)[key] !== null;
}

export function getUsageLimit(
  plan: string | null | undefined,
  key: UsageLimitKey
): number | null {
  return getPlanUsageLimits(plan)[key];
}

export function hasRemainingUsage(
  plan: string | null | undefined,
  key: UsageLimitKey,
  currentUsage: number
): boolean {
  const limit = getUsageLimit(plan, key);
  if (limit === null) return true;
  return currentUsage < limit;
}
