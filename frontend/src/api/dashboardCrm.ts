/**
 * Dashboard CRM read helper (NEW file per CLAUDE.md — do NOT grow crm.ts /
 * crmReports.ts).
 *
 * Feeds the Workspace Overview dashboard's two CEO surfaces:
 *   1. The two swapped KPI chips — "Active Opportunities" (open deal count)
 *      and "Closed Won" (won $ MTD, with an all-time subline).
 *   2. The "Pipeline & Revenue" card (PipelineRevenueCard.tsx) — weighted
 *      forecast + open pipeline headline, by-stage mini funnel, a
 *      needs-attention strip (stale deals + overdue tasks), and recent wins.
 *
 * Org-scoping model (matches crm.ts / crmReports.ts): everything reads
 * through the user-scoped supabase client, so RLS decides visibility. The
 * headline numbers come from the security-definer RPC `lit_pipeline_summary()`
 * (org-scoped internally via auth.uid()); the "recent wins" list + all-time
 * won total are a small extra query joining `lit_deals` → saved company name,
 * mirroring the join in crm.ts `listDeals()`.
 */

import { supabase } from "@/lib/supabase";
import { resolveActiveOrgId } from "@/api/crm";
import { loadPipelineSummary, type PipelineSummary } from "@/api/crmReports";

export type StageSlice = {
  stage: string;
  openCount: number;
  openValue: number;
  isWon: boolean;
  isLost: boolean;
};

export type RecentWin = {
  id: string;
  title: string;
  companyName: string | null;
  value: number;
  closedAt: string | null;
};

export type DashboardCrm = {
  hasData: boolean;
  // KPI chips
  openDealCount: number;
  wonMtdValue: number;
  wonAllTimeValue: number;
  // Pipeline & Revenue card headline
  openValue: number;
  weightedForecast: number;
  // by-stage mini funnel (open stages only, in board order)
  stages: StageSlice[];
  // needs-attention strip
  staleCount: number;
  overdueTaskCount: number;
  // recent wins
  recentWins: RecentWin[];
};

const EMPTY: DashboardCrm = {
  hasData: false,
  openDealCount: 0,
  wonMtdValue: 0,
  wonAllTimeValue: 0,
  openValue: 0,
  weightedForecast: 0,
  stages: [],
  staleCount: 0,
  overdueTaskCount: 0,
  recentWins: [],
};

/**
 * All-time won $ + the last few won deals with a company name. Kept small and
 * separate from the RPC (which is MTD-only and carries no company names).
 * Returns { wonAllTimeValue, recentWins }.
 */
async function loadWins(
  orgId: string,
  limit = 4,
  ownerUserId?: string | null,
): Promise<{ wonAllTimeValue: number; recentWins: RecentWin[] }> {
  let wonQ = supabase
    .from("lit_deals")
    .select("id, title, value_amount, closed_at, saved_company_id")
    .eq("org_id", orgId)
    .eq("status", "won");
  if (ownerUserId) wonQ = wonQ.eq("owner_user_id", ownerUserId);
  const { data: won, error } = await wonQ.order("closed_at", {
    ascending: false,
    nullsFirst: false,
  });

  if (error || !won?.length) return { wonAllTimeValue: 0, recentWins: [] };

  const wonAllTimeValue = (won as any[]).reduce(
    (sum, d) => sum + (Number(d.value_amount) || 0),
    0,
  );

  const top = (won as any[]).slice(0, limit);
  const savedIds = Array.from(
    new Set(top.map((d) => d.saved_company_id).filter(Boolean)),
  );

  const nameById: Record<string, string> = {};
  if (savedIds.length) {
    const { data } = await supabase
      .from("lit_saved_companies")
      .select("id, lit_companies(name)")
      .in("id", savedIds);
    for (const r of (data as any[]) ?? []) {
      nameById[r.id] = r.lit_companies?.name ?? "Company";
    }
  }

  const recentWins: RecentWin[] = top.map((d) => ({
    id: d.id,
    title: d.title ?? "Deal",
    companyName: d.saved_company_id ? nameById[d.saved_company_id] ?? null : null,
    value: Number(d.value_amount) || 0,
    closedAt: d.closed_at ?? null,
  }));

  return { wonAllTimeValue, recentWins };
}

/**
 * One call for the whole dashboard CRM surface. Combines the org-scoped
 * summary RPC with the wins query. Never throws — returns the empty shape on
 * any failure so the dashboard degrades gracefully to the empty state.
 */
export async function loadDashboardCrm(
  ownerUserId?: string | null,
): Promise<DashboardCrm> {
  try {
    const orgId = await resolveActiveOrgId();
    if (!orgId) return EMPTY;

    // ownerUserId = owner/admin "view as [member]" filter. Forwarded to the
    // summary RPC (ignored for members) and applied to the wins query below so
    // the Pipeline & Revenue card matches the filtered board.
    const [summary, wins] = await Promise.all([
      loadPipelineSummary(ownerUserId).catch(() => null),
      loadWins(orgId, 4, ownerUserId).catch(() => ({ wonAllTimeValue: 0, recentWins: [] })),
    ]);

    const s: PipelineSummary | null = summary && summary.ok ? summary : null;

    const stages: StageSlice[] = (s?.stage_breakdown ?? [])
      .filter((b) => !b.is_won && !b.is_lost)
      .map((b) => ({
        stage: b.stage,
        openCount: Number(b.open_count) || 0,
        openValue: Number(b.open_value) || 0,
        isWon: b.is_won,
        isLost: b.is_lost,
      }));

    const openDealCount = Number(s?.open_deal_count) || 0;
    const openValue = Number(s?.open_value) || 0;
    const weightedForecast = Number(s?.weighted_forecast) || 0;
    const wonMtdValue = Number(s?.won_mtd_value) || 0;
    const staleCount = Number(s?.stuck_count) || 0;
    const overdueTaskCount = Array.isArray(s?.overdue_tasks)
      ? s!.overdue_tasks.length
      : 0;

    const hasData =
      openDealCount > 0 ||
      wins.recentWins.length > 0 ||
      wins.wonAllTimeValue > 0 ||
      stages.some((st) => st.openCount > 0);

    return {
      hasData,
      openDealCount,
      wonMtdValue,
      wonAllTimeValue: wins.wonAllTimeValue,
      openValue,
      weightedForecast,
      stages,
      staleCount,
      overdueTaskCount,
      recentWins: wins.recentWins,
    };
  } catch {
    return EMPTY;
  }
}
