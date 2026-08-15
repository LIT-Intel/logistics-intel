/**
 * CRM Phase 2 — reporting / forecasting API.
 *
 * Two surfaces:
 *   1. loadPipelineReport() — the Reports view. Reads deals + stages + owner
 *      names through the SAME user-scoped supabase client as crm.ts, so RLS
 *      (migration 20260814120000) scopes everything to the caller's active
 *      org — workspace-wide, no cross-org leakage. All aggregation is done
 *      client-side over the org's own rows.
 *   2. loadPipelineSummary() — a thin typed wrapper over the security-definer
 *      RPC `lit_pipeline_summary()` (migration 20260814140000). The RPC is
 *      org-scoped internally (resolves the caller's active org from auth.uid()),
 *      so the frontend just calls it and renders the JSON. Used by the Pulse
 *      Coach pipeline prompt chips.
 *
 * Forecast math (the ONLY modeled numbers — everything else is a real sum):
 *   weighted_forecast = Σ over OPEN deals of (value_amount × stage.win_probability / 100)
 * Stage probabilities are real, admin-tunable column values on lit_deal_stages
 * (seeded New 10 / Qualified 25 / Quoted 50 / Negotiation 75 / Won 100 / Lost 0).
 */

import { supabase } from "@/lib/supabase";
import {
  resolveActiveOrgId,
  loadMemberNames,
  DEAL_SERVICE_TYPE_LABELS,
  type Deal,
  type DealServiceType,
  type DealStage,
} from "@/api/crm";

const DAY_MS = 86_400_000;

// ── Reports view aggregate shapes ───────────────────────────────────────
export type StageBucket = {
  stageId: string;
  name: string;
  color: string;
  position: number;
  winProbability: number;
  isWon: boolean;
  isLost: boolean;
  openCount: number;
  openValue: number;
  weighted: number;
};

export type WeeklyPoint = {
  weekStart: string; // ISO date (Monday)
  label: string;     // e.g. "Aug 4"
  created: number;
  won: number;
};

export type ServiceTypeRow = {
  serviceType: DealServiceType | "unspecified";
  label: string;
  openCount: number;
  openValue: number;
  wonCount: number;
  wonValue: number;
  totalCount: number; // all statuses — for the "pipeline by service type" mix
};

export type OwnerRow = {
  ownerId: string;
  name: string;
  openCount: number;
  openValue: number;
  wonCount: number;
  wonValue: number;
};

export type PipelineReport = {
  // KPI chips
  openValue: number;
  weightedForecast: number;
  openDealCount: number;
  wonThisMonthCount: number;
  wonThisMonthValue: number;
  winRate: number | null;       // won / (won+lost) over the window, 0..1
  winRateSampleSize: number;    // won+lost count in window
  avgDaysInStage: number | null;    // avg age of open deals (days since last stage move / creation)
  velocityDaysToClose: number | null; // avg days created→closed for deals closed in window
  // Charts
  stageBuckets: StageBucket[];
  weekly: WeeklyPoint[];        // last 8 weeks: created vs won
  winLoss: { won: number; lost: number };
  owners: OwnerRow[];
  serviceTypes: ServiceTypeRow[]; // "pipeline by service type" breakdown
  waterfall: { created: number; advanced: number; won: number; lost: number };
  hasData: boolean;
};

function mondayOf(d: Date): Date {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dow = (x.getUTCDay() + 6) % 7; // 0 = Monday
  x.setUTCDate(x.getUTCDate() - dow);
  return x;
}

function weekLabel(d: Date): string {
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
}

/**
 * Build the full Reports payload from the org's deals + stages + deal
 * activity. Window for rate/velocity metrics defaults to the last 90 days.
 */
