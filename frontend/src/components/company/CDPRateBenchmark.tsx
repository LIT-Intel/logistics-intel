/**
 * Phase 4 — Rate Benchmark tab.
 *
 * Shows the latest FBX12 ocean-freight reference rates (loaded from
 * `lit_freight_rate_benchmarks`, populated weekly by the
 * `freight-rate-fetcher` edge function), highlights the lane that best
 * matches the company's `top_route_12m`, displays a market-rate
 * estimated spend breakdown, and includes:
 *   - Historical line chart (last ~6 months) for the matched lane.
 *   - Interactive globe map of the 12 reference lanes — reuses the same
 *     GlobeCanvas component used by Supply Chain.
 *
 * Source attribution intentionally avoids vendor names — only "FBX
 * reference" / "FBX12 Index" appears in copy. Rates are refreshed
 * weekly (Mondays after the index publishes) by the cron-scheduled
 * freight-rate-fetcher edge function.
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
} from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";
import GlobeCanvas, { type GlobeLane } from "@/components/GlobeCanvas";
import {
  loadLatestBenchmarks,
  loadHistoryForLane,
  matchLaneForRoute,
  computeMarketRateSpend,
  FBX_LANE_COORDS,
  type FreightLane,
  type MatchedLane,
} from "@/lib/freightRateBenchmark";

type Props = {
  companyName: string;
  topRoute: string | null;
  teu12m: number | null;
  fcl12m: number | null;
  lcl12m: number | null;
  ships12m: number | null;
  importyetiReportedSpend?: number | null;
};

function fmtUsd(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(Number(n))) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(Number(n));
}

function fmtNum(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(Number(n))) return "—";
  return Number(n).toLocaleString("en-US");
}

function fmtDate(s: string | null | undefined): string {
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

export default function CDPRateBenchmark({
  companyName,
  topRoute,
  teu12m,
  fcl12m,
  lcl12m,
  ships12m,
  importyetiReportedSpend,
}: Props) {
  const [lanes, setLanes] = useState<FreightLane[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [history, setHistory] = useState<
    Array<{ as_of_date: string; rate_usd_per_40ft: number; rate_usd_per_teu: number }>
  >([]);
  const [selectedLane, setSelectedLane] = useState<string | null>(null);

  // Initial load — current rates for all 12 lanes.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErr(null);
    (async () => {
      try {
        const rows = await loadLatestBenchmarks();
        if (cancelled) return;
        setLanes(rows);
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

  // Auto-select the matched lane in the chart.
  useEffect(() => {
    if (matched && matched.lane.lane_code !== "AVG" && !selectedLane) {
      setSelectedLane(matched.lane.lane_code);
    } else if (!selectedLane && lanes.length > 0) {
      setSelectedLane(lanes[0].lane_code);
    }
  }, [matched, lanes, selectedLane]);

  // Load historical series for the selected lane.
  useEffect(() => {
    if (!selectedLane || selectedLane === "AVG") {
      setHistory([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const rows = await loadHistoryForLane(selectedLane, 26);
      if (!cancelled) setHistory(rows);
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedLane]);

  const chartData = useMemo(
    () =>
      history.map((r) => ({
        date: r.as_of_date,
        teuRate: r.rate_usd_per_teu,
        fortyFt: r.rate_usd_per_40ft,
      })),
    [history],
  );

  const trend = useMemo(() => {
    if (chartData.length < 2) return null;
    const first = chartData[0].teuRate;
    const last = chartData[chartData.length - 1].teuRate;
    if (!first) return null;
    const pct = ((last - first) / first) * 100;
    return { pct, direction: pct >= 0 ? "up" : "down" as const };
  }, [chartData]);

  // Spend calculation with corrected FCL=2 TEU math.
  const spend = useMemo(
    () =>
      computeMarketRateSpend(
        teu12m,
        fcl12m, // explicit FCL container count
        ships12m, // fallback to total shipments × fcl_pct via lib internals
        matched,
      ),
    [teu12m, fcl12m, ships12m, matched],
  );

  // Globe lanes for the map — all 12 FBX lanes with current rate as the
  // tooltip metric, matched lane highlighted via id matching.
  const globeLanes: GlobeLane[] = useMemo(() => {
    return lanes
      .filter((l) => FBX_LANE_COORDS[l.lane_code])
      .map((l) => {
        const c = FBX_LANE_COORDS[l.lane_code];
        return {
          id: l.lane_code,
          from: c.fromLabel,
          to: c.toLabel,
          coords: [c.fromCoords, c.toCoords] as [
            [number, number],
            [number, number],
          ],
          shipments: l.rate_usd_per_40ft, // displayed as the primary value
          teu: `$${Math.round(l.rate_usd_per_teu).toLocaleString()}/TEU`,
        } as GlobeLane;
      });
  }, [lanes]);

  const asOf = matched?.lane.as_of_date ?? lanes[0]?.as_of_date ?? null;

  return (
    <div className="space-y-4">
      {/* Header — market-rate estimate */}
      <div className="rounded-xl border border-slate-200 bg-white p-5">
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
        ) : !spend ? (
          <div className="text-[12px] text-slate-500">
            Not enough trade data to compute a market-rate estimate yet. Save
            this company and refresh intelligence to populate KPIs.
          </div>
        ) : (
          <>
            <div className="text-[28px] font-bold text-[#0F172A] leading-tight">
              {fmtUsd(spend.totalSpend)}
            </div>
            <div className="text-[11px] text-slate-500">
              {fmtNum(ships12m)} shipments · {fmtNum(teu12m)} TEU · trailing 12 months
            </div>

            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">
                  FCL · {fmtNum(spend.fclContainers)} containers
                </div>
                <div className="text-[13px] font-bold text-[#0F172A] mt-0.5">
                  {fmtUsd(spend.fclSpend)}
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  {fmtNum(spend.fclTeu)} TEU @ {fmtUsd(spend.laneRatePer40ft)}/40ft
                  ({fmtUsd(spend.laneRatePerTeu)}/TEU)
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
                  Importer-reported shipping cost on file:{" "}
                  <strong>{fmtUsd(importyetiReportedSpend)}</strong>. That value
                  reflects observed customs/freight charges only and is
                  typically a fraction of the full ocean-freight contract value.
                  The market-rate estimate above multiplies actual TEU by the
                  current FBX{matched ? matched.lane.lane_code.replace(/\D/g, "") : "12"} reference rate plus an LCL benchmark.
                </div>
              </div>
            ) : null}
          </>
        )}
      </div>

      {/* Matched lane card */}
      {matched && matched.lane.lane_code !== "AVG" ? (
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex items-center gap-2 mb-3">
            <Ship className="h-4 w-4 text-blue-600" />
            <div className="text-[13px] font-bold text-[#0F172A]">
              Matched Trade Lane
            </div>
            {asOf ? (
              <span className="ml-auto text-[11px] text-slate-400">
                As of {fmtDate(asOf)}
              </span>
            ) : null}
          </div>
          <div className="text-[13px] text-[#0F172A] font-semibold">
            {matched.lane.lane_label}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            {companyName}'s top lane:{" "}
            <span className="text-slate-700">{topRoute || "—"}</span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">
                40' container
              </div>
              <div className="text-[14px] font-bold text-[#0F172A] mt-0.5 tabular-nums">
                {fmtUsd(matched.lane.rate_usd_per_40ft)}
              </div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">
                Per TEU
              </div>
              <div className="text-[14px] font-bold text-[#0F172A] mt-0.5 tabular-nums">
                {fmtUsd(matched.lane.rate_usd_per_teu)}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* Historical chart */}
      <div className="rounded-xl border border-slate-200 bg-white">
        <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3">
          <TrendingUp className="h-4 w-4 text-blue-600" />
          <div>
            <div className="text-[13px] font-bold text-[#0F172A]">
              Lane Rate Trend
            </div>
            <div className="text-[11px] text-slate-500">
              Weekly $/TEU over the last ~6 months. Rates auto-refresh every Monday.
            </div>
          </div>
          {trend ? (
            <span
              className={`ml-auto inline-flex items-center gap-1 text-[11px] font-semibold ${trend.direction === "up" ? "text-emerald-600" : "text-rose-600"}`}
            >
              {trend.direction === "up" ? (
                <TrendingUp className="h-3 w-3" />
              ) : (
                <TrendingDown className="h-3 w-3" />
              )}
              {trend.pct.toFixed(1)}%
            </span>
          ) : null}
        </div>
        <div className="px-4 py-3">
          <select
            value={selectedLane ?? ""}
            onChange={(e) => setSelectedLane(e.target.value || null)}
            className="text-[12px] border border-slate-200 rounded-md px-2 py-1 mb-3"
          >
            {lanes.map((l) => (
              <option key={l.lane_code} value={l.lane_code}>
                {l.lane_code} · {l.lane_label}
              </option>
            ))}
          </select>
          <div className="h-[220px]">
            {chartData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-[12px] text-slate-400">
                {loading
                  ? "Loading…"
                  : "Trend data populates as rates are refreshed weekly. Check back next Monday."}
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 10, fill: "#64748B" }}
                    axisLine={{ stroke: "#CBD5E1" }}
                    tickLine={{ stroke: "#CBD5E1" }}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: "#64748B" }}
                    axisLine={{ stroke: "#CBD5E1" }}
                    tickLine={{ stroke: "#CBD5E1" }}
                    tickFormatter={(v: any) => `$${Number(v).toLocaleString()}`}
                  />
                  <RechartsTooltip
                    formatter={(value: any, name: any) => {
                      if (name === "teuRate")
                        return [`$${Number(value).toLocaleString()}/TEU`, "Per TEU"];
                      return [`$${Number(value).toLocaleString()}/40ft`, "Per 40'"];
                    }}
                    labelFormatter={(label: any) => fmtDate(label)}
                    contentStyle={{
                      borderRadius: 8,
                      border: "1px solid #E2E8F0",
                      fontSize: 12,
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="teuRate"
                    stroke="#2563EB"
                    strokeWidth={2}
                    dot={{ r: 2, fill: "#2563EB" }}
                    activeDot={{ r: 4 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* Interactive globe map */}
      <div className="rounded-xl border border-slate-200 bg-white">
        <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3">
          <Globe2 className="h-4 w-4 text-blue-600" />
          <div>
            <div className="text-[13px] font-bold text-[#0F172A]">
              Global Lane Map
            </div>
            <div className="text-[11px] text-slate-500">
              All 12 FBX12 reference lanes. Hover an arc to see its current 40'
              rate.
            </div>
          </div>
        </div>
        <div className="p-4">
          <div className="aspect-[16/10] w-full">
            <GlobeCanvas
              lanes={globeLanes}
              theme="light"
              selectedLane={matched?.lane?.lane_code ?? null}
            />
          </div>
        </div>
      </div>

      {/* Full FBX12 table */}
      <div className="rounded-xl border border-slate-200 bg-white">
        <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3">
          <Anchor className="h-4 w-4 text-blue-600" />
          <div>
            <div className="text-[13px] font-bold text-[#0F172A]">
              FBX12 Reference Rates
            </div>
            <div className="text-[11px] text-slate-500">
              Refreshed weekly on Mondays.
            </div>
          </div>
          <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-slate-400">
            <RefreshCw className="h-3 w-3" />
            {asOf ? fmtDate(asOf) : "—"}
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
                </tr>
              </thead>
              <tbody>
                {lanes.map((l) => {
                  const isMatch = matched?.lane.lane_code === l.lane_code;
                  return (
                    <tr
                      key={l.lane_code}
                      onClick={() => setSelectedLane(l.lane_code)}
                      className={
                        (isMatch
                          ? "bg-blue-50/60 border-t border-blue-100"
                          : "border-t border-slate-100 hover:bg-slate-50") +
                        " cursor-pointer"
                      }
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
