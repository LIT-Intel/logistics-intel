/**
 * CRM v2 pure selectors / VM builders. Ported from the design handoff's
 * `crm()` logic (design_handoff_crm_outbound/Command Center.dc.html) with
 * one hard rule: every number comes from real rows. Anything the prototype
 * hard-coded (quota, benchmark win rates, TEAM stats) is either computed
 * from real history or NOT built.
 *
 * No React, no IO — everything takes (deals, stages, tasks, now) and
 * returns plain view-models. Unit-tested in __tests__/computeCrm.test.ts.
 */
import type { DealStage } from "@/api/crm";
import type { DealCardV2, TaskV2, StageChangeEvent } from "../api";

export const STALE_DAYS = 14;
const DAY = 86_400_000;

// Spec §Stages & probabilities — canonical name → probability.
const CANONICAL_P: Record<string, number> = {
  new: 0.1,
  qualified: 0.25,
  quoted: 0.5,
  negotiation: 0.75,
  won: 1,
  lost: 0,
};

// ── Basics ─────────────────────────────────────────────────────────────
export const isOpenDeal = (d: DealCardV2): boolean =>
  d.status === "open";

/** Stale = open deal whose last activity is > 14 days ago (spec rule). */
export function isStale(d: DealCardV2, now = Date.now()): boolean {
  if (!isOpenDeal(d)) return false;
  const ref = d.last_activity_at ?? d.updated_at ?? d.created_at;
  if (!ref) return false;
  const t = new Date(ref).getTime();
  if (Number.isNaN(t)) return false;
  return now - t > STALE_DAYS * DAY;
}

export function daysSinceTouch(d: DealCardV2, now = Date.now()): number | null {
  const ref = d.last_activity_at ?? d.updated_at ?? d.created_at;
  if (!ref) return null;
  const t = new Date(ref).getTime();
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((now - t) / DAY));
}

export const hasNoStep = (d: DealCardV2): boolean => isOpenDeal(d) && !d.next_step_text;

/**
 * Probability for a stage over the org's REAL lit_deal_stages. Canonical
 * name match wins (New/Qualified/Quoted/Negotiation/Won/Lost); otherwise
 * interpolate 0.10 → 0.75 across the open stages by position.
 */
export function stageProbability(stage: DealStage | undefined, stages: DealStage[]): number {
  if (!stage) return 0;
  if (stage.is_won) return 1;
  if (stage.is_lost) return 0;
  const canonical = CANONICAL_P[stage.name.trim().toLowerCase()];
  if (canonical != null) return canonical;
  const open = stages
    .filter((s) => !s.is_won && !s.is_lost)
    .sort((a, b) => a.position - b.position);
  const i = open.findIndex((s) => s.id === stage.id);
  if (i < 0 || open.length === 0) return 0.5;
  if (open.length === 1) return 0.5;
  return 0.1 + (i / (open.length - 1)) * 0.65;
}

export function weightedValue(d: DealCardV2, stages: DealStage[]): number {
  const stage = stages.find((s) => s.id === d.stage_id);
  return (Number(d.value_amount) || 0) * stageProbability(stage, stages);
}

/** "Commit"-like = negotiation canonical name, else highest-p open stage. */
export function commitStageIds(stages: DealStage[]): Set<string> {
  const byName = stages.filter((s) => s.name.trim().toLowerCase() === "negotiation");
  if (byName.length) return new Set(byName.map((s) => s.id));
  const open = stages.filter((s) => !s.is_won && !s.is_lost).sort((a, b) => a.position - b.position);
  return new Set(open.length ? [open[open.length - 1].id] : []);
}
export function quotedStageIds(stages: DealStage[]): Set<string> {
  const byName = stages.filter((s) => s.name.trim().toLowerCase() === "quoted");
  if (byName.length) return new Set(byName.map((s) => s.id));
  const open = stages.filter((s) => !s.is_won && !s.is_lost).sort((a, b) => a.position - b.position);
  return new Set(open.length > 1 ? [open[open.length - 2].id] : []);
}

// ── Suggested next step (prototype NEXT templates, real fields only) ───
const NEXT_BY_STAGE: Record<string, string> = {
  new: "Discovery call with {c}",
  qualified: "Get 90-day volume forecast from {c}",
  quoted: "Walk {c} through the quote",
  negotiation: "Send revised rate sheet to {c}",
};
export function suggestStep(d: DealCardV2, stages: DealStage[]): string {
  const stage = stages.find((s) => s.id === d.stage_id);
  const tmpl = stage ? NEXT_BY_STAGE[stage.name.trim().toLowerCase()] : undefined;
  const who = d.contactName ? d.contactName.split(/\s+/)[0] : "the team";
  return tmpl ? tmpl.replace("{c}", who) : "Agree on a next step";
}

