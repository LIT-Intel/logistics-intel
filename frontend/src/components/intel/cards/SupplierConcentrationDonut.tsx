// SupplierConcentrationDonut — donut showing top-5 named suppliers plus a
// rolled-up "Other" slice. Click "Other" to expand into a list view inline
// in the same card.

import React from "react";
import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Sector,
  Tooltip,
} from "recharts";
import LitSectionCard from "@/components/ui/LitSectionCard";
import { usePqSupplierAggregates } from "@/api/intel";

interface SupplierConcentrationDonutProps {
  companyName: string;
}

// Brand-coherent 6-slot palette — top 5 named + "Other"
const PALETTE = [
  "#3B82F6", // blue-500
  "#6366F1", // indigo-500
  "#10B981", // emerald-500
  "#F59E0B", // amber-500
  "#60A5FA", // blue-400
  "#CBD5E1", // slate-300 (Other)
];

function countryFlag(country: string | null): string | null {
  if (!country) return null;
  const c = country.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(c)) return null;
  const cp = [...c].map((ch) => 0x1f1e6 + (ch.charCodeAt(0) - 65));
  return String.fromCodePoint(...cp);
}

const renderActive = (props: any) => {
  const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill } = props;
  return (
    <Sector
      cx={cx}
      cy={cy}
      innerRadius={innerRadius}
      outerRadius={outerRadius + 4}
      startAngle={startAngle}
      endAngle={endAngle}
      fill={fill}
    />
  );
};

