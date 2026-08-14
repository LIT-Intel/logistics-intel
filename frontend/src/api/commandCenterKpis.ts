// Command Center KPI header aggregate.
//
// Own file per ownership rules — the CommandCenter header KPI bar sources its
// numbers here so we never edit crm.ts / crmReports.ts. This is a thin,
// org-scoped read: a SINGLE call to the security-definer RPC
// `lit_pipeline_summary()` (migration 20260814140000), which resolves the
// caller's own active org from auth.uid() and hard-filters every aggregate to
// it via RLS-equivalent org scoping. No org_id argument is accepted, so a
// caller can only ever read their own workspace.
//
// The RPC returns much more (stage breakdown, stuck deals, overdue task list)
// — the Reports tab consumes the deep view. Here we only surface the five
// header KPIs the CEO asked for.

import { supabase } from "@/lib/supabase";

export type CommandCenterKpis = {
  /** Open pipeline $ — sum of value on all open deals. */
  openPipelineValue: number;
  /** Active deals — count of open lit_deals. */
  activeDealCount: number;
  /** Weighted forecast $ — Σ(value × stage win_probability). */
  weightedForecast: number;
  /** Won month-to-date $ — sum of value on deals won since month start. */
  wonMtdValue: number;
  /** Overdue tasks (org-scoped) surfaced by the RPC. Viewer-scoped overdue
   *  count is layered on top by the caller for the amber highlight. */
  overdueTaskCount: number;
};

const EMPTY_KPIS: CommandCenterKpis = {
  openPipelineValue: 0,
  activeDealCount: 0,
  weightedForecast: 0,
  wonMtdValue: 0,
  overdueTaskCount: 0,
};

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Loads the Command Center header KPIs via one `lit_pipeline_summary()` call.
 * Never throws — on transport error, no active org, or an `{ ok: false }`
 * payload it returns clean zeros so the header renders 0s, not blanks.
 */
export async function loadCommandCenterKpis(
  ownerUserId?: string | null,
): Promise<CommandCenterKpis> {
  // ownerUserId is the owner/admin "view as [member]" filter, forwarded to the
  // RPC as p_owner_user_id. The RPC ignores it for regular members (own-only)
  // and honours it for owner/admin; NULL = whole org.
  const { data, error } = await supabase.rpc("lit_pipeline_summary", {
    p_owner_user_id: ownerUserId ?? null,
  });
  if (error || !data || (data as { ok?: boolean }).ok === false) {
    return { ...EMPTY_KPIS };
  }
  const d = data as Record<string, unknown>;
  const overdue = Array.isArray(d.overdue_tasks) ? d.overdue_tasks.length : 0;
  return {
    openPipelineValue: num(d.open_value),
    activeDealCount: num(d.open_deal_count),
    weightedForecast: num(d.weighted_forecast),
    wonMtdValue: num(d.won_mtd_value),
    overdueTaskCount: overdue,
  };
}
