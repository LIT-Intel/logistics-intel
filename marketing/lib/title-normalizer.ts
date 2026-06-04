// marketing/lib/title-normalizer.ts
//
// Pure title classifier for ICP scoring. Used by the FMCSA outbound
// pipeline to decide who's eligible for the Hot vs Cold list.
//
// Why a separate module: title parsing has trap cases (Sales Floor
// Manager is retail, not a sales manager; Sales Assistant Manager
// is junior despite containing "Sales Manager"). Isolating the logic
// lets us unit-test the trap cases without dragging the rest of the
// pipeline into the test.

export type TitleTier =
  | "owner"          // President, CEO, Owner, Founder, Managing Partner
  | "vp"             // VP-anything (sales-adjacent)
  | "director"       // Director of Sales/BD/Ops/Logistics
  | "sales-manager"  // Sales Manager, BD Manager, Sales Ops Manager
  | "ops"            // Ops/Logistics/Dispatch Manager — Cold only
  | "ic"             // AE, SDR, BDR — users not buyers
  | "junior"         // Coordinator, Assistant, Specialist
  | "unknown";

export interface ClassifiedTitle {
  tier: TitleTier;
  raw: string;
  normalized: string;
}

const JUNIOR_PATTERNS = [
  /\bassistant\b/,
  /\bcoordinator\b/,
  /\bspecialist\b/,
  /\banalyst\b/,
  /\bintern\b/,
  /\btrainee\b/,
  /\bfloor manager\b/, // retail Sales Floor Manager trap
  /\bassistant manager\b/, // Sales Assistant Manager trap
];

const IC_PATTERNS = [
  /\baccount executive\b/,
  /\b(sdr|bdr)\b/,
  /\bsales development representative\b/,
  /\bbusiness development representative\b/,
  /\binside sales rep(resentative)?\b/,
];

const OWNER_PATTERNS = [
  /\bpresident\b/,
  /\b(ceo|chief executive officer)\b/,
  /\bowner\b/,
  /\bfounder\b/,
  /\bmanaging partner\b/,
  /\bproprietor\b/,
];

const VP_PATTERNS = [
  /\b(vp|vice president)\b.*\b(sales|business development|bd|commercial|revenue|operations|ops)\b/,
  /\b(svp|senior vice president)\b/,
  /\b(evp|executive vice president)\b/,
];

const DIRECTOR_PATTERNS = [
  /\bdirector\b.*\b(sales|business development|bd|commercial|revenue|operations|ops|logistics)\b/,
  /\b(sales|business development|bd|commercial|revenue|operations|logistics)\b.*\bdirector\b/,
];

const SALES_MANAGER_PATTERNS = [
  /\bsales manager\b/,
  /\bbusiness development manager\b/,
  /\bbd manager\b/,
  /\bsales operations manager\b/,
  /\bsales ops manager\b/,
];

const OPS_MANAGER_PATTERNS = [
  /\b(operations|logistics|dispatch|transportation|fleet) manager\b/,
];

export function classifyTitle(raw: string | null | undefined): ClassifiedTitle {
  const norm = (raw || "").toLowerCase().trim().replace(/\s+/g, " ");
  if (!norm) return { tier: "unknown", raw: raw || "", normalized: norm };

  // Order matters: traps first, then top-of-pyramid, then descending seniority.
  // VP must come before OWNER to avoid matching "President" in "Vice President"
  if (JUNIOR_PATTERNS.some((p) => p.test(norm))) return { tier: "junior", raw: raw!, normalized: norm };
  if (IC_PATTERNS.some((p) => p.test(norm))) return { tier: "ic", raw: raw!, normalized: norm };
  if (VP_PATTERNS.some((p) => p.test(norm))) return { tier: "vp", raw: raw!, normalized: norm };
  if (OWNER_PATTERNS.some((p) => p.test(norm))) return { tier: "owner", raw: raw!, normalized: norm };
  if (DIRECTOR_PATTERNS.some((p) => p.test(norm))) return { tier: "director", raw: raw!, normalized: norm };
  if (SALES_MANAGER_PATTERNS.some((p) => p.test(norm))) return { tier: "sales-manager", raw: raw!, normalized: norm };
  if (OPS_MANAGER_PATTERNS.some((p) => p.test(norm))) return { tier: "ops", raw: raw!, normalized: norm };

  return { tier: "unknown", raw: raw!, normalized: norm };
}

/** Tiers eligible for the Hot list (direct cold outbound). */
export const HOT_ELIGIBLE_TIERS: ReadonlySet<TitleTier> = new Set([
  "owner", "vp", "director", "sales-manager",
]);

/** Tiers eligible for the Cold list (newsletter only). */
export const COLD_ELIGIBLE_TIERS: ReadonlySet<TitleTier> = new Set([
  "owner", "vp", "director", "sales-manager", "ops",
]);
