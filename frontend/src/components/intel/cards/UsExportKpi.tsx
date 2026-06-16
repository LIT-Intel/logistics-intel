// UsExportKpi — compact KPI tile for the Summary sub-tab: outbound BOLs from
// US ports + total TEU + top destination countries.
//
// Visibility (smart-render, 2026-06-16):
//   - Hidden entirely when there are no US export BOLs for the company. A
//     pure US importer (e.g. Walmart) never has rows here and shouldn't see
//     an empty tile. Same rule applies to admins — the sync entry point is
//     consolidated on Top Trade Partners, not duplicated per-card.

import React from "react";
import LitSectionCard from "@/components/ui/LitSectionCard";
import { useUsExportActivity } from "@/api/intel";

interface UsExportKpiProps {
  companyName: string;
}

const tabularStyle: React.CSSProperties = { fontVariantNumeric: "tabular-nums" };

export default function UsExportKpi({ companyName }: UsExportKpiProps) {
  const { data, isLoading } = useUsExportActivity(companyName);

  const stats = React.useMemo(() => {
    const rows = data || [];
    let totalTeu = 0;
    const destCount = new Map<string, number>();
    for (const r of rows) {
      if (r.teu != null) totalTeu += Number(r.teu);
      const dest = r.consignee_country || "Unknown";
      destCount.set(dest, (destCount.get(dest) || 0) + 1);
    }
    return {
      total: rows.length,
      totalTeu,
      topDest: Array.from(destCount.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 4),
    };
  }, [data]);

  // Smart-render: hide entirely on empty. See header comment.
  if (!isLoading && stats.total === 0) return null;

  return (
    <LitSectionCard title="US export activity" sub="Outbound BOLs from US ports">
      {isLoading ? (
        <Skeleton />
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1.5">
            <Metric label="BOLs" value={stats.total.toLocaleString()} />
            {stats.totalTeu > 0 && (
              <Metric
                label="TEU"
                value={stats.totalTeu.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                small
              />
            )}
          </div>
          {stats.topDest.length > 0 && (
            <div>
              <div className="font-display mb-1 text-[9px] font-bold uppercase tracking-[0.1em] text-slate-400">
                Top destinations
              </div>
              <div className="flex flex-wrap gap-1.5">
                {stats.topDest.map(([country, count]) => (
                  <span
                    key={country}
                    className="font-mono inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10.5px] tabular-nums text-slate-700"
                    style={tabularStyle}
                  >
                    <span className="font-display font-semibold text-slate-900">
                      {country}
                    </span>
                    <span className="text-slate-400">·</span>
                    <span>{count}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </LitSectionCard>
  );
}

function Metric({ label, value, small }: { label: string; value: string; small?: boolean }) {
  return (
    <div>
      <div className="font-display text-[9px] font-bold uppercase tracking-[0.1em] text-slate-400">
        {label}
      </div>
      <div
        className={[
          "font-mono mt-0.5 font-bold leading-none text-slate-900 tabular-nums",
          small ? "text-[18px]" : "text-[22px]",
        ].join(" ")}
        style={tabularStyle}
      >
        {value}
      </div>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="space-y-2 py-1">
      <div className="h-6 w-24 rounded bg-slate-100" />
      <div className="h-4 w-40 rounded bg-slate-100" />
    </div>
  );
}