export default function SupplierConcentrationDonut({
  companyName,
}: SupplierConcentrationDonutProps) {
  const { data, isLoading } = usePqSupplierAggregates(companyName);
  const [otherExpanded, setOtherExpanded] = React.useState(false);
  const [hoverIdx, setHoverIdx] = React.useState<number | null>(null);

  const { slices, others, total } = React.useMemo(() => {
    const rows = (data || [])
      .map((r) => ({
        name: r.supplier_name,
        country: r.supplier_country,
        count: Number(r.shipment_count) || 0,
        flag: countryFlag(r.supplier_country),
      }))
      .filter((r) => r.count > 0)
      .sort((a, b) => b.count - a.count);
    const top = rows.slice(0, 5);
    const rest = rows.slice(5);
    const otherCount = rest.reduce((s, r) => s + r.count, 0);
    const all = [...top];
    if (otherCount > 0) {
      all.push({ name: "Other", country: null, count: otherCount, flag: null });
    }
    const tot = all.reduce((s, r) => s + r.count, 0);
    return { slices: all, others: rest, total: tot };
  }, [data]);

  if (isLoading) {
    return (
      <LitSectionCard
        title="Supplier concentration"
        sub="Top 5 + Other share"
      >
        <SkeletonDonut />
      </LitSectionCard>
    );
  }
  if (slices.length === 0) {
    return (
      <LitSectionCard
        title="Supplier concentration"
        sub="Top 5 + Other share"
      >
        <Empty />
      </LitSectionCard>
    );
  }

  return (
    <LitSectionCard
      title="Supplier concentration"
      sub={`Top 5 suppliers · ${slices.length - (others.length > 0 ? 1 : 0)} named${
        others.length > 0 ? ` + ${others.length} in Other` : ""
      }`}
    >
      <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start sm:gap-6">
        <div className="relative" style={{ width: 200, height: 200 }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={slices}
                dataKey="count"
                nameKey="name"
                innerRadius="60%"
                outerRadius="90%"
                paddingAngle={2}
                stroke="none"
                activeIndex={hoverIdx ?? undefined}
                activeShape={renderActive}
                onMouseEnter={(_d, i) => setHoverIdx(i)}
                onMouseLeave={() => setHoverIdx(null)}
                onClick={(d: any) => {
                  if (d?.name === "Other") setOtherExpanded((x) => !x);
                }}
                isAnimationActive
                animationDuration={800}
              >
                {slices.map((_, i) => (
                  <Cell
                    key={i}
                    fill={PALETTE[i] || PALETTE[PALETTE.length - 1]}
                    cursor={slices[i].name === "Other" ? "pointer" : "default"}
                  />
                ))}
              </Pie>
              <Tooltip content={<SupplierTooltip total={total} />} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <ul className="flex-1 space-y-1.5">
          {slices.map((s, i) => {
            const pct = total > 0 ? Math.round((s.count / total) * 100) : 0;
            return (
              <li
                key={s.name + i}
                className="flex items-center justify-between gap-2 rounded px-1 py-0.5"
                onMouseEnter={() => setHoverIdx(i)}
                onMouseLeave={() => setHoverIdx(null)}
              >
                <span className="flex min-w-0 items-center gap-1.5">
                  <span
                    className="inline-block h-2 w-2 shrink-0 rounded-sm"
                    style={{ background: PALETTE[i] || PALETTE[PALETTE.length - 1] }}
                  />
                  {s.flag && (
                    <span className="text-[12px]" aria-hidden>
                      {s.flag}
                    </span>
                  )}
                  <span
                    className="font-display truncate text-[11px] font-semibold text-slate-800"
                    title={s.name}
                  >
                    {s.name}
                  </span>
                </span>
                <span
                  className="font-mono text-[10.5px] tabular-nums text-slate-600"
                  style={{ fontVariantNumeric: "tabular-nums" }}
                >
                  {s.count.toLocaleString()} · {pct}%
                </span>
              </li>
            );
          })}
        </ul>
      </div>
      {otherExpanded && others.length > 0 && (
        <div className="mt-3 border-t border-slate-100 pt-3">
          <div className="font-display mb-1.5 text-[9px] font-bold uppercase tracking-[0.08em] text-slate-400">
            All {others.length} suppliers in "Other"
          </div>
          <div className="grid max-h-[180px] grid-cols-1 gap-x-3 gap-y-1 overflow-y-auto sm:grid-cols-2">
            {others.map((o) => (
              <div
                key={o.name}
                className="flex items-center justify-between text-[10.5px]"
              >
                <span className="flex min-w-0 items-center gap-1">
                  {o.flag && <span aria-hidden>{o.flag}</span>}
                  <span
                    className="font-display truncate text-slate-700"
                    title={o.name}
                  >
                    {o.name}
                  </span>
                </span>
                <span
                  className="font-mono ml-2 shrink-0 text-slate-500 tabular-nums"
                  style={{ fontVariantNumeric: "tabular-nums" }}
                >
                  {o.count.toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </LitSectionCard>
  );
}

function SupplierTooltip({
  active,
  payload,
  total,
}: {
  active?: boolean;
  payload?: any[];
  total: number;
}) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  const pct = total > 0 ? Math.round((p.count / total) * 100) : 0;
  return (
    <div className="font-display rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-[11px] text-white shadow-lg">
      <div className="flex items-center gap-1.5 font-semibold">
        {p.flag && <span aria-hidden>{p.flag}</span>}
        <span>{p.name}</span>
      </div>
      <div
        className="opacity-90 tabular-nums"
        style={{ fontVariantNumeric: "tabular-nums" }}
      >
        {p.count.toLocaleString()} shipments · {pct}%
      </div>
      {p.name === "Other" && (
        <div className="mt-1 text-[10px] opacity-75">Click to expand list</div>
      )}
    </div>
  );
}

function SkeletonDonut() {
  return (
    <div className="flex items-center justify-center py-4">
      <div className="h-[180px] w-[180px] rounded-full border-[24px] border-slate-100" />
    </div>
  );
}

function Empty() {
  return (
    <div className="px-6 py-8 text-center">
      <p className="font-body text-[11.5px] text-slate-500">
        No supplier aggregates yet — refresh intel to populate.
      </p>
    </div>
  );
}
