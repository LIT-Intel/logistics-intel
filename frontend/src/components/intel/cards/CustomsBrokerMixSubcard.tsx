// CustomsBrokerMixSubcard — "Service providers" sub-card under the Suppliers
// tab. Derives broker rollup from MX import declarations (broker name is
// part of every customs filing). Hides itself when no broker data on file.

import React from "react";
import { CustomsBrokerIcon } from "@/components/icons/ServiceModeIcons";
import LitSectionCard from "@/components/ui/LitSectionCard";
import { useMxImportActivity } from "@/api/intel";

interface CustomsBrokerMixSubcardProps {
  companyName: string;
}

const tabularStyle: React.CSSProperties = { fontVariantNumeric: "tabular-nums" };

export default function CustomsBrokerMixSubcard({
  companyName,
}: CustomsBrokerMixSubcardProps) {
  const { data, isLoading } = useMxImportActivity(companyName);

  const brokerRows = React.useMemo(() => {
    const map = new Map<string, number>();
    for (const r of data || []) {
      const name = (r.customs_broker_name || "").trim();
      if (!name) continue;
      map.set(name, (map.get(name) || 0) + 1);
    }
    const total = Array.from(map.values()).reduce((s, n) => s + n, 0);
    return Array.from(map.entries())
      .map(([name, count]) => ({
        name,
        count,
        share: total > 0 ? Math.round((count / total) * 100) : 0,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);
  }, [data]);

  if (!isLoading && brokerRows.length === 0) return null;

  return (
    <LitSectionCard
      title="Service providers · customs brokers"
      sub="Brokers handling this importer's filings"
    >
      {isLoading ? (
        <Skeleton />
      ) : (
        <ul className="space-y-2">
          {brokerRows.map((b) => (
            <li
              key={b.name}
              className="flex items-center gap-3 rounded-md px-1 py-1 transition-colors hover:bg-slate-50"
            >
              <div className="min-w-0 flex-1">
                <div className="font-display flex items-center gap-1.5 truncate text-[12px] font-semibold text-slate-900">
                  <CustomsBrokerIcon size={12} className="shrink-0 text-blue-500" />
                  <span className="truncate">{b.name}</span>
                </div>
                <div className="mt-1 h-1 overflow-hidden rounded bg-slate-100">
                  <div
                    className="h-full rounded bg-blue-500 transition-[width] duration-500 ease-out"
                    style={{ width: `${Math.max(2, b.share)}%` }}
                  />
                </div>
              </div>
              <div
                className="font-mono shrink-0 text-right text-[11px] tabular-nums text-slate-700"
                style={tabularStyle}
              >
                <div className="font-bold text-slate-900">{b.count}</div>
                <div className="text-slate-500">{b.share}%</div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </LitSectionCard>
  );
}

function Skeleton() {
  return (
    <div className="space-y-1.5 py-1">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="h-6 w-full rounded bg-slate-100" />
      ))}
    </div>
  );
}
