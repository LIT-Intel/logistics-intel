// LaneMixStackedBar — top lanes × top 3 carriers per lane, stacked
// horizontal bar chart. Replaces the legacy PerLaneCarrierMixCard list view
// with a single chart that reads "which lanes matter and who runs them" in
// one glance.
//
// Each lane row also surfaces total shipments + total TEU (sum from BOLs the
// parent passes via `laneTeuTotals`) + a YoY% chip (data from the YoY trend
// RPC, joined by formatted-lane key).

import React from "react";
import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import LitSectionCard from "@/components/ui/LitSectionCard";
import { useLaneCarrierMix, useLaneYoyTrend } from "@/api/intel";

interface LaneMixStackedBarProps {
  companyName: string;
  /** Map of formatted lane label -> total TEU (summed from lit_unified_shipments). */
  laneTeuTotals?: Record<string, number>;
}

function formatLaneEndpoint(
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

// Brand-coherent distinct carrier slots (top-3 carriers per lane). NOT a
// rainbow — three shades that work together across all lanes.
const CARRIER_COLORS = ["#3B82F6", "#6366F1", "#60A5FA"]; // blue / indigo / sky-blue

export default function LaneMixStackedBar({
  companyName,
  laneTeuTotals,
}: LaneMixStackedBarProps) {
  const { data: mix, isLoading: mixLoading } = useLaneCarrierMix(companyName);
  const { data: yoy } = useLaneYoyTrend(companyName);

  // YoY lookup by formatted lane label (matches the lane row's lane string).
  const yoyByLane = React.useMemo(() => {
    const m = new Map<string, number | null>();
    for (const r of yoy || []) {
      const origin = formatLaneEndpoint(r.origin_city, r.origin_state, r.origin_country);
      const dest = formatLaneEndpoint(r.destination_city, r.destination_state, r.destination_country);
      m.set(`${origin} → ${dest}`, r.yoy_pct == null ? null : Number(r.yoy_pct));
    }
    return m;
  }, [yoy]);

  // Build per-lane rows: { lane, c1Name, c1, c2Name, c2, c3Name, c3, total, teu, yoy }
  const rows = React.useMemo(() => {
    if (!mix) return [];
    const grouped = new Map<
      string,
      {
        lane: string;
        carriers: { name: string; count: number }[];
      }
    >();
    for (const row of mix) {
      const origin = formatLaneEndpoint(row.origin_city, row.origin_state, row.origin_country);
      const dest = formatLaneEndpoint(row.destination_city, row.destination_state, row.destination_country);
      const key = `${origin} → ${dest}`;
      if (!grouped.has(key)) grouped.set(key, { lane: key, carriers: [] });
      grouped.get(key)!.carriers.push({
        name: row.carrier || "Unknown",
        count: Number(row.shipment_count) || 0,
      });
    }
    return Array.from(grouped.values())
      .map((g) => {
        const sorted = g.carriers.sort((a, b) => b.count - a.count).slice(0, 3);
        const total = g.carriers.reduce((s, c) => s + c.count, 0);
        const teu = laneTeuTotals?.[g.lane] ?? 0;
        const yoyVal = yoyByLane.get(g.lane) ?? null;
        return {
          lane: g.lane,
          shortLane:
            g.lane.length > 38 ? g.lane.slice(0, 37) + "…" : g.lane,
          c1: sorted[0]?.count ?? 0,
          c1Name: sorted[0]?.name ?? null,
          c2: sorted[1]?.count ?? 0,
          c2Name: sorted[1]?.name ?? null,
          c3: sorted[2]?.count ?? 0,
          c3Name: sorted[2]?.name ?? null,
          total,
          teu,
          yoy: yoyVal,
        };
      })
      .sort((a, b) => b.total - a.total)
      .slice(0, 8);
  }, [mix, laneTeuTotals, yoyByLane]);

  if (mixLoading) {
    return (
      <LitSectionCard title="Lane mix" sub="Top lanes · top 3 carriers each">
        <SkeletonChart />
      </LitSectionCard>
    );
  }
  if (rows.length === 0) {
    return (
      <LitSectionCard title="Lane mix" sub="Top lanes · top 3 carriers each">
        <Empty />
      </LitSectionCard>
    );
  }

  const height = rows.length * 38 + 36;

  return (
    <LitSectionCard
      title="Lane mix"
      sub="Top lanes × top 3 carriers · stacked share"
      padded={false}
    >
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,3fr)_minmax(0,1fr)]">
        <div style={{ width: "100%", height }} className="px-3 py-2">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={rows}
              layout="vertical"
              margin={{ top: 4, right: 16, left: 8, bottom: 16 }}
            >
              <XAxis
                type="number"
                tick={{ fontSize: 10, fill: "#64748B" }}
                tickLine={false}
                axisLine={{ stroke: "#E2E8F0" }}
              />
              <YAxis
                type="category"
                dataKey="shortLane"
                width={210}
                tick={{ fontSize: 10.5, fill: "#1E293B" }}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip content={<StackedTooltip />} cursor={{ fill: "#F8FAFC" }} />
              <Bar
                dataKey="c1"
                stackId="lane"
                fill={CARRIER_COLORS[0]}
                barSize={18}
                isAnimationActive
                animationDuration={700}
              >
                {rows.map((_, i) => (
                  <Cell key={`c1-${i}`} />
                ))}
              </Bar>
              <Bar
                dataKey="c2"
                stackId="lane"
                fill={CARRIER_COLORS[1]}
                barSize={18}
                isAnimationActive
                animationDuration={700}
              >
                {rows.map((_, i) => (
                  <Cell key={`c2-${i}`} />
                ))}
              </Bar>
              <Bar
                dataKey="c3"
                stackId="lane"
                fill={CARRIER_COLORS[2]}
                barSize={18}
                radius={[0, 4, 4, 0]}
                isAnimationActive
                animationDuration={700}
              >
                {rows.map((_, i) => (
                  <Cell key={`c3-${i}`} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <aside className="border-t border-slate-100 px-3 py-3 text-[10px] lg:border-l lg:border-t-0">
          <div className="font-display mb-2 text-[9px] font-bold uppercase tracking-[0.08em] text-slate-400">
            Lane totals
          </div>
          <ul className="space-y-1.5">
            {rows.map((r) => (
              <li key={r.lane} className="flex items-center justify-between gap-2">
                <span
                  className="font-display truncate text-[10.5px] font-semibold text-slate-800"
                  title={r.lane}
                >
                  {r.shortLane}
                </span>
                <span
                  className="font-mono shrink-0 text-right tabular-nums"
                  style={{ fontVariantNumeric: "tabular-nums" }}
                >
                  <span className="font-bold text-slate-900">
                    {r.total.toLocaleString()}
                  </span>
                  {r.teu > 0 && (
                    <span className="ml-1 text-slate-500">
                      · {Math.round(r.teu).toLocaleString()} TEU
                    </span>
                  )}
                  {r.yoy != null && <YoyChip value={r.yoy} />}
                </span>
              </li>
            ))}
          </ul>
        </aside>
      </div>
      <Legend />
    </LitSectionCard>
  );
}

function YoyChip({ value }: { value: number }) {
  const tone =
    value > 0
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : value < 0
        ? "border-rose-200 bg-rose-50 text-rose-700"
        : "border-slate-200 bg-slate-50 text-slate-500";
  const arrow = value > 0 ? "↑" : value < 0 ? "↓" : "";
  return (
    <span
      className={`font-mono ml-1.5 inline-flex items-center rounded border px-1 py-[1px] text-[9px] font-bold tabular-nums ${tone}`}
      style={{ fontVariantNumeric: "tabular-nums" }}
    >
      {arrow} {Math.abs(value).toFixed(1)}%
    </span>
  );
}

function StackedTooltip({ active, payload, label }: { active?: boolean; payload?: any[]; label?: string }) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  if (!row) return null;
  const segs = [
    { name: row.c1Name, count: row.c1, color: CARRIER_COLORS[0] },
    { name: row.c2Name, count: row.c2, color: CARRIER_COLORS[1] },
    { name: row.c3Name, count: row.c3, color: CARRIER_COLORS[2] },
  ].filter((s) => s.name && s.count > 0);
  return (
    <div className="font-display min-w-[200px] rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-[11px] text-white shadow-lg">
      <div className="mb-1 font-semibold">{label || row.lane}</div>
      <div
        className="mb-1.5 text-[10px] opacity-75 tabular-nums"
        style={{ fontVariantNumeric: "tabular-nums" }}
      >
        {row.total.toLocaleString()} shipments
        {row.teu > 0 && (
          <> · {Math.round(row.teu).toLocaleString()} TEU</>
        )}
      </div>
      <div className="space-y-0.5">
        {segs.map((s) => {
          const pct = row.total > 0 ? Math.round((s.count / row.total) * 100) : 0;
          return (
            <div key={s.name} className="flex items-center gap-1.5">
              <span
                className="inline-block h-2 w-2 rounded-sm"
                style={{ background: s.color }}
              />
              <span className="flex-1 truncate">{s.name}</span>
              <span
                className="font-mono tabular-nums opacity-90"
                style={{ fontVariantNumeric: "tabular-nums" }}
              >
                {s.count.toLocaleString()} · {pct}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 px-3 py-2">
      <span className="font-display text-[9px] font-bold uppercase tracking-[0.08em] text-slate-400">
        Carrier rank
      </span>
      {["#1 carrier", "#2 carrier", "#3 carrier"].map((label, i) => (
        <span key={label} className="flex items-center gap-1.5">
          <span
            className="inline-block h-2 w-2 rounded-sm"
            style={{ background: CARRIER_COLORS[i] }}
          />
          <span className="font-display text-[10px] text-slate-600">{label}</span>
        </span>
      ))}
    </div>
  );
}

function SkeletonChart() {
  return (
    <div className="space-y-2 py-2">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center gap-2">
          <div className="h-3 w-44 rounded bg-slate-100" />
          <div
            className="h-5 rounded bg-slate-100"
            style={{ width: `${85 - i * 10}%` }}
          />
        </div>
      ))}
    </div>
  );
}

function Empty() {
  return (
    <div className="px-6 py-8 text-center">
      <p className="font-body text-[11.5px] text-slate-500">
        No lane × carrier mix yet — refresh intel to populate.
      </p>
    </div>
  );
}