// ── Pipeline columns (Layout A board) ──────────────────────────────────
export type PipelineColumn = {
  stage: DealStage;
  probability: number;
  deals: DealCardV2[];
  count: number;
  total: number;
  weighted: number;
  /** "{weighted} weighted · {p}%" for open; "This quarter"/"Last 90 days" handled in UI */
  isClosedCol: boolean;
};
export function selectPipelineColumns(
  deals: DealCardV2[],
  stages: DealStage[],
  now = Date.now(),
): PipelineColumn[] {
  return [...stages]
    .sort((a, b) => a.position - b.position)
    .map((stage) => {
      const p = stageProbability(stage, stages);
      const ds = deals.filter((d) => d.stage_id === stage.id);
      const total = ds.reduce((s, d) => s + (Number(d.value_amount) || 0), 0);
      return {
        stage,
        probability: p,
        deals: ds,
        count: ds.length,
        total,
        weighted: total * p,
        isClosedCol: stage.is_won || stage.is_lost,
      };
    });
}

export type PipelineKpis = {
  openValue: number;
  openCount: number;
  weighted: number;
  commit: number;
  wonQtd: number;
  staleCount: number;
  noStepCount: number;
};
export function selectPipelineKpis(
  deals: DealCardV2[],
  stages: DealStage[],
  now = Date.now(),
): PipelineKpis {
  const open = deals.filter(isOpenDeal);
  const commitIds = commitStageIds(stages);
  const qStart = quarterStart(new Date(now));
  const wonQtd = deals
    .filter((d) => d.status === "won" && d.closed_at && new Date(d.closed_at).getTime() >= qStart.getTime())
    .reduce((s, d) => s + (Number(d.value_amount) || 0), 0);
  return {
    openValue: open.reduce((s, d) => s + (Number(d.value_amount) || 0), 0),
    openCount: open.length,
    weighted: open.reduce((s, d) => s + weightedValue(d, stages), 0),
    commit: open.filter((d) => commitIds.has(d.stage_id)).reduce((s, d) => s + (Number(d.value_amount) || 0), 0),
    wonQtd,
    staleCount: open.filter((d) => isStale(d, now)).length,
    noStepCount: open.filter(hasNoStep).length,
  };
}

function quarterStart(d: Date): Date {
  return new Date(d.getFullYear(), Math.floor(d.getMonth() / 3) * 3, 1);
}