export async function loadPipelineReport(
  windowDays = 90,
  ownerUserId?: string | null,
  serviceType?: DealServiceType | null,
): Promise<PipelineReport> {
  const empty: PipelineReport = {
    openValue: 0, weightedForecast: 0, openDealCount: 0,
    wonThisMonthCount: 0, wonThisMonthValue: 0,
    winRate: null, winRateSampleSize: 0,
    avgDaysInStage: null, velocityDaysToClose: null,
    stageBuckets: [], weekly: [], winLoss: { won: 0, lost: 0 }, owners: [],
    serviceTypes: [],
    waterfall: { created: 0, advanced: 0, won: 0, lost: 0 }, hasData: false,
  };

  const orgId = await resolveActiveOrgId();
  if (!orgId) return empty;

  // Optional "view as [member]" filter for owner/admin. RLS already scopes the
  // deal read (member: own rows; owner/admin: whole org), so ownerUserId only
  // narrows an owner/admin's report to one member (no-op for a member).
  const dealsQuery = supabase.from("lit_deals").select("*").eq("org_id", orgId);
  const [{ data: stagesRaw }, { data: dealsRaw }] = await Promise.all([
    supabase.from("lit_deal_stages").select("*").eq("org_id", orgId).order("position", { ascending: true }),
    ownerUserId ? dealsQuery.eq("owner_user_id", ownerUserId) : dealsQuery,
  ]);

  const stages = (stagesRaw ?? []) as DealStage[];
  const allDeals = (dealsRaw ?? []) as Deal[];
  if (!stages.length && !allDeals.length) return { ...empty };

  // ── "Pipeline by service type" breakdown ──────────────────────────────
  // Computed over the FULL (owner-scoped) deal set BEFORE any service-type
  // narrowing, so the breakdown always shows the whole mix even while a
  // single-type filter is active on the rest of the report.
  const svcMap = new Map<string, ServiceTypeRow>();
  const svcRow = (key: DealServiceType | "unspecified"): ServiceTypeRow => {
    let r = svcMap.get(key);
    if (!r) {
      r = {
        serviceType: key,
        label: key === "unspecified" ? "Unspecified" : DEAL_SERVICE_TYPE_LABELS[key],
        openCount: 0, openValue: 0, wonCount: 0, wonValue: 0, totalCount: 0,
      };
      svcMap.set(key, r);
    }
    return r;
  };
  for (const d of allDeals) {
    const key = (d.service_type ?? "unspecified") as DealServiceType | "unspecified";
    const row = svcRow(key);
    const v = Number(d.value_amount) || 0;
    row.totalCount += 1;
    if (d.status === "open") { row.openCount += 1; row.openValue += v; }
    else if (d.status === "won") { row.wonCount += 1; row.wonValue += v; }
  }
  const serviceTypes = Array.from(svcMap.values()).sort(
    (a, b) => b.openValue + b.wonValue - (a.openValue + a.wonValue) || b.totalCount - a.totalCount,
  );

  // Optional service-type narrowing for every other aggregate on the report.
  const deals = serviceType
    ? allDeals.filter((d) => (d.service_type ?? null) === serviceType)
    : allDeals;

  const stageById = new Map<string, DealStage>();
  for (const s of stages) stageById.set(s.id, s);

  const now = Date.now();
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();
  const windowStart = now - windowDays * DAY_MS;

  // ── Stage buckets + open value + weighted forecast ────────────────────
  const buckets: StageBucket[] = stages.map((s) => ({
    stageId: s.id, name: s.name, color: s.color, position: s.position,
    winProbability: Number((s as any).win_probability ?? 0),
    isWon: s.is_won, isLost: s.is_lost,
    openCount: 0, openValue: 0, weighted: 0,
  }));
  const bucketById = new Map(buckets.map((b) => [b.stageId, b]));

  let openValue = 0, weightedForecast = 0, openDealCount = 0;
  let wonThisMonthCount = 0, wonThisMonthValue = 0;
  let winWindow = 0, lossWindow = 0;
  const winLoss = { won: 0, lost: 0 };
  const owners = new Map<string, OwnerRow>();
  const ownerRow = (id: string): OwnerRow => {
    let r = owners.get(id);
    if (!r) { r = { ownerId: id, name: id, openCount: 0, openValue: 0, wonCount: 0, wonValue: 0 }; owners.set(id, r); }
    return r;
  };

  // Weekly buckets — last 8 weeks (Mondays).
  const weekKeys: string[] = [];
  const weekMap = new Map<string, WeeklyPoint>();
  {
    const firstMonday = mondayOf(new Date(now - 7 * 7 * DAY_MS));
    for (let i = 0; i < 8; i++) {
      const d = new Date(firstMonday.getTime() + i * 7 * DAY_MS);
      const key = d.toISOString().slice(0, 10);
      weekKeys.push(key);
      weekMap.set(key, { weekStart: key, label: weekLabel(d), created: 0, won: 0 });
    }
  }
  const bumpWeek = (ts: number, field: "created" | "won") => {
    const wk = mondayOf(new Date(ts)).toISOString().slice(0, 10);
    const pt = weekMap.get(wk);
    if (pt) pt[field] += 1;
  };

  let ageSum = 0, ageCount = 0;         // avg days-in-stage (open deals)
  let velSum = 0, velCount = 0;         // avg created→closed (closed in window)

  for (const d of deals) {
    const stage = stageById.get(d.stage_id);
    const value = Number(d.value_amount) || 0;
    const owner = ownerRow(d.owner_user_id);
    const createdTs = d.created_at ? new Date(d.created_at).getTime() : NaN;
    const closedTs = d.closed_at ? new Date(d.closed_at).getTime() : NaN;

    if (!Number.isNaN(createdTs)) bumpWeek(createdTs, "created");

    if (d.status === "open") {
      openDealCount += 1;
      openValue += value;
      owner.openCount += 1;
      owner.openValue += value;
      const b = bucketById.get(d.stage_id);
      if (b) {
        b.openCount += 1;
        b.openValue += value;
        b.weighted += value * (b.winProbability / 100);
        weightedForecast += value * (b.winProbability / 100);
      }
      // days-in-stage proxy: age since last update (stage move stamps updated_at)
      const updTs = d.updated_at ? new Date(d.updated_at).getTime() : createdTs;
      if (!Number.isNaN(updTs)) { ageSum += Math.max(0, (now - updTs) / DAY_MS); ageCount += 1; }
    } else if (d.status === "won") {
      winLoss.won += 1;
      owner.wonCount += 1;
      owner.wonValue += value;
      if (!Number.isNaN(closedTs)) {
        bumpWeek(closedTs, "won");
        if (closedTs >= monthStart) { wonThisMonthCount += 1; wonThisMonthValue += value; }
        if (closedTs >= windowStart) {
          winWindow += 1;
          if (!Number.isNaN(createdTs)) { velSum += Math.max(0, (closedTs - createdTs) / DAY_MS); velCount += 1; }
        }
      }
    } else if (d.status === "lost") {
      winLoss.lost += 1;
      if (!Number.isNaN(closedTs) && closedTs >= windowStart) lossWindow += 1;
    }
    void stage;
  }

  // ── Waterfall: created → advanced (past New) → won / lost over window ──
  // "advanced" = deals with at least one stage_change activity in-window.
  let createdInWindow = 0, advancedInWindow = 0;
  for (const d of deals) {
    const createdTs = d.created_at ? new Date(d.created_at).getTime() : NaN;
    if (!Number.isNaN(createdTs) && createdTs >= windowStart) createdInWindow += 1;
  }
  try {
    let actQ = supabase
      .from("lit_deal_activity")
      .select("deal_id, kind, created_at")
      .eq("org_id", orgId)
      .eq("kind", "stage_change")
      .gte("created_at", new Date(windowStart).toISOString());
    // When viewing as a single member, scope the "advanced" set to that
    // member's deals so the waterfall matches the filtered board.
    if (ownerUserId) {
      const ids = deals.map((d) => d.id).filter(Boolean);
      if (ids.length) actQ = actQ.in("deal_id", ids);
      else actQ = actQ.in("deal_id", ["00000000-0000-0000-0000-000000000000"]);
    }
    const { data: acts } = await actQ;
    const advancedDeals = new Set<string>();
    for (const a of (acts ?? []) as Array<{ deal_id: string }>) advancedDeals.add(a.deal_id);
    advancedInWindow = advancedDeals.size;
  } catch {
    /* waterfall's advanced count is best-effort */
  }

  // ── Owner names ───────────────────────────────────────────────────────
  const names = await loadMemberNames(Array.from(owners.keys()));
  for (const r of owners.values()) r.name = names[r.ownerId] ?? "Teammate";

  const winRateSampleSize = winWindow + lossWindow;
  const winRate = winRateSampleSize > 0 ? winWindow / winRateSampleSize : null;

  const ownerRows = Array.from(owners.values())
    .filter((o) => o.openCount > 0 || o.wonCount > 0)
    .sort((a, b) => b.openValue + b.wonValue - (a.openValue + a.wonValue));

  return {
    openValue,
    weightedForecast,
    openDealCount,
    wonThisMonthCount,
    wonThisMonthValue,
    winRate,
    winRateSampleSize,
    avgDaysInStage: ageCount > 0 ? ageSum / ageCount : null,
    velocityDaysToClose: velCount > 0 ? velSum / velCount : null,
    stageBuckets: buckets,
    weekly: weekKeys.map((k) => weekMap.get(k)!),
    winLoss,
    owners: ownerRows,
    serviceTypes,
    waterfall: { created: createdInWindow, advanced: advancedInWindow, won: winLoss.won, lost: winLoss.lost },
    // hasData reflects the FULL owner-scoped set (pre service-type narrowing)
    // so the Reports view — with its service-type filter + breakdown — still
    // renders when a filter narrows the other aggregates to zero.
    hasData: allDeals.length > 0,
  };
}

