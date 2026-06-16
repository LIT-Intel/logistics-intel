// DomesticInlandLegCard — port-of-entry → destination-city rollup, lives in
// the Trade Lanes sub-tab now (migrated from the retired PremiumIntelPanel).

import React from "react";
import { DomesticTransportIcon } from "@/components/icons/ServiceModeIcons";
import ServiceModeChip from "@/components/intel/ServiceModeChip";
import LitSectionCard from "@/components/ui/LitSectionCard";
import { useDomesticInlandLeg } from "@/api/intel";

interface DomesticInlandLegCardProps {
  companyName: string;
}

const tabularStyle: React.CSSProperties = { fontVariantNumeric: "tabular-nums" };

export default function DomesticInlandLegCard({ companyName }: DomesticInlandLegCardProps) {
  const { data, isLoading } = useDomesticInlandLeg(companyName);
  const rows = React.useMemo(() => (data || []).slice(0, 5), [data]);

  const formatLeg = (
    entryPort: string | null,
    city: string | null,
    state: string | null,
  ) => {
    const a = (entryPort || "").trim();
    const b = [city, state].filter(Boolean).join(", ");
    if (a && b && a.toLowerCase() === (city || "").toLowerCase()) return b;
    return `${a || "—"} → ${b || "—"}`;
  };

  const modeChip = (mode: string): "truck" | "rail" | "drayage" => {
    const m = mode.toLowerCase();
    if (m.startsWith("rail")) return "rail";
    if (m.startsWith("inter")) return "drayage";
    return "truck";
  };

  return (
    <LitSectionCard
      title="Domestic transportation"
      sub="Port-of-entry → destination city · est. mode by inland distance"
    >
      {isLoading ? (
        <Skeleton />
      ) : rows.length === 0 ? (
        <Empty />
      ) : (
        <ul className="space-y-2">
          {rows.map((r, i) => (
            <li
              key={`${r.entry_port ?? "-"}-${r.destination_city ?? "-"}-${i}`}
              className="grid items-center gap-2 rounded-md px-1 py-1.5 transition-colors hover:bg-slate-50"
              style={{ gridTemplateColumns: "minmax(0,1fr) auto auto auto" }}
            >
              <span className="font-display truncate text-[12px] font-semibold text-slate-900">
                {formatLeg(r.entry_port, r.destination_city, r.destination_state)}
              </span>
              <ServiceModeChip
                mode={modeChip(r.est_mode || "Truck")}
                size="xs"
                label={r.est_mode || "Truck"}
              />
              <span
                className="font-mono w-16 text-right text-[10.5px] tabular-nums text-slate-500"
                style={tabularStyle}
                title="Approx. inland miles"
              >
                {r.approx_inland_miles == null
                  ? "—"
                  : `${Number(r.approx_inland_miles).toLocaleString(undefined, { maximumFractionDigits: 0 })} mi`}
              </span>
              <span
                className="font-mono w-12 text-right text-[11px] font-bold tabular-nums text-slate-900"
                style={tabularStyle}
              >
                {Number(r.shipment_count).toLocaleString()}
              </span>
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
        <div key={i} className="h-5 w-full rounded bg-slate-100" />
      ))}
    </div>
  );
}

function Empty() {
  return (
    <div className="flex flex-col items-center justify-center py-4 text-center">
      <div className="text-slate-300">
        <DomesticTransportIcon size={20} />
      </div>
      <p className="font-body mt-1.5 text-[11px] text-slate-500">
        No US inland leg activity yet — refresh intel.
      </p>
    </div>
  );
}
