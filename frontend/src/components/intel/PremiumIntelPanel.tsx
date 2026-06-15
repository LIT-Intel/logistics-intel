// PremiumIntelPanel — single-purpose company-profile panel that surfaces
// the LIT coverage edge: MX transborder, US export, customs broker mix,
// per-lane carrier mix, per-lane YoY trend. Each sub-section is in its
// own card with a service-mode icon in the header so the user can scan
// the panel and know what kind of leg they're looking at without reading.
//
// Loading state: skeleton WITH the service-mode icon visible (no anonymous
// skeleton boxes — Rams: the chrome must tell the user something even
// while waiting). Empty state shows the same icon + a "refresh intel"
// affordance.

import React from "react";
import {
  useDomesticInlandLeg,
  useLaneCarrierMix,
  useLaneYoyTrend,
  useMxImportActivity,
  useUsExportActivity,
  type LaneCarrierMixRow,
} from "@/api/intel";
import {
  TransborderTruckIcon,
  OceanIcon,
  CustomsBrokerIcon,
  AirCargoIcon,
  TransborderRailIcon,
  DomesticTransportIcon,
} from "@/components/icons/ServiceModeIcons";
import ServiceModeChip from "@/components/intel/ServiceModeChip";

const tabularStyle: React.CSSProperties = {
  fontVariantNumeric: "tabular-nums",
};

interface PremiumIntelPanelProps {
  companyName: string;
  title?: string;
  subtitle?: string;
  showPremiumBadge?: boolean;
}

// ── Card primitives ─────────────────────────────────────────────────────

interface IntelCardProps {
  icon: React.ReactNode;
  title: string;
  sub?: string;
  rightAdornment?: React.ReactNode;
  children: React.ReactNode;
}

function IntelCard({ icon, title, sub, rightAdornment, children }: IntelCardProps) {
  return (
    <section
      className="overflow-hidden rounded-xl border border-slate-200 bg-white antialiased"
      style={{ boxShadow: "0 1px 2px rgba(0,0,0,0.03)" }}
    >
      <header className="flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-3">
        <div className="flex min-w-0 items-start gap-2.5">
          <div className="mt-[1px] flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-slate-50 text-slate-600 ring-1 ring-inset ring-slate-200">
            {icon}
          </div>
          <div className="min-w-0">
            <h3 className="font-display truncate text-[13px] font-bold tracking-tight text-slate-900">
              {title}
            </h3>
            {sub && (
              <p className="font-body mt-0.5 truncate text-[11px] text-slate-500">{sub}</p>
            )}
          </div>
        </div>
        {rightAdornment && (
          <div className="shrink-0">{rightAdornment}</div>
        )}
      </header>
      <div className="px-4 py-3.5">{children}</div>
    </section>
  );
}

function SkeletonRows({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="h-6 animate-pulse rounded bg-slate-100/80" />
      ))}
    </div>
  );
}

function EmptyState({
  icon,
  message,
}: {
  icon: React.ReactNode;
  message: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-6 text-center">
      <div className="text-slate-300">{icon}</div>
      <p className="font-body mt-2 max-w-[280px] text-[11.5px] text-slate-500">
        {message}
      </p>
    </div>
  );
}

// ── MX Transborder card ─────────────────────────────────────────────────

