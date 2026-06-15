// LaneIntelTable — sortable per-lane table for the Premium Intel tab.
//
// Joins three Supabase sources (carrier mix + YoY trend) into one row
// keyed by (origin_country, destination_country). The carrier column
// shows the top carrier per lane (max share_pct). The service-mode chip
// is inferred from the lane composition (carrier-name heuristics) — see
// inferLaneMode() below for the rules.
//
// Design notes:
//   - Tabular numerics for Shipments / TEU / YoY columns. Numbers must
//     line up at the decimal so eyes can scan the column without sweeping.
//   - Sort affordance: small caret on the active column, dimmed slate on
//     inactive. Click toggles asc/desc; second click on the same col flips.
//   - Empty state mirrors PremiumIntelPanel — service icon + restorable copy.
//   - 1px border, subtle shadow, no gradients, no rainbow palette.
import React, { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import {
  useLaneCarrierMix,
  useLaneYoyTrend,
  type LaneCarrierMixRow,
  type LaneYoyTrendRow,
} from "@/api/intel";
import ServiceModeChip from "@/components/intel/ServiceModeChip";
import { OceanIcon, type ServiceMode } from "@/components/icons/ServiceModeIcons";

interface LaneIntelTableProps {
  companyName: string;
}

type SortKey =
  | "lane"
  | "mode"
  | "shipments"
  | "teu"
  | "carrier"
  | "yoy";

interface LaneRow {
  origin: string;
  destination: string;
  mode: ServiceMode;
  shipments: number;
  teu: number;
  topCarrier: string | null;
  yoyPct: number | null;
}

function inferLaneMode(
  origin: string | null,
  destination: string | null,
  topCarrier: string | null,
): ServiceMode {
  const carrier = (topCarrier || "").toLowerCase();
  const o = (origin || "").toUpperCase();
  const d = (destination || "").toUpperCase();

  // Transborder rules: MX/CA leg with no ocean carrier → truck/rail.
  const transborderOrigin = ["MX", "MEXICO", "CA", "CANADA"].includes(o);
  const transborderDest = ["MX", "MEXICO", "CA", "CANADA"].includes(d);
  const isTransborder = transborderOrigin || transborderDest;

  if (carrier.includes("rail") || carrier.includes("union pacific") || carrier.includes("bnsf") || carrier.includes("kcs")) {
    return "rail";
  }
  if (isTransborder && carrier && !/(line|maersk|cosco|msc|hapag|cma)/i.test(carrier)) {
    return "truck";
  }
  if (/air|cargolux|lufthansa|fedex|ups|atlas/.test(carrier)) {
    return "air";
  }
  // Ocean carriers / default — Maersk, MSC, CMA, Cosco, Hapag-Lloyd, etc.
  return "ocean";
}

// Format "City, ST CC" — origin side may be country-only until the source
// feed gains origin city/state (lit_unified_shipments gap).
function fmtEndpoint(
  city: string | null | undefined,
  state: string | null | undefined,
  country: string | null | undefined,
): string {
  const cs = [city, state].filter((v): v is string => Boolean(v && v.trim())).join(", ");
  const cc = (country || "").trim();
  if (cs && cc) return `${cs} ${cc}`;
  if (cs) return cs;
  if (cc) return cc;
  return "—";
}

function joinRows(
  mix: LaneCarrierMixRow[],
  trend: LaneYoyTrendRow[],
): LaneRow[] {
  const byLane = new Map<string, LaneRow>();

  for (const m of mix) {
    const origin = fmtEndpoint(m.origin_city, m.origin_state, m.origin_country);
    const destination = fmtEndpoint(m.destination_city, m.destination_state, m.destination_country);
    const key = `${origin}→${destination}`;
    const existing = byLane.get(key);
    const inc = Number(m.shipment_count) || 0;
    if (!existing) {
      byLane.set(key, {
        origin,
        destination,
        mode: inferLaneMode(m.origin_country, m.destination_country, m.carrier),
        shipments: inc,
        teu: 0, // carrier-mix RPC doesn't carry TEU; left as 0 for now.
        topCarrier: m.carrier || null,
        yoyPct: null,
      });
    } else {
      existing.shipments += inc;
      // Top carrier = highest single-carrier share_pct in the lane.
      if (
        m.share_pct != null &&
        Number(m.share_pct) > 0 &&
        (existing.topCarrier === null ||
          Number(m.share_pct) >
            (Number(
              mix.find(
                (x) => {
                  const xo = fmtEndpoint(x.origin_city, x.origin_state, x.origin_country);
                  const xd = fmtEndpoint(x.destination_city, x.destination_state, x.destination_country);
                  return xo === existing.origin && xd === existing.destination && x.carrier === existing.topCarrier;
                },
              )?.share_pct ?? 0,
            )))
      ) {
        existing.topCarrier = m.carrier || existing.topCarrier;
        existing.mode = inferLaneMode(m.origin_country, m.destination_country, m.carrier);
      }
    }
  }

  for (const t of trend) {
    const origin = fmtEndpoint(t.origin_city, t.origin_state, t.origin_country);
    const destination = fmtEndpoint(t.destination_city, t.destination_state, t.destination_country);
    const key = `${origin}→${destination}`;
    const row = byLane.get(key);
    if (row) {
      row.yoyPct = t.yoy_pct;
    } else {
      // Trend row with no carrier-mix peer — surface anyway. Use sliding
      // 12-month sum as the headline shipment count.
      const total =
        Number(t.trailing_12m) + Number(t.prior_12m) + Number(t.prior_prior_12m);
      byLane.set(key, {
        origin,
        destination,
        mode: inferLaneMode(t.origin_country, t.destination_country, null),
        shipments: total,
        teu: 0,
        topCarrier: null,
        yoyPct: t.yoy_pct,
      });
    }
  }

  return Array.from(byLane.values());
}

function compareRows(a: LaneRow, b: LaneRow, key: SortKey, dir: "asc" | "desc"): number {
  let cmp = 0;
  switch (key) {
    case "lane":
      cmp = `${a.origin}→${a.destination}`.localeCompare(`${b.origin}→${b.destination}`);
      break;
    case "mode":
      cmp = a.mode.localeCompare(b.mode);
      break;
    case "shipments":
      cmp = a.shipments - b.shipments;
      break;
    case "teu":
      cmp = a.teu - b.teu;
      break;
    case "carrier":
      cmp = (a.topCarrier || "").localeCompare(b.topCarrier || "");
      break;
    case "yoy":
      // Nulls sort last regardless of direction (sentinel pattern).
      if (a.yoyPct == null && b.yoyPct == null) cmp = 0;
      else if (a.yoyPct == null) return 1;
      else if (b.yoyPct == null) return -1;
      else cmp = a.yoyPct - b.yoyPct;
      break;
  }
  return dir === "asc" ? cmp : -cmp;
}

function SortCaret({ active, dir }: { active: boolean; dir: "asc" | "desc" }) {
  if (!active) {
    return <Minus className="h-2.5 w-2.5 text-slate-300" aria-hidden />;
  }
  return dir === "asc" ? (
    <ArrowUp className="h-2.5 w-2.5 text-slate-700" aria-hidden />
  ) : (
    <ArrowDown className="h-2.5 w-2.5 text-slate-700" aria-hidden />
  );
}

const tabularStyle: React.CSSProperties = {
  fontVariantNumeric: "tabular-nums",
};

export function LaneIntelTable({ companyName }: LaneIntelTableProps) {
  const mixQ = useLaneCarrierMix(companyName);
  const trendQ = useLaneYoyTrend(companyName);

  const [sortKey, setSortKey] = useState<SortKey>("shipments");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const rows: LaneRow[] = useMemo(
    () => joinRows(mixQ.data || [], trendQ.data || []),
    [mixQ.data, trendQ.data],
  );

  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => compareRows(a, b, sortKey, sortDir));
  }, [rows, sortKey, sortDir]);

  const isLoading = mixQ.isLoading || trendQ.isLoading;

  function toggleSort(k: SortKey) {
    if (k === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(k);
      // Numeric defaults DESC; text columns default ASC. Matches user
      // expectation: "I want the busiest lane first" vs "alphabetical".
      setSortDir(k === "shipments" || k === "teu" || k === "yoy" ? "desc" : "asc");
    }
  }

  // Empty / loading states share the same shell so the chrome stays put.
  if (isLoading) {
    return (
      <div
        className="rounded-xl border border-slate-200 bg-white p-6"
        style={{ boxShadow: "0 1px 2px rgba(0,0,0,0.03)" }}
      >
        <div className="flex items-center gap-2 text-slate-400">
          <OceanIcon size={16} />
          <span className="font-display text-[12px] font-semibold">Loading lane intel…</span>
        </div>
        <div className="mt-4 space-y-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-7 animate-pulse rounded-md bg-slate-100/80" />
          ))}
        </div>
      </div>
    );
  }

  if (sorted.length === 0) {
    return (
      <div
        className="rounded-xl border border-slate-200 bg-white p-8 text-center"
        style={{ boxShadow: "0 1px 2px rgba(0,0,0,0.03)" }}
      >
        <div className="flex justify-center text-slate-400">
          <OceanIcon size={24} />
        </div>
        <div className="font-display mt-3 text-[12px] font-semibold text-slate-700">
          No lane intelligence recorded yet
        </div>
        <div className="font-body mt-1 text-[11px] text-slate-500">
          Refresh Intel on this account to populate carrier mix + YoY trend rows.
        </div>
      </div>
    );
  }

  const headerCellBase =
    "px-3 py-2 text-left font-display text-[10px] font-bold uppercase tracking-[0.06em] text-slate-500 select-none";
  const sortable = "cursor-pointer hover:text-slate-800 transition-colors";

  return (
    <div
      className="overflow-hidden rounded-xl border border-slate-200 bg-white"
      style={{ boxShadow: "0 1px 2px rgba(0,0,0,0.03)" }}
    >
      <div className="overflow-x-auto">
        <table className="min-w-full border-collapse">
          <thead className="border-b border-slate-200 bg-slate-50/60">
            <tr>
              <th
                scope="col"
                className={`${headerCellBase} ${sortable}`}
                onClick={() => toggleSort("lane")}
              >
                <span className="inline-flex items-center gap-1">
                  Origin → Destination
                  <SortCaret active={sortKey === "lane"} dir={sortDir} />
                </span>
              </th>
              <th
                scope="col"
                className={`${headerCellBase} ${sortable}`}
                onClick={() => toggleSort("mode")}
              >
                <span className="inline-flex items-center gap-1">
                  Mode
                  <SortCaret active={sortKey === "mode"} dir={sortDir} />
                </span>
              </th>
              <th
                scope="col"
                className={`${headerCellBase} ${sortable} text-right`}
                onClick={() => toggleSort("shipments")}
                style={{ textAlign: "right" }}
              >
                <span className="inline-flex items-center gap-1">
                  Shipments
                  <SortCaret active={sortKey === "shipments"} dir={sortDir} />
                </span>
              </th>
              <th
                scope="col"
                className={`${headerCellBase} ${sortable} text-right`}
                onClick={() => toggleSort("teu")}
                style={{ textAlign: "right" }}
              >
                <span className="inline-flex items-center gap-1">
                  TEU
                  <SortCaret active={sortKey === "teu"} dir={sortDir} />
                </span>
              </th>
              <th
                scope="col"
                className={`${headerCellBase} ${sortable}`}
                onClick={() => toggleSort("carrier")}
              >
                <span className="inline-flex items-center gap-1">
                  Top Carrier
                  <SortCaret active={sortKey === "carrier"} dir={sortDir} />
                </span>
              </th>
              <th
                scope="col"
                className={`${headerCellBase} ${sortable} text-right`}
                onClick={() => toggleSort("yoy")}
                style={{ textAlign: "right" }}
              >
                <span className="inline-flex items-center gap-1">
                  YoY %
                  <SortCaret active={sortKey === "yoy"} dir={sortDir} />
                </span>
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r, i) => {
              const yoyTone =
                r.yoyPct == null
                  ? "text-slate-400"
                  : r.yoyPct > 0
                    ? "text-emerald-600"
                    : r.yoyPct < 0
                      ? "text-rose-600"
                      : "text-slate-500";
              return (
                <tr
                  key={`${r.origin}-${r.destination}-${i}`}
                  className="border-b border-slate-100 transition-colors hover:bg-slate-50/60 last:border-b-0"
                >
                  <td className="px-3 py-2.5">
                    <div
                      className="font-display max-w-[320px] truncate text-[12px] font-semibold text-slate-900"
                      title={`${r.origin} → ${r.destination}`}
                    >
                      <span>{r.origin}</span>
                      <span className="mx-1.5 text-slate-300">→</span>
                      <span>{r.destination}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    <ServiceModeChip mode={r.mode} size="xs" />
                  </td>
                  <td
                    className="px-3 py-2.5 text-right font-mono text-[12px] font-semibold text-slate-900"
                    style={tabularStyle}
                  >
                    {r.shipments.toLocaleString()}
                  </td>
                  <td
                    className="px-3 py-2.5 text-right font-mono text-[12px] text-slate-700"
                    style={tabularStyle}
                  >
                    {r.teu > 0 ? r.teu.toLocaleString() : "—"}
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="font-display text-[11.5px] text-slate-700">
                      {r.topCarrier || (
                        <span className="text-slate-400">—</span>
                      )}
                    </span>
                  </td>
                  <td
                    className={`px-3 py-2.5 text-right font-mono text-[12px] font-semibold ${yoyTone}`}
                    style={tabularStyle}
                  >
                    <span className="inline-flex items-center justify-end gap-1">
                      {r.yoyPct == null ? (
                        "—"
                      ) : (
                        <>
                          {r.yoyPct > 0 && <ArrowUp className="h-3 w-3" aria-hidden />}
                          {r.yoyPct < 0 && <ArrowDown className="h-3 w-3" aria-hidden />}
                          {r.yoyPct > 0 ? "+" : ""}
                          {r.yoyPct.toFixed(1)}%
                        </>
                      )}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default LaneIntelTable;
