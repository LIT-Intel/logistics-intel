// ServiceModeDonut — donut chart of shipment distribution across the 7
// service modes. Hover expands a slice + tooltip; click drives the
// SupplyChainFilterContext.activeMode (so clicking the Ocean slice filters
// the entire tab to ocean).
//
// Data sources: derived from MX import declarations + container profile +
// domestic inland leg rows (passed via props from CDPSupplyChain so this
// component stays pure / testable).

import React, { useEffect, useMemo, useState } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Sector, Tooltip } from "recharts";
import LitSectionCard from "@/components/ui/LitSectionCard";
import {
  SERVICE_MODE_ICON_MAP,
  type ServiceMode,
} from "@/components/icons/ServiceModeIcons";
import { useSupplyChainFilter } from "@/components/intel/SupplyChainFilterContext";

// Brand palette — matches ServiceModeChip's anchors. NO rainbow.
const MODE_COLOR: Record<ServiceMode, string> = {
  ocean: "#3B82F6", // blue-500
  air: "#6366F1", // indigo-500
  truck: "#F59E0B", // amber-500
  rail: "#64748B", // slate-500
  drayage: "#10B981", // emerald-500
  broker: "#60A5FA", // blue-400 (broker = lighter blue, outline-tone parity)
  domestic: "#475569", // slate-600
};

const MODE_LABEL: Record<ServiceMode, string> = {
  ocean: "Ocean",
  air: "Air",
  truck: "Truck",
  rail: "Rail",
  drayage: "Drayage",
  broker: "Broker",
  domestic: "Domestic",
};

export type ServiceModeDonutInput = {
  ocean: number;
  air: number;
  truck: number;
  rail: number;
  drayage: number;
  broker: number;
  domestic: number;
};

type Slice = { mode: ServiceMode; value: number; color: string };

