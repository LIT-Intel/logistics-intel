// HsCodeTopBar — top 10 HS codes (2-digit chapters) by shipment count
// derived from BOL HS fields. Click a bar to set the global selectedHs
// filter on SupplyChainFilterContext so the Lane chart and others can
// scope themselves down.

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
import { useSupplyChainFilter } from "@/components/intel/SupplyChainFilterContext";
import { getBolHs } from "@/lib/bols/helpers";
import { useBreakpoint } from "@/hooks/useBreakpoint";

interface HsCodeTopBarProps {
  recentBols: any[];
  /** Optional enrichment list from lit_pq_company_aggregates.product_descriptions
   *  keyed by HS chapter, used as a secondary label when present. */
  enrichmentByChapter?: Record<string, string>;
}

const PRIMARY = "#3B82F6";
const SELECTED = "#1D4ED8";

export default function HsCodeTopBar({
  recentBols,
  enrichmentByChapter,
}: HsCodeTopBarProps) {
  const { selectedHs, setSelectedHs } = useSupplyChainFilter();
  const { isMobile } = useBreakpoint();
  // Top 6 on <sm so each row has room to read; full top-10 on ≥sm. Label
  // truncates to a short HS chapter form on mobile (e.g. "HS 84" stays as
  // is; longer labels with descriptions get clipped to 8 chars). Full
  // label still surfaces in the Tooltip on tap.
  const topN = isMobile ? 6 : 10;
  const barSize = isMobile ? 22 : 30;

  const rows = React.useMemo(() => {
    const counts = new Map<string, number>();
    for (const bol of recentBols || []) {
      const hs = getBolHs(bol);
      if (!hs || hs === "—") continue;
      const ch = String(hs).slice(0, 2);
      if (!/^\d{2}$/.test(ch)) continue;
      counts.set(ch, (counts.get(ch) || 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([ch, count]) => {
        const fullLabel = `HS ${ch}`;
        return {
          chapter: ch,
          label: fullLabel,
          shortLabel:
            isMobile && fullLabel.length > 8 ? fullLabel.slice(0, 7) + "…" : fullLabel,
          count,
          description: enrichmentByChapter?.[ch] || null,
        };
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, topN);
  }, [recentBols, enrichmentByChapter, topN, isMobile]);

  if (rows.length === 0) {
    return (
      <LitSectionCard title="Top HS chapters" sub="Commodity ranking from BOLs">
        <Empty />
      </LitSectionCard>
    );
  }

  // Per-row height scales with barSize so taller mobile bars still get
  // appropriate vertical room. ResponsiveContainer handles the width side.
  const height = rows.length * (barSize + 10) + 24;

  return (
    <LitSectionCard
      title="Top HS chapters"
      sub={
        selectedHs
          ? `Filtered to HS ${selectedHs} · click to clear`
          : "Click a bar to filter the tab"
      }
      action={
        selectedHs ? (
          <button
            type="button"
            onClick={() => setSelectedHs(null)}
            className="font-display rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-600 transition-colors hover:bg-slate-50"
          >
            Clear filter
          </button>
        ) : undefined
      }
    >
      <div style={{ width: "100%", height }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={rows}
            layout="vertical"
            margin={{ top: 4, right: 16, left: 4, bottom: 0 }}
          >
            <XAxis type="number" hide />
            <YAxis
              type="category"
              dataKey="shortLabel"
              width={isMobile ? 52 : 64}
              tick={{ fontSize: 11, fill: "#334155" }}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip content={<HsTooltip />} cursor={{ fill: "#F1F5F9" }} />
            <Bar
              dataKey="count"
              radius={[0, 4, 4, 0]}
              barSize={barSize}
              isAnimationActive
              animationDuration={700}
              onClick={(d: any) => {
                const ch = d?.chapter as string;
                if (!ch) return;
                setSelectedHs(selectedHs === ch ? null : ch);
              }}
              cursor="pointer"
            >
              {rows.map((r) => (
                <Cell
                  key={r.chapter}
                  fill={selectedHs === r.chapter ? SELECTED : PRIMARY}
                  fillOpacity={
                    selectedHs && selectedHs !== r.chapter ? 0.35 : 1
                  }
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </LitSectionCard>
  );
}

function HsTooltip({ active, payload }: { active?: boolean; payload?: any[] }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="font-display max-w-[240px] rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-[11px] text-white shadow-lg">
      <div className="break-words font-semibold">{p.label}</div>
      {p.description && (
        <div className="text-[10px] opacity-75">{p.description}</div>
      )}
      <div
        className="opacity-90 tabular-nums"
        style={{ fontVariantNumeric: "tabular-nums" }}
      >
        {Number(p.count).toLocaleString()} shipments
      </div>
    </div>
  );
}

function Empty() {
  return (
    <div className="px-6 py-8 text-center">
      <p className="font-body text-[11.5px] text-slate-500">
        No HS code data yet — refresh intel to populate.
      </p>
    </div>
  );
}
