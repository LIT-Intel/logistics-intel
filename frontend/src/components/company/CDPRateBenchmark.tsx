/**
 * Phase 4 v3 — Rate Benchmark tab.
 *
 * Premium layout designed for both the Company Profile tab and the
 * marketing-site widget page. Side-by-side trend chart + globe with
 * YTD context cards, multi-lane comparison overlay, and a polished
 * FBX12 reference table.
 *
 * Data:
 *   - lit_freight_rate_benchmarks (seeded YTD 2026 weekly history,
 *     refreshed weekly by the freight-rate-fetcher edge function).
 *   - Lane matched to company's top_route_12m via the comprehensive
 *     region-keyword matcher (handles Atlanta / inland US / generic
 *     "United States" via origin-tiebreak).
 *
 * Source attribution intentionally avoids vendor names — only "FBX12
 * Index" / "FBX reference" appears in copy. Lane codes (FBX01–FBX12)
 * stay as the canonical identifiers.
 */

import { useEffect, useMemo, useState } from "react";
import {
  Anchor,
  Globe2,
  Info,
  RefreshCw,
  Ship,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Minus,
} from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
  Legend,
} from "recharts";
import GlobeCanvas, { type GlobeLane } from "@/components/GlobeCanvas";
import { supabase } from "@/lib/supabase";
import {
  loadLatestBenchmarks,
  matchLaneForRoute,
  matchAllRoutesForCompany,
  computeMarketRateSpend,
  FBX_LANE_COORDS,
  type FreightLane,
  type MatchedLane,
  type TopRouteMatch,
} from "@/lib/freightRateBenchmark";

type Props = {
  companyName: string;
  topRoute: string | null;
  topRoutes?: any[];
  teu12m: number | null;
  fcl12m: number | null;
  lcl12m: number | null;
  ships12m: number | null;
  importyetiReportedSpend?: number | null;
};

type HistoryRow = {
  lane_code: string;
  as_of_date: string;
  rate_usd_per_40ft: number;
  rate_usd_per_teu: number;
};

const COMPARISON_COLORS: Record<string, string> = {
  primary: "#2563EB",
  alt1: "#F59E0B",
  alt2: "#10B981",
};

function fmtUsd(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(Number(n))) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(Number(n));
}

function fmtUsdShort(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(Number(n))) return "—";
  const v = Number(n);
  if (Math.abs(v) >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 1_000) return `$${(v / 1_000).toFixed(1)}K`;
  return fmtUsd(v);
}

function fmtNum(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(Number(n))) return "—";
  return Number(n).toLocaleString("en-US");
}