function MxTransborderCard({ companyName }: { companyName: string }) {
  const { data, isLoading } = useMxImportActivity(companyName);

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
    return {
      total: rows.length,
      totalValue,
      modeBreakdown,
      latestDate: rows[0]?.declaration_date ?? null,
    };
  }, [data]);

  return (
    <IntelCard
      icon={<TransborderTruckIcon size={16} title="Transborder truck" />}
      title="MX Transborder Activity"
      sub="Customs declarations — truck / rail / air"
    >
      {isLoading ? (
        <SkeletonRows count={3} />
      ) : stats.total === 0 ? (
        <EmptyState
          icon={<TransborderTruckIcon size={24} />}
          message="No MX transborder declarations recorded — refresh intel to backfill from ImportYeti PowerQuery."
        />
      ) : (
        <div>
          <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
            <div>
              <div className="font-display text-[9px] font-bold uppercase tracking-[0.1em] text-slate-400">
                Declarations
              </div>
              <div
                className="font-mono mt-0.5 text-[22px] font-bold leading-none text-slate-900"
                style={tabularStyle}
              >
                {stats.total.toLocaleString()}
              </div>
            </div>
            {stats.totalValue > 0 && (
              <div>
                <div className="font-display text-[9px] font-bold uppercase tracking-[0.1em] text-slate-400">
                  Total declared value
                </div>
                <div
                  className="font-mono mt-0.5 text-[18px] font-bold leading-none text-slate-900"
                  style={tabularStyle}
                >
                  ${stats.totalValue.toLocaleString(undefined, {
                    maximumFractionDigits: 0,
                  })}
                </div>
              </div>
            )}
          </div>
          {stats.modeBreakdown.length > 0 && (
            <div className="mt-3.5 flex flex-wrap gap-1.5">
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
    </IntelCard>
  );
}

// ── US Export card ──────────────────────────────────────────────────────

function UsExportCard({ companyName }: { companyName: string }) {
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
    const topDest = Array.from(destCount.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4);
    return { total: rows.length, totalTeu, topDest };
  }, [data]);

  return (
    <IntelCard
      icon={<OceanIcon size={16} title="US export ocean" />}
      title="US Export Activity"
      sub="Outbound BOLs from US ports"
    >
      {isLoading ? (
        <SkeletonRows count={3} />
      ) : stats.total === 0 ? (
        <EmptyState
          icon={<OceanIcon size={24} />}
          message="No US export BOLs recorded for this shipper — refresh intel to pull from the export feed."
        />
      ) : (
        <div>
          <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
            <div>
              <div className="font-display text-[9px] font-bold uppercase tracking-[0.1em] text-slate-400">
                BOLs
              </div>
              <div
                className="font-mono mt-0.5 text-[22px] font-bold leading-none text-slate-900"
                style={tabularStyle}
              >
                {stats.total.toLocaleString()}
              </div>
            </div>
            {stats.totalTeu > 0 && (
              <div>
                <div className="font-display text-[9px] font-bold uppercase tracking-[0.1em] text-slate-400">
                  Total TEU
                </div>
                <div
                  className="font-mono mt-0.5 text-[18px] font-bold leading-none text-slate-900"
                  style={tabularStyle}
                >
                  {stats.totalTeu.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </div>
              </div>
            )}
          </div>
          {stats.topDest.length > 0 && (
            <div className="mt-3.5">
              <div className="font-display text-[9px] font-bold uppercase tracking-[0.1em] text-slate-400">
                Top destinations
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {stats.topDest.map(([country, count]) => (
                  <span
                    key={country}
                    className="font-mono inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10.5px] text-slate-700"
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
    </IntelCard>
  );
}

// ── Domestic inland leg card ────────────────────────────────────────────

function DomesticInlandLegCard({ companyName }: { companyName: string }) {
  const { data, isLoading } = useDomesticInlandLeg(companyName);

  // Top 5 (entry_port -> destination_city) rows by shipment count. Mode chip
  // uses the existing service-mode palette: rail for "Rail", drayage for the
  // intermodal mid-range (short port-area + a rail link), truck for short
  // hauls. This keeps the chip family coherent without inventing new modes.
  const rows = React.useMemo(() => (data || []).slice(0, 5), [data]);

  // ImportYeti's US-import feed often lists the destination_port as the
  // inland city itself (Atlanta -> Atlanta), so we de-emphasize the visual
  // separation when the two strings match. Still surface the data honestly.
  const formatLeg = (entryPort: string | null, city: string | null, state: string | null) => {
    const a = (entryPort || "").trim();
    const b = [city, state].filter(Boolean).join(", ");
    if (a && b && a.toLowerCase() === (city || "").toLowerCase()) {
      return `${b}`; // same name — collapse to a single destination
    }
    return `${a || "—"} → ${b || "—"}`;
  };

  // Map est_mode -> ServiceModeChip key. Intermodal is the only mode in
  // this card that doesn't have a 1:1 service-mode chip; "drayage" reads
  // closest semantically (short rail + port handoff) and keeps the chip
  // palette consistent.
  const modeChip = (mode: string): "truck" | "rail" | "drayage" => {
    const m = mode.toLowerCase();
    if (m.startsWith("rail")) return "rail";
    if (m.startsWith("inter")) return "drayage";
    return "truck";
  };

  return (
    <IntelCard
      icon={<DomesticTransportIcon size={16} title="Domestic transportation" />}
      title="Domestic transportation"
      sub="Port-of-entry → destination city. Est. mode inferred from inland distance."
    >
      {isLoading ? (
        <SkeletonRows count={3} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<DomesticTransportIcon size={24} />}
          message="No US inland leg activity yet — refresh intel to populate the port-to-destination rollup."
        />
      ) : (
        <ul className="space-y-2">
          {rows.map((r, i) => (
            <li
              key={`${r.entry_port ?? "-"}-${r.destination_city ?? "-"}-${i}`}
              className="grid items-center gap-2 rounded-md px-1 py-1.5 transition-colors hover:bg-slate-50"
              style={{ gridTemplateColumns: "minmax(0,1fr) auto auto auto" }}
            >
              <div className="min-w-0">
                <div className="font-display truncate text-[12px] font-semibold text-slate-900">
                  {formatLeg(r.entry_port, r.destination_city, r.destination_state)}
                </div>
              </div>
              <ServiceModeChip
                mode={modeChip(r.est_mode || "Truck")}
                size="xs"
                label={r.est_mode || "Truck"}
              />
              <span
                className="font-mono w-16 text-right text-[10.5px] tabular-nums text-slate-500"
                style={tabularStyle}
                title="Approx. inland miles (avg)"
              >
                {r.approx_inland_miles == null
                  ? "—"
                  : `${Number(r.approx_inland_miles).toLocaleString(undefined, {
                      maximumFractionDigits: 0,
                    })} mi`}
              </span>
              <span
                className="font-mono w-12 text-right text-[11px] font-bold tabular-nums text-slate-900"
                style={tabularStyle}
                title="Shipment count"
              >
                {Number(r.shipment_count).toLocaleString()}
              </span>
            </li>
          ))}
          <li className="mt-1 grid items-center gap-2 border-t border-slate-100 px-1 pt-1.5 text-[9px] font-bold uppercase tracking-[0.08em] text-slate-400"
            style={{ gridTemplateColumns: "minmax(0,1fr) auto auto auto" }}
          >
            <span>Entry → destination</span>
            <span className="text-right">Mode</span>
            <span className="w-16 text-right">Inland</span>
            <span className="w-12 text-right">Ship.</span>
          </li>
        </ul>
      )}
    </IntelCard>
  );
}

// ── Customs broker mix card ─────────────────────────────────────────────

function CustomsBrokerMixCard({ companyName }: { companyName: string }) {
  // Broker rollup is derived from MX import declarations (broker name is
  // part of every customs filing). When zero declarations carry a broker,
  // the card hides itself per the spec.
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

  if (!isLoading && brokerRows.length === 0) {
    // Spec: hide the card if no broker dim available for this company.
    return null;
  }

  return (
    <IntelCard
      icon={<CustomsBrokerIcon size={16} title="Customs broker" />}
      title="Customs Broker Mix"
      sub="Brokers handling this importer's filings"
    >
      {isLoading ? (
        <SkeletonRows count={3} />
      ) : (
        <ul className="space-y-2">
          {brokerRows.map((b) => (
            <li
              key={b.name}
              className="flex items-center gap-3 rounded-md px-1 py-1 transition-colors hover:bg-slate-50"
            >
              <div className="min-w-0 flex-1">
                <div className="font-display truncate text-[12px] font-semibold text-slate-900">
                  {b.name}
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
    </IntelCard>
  );
}

// ── Per-lane carrier mix card ───────────────────────────────────────────

function PerLaneCarrierMixCard({ companyName }: { companyName: string }) {
  const { data, isLoading } = useLaneCarrierMix(companyName);

  const lanes = React.useMemo(() => {
    const map = new Map<string, { lane: string; carriers: LaneCarrierMixRow[] }>();
    for (const row of data || []) {
      const key = `${row.origin_country ?? "—"}→${row.destination_country ?? "—"}`;
      if (!map.has(key)) {
        map.set(key, { lane: key, carriers: [] });
      }
      map.get(key)!.carriers.push(row);
    }
    // Sort lanes by total shipments DESC, top 5.
    return Array.from(map.values())
      .map((g) => ({
        ...g,
        total: g.carriers.reduce((s, c) => s + Number(c.shipment_count || 0), 0),
        topCarriers: [...g.carriers]
          .sort((a, b) => Number(b.shipment_count) - Number(a.shipment_count))
          .slice(0, 3),
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);
  }, [data]);

  return (
    <IntelCard
      icon={<OceanIcon size={16} title="Per-lane carrier" />}
      title="Per-Lane Carrier Mix"
      sub="Top 5 lanes · top 3 carriers each"
    >
      {isLoading ? (
        <SkeletonRows count={4} />
      ) : lanes.length === 0 ? (
        <EmptyState
          icon={<OceanIcon size={24} />}
          message="No carrier mix recorded yet — refresh intel to populate lane carrier breakdowns."
        />
      ) : (
        <ul className="space-y-3">
          {lanes.map((g) => (
            <li
              key={g.lane}
              className="rounded-lg border border-slate-100 bg-slate-50/40 p-2.5"
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-display text-[12px] font-semibold text-slate-900">
                  {g.lane}
                </span>
                <span
                  className="font-mono text-[11px] font-bold text-slate-700"
                  style={tabularStyle}
                >
                  {g.total.toLocaleString()} ship.
                </span>
              </div>
              <div className="mt-1.5 space-y-1">
                {g.topCarriers.map((c) => (
                  <div
                    key={`${g.lane}-${c.carrier ?? "unknown"}`}
                    className="flex items-center gap-2"
                  >
                    <span className="font-display min-w-0 flex-1 truncate text-[11px] text-slate-700">
                      {c.carrier || "Unknown carrier"}
                    </span>
                    <div className="h-1 w-16 overflow-hidden rounded bg-white">
                      <div
                        className="h-full bg-blue-500"
                        style={{ width: `${Math.max(2, Number(c.share_pct) || 0)}%` }}
                      />
                    </div>
                    <span
                      className="font-mono w-10 shrink-0 text-right text-[10px] tabular-nums text-slate-500"
                      style={tabularStyle}
                    >
                      {Number(c.share_pct).toFixed(0)}%
                    </span>
                  </div>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
    </IntelCard>
  );
}

// ── Per-lane YoY trend card ─────────────────────────────────────────────

function PerLaneYoyTrendCard({ companyName }: { companyName: string }) {
  const { data, isLoading } = useLaneYoyTrend(companyName);

  const rows = React.useMemo(() => {
    return (data || [])
      .map((r) => ({
        lane: `${r.origin_country ?? "—"}→${r.destination_country ?? "—"}`,
        p2024: Number(r.period_2024) || 0,
        p2025: Number(r.period_2025) || 0,
        p2026: Number(r.period_2026) || 0,
        yoy: r.yoy_pct == null ? null : Number(r.yoy_pct),
      }))
      .sort((a, b) => b.p2026 + b.p2025 - (a.p2026 + a.p2025))
      .slice(0, 6);
  }, [data]);

  return (
    <IntelCard
      icon={<TransborderRailIcon size={16} title="YoY trend" />}
      title="Per-Lane YoY Trend"
      sub="Shipment counts · 2024 → 2026"
    >
      {isLoading ? (
        <SkeletonRows count={4} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<TransborderRailIcon size={24} />}
          message="No YoY trend recorded yet — refresh intel to populate the 2024→2026 rollup."
        />
      ) : (
        <div className="space-y-2">
          {rows.map((r) => {
            const tone =
              r.yoy == null
                ? "text-slate-400"
                : r.yoy > 0
                  ? "text-emerald-600"
                  : r.yoy < 0
                    ? "text-rose-600"
                    : "text-slate-500";
            return (
              <div
                key={r.lane}
                className="grid items-center gap-2 rounded-md px-1 py-1 transition-colors hover:bg-slate-50"
                style={{ gridTemplateColumns: "minmax(0,1fr) auto auto auto auto" }}
              >
                <span className="font-display truncate text-[11.5px] font-semibold text-slate-900">
                  {r.lane}
                </span>
                <span
                  className="font-mono w-10 text-right text-[10.5px] tabular-nums text-slate-500"
                  style={tabularStyle}
                  title="2024"
                >
                  {r.p2024.toLocaleString()}
                </span>
                <span
                  className="font-mono w-10 text-right text-[10.5px] tabular-nums text-slate-700"
                  style={tabularStyle}
                  title="2025"
                >
                  {r.p2025.toLocaleString()}
                </span>
                <span
                  className="font-mono w-10 text-right text-[10.5px] tabular-nums font-bold text-slate-900"
                  style={tabularStyle}
                  title="2026"
                >
                  {r.p2026.toLocaleString()}
                </span>
                <span
                  className={`font-mono w-14 text-right text-[11px] tabular-nums font-bold ${tone}`}
                  style={tabularStyle}
                >
                  {r.yoy == null
                    ? "—"
                    : `${r.yoy > 0 ? "+" : ""}${r.yoy.toFixed(1)}%`}
                </span>
              </div>
            );
          })}
          <div className="mt-1 grid items-center gap-2 border-t border-slate-100 px-1 pt-1.5 text-[9px] font-bold uppercase tracking-[0.08em] text-slate-400"
            style={{ gridTemplateColumns: "minmax(0,1fr) auto auto auto auto" }}
          >
            <span>Lane</span>
            <span className="w-10 text-right">'24</span>
            <span className="w-10 text-right">'25</span>
            <span className="w-10 text-right">'26</span>
            <span className="w-14 text-right">YoY</span>
          </div>
        </div>
      )}
    </IntelCard>
  );
}

// ── Top-level panel ─────────────────────────────────────────────────────

export function PremiumIntelPanel({
  companyName,
  title = "Premium Intel",
  subtitle = "LIT-exclusive coverage: transborder, US export, domestic inland leg, customs brokers, per-lane mix.",
  showPremiumBadge = true,
}: PremiumIntelPanelProps) {
  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-slate-200 bg-gradient-to-br from-white to-slate-50/60 px-4 py-3"
        style={{ boxShadow: "0 1px 2px rgba(0,0,0,0.03)" }}
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="font-display text-[15px] font-bold tracking-tight text-slate-900">
              {title}
            </h2>
            {showPremiumBadge && (
              <span className="font-display inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-1.5 py-[2px] text-[9px] font-bold uppercase tracking-[0.08em] text-amber-700">
                Premium
              </span>
            )}
          </div>
          <p className="font-body mt-1 text-[12px] text-slate-600">{subtitle}</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <ServiceModeChip mode="ocean" size="xs" />
          <ServiceModeChip mode="air" size="xs" />
          <ServiceModeChip mode="truck" size="xs" />
          <ServiceModeChip mode="rail" size="xs" />
          <ServiceModeChip mode="drayage" size="xs" />
          <ServiceModeChip mode="broker" size="xs" />
          <ServiceModeChip mode="domestic" size="xs" />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-2">
        <MxTransborderCard companyName={companyName} />
        <UsExportCard companyName={companyName} />
        <DomesticInlandLegCard companyName={companyName} />
        <CustomsBrokerMixCard companyName={companyName} />
        <PerLaneCarrierMixCard companyName={companyName} />
        <div className="lg:col-span-2">
          <PerLaneYoyTrendCard companyName={companyName} />
        </div>
      </div>
    </div>
  );
}

// silence unused warning for AirCargoIcon import (kept for future use / spec sym)
void AirCargoIcon;

export default PremiumIntelPanel;
