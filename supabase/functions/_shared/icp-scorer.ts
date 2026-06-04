// supabase/functions/_shared/icp-scorer.ts
//
// Pure Hot/Cold/Exclude classifier for the FMCSA outbound pipeline.
// Implements the four-signal rubric from spec §3.
//
// Hot list (≤200): direct cold outbound. ALL FOUR signals must pass.
// Cold list (≤800): newsletter only. Lower bar but still ICP-filtered.
// Exclude: drops the contact entirely from the pipeline.

export type AuthorityType = "broker" | "forwarder" | "both" | "carrier" | "other";

export type TitleTier =
  | "owner" | "vp" | "director" | "sales-manager"
  | "ops" | "ic" | "junior" | "unknown";

export interface ScoreInput {
  authorityType: AuthorityType;
  authorityYears: number;
  employeeCount: number;
  titleTier: TitleTier;
  emailDeliverable: boolean;
}

export type Tier = "hot" | "cold" | "exclude";

export interface ScoreOutput {
  tier: Tier;
  reasons: string[];
}

const HOT_TITLE_TIERS: ReadonlySet<TitleTier> = new Set([
  "owner", "vp", "director", "sales-manager",
]);

const COLD_TITLE_TIERS: ReadonlySet<TitleTier> = new Set([
  "owner", "vp", "director", "sales-manager", "ops", "unknown",
]);

export function scoreContact(input: ScoreInput): ScoreOutput {
  const reasons: string[] = [];

  // Universal excluders (apply to both Hot and Cold paths)
  if (!input.emailDeliverable) reasons.push("no_deliverable_email");
  if (input.authorityType === "carrier" || input.authorityType === "other") {
    reasons.push("wrong_authority_type");
  }
  if (input.authorityYears < 2) reasons.push("authority_too_new");
  if (input.authorityYears > 15) reasons.push("authority_too_old");
  if (input.employeeCount < 10) reasons.push("too_small");
  if (input.employeeCount > 200) reasons.push("too_large");
  if (input.titleTier === "junior" || input.titleTier === "ic") {
    reasons.push("title_excluded");
  }

  if (reasons.length > 0) return { tier: "exclude", reasons };

  // Hot path: all four Hot signals satisfied
  const hotBandSize = input.employeeCount >= 20 && input.employeeCount <= 100;
  const hotBandYears = input.authorityYears >= 3 && input.authorityYears <= 10;
  const hotTitle = HOT_TITLE_TIERS.has(input.titleTier);
  const hotAuthority = input.authorityType !== "carrier" && input.authorityType !== "other";

  if (hotBandSize && hotBandYears && hotTitle && hotAuthority) {
    return { tier: "hot", reasons: ["all_hot_signals_pass"] };
  }

  // Cold path: passed universal filters, title is at least ops-or-better
  if (COLD_TITLE_TIERS.has(input.titleTier)) {
    return { tier: "cold", reasons: ["below_hot_threshold"] };
  }

  // Unknown title path (rare): goes to cold
  return { tier: "cold", reasons: ["title_unknown_default_cold"] };
}
