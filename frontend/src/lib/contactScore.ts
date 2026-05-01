/**
 * LIT Contact Score — local, deterministic 0-100 fit score derived
 * from data we already have. Provider intent (Apollo buying intent /
 * topic signals) is plan-gated and may not be present, so we score
 * locally first and map provider intent in only when it shows up.
 */

export type ContactScoreInput = {
  title?: string | null;
  seniority?: string | null;
  department?: string | null;
  email?: string | null;
  email_status?: string | null;
  email_verification_status?: string | null;
  verified_by_provider?: boolean | null;
  linkedin_url?: string | null;
  enrichment_status?: string | null;
  /** Apollo / future provider buying intent score, when present (0-100). */
  provider_intent_score?: number | null;
};

export type ContactScoreTier = "high" | "good" | "moderate" | "low";

export type ContactScoreResult = {
  score: number;
  tier: ContactScoreTier;
  label: string;
  /** Per-signal contribution for tooltip rendering. */
  breakdown: {
    title: number;
    seniority: number;
    department: number;
    email: number;
    enrichment: number;
    linkedin: number;
    intent: number;
  };
};

const TITLE_KEYWORDS_HIGH = [
  "logistics",
  "supply chain",
  "transportation",
  "import",
  "customs",
  "procurement",
  "sourcing",
  "operations",
  "freight",
  "warehouse",
  "fulfillment",
  "trade",
];
const TITLE_KEYWORDS_GOOD = [
  "buyer",
  "purchasing",
  "vendor",
  "shipping",
  "global trade",
  "trade compliance",
];
const TITLE_KEYWORDS_DECISION = [
  "vp",
  "vice president",
  "head of",
  "director",
  "chief",
  "cpo",
  "ceo",
  "cfo",
  "coo",
];

const DEPT_KEYWORDS = [
  "operations",
  "procurement",
  "supply chain",
  "logistics",
  "customs",
  "sourcing",
  "trade",
];

const SENIORITY_WEIGHTS: Record<string, number> = {
  c_suite: 18,
  founder: 18,
  owner: 18,
  partner: 16,
  vp: 16,
  head: 14,
  director: 14,
  manager: 11,
  senior: 8,
  entry: 3,
  intern: 0,
};

function clamp(n: number, lo = 0, hi = 100) {
  return Math.max(lo, Math.min(hi, n));
}

function scoreTitle(title: string | null | undefined): number {
  if (!title) return 0;
  const t = String(title).toLowerCase();
  let s = 0;
  if (TITLE_KEYWORDS_HIGH.some((k) => t.includes(k))) s += 18;
  else if (TITLE_KEYWORDS_GOOD.some((k) => t.includes(k))) s += 10;
  if (TITLE_KEYWORDS_DECISION.some((k) => t.includes(k))) s += 4;
  return Math.min(s, 22);
}

function scoreSeniority(seniority: string | null | undefined): number {
  if (!seniority) return 0;
  const key = String(seniority).toLowerCase().replace(/[\s-]+/g, "_");
  return SENIORITY_WEIGHTS[key] ?? 6;
}

function scoreDepartment(dept: string | null | undefined): number {
  if (!dept) return 0;
  const d = String(dept).toLowerCase();
  return DEPT_KEYWORDS.some((k) => d.includes(k)) ? 14 : 4;
}

function scoreEmail(input: ContactScoreInput): number {
  if (!input.email) return 0;
  const status = String(
    input.email_verification_status || input.email_status || "",
  ).toLowerCase();
  const verified =
    input.verified_by_provider === true ||
    status === "verified" ||
    status === "valid" ||
    status === "deliverable";
  return verified ? 18 : 10;
}

function scoreEnrichment(status: string | null | undefined): number {
  if (!status) return 0;
  return String(status).toLowerCase() === "enriched" ? 12 : 0;
}

function scoreLinkedin(url: string | null | undefined): number {
  return url ? 6 : 0;
}

function scoreIntent(intent: number | null | undefined): number {
  if (typeof intent !== "number" || Number.isNaN(intent)) return 0;
  // Provider intent is 0-100; weight up to 10 points so it nudges
  // ranking but doesn't dominate the local fit signals.
  return clamp((intent / 100) * 10, 0, 10);
}

function tierFor(score: number): { tier: ContactScoreTier; label: string } {
  if (score >= 80) return { tier: "high", label: "High fit" };
  if (score >= 60) return { tier: "good", label: "Good fit" };
  if (score >= 40) return { tier: "moderate", label: "Moderate fit" };
  return { tier: "low", label: "Low fit" };
}

export function computeContactScore(
  input: ContactScoreInput,
): ContactScoreResult {
  const breakdown = {
    title: scoreTitle(input.title),
    seniority: scoreSeniority(input.seniority),
    department: scoreDepartment(input.department),
    email: scoreEmail(input),
    enrichment: scoreEnrichment(input.enrichment_status),
    linkedin: scoreLinkedin(input.linkedin_url),
    intent: scoreIntent(input.provider_intent_score),
  };
  const raw =
    breakdown.title +
    breakdown.seniority +
    breakdown.department +
    breakdown.email +
    breakdown.enrichment +
    breakdown.linkedin +
    breakdown.intent;
  // Cap signals reasonably; raw caps at ~84 without intent. Scale into
  // the 0-100 band so a perfectly-fit + verified contact reads as high.
  const score = clamp(Math.round(raw * 1.15));
  const { tier, label } = tierFor(score);
  return { score, tier, label, breakdown };
}

export function tierTone(tier: ContactScoreTier): string {
  switch (tier) {
    case "high":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "good":
      return "border-blue-200 bg-blue-50 text-blue-700";
    case "moderate":
      return "border-amber-200 bg-amber-50 text-amber-700";
    case "low":
      return "border-slate-200 bg-slate-100 text-slate-500";
  }
}
