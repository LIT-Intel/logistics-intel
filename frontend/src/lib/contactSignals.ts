/**
 * LIT Signals — buyer-intent-style chips derived ONLY from data we
 * actually hold on the contact row (enrichment raw_payload, seniority,
 * department, title, verification state). No fabrication: every signal
 * maps to a concrete field check, and provider-level intent topics
 * (which require a provider plan upgrade) are only surfaced when the
 * data genuinely exists on the row.
 */

export type LitSignalTone = "emerald" | "blue" | "violet" | "amber" | "slate";

export type LitSignal = {
  id:
    | "new_in_role"
    | "decision_maker"
    | "buyer_dept"
    | "likely_engage"
    | "intent_topic";
  label: string;
  tone: LitSignalTone;
  /** Tooltip copy explaining where the signal comes from. */
  detail: string;
};

export type ContactSignalInput = {
  title?: string | null;
  seniority?: string | null;
  department?: string | null;
  /** Full provider payload persisted at enrichment time (jsonb). */
  raw_payload?: Record<string, any> | null;
  /** Org-level buying intent, when the provider plan exposes it (jsonb). */
  buying_intent?: Record<string, any> | Array<any> | null;
};

const DECISION_SENIORITIES = new Set([
  "owner",
  "founder",
  "c_suite",
  "partner",
  "vp",
  "head",
  "director",
]);

const DECISION_TITLE_RE =
  /(vp|vice president|head of|director|chief|president|owner|founder|c\.?e\.?o|c\.?o\.?o|c\.?p\.?o)/i;

const BUYER_DEPT_RE =
  /(supply[ _]?chain|logistics|procurement|purchasing|sourcing|operations|customs|transport|import|freight|warehouse|distribution|fulfillment)/i;

/** Months between an ISO-ish date string and now; null when unparseable. */
function monthsSince(dateStr: unknown): number | null {
  if (typeof dateStr !== "string" || !dateStr) return null;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  return (
    (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth())
  );
}

/** Start date of the contact's CURRENT role from the enrichment payload. */
function currentRoleStart(raw: Record<string, any> | null | undefined): string | null {
  const history = raw?.employment_history;
  if (!Array.isArray(history)) return null;
  const current = history.find(
    (e: any) => e && (e.current === true || e.current === "true"),
  );
  const start = current?.start_date;
  return typeof start === "string" && start ? start : null;
}

/**
 * Derive branded "LIT Signals" for a contact row. Returns at most
 * `max` signals, strongest first.
 */
export function deriveContactSignals(
  input: ContactSignalInput,
  max = 3,
): LitSignal[] {
  const signals: LitSignal[] = [];
  const raw = input.raw_payload || null;
  const title = String(input.title || "");
  const seniority = String(input.seniority || raw?.seniority || "")
    .toLowerCase()
    .replace(/[\s-]+/g, "_");

  // 1) New in role — current employment started within the last 12 months.
  const startDate = currentRoleStart(raw);
  const tenureMonths = monthsSince(startDate);
  if (tenureMonths !== null && tenureMonths >= 0 && tenureMonths <= 12) {
    signals.push({
      id: "new_in_role",
      label: "New in role",
      tone: "violet",
      detail: `Started their current role ${
        tenureMonths <= 1 ? "within the last month" : `~${tenureMonths} months ago`
      } — new leaders re-evaluate vendors early.`,
    });
  }

  // 2) Decision maker — provider seniority or a leadership title.
  if (DECISION_SENIORITIES.has(seniority) || DECISION_TITLE_RE.test(title)) {
    signals.push({
      id: "decision_maker",
      label: "Decision maker",
      tone: "emerald",
      detail:
        "Leadership-level seniority or title — can approve or influence freight and logistics spend.",
    });
  }

  // 3) Active buyer department — sits in a freight-buying function.
  const deptHaystack = [
    input.department || "",
    ...(Array.isArray(raw?.departments) ? raw.departments : []),
    ...(Array.isArray(raw?.subdepartments) ? raw.subdepartments : []),
    ...(Array.isArray(raw?.functions) ? raw.functions : []),
    title,
  ]
    .map(String)
    .join(" ");
  if (BUYER_DEPT_RE.test(deptHaystack)) {
    signals.push({
      id: "buyer_dept",
      label: "Buyer dept",
      tone: "blue",
      detail:
        "Works in a department that owns logistics / supply-chain purchasing decisions.",
    });
  }

  // 4) Likely to engage — only when the provider explicitly flags it.
  if (raw?.is_likely_to_engage === true) {
    signals.push({
      id: "likely_engage",
      label: "Likely to engage",
      tone: "amber",
      detail: "LIT engagement model flags this contact as receptive to outreach.",
    });
  }

  // 5) Org buying intent — only when intent data is actually present
  // (requires a provider intent plan; never fabricated).
  const intent = input.buying_intent ?? raw?.intent_strength ?? null;
  const hasIntent =
    (typeof intent === "string" && intent.length > 0) ||
    (typeof intent === "number" && !Number.isNaN(intent)) ||
    (Array.isArray(intent) && intent.length > 0) ||
    (intent !== null &&
      typeof intent === "object" &&
      !Array.isArray(intent) &&
      Object.keys(intent).length > 0);
  if (hasIntent) {
    signals.push({
      id: "intent_topic",
      label: "Active buyer",
      tone: "amber",
      detail: "Account shows active buying-intent signals in the LIT network.",
    });
  }

  return signals.slice(0, max);
}

export function signalToneClasses(tone: LitSignalTone): string {
  switch (tone) {
    case "emerald":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "blue":
      return "border-blue-200 bg-blue-50 text-blue-700";
    case "violet":
      return "border-violet-200 bg-violet-50 text-violet-700";
    case "amber":
      return "border-amber-200 bg-amber-50 text-amber-700";
    case "slate":
      return "border-slate-200 bg-slate-100 text-slate-500";
  }
}
