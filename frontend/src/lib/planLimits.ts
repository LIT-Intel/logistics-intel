export type PlanCode = "free_trial" | "starter" | "growth" | "enterprise";
export type BillingInterval = "monthly" | "yearly";

export type FeatureKey =
  | "dashboard"
  | "search"
  | "command_center"
  | "company_page"
  | "campaign_builder"
  | "pulse"
  | "enrichment"
  | "billing_admin"
  | "seat_management"
  | "credit_rating_ready"
  | "contact_intel_ready";

export type UsageLimitKey =
  | "searches_per_month"
  | "company_views_per_month"
  | "command_center_saves_per_month"
  | "enrichment_credits_per_month"
  | "pulse_runs_per_month";

export type SeatRules = {
  min: number;
  max: number | null;
  default: number;
};

export type PlanUsageLimits = Record<UsageLimitKey, number | null>;
export type PlanFeatures = Record<FeatureKey, boolean>;

export type PlanPricing = {
  monthly: number | null;
  yearly: number | null;
  perSeat: boolean;
};

export type PlanConfig = {
  code: PlanCode;
  label: string;
  pricing: PlanPricing;
  seatRules: SeatRules;
  features: PlanFeatures;
  limits: PlanUsageLimits;
};

export const PLAN_LIMITS: Record<PlanCode, PlanConfig> = {
  free_trial: {
    code: "free_trial",
    label: "Free Trial",
    pricing: {
      monthly: 0,
      yearly: 0,
      perSeat: false,
    },
    seatRules: {
      min: 1,
      max: 1,
      default: 1,
    },
    features: {
      dashboard: true,
      search: true,
      command_center: true,
      company_page: false,
      campaign_builder: false,
      pulse: false,
      enrichment: false,
      billing_admin: false,
      seat_management: false,
      credit_rating_ready: false,
      contact_intel_ready: false,
    },
    limits: {
      searches_per_month: 10,
      company_views_per_month: 0,
      command_center_saves_per_month: 10,
      enrichment_credits_per_month: 0,
      pulse_runs_per_month: 0,
    },
  },

  starter: {
    code: "starter",
    label: "Starter",
    pricing: {
      monthly: 99,
      yearly: 999,
      perSeat: false,
    },
    seatRules: {
      min: 1,
      max: 1,
      default: 1,
    },
    features: {
      dashboard: true,
      search: true,
      command_center: true,
      company_page: true,
      campaign_builder: false,
      pulse: false,
      enrichment: false,
      billing_admin: true,
      seat_management: false,
      credit_rating_ready: false,
      contact_intel_ready: false,
    },
    limits: {
      searches_per_month: 100,
      company_views_per_month: 50,
      command_center_saves_per_month: 50,
      enrichment_credits_per_month: 0,
      pulse_runs_per_month: 0,
    },
  },

  growth: {
    code: "growth",
    label: "Growth",
    pricing: {
      monthly: 129,
      yearly: 1290,
      perSeat: true,
    },
    seatRules: {
      min: 3,
      max: 7,
      default: 3,
    },
    features: {
      dashboard: true,
      search: true,
      command_center: true,
      company_page: true,
      campaign_builder: true,
      pulse: true,
      enrichment: true,
      billing_admin: true,
      seat_management: true,
      credit_rating_ready: false,
      contact_intel_ready: true,
    },
    limits: {
      searches_per_month: 500,
      company_views_per_month: 200,
      command_center_saves_per_month: 200,
      enrichment_credits_per_month: 100,
      pulse_runs_per_month: 50,
    },
  },

  enterprise: {
    code: "enterprise",
    label: "Enterprise",
    pricing: {
      monthly: null,
      yearly: null,
      perSeat: true,
    },
    seatRules: {
      min: 6,
      max: null,
      default: 6,
    },
    features: {
      dashboard: true,
      search: true,
      command_center: true,
      company_page: true,
      campaign_builder: true,
      pulse: true,
      enrichment: true,
      billing_admin: true,
      seat_management: true,
      credit_rating_ready: true,
      contact_intel_ready: true,
    },
    limits: {
      searches_per_month: null,
      company_views_per_month: null,
      command_center_saves_per_month: null,
      enrichment_credits_per_month: null,
      pulse_runs_per_month: null,
    },
  },
};

export const DEFAULT_PLAN: PlanCode = "starter";
export const DEFAULT_BILLING_INTERVAL: BillingInterval = "monthly";

export function isPlanCode(value?: string | null): value is PlanCode {
  return (
    value === "free_trial" ||
    value === "starter" ||
    value === "growth" ||
    value === "enterprise"
  );
}

export function isBillingInterval(value?: string | null): value is BillingInterval {
  return value === "monthly" || value === "yearly";
}

export function getPlanLimits(plan?: string | null): PlanConfig {
  if (!plan || !isPlanCode(plan)) return PLAN_LIMITS[DEFAULT_PLAN];
  return PLAN_LIMITS[plan];
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

export function validateSeatCount(
  plan: string | null | undefined,
  seats: number
): { valid: boolean; message: string | null } {
  const { min, max } = getSeatRules(plan);

  if (!Number.isFinite(seats) || seats < 1) {
    return {
      valid: false,
      message: "Seat count must be at least 1.",
    };
  }

  if (seats < min) {
    return {
      valid: false,
      message: `This plan requires at least ${min} seat${min === 1 ? "" : "s"}.`,
    };
  }

  if (max !== null && seats > max) {
    return {
      valid: false,
      message: `This plan supports a maximum of ${max} seat${max === 1 ? "" : "s"}.`,
    };
  }

  return {
    valid: true,
    message: null,
  };
}

export function normalizeSeatCount(
  plan: string | null | undefined,
  seats?: number | null
): number {
  const { min, max, default: defaultSeats } = getSeatRules(plan);

  if (!Number.isFinite(seats as number) || (seats as number) < 1) {
    return defaultSeats;
  }

  const parsedSeats = Math.floor(seats as number);

  if (parsedSeats < min) return min;
  if (max !== null && parsedSeats > max) return max;

  return parsedSeats;
}

export function getPriceForInterval(
  plan: string | null | undefined,
  interval: BillingInterval
): number | null {
  return getPlanConfig(plan).pricing[interval];
}

export function getTotalPrice(
  plan: string | null | undefined,
  interval: BillingInterval,
  seats?: number | null
): number | null {
  const config = getPlanConfig(plan);
  const basePrice = config.pricing[interval];

  if (basePrice === null) return null;
  if (!config.pricing.perSeat) return basePrice;

  const normalizedSeats = normalizeSeatCount(plan, seats);
  return basePrice * normalizedSeats;
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