// ── Ask-LIT pipeline summary (RPC wrapper) ──────────────────────────────
export type PipelineSummary = {
  ok: boolean;
  reason?: string;
  generated_at?: string;
  open_deal_count?: number;
  open_value?: number;
  weighted_forecast?: number;
  won_mtd_count?: number;
  won_mtd_value?: number;
  stage_breakdown?: Array<{
    stage: string; open_count: number; open_value: number;
    win_probability: number; is_won: boolean; is_lost: boolean;
  }>;
  stuck_deals?: Array<{ id: string; title: string; value: number | null; stage: string; last_touch: string; days_stale: number }>;
  stuck_count?: number;
  overdue_tasks?: Array<{ id: string; title: string; due_date: string | null }>;
  // Close-date alerts (migration 20260814240500). Both are open-deal lists
  // scoped by the RPC's existing owner-scoping. `days` = days until close
  // (negative = overdue by N). closing_soon = within the next 3 days.
  closing_soon?: CloseAlertDeal[];
  closing_soon_count?: number;
  overdue?: CloseAlertDeal[];
  overdue_count?: number;
};

export type CloseAlertDeal = {
  id: string;
  title: string;
  value: number | null;
  expected_close_date: string | null;
  stage: string;
  owner: string | null;
  days: number;
};

/**
 * Calls the org-scoped security-definer RPC. Returns null on transport error.
 * `ownerUserId` is the owner/admin "view as [member]" filter — passed as
 * `p_owner_user_id`. The RPC IGNORES it for regular members (they always see
 * only their own pipeline) and honours it for owner/admin; NULL = whole org.
 */
export async function loadPipelineSummary(
  ownerUserId?: string | null,
): Promise<PipelineSummary | null> {
  const { data, error } = await supabase.rpc("lit_pipeline_summary", {
    p_owner_user_id: ownerUserId ?? null,
  });
  if (error) return null;
  return (data ?? null) as PipelineSummary | null;
}
