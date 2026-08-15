/**
 * Pulse Coach — pipeline-aware prompt handling (client-side, no LLM).
 *
 * The Pulse Coach composer sends most questions to the `pulse-coach` edge
 * function. Pipeline questions are answered LOCALLY instead: we detect them
 * by keyword, call the org-scoped `lit_pipeline_summary()` RPC (migration
 * 20260814140000), and format the JSON into a factual answer card. This keeps
 * pipeline answers real (no fabrication) and avoids any change to the shared
 * pulse-coach edge function.
 */

import { loadPipelineSummary, type PipelineSummary } from "@/api/crmReports";
import { formatMoney } from "@/features/crm/crmFormat";

/** Pre-built chips surfaced above the composer input. */
export const PIPELINE_PROMPTS = [
  "What deals need my attention?",
  "What's my pipeline value?",
  "Which deals are stuck?",
  "Who should I follow up with?",
  "What did we win this month?",
] as const;

export type PipelineAnswer = {
  md: string;
  cta: { label: string; url: string } | null;
};

const PIPELINE_URL = "/app/command-center";

/**
 * Returns true if the free-text prompt is a pipeline / deals / CRM question
 * the composer should answer locally rather than hitting the coach edge fn.
 */
export function isPipelineQuestion(text: string): boolean {
  const q = text.toLowerCase();
  // Strong CRM signals.
  const kw = [
    "pipeline", "deal", "deals", "forecast", "won ", "win rate", "stuck",
    "follow up", "follow-up", "overdue", "quota", "close this month",
    "won this month", "in negotiation", "negotiation", "quoted",
    "need my attention", "at risk", "at-risk", "closing soon", "closing",
  ];
  return kw.some((k) => q.includes(k));
}

function classify(text: string): "attention" | "stuck" | "followup" | "won" | "overview" {
  const q = text.toLowerCase();
  // "What deals need my attention?" — the at-risk digest (closing soon +
  // overdue close + stale). Checked first so it wins over the narrower buckets.
  if (
    q.includes("need my attention") || q.includes("attention") ||
    q.includes("at risk") || q.includes("at-risk") ||
    q.includes("closing soon") || q.includes("closing") ||
    (q.includes("overdue") && q.includes("deal"))
  ) return "attention";
  if (q.includes("stuck") || q.includes("no activity") || q.includes("stale")) return "stuck";
  if (q.includes("follow up") || q.includes("follow-up") || q.includes("overdue") || q.includes("who should i")) return "followup";
  if (q.includes("won") || q.includes("close") || q.includes("this month")) return "won";
  return "overview";
}

