// MxTransborderKpi — compact KPI tile for the Summary sub-tab. Surfaces total
// MX customs declarations + declared value + per-mode counts (truck / rail / air).
// Migrated from PremiumIntelPanel's MxTransborderCard into a tile that lives in
// the Supply Chain → Summary view.

import React from "react";
import { TransborderTruckIcon } from "@/components/icons/ServiceModeIcons";
import ServiceModeChip from "@/components/intel/ServiceModeChip";
import LitSectionCard from "@/components/ui/LitSectionCard";
import { useMxImportActivity } from "@/api/intel";
import { useEntitlements } from "@/hooks/useEntitlements";

interface MxTransborderKpiProps {
  companyName: string;
}

const tabularStyle: React.CSSProperties = { fontVariantNumeric: "tabular-nums" };

export default function MxTransborderKpi({ companyName }: MxTransborderKpiProps) {
  const { data, isLoading } = useMxImportActivity(companyName);
  const { isPlatformAdmin } = useEntitlements();

  const stats = React.useMemo(() => {
    const rows = data || [];
    const byMode = new Map<string, number>();
    let totalValue = 0;
    for (const r of rows) {
      const mode = (r.transport_type || "Unknown").trim();
      byMode.set(mode, (byMode.get(mode) || 0) + 1);
      if (r.value_usd != null) totalValue += Number(r.value_usd);
    }
    const modeBreakdown = Array.from(byMode.entries())
      .map(([mode, count]) => ({ mode, count }))
      .sort((a, b) => b.count - a.count);
    return { total: rows.length, totalValue, modeBreakdown };
  }, [data]);

  // Hide-on-empty: regular users see no clutter for companies without MX
  // customs data. Platform admins still see an actionable "run sync"
  // affordance so they can trigger enrichment.
  if (!isLoading && stats.total === 0) {
    if (!isPlatformAdmin) return null;
    return (
      <LitSectionCard
        title="MX transborder"
        sub="Mexican customs declarations · truck / rail / air"
      >
        <AdminEmpty />
      </LitSectionCard>
    );
  }

  return (
    <LitSectionCard
      title="MX transborder"
      sub="Mexican customs declarations · truck / rail / air"
    >
      {isLoading ? (
        <Skeleton />
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1.5">
            <Metric label="Declarations" value={stats.total.toLocaleString()} />
            {stats.totalValue > 0 && (
              <Metric
                label="Declared value"
                value={`$${stats.totalValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
                small
              />
            )}
          </div>
          {stats.modeBreakdown.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {stats.modeBreakdown.map((b) => {
                const m = b.mode.toLowerCase();
                const mode = m.includes("rail")
                  ? "rail"
                  : m.includes("air")
                    ? "air"
                    : m.includes("sea") || m.includes("ocean")
                      ? "ocean"
                      : "truck";
                return (
                  <ServiceModeChip
                    key={b.mode}
                    mode={mode}
                    size="xs"
                    label={`${b.mode} · ${b.count}`}
                  />
                );
              })}
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
        <TransborderTruckIcon size={20} />
      </div>
      <p className="font-body text-[11px] text-slate-500">
        No MX declarations yet
      </p>
      <span className="font-display inline-flex items-center rounded-md border border-amber-200 bg-amber-50 px-1.5 py-[2px] text-[9.5px] font-semibold uppercase tracking-wide text-amber-700">
        Admin · run sync
      </span>
    </div>
  );
}
