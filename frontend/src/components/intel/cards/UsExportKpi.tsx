// UsExportKpi — compact KPI tile for the Summary sub-tab: outbound BOLs from
// US ports + total TEU + top destination countries.

import React from "react";
import { OceanIcon } from "@/components/icons/ServiceModeIcons";
import LitSectionCard from "@/components/ui/LitSectionCard";
import { useUsExportActivity } from "@/api/intel";
import { useEntitlements } from "@/hooks/useEntitlements";

interface UsExportKpiProps {
  companyName: string;
}

const tabularStyle: React.CSSProperties = { fontVariantNumeric: "tabular-nums" };

export default function UsExportKpi({ companyName }: UsExportKpiProps) {
  const { data, isLoading } = useUsExportActivity(companyName);
  const { isPlatformAdmin } = useEntitlements();

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

  // Hide-on-empty: regular users see no clutter for companies without US
  // export data. Platform admins still see an actionable "run sync"
  // affordance so they can trigger enrichment.
  if (!isLoading && stats.total === 0) {
    if (!isPlatformAdmin) return null;
    return (
      <LitSectionCard title="US export activity" sub="Outbound BOLs from US ports">
        <AdminEmpty />
      </LitSectionCard>
    );
  }

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

function AdminEmpty() {
  return (
    <div className="flex flex-col items-center justify-center gap-1.5 py-3 text-center">
      <div className="text-slate-300">
        <OceanIcon size={20} />
      </div>
      <p className="font-body text-[11px] text-slate-500">
        No US export BOLs yet
      </p>
      <span className="font-display inline-flex items-center rounded-md border border-amber-200 bg-amber-50 px-1.5 py-[2px] text-[9.5px] font-semibold uppercase tracking-wide text-amber-700">
        Admin · run sync
      </span>
    </div>
  );
}