function useCountUp(target: number, duration = 600): number {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (target <= 0) {
      setV(0);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
      setV(Math.round(target * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return v;
}

const renderActiveSlice = (props: any) => {
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

export default function ServiceModeDonut({
  counts,
  loading = false,
  embedded = false,
}: {
  counts: ServiceModeDonutInput;
  loading?: boolean;
  /** When true, render only the donut + legend (no LitSectionCard wrapper).
   *  Used to embed the donut inside another card (e.g. Cadence & Modal Mix). */
  embedded?: boolean;
}) {
  const { activeMode, setActiveMode } = useSupplyChainFilter();
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const slices: Slice[] = useMemo(() => {
    const order: ServiceMode[] = [
      "ocean",
      "air",
      "truck",
      "rail",
      "drayage",
      "broker",
      "domestic",
    ];
    return order
      .map((m) => ({ mode: m, value: counts[m] || 0, color: MODE_COLOR[m] }))
      .filter((s) => s.value > 0);
  }, [counts]);

  const total = slices.reduce((s, x) => s + x.value, 0);
  const animated = useCountUp(total);

  // External filter sync — when activeMode changes via filter chip, sync
  // the visual active slice. -1 means none selected externally.
  const externalActiveIdx = useMemo(() => {
    if (!activeMode) return -1;
    return slices.findIndex((s) => s.mode === activeMode);
  }, [activeMode, slices]);

  const activeIdx = hoverIdx ?? (externalActiveIdx >= 0 ? externalActiveIdx : null);

  if (loading) {
    return embedded ? (
      <SkeletonDonut />
    ) : (
      <LitSectionCard title="Service mode distribution" sub="Shipments by leg type">
        <SkeletonDonut />
      </LitSectionCard>
    );
  }

  if (total === 0) {
    return embedded ? (
      <EmptyDonut />
    ) : (
      <LitSectionCard title="Service mode distribution" sub="Shipments by leg type">
        <EmptyDonut />
      </LitSectionCard>
    );
  }

  const body = (
    <div className="flex flex-col items-center gap-3 md:flex-row md:items-start md:gap-6">
        {/* Responsive donut wrapper — heights scale up at sm/md/lg so the
            chart stays legible on phones without dominating the screen. */}
        <div className="relative aspect-square w-full max-w-[260px] sm:max-w-[220px] md:max-w-[260px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={slices}
                dataKey="value"
                nameKey="mode"
                innerRadius="60%"
                outerRadius="90%"
                paddingAngle={2}
                stroke="none"
                activeIndex={activeIdx ?? undefined}
                activeShape={renderActiveSlice}
                onMouseEnter={(_d, i) => setHoverIdx(i)}
                onMouseLeave={() => setHoverIdx(null)}
                onClick={(d: any) => {
                  const mode = d?.mode as ServiceMode | undefined;
                  if (!mode) return;
                  setActiveMode(activeMode === mode ? null : mode);
                }}
                isAnimationActive
                animationDuration={800}
              >
                {slices.map((s, i) => (
                  <Cell key={i} fill={s.color} cursor="pointer" />
                ))}
              </Pie>
              <Tooltip content={<DonutTooltip total={total} />} />
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <div
              className="font-display text-xl font-bold leading-none text-slate-900 tabular-nums sm:text-2xl md:text-[26px]"
              style={{ fontVariantNumeric: "tabular-nums" }}
            >
              {animated.toLocaleString()}
            </div>
            <div className="font-display mt-1 text-[9px] font-semibold uppercase tracking-wider text-slate-500">
              Shipments
            </div>
          </div>
        </div>
        <div className="flex flex-1 flex-wrap gap-1.5">
          {slices.map((s, i) => {
            const Icon = SERVICE_MODE_ICON_MAP[s.mode];
            const isActive = activeMode === s.mode || hoverIdx === i;
            return (
              <button
                key={s.mode}
                type="button"
                onClick={() =>
                  setActiveMode(activeMode === s.mode ? null : s.mode)
                }
                onMouseEnter={() => setHoverIdx(i)}
                onMouseLeave={() => setHoverIdx(null)}
                className={[
                  "font-display inline-flex items-center gap-1.5 rounded-md border bg-white px-2 py-1 text-[10.5px] font-semibold transition-all",
                  isActive
                    ? "border-slate-300 shadow-sm scale-[1.02]"
                    : "border-slate-200 hover:shadow-sm",
                ].join(" ")}
                style={{ color: s.color }}
              >
                <Icon size={12} />
                <span>{MODE_LABEL[s.mode]}</span>
                <span
                  className="font-mono ml-1 text-slate-500 tabular-nums"
                  style={{ fontVariantNumeric: "tabular-nums" }}
                >
                  {s.value.toLocaleString()} ·{" "}
                  {Math.round((s.value / total) * 100)}%
                </span>
              </button>
            );
          })}
        </div>
      </div>
  );

  if (embedded) return body;

  return (
    <LitSectionCard
      title="Service mode distribution"
      sub="Click a slice to filter the tab"
    >
      {body}
    </LitSectionCard>
  );
}

function DonutTooltip({
  active,
  payload,
  total,
}: {
  active?: boolean;
  payload?: any[];
  total: number;
}) {
  if (!active || !payload?.length) return null;
  const p = payload[0];
  const mode = p?.payload?.mode as ServiceMode;
  const value = Number(p?.value) || 0;
  const share = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className="font-display rounded-md border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-[11px] text-white shadow-lg">
      <div className="font-semibold">{MODE_LABEL[mode] || mode}</div>
      <div
        className="opacity-90 tabular-nums"
        style={{ fontVariantNumeric: "tabular-nums" }}
      >
        {value.toLocaleString()} shipments · {share}%
      </div>
    </div>
  );
}

function SkeletonDonut() {
  return (
    <div className="flex items-center justify-center py-4">
      <div className="relative h-[180px] w-[180px]">
        <div className="absolute inset-0 rounded-full border-[24px] border-slate-100" />
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="font-display text-[9px] font-semibold uppercase tracking-wider text-slate-300">
            Loading
          </span>
        </div>
      </div>
    </div>
  );
}

function EmptyDonut() {
  return (
    <div className="flex flex-col items-center justify-center py-8 text-center">
      <div className="text-slate-300">
        {React.createElement(SERVICE_MODE_ICON_MAP.ocean, { size: 24 })}
      </div>
      <p className="font-body mt-2 max-w-[280px] text-[11.5px] text-slate-500">
        No service-mode data yet — refresh intel to populate.
      </p>
    </div>
  );
}