/** Compact "Aug 28" style label for a close date. */
function closeDateLabel(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/**
 * "What deals need my attention?" — a factual at-risk digest built entirely
 * from the RPC's real, owner-scoped data (no fabrication): overdue close dates
 * first (most urgent), then closing-soon, then deals gone quiet (stale/stuck).
 */
function attentionMd(s: PipelineSummary): string {
  const overdue = s.overdue ?? [];
  const closingSoon = s.closing_soon ?? [];
  const stuck = s.stuck_deals ?? [];
  const total = overdue.length + closingSoon.length + stuck.length;
  if (total === 0) {
    return "Nothing needs your attention right now — no deals are overdue, closing in the next few days, or going cold. 🎯";
  }
  const lines: string[] = [];
  lines.push(`${total} deal${total === 1 ? "" : "s"} could use a look:`);

  if (overdue.length) {
    lines.push("");
    lines.push(`⚠️ Past close date (${overdue.length}):`);
    for (const d of overdue.slice(0, 5)) {
      const val = d.value != null ? ` · ${formatMoney(d.value)}` : "";
      const by = Math.abs(d.days ?? 0);
      const when = closeDateLabel(d.expected_close_date);
      lines.push(`  • ${d.title} (${d.stage})${val} — due ${when}, ${by}d overdue`);
    }
  }

  if (closingSoon.length) {
    lines.push("");
    lines.push(`⏳ Closing soon (${closingSoon.length}):`);
    for (const d of closingSoon.slice(0, 5)) {
      const val = d.value != null ? ` · ${formatMoney(d.value)}` : "";
      const when = closeDateLabel(d.expected_close_date);
      const inDays = d.days === 0 ? "today" : `in ${d.days}d`;
      lines.push(`  • ${d.title} (${d.stage})${val} — closes ${when} (${inDays})`);
    }
  }

  if (stuck.length) {
    lines.push("");
    lines.push(`💤 Going quiet (${s.stuck_count ?? stuck.length}):`);
    for (const d of stuck.slice(0, 4)) {
      const val = d.value != null ? ` · ${formatMoney(d.value)}` : "";
      lines.push(`  • ${d.title} (${d.stage})${val} — ${d.days_stale}d idle`);
    }
  }

  return lines.join("\n");
}

function overviewMd(s: PipelineSummary): string {
  const lines: string[] = [];
  lines.push(`Your workspace has ${s.open_deal_count ?? 0} open deals worth ${formatMoney(s.open_value ?? 0)}.`);
  lines.push(`Weighted forecast: ${formatMoney(s.weighted_forecast ?? 0)} (each deal's value × its stage win-probability).`);
  const stages = (s.stage_breakdown ?? []).filter((b) => !b.is_won && !b.is_lost && b.open_count > 0);
  if (stages.length) {
    lines.push("");
    lines.push("By stage:");
    for (const b of stages) lines.push(`  • ${b.stage}: ${b.open_count} deal${b.open_count === 1 ? "" : "s"} · ${formatMoney(b.open_value)} (${b.win_probability}% win)`);
  }
  if ((s.won_mtd_count ?? 0) > 0) {
    lines.push("");
    lines.push(`Won month-to-date: ${s.won_mtd_count} deal${s.won_mtd_count === 1 ? "" : "s"} · ${formatMoney(s.won_mtd_value ?? 0)}.`);
  }
  return lines.join("\n");
}

function stuckMd(s: PipelineSummary): string {
  const stuck = s.stuck_deals ?? [];
  if (!stuck.length) return "Nothing is stuck — every open deal has had activity in the last 14 days. Nice.";
  const lines: string[] = [];
  lines.push(`${s.stuck_count ?? stuck.length} deal${(s.stuck_count ?? stuck.length) === 1 ? " has" : "s have"} had no activity in 14+ days:`);
  lines.push("");
  for (const d of stuck.slice(0, 6)) {
    const val = d.value != null ? ` · ${formatMoney(d.value)}` : "";
    lines.push(`  • ${d.title} (${d.stage})${val} — ${d.days_stale}d idle`);
  }
  return lines.join("\n");
}

function followupMd(s: PipelineSummary): string {
  const tasks = s.overdue_tasks ?? [];
  const stuck = s.stuck_deals ?? [];
  const lines: string[] = [];
  if (tasks.length) {
    lines.push(`You have ${tasks.length} overdue task${tasks.length === 1 ? "" : "s"}:`);
    for (const t of tasks.slice(0, 5)) {
      const due = t.due_date ? new Date(t.due_date).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "";
      lines.push(`  • ${t.title}${due ? ` (due ${due})` : ""}`);
    }
  }
  if (stuck.length) {
    if (lines.length) lines.push("");
    lines.push(`And ${stuck.length} deal${stuck.length === 1 ? "" : "s"} going cold — worth a nudge:`);
    for (const d of stuck.slice(0, 4)) lines.push(`  • ${d.title} (${d.stage}) — ${d.days_stale}d idle`);
  }
  if (!lines.length) return "You're all caught up — no overdue tasks and no deals going cold. 🎯";
  return lines.join("\n");
}

function wonMd(s: PipelineSummary): string {
  if ((s.won_mtd_count ?? 0) === 0) return "No deals closed won yet this month. Your weighted forecast for open deals is " + formatMoney(s.weighted_forecast ?? 0) + ".";
  return `You've won ${s.won_mtd_count} deal${s.won_mtd_count === 1 ? "" : "s"} this month for ${formatMoney(s.won_mtd_value ?? 0)}. Open weighted forecast is ${formatMoney(s.weighted_forecast ?? 0)}.`;
}

/**
 * Fetch + format a pipeline answer. Returns null on transport failure so the
 * composer can fall back to the normal coach path.
 */
export async function answerPipelineQuestion(text: string): Promise<PipelineAnswer | null> {
  const s = await loadPipelineSummary();
  if (!s) return null;
  if (!s.ok) {
    return {
      md: "I couldn't find a workspace pipeline for your account yet. Add a deal from Command Center → Pipeline and I'll start tracking your forecast.",
      cta: { label: "Open Command Center", url: PIPELINE_URL },
    };
  }
  let md: string;
  switch (classify(text)) {
    case "attention": md = attentionMd(s); break;
    case "stuck": md = stuckMd(s); break;
    case "followup": md = followupMd(s); break;
    case "won": md = wonMd(s); break;
    default: md = overviewMd(s);
  }
  return { md, cta: { label: "Open pipeline", url: PIPELINE_URL } };
}
