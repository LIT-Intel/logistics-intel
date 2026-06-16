// TopTradePartnersBar — top 5 suppliers by shipment count (from PowerQuery
// aggregates), rendered as a horizontal bar chart with country flag emoji
// on hover. Click a row to surface the supplier in the parent (drives a
// navigation hand-off; consumer wires the callback).

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
import { usePqSupplierAggregates } from "@/api/intel";
import { useEntitlements } from "@/hooks/useEntitlements";
import { useBreakpoint } from "@/hooks/useBreakpoint";

interface TopTradePartnersBarProps {
  companyName: string;
  onPartnerSelect?: (supplierName: string) => void;
}

function countryFlag(country: string | null): string | null {
  if (!country) return null;
  const c = country.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(c)) return null;
  const cp = [...c].map((ch) => 0x1f1e6 + (ch.charCodeAt(0) - 65));
  return String.fromCodePoint(...cp);
}

export default function TopTradePartnersBar({
  companyName,
  onPartnerSelect,
}: TopTradePartnersBarProps) {
  const { data, isLoading } = usePqSupplierAggregates(companyName);
  const { isPlatformAdmin } = useEntitlements();
  const { isMobile } = useBreakpoint();
  // Supplier name truncate — 18 chars on <sm so even on a 360px-wide phone
  // the bar still gets ~60% of the row; 32 on ≥sm. Full name in the tooltip.
  const truncLen = isMobile ? 18 : 32;

  const rows = React.useMemo(() => {
    return (data || [])
      .slice(0, 5)
      .map((r) => ({
        name: r.supplier_name,
        shortName:
          r.supplier_name.length > truncLen
            ? r.supplier_name.slice(0, truncLen - 1) + "…"
            : r.supplier_name,
        count: Number(r.shipment_count) || 0,
        country: r.supplier_country,
        lastShipment: r.last_shipment_date,
        flag: countryFlag(r.supplier_country),
      }))
      .filter((r) => r.count > 0);
  }, [data, truncLen]);

  if (isLoading) {
    return (
      <LitSectionCard title="Top trade partners" sub="By shipment count">
        <SkeletonBars rows={5} />
      </LitSectionCard>
    );
  }

  if (rows.length === 0) {
    // Hide-on-empty for regular users; admins still see an actionable
    // "run sync" affordance so they can trigger enrichment.
    if (!isPlatformAdmin) return null;
    return (
      <LitSectionCard title="Top trade partners" sub="By shipment count">
        <AdminEmpty />
      </LitSectionCard>
    );
  }

  // Height: per-row height scales with bar size + label height; mobile rows
  // are taller so the bars are easier to tap (≥36px effective row).
  const rowHeight = isMobile ? 42 : 48;
  const height = rows.length * rowHeight + 24;
  const yAxisWidth = isMobile ? 130 : 200;
  const barSize = isMobile ? 22 : 30;

  return (
    <LitSectionCard title="Top trade partners" sub="Top 5 suppliers by shipment count">
      <div style={{ width: "100%", height }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={rows}
            layout="vertical"
            margin={{ top: 8, right: 24, left: 8, bottom: 0 }}
          >
            <defs>
              <linearGradient id="topPartnerGrad" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#93C5FD" />
                <stop offset="100%" stopColor="#3B82F6" />
              </linearGradient>
            </defs>
            <XAxis type="number" hide />
            <YAxis
              type="category"
              dataKey="shortName"
              width={yAxisWidth}
              tick={{ fontSize: 11, fill: "#334155" }}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip content={<PartnerTooltip />} cursor={{ fill: "#F1F5F9" }} />
            <Bar
              dataKey="count"
              radius={[0, 4, 4, 0]}
              barSize={barSize}
              fill="url(#topPartnerGrad)"
              isAnimationActive
              animationDuration={700}
              onClick={(d: any) => {
                if (onPartnerSelect && d?.name) onPartnerSelect(d.name);
              }}
              cursor="pointer"
            >
              {rows.map((_, i) => (
                <Cell key={i} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </LitSectionCard>
  );
}

function PartnerTooltip({ active, payload }: { active?: boolean; payload?: any[] }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="font-display max-w-[240px] rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-[11px] text-white shadow-lg">
      <div className="flex items-start gap-2 font-semibold">
        {p.flag && <span className="text-base shrink-0 sm:text-lg" aria-hidden>{p.flag}</span>}
        <span className="break-words">{p.name}</span>
      </div>
      <div
        className="opacity-90 tabular-nums"
        style={{ fontVariantNumeric: "tabular-nums" }}
      >
        {Number(p.count).toLocaleString()} shipments
      </div>
      {p.lastShipment && (
        <div className="text-[10px] opacity-75">
          Last:{" "}
          {new Date(p.lastShipment).toLocaleDateString(undefined, {
            year: "numeric",
            month: "short",
          })}
        </div>
      )}
    </div>
  );
}

function SkeletonBars({ rows }: { rows: number }) {
  return (
    <div className="space-y-2 py-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-2">
          <div className="h-3 w-32 rounded bg-slate-100" />
          <div
            className="h-5 rounded bg-slate-100"
            style={{ width: `${100 - i * 12}%` }}
          />
        </div>
      ))}
    </div>
  );
}

function AdminEmpty() {
  return (
    <div className="flex flex-col items-center justify-center gap-1.5 px-6 py-6 text-center">
      <p className="font-body text-[11.5px] text-slate-500">
        No supplier aggregates yet
      </p>
      <span className="font-display inline-flex items-center rounded-md border border-amber-200 bg-amber-50 px-1.5 py-[2px] text-[9.5px] font-semibold uppercase tracking-wide text-amber-700">
        Admin · run sync
      </span>
    </div>
  );
}