function fmtPct(n: number | null | undefined, withSign = false): string {
  if (n == null || !Number.isFinite(Number(n))) return "—";
  const v = Number(n);
  const s = `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;
  return withSign ? s : s.replace("+", "");
}

function fmtDateShort(s: string | null | undefined): string {
  if (!s) return "—";
  try {
    return new Date(s).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  } catch {
    return s;
  }
}

function fmtDateFull(s: string | null | undefined): string {
  if (!s) return "—";
  try {
    return new Date(s).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return s;
  }
}

function ratioToCoords(coords: [number, number]): [number, number] {
  return coords;
}

export default function CDPRateBenchmark({
  companyName,
  topRoute,
  topRoutes,
  teu12m,
  fcl12m,
  lcl12m,
  ships12m,
  importyetiReportedSpend,
}: Props) {
  const [lanes, setLanes] = useState<FreightLane[]>([]);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [primaryLane, setPrimaryLane] = useState<string | null>(null);
  const [comparisonLanes, setComparisonLanes] = useState<string[]>([]);

  // Initial load — current rates + full historical series for all lanes.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErr(null);
    (async () => {
      try {
        const [latest, hist] = await Promise.all([
          loadLatestBenchmarks(),
          supabase
            .from("lit_freight_rate_benchmarks")
            .select("lane_code, as_of_date, rate_usd_per_40ft, rate_usd_per_teu")
            .order("as_of_date", { ascending: true })
            .limit(2000),
        ]);
        if (cancelled) return;
        setLanes(latest);
        if (hist.error) {
          console.warn("[rate-benchmark] history load failed", hist.error);
          setHistory([]);
        } else {
          setHistory((hist.data ?? []) as HistoryRow[]);
        }
      } catch (e: any) {
        if (!cancelled) setErr(e?.message || "Failed to load reference rates");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Match the company's lane.
  const matched: MatchedLane | null = useMemo(
    () => (lanes.length ? matchLaneForRoute(topRoute, lanes) : null),
    [lanes, topRoute],
  );

  // Match every top-route the company has (from Supply Chain). Used by
  // the "Your Trade Lanes" section to show per-lane rate + spend, and
  // to compute the rolled-up market spend across all real lanes — not
  // just the single matched representative.
  const allRouteMatches: TopRouteMatch[] = useMemo(
    () => matchAllRoutesForCompany(topRoutes ?? null, lanes),
    [topRoutes, lanes],
  );

  const totalMarketSpendByLanes = useMemo(
    () => allRouteMatches.reduce((s, m) => s + (m.marketSpend || 0), 0),
    [allRouteMatches],
  );

  // Coverage gate — same idea as V2's marketSpendBreakdown. When per-route
  // TEU sums to less than 70% of company total TEU, the snapshot's
  // top_routes is too sparse to project total spend from (Old Navy: top
  // 10 routes = 0.05% of total TEU). In that case, the hero falls back to
  // the single-lane calc (spend.totalSpend) which uses the full company
  // TEU × matched primary lane rate.
  const perRouteTeuSum = useMemo(
    () => allRouteMatches.reduce((s, m) => s + (Number(m.ourTeu) || 0), 0),
    [allRouteMatches],
  );
  const teuCoverageOk = useMemo(() => {
    const total = Number(teu12m) || 0;
    if (total <= 0) return true; // no reference total — trust per-route
    return perRouteTeuSum >= total * 0.7;
  }, [perRouteTeuSum, teu12m]);

  // Auto-select matched lane on load.
  useEffect(() => {
    if (matched && matched.lane.lane_code !== "AVG" && !primaryLane) {
      setPrimaryLane(matched.lane.lane_code);
    } else if (!primaryLane && lanes.length > 0) {
      setPrimaryLane(lanes[0].lane_code);
    }
  }, [matched, lanes, primaryLane]);

  // Build chart data — combine primary + comparison lanes into a single
  // dataset keyed by date, with one column per lane.
  const chartData = useMemo(() => {
    const selected = [primaryLane, ...comparisonLanes].filter(Boolean) as string[];
    if (selected.length === 0) return [];
    const byDate = new Map<string, Record<string, any>>();
    for (const row of history) {
      if (!selected.includes(row.lane_code)) continue;
      const existing = byDate.get(row.as_of_date) ?? { date: row.as_of_date };
      existing[row.lane_code] = Number(row.rate_usd_per_teu) || 0;
      byDate.set(row.as_of_date, existing);
    }
    return Array.from(byDate.values()).sort((a, b) =>
      String(a.date).localeCompare(String(b.date)),
    );
  }, [history, primaryLane, comparisonLanes]);

  // YTD stats for primary lane.
  const primaryStats = useMemo(() => {
    if (!primaryLane) return null;
    const rows = history
      .filter((r) => r.lane_code === primaryLane)
      .sort((a, b) => a.as_of_date.localeCompare(b.as_of_date));
    if (rows.length === 0) return null;
    const rates = rows.map((r) => Number(r.rate_usd_per_40ft) || 0);
    const teuRates = rows.map((r) => Number(r.rate_usd_per_teu) || 0);
    const high = Math.max(...rates);
    const low = Math.min(...rates);
    const avg = rates.reduce((s, v) => s + v, 0) / rates.length;
    const teuAvg = teuRates.reduce((s, v) => s + v, 0) / teuRates.length;
    const first = rates[0];
    const last = rates[rates.length - 1];
    const ytdPct = first > 0 ? ((last - first) / first) * 100 : 0;
    const lastFour = rates.slice(-4);
    const fourWeekAvg = lastFour.reduce((s, v) => s + v, 0) / Math.max(1, lastFour.length);
    const vsAvg = avg > 0 ? ((last - avg) / avg) * 100 : 0;
    const vsFourWeek = fourWeekAvg > 0 ? ((last - fourWeekAvg) / fourWeekAvg) * 100 : 0;
    return {
      high,
      low,
      avg: Math.round(avg),
      teuAvg: Math.round(teuAvg),
      first,
      last,
      ytdPct,
      vsAvg,
      vsFourWeek,
      laneCode: primaryLane,
    };
  }, [history, primaryLane]);

  // Spend calculation with LCL-bounded math: lclTeu = min(lclShips × 1,
  // teu × 0.15), fclTeu = residual, fclSpend = fclTeu × lane $/TEU. This
  // handles non-2-TEU containers correctly (45ft, 53ft, multi-container
  // BOLs). EAE Usa was the canonical bug case — avg 7.31 TEU/shipment
  // would have falsely attributed ~1400 TEU to LCL with the old algo.
  const spend = useMemo(
    () =>
      computeMarketRateSpend(
        teu12m,
        fcl12m,
        ships12m,
        matched,
        lcl12m, // LCL shipment count drives the bounded LCL TEU cap
      ),
    [teu12m, fcl12m, lcl12m, ships12m, matched],
  );

  // Globe lanes — all 12 lanes as great-circle arcs.
  const globeLanes: GlobeLane[] = useMemo(() => {
    return lanes
      .filter((l) => FBX_LANE_COORDS[l.lane_code])
      .map((l) => {
        const c = FBX_LANE_COORDS[l.lane_code];
        return {
          id: l.lane_code,
          from: c.fromLabel,
          to: c.toLabel,
          coords: [
            ratioToCoords(c.fromCoords),
            ratioToCoords(c.toCoords),
          ] as [[number, number], [number, number]],
          shipments: l.rate_usd_per_40ft,
          teu: `${fmtUsd(Math.round(l.rate_usd_per_teu))}/TEU`,
        } as GlobeLane;
      });
  }, [lanes]);

  const asOf = matched?.lane.as_of_date ?? lanes[0]?.as_of_date ?? null;

  const toggleComparison = (laneCode: string) => {
    setComparisonLanes((prev) =>
      prev.includes(laneCode)
        ? prev.filter((c) => c !== laneCode)
        : prev.length >= 2
          ? [prev[1], laneCode]
          : [...prev, laneCode],
    );
  };

  return (
    <div className="space-y-4">
      {/* Top row: spend headline + matched lane summary */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Market-rate estimate (2 cols) */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 lg:col-span-2">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="h-4 w-4 text-blue-600" />
            <div className="text-[13px] font-bold text-[#0F172A]">
              Market-Rate Estimate (12M)
            </div>
            {matched ? (
              <span className="ml-auto inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                <Anchor className="h-3 w-3" />
                {matched.lane.lane_code} · {matched.confidence} match
              </span>
            ) : null}
          </div>

          {loading ? (
            <div className="text-[12px] text-slate-500">Loading reference rates…</div>
          ) : err ? (
            <div className="text-[12px] text-rose-700">{err}</div>
          ) : allRouteMatches.length === 0 && !spend ? (
            <div className="text-[12px] text-slate-500">
              Not enough trade data to compute a market-rate estimate yet.
            </div>
          ) : (
            <>
              {/* Hero priority:
                  1. Per-route lane sum — only if coverage ≥70% of total TEU
                     (catch-all importers like Old Navy fail this gate; the
                     top 10 routes captured 0.05% of their actual volume).
                  2. Single-lane spend.totalSpend = total TEU × primary lane
                     rate — uses the full company TEU even when per-route is
                     sparse.
                  3. Null when neither has data. */}
              <div className="text-[28px] font-bold text-[#0F172A] leading-tight">
                {fmtUsd(
                  allRouteMatches.length > 0 && teuCoverageOk
                    ? totalMarketSpendByLanes
                    : spend?.totalSpend ?? null,
                )}
              </div>
              {allRouteMatches.length > 0 && teuCoverageOk ? (
                <div className="text-[10px] uppercase tracking-wide text-blue-600 font-semibold mt-0.5">
                  Sum of {allRouteMatches.length} matched lane{allRouteMatches.length === 1 ? "" : "s"}
                </div>
              ) : allRouteMatches.length > 0 && !teuCoverageOk ? (
                <div className="text-[10px] uppercase tracking-wide text-amber-700 font-semibold mt-0.5">
                  TEU-based · top routes captured {Math.round((perRouteTeuSum / Math.max(1, Number(teu12m) || 1)) * 100)}% of total volume
                </div>
              ) : null}
              <div className="text-[11px] text-slate-500">
                {fmtNum(ships12m)} shipments · {fmtNum(teu12m)} TEU · trailing 12 months
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">
                    FCL · {fmtNum(spend.fclContainers)} containers
                  </div>
                  <div className="text-[13px] font-bold text-[#0F172A] mt-0.5">
                    {fmtUsd(spend.fclSpend)}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    {fmtNum(spend.fclTeu)} TEU @ {fmtUsd(spend.laneRatePer40ft)}/40ft
                  </div>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">
                    LCL
                  </div>
                  <div className="text-[13px] font-bold text-[#0F172A] mt-0.5">
                    {fmtUsd(spend.lclSpend)}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    {fmtNum(spend.lclTeu)} TEU @ {fmtUsd(spend.lclRatePerTeu)}/TEU
                  </div>
                </div>
              </div>

              {importyetiReportedSpend != null && Number(importyetiReportedSpend) > 0 ? (
                <div className="mt-4 flex items-start gap-2 rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
                  <Info className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                  <div>
                    Importer-reported on file:{" "}
                    <strong>{fmtUsd(importyetiReportedSpend)}</strong>. That number
                    typically reflects observed customs/freight charges only —
                    a fraction of full ocean-freight contract value. Market rate
                    above uses the matched FBX{matched ? matched.lane.lane_code.replace(/\D/g, "") : "12"} reference plus an LCL benchmark.
                  </div>
                </div>
              ) : null}
            </>
          )}
        </div>

        {/* Matched lane card (1 col) */}
        <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-slate-900 to-slate-800 text-white p-5">
          <div className="flex items-center gap-2 mb-3">
            <Ship className="h-4 w-4 text-cyan-300" />
            <div className="text-[12px] font-bold uppercase tracking-wide text-cyan-300">
              Matched Lane
            </div>
            {asOf ? (
              <span className="ml-auto text-[10px] text-slate-400">
                {fmtDateFull(asOf)}
              </span>
            ) : null}
          </div>
          <div className="text-[16px] font-bold leading-tight">
            {matched?.lane.lane_label ?? "—"}
          </div>
          {matched?.lane.lane_code !== "AVG" && matched ? (
            <div className="text-[11px] text-slate-300 mt-1">
              Top route: {topRoute || "—"}
            </div>
          ) : null}
          <div className="mt-4 grid grid-cols-2 gap-2">
            <div>
              <div className="text-[9px] uppercase tracking-wide text-slate-400 font-semibold">
                40' container
              </div>
              <div className="text-[18px] font-bold text-white tabular-nums mt-0.5">
                {fmtUsd(matched?.lane.rate_usd_per_40ft ?? null)}
              </div>
            </div>
            <div>
              <div className="text-[9px] uppercase tracking-wide text-slate-400 font-semibold">
                Per TEU
              </div>
              <div className="text-[18px] font-bold text-white tabular-nums mt-0.5">
                {fmtUsd(matched?.lane.rate_usd_per_teu ?? null)}
              </div>
            </div>
          </div>
          {primaryStats ? (
            <div className="mt-3 grid grid-cols-3 gap-2 border-t border-white/10 pt-3">
              <div>
                <div className="text-[9px] uppercase tracking-wide text-slate-400 font-semibold">
                  YTD Low
                </div>
                <div className="text-[12px] font-bold text-emerald-300 tabular-nums">
                  {fmtUsdShort(primaryStats.low)}
                </div>
              </div>
              <div>
                <div className="text-[9px] uppercase tracking-wide text-slate-400 font-semibold">
                  YTD Avg
                </div>
                <div className="text-[12px] font-bold text-white tabular-nums">
                  {fmtUsdShort(primaryStats.avg)}
                </div>
              </div>
              <div>
                <div className="text-[9px] uppercase tracking-wide text-slate-400 font-semibold">
                  YTD High
                </div>
                <div className="text-[12px] font-bold text-rose-300 tabular-nums">
                  {fmtUsdShort(primaryStats.high)}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {/* YTD context strip */}
      {primaryStats ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard
            label="YTD Movement"
            value={fmtPct(primaryStats.ytdPct, true)}
            tone={
              primaryStats.ytdPct >= 1
                ? "up"
                : primaryStats.ytdPct <= -1
                  ? "down"
                  : "flat"
            }
            sub={`${fmtUsdShort(primaryStats.first)} → ${fmtUsdShort(primaryStats.last)}`}
          />
          <StatCard
            label="vs YTD Average"
            value={fmtPct(primaryStats.vsAvg, true)}
            tone={
              primaryStats.vsAvg >= 1
                ? "up"
                : primaryStats.vsAvg <= -1
                  ? "down"
                  : "flat"
            }
            sub={`Avg ${fmtUsdShort(primaryStats.avg)}`}
          />
          <StatCard
            label="4-Week Trend"
            value={fmtPct(primaryStats.vsFourWeek, true)}
            tone={
              primaryStats.vsFourWeek >= 1
                ? "up"
                : primaryStats.vsFourWeek <= -1
                  ? "down"
                  : "flat"
            }
            sub="Last 4 weeks vs current"
          />
          <StatCard
            label="Volatility"
            value={`${(((primaryStats.high - primaryStats.low) / Math.max(1, primaryStats.avg)) * 100).toFixed(0)}%`}
            tone="flat"
            sub={`${fmtUsdShort(primaryStats.low)}–${fmtUsdShort(primaryStats.high)}`}
          />
        </div>
      ) : null}

      {/* Side-by-side: chart + globe */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Chart */}
        <div className="rounded-xl border border-slate-200 bg-white">
          <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3">
            <TrendingUp className="h-4 w-4 text-blue-600" />
            <div>
              <div className="text-[13px] font-bold text-[#0F172A]">
                Lane Rate Trend (YTD)
              </div>
              <div className="text-[11px] text-slate-500">
                Weekly $/TEU. Refreshed every Monday.
              </div>
            </div>
          </div>
          <div className="px-4 py-3">
            {/* Lane selector + comparison */}
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <select
                value={primaryLane ?? ""}
                onChange={(e) => setPrimaryLane(e.target.value || null)}
                className="text-[12px] border border-slate-200 rounded-md px-2 py-1 bg-white"
              >
                {lanes.map((l) => (
                  <option key={l.lane_code} value={l.lane_code}>
                    {l.lane_code} · {l.lane_label}
                  </option>
                ))}
              </select>
              <span className="text-[11px] text-slate-500">Compare with:</span>
              <div className="flex flex-wrap gap-1">
                {lanes
                  .filter((l) => l.lane_code !== primaryLane)
                  .slice(0, 6)
                  .map((l) => (
                    <button
                      key={l.lane_code}
                      onClick={() => toggleComparison(l.lane_code)}
                      className={`text-[10px] px-2 py-0.5 rounded-full font-semibold border transition-colors ${
                        comparisonLanes.includes(l.lane_code)
                          ? "border-blue-500 bg-blue-50 text-blue-700"
                          : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      {l.lane_code}
                    </button>
                  ))}
              </div>
            </div>

            <div className="h-[280px]">
              {chartData.length === 0 ? (
                <div className="h-full flex items-center justify-center text-[12px] text-slate-400">
                  {loading ? "Loading…" : "No data for the selected lane(s) yet."}
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                    <defs>
                      <linearGradient id="primary-glow" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={COMPARISON_COLORS.primary} stopOpacity={0.4} />
                        <stop offset="100%" stopColor={COMPARISON_COLORS.primary} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 10, fill: "#64748B" }}
                      axisLine={{ stroke: "#CBD5E1" }}
                      tickLine={false}
                      tickFormatter={(v) => fmtDateShort(v)}
                      minTickGap={20}
                    />
                    <YAxis
                      tick={{ fontSize: 10, fill: "#64748B" }}
                      axisLine={{ stroke: "#CBD5E1" }}
                      tickLine={false}
                      tickFormatter={(v) => `$${Math.round(Number(v) / 100) / 10}K`}
                      width={42}
                    />
                    <RechartsTooltip
                      formatter={(value: any, name: any) => [
                        `${fmtUsd(Math.round(Number(value)))}/TEU`,
                        name,
                      ]}
                      labelFormatter={(label: any) => fmtDateFull(label)}
                      contentStyle={{
                        borderRadius: 8,
                        border: "1px solid #E2E8F0",
                        fontSize: 12,
                      }}
                    />
                    <Legend
                      wrapperStyle={{ fontSize: 11, paddingTop: 4 }}
                      iconType="line"
                    />
                    {primaryLane ? (
                      <Line
                        type="monotone"
                        dataKey={primaryLane}
                        name={primaryLane}
                        stroke={COMPARISON_COLORS.primary}
                        strokeWidth={2.5}
                        dot={false}
                        activeDot={{ r: 5 }}
                      />
                    ) : null}
                    {comparisonLanes.map((c, idx) => (
                      <Line
                        key={c}
                        type="monotone"
                        dataKey={c}
                        name={c}
                        stroke={
                          idx === 0
                            ? COMPARISON_COLORS.alt1
                            : COMPARISON_COLORS.alt2
                        }
                        strokeWidth={2}
                        strokeDasharray="4 3"
                        dot={false}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </div>

        {/* Globe — same trade theme as Supply Chain. Tracks user's selected
            primaryLane (clicking a lane in the trade-lanes table or comparison
            row updates the globe focus) and shows country flag-pins at the
            arc endpoints, matching CDPSupplyChain's behavior exactly. */}
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3">
            <Globe2 className="h-4 w-4 text-blue-600" />
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-bold text-[#0F172A]">
                Global Lane Map
              </div>
              <div className="text-[11px] text-slate-500 truncate">
                {primaryLane
                  ? `${primaryLane} highlighted · click another lane to refocus`
                  : "12 reference lanes. Pick a lane to focus."}
              </div>
            </div>
          </div>
          <div className="flex items-center justify-center bg-slate-50 px-3 py-3">
            <GlobeCanvas
              lanes={globeLanes}
              selectedLane={primaryLane}
              size={260}
              theme="trade"
              showFlagPins
            />
          </div>
          {/* Selected-lane summary — reads from allRouteMatches when this is
              one of the company's lanes, else falls back to reference-only
              data so the panel is always populated. */}
          {(() => {
            if (!primaryLane) return null;
            const refLane = lanes.find((l) => l.lane_code === primaryLane);
            if (!refLane) return null;
            const ownMatch = allRouteMatches.find(
              (m) => m.matched?.lane.lane_code === primaryLane,
            );
            const totalMs = totalMarketSpendByLanes;
            const sharePct =
              ownMatch && totalMs > 0
                ? Math.round((ownMatch.marketSpend / totalMs) * 100)
                : null;
            return (
              <div className="border-t border-slate-100 px-4 py-3">
                <div className="text-[10px] uppercase tracking-wide font-semibold text-slate-500 mb-1.5">
                  Lane summary
                </div>
                <div className="text-[12.5px] font-bold text-[#0F172A] mb-0.5 truncate">
                  {refLane.lane_label}
                </div>
                <div className="text-[10.5px] text-slate-500 mb-3">
                  {refLane.lane_code} · current ${" "}
                  {fmtUsd(Math.round(refLane.rate_usd_per_teu))}/TEU ·{" "}
                  {fmtUsd(Math.round(refLane.rate_usd_per_40ft))}/40ft
                </div>
                {ownMatch ? (
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-md bg-slate-50 px-2.5 py-1.5">
                      <div className="text-[9.5px] uppercase tracking-wide font-semibold text-slate-500">
                        Your shipments
                      </div>
                      <div className="text-[12.5px] font-bold text-[#0F172A] tabular-nums">
                        {ownMatch.ourShipments.toLocaleString()}
                      </div>
                    </div>
                    <div className="rounded-md bg-slate-50 px-2.5 py-1.5">
                      <div className="text-[9.5px] uppercase tracking-wide font-semibold text-slate-500">
                        Your TEU
                      </div>
                      <div className="text-[12.5px] font-bold text-[#0F172A] tabular-nums">
                        {Math.round(ownMatch.ourTeu).toLocaleString()}
                      </div>
                    </div>
                    <div className="rounded-md bg-blue-50 px-2.5 py-1.5">
                      <div className="text-[9.5px] uppercase tracking-wide font-semibold text-blue-700">
                        Lane spend
                      </div>
                      <div className="text-[12.5px] font-bold text-blue-900 tabular-nums">
                        {fmtUsd(ownMatch.marketSpend)}
                      </div>
                    </div>
                    <div className="rounded-md bg-blue-50 px-2.5 py-1.5">
                      <div className="text-[9.5px] uppercase tracking-wide font-semibold text-blue-700">
                        % of total spend
                      </div>
                      <div className="text-[12.5px] font-bold text-blue-900 tabular-nums">
                        {sharePct != null ? `${sharePct}%` : "—"}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-md bg-amber-50 border border-amber-100 px-2.5 py-2 text-[11px] text-amber-800">
                    Reference lane shown — this company doesn't ship on it.
                    Pick one of {companyName ? `${companyName}'s` : "your"}{" "}
                    lanes below to see your spend.
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      </div>

      {/* Your Trade Lanes — per-route benchmark for THIS company */}
      {allRouteMatches.length > 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white">
          <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3">
            <Ship className="h-4 w-4 text-blue-600" />
            <div>
              <div className="text-[13px] font-bold text-[#0F172A]">
                {companyName ? `${companyName}'s Trade Lanes` : "Trade Lanes"}
              </div>
              <div className="text-[11px] text-slate-500">
                Each lane matched to its closest reference rate. Market spend = your TEU × current reference + LCL benchmark.
              </div>
            </div>
            <div className="ml-auto text-right">
              <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">
                Total
              </div>
              <div className="text-[14px] font-bold text-[#0F172A] tabular-nums">
                {fmtUsd(totalMarketSpendByLanes)}
              </div>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="bg-slate-50 text-left">
                  <th className="px-4 py-2 font-semibold text-slate-600">Your Lane</th>
                  <th className="px-4 py-2 font-semibold text-slate-600">Matched Reference</th>
                  <th className="px-4 py-2 font-semibold text-slate-600 text-right tabular-nums">Shipments</th>
                  <th className="px-4 py-2 font-semibold text-slate-600 text-right tabular-nums">TEU</th>
                  <th className="px-4 py-2 font-semibold text-slate-600 text-right tabular-nums">$/40ft</th>
                  <th className="px-4 py-2 font-semibold text-slate-600 text-right tabular-nums">Spend</th>
                </tr>
              </thead>
              <tbody>
                {allRouteMatches.map((m, idx) => (
                  <tr
                    key={`${m.route}-${idx}`}
                    onClick={() => m.matched?.lane.lane_code && setPrimaryLane(m.matched.lane.lane_code)}
                    className="border-t border-slate-100 hover:bg-slate-50 cursor-pointer"
                  >
                    <td className="px-4 py-2 text-slate-800 max-w-[280px] truncate" title={m.route}>
                      {m.route}
                    </td>
                    <td className="px-4 py-2">
                      {m.matched ? (
                        <div className="flex items-center gap-2">
                          <span className="inline-flex items-center rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-700">
                            {m.matched.lane.lane_code}
                          </span>
                          <span
                            className={`text-[10px] uppercase tracking-wide font-semibold ${
                              m.matched.confidence === "exact"
                                ? "text-emerald-600"
                                : m.matched.confidence === "partial"
                                  ? "text-amber-600"
                                  : "text-slate-400"
                            }`}
                          >
                            {m.matched.confidence}
                          </span>
                          <span className="text-slate-500 truncate" title={m.matched.lane.lane_label}>
                            {m.matched.lane.lane_label}
                          </span>
                        </div>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-slate-700">{fmtNum(m.ourShipments)}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-slate-700">{fmtNum(Math.round(m.ourTeu))}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-slate-700">
                      {m.matched ? fmtUsd(m.matched.lane.rate_usd_per_40ft) : "—"}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums font-semibold text-[#0F172A]">
                      {fmtUsd(m.marketSpend)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {/* Full FBX12 reference table */}
      <div className="rounded-xl border border-slate-200 bg-white">
        <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3">
          <Anchor className="h-4 w-4 text-blue-600" />
          <div>
            <div className="text-[13px] font-bold text-[#0F172A]">
              FBX12 Reference Rates
            </div>
            <div className="text-[11px] text-slate-500">
              Click a row to load it in the chart. Auto-refreshes every Monday.
            </div>
          </div>
          <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-slate-400">
            <RefreshCw className="h-3 w-3" />
            {asOf ? fmtDateFull(asOf) : "—"}
          </span>
        </div>
        <div className="overflow-x-auto">
          {loading ? (
            <div className="p-6 text-center text-[12px] text-slate-500">
              Loading…
            </div>
          ) : lanes.length === 0 ? (
            <div className="p-6 text-center text-[12px] text-slate-500">
              No reference data yet.
            </div>
          ) : (
            <table className="w-full text-[12px]">
              <thead>
                <tr className="bg-slate-50 text-left">
                  <th className="px-4 py-2 font-semibold text-slate-600">Lane</th>
                  <th className="px-4 py-2 font-semibold text-slate-600">Route</th>
                  <th className="px-4 py-2 font-semibold text-slate-600 text-right tabular-nums">
                    40' container
                  </th>
                  <th className="px-4 py-2 font-semibold text-slate-600 text-right tabular-nums">
                    Per TEU
                  </th>
                  <th className="px-4 py-2 font-semibold text-slate-600 text-right">
                    YTD
                  </th>
                </tr>
              </thead>
              <tbody>
                {lanes.map((l) => {
                  const isMatch = matched?.lane.lane_code === l.lane_code;
                  const isPrimary = primaryLane === l.lane_code;
                  const laneHistory = history
                    .filter((h) => h.lane_code === l.lane_code)
                    .sort((a, b) => a.as_of_date.localeCompare(b.as_of_date));
                  const ytdRates = laneHistory.map((h) => Number(h.rate_usd_per_40ft) || 0);
                  const ytdLow = ytdRates.length ? Math.min(...ytdRates) : null;
                  const ytdHigh = ytdRates.length ? Math.max(...ytdRates) : null;
                  const ytdFirst = ytdRates[0] ?? null;
                  const ytdLast = ytdRates[ytdRates.length - 1] ?? null;
                  const ytdPct =
                    ytdFirst && ytdFirst > 0 && ytdLast != null
                      ? ((ytdLast - ytdFirst) / ytdFirst) * 100
                      : null;
                  return (
                    <tr
                      key={l.lane_code}
                      onClick={() => setPrimaryLane(l.lane_code)}
                      className={[
                        "cursor-pointer transition-colors",
                        isMatch
                          ? "bg-blue-50/60 border-t border-blue-100"
                          : "border-t border-slate-100 hover:bg-slate-50",
                        isPrimary && !isMatch ? "bg-slate-50" : "",
                      ].join(" ")}
                    >
                      <td className="px-4 py-2 font-semibold text-[#0F172A]">
                        {l.lane_code}
                        {isMatch ? (
                          <span className="ml-2 inline-flex items-center rounded-full bg-blue-600 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-white">
                            Match
                          </span>
                        ) : null}
                      </td>
                      <td className="px-4 py-2 text-slate-700">{l.lane_label}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-slate-700">
                        {fmtUsd(l.rate_usd_per_40ft)}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-slate-700">
                        {fmtUsd(l.rate_usd_per_teu)}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        {ytdPct == null ? (
                          <span className="text-slate-400">—</span>
                        ) : (
                          <span
                            className={`inline-flex items-center gap-1 text-[11px] font-semibold ${ytdPct >= 1 ? "text-emerald-600" : ytdPct <= -1 ? "text-rose-600" : "text-slate-500"}`}
                          >
                            {ytdPct >= 1 ? (
                              <TrendingUp className="h-3 w-3" />
                            ) : ytdPct <= -1 ? (
                              <TrendingDown className="h-3 w-3" />
                            ) : (
                              <Minus className="h-3 w-3" />
                            )}
                            {fmtPct(ytdPct, true)}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  tone,
  sub,
}: {
  label: string;
  value: string;
  tone: "up" | "down" | "flat";
  sub?: string;
}) {
  const Icon =
    tone === "up" ? TrendingUp : tone === "down" ? TrendingDown : Minus;
  const toneClass =
    tone === "up"
      ? "text-emerald-600"
      : tone === "down"
        ? "text-rose-600"
        : "text-slate-500";
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">
        {label}
      </div>
      <div className={`flex items-center gap-1 text-[18px] font-bold mt-1 ${toneClass}`}>
        <Icon className="h-4 w-4" />
        <span className="tabular-nums">{value}</span>
      </div>
      {sub ? (
        <div className="text-[11px] text-slate-500 mt-0.5">{sub}</div>
      ) : null}
    </div>
  );
}
