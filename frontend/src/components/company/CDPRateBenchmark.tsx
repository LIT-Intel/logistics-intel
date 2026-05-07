/**
 * Phase 4 — Rate Benchmark tab.
 *
 * Shows the latest FBX12 ocean-freight benchmark rates (sourced from
 * `lit_freight_rate_benchmarks`, populated weekly by the
 * `freight-rate-fetcher` edge function), highlights the lane that best
 * matches the company's `top_route_12m`, and displays a market-rate
 * estimated spend breakdown (FCL × matched-lane rate + LCL × industry
 * default).
 */

import { useEffect, useMemo, useState } from "react";
import { Anchor, Globe2, Info, RefreshCw, Ship, Sparkles } from "lucide-react";
import {
  loadLatestBenchmarks,
  matchLaneForRoute,
  computeMarketRateSpend,
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
        if (!cancelled) setErr(e?.message || "Failed to load benchmark rates");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const matched: MatchedLane | null = useMemo(
    () => (lanes.length ? matchLaneForRoute(topRoute, lanes) : null),
    [lanes, topRoute],
  );

  const fclPct = useMemo(() => {
    const f = Number(fcl12m);
    const l = Number(lcl12m);
    if (!Number.isFinite(f) || !Number.isFinite(l)) return null;
    if (f + l <= 0) return null;
    return f / (f + l);
  }, [fcl12m, lcl12m]);

  const spend = useMemo(
    () => computeMarketRateSpend(teu12m, fclPct, matched),
    [teu12m, fclPct, matched],
  );

  const asOf = matched?.lane.as_of_date ?? lanes[0]?.as_of_date ?? null;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex items-center gap-2 mb-2">
          <Sparkles className="h-4 w-4 text-blue-600" />
          <div className="text-[13px] font-bold text-[#0F172A]">
            Market-Rate Estimate
          </div>
          {matched ? (
            <span className="ml-auto inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
              <Anchor className="h-3 w-3" />
              {matched.lane.lane_code} · {matched.confidence} match
            </span>
          ) : null}
        </div>

        {loading ? (
          <div className="text-[12px] text-slate-500">Loading benchmark rates…</div>
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
              Trailing 12 months · {fmtNum(ships12m)} shipments · {fmtNum(teu12m)} TEU
            </div>

            {/* Breakdown */}
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">
                  FCL
                </div>
                <div className="text-[13px] font-bold text-[#0F172A] mt-0.5">
                  {fmtUsd(spend.fclSpend)}
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  {fmtNum(spend.fclTeu)} TEU × {fmtUsd(spend.laneRatePerTeu)}/TEU
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
                  {fmtNum(spend.lclTeu)} TEU × {fmtUsd(spend.lclRatePerTeu)}/TEU
                </div>
              </div>
            </div>

            {/* IY comparison */}
            {importyetiReportedSpend != null ? (
              <div className="mt-4 flex items-start gap-2 rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
                <Info className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                <div>
                  ImportYeti reports{" "}
                  <strong>{fmtUsd(importyetiReportedSpend)}</strong> in declared
                  shipping cost for this company — typically a fraction of the
                  market rate because it reflects observed customs/freight
                  charges, not full ocean-freight contract value. The market-rate
                  estimate above multiplies actual TEU by current FBX{matched ? matched.lane.lane_code.replace(/\D/g, "") : "12"} index rates plus an LCL benchmark.
                </div>
              </div>
            ) : null}
          </>
        )}
      </div>

      {/* Matched lane card */}
      {matched ? (
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex items-center gap-2 mb-3">
            <Ship className="h-4 w-4 text-blue-600" />
            <div className="text-[13px] font-bold text-[#0F172A]">
              Matched Trade Lane
            </div>
            {asOf ? (
              <span className="ml-auto text-[11px] text-slate-400">
                As of {new Date(asOf).toLocaleDateString()}
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

      {/* Full FBX12 table */}
      <div className="rounded-xl border border-slate-200 bg-white">
        <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3">
          <Globe2 className="h-4 w-4 text-blue-600" />
          <div>
            <div className="text-[13px] font-bold text-[#0F172A]">
              FBX12 Index — current rates
            </div>
            <div className="text-[11px] text-slate-500">
              Freightos Baltic Index. Refreshed weekly via the freight-rate-fetcher
              edge function.
            </div>
          </div>
          <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-slate-400">
            <RefreshCw className="h-3 w-3" />
            {asOf ? new Date(asOf).toLocaleDateString() : "—"}
          </span>
        </div>
        <div className="overflow-x-auto">
          {loading ? (
            <div className="p-6 text-center text-[12px] text-slate-500">
              Loading…
            </div>
          ) : lanes.length === 0 ? (
            <div className="p-6 text-center text-[12px] text-slate-500">
              No benchmark data yet. Run the freight-rate-fetcher edge function
              to populate.
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
                      className={
                        isMatch
                          ? "bg-blue-50/60 border-t border-blue-100"
                          : "border-t border-slate-100"
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
