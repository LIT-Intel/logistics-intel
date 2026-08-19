/**
 * LaneIntelligenceCard — SHARED, purely presentational lane-intelligence panel.
 *
 * Renders BOL-level detail for a single lane (carrier-mix donut, transport
 * modes, top commodities, FCL/LCL split, origin ports, and a stat row) from a
 * resolved `LaneShipmentIntel` object. Each section is data-driven: it renders
 * ONLY when its array/value is present — no fake pies, no "0" placeholders.
 *
 * This component does NO data fetching. Callers own the hook:
 *   - Company profile passes `useLaneShipmentIntel(companyId, origin, dest)`.
 *   - Workspace dashboard passes `useWorkspaceLaneIntel(origin, dest)` and
 *     `scope="workspace"` so the header can read "across N companies" from
 *     `totals.n_companies`.
 *
 * Extracted from CDPSupplyChain.tsx so the profile map and the dashboard
 * workspace-lanes map share one identical presentation.
 */
import type { ReactNode } from "react";
import { Ship, Anchor, Package } from "lucide-react";
import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import type { LaneShipmentIntel } from "@/api/laneIntel";

/** Tasteful ~8-hex palette (blues → teals → greens → ambers) for pie slices. */
const LANE_INTEL_PALETTE = [
  "#2563EB", // brand blue
  "#0EA5E9",
  "#06B6D4",
  "#14B8A6",
  "#10B981",
  "#84CC16",
  "#F59E0B",
  "#F97316",
];

/** kg → tonnes with a compact label, e.g. 376004 → "376 t". */
function formatWeightTonnes(kg: number | null | undefined): string | null {
  if (kg == null || !Number.isFinite(kg) || kg <= 0) return null;
  const t = kg / 1000;
  if (t >= 1000)
    return `${(t / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 })}k t`;
  if (t >= 10) return `${Math.round(t).toLocaleString()} t`;
  return `${t.toLocaleString(undefined, { maximumFractionDigits: 1 })} t`;
}

function LaneIntelStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="font-mono text-[13px] font-bold leading-none text-slate-900">
        {value}
      </div>
      <div className="font-body mt-1 text-[9px] font-semibold uppercase tracking-wide text-slate-400">
        {label}
      </div>
    </div>
  );
}

function LaneIntelSectionTitle({ children }: { children: ReactNode }) {
  return (
    <div className="font-display mb-1.5 text-[11px] font-bold text-slate-900">
      {children}
    </div>
  );
}

export interface LaneIntelligenceCardProps {
  /** Resolved lane-intel object (or null). This component does NOT fetch. */
  data: LaneShipmentIntel | null;
  isLoading?: boolean;
  /** 'company' = single account (default) · 'workspace' = aggregated across
   *  every saved company, enabling the "across N companies" subtitle. */
  scope?: "company" | "workspace";
  /** Optional heading rendered above the sections. */
  title?: ReactNode;
  /** Optional subtitle. When omitted and scope==='workspace', a default
   *  "across N companies" line is derived from totals.n_companies. */
  subtitle?: ReactNode;
}

/**
 * Purely presentational. Renders nothing (null) when there's no data; renders a
 * subtle line while loading or when the lane has no BOL-level detail yet.
 */
