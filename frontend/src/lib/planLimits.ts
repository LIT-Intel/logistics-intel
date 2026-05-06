// 2026-05-06 billing-spec alignment (v4). Mirrors the Supabase `plans`
// table exactly; resolve_feature_limit / get_entitlements RPCs are the
// authoritative server-side enforcement layer. This file exists for UI
// rendering speed only — never for gating decisions.
//
// PRICING (Stripe truth, see Stripe products STARTER/GROWTH/SCALE):
//   free_trial  $0          — 30-day trial
//   starter     $125/mo,  $1,500/yr   (1 seat)
//   growth      $499/mo,  $4,790/yr   (3 seats)
//   scale       $999/mo,  $8,991/yr   (5 seats)
//   enterprise  Custom
//
// Annual savings target = 25% across the board. Starter (0% off) and
// Growth (~20% off) annual prices in Stripe DO NOT match this target —
// fix in Stripe Dashboard before relying on a uniform "Save 25%" badge.

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
  | "saved_contacts"
  | "enrichment_credits_per_month"
  | "campaigns_active"
  | "rfp_drafts"
  | "team_seats"
  | "connected_mailboxes"
  | "pulse_runs_per_month"
  | "pulse_ai_per_month"
  | "pulse_search_per_month"
  | "saved_pulse_lists";

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
      company_page: true,
      campaign_builder: true,
      pulse: true,
      rfp_studio: false,
      lead_prospecting: false,
      enrichment: true,
      billing_admin: true,
      seat_management: false,
      widgets: false,
      credit_rating_ready: false,
      contact_intel_ready: false,
    },
    limits: {
      searches_per_month: 10,
      company_views_per_month: 10,
      command_center_saves_per_month: 10,
      saved_contacts: 10,
      enrichment_credits_per_month: 5,
      campaigns_active: 0,
      rfp_drafts: 0,
      team_seats: 1,
      connected_mailboxes: 0,
      pulse_runs_per_month: 5,
      pulse_ai_per_month: 5,
      pulse_search_per_month: 0,
      saved_pulse_lists: 1,
    },
  },

  starter: {
    code: "starter",
    label: "Starter",
    pricing: { monthly: 125, yearly: 1125, perSeat: false },
    seatRules: { min: 1, max: 1, default: 1 },
    includedSeats: 1,
    features: {
      dashboard: true,
      search: true,
      command_center: true,
      company_page: true,
      campaign_builder: true,
      pulse: true,
      rfp_studio: false,
      lead_prospecting: false,
      enrichment: false,
      billing_admin: true,
      seat_management: false,
      widgets: false,
      credit_rating_ready: false,
      contact_intel_ready: false,
    },
    limits: {
      searches_per_month: 75,
      company_views_per_month: 75,
      command_center_saves_per_month: 50,
      saved_contacts: 0,
      enrichment_credits_per_month: 0,
      campaigns_active: 250,
      rfp_drafts: 0,
      team_seats: 1,
      connected_mailboxes: 1,
      pulse_runs_per_month: 25,
      pulse_ai_per_month: 0,
      pulse_search_per_month: 0,
      saved_pulse_lists: 0,
    },
  },

  growth: {
    code: "growth",
    label: "Growth",
    pricing: { monthly: 499, yearly: 4491, perSeat: false },
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
    limits: {
      searches_per_month: 350,
      company_views_per_month: 350,
      command_center_saves_per_month: 350,
      saved_contacts: 250,
      enrichment_credits_per_month: 150,
      campaigns_active: 1000,
      rfp_drafts: 50,
      team_seats: 3,
      connected_mailboxes: 3,
      pulse_runs_per_month: 100,
      pulse_ai_per_month: 100,
      pulse_search_per_month: 100,
      saved_pulse_lists: 10,
    },
  },

  scale: {
    code: "scale",
    label: "Scale",
    pricing: { monthly: 999, yearly: 8991, perSeat: false },
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
    limits: {
      searches_per_month: 1000,
      company_views_per_month: 1000,
      command_center_saves_per_month: 1000,
      saved_contacts: 1000,
      enrichment_credits_per_month: 500,
      campaigns_active: 2500,
      rfp_drafts: 100,
      team_seats: 5,
      connected_mailboxes: 5,
      pulse_runs_per_month: 500,
      pulse_ai_per_month: 500,
      pulse_search_per_month: 500,
      saved_pulse_lists: 25,
    },
  },

  enterprise: {
    code: "enterprise",
    label: "Enterprise",
    pricing: { monthly: null, yearly: null, perSeat: false },
    seatRules: { min: 6, max: null, default: 10 },
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
      saved_contacts: null,
      enrichment_credits_per_month: null,
      campaigns_active: null,
      rfp_drafts: null,
      team_seats: 10,
      connected_mailboxes: 10,
      pulse_runs_per_month: null,
      pulse_ai_per_month: null,
      pulse_search_per_month: null,
      saved_pulse_lists: null,
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