// ── Forecast groups (Layout B list) ────────────────────────────────────
export type ForecastGroup = {
  key: string; // "2026-09" or "none"
  label: string; // "Closing Sep 2026" | "No close date"
  deals: DealCardV2[];
  total: number;
  weighted: number;
};
export function selectForecastGroups(
  deals: DealCardV2[],
  stages: DealStage[],
): ForecastGroup[] {
  const open = deals.filter(isOpenDeal);
  const map = new Map<string, DealCardV2[]>();
  for (const d of open) {
    let key = "none";
    if (d.expected_close_date) {
      const t = new Date(d.expected_close_date + "T00:00:00");
      if (!Number.isNaN(t.getTime())) key = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}`;
    }
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(d);
  }
  const labelOf = (key: string) => {
    if (key === "none") return "No close date";
    const [y, m] = key.split("-").map(Number);
    return "Closing " + new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: "short", year: "numeric" });
  };
  return [...map.entries()]
    .sort((a, b) => (a[0] === "none" ? 1 : b[0] === "none" ? -1 : a[0].localeCompare(b[0])))
    .map(([key, ds]) => ({
      key,
      label: labelOf(key),
      deals: [...ds].sort((a, b) => weightedValue(b, stages) - weightedValue(a, stages)),
      total: ds.reduce((s, d) => s + (Number(d.value_amount) || 0), 0),
      weighted: ds.reduce((s, d) => s + weightedValue(d, stages), 0),
    }));
}

// ── Tasks ──────────────────────────────────────────────────────────────
/** Effective due date: snoozed_until wins when later than due_date. */
export function effectiveDue(t: TaskV2): string | null {
  if (t.snoozed_until && (!t.due_date || t.snoozed_until > t.due_date)) return t.snoozed_until;
  return t.due_date;
}

/** Whole-day diff vs local today; null = no due date. */
export function dueDayDiff(t: TaskV2, now = Date.now()): number | null {
  const due = effectiveDue(t);
  if (!due) return null;
  const d = new Date(due + (due.length <= 10 ? "T00:00:00" : ""));
  if (Number.isNaN(d.getTime())) return null;
  const n = new Date(now);
  const today = new Date(n.getFullYear(), n.getMonth(), n.getDate()).getTime();
  const dd = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  return Math.round((dd - today) / DAY);
}

export type TaskSections = {
  overdue: TaskV2[];
  today: TaskV2[];
  upcoming: TaskV2[]; // includes no-due-date tasks, at the end
};
export function selectTaskSections(tasks: TaskV2[], now = Date.now()): TaskSections {
  const open = tasks.filter((t) => t.status === "open");
  const withDiff = open.map((t) => ({ t, diff: dueDayDiff(t, now) }));
  const byDue = (a: { t: TaskV2; diff: number | null }, b: { t: TaskV2; diff: number | null }) => {
    if (a.diff == null && b.diff == null) return 0;
    if (a.diff == null) return 1;
    if (b.diff == null) return -1;
    return a.diff - b.diff;
  };
  return {
    overdue: withDiff.filter((x) => x.diff != null && x.diff < 0).sort(byDue).map((x) => x.t),
    today: withDiff.filter((x) => x.diff === 0).map((x) => x.t),
    upcoming: withDiff.filter((x) => x.diff == null || x.diff > 0).sort(byDue).map((x) => x.t),
  };
}

/** Focus queue: open tasks, most-urgent first (overdue → today → upcoming). */
export function selectFocusQueue(tasks: TaskV2[], now = Date.now()): TaskV2[] {
  const s = selectTaskSections(tasks, now);
  return [...s.overdue, ...s.today, ...s.upcoming];
}

// ── Harvey next best action (spec §Deal panel, exact rule order) ───────
export type CompanyHealth = {
  health?: "growing" | "slowing" | "dormant" | "steady" | null;
  yoyPct?: number | null; // e.g. -0.18
  newLaneOrigin?: string | null;
  cadenceDays?: number | null;
  carrier?: string | null;
  decisionMakerName?: string | null;
};
export type HarveyNBA = { title: string; body: string; cta: string; rule: string };

export function selectHarveyNBA(
  d: DealCardV2,
  stages: DealStage[],
  now = Date.now(),
  healthByCompanyUuid?: Record<string, CompanyHealth>,
): HarveyNBA {
  const h = (d.company_id && healthByCompanyUuid?.[d.company_id]) || undefined;
  const who = d.contactName || d.companyName || d.title || "this account";
  const lane =
    d.origin && d.destination ? `${d.origin} → ${d.destination}` : d.origin || d.destination || null;

  // 1. Won → expansion
  if (d.status === "won") {
    return {
      rule: "won",
      title: "Open an expansion deal",
      body: lane ? `This deal covers ${lane}. Quote their other lanes next.` : "Quote their other lanes next.",
      cta: "Create expansion deal",
    };
  }
  // 2. Lost → re-check
  if (d.status === "lost") {
    return {
      rule: "lost",
      title: "Re-check in 90 days",
      body:
        (d.lost_reason ? `Lost on ${d.lost_reason.toLowerCase()}. ` : "") +
        "Harvey will flag it if their volume or carrier changes.",
      cta: "Set reminder",
    };
  }
  // 3. No next step → use suggestion
  if (!d.next_step_text) {
    return {
      rule: "no-step",
      title: "Set a next step",
      body: `Nothing is scheduled with ${who}. Suggested: ${suggestStep(d, stages)}.`,
      cta: "Use suggestion",
    };
  }
  // 4. Stale → re-engage
  if (isStale(d, now)) {
    const days = daysSinceTouch(d, now);
    return {
      rule: "stale",
      title: `Re-engage ${h?.decisionMakerName || who}`,
      body: `No touch in ${days ?? "14+"} days. Get back in front of them before the next booking.`,
      cta: "Call now",
    };
  }
  // 5. Volume slowing (needs shipment health)
  if (h?.health === "slowing") {
    const pct = h.yoyPct != null ? `${Math.round(Math.abs(h.yoyPct) * 100)}% ` : "";
    return {
      rule: "slowing",
      title: "Ask about the volume drop",
      body: `Shipments are down ${pct}year over year. Freight may be moving to another forwarder.`,
      cta: "Draft email",
    };
  }
  // 6. New lane (needs shipment health)
  if (h?.newLaneOrigin) {
    return {
      rule: "new-lane",
      title: `Add the ${h.newLaneOrigin} lane`,
      body: `First shipments from ${h.newLaneOrigin} this quarter. Quote it before another forwarder does.`,
      cta: "Add line item",
    };
  }
  // 7. Default → quote before next booking
  return {
    rule: "default",
    title: "Quote before the next booking",
    body:
      h?.cadenceDays && h?.carrier
        ? `They ship ${lane ?? "their main lane"} about every ${h.cadenceDays} days, currently with ${h.carrier}.`
        : h?.carrier
          ? `Currently booking with ${h.carrier}.`
          : lane
            ? `Get a rate in front of them for ${lane} before they book again.`
            : "Get a rate in front of them before they book again.",
    cta: "Build quote",
  };
}

// ── Reports A: forecast by close month ─────────────────────────────────
export type ForecastMonth = {
  key: string;
  label: string; // "Sep 2026" | "No close date"
  commit: number;
  best: number;
  pipeline: number;
  total: number;
};
export function selectForecastByMonth(deals: DealCardV2[], stages: DealStage[]): ForecastMonth[] {
  const commitIds = commitStageIds(stages);
  const quotedIds = quotedStageIds(stages);
  return selectForecastGroups(deals, stages).map((g) => {
    const commit = g.deals.filter((d) => commitIds.has(d.stage_id)).reduce((s, d) => s + (Number(d.value_amount) || 0), 0);
    const best = g.deals.filter((d) => quotedIds.has(d.stage_id)).reduce((s, d) => s + (Number(d.value_amount) || 0), 0);
    const total = g.total;
    return {
      key: g.key,
      label: g.label.replace(/^Closing /, ""),
      commit,
      best,
      pipeline: Math.max(0, total - commit - best),
      total,
    };
  });
}

// ── Reports: stage conversion from real stage_change history ───────────
export type ConversionRow = {
  label: string; // "New → Qualified"
  rate: number; // 0..1
  entered: number;
  advanced: number;
  avgDays: number | null;
};
/**
 * From lit_deal_activity stage_change events: for each adjacent pair of
 * open stages A→B (by position), rate = deals that entered B after entering
 * A / deals that entered A. Returns [] when there are no transitions at all
 * (UI hides the card).
 */
export function selectStageConversion(
  events: StageChangeEvent[],
  stages: DealStage[],
): ConversionRow[] {
  if (!events.length) return [];
  const ordered = [...stages].sort((a, b) => a.position - b.position).filter((s) => !s.is_lost);
  // First entry time per (deal, stageName)
  const entered = new Map<string, Map<string, number>>(); // stageName → dealId → ts
  for (const e of events) {
    if (!e.to_name) continue;
    const key = e.to_name.trim().toLowerCase();
    if (!entered.has(key)) entered.set(key, new Map());
    const m = entered.get(key)!;
    const ts = new Date(e.created_at).getTime();
    if (!m.has(e.deal_id) || ts < m.get(e.deal_id)!) m.set(e.deal_id, ts);
  }
  const rows: ConversionRow[] = [];
  for (let i = 0; i < ordered.length - 1; i++) {
    const a = ordered[i], b = ordered[i + 1];
    const aM = entered.get(a.name.trim().toLowerCase());
    const bM = entered.get(b.name.trim().toLowerCase());
    if (!aM || !aM.size) continue;
    let advanced = 0;
    const diffs: number[] = [];
    for (const [dealId, aTs] of aM) {
      const bTs = bM?.get(dealId);
      if (bTs != null && bTs >= aTs) {
        advanced++;
        diffs.push((bTs - aTs) / DAY);
      }
    }
    rows.push({
      label: `${a.name} → ${b.name}`,
      rate: aM.size ? advanced / aM.size : 0,
      entered: aM.size,
      advanced,
      avgDays: diffs.length ? Math.round(diffs.reduce((s, x) => s + x, 0) / diffs.length) : null,
    });
  }
  return rows.filter((r) => r.entered > 0);
}

// ── Reports: lost reasons (real lost_reason group-by) ──────────────────
export type LostReasonRow = { label: string; count: number };
export function selectLostReasons(deals: DealCardV2[]): LostReasonRow[] {
  const lost = deals.filter((d) => d.status === "lost" && d.lost_reason);
  const map = new Map<string, number>();
  for (const d of lost) map.set(d.lost_reason!, (map.get(d.lost_reason!) ?? 0) + 1);
  return [...map.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);
}

// ── Reports B: source cards ────────────────────────────────────────────
export const MIN_CLOSED_FOR_RATE = 5;
export type SourceCard = {
  source: string; // 'manual' | 'signal' | 'outbound' | ...
  label: string;
  openValue: number;
  openCount: number;
  closed90: number;
  /** null when closed90 < MIN_CLOSED_FOR_RATE → UI renders "Not enough closed deals yet" */
  winRate: number | null;
};
const SOURCE_LABEL: Record<string, string> = {
  signal: "Signal",
  outbound: "Outbound Engine",
  manual: "Manual",
};
export function selectSourceCards(deals: DealCardV2[], now = Date.now()): SourceCard[] {
  const since = now - 90 * DAY;
  const bySource = new Map<string, DealCardV2[]>();
  for (const d of deals) {
    const src = (d.source || "manual").toLowerCase();
    if (!bySource.has(src)) bySource.set(src, []);
    bySource.get(src)!.push(d);
  }
  return [...bySource.entries()]
    .map(([source, ds]) => {
      const open = ds.filter(isOpenDeal);
      const closed90 = ds.filter(
        (d) => (d.status === "won" || d.status === "lost") && d.closed_at && new Date(d.closed_at).getTime() >= since,
      );
      const wins = closed90.filter((d) => d.status === "won").length;
      return {
        source,
        label: SOURCE_LABEL[source] ?? source.charAt(0).toUpperCase() + source.slice(1),
        openValue: open.reduce((s, d) => s + (Number(d.value_amount) || 0), 0),
        openCount: open.length,
        closed90: closed90.length,
        winRate: closed90.length >= MIN_CLOSED_FOR_RATE ? wins / closed90.length : null,
      };
    })
    .sort((a, b) => b.openValue - a.openValue);
}

// ── Reports B: aging heatmap ───────────────────────────────────────────
export const AGING_BUCKETS: Array<{ label: string; min: number; max: number }> = [
  { label: "0–7d", min: 0, max: 7 },
  { label: "8–14d", min: 8, max: 14 },
  { label: "15–30d", min: 15, max: 30 },
  { label: "30d+", min: 31, max: Number.POSITIVE_INFINITY },
];
export type AgingRow = { stage: DealStage; cells: number[] };
export function selectAgingMatrix(
  deals: DealCardV2[],
  stages: DealStage[],
  now = Date.now(),
): AgingRow[] {
  const open = deals.filter(isOpenDeal);
  return [...stages]
    .sort((a, b) => a.position - b.position)
    .filter((s) => !s.is_won && !s.is_lost)
    .map((stage) => ({
      stage,
      cells: AGING_BUCKETS.map(
        (b) =>
          open.filter((d) => {
            if (d.stage_id !== stage.id) return false;
            const days = daysSinceTouch(d, now);
            return days != null && days >= b.min && days <= b.max;
          }).length,
      ),
    }));
}

// ── Reports B: service win rates ───────────────────────────────────────
export type ServiceBucket = "Ocean" | "Drayage" | "Air" | "Truckload" | "Other";
export const SERVICE_BUCKETS: ServiceBucket[] = ["Ocean", "Drayage", "Air", "Truckload", "Other"];
export function serviceBucketOf(serviceType: string | null | undefined): ServiceBucket {
  switch (serviceType) {
    case "ocean":
      return "Ocean";
    case "drayage":
      return "Drayage";
    case "air":
      return "Air";
    case "dry_van":
    case "flat_bed":
    case "reefer":
    case "straight_truck":
    case "hot_shot":
    case "sprinter_van":
      return "Truckload";
    default:
      return "Other";
  }
}
export type ServiceWinRow = {
  bucket: ServiceBucket;
  dealCount: number;
  closed90: number;
  winRate: number | null; // null under the ≥5-closed guard
};
export function selectServiceWinRates(deals: DealCardV2[], now = Date.now()): ServiceWinRow[] {
  const since = now - 90 * DAY;
  return SERVICE_BUCKETS.map((bucket) => {
    const ds = deals.filter((d) => serviceBucketOf(d.service_type) === bucket);
    const closed90 = ds.filter(
      (d) => (d.status === "won" || d.status === "lost") && d.closed_at && new Date(d.closed_at).getTime() >= since,
    );
    const wins = closed90.filter((d) => d.status === "won").length;
    return {
      bucket,
      dealCount: ds.length,
      closed90: closed90.length,
      winRate: closed90.length >= MIN_CLOSED_FOR_RATE ? wins / closed90.length : null,
    };
  }).filter((r) => r.dealCount > 0);
}

// ── Small shared labels ────────────────────────────────────────────────
export function dueLabel(diff: number | null): string {
  if (diff == null) return "No due date";
  if (diff < 0) return `Overdue ${-diff}d`;
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  return `In ${diff}d`;
}
export function dueColor(diff: number | null): string {
  if (diff == null) return "#64748b";
  if (diff < 0) return "#e11d48";
  if (diff === 0) return "#d97706";
  return "#64748b";
}
