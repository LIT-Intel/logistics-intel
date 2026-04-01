export type PlanCode = "free_trial" | "standard" | "growth" | "enterprise";
export type LimitPeriod = "lifetime" | "monthly" | "yearly";

export type PlanLimits = {
  searches: number;
  saves: number;
  enrichments: number;
  aiBriefs: number | null;
  seats: number;
  period: LimitPeriod;
};

export const PLAN_LIMITS: Record<PlanCode, PlanLimits> = {
  free_trial: {
    searches: 10,
    saves: 5,
    enrichments: 5,
    aiBriefs: 0,
    seats: 1,
    period: "lifetime",
  },
  standard: {
    searches: 75,
    saves: 50,
    enrichments: 50,
    aiBriefs: 25,
    seats: 1,
    period: "monthly",
  },
  growth: {
    searches: 500,
    saves: 250,
    enrichments: 250,
    aiBriefs: 150,
    seats: 5,
    period: "monthly",
  },
  enterprise: {
    searches: 10000,
    saves: 10000,
    enrichments: 5000,
    aiBriefs: 2500,
    seats: 10,
    period: "yearly",
  },
};

export function getPlanLimits(plan?: string | null): PlanLimits {
  if (!plan) return PLAN_LIMITS.free_trial;
  return PLAN_LIMITS[(plan as PlanCode)] ?? PLAN_LIMITS.free_trial;
}

export function getLimitPeriod(plan?: string | null): LimitPeriod {
  return getPlanLimits(plan).period;
}