export default function LaneIntelligenceCard({
  data,
  isLoading = false,
  scope = "company",
  title,
  subtitle,
}: LaneIntelligenceCardProps) {
  if (isLoading) {
    return (
      <div className="font-body text-[10px] text-slate-400">
        Loading lane intelligence…
      </div>
    );
  }

  const intel = data;
  if (!intel) return null;

  const t = intel.totals;

  // No BOL-level detail for this lane yet — subtle line, no empty charts.
  if ((t?.bols ?? 0) <= 0) {
    return (
      <div className="font-body text-[10px] text-slate-400">
        No shipment-level detail for this lane yet.
      </div>
    );
  }

  // Data-driven guards — build a stat row only from present values.
  const stats: { label: string; value: string }[] = [];
  if (t.bols > 0) stats.push({ label: "BOLs", value: t.bols.toLocaleString() });
  if (t.teu != null && t.teu > 0)
    stats.push({ label: "TEU", value: Math.round(t.teu).toLocaleString() });
  const weight = formatWeightTonnes(t.weight_kg);
  if (weight) stats.push({ label: "Weight", value: weight });
  if (t.containers != null && t.containers > 0)
    stats.push({ label: "Containers", value: t.containers.toLocaleString() });
  if (t.spend_usd != null && t.spend_usd > 0)
    stats.push({
      label: "Est. spend",
      value: `$${t.spend_usd.toLocaleString()}`,
    });

  const carriers = intel.carriers.filter((c) => c.bols > 0).slice(0, 8);
  const modes = intel.modes.filter((m) => m.bols > 0);
  const commodities = intel.commodities.filter((c) => c.bols > 0);
  const loadTypes = intel.load_types.filter((l) => l.bols > 0);
  const originPorts = intel.origin_ports.filter((p) => p.bols > 0);
  const commodityMax = Math.max(1, ...commodities.map((c) => c.bols));
  const loadTotal = loadTypes.reduce((s, l) => s + l.bols, 0);

  // Workspace scope can show "across N companies" when the RPC supplies it.
  const derivedSubtitle =
    subtitle ??
    (scope === "workspace" && t.n_companies != null && t.n_companies > 0
      ? `Across ${t.n_companies.toLocaleString()} ${
          t.n_companies === 1 ? "company" : "companies"
        }`
      : null);

  return (
    <div className="space-y-3">
      {(title || derivedSubtitle) && (
        <div>
          {title && (
            <div className="font-display text-[12px] font-bold text-slate-900">
              {title}
            </div>
          )}
          {derivedSubtitle && (
            <div className="font-body text-[10px] text-slate-500">
              {derivedSubtitle}
            </div>
          )}
        </div>
      )}

      {/* Stat row — only present figures. */}
      {stats.length > 0 && (
        <div className="grid grid-cols-3 gap-x-3 gap-y-3 sm:grid-cols-5">
          {stats.map((s) => (
            <LaneIntelStat key={s.label} label={s.label} value={s.value} />
          ))}
        </div>
      )}

      {/* Carrier mix — donut + name/bol list. */}
      {carriers.length > 0 && (
        <div className="border-t border-slate-100 pt-2.5">
          <LaneIntelSectionTitle>
            <span className="inline-flex items-center gap-1">
              <Ship className="h-3 w-3 text-blue-600" /> Carrier mix
            </span>
          </LaneIntelSectionTitle>
          <div className="flex items-center gap-3">
            <div className="h-24 w-24 shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={carriers}
                    dataKey="bols"
                    nameKey="name"
                    innerRadius={26}
                    outerRadius={44}
                    paddingAngle={1}
                    stroke="none"
                  >
                    {carriers.map((_, i) => (
                      <Cell
                        key={i}
                        fill={LANE_INTEL_PALETTE[i % LANE_INTEL_PALETTE.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(v: any, n: any) => [`${v} BOLs`, n]}
                    contentStyle={{ fontSize: 11 }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="min-w-0 flex-1 space-y-0.5">
              {carriers.map((c, i) => (
                <div key={c.name} className="flex items-center gap-1.5">
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{
                      background:
                        LANE_INTEL_PALETTE[i % LANE_INTEL_PALETTE.length],
                    }}
                  />
                  <span className="font-body min-w-0 flex-1 truncate text-[10px] text-slate-600">
                    {c.name}
                  </span>
                  <span className="font-mono shrink-0 text-[10px] font-semibold text-slate-500">
                    {c.bols}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Transport mode — segmented bar, only if present. */}
      {modes.length > 0 && (
        <div className="border-t border-slate-100 pt-2.5">
          <LaneIntelSectionTitle>Transport mode</LaneIntelSectionTitle>
          <div className="flex flex-wrap gap-1.5">
            {modes.map((m, i) => (
              <span
                key={m.name}
                className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-600"
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{
                    background:
                      LANE_INTEL_PALETTE[i % LANE_INTEL_PALETTE.length],
                  }}
                />
                {m.name}
                <span className="font-mono text-slate-400">{m.bols}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Top commodities — horizontal bar list, only if present. */}
      {commodities.length > 0 && (
        <div className="border-t border-slate-100 pt-2.5">
          <LaneIntelSectionTitle>
            <span className="inline-flex items-center gap-1">
              <Package className="h-3 w-3 text-blue-600" /> Top commodities
            </span>
          </LaneIntelSectionTitle>
          <div className="space-y-1.5">
            {commodities.map((c) => (
              <div key={c.code + c.description}>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-body min-w-0 flex-1 truncate text-[10px] text-slate-600">
                    {c.code ? (
                      <span className="font-mono mr-1 font-semibold text-slate-500">
                        {c.code}
                      </span>
                    ) : null}
                    {c.description}
                  </span>
                  <span className="font-mono shrink-0 text-[10px] font-semibold text-slate-500">
                    {c.bols}
                  </span>
                </div>
                <div className="mt-0.5 h-1 w-full overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-blue-600"
                    style={{ width: `${(c.bols / commodityMax) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* FCL/LCL split — stacked bar + pills. */}
      {loadTypes.length > 0 && loadTotal > 0 && (
        <div className="border-t border-slate-100 pt-2.5">
          <LaneIntelSectionTitle>FCL / LCL split</LaneIntelSectionTitle>
          <div className="flex h-2 w-full overflow-hidden rounded-full bg-slate-100">
            {loadTypes.map((l, i) => (
              <div
                key={l.name}
                className="h-full"
                style={{
                  width: `${(l.bols / loadTotal) * 100}%`,
                  background: LANE_INTEL_PALETTE[i % LANE_INTEL_PALETTE.length],
                }}
              />
            ))}
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {loadTypes.map((l, i) => (
              <span
                key={l.name}
                className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-600"
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{
                    background:
                      LANE_INTEL_PALETTE[i % LANE_INTEL_PALETTE.length],
                  }}
                />
                {l.name}
                <span className="font-mono text-slate-400">{l.bols}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Top origin ports — compact list, only if present. */}
      {originPorts.length > 0 && (
        <div className="border-t border-slate-100 pt-2.5">
          <LaneIntelSectionTitle>
            <span className="inline-flex items-center gap-1">
              <Anchor className="h-3 w-3 text-blue-600" /> Top origin ports
            </span>
          </LaneIntelSectionTitle>
          <div className="space-y-0.5">
            {originPorts.map((p) => (
              <div key={p.name} className="flex items-center gap-1.5">
                <span className="h-1 w-1 shrink-0 rounded-full bg-blue-500/70" />
                <span className="font-body min-w-0 flex-1 truncate text-[10px] text-slate-600">
                  {p.name}
                </span>
                <span className="font-mono shrink-0 text-[10px] font-semibold text-slate-500">
                  {p.bols}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
