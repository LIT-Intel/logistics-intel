import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Sparkles,
  Info,
  Container,
  TrendingUp,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
} from "recharts";
import LitSectionCard from "@/components/ui/LitSectionCard";
import LitFlag from "@/components/ui/LitFlag";
import LitPill from "@/components/ui/LitPill";
import GlobeCanvas, { type GlobeLane } from "@/components/GlobeCanvas";
import { canonicalizeLanes, resolveEndpoint } from "@/lib/laneGlobe";
import { BolPreviewTable } from "@/components/bols/BolPreviewTable";
import {
  formatBolDate,
  getBolCarrierString,
  getBolDate,
  getBolDescription,
  getBolDestination,
  getBolHs,
  getBolOrigin,
  getBolSupplier,
  parseBolDate,
  readCarrier,
} from "@/lib/bols/helpers";

type SubTabId = "summary" | "lanes" | "products";

const SUB_TABS: { id: SubTabId; label: string }[] = [
  { id: "summary", label: "Summary" },
  { id: "lanes", label: "Trade Lanes" },
  { id: "products", label: "Products" },
];

type CDPSupplyChainProps = {
  profile?: any;
  routeKpis?: any;
  selectedYear?: number;
  years?: number[];
  onSelectYear?: (year: number) => void;
  onOpenPulseLive?: () => void;
};

/**
 * Phase 3 (rev. Phase 4) — Supply Chain tab.
 *
 * Sub-tab structure:
 *   Summary           — Monthly Cadence (FCL/LCL by month) + Imports by mode +
 *                       Container Profile + Recent BOL preview + Top suppliers
 *   Trade Lanes       — Globe + ranked-lane card + Combined Trade Lane
 *                       Intelligence table (lane × carrier × forwarder ×
 *                       container × FCL/LCL × trend)
 *   Service Providers — Carrier / Steamship Line Mix + Forwarder Mix
 *   Shipments         — Compact BOL preview table with carrier / supplier /
 *                       container / HS code per row
 *   Products          — Product / commodity ranking
 *
 * All modules render real data from `profile` props with honest empty
 * states when the field isn't populated. No normalization logic — when
 * a backend field is missing, we surface a fallback message and mark
 * the module so a future enrichment pass can flip it on.
 */
export default function CDPSupplyChain({
  profile,
  routeKpis,
  selectedYear,
  years,
  onSelectYear,
  onOpenPulseLive,
}: CDPSupplyChainProps) {
  const [sub, setSub] = useState<SubTabId>("summary");

  // ── Aggregates ───────────────────────────────────────────────────────
  // Two views of the company's routes:
  //
  //   - `allLanes`: every distinct route from the snapshot, kept at the
  //     same granularity the snapshot stored them. For Home Depot that's
  //     10 city-pair routes (8 China origins to Atlanta + 1 USVI + 1
  //     Vietnam). For Old Navy it's 10 routes (Morocco, Guatemala,
  //     Vietnam cities, Cambodia cities, Jordan). Used for the count
  //     badge, ranked-list display, and intelligence table — what the
  //     user expects when they read "top trade lanes".
  //
  //   - `globeLanes`: same routes after canonicalizeLanes() collapses
  //     them by country pair AND resolves endpoints to coordinates. Used
  //     by the great-circle arc renderer because the globe needs (lat,
  //     lng) and benefits from de-duping eight "Various China city →
  //     Atlanta" arcs into one "China → US" arc.
  //
  // Earlier revs of this file showed canonicalLanes (3 country pairs for
  // Home Depot) which read as "3 trade lanes" and felt wrong because the
  // snapshot has 10 distinct routes. The granular count is the honest
  // one to surface.
  const { allLanes, globeLanes } = useMemo(() => {
    const raw = readTopRoutes(profile, routeKpis);
    if (!raw.length) return { allLanes: [], globeLanes: [] };

    // allLanes = raw routes shaped to match the canonical row contract
    // so LaneRowInner / intelligence table render them without changes.
    const allLanesList = raw
      .map((r: any) => {
        const dl = String(r?.lane || "").trim();
        const parts = dl.split(/→|->|>/).map((s) => s.trim()).filter(Boolean);
        const rawFrom = parts[0] ?? null;
        const rawTo = parts.slice(1).join(" → ") || null;
        // Resolve each endpoint so LaneRowInner can render a real flag
        // via LitFlag. Without this, fromMeta/toMeta stayed null and the
        // flag slot rendered as an empty white pill next to the country
        // text. resolveEndpoint() returns null for unresolved strings —
        // the row falls back to the country-text fallback in that case.
        return {
          displayLabel: dl,
          fromMeta: resolveEndpoint(rawFrom),
          toMeta: resolveEndpoint(rawTo),
          shipments: Number(r?.shipments) || 0,
          teu: Number(r?.teu) || 0,
          spend: null,
          rawFrom,
          rawTo,
        };
      })
      .sort(
        (a: any, b: any) =>
          (Number(b.shipments) || 0) - (Number(a.shipments) || 0) ||
          (Number(b.teu) || 0) - (Number(a.teu) || 0),
      );

    const { canonical } = canonicalizeLanes(raw);
    return { allLanes: allLanesList, globeLanes: canonical };
  }, [profile, routeKpis]);
  // Back-compat alias for downstream readers that still call this
  // `canonicalLanes` (TopLanesCard / table); semantically it now holds
  // the granular per-route list.
  const canonicalLanes = allLanes;

  const recentBols = useMemo(() => {
    const items =
      profile?.recentBols ||
      profile?.recent_bols ||
      profile?.bols ||
      profile?.shipments ||
      [];
    return Array.isArray(items) ? items : [];
  }, [profile]);

  const carriers = useMemo(() => deriveCarriers(profile, recentBols), [profile, recentBols]);
  const forwarders = useMemo(() => deriveForwarders(profile, recentBols), [profile, recentBols]);
  const modes = useMemo(() => deriveModes(profile), [profile]);
  const suppliers = useMemo(
    () => deriveSuppliers(profile, recentBols),
    [profile, recentBols],
  );
  const products = useMemo(
    () => deriveProducts(profile, recentBols),
    [profile, recentBols],
  );
  const containerProfile = useMemo(() => deriveContainerProfile(profile), [profile]);
  const cadence = useMemo(() => deriveCadence(profile), [profile]);

  const briefHeadline = useMemo(() => {
    if (allLanes.length === 0) return null;
    const top: any = allLanes[0];
    const total = allLanes.reduce(
      (sum: number, l: any) => sum + (Number(l.shipments) || 0),
      0,
    );
    const share =
      total > 0 ? Math.round((Number(top.shipments) / total) * 100) : null;
    const fromName =
      top.fromMeta?.countryName ||
      top.fromMeta?.label ||
      (top.displayLabel ? String(top.displayLabel).split(/→|->|>/)[0]?.trim() : null) ||
      "Origin";
    const toName =
      top.toMeta?.countryName ||
      top.toMeta?.label ||
      (top.displayLabel ? String(top.displayLabel).split(/→|->|>/).slice(1).join(" → ").trim() : null) ||
      "Destination";
    if (share != null) {
      return `${fromName} → ${toName} carries ${share}% of trailing-12m volume.`;
    }
    return `${fromName} → ${toName} is the dominant lane.`;
  }, [allLanes]);

  return (
    <div className="flex flex-col gap-3.5">
      {/* Sub-tabs + year selector */}
      <div className="flex items-center gap-1.5 self-start rounded-lg bg-slate-100 p-1">
        {SUB_TABS.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setSub(s.id)}
            className={[
              "font-display whitespace-nowrap rounded-md px-3 py-1 text-[12px] font-semibold",
              sub === s.id
                ? "border border-slate-200 bg-white text-slate-900 shadow-sm"
                : "border border-transparent text-slate-500 hover:text-slate-700",
            ].join(" ")}
          >
            {s.label}
          </button>
        ))}
        {Array.isArray(years) && years.length > 1 && onSelectYear && (
          <select
            value={selectedYear ?? years[0]}
            onChange={(e) => onSelectYear(Number(e.target.value))}
            className="font-mono ml-auto rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700"
          >
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Strategic brief — premium dark gradient */}
      <StrategicBriefBanner
        headline={briefHeadline}
        recentBols={recentBols}
        canonicalLanes={allLanes}
      />

      {/* Sub-tab content */}
      {sub === "summary" && (
        <SummaryView
          profile={profile}
          cadence={cadence}
          modes={modes}
          containerProfile={containerProfile}
          recentBols={recentBols}
          carriers={carriers}
          suppliers={suppliers}
          canonicalLanes={allLanes}
          globeLanes={globeLanes}
          onOpenPulseLive={onOpenPulseLive}
        />
      )}
      {sub === "lanes" && (
        <LanesView
          canonicalLanes={allLanes}
          globeLanes={globeLanes}
          carriers={carriers}
          forwarders={forwarders}
          containerProfile={containerProfile}
          recentBols={recentBols}
        />
      )}
      {sub === "shipments" && (
        <ShipmentsView recentBols={recentBols} />
      )}
      {sub === "products" && <ProductsView products={products} />}
    </div>
  );
}

/* ── Strategic brief banner ───────────────────────────────────────────── */

function StrategicBriefBanner({
  headline,
  recentBols,
  canonicalLanes,
}: {
  headline: string | null;
  recentBols: any[];
  canonicalLanes: any[];
}) {
  return (
    <div
      className="relative overflow-hidden rounded-xl border p-[18px]"
      style={{
        background:
          "linear-gradient(135deg, #0B1736 0%, #0F1D38 60%, #102240 100%)",
        borderColor: "#1E293B",
      }}
    >
      <div
        className="pointer-events-none absolute -right-10 -top-10 h-60 w-60"
        style={{
          background:
            "radial-gradient(circle, rgba(0,240,255,0.15) 0%, transparent 60%)",
        }}
        aria-hidden
      />
      <div className="relative mb-2 flex items-center gap-2">
        <Sparkles className="h-3 w-3" style={{ color: "#00F0FF" }} />
        <span
          className="font-display text-[9px] font-bold uppercase tracking-[0.12em]"
          style={{ color: "#00F0FF" }}
        >
          What matters now
        </span>
        <span className="h-px w-8" style={{ background: "rgba(0,240,255,0.3)" }} />
        <span className="font-display text-[9px] font-semibold text-slate-400">
          Trailing 12 months
        </span>
      </div>
      <div
        className="font-display text-[18px] font-semibold leading-relaxed tracking-tight"
        style={{ color: "#F8FAFC" }}
      >
        {headline || (
          <span style={{ color: "#94A3B8" }}>
            Brief activates once trade lanes load.
          </span>
        )}
      </div>
      <div
        className="font-body relative mt-2 max-w-[680px] text-[13px] leading-relaxed"
        style={{ color: "#CBD5E1" }}
      >
        {canonicalLanes.length > 0 ? (
          <>
            <strong style={{ color: "#F8FAFC" }}>
              {canonicalLanes.length} active{" "}
              {canonicalLanes.length === 1 ? "lane" : "lanes"}
            </strong>{" "}
            across this account's trailing-12m import history.
            {recentBols.length > 0 && (
              <>
                {" "}
                Most recent shipment recorded{" "}
                {formatRelativeShort(getBolDate(recentBols[0]))}.
              </>
            )}
          </>
        ) : (
          "Insights appear once at least one trade lane has reportable activity."
        )}
      </div>
    </div>
  );
}

/* ── Summary view ─────────────────────────────────────────────────────── */

function SummaryView({
  profile,
  cadence,
  modes: _modes,
  containerProfile,
  recentBols,
  carriers,
  suppliers: _suppliers,
  canonicalLanes,
  globeLanes: _globeLanes,
  onOpenPulseLive,
}: {
  profile: any;
  cadence: CadencePoint[];
  modes: ModeSlice[];
  containerProfile: ContainerProfile;
  recentBols: any[];
  carriers: CarrierRow[];
  suppliers: SupplierRow[];
  canonicalLanes: any[];
  globeLanes: any[];
  onOpenPulseLive?: () => void;
}) {
  const reducedMotion = usePrefersReducedMotion();

  return (
    <>
      <ShipperVitalsStrip
        profile={profile}
        cadence={cadence}
        containerProfile={containerProfile}
        canonicalLanes={canonicalLanes}
        recentBols={recentBols}
        reducedMotion={reducedMotion}
      />
      <CadenceAndModalMix
        cadence={cadence}
        containerProfile={containerProfile}
        reducedMotion={reducedMotion}
      />
      <EquipmentAndLaneFootprint
        containerProfile={containerProfile}
        recentBols={recentBols}
        canonicalLanes={canonicalLanes}
        cadence={cadence}
        reducedMotion={reducedMotion}
      />
      <CarrierMixLive
        recentBols={recentBols}
        carriers={carriers}
        reducedMotion={reducedMotion}
      />
      <RecentActivityCards
        recentBols={recentBols}
        onOpenPulseLive={onOpenPulseLive}
        reducedMotion={reducedMotion}
      />
    </>
  );
}

/* ── Reduced-motion hook ──────────────────────────────────────────────── */

function usePrefersReducedMotion(): boolean {
  const [prefers, setPrefers] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setPrefers(mq.matches);
    const handler = (e: MediaQueryListEvent) => setPrefers(e.matches);
    if (mq.addEventListener) {
      mq.addEventListener("change", handler);
      return () => mq.removeEventListener("change", handler);
    }
    // Safari < 14 fallback
    mq.addListener(handler);
    return () => mq.removeListener(handler);
  }, []);
  return prefers;
}

/* ── A. Shipper Vitals Strip ──────────────────────────────────────────── */

type VitalCellKind = "spark" | "icon" | "text";

function ShipperVitalsStrip({
  profile,
  cadence,
  containerProfile,
  canonicalLanes,
  recentBols,
  reducedMotion,
}: {
  profile: any;
  cadence: CadencePoint[];
  containerProfile: ContainerProfile;
  canonicalLanes: any[];
  recentBols: any[];
  reducedMotion: boolean;
}) {
  // Build shipment + TEU series from profile.timeSeries (fallback: cadence)
  const series = useMemo(() => {
    const raw = Array.isArray(profile?.timeSeries) ? profile.timeSeries : [];
    if (raw.length > 0) {
      return raw.map((p: any) => ({
        shipments:
          Number(p?.shipments) ||
          (Number(p?.fclShipments) || 0) + (Number(p?.lclShipments) || 0),
        teu: Number(p?.teu) || 0,
      }));
    }
    return cadence.map((c) => ({
      shipments: c.total,
      teu: Number(c.teu) || 0,
    }));
  }, [profile, cadence]);

  const shipmentSpark = series.map((p, i) => ({ i, v: p.shipments }));
  const teuSpark = series.map((p, i) => ({ i, v: p.teu }));

  const totalShipments =
    Number(profile?.shipmentsLast12m) ||
    series.reduce((s: number, p: { shipments: number }) => s + p.shipments, 0) ||
    containerProfile.totalShipments ||
    0;
  const totalTeu =
    Number(profile?.totalTeu) ||
    Number(profile?.teuLast12m) ||
    series.reduce((s: number, p: { teu: number }) => s + p.teu, 0) ||
    0;
  const estSpend =
    Number(profile?.estSpend) ||
    Number(profile?.estimatedSpend) ||
    Number(profile?.spendLast12m) ||
    0;
  const fcl = containerProfile.fcl;
  const lcl = containerProfile.lcl;
  const mixTotal = fcl + lcl;
  const fclPct = mixTotal > 0 ? Math.round((fcl / mixTotal) * 100) : 0;
  const lclPct = mixTotal > 0 ? 100 - fclPct : 0;
  const uniqueRoutes = canonicalLanes?.length || 0;
  const uniqueCarriers = useMemo(() => {
    const set = new Set<string>();
    for (const bol of recentBols) {
      const c = readCarrier(bol);
      const name = c?.name || getBolCarrierString(bol);
      if (name && name !== "—") set.add(String(name).toLowerCase());
    }
    return set.size;
  }, [recentBols]);

  const cells: Array<{
    kind: VitalCellKind;
    label: string;
    value: string;
    data?: { i: number; v: number }[];
    color?: string;
  }> = [
    {
      kind: "spark",
      label: "Shipments 12m",
      value: formatCompactNumber(totalShipments),
      data: shipmentSpark,
      color: "#3B82F6",
    },
    {
      kind: "spark",
      label: "Total TEU",
      value: formatCompactNumber(totalTeu),
      data: teuSpark,
      color: "#8B5CF6",
    },
    {
      kind: "icon",
      label: "Est Spend",
      value: estSpend > 0 ? `$${formatCompactNumber(estSpend)}` : "—",
    },
    {
      kind: "text",
      label: "FCL / LCL Mix",
      value: mixTotal > 0 ? `${fclPct}% FCL / ${lclPct}% LCL` : "—",
    },
    {
      kind: "text",
      label: "Unique Routes",
      value: formatCompactNumber(uniqueRoutes),
    },
    {
      kind: "text",
      label: "Unique Carriers",
      value: formatCompactNumber(uniqueCarriers),
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-2.5 rounded-xl border border-slate-200 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.03)] sm:grid-cols-3 lg:grid-cols-6">
      {cells.map((cell, i) => (
        <VitalCell
          key={cell.label}
          cell={cell}
          delay={reducedMotion ? 0 : i * 80}
          reducedMotion={reducedMotion}
        />
      ))}
    </div>
  );
}

function VitalCell({
  cell,
  delay,
  reducedMotion,
}: {
  cell: {
    kind: VitalCellKind;
    label: string;
    value: string;
    data?: { i: number; v: number }[];
    color?: string;
  };
  delay: number;
  reducedMotion: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5 rounded-lg border border-slate-100 bg-white p-3 transition-colors hover:bg-slate-50/40">
      <div className="font-display text-[20px] font-bold leading-none text-slate-900 sm:text-[24px] lg:text-3xl">
        {cell.value}
      </div>
      <div className="font-display text-[10px] font-semibold uppercase tracking-wide text-slate-500">
        {cell.label}
      </div>
      <div className="mt-auto h-6">
        {cell.kind === "spark" && cell.data && cell.data.length > 0 ? (
          <div style={{ width: 80, height: 24 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={cell.data}>
                <defs>
                  <linearGradient id={`vit-${cell.label}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={cell.color} stopOpacity={0.4} />
                    <stop offset="100%" stopColor={cell.color} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Area
                  type="monotone"
                  dataKey="v"
                  stroke={cell.color}
                  strokeWidth={1.5}
                  fill={`url(#vit-${cell.label})`}
                  isAnimationActive={!reducedMotion}
                  animationDuration={reducedMotion ? 0 : 400}
                  animationBegin={delay}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : cell.kind === "icon" ? (
          <TrendingUp className="h-4 w-4 text-emerald-500" />
        ) : null}
      </div>
    </div>
  );
}

/* ── B. Cadence & Modal Mix ───────────────────────────────────────────── */

function CadenceAndModalMix({
  cadence,
  containerProfile,
  reducedMotion,
}: {
  cadence: CadencePoint[];
  containerProfile: ContainerProfile;
  reducedMotion: boolean;
}) {
  // Stacked area data: FCL/LCL come from cadence; Air defaults to 0 unless
  // backend supplies it via cadence (it doesn't yet — graceful zero).
  const chartData = cadence.map((c) => ({
    label: c.label,
    fcl: c.fcl,
    lcl: c.lcl,
    air: 0,
  }));

  const fcl = containerProfile.fcl;
  const lcl = containerProfile.lcl;
  // Air slice: 0 today (not derived). Donut keeps it for visual continuity.
  const air = 0;
  const total = fcl + lcl + air;
  const donut = [
    { name: "FCL", value: fcl, color: "#0EA5E9" },
    { name: "LCL", value: lcl, color: "#F59E0B" },
    { name: "Air", value: air, color: "#94A3B8" },
  ].filter((s) => s.value > 0);

  if (cadence.length === 0 && total === 0) {
    return (
      <LitSectionCard title="Cadence & Modal Mix" sub="Trailing 12 months">
        <EmptyMessage text="No cadence data on file yet — try Refresh Intel to pull the latest shipments." />
      </LitSectionCard>
    );
  }

  return (
    <LitSectionCard title="Cadence & Modal Mix" sub="Trailing 12 months">
      <div className="flex flex-col gap-4 lg:flex-row">
        {/* Left 70% — stacked area */}
        <div className="min-w-0 flex-1 lg:basis-[70%]">
          <div style={{ height: 240 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="cad-fcl" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#0EA5E9" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="#0EA5E9" stopOpacity={0.05} />
                  </linearGradient>
                  <linearGradient id="cad-lcl" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#F59E0B" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="#F59E0B" stopOpacity={0.05} />
                  </linearGradient>
                  <linearGradient id="cad-air" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#94A3B8" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="#94A3B8" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 10, fill: "#64748B" }}
                  tickLine={false}
                  axisLine={{ stroke: "#E2E8F0" }}
                />
                <Tooltip
                  contentStyle={{
                    fontSize: 11,
                    border: "1px solid #E2E8F0",
                    borderRadius: 6,
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="fcl"
                  stackId="1"
                  stroke="#0EA5E9"
                  fill="url(#cad-fcl)"
                  name="FCL"
                  isAnimationActive={!reducedMotion}
                  animationDuration={reducedMotion ? 0 : 800}
                  animationBegin={0}
                />
                <Area
                  type="monotone"
                  dataKey="lcl"
                  stackId="1"
                  stroke="#F59E0B"
                  fill="url(#cad-lcl)"
                  name="LCL"
                  isAnimationActive={!reducedMotion}
                  animationDuration={reducedMotion ? 0 : 800}
                  animationBegin={0}
                />
                <Area
                  type="monotone"
                  dataKey="air"
                  stackId="1"
                  stroke="#94A3B8"
                  fill="url(#cad-air)"
                  name="Air"
                  isAnimationActive={!reducedMotion}
                  animationDuration={reducedMotion ? 0 : 800}
                  animationBegin={0}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <LegendDot color="#0EA5E9" label="FCL" />
            <LegendDot color="#F59E0B" label="LCL" />
            <LegendDot color="#94A3B8" label="Air" />
          </div>
        </div>

        {/* Right 30% — donut */}
        <div className="flex min-w-0 flex-col items-center justify-center lg:basis-[30%]">
          <div className="relative" style={{ width: 180, height: 180 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={donut.length > 0 ? donut : [{ name: "—", value: 1, color: "#E2E8F0" }]}
                  innerRadius="60%"
                  outerRadius="90%"
                  paddingAngle={2}
                  dataKey="value"
                  isAnimationActive={!reducedMotion}
                  animationDuration={reducedMotion ? 0 : 600}
                  animationBegin={reducedMotion ? 0 : 300}
                  stroke="none"
                >
                  {(donut.length > 0 ? donut : [{ name: "—", value: 1, color: "#E2E8F0" }]).map(
                    (s, i) => (
                      <Cell key={i} fill={s.color} />
                    ),
                  )}
                </Pie>
                <Tooltip
                  contentStyle={{
                    fontSize: 11,
                    border: "1px solid #E2E8F0",
                    borderRadius: 6,
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <div className="font-display text-[22px] font-bold leading-none text-slate-900">
                {formatCompactNumber(total)}
              </div>
              <div className="font-display mt-1 text-[9px] font-semibold uppercase tracking-wider text-slate-500">
                Shipments
              </div>
            </div>
          </div>
        </div>
      </div>
    </LitSectionCard>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span
        className="inline-block h-2 w-2 rounded-full"
        style={{ background: color }}
      />
      <span className="font-display text-[10px] font-semibold text-slate-600">
        {label}
      </span>
    </div>
  );
}

/* ── C. Equipment & Lane Footprint ────────────────────────────────────── */

const CONTAINER_TYPE_COLORS: Record<string, string> = {
  "20ST": "#3B82F6",
  "40ST": "#8B5CF6",
  "40HC": "#06B6D4",
  "45HC": "#F59E0B",
  LCL: "#64748B",
};

function classifyContainerType(raw: string): keyof typeof CONTAINER_TYPE_COLORS | null {
  const s = String(raw || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!s) return null;
  if (/LCL/.test(s)) return "LCL";
  if (s.startsWith("45") && /HC|HQ/.test(s)) return "45HC";
  if (s.startsWith("40") && /HC|HQ/.test(s)) return "40HC";
  if (s.startsWith("40")) return "40ST";
  if (s.startsWith("20")) return "20ST";
  // ISO codes — 22G1=20ST, 42G1=40ST, 45G1=40HC, L5G1=45HC etc
  if (/^22/.test(s)) return "20ST";
  if (/^42/.test(s)) return "40ST";
  if (/^45/.test(s)) return "40HC";
  if (/^L5/.test(s)) return "45HC";
  return null;
}

function EquipmentAndLaneFootprint({
  containerProfile,
  recentBols,
  canonicalLanes,
  cadence,
  reducedMotion,
}: {
  containerProfile: ContainerProfile;
  recentBols: any[];
  canonicalLanes: any[];
  cadence: CadencePoint[];
  reducedMotion: boolean;
}) {
  // Build container mix from BOLs first; fall back to containerProfile.
  const mix = useMemo(() => {
    const counts: Record<string, number> = {
      "20ST": 0,
      "40ST": 0,
      "40HC": 0,
      "45HC": 0,
      LCL: 0,
    };
    let sourceCounted = 0;
    for (const bol of recentBols) {
      const t = classifyContainerType(
        String(bol?.container_type || bol?.containerType || bol?.iso_code || ""),
      );
      if (t) {
        counts[t]! += 1;
        sourceCounted += 1;
      }
    }
    if (sourceCounted === 0) {
      // Fall back to containerProfile.lengths + LCL bucket
      for (const len of containerProfile.lengths) {
        const t = classifyContainerType(len.label);
        if (t) counts[t]! += len.count;
      }
      if (containerProfile.lcl > 0) counts.LCL += containerProfile.lcl;
    }
    const total = Object.values(counts).reduce((s, n) => s + n, 0);
    return { counts, total };
  }, [recentBols, containerProfile]);

  // Top 5 lanes — sort canonicalLanes by shipments
  const topLanes = useMemo(() => {
    return (canonicalLanes || [])
      .slice()
      .sort(
        (a: any, b: any) => (Number(b?.shipments) || 0) - (Number(a?.shipments) || 0),
      )
      .slice(0, 5);
  }, [canonicalLanes]);

  const maxLaneShipments = Math.max(
    1,
    ...topLanes.map((l: any) => Number(l?.shipments) || 0),
  );

  // Tiny 12mo trend per lane: use overall cadence as a stand-in
  // (per-lane series isn't currently in scope). Scaled to lane share.
  const cadenceSpark = cadence.map((c, i) => ({ i, v: c.total }));

  const hasData = mix.total > 0 || topLanes.length > 0;
  if (!hasData) {
    return (
      <LitSectionCard
        title="Equipment & Lane Footprint"
        sub="Containers · Top 5 lanes"
      >
        <EmptyMessage text="No equipment or lane data yet — try Refresh Intel to pull the latest shipments." />
      </LitSectionCard>
    );
  }

  const orderedKeys: Array<keyof typeof CONTAINER_TYPE_COLORS> = [
    "20ST",
    "40ST",
    "40HC",
    "45HC",
    "LCL",
  ];

  return (
    <LitSectionCard
      title="Equipment & Lane Footprint"
      sub="Containers · Top 5 lanes"
    >
      <div className="flex flex-col gap-5 lg:flex-row">
        {/* Left 40% — container mix */}
        <div className="min-w-0 lg:basis-[40%]">
          <div className="font-display mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Container Mix
          </div>
          {mix.total > 0 ? (
            <ContainerMixBar
              counts={mix.counts as Record<string, number>}
              total={mix.total}
              orderedKeys={orderedKeys as string[]}
              reducedMotion={reducedMotion}
            />
          ) : (
            <div className="font-body text-[12px] text-slate-400">
              Container mix pending.
            </div>
          )}
        </div>

        {/* Right 60% — top 5 lanes */}
        <div className="min-w-0 lg:basis-[60%]">
          <div className="font-display mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Top 5 Lanes
          </div>
          {topLanes.length > 0 ? (
            <div className="flex flex-col gap-2">
              {topLanes.map((lane: any, i: number) => (
                <LaneFootprintRow
                  key={lane.displayLabel || i}
                  lane={lane}
                  index={i}
                  maxShipments={maxLaneShipments}
                  spark={cadenceSpark}
                  reducedMotion={reducedMotion}
                />
              ))}
            </div>
          ) : (
            <div className="font-body text-[12px] text-slate-400">
              No lane data yet.
            </div>
          )}
        </div>
      </div>
    </LitSectionCard>
  );
}

function ContainerMixBar({
  counts,
  total,
  orderedKeys,
  reducedMotion,
}: {
  counts: Record<string, number>;
  total: number;
  orderedKeys: string[];
  reducedMotion: boolean;
}) {
  const [mounted, setMounted] = useState(reducedMotion);
  useEffect(() => {
    if (reducedMotion) {
      setMounted(true);
      return;
    }
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, [reducedMotion]);

  const present = orderedKeys
    .map((k, i) => ({ key: k, count: counts[k] || 0, idx: i }))
    .filter((seg) => seg.count > 0);

  return (
    <div>
      <div className="flex h-6 w-full overflow-hidden rounded-md bg-slate-100">
        {present.map((seg) => {
          const target = total > 0 ? (seg.count / total) * 100 : 0;
          return (
            <div
              key={seg.key}
              title={`${seg.key} · ${seg.count} (${target.toFixed(0)}%)`}
              style={{
                width: mounted ? `${target}%` : "0%",
                background: CONTAINER_TYPE_COLORS[seg.key],
                transition: reducedMotion
                  ? "none"
                  : `width 700ms ease-out ${seg.idx * 80}ms`,
              }}
              className="h-full"
            />
          );
        })}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
        {present.map((seg) => {
          const pct = total > 0 ? Math.round((seg.count / total) * 100) : 0;
          return (
            <div key={seg.key} className="flex items-center gap-1.5">
              <span
                className="inline-block h-2 w-2 rounded-sm"
                style={{ background: CONTAINER_TYPE_COLORS[seg.key] }}
              />
              <span className="font-display text-[10px] font-semibold text-slate-700">
                {seg.key}
              </span>
              <span className="font-mono text-[10px] text-slate-500">
                {seg.count} · {pct}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function LaneFootprintRow({
  lane,
  index,
  maxShipments,
  spark,
  reducedMotion,
}: {
  lane: any;
  index: number;
  maxShipments: number;
  spark: { i: number; v: number }[];
  reducedMotion: boolean;
}) {
  const [mounted, setMounted] = useState(reducedMotion);
  useEffect(() => {
    if (reducedMotion) {
      setMounted(true);
      return;
    }
    const id = window.setTimeout(() => setMounted(true), 16 + index * 80);
    return () => clearTimeout(id);
  }, [reducedMotion, index]);

  const shipments = Number(lane?.shipments) || 0;
  const fromCountry =
    lane?.fromMeta?.countryCode ||
    lane?.fromMeta?.country ||
    null;
  const fromPort =
    lane?.fromMeta?.label ||
    lane?.fromMeta?.portName ||
    lane?.rawFrom ||
    "—";
  const toLabel =
    lane?.toMeta?.label ||
    lane?.toMeta?.portName ||
    lane?.rawTo ||
    "—";
  const widthPct = maxShipments > 0 ? (shipments / maxShipments) * 100 : 0;

  return (
    <div
      className="flex items-center gap-2.5"
      style={{
        opacity: mounted ? 1 : 0,
        transform: mounted ? "translateY(0)" : "translateY(4px)",
        transition: reducedMotion
          ? "none"
          : "opacity 320ms ease-out, transform 320ms ease-out",
      }}
    >
      <LitFlag code={fromCountry} size={14} />
      <div className="min-w-0 flex-1">
        <div className="font-display truncate text-[11px] font-semibold text-slate-900">
          {fromPort} <span className="text-slate-400">→</span> {toLabel}
        </div>
        <div className="mt-1 h-1 w-full overflow-hidden rounded bg-slate-100">
          <div
            className="h-full rounded bg-blue-500"
            style={{
              width: mounted ? `${widthPct}%` : "0%",
              transition: reducedMotion
                ? "none"
                : `width 700ms ease-out ${index * 80}ms`,
            }}
          />
        </div>
      </div>
      <div className="font-mono shrink-0 text-right text-[10px] font-semibold text-slate-600">
        {shipments.toLocaleString()}
      </div>
      <div className="shrink-0" style={{ width: 56, height: 22 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={spark}>
            <Area
              type="monotone"
              dataKey="v"
              stroke="#3B82F6"
              strokeWidth={1.25}
              fill="#3B82F6"
              fillOpacity={0.15}
              isAnimationActive={!reducedMotion}
              animationDuration={reducedMotion ? 0 : 400}
              animationBegin={reducedMotion ? 0 : index * 80}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/* ── D. Carrier Mix Live ──────────────────────────────────────────────── */

const CARRIER_BAR_COLORS = [
  "bg-blue-500",
  "bg-purple-500",
  "bg-pink-500",
  "bg-amber-500",
  "bg-emerald-500",
  "bg-cyan-500",
];

function CarrierMixLive({
  recentBols,
  carriers: _carriers,
  reducedMotion,
}: {
  recentBols: any[];
  carriers: CarrierRow[];
  reducedMotion: boolean;
}) {
  const top = useMemo(() => {
    const since = Date.now() - 90 * 24 * 60 * 60 * 1000;
    const map = new Map<
      string,
      { name: string; scac: string | null; count: number; lastDate: Date | null }
    >();
    for (const bol of recentBols) {
      const dStr = getBolDate(bol);
      const d = parseBolDate(dStr);
      if (!d || d.getTime() < since) continue;
      const c = readCarrier(bol);
      const name =
        c?.name ||
        getBolCarrierString(bol) ||
        null;
      if (!name || name === "—") continue;
      const key = String(name).toLowerCase();
      const entry = map.get(key) || {
        name: String(name),
        scac: c?.scac || null,
        count: 0,
        lastDate: null as Date | null,
      };
      entry.count += 1;
      if (!entry.lastDate || d > entry.lastDate) entry.lastDate = d;
      if (!entry.scac && c?.scac) entry.scac = c.scac;
      map.set(key, entry);
    }
    const arr = Array.from(map.values());
    arr.sort((a, b) => b.count - a.count);
    return arr.slice(0, 6);
  }, [recentBols]);

  if (top.length === 0) {
    return (
      <LitSectionCard title="Carrier Mix" sub="Last 90 days">
        <EmptyMessage text="No carrier activity in the last 90 days." />
      </LitSectionCard>
    );
  }

  const max = Math.max(1, ...top.map((c) => c.count));
  const total = top.reduce((s, c) => s + c.count, 0);

  return (
    <LitSectionCard title="Carrier Mix" sub="Last 90 days">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-6">
        {top.map((c, i) => (
          <CarrierBar
            key={c.name}
            carrier={c}
            index={i}
            maxCount={max}
            total={total}
            reducedMotion={reducedMotion}
          />
        ))}
      </div>
    </LitSectionCard>
  );
}

function CarrierBar({
  carrier,
  index,
  maxCount,
  total,
  reducedMotion,
}: {
  carrier: { name: string; scac: string | null; count: number; lastDate: Date | null };
  index: number;
  maxCount: number;
  total: number;
  reducedMotion: boolean;
}) {
  const [mounted, setMounted] = useState(reducedMotion);
  useEffect(() => {
    if (reducedMotion) {
      setMounted(true);
      return;
    }
    const id = window.setTimeout(() => setMounted(true), 16);
    return () => clearTimeout(id);
  }, [reducedMotion]);

  const targetPct = maxCount > 0 ? (carrier.count / maxCount) * 100 : 0;
  const sharePct = total > 0 ? Math.round((carrier.count / total) * 100) : 0;
  const colorClass = CARRIER_BAR_COLORS[index % CARRIER_BAR_COLORS.length];
  const tooltipText = carrier.lastDate
    ? `Last shipment: ${carrier.lastDate.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })}`
    : "Last shipment: —";

  return (
    <div className="flex flex-col items-stretch gap-2" title={tooltipText}>
      <div className="relative flex h-[140px] w-full items-end justify-center rounded-md bg-slate-50">
        <div
          className={`w-full rounded-md ${colorClass}`}
          style={{
            height: mounted ? `${targetPct}%` : "0%",
            transition: reducedMotion
              ? "none"
              : `height 700ms cubic-bezier(0.4, 0, 0.2, 1) ${index * 120}ms`,
          }}
        />
      </div>
      <div className="flex flex-col items-center gap-0.5">
        <div className="font-display max-w-full truncate text-[11px] font-semibold text-slate-900">
          {carrier.name}
        </div>
        {carrier.scac && (
          <LitPill tone="slate">
            <span className="font-mono">{carrier.scac}</span>
          </LitPill>
        )}
        <div className="font-mono text-[10px] text-slate-500">
          {carrier.count.toLocaleString()} · {sharePct}%
        </div>
      </div>
    </div>
  );
}

/* ── E. Recent Activity Cards ─────────────────────────────────────────── */

function RecentActivityCards({
  recentBols,
  onOpenPulseLive,
  reducedMotion,
}: {
  recentBols: any[];
  onOpenPulseLive?: () => void;
  reducedMotion: boolean;
}) {
  const cards = recentBols.slice(0, 5);
  if (cards.length === 0) {
    return (
      <LitSectionCard title="Recent Activity" sub="Latest BOL records">
        <EmptyMessage text="No recent BOLs to display." />
      </LitSectionCard>
    );
  }
  return (
    <LitSectionCard title="Recent Activity" sub="Latest BOL records">
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-5">
        {cards.map((bol, i) => (
          <ActivityCard
            key={i}
            bol={bol}
            index={i}
            reducedMotion={reducedMotion}
          />
        ))}
      </div>
      <div className="mt-3 flex justify-end">
        <a
          href="?tab=live"
          onClick={(e) => {
            if (onOpenPulseLive) {
              e.preventDefault();
              onOpenPulseLive();
            }
          }}
          className="font-display inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 hover:text-blue-700"
        >
          See all BOLs in Pulse LIVE
          <ArrowRight className="h-3 w-3" />
        </a>
      </div>
    </LitSectionCard>
  );
}

function ActivityCard({
  bol,
  index,
  reducedMotion,
}: {
  bol: any;
  index: number;
  reducedMotion: boolean;
}) {
  const [mounted, setMounted] = useState(reducedMotion);
  useEffect(() => {
    if (reducedMotion) {
      setMounted(true);
      return;
    }
    const id = window.setTimeout(() => setMounted(true), 16 + index * 60);
    return () => clearTimeout(id);
  }, [reducedMotion, index]);

  const dateStr = formatBolDate(bol);
  const carrier = readCarrier(bol);
  const scac =
    carrier?.scac ||
    (() => {
      const raw = getBolCarrierString(bol);
      return raw && raw !== "—" ? raw.slice(0, 6).toUpperCase() : null;
    })();
  const containerCount =
    Number(bol?.container_count) ||
    Number(bol?.containerCount) ||
    Number(bol?.containers) ||
    Number(bol?.container_qty) ||
    null;
  const ctype =
    classifyContainerType(
      String(bol?.container_type || bol?.containerType || bol?.iso_code || ""),
    ) || null;
  const origin = (() => {
    const s = getBolOrigin(bol);
    return s === "—" ? null : s;
  })();
  const destination = (() => {
    const s = getBolDestination(bol);
    return s === "—" ? null : s;
  })();

  return (
    <div
      className="flex flex-col gap-1.5 rounded-lg border border-slate-200 bg-white p-3 transition-colors hover:bg-slate-50/60"
      style={{
        opacity: mounted ? 1 : 0,
        transform: mounted ? "translateY(0)" : "translateY(6px)",
        transition: reducedMotion
          ? "none"
          : "opacity 280ms ease-out, transform 280ms ease-out",
      }}
    >
      <div className="font-mono text-[10px] font-semibold uppercase tracking-wide text-slate-500">
        {dateStr}
      </div>
      <div className="flex flex-wrap items-center gap-1">
        {scac && <LitPill tone="blue">{scac}</LitPill>}
        {containerCount != null && (
          <span className="font-mono text-[10px] text-slate-600">
            {containerCount} ctr
          </span>
        )}
        {ctype && (
          <LitPill tone={ctype === "LCL" ? "slate" : "purple"}>{ctype}</LitPill>
        )}
      </div>
      <div className="font-display truncate text-[11px] font-semibold text-slate-900">
        {origin || "—"} <span className="text-slate-400">→</span>{" "}
        {destination || "—"}
      </div>
    </div>
  );
}

/* ── Shared formatting ────────────────────────────────────────────────── */

function formatCompactNumber(n: number): string {
  if (!Number.isFinite(n) || n === 0) return n === 0 ? "0" : "—";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (abs >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return String(Math.round(n));
}

/* ── Trade Lanes view ─────────────────────────────────────────────────── */

function LanesView({
  canonicalLanes,
  globeLanes: _globeLanes,
  carriers,
  forwarders,
  containerProfile,
  recentBols,
}: {
  canonicalLanes: any[];
  globeLanes?: any[];
  carriers: CarrierRow[];
  forwarders: ForwarderRow[];
  containerProfile: ContainerProfile;
  recentBols: any[];
}) {
  // Trade Lanes tab — globe is owned by Summary. Here we render the
  // complete list of lanes (no slice cap) plus the combined intelligence
  // table with per-lane carrier/forwarder/last-activity bindings.
  return (
    <CombinedLaneIntelligenceTable
      canonicalLanes={canonicalLanes}
      carriers={carriers}
      forwarders={forwarders}
      containerProfile={containerProfile}
      recentBols={recentBols}
    />
  );
}

/* ── Shipments view ───────────────────────────────────────────────────── */

function ShipmentsView({ recentBols }: { recentBols: any[] }) {
  if (recentBols.length === 0) {
    return (
      <LitSectionCard title="Recent shipments" sub="BOL records">
        <EmptyMessage text="No recent shipments to display." />
      </LitSectionCard>
    );
  }
  return <BolPreviewTable bols={recentBols.slice(0, 25)} />;
}

/* ── Products view ────────────────────────────────────────────────────── */

function ProductsView({ products }: { products: ProductRow[] }) {
  if (products.length === 0) {
    return (
      <LitSectionCard
        title="Products / Commodities"
        sub="From BOL descriptions"
      >
        <EmptyMessage text="No product data on file yet — try Refresh Intel to pull the latest shipments." />
      </LitSectionCard>
    );
  }
  const productTotal = products.reduce((s, p) => s + p.count, 0);
  return (
    <LitSectionCard
      title="Products / Commodities"
      sub={`Top ${products.length}`}
    >
      <div className="flex flex-col gap-2.5">
        {products.map((p) => (
          <SplitBar
            key={p.label}
            label={p.label}
            value={p.count}
            total={productTotal}
            color="#F59E0B"
            sublabel={p.hsCode ? `HS ${p.hsCode}` : null}
          />
        ))}
      </div>
    </LitSectionCard>
  );
}

/* ── Modules ──────────────────────────────────────────────────────────── */

function MonthlyCadenceCard({ cadence }: { cadence: CadencePoint[] }) {
  if (!cadence.length) {
    return (
      <LitSectionCard
        title="Monthly shipment cadence"
        sub="Trailing 12 months · FCL & LCL"
      >
        <EmptyMessage text="Cadence chart appears once monthly time-series data is on file." />
      </LitSectionCard>
    );
  }
  const max = Math.max(...cadence.map((c) => c.fcl + c.lcl), 1);
  const chartHeight = 156;
  const [hoveredPoint, setHoveredPoint] = useState<CadencePoint | null>(null);
  const totalFcl = cadence.reduce((s, c) => s + c.fcl, 0);
  const totalLcl = cadence.reduce((s, c) => s + c.lcl, 0);
  const totalShip = totalFcl + totalLcl;
  const fclShare = totalShip > 0 ? Math.round((totalFcl / totalShip) * 100) : 0;
  const peak = cadence.reduce(
    (best, p) => (p.fcl + p.lcl > best.fcl + best.lcl ? p : best),
    cadence[0],
  );
  const avg = Math.round(totalShip / cadence.length);

  return (
    <LitSectionCard
      title="Monthly shipment cadence"
      sub="Trailing 12 months · FCL & LCL"
      action={
        <div className="flex gap-3">
          <span className="font-display inline-flex items-center gap-1 text-[10px] text-slate-500">
            <span className="h-2 w-2 rounded-sm bg-blue-500" />
            FCL
          </span>
          <span className="font-display inline-flex items-center gap-1 text-[10px] text-slate-500">
            <span className="h-2 w-2 rounded-sm bg-cyan-300" />
            LCL
          </span>
        </div>
      }
    >
      <div
        className="relative flex items-end gap-1.5 overflow-visible"
        style={{ height: chartHeight + 36 }}
      >
        {cadence.map((p, i) => {
          const total = p.fcl + p.lcl;
          const fclH = total > 0 ? (p.fcl / max) * chartHeight : 0;
          const lclH = total > 0 ? (p.lcl / max) * chartHeight : 0;
          const isLast = i === cadence.length - 1;
          const isHovered = hoveredPoint?.label === p.label;
          return (
            <div
              key={`${p.label}-${i}`}
              className="relative flex flex-1 flex-col items-center justify-end"
              style={{ height: "100%" }}
              onMouseEnter={() => setHoveredPoint(p)}
              onMouseLeave={() => setHoveredPoint(null)}
            >
              {isHovered && (
                <div
                  className="font-display pointer-events-none absolute z-20 min-w-[150px] rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-[11px] leading-tight text-white shadow-lg"
                  style={{ bottom: chartHeight + 8, left: "50%", transform: "translateX(-50%)" }}
                >
                  <div className="font-semibold">{p.label}</div>
                  <div className="opacity-90">Total: {(p.fcl + p.lcl).toLocaleString()} shipments</div>
                  <div className="opacity-90">FCL: {p.fcl.toLocaleString()}</div>
                  <div className="opacity-90">LCL: {p.lcl.toLocaleString()}</div>
                  {p.teu != null && Number(p.teu) > 0 && (
                    <div className="opacity-90">TEU: {Number(p.teu).toLocaleString()}</div>
                  )}
                </div>
              )}
              <div
                className="relative flex w-full flex-col items-stretch justify-end"
                style={{ height: chartHeight }}
              >
                {p.lcl > 0 && (
                  <div
                    className={[
                      "rounded-t-sm",
                      isLast ? "bg-cyan-400" : "bg-cyan-300",
                    ].join(" ")}
                    style={{ height: lclH }}
                  />
                )}
                {p.fcl > 0 && (
                  <div
                    className={[
                      "min-h-[2px]",
                      p.lcl > 0 ? "" : "rounded-t-sm",
                      isLast ? "bg-blue-600" : "bg-blue-500",
                    ].join(" ")}
                    style={{ height: fclH }}
                  />
                )}
                {total === 0 && (
                  <div className="mt-auto h-px w-full bg-slate-100" />
                )}
              </div>
              <span
                className={[
                  "font-display mt-1 text-[9px]",
                  isLast ? "font-bold text-slate-700" : "text-slate-400",
                ].join(" ")}
              >
                {p.label}
              </span>
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex justify-between border-t border-slate-100 pt-2.5 text-center">
        <Stat label="Peak month" value={`${peak.label} · ${peak.fcl + peak.lcl}`} />
        <Stat label="Avg / mo" value={String(avg)} />
        <Stat label="FCL share" value={`${fclShare}%`} accent />
        <Stat label="Months on file" value={String(cadence.length)} />
      </div>
    </LitSectionCard>
  );
}

function ImportsByModeCard({
  modes,
  cadence,
}: {
  modes: ModeSlice[];
  cadence?: CadencePoint[];
}) {
  const noModes = modes.length === 0;
  return (
    <LitSectionCard
      title="Imports by mode"
      sub="Modal split · trailing 12m"
    >
      {noModes ? (
        <EmptyMessage text="Modal split unavailable." />
      ) : (
        <div className="flex flex-col gap-2.5">
          {modes.map((m) => (
            <div key={m.mode} className="flex items-center gap-2.5">
              <div
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[11px] font-bold"
                style={{ background: m.color + "18", color: m.color }}
              >
                {m.mode.charAt(0)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex items-baseline justify-between">
                  <span className="font-display text-[12px] font-semibold text-slate-900">
                    {m.mode}
                  </span>
                  <span className="font-mono text-[11px] text-slate-700">
                    {m.count.toLocaleString()}{" "}
                    <span className="text-slate-400">· {m.pct}%</span>
                  </span>
                </div>
                <div className="h-1 overflow-hidden rounded bg-slate-100">
                  <div
                    className="h-full rounded"
                    style={{ width: `${m.pct}%`, background: m.color }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      {cadence && cadence.length > 0 && (
        <div className="mt-4 border-t border-slate-100 pt-3">
          <InlineCadenceChart cadence={cadence} />
        </div>
      )}
    </LitSectionCard>
  );
}

function InlineCadenceChart({ cadence }: { cadence: CadencePoint[] }) {
  const max = Math.max(...cadence.map((c) => c.fcl + c.lcl), 1);
  const chartHeight = 72;
  const [hovered, setHovered] = useState<CadencePoint | null>(null);
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="font-display text-[10px] font-bold uppercase tracking-[0.08em] text-slate-400">
          Monthly cadence · trailing 12m
        </span>
        <div className="flex gap-2">
          <span className="font-display inline-flex items-center gap-1 text-[9px] text-slate-500">
            <span className="h-1.5 w-1.5 rounded-sm bg-blue-500" />
            FCL
          </span>
          <span className="font-display inline-flex items-center gap-1 text-[9px] text-slate-500">
            <span className="h-1.5 w-1.5 rounded-sm bg-cyan-300" />
            LCL
          </span>
        </div>
      </div>
      <div
        className="relative flex items-end gap-1 overflow-visible"
        style={{ height: chartHeight + 18 }}
      >
        {cadence.map((p, i) => {
          const total = p.fcl + p.lcl;
          const fclH = total > 0 ? (p.fcl / max) * chartHeight : 0;
          const lclH = total > 0 ? (p.lcl / max) * chartHeight : 0;
          const isLast = i === cadence.length - 1;
          const isHovered = hovered?.label === p.label;
          return (
            <div
              key={`${p.label}-${i}`}
              className="relative flex flex-1 flex-col items-center justify-end"
              style={{ height: "100%" }}
              onMouseEnter={() => setHovered(p)}
              onMouseLeave={() => setHovered(null)}
            >
              {isHovered && (
                <div
                  className="font-display pointer-events-none absolute z-20 min-w-[140px] rounded-md border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-[10px] leading-tight text-white shadow-lg"
                  style={{ bottom: chartHeight + 8, left: "50%", transform: "translateX(-50%)" }}
                >
                  <div className="font-semibold">{p.label}</div>
                  <div className="opacity-90">Total: {(p.fcl + p.lcl).toLocaleString()}</div>
                  <div className="opacity-90">FCL: {p.fcl.toLocaleString()}</div>
                  <div className="opacity-90">LCL: {p.lcl.toLocaleString()}</div>
                </div>
              )}
              <div
                className="relative flex w-full flex-col items-stretch justify-end"
                style={{ height: chartHeight }}
              >
                {p.lcl > 0 && (
                  <div
                    className={["rounded-t-sm", isLast ? "bg-cyan-400" : "bg-cyan-300"].join(" ")}
                    style={{ height: lclH }}
                  />
                )}
                {p.fcl > 0 && (
                  <div
                    className={[
                      "min-h-[2px]",
                      p.lcl > 0 ? "" : "rounded-t-sm",
                      isLast ? "bg-blue-600" : "bg-blue-500",
                    ].join(" ")}
                    style={{ height: fclH }}
                  />
                )}
                {total === 0 && <div className="mt-auto h-px w-full bg-slate-100" />}
              </div>
              <span
                className={[
                  "font-display mt-0.5 text-[8px]",
                  isLast ? "font-bold text-slate-700" : "text-slate-400",
                ].join(" ")}
              >
                {p.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ContainerProfileCard({ profile }: { profile: ContainerProfile }) {
  const hasFcl = profile.fcl + profile.lcl > 0;
  const hasLengths = profile.lengths.length > 0;
  const hasIso = profile.isoCodes.length > 0;
  const totalShipments = profile.totalShipments;
  const shipLabel =
    totalShipments > 0 ? `${totalShipments.toLocaleString()} ship` : null;
  return (
    <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-3">
      {/* Block 1 — FCL / LCL split */}
      <LitSectionCard
        title="FCL / LCL split"
        sub="Container vs. consolidated"
        action={
          shipLabel ? (
            <span className="font-display inline-flex items-center gap-1 text-[10px] text-slate-400">
              <Container className="h-2.5 w-2.5" />
              {shipLabel}
            </span>
          ) : null
        }
      >
        {!hasFcl ? (
          <EmptyMessage text="FCL / LCL split appears once shipments are tagged." />
        ) : (
          <div className="space-y-1.5">
            <SplitBar
              label="FCL"
              value={profile.fcl}
              total={profile.fcl + profile.lcl}
              color="#3B82F6"
            />
            <SplitBar
              label="LCL"
              value={profile.lcl}
              total={profile.fcl + profile.lcl}
              color="#67E8F9"
            />
          </div>
        )}
      </LitSectionCard>

      {/* Block 2 — Top container lengths */}
      <LitSectionCard
        title="Top container lengths"
        sub="20', 40', 40HC and reefer mix"
      >
        {!hasLengths ? (
          <EmptyMessage text="Container length mix appears once data is on file." />
        ) : (
          <div className="space-y-1.5">
            {(() => {
              const lengthTotal = profile.lengths.reduce(
                (s, x) => s + x.count,
                0,
              );
              return profile.lengths.slice(0, 4).map((l) => (
                <SplitBar
                  key={l.label}
                  label={l.label}
                  value={l.count}
                  total={lengthTotal}
                  color="#06B6D4"
                  badge={l.yoy ? <YoyPill value={l.yoy} /> : null}
                  extraLabel={l.teu != null ? "TEU" : undefined}
                  extraValue={l.teu ?? null}
                />
              ));
            })()}
          </div>
        )}
      </LitSectionCard>

      {/* Block 3 — Top ISO container codes */}
      <LitSectionCard
        title="Top ISO container codes"
        sub="ISO 6346 type codes"
      >
        {!hasIso ? (
          <EmptyMessage text="ISO codes not surfaced on this account yet." />
        ) : (
          <div className="space-y-1.5">
            {(() => {
              const isoTotal = profile.isoCodes.reduce((s, x) => s + x.count, 0);
              return profile.isoCodes.slice(0, 5).map((c) => (
                <SplitBar
                  key={c.code}
                  label={c.code}
                  value={c.count}
                  total={isoTotal}
                  color="#8B5CF6"
                  sublabel={c.group || null}
                />
              ));
            })()}
          </div>
        )}
      </LitSectionCard>
    </div>
  );
}

function TopLanesCard({
  canonicalLanes,
  globeLanes: globeOnlyLanes,
}: {
  canonicalLanes: any[];
  globeLanes?: any[];
}) {
  if (canonicalLanes.length === 0) {
    return (
      <LitSectionCard
        title="Top trade lanes"
        sub="By trailing-12m share"
      >
        <EmptyMessage text="No lane data yet — try Refresh Intel to pull the latest shipments." />
      </LitSectionCard>
    );
  }
  // Globe needs resolved coordinates; fall back to filtering canonicalLanes
  // for backwards compatibility when globeLanes prop isn't passed.
  const sourceForGlobe = (Array.isArray(globeOnlyLanes) && globeOnlyLanes.length > 0
    ? globeOnlyLanes
    : canonicalLanes.filter((l: any) => l.fromMeta?.coords && l.toMeta?.coords));
  const globeLanes: GlobeLane[] = sourceForGlobe.slice(0, 6).map((l: any) => ({
    id: l.displayLabel,
    from: l.fromMeta.canonicalKey,
    to: l.toMeta.canonicalKey,
    coords: [l.fromMeta.coords, l.toMeta.coords],
    fromMeta: l.fromMeta,
    toMeta: l.toMeta,
    shipments: Number(l.shipments) || 0,
  }));
  const [selectedId, setSelectedId] = useState<string | null>(globeLanes[0]?.id || null);

  return (
    <LitSectionCard
      title="Top trade lanes"
      sub="Globe + ranked share"
      padded={false}
    >
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(220px,300px)_1fr]">
        <div className="flex items-center justify-center bg-slate-50 p-3">
          <GlobeCanvas
            lanes={globeLanes}
            selectedLane={selectedId}
            size={260}
            theme="trade"
            showFlagPins
          />
        </div>
        <div className="max-h-[320px] overflow-y-auto">
          {canonicalLanes.slice(0, 8).map((lane: any, i: number) => (
            <button
              key={lane.displayLabel}
              type="button"
              onClick={() =>
                setSelectedId(selectedId === lane.displayLabel ? null : lane.displayLabel)
              }
              className={[
                "flex w-full items-center gap-2.5 border-b border-slate-100 px-4 py-2.5 text-left last:border-b-0",
                selectedId === lane.displayLabel
                  ? "border-l-2 border-l-blue-500 bg-blue-50"
                  : "border-l-2 border-l-transparent hover:bg-slate-50/60",
              ].join(" ")}
            >
              <LaneRowInner lane={lane} index={i} highlight={selectedId === lane.displayLabel} />
            </button>
          ))}
        </div>
      </div>
    </LitSectionCard>
  );
}

function CombinedLaneIntelligenceTable({
  canonicalLanes,
  carriers,
  forwarders,
  containerProfile,
  recentBols,
}: {
  canonicalLanes: any[];
  carriers: CarrierRow[];
  forwarders: ForwarderRow[];
  containerProfile: ContainerProfile;
  recentBols: any[];
}) {
  if (canonicalLanes.length === 0) {
    return (
      <LitSectionCard
        title="All trade lanes"
        sub="Every origin → destination pair on file"
      >
        <EmptyMessage text="No lane data yet — try Refresh Intel to pull the latest shipments." />
      </LitSectionCard>
    );
  }
  const globalDominantContainer =
    containerProfile.lengths[0]?.label || containerProfile.topContainerLabel || null;
  const globalFclLcl =
    containerProfile.fcl + containerProfile.lcl > 0
      ? containerProfile.fcl >= containerProfile.lcl
        ? "FCL"
        : "LCL"
      : null;
  const fallbackTopCarrier = carriers[0]?.name || null;
  const fallbackTopForwarder = forwarders[0]?.name || null;

  return (
    <LitSectionCard
      title="All trade lanes"
      sub="Lane × carrier × forwarder × container × FCL/LCL"
      action={
        <span className="font-mono text-[10px] font-semibold text-slate-500">
          {canonicalLanes.length} lane{canonicalLanes.length === 1 ? "" : "s"}
        </span>
      }
      padded={false}
    >
      <div className="max-h-[560px] overflow-x-auto overflow-y-auto">
        <table className="w-full border-collapse">
          <thead className="sticky top-0 z-[1]">
            <tr className="bg-[#FAFBFC]">
              {[
                "Lane",
                "Shipments",
                "TEU",
                "Top carrier",
                "Top forwarder",
                "Container",
                "FCL/LCL",
                "Trend",
                "Last activity",
              ].map((h) => (
                <th
                  key={h}
                  className="font-display whitespace-nowrap border-b border-slate-100 px-3 py-2.5 text-left text-[9px] font-bold uppercase tracking-[0.08em] text-slate-400"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {canonicalLanes.map((lane: any, i: number, arr: any[]) => {
              const laneStats = deriveLaneStats(lane, recentBols);
              const trend = lane.trend || lane.yoy || laneStats.trend || null;
              const trendUp = trendIsPositive(trend);
              const topCarrier = laneStats.topCarrier || fallbackTopCarrier;
              const topForwarder = laneStats.topForwarder || fallbackTopForwarder;
              const container =
                laneStats.dominantContainer || globalDominantContainer || "—";
              const fclLcl = laneStats.fclLcl || globalFclLcl || "—";
              const lastDate = laneStats.lastDate;
              // Non-canonical lanes (no resolved meta) — parse displayLabel
              // for the from/to text fallback so the row still renders.
              const dl = String(lane?.displayLabel || "").trim();
              const dlParts = dl.split(/→|->|>/).map((s) => s.trim()).filter(Boolean);
              const fromText = laneEndpointLabel(lane.fromMeta, dlParts[0]);
              const toText = laneEndpointLabel(
                lane.toMeta,
                dlParts.slice(1).join(" → "),
              );
              return (
                <tr
                  key={lane.displayLabel}
                  className={[
                    "border-b border-slate-100 hover:bg-slate-50/60",
                    i === arr.length - 1 ? "last:border-b-0" : "",
                  ].join(" ")}
                >
                  <td className="px-3 py-2.5">
                    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                      <LitFlag
                        code={lane.fromMeta?.countryCode}
                        size={12}
                        label={lane.fromMeta?.countryName}
                      />
                      <span className="font-mono text-[11px] font-semibold text-slate-900">
                        {fromText}
                      </span>
                      <ArrowRight
                        aria-hidden
                        className="h-2 w-2 text-slate-300"
                      />
                      <LitFlag
                        code={lane.toMeta?.countryCode}
                        size={12}
                        label={lane.toMeta?.countryName}
                      />
                      <span className="font-mono text-[11px] font-semibold text-slate-900">
                        {toText}
                      </span>
                    </span>
                  </td>
                  <td className="font-mono px-3 py-2.5 text-[11px] text-slate-700">
                    {(Number(lane.shipments) || 0).toLocaleString()}
                  </td>
                  <td className="font-mono px-3 py-2.5 text-[11px] text-slate-700">
                    {Number(lane.teu) > 0
                      ? Math.round(Number(lane.teu)).toLocaleString()
                      : "—"}
                  </td>
                  <td className="px-3 py-2.5">
                    {topCarrier ? (
                      <span className="font-display text-[11px] font-semibold text-slate-900">
                        {topCarrier}
                      </span>
                    ) : (
                      <span className="font-body text-[11px] text-slate-300">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    {topForwarder ? (
                      <span className="font-display truncate text-[11px] font-semibold text-slate-900">
                        {topForwarder}
                      </span>
                    ) : (
                      <span className="font-body text-[11px] text-slate-300">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    {container && container !== "—" ? (
                      <LitPill tone="slate">{container}</LitPill>
                    ) : (
                      <span className="font-body text-[11px] text-slate-300">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    {fclLcl && fclLcl !== "—" ? (
                      <LitPill tone={fclLcl === "FCL" ? "blue" : "purple"}>
                        {fclLcl}
                      </LitPill>
                    ) : (
                      <span className="font-body text-[11px] text-slate-300">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    {trend ? (
                      <span
                        className={[
                          "font-mono text-[11px] font-semibold",
                          trendUp === true
                            ? "text-green-700"
                            : trendUp === false
                              ? "text-red-700"
                              : "text-slate-500",
                        ].join(" ")}
                      >
                        {trendUp === true ? "↑ " : trendUp === false ? "↓ " : ""}
                        {trend}
                      </span>
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                  <td className="font-mono px-3 py-2.5 text-[10px] text-slate-500">
                    {lastDate ? formatRelativeShort(lastDate) : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </LitSectionCard>
  );
}

/**
 * Per-lane top carrier/forwarder, dominant container, FCL/LCL bias and
 * latest BOL date — derived from the recent BOLs that match the lane's
 * origin and destination countries. Returns nulls (never "—") so the
 * caller can decide between per-lane vs. global fallbacks.
 */
function deriveLaneStats(
  lane: any,
  recentBols: any[],
): {
  topCarrier: string | null;
  topForwarder: string | null;
  dominantContainer: string | null;
  fclLcl: "FCL" | "LCL" | null;
  lastDate: string | null;
  trend: string | null;
} {
  const matched = recentBols.filter((b) => bolMatchesLane(b, lane));
  if (matched.length === 0) {
    return {
      topCarrier: null,
      topForwarder: null,
      dominantContainer: null,
      fclLcl: null,
      lastDate: null,
      trend: null,
    };
  }
  // top carrier on lane
  const carrierCounts = new Map<string, number>();
  for (const b of matched) {
    const c = readCarrier(b);
    if (!c) continue;
    carrierCounts.set(c.name, (carrierCounts.get(c.name) || 0) + 1);
  }
  const topCarrier =
    Array.from(carrierCounts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ||
    null;
  // top forwarder/provider on lane (shipper / supplier / notify_party)
  const fwdCounts = new Map<string, number>();
  for (const b of matched) {
    const candidate = [
      b?.providerName,
      b?.forwarder,
      b?.forwarder_name,
      b?.shipper_name,
      b?.shipperName,
      b?.Shipper_Name,
      b?.supplier_name,
      b?.supplierName,
      b?.notify_party,
      b?.notifyParty,
      b?.notify_party_name,
      b?.raw?.shipper_name,
      b?.raw?.notify_party_name,
    ].find((v) => typeof v === "string" && v.trim());
    if (candidate) {
      const k = String(candidate).trim();
      fwdCounts.set(k, (fwdCounts.get(k) || 0) + 1);
    }
  }
  const topForwarder =
    Array.from(fwdCounts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  // dominant container length / type on lane
  const containerCounts = new Map<string, number>();
  for (const b of matched) {
    const cand =
      b?.container_type ||
      b?.containerType ||
      b?.dominant_container ||
      b?.dominantContainer ||
      b?.raw?.container_group ||
      null;
    if (cand) {
      const k = String(cand).trim();
      containerCounts.set(k, (containerCounts.get(k) || 0) + 1);
    }
  }
  const dominantContainer =
    Array.from(containerCounts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ||
    null;
  // FCL/LCL bias
  let fcl = 0;
  let lcl = 0;
  for (const b of matched) {
    const isLcl =
      Boolean(b?.lcl) ||
      /lcl/i.test(String(b?.mode || b?.fcl_lcl || b?.loadType || ""));
    if (isLcl) lcl += 1;
    else fcl += 1;
  }
  const fclLcl: "FCL" | "LCL" | null =
    fcl + lcl === 0 ? null : fcl >= lcl ? "FCL" : "LCL";
  // last activity — pick max date across matched BOLs
  let lastDate: string | null = null;
  let lastEpoch = -Infinity;
  for (const b of matched) {
    const d = parseBolDate(getBolDate(b));
    if (d) {
      const t = d.getTime();
      if (t > lastEpoch) {
        lastEpoch = t;
        lastDate = getBolDate(b);
      }
    }
  }
  return {
    topCarrier,
    topForwarder,
    dominantContainer,
    fclLcl,
    lastDate,
    trend: null,
  };
}

function CarrierMixCard({ carriers }: { carriers: CarrierRow[] }) {
  if (carriers.length === 0) {
    return (
      <LitSectionCard
        title="Carrier / Steamship Line Mix"
        sub="Top carriers by shipment count"
      >
        <EmptyMessage
          text={
            "Carrier identity not surfaced on this account yet. Carrier may be inferable from Master Bill prefix when direct fields are absent."
          }
        />
      </LitSectionCard>
    );
  }
  const totalShipments = carriers.reduce((s, c) => s + c.shipments, 0);
  const totalTeu = carriers.reduce((s, c) => s + (c.teu || 0), 0);
  return (
    <LitSectionCard
      title="Carrier / Steamship Line Mix"
      sub="Top carriers · share by shipments and TEU"
      action={
        <span className="font-mono text-[10px] font-semibold text-slate-500">
          {carriers.length} carrier{carriers.length === 1 ? "" : "s"}
        </span>
      }
      padded={false}
    >
      <table className="w-full border-collapse">
        <thead>
          <tr className="bg-[#FAFBFC]">
            {["Carrier", "Source", "Shipments", "TEU", "Trend"].map((h) => (
              <th
                key={h}
                className="font-display whitespace-nowrap border-b border-slate-100 px-4 py-2 text-left text-[9px] font-bold uppercase tracking-[0.08em] text-slate-400"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {carriers.map((c, i) => {
            const shipShare = totalShipments > 0 ? c.shipments / totalShipments : 0;
            const teuShare = totalTeu > 0 ? (c.teu || 0) / totalTeu : 0;
            return (
              <tr
                key={c.name}
                className="border-b border-slate-100 last:border-b-0"
              >
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <div
                      className="flex h-[18px] w-[18px] items-center justify-center rounded text-[10px] font-bold"
                      style={{
                        background: PROVIDER_COLORS[i % PROVIDER_COLORS.length] + "18",
                        color: PROVIDER_COLORS[i % PROVIDER_COLORS.length],
                      }}
                    >
                      {c.name.charAt(0)}
                    </div>
                    <span className="font-display text-[12px] font-semibold text-slate-900">
                      {c.name}
                    </span>
                    {c.scac && (
                      <span className="font-mono text-[9px] uppercase text-slate-400">
                        {c.scac}
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-2.5">
                  {c.inferred ? (
                    <LitPill
                      tone="amber"
                      icon={<Info className="h-2 w-2" />}
                    >
                      Inferred
                    </LitPill>
                  ) : (
                    <LitPill tone="green">Direct</LitPill>
                  )}
                </td>
                <td className="w-44 px-4 py-2.5">
                  <ShareBar
                    share={shipShare}
                    color={PROVIDER_COLORS[i % PROVIDER_COLORS.length]}
                    label={c.shipments.toLocaleString()}
                    tooltipTitle={c.name}
                    tooltipExtra={c.teu != null ? `TEU: ${Math.round(c.teu).toLocaleString()}` : undefined}
                  />
                </td>
                <td className="w-44 px-4 py-2.5">
                  {c.teu != null ? (
                    <ShareBar
                      share={teuShare}
                      color="#0EA5E9"
                      label={Math.round(c.teu).toLocaleString()}
                      tooltipTitle={c.name}
                      tooltipExtra={`Shipments: ${c.shipments.toLocaleString()}`}
                    />
                  ) : (
                    <span className="font-body text-[11px] text-slate-300">—</span>
                  )}
                </td>
                <td className="px-4 py-2.5">
                  {c.trend ? (
                    <span
                      className={[
                        "font-mono text-[11px] font-semibold",
                        c.up === true
                          ? "text-green-700"
                          : c.up === false
                            ? "text-red-700"
                            : "text-slate-500",
                      ].join(" ")}
                    >
                      {c.up === true ? "↑ " : c.up === false ? "↓ " : ""}
                      {c.trend}
                    </span>
                  ) : (
                    <span className="text-slate-300">—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {carriers.some((c) => c.inferred) && (
        <div className="font-body border-t border-slate-100 bg-amber-50 px-4 py-2 text-[11px] text-amber-700">
          <Info className="mr-1 inline h-3 w-3" />
          Some carriers are inferred from Master Bill of Lading prefixes when
          direct carrier fields are absent.
        </div>
      )}
    </LitSectionCard>
  );
}

function ForwarderMixCard({ forwarders }: { forwarders: ForwarderRow[] }) {
  if (forwarders.length === 0) {
    return (
      <LitSectionCard
        title="Forwarder / Service Provider Mix"
        sub="Forwarders, customs brokers, notify parties, suppliers"
      >
        <EmptyMessage text="Forwarder/provider data not surfaced on this account yet." />
      </LitSectionCard>
    );
  }
  const total = forwarders.reduce((s, f) => s + f.shipments, 0);
  const top = forwarders[0];
  const topShare = total > 0 ? top.shipments / total : 0;
  const concentrated = topShare > 0.4;
  return (
    <LitSectionCard
      title="Forwarder / Service Provider Mix"
      sub="Top providers · ranked by shipment touchpoints"
      action={
        <span className="font-mono text-[10px] font-semibold text-slate-500">
          {forwarders.length} provider{forwarders.length === 1 ? "" : "s"}
        </span>
      }
    >
      {concentrated && (
        <div className="font-body mb-3 rounded-md border border-purple-200 bg-purple-50 px-3 py-2 text-[11px] text-purple-700">
          <strong>{top.name}</strong> covers {Math.round(topShare * 100)}% of
          provider touchpoints — potential displacement opportunity.
        </div>
      )}
      <div className="flex flex-col gap-2.5">
        {forwarders.map((f, i) => (
          <div
            key={f.name + i}
            className="flex items-center gap-2.5 border-b border-slate-100 pb-2 last:border-b-0"
          >
            <div
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[11px] font-bold"
              style={{
                background: PROVIDER_COLORS[i % PROVIDER_COLORS.length] + "18",
                color: PROVIDER_COLORS[i % PROVIDER_COLORS.length],
              }}
            >
              {f.name.charAt(0)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="font-display truncate text-[12px] font-semibold text-slate-900">
                  {f.name}
                </span>
                {f.roles.map((role) => (
                  <LitPill key={role} tone={roleToTone(role)}>
                    {role}
                  </LitPill>
                ))}
              </div>
              <div className="font-mono mt-0.5 text-[10px] text-slate-400">
                {f.shipments.toLocaleString()} shipments
                {f.teu != null && Number(f.teu) > 0 ? (
                  <> · {Math.round(Number(f.teu)).toLocaleString()} TEU</>
                ) : null}
                {f.lastShipment ? (
                  <> · last {formatRelativeShort(f.lastShipment)}</>
                ) : null}
                {f.countries && f.countries.length > 0 ? (
                  <> · {f.countries.slice(0, 3).join(", ")}</>
                ) : null}
              </div>
            </div>
            <div className="w-20 shrink-0">
              <ShareBar
                share={total > 0 ? f.shipments / total : 0}
                color={PROVIDER_COLORS[i % PROVIDER_COLORS.length]}
                hideLabel
                tooltipTitle={f.name}
                label={f.shipments.toLocaleString()}
                tooltipExtra={f.teu != null ? `TEU: ${Math.round(Number(f.teu)).toLocaleString()}` : undefined}
              />
            </div>
          </div>
        ))}
      </div>
    </LitSectionCard>
  );
}

function RecentBolsCompactCard({ recentBols }: { recentBols: any[] }) {
  if (recentBols.length === 0) {
    return (
      <LitSectionCard title="Recent shipments" sub="Latest BOLs">
        <EmptyMessage text="No recent shipments to display." />
      </LitSectionCard>
    );
  }
  return (
    <LitSectionCard
      title="Recent shipments"
      sub={`Latest ${recentBols.length} BOL records`}
      padded={false}
    >
      {recentBols.map((bol, i, arr) => (
        <ShipmentRow key={i} bol={bol} isLast={i === arr.length - 1} />
      ))}
    </LitSectionCard>
  );
}

function ShipmentRow({ bol, isLast }: { bol: any; isLast: boolean }) {
  // Phase 6 — broad helpers + safe formatBolDate so the row never says
  // "Invalid Date" / "— → —" when the raw row uses non-standard field
  // names (foreign_port, us_port_of_unlading, place_of_receipt, etc.).
  const dateLabel = (() => {
    const d = parseBolDate(getBolDate(bol));
    if (!d) return "—";
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  })();
  const carrier = readCarrier(bol);
  const carrierFallback = (() => {
    const s = getBolCarrierString(bol);
    return s === "—" ? null : s;
  })();
  const carrierLabel = carrier?.name || carrierFallback;
  const supplier = (() => {
    const s = getBolSupplier(bol);
    return s === "—" ? null : s;
  })();
  const origin = (() => {
    const s = getBolOrigin(bol);
    return s === "—" ? null : s;
  })();
  const destination = (() => {
    const s = getBolDestination(bol);
    return s === "—" ? null : s;
  })();
  const teu = Number(bol?.teu) || Number(bol?.containers_teu) || null;
  const isLcl =
    Boolean(bol?.lcl) ||
    /lcl/i.test(String(bol?.mode || bol?.fcl_lcl || bol?.loadType || ""));
  return (
    <div
      className={[
        "grid items-center gap-2 px-4 py-2.5",
        !isLast ? "border-b border-slate-100" : "",
      ].join(" ")}
      style={{ gridTemplateColumns: "84px 1fr 56px 56px" }}
    >
      <span className="font-mono whitespace-nowrap text-[10px] text-slate-500">
        {dateLabel}
      </span>
      <div className="min-w-0">
        {origin || destination ? (
          <div className="font-display truncate text-[11px] font-semibold text-slate-900">
            {origin || "—"} <span className="text-slate-400">→</span>{" "}
            {destination || "—"}
          </div>
        ) : (
          <div className="font-body text-[11px] text-slate-300">—</div>
        )}
        {(carrierLabel || supplier) && (
          <div className="font-body mt-0.5 flex items-center gap-1.5 truncate text-[10px] text-slate-400">
            {carrierLabel && (
              <span className="truncate">
                {carrierLabel}
                {carrier?.inferred ? " · MBL" : ""}
              </span>
            )}
            {carrierLabel && supplier && <span className="text-slate-300">·</span>}
            {supplier && <span className="truncate">{supplier}</span>}
          </div>
        )}
      </div>
      <span
        className={[
          "font-display whitespace-nowrap rounded border px-1.5 py-0.5 text-center text-[9px] font-semibold",
          !isLcl
            ? "border-blue-200 bg-blue-50 text-blue-700"
            : "border-purple-200 bg-purple-50 text-purple-700",
        ].join(" ")}
      >
        {isLcl ? "LCL" : "FCL"}
      </span>
      <span className="font-mono text-right text-[11px] font-semibold text-slate-900">
        {teu != null ? `${Number(teu).toFixed(1)} TEU` : "—"}
      </span>
    </div>
  );
}

function SupplierRowInteractive({
  supplier: s,
  hasStats,
}: {
  supplier: SupplierRow;
  hasStats: boolean;
}) {
  const [hover, setHover] = useState(false);
  return (
    <div
      className="relative flex items-center gap-2.5 rounded transition-colors hover:bg-emerald-50/50"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {hover && hasStats && (
        <div
          className="font-display pointer-events-none absolute left-8 z-20 min-w-[180px] rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-[11px] leading-tight text-white shadow-lg"
          style={{ bottom: "100%", marginBottom: 6 }}
        >
          <div className="font-semibold">{s.name}</div>
          {s.country && <div className="text-[10px] opacity-75">{s.country}</div>}
          <div className="opacity-90">Shipments: {s.shipments.toLocaleString()}</div>
          {s.share > 0 && <div className="opacity-90">Share: {s.share}%</div>}
        </div>
      )}
      <div className="font-mono flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-slate-100 text-[9px] font-bold text-slate-500">
        {(s.country || "").slice(0, 2).toUpperCase() || "—"}
      </div>
      <div className="min-w-0 flex-1">
        <div className="font-display truncate text-[12px] font-semibold text-slate-900">
          {s.name}
        </div>
        {hasStats ? (
          <div className="mt-1 flex items-center gap-1.5">
            <div className="h-1 flex-1 overflow-hidden rounded bg-slate-100">
              <div
                className="h-full rounded bg-emerald-500 transition-all"
                style={{ width: `${s.share}%`, opacity: hover ? 1 : 0.85 }}
              />
            </div>
            <span className="font-mono whitespace-nowrap text-[10px] text-slate-500">
              {s.share > 0 ? `${s.share}% · ` : ""}
              {s.shipments.toLocaleString()} ship
            </span>
          </div>
        ) : (
          <div className="font-body mt-0.5 text-[10px] text-slate-400">
            Counterparty on file · count pending
          </div>
        )}
      </div>
    </div>
  );
}

function TopSuppliersCard({ suppliers }: { suppliers: SupplierRow[] }) {
  return (
    <LitSectionCard
      title="Top suppliers"
      sub="From verified BOL counterparties"
    >
      {suppliers.length === 0 ? (
        <EmptyMessage text="No supplier data on file." />
      ) : (
        <div className="flex flex-col gap-2">
          {suppliers.slice(0, 6).map((s, i) => {
            const hasStats = s.shipments > 0 && s.share >= 0;
            return (
              <SupplierRowInteractive key={s.name + i} supplier={s} hasStats={hasStats} />
            );
          })}
        </div>
      )}
    </LitSectionCard>
  );
}

function laneEndpointLabel(meta: any, fallback?: string): string {
  // "Shanghai, CN" when label has city info, just "CN" otherwise.
  // The canonicalizer's `label` is usually the city/region; the
  // `countryName` is the full country. When they're identical (rare),
  // we fall back to the ISO code alone.
  const label = String(meta?.label || "").trim();
  const country = String(meta?.countryName || "").trim();
  const code = String(meta?.countryCode || "").toUpperCase().trim();
  if (label && country && label.toLowerCase() !== country.toLowerCase()) {
    return code ? `${label}, ${code}` : `${label}, ${country}`;
  }
  if (code) return code;
  return label || country || fallback || "—";
}

function LaneRowInner({
  lane,
  index,
  highlight,
}: {
  lane: any;
  index: number;
  highlight: boolean;
}) {
  // Non-canonical lanes (resolved endpoint missing) carry a displayLabel
  // like "Morocco → United States of America". Parse it for fallback
  // rendering so we still show the lane text with arrow even when the
  // geocoder didn't recognize the country.
  const displayLabel = String(lane?.displayLabel || "").trim();
  const labelParts = displayLabel.split(/→|->|>/).map((s) => s.trim()).filter(Boolean);
  const fromText =
    laneEndpointLabel(lane.fromMeta, labelParts[0]) ||
    labelParts[0] ||
    "—";
  const toText =
    laneEndpointLabel(lane.toMeta, labelParts.slice(1).join(" → ")) ||
    labelParts.slice(1).join(" → ") ||
    "—";
  return (
    <>
      <span
        className={[
          "font-mono w-5 shrink-0 text-center text-[9px] font-bold",
          highlight ? "text-blue-700" : "text-slate-400",
        ].join(" ")}
      >
        {String(index + 1).padStart(2, "0")}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 whitespace-nowrap">
          <LitFlag
            code={lane.fromMeta?.countryCode}
            size={13}
            label={lane.fromMeta?.countryName}
          />
          <span
            className={[
              "font-mono text-[11px] font-semibold",
              highlight ? "text-blue-700" : "text-slate-700",
            ].join(" ")}
          >
            {fromText}
          </span>
          <ArrowRight className="h-2 w-2 text-slate-300" aria-hidden />
          <LitFlag
            code={lane.toMeta?.countryCode}
            size={13}
            label={lane.toMeta?.countryName}
          />
          <span
            className={[
              "font-mono text-[11px] font-semibold",
              highlight ? "text-blue-700" : "text-slate-700",
            ].join(" ")}
          >
            {toText}
          </span>
          {index === 0 && <LitPill tone="blue">Primary</LitPill>}
        </div>
        <div className="mt-1 flex items-center gap-2">
          <span className="font-mono text-[10px] text-slate-500">
            {(Number(lane.shipments) || 0).toLocaleString()} ship
          </span>
          {Number(lane.teu) > 0 && (
            <span className="font-mono text-[10px] text-slate-400">
              {Math.round(Number(lane.teu)).toLocaleString()} TEU
            </span>
          )}
        </div>
      </div>
    </>
  );
}

/* ── Atoms ────────────────────────────────────────────────────────────── */

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="text-left">
      <div className="font-display text-[10px] font-bold uppercase tracking-[0.06em] text-slate-400">
        {label}
      </div>
      <div
        className={[
          "font-mono text-[14px] font-bold",
          accent ? "text-green-700" : "text-slate-900",
        ].join(" ")}
      >
        {value}
      </div>
    </div>
  );
}

function SplitBar({
  label,
  value,
  total,
  color,
  badge,
  extraLabel,
  extraValue,
  sublabel,
}: {
  label: string;
  value: number;
  total: number;
  color: string;
  badge?: React.ReactNode;
  extraLabel?: string;
  extraValue?: number | string | null;
  sublabel?: string | null;
}) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  const [hover, setHover] = useState(false);
  return (
    <div
      className="relative"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {hover && (
        <div
          className="font-display pointer-events-none absolute left-0 z-20 min-w-[180px] rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-[11px] leading-tight text-white shadow-lg"
          style={{ bottom: "100%", marginBottom: 6 }}
        >
          <div className="font-semibold">{label}</div>
          {sublabel && <div className="text-[10px] opacity-75">{sublabel}</div>}
          <div className="opacity-90">Count: {Number(value).toLocaleString()}</div>
          {total > 0 && <div className="opacity-90">Share: {pct}%</div>}
          {extraLabel && extraValue != null && extraValue !== "" && (
            <div className="opacity-90">
              {extraLabel}: {typeof extraValue === "number" ? extraValue.toLocaleString() : extraValue}
            </div>
          )}
        </div>
      )}
      <div className="mb-1 flex items-baseline justify-between">
        <span className="font-display inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-900">
          {label}
          {badge}
        </span>
        <span className="font-mono text-[10px] text-slate-500">
          {value.toLocaleString()} <span className="text-slate-400">· {pct}%</span>
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded bg-slate-100 transition-all hover:h-2.5">
        <div
          className="h-full rounded transition-opacity"
          style={{ width: `${pct}%`, background: color, opacity: hover ? 1 : 0.9 }}
        />
      </div>
    </div>
  );
}

function ShareBar({
  share,
  color,
  label,
  hideLabel,
  tooltipTitle,
  tooltipExtra,
}: {
  share: number;
  color: string;
  label?: string;
  hideLabel?: boolean;
  tooltipTitle?: string;
  tooltipExtra?: string;
}) {
  const [hover, setHover] = useState(false);
  const pct = Math.round(share * 100);
  return (
    <div
      className="relative flex items-center gap-2"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {hover && (tooltipTitle || tooltipExtra) && (
        <div
          className="font-display pointer-events-none absolute left-0 z-20 min-w-[160px] rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-[11px] leading-tight text-white shadow-lg"
          style={{ bottom: "100%", marginBottom: 6 }}
        >
          {tooltipTitle && <div className="font-semibold">{tooltipTitle}</div>}
          <div className="opacity-90">Share: {pct}%</div>
          {label && <div className="opacity-90">Count: {label}</div>}
          {tooltipExtra && <div className="opacity-90">{tooltipExtra}</div>}
        </div>
      )}
      <div className="h-1 flex-1 overflow-hidden rounded bg-slate-100 transition-all hover:h-1.5">
        <div
          className="h-full rounded transition-opacity"
          style={{
            width: `${Math.max(0, Math.min(100, share * 100))}%`,
            background: color,
            opacity: hover ? 1 : 0.9,
          }}
        />
      </div>
      {!hideLabel && (
        <span className="font-mono w-12 shrink-0 text-right text-[10px] text-slate-500">
          {label ?? `${pct}%`}
        </span>
      )}
    </div>
  );
}

function YoyPill({ value }: { value: string }) {
  const up = trendIsPositive(value);
  return (
    <LitPill tone={up === true ? "green" : up === false ? "red" : "slate"}>
      {up === true ? "↑ " : up === false ? "↓ " : ""}
      {value}
    </LitPill>
  );
}

function EmptyMessage({ text }: { text: string }) {
  return (
    <div className="px-6 py-8 text-center">
      <p className="font-body text-[12px] text-slate-400">{text}</p>
    </div>
  );
}

/* ── Data normalizers ─────────────────────────────────────────────────── */

type CadencePoint = { label: string; fcl: number; lcl: number; total: number; teu?: number | null };
type ModeSlice = { mode: string; count: number; pct: number; color: string };
type ContainerLength = { label: string; count: number; teu?: number; yoy?: string | null };
type ContainerIso = { code: string; group?: string; count: number };
type ContainerProfile = {
  fcl: number;
  lcl: number;
  totalShipments: number;
  topContainerLabel: string | null;
  lengths: ContainerLength[];
  isoCodes: ContainerIso[];
};
type CarrierRow = {
  name: string;
  scac?: string | null;
  shipments: number;
  teu?: number | null;
  trend?: string | null;
  up?: boolean | null;
  inferred: boolean;
};
type ForwarderRow = {
  name: string;
  roles: string[];
  shipments: number;
  teu?: number | null;
  lastShipment?: string | null;
  countries?: string[];
};
type SupplierRow = { name: string; country: string; shipments: number; share: number };
type ProductRow = { label: string; count: number; hsCode?: string | null };

function readTopRoutes(profile: any, routeKpis: any) {
  const candidates = [
    profile?.topRoutes,
    profile?.top_routes,
    profile?.routes,
    routeKpis?.topRoutes,
    routeKpis?.top_routes,
    routeKpis?.topRoutesLast12m,
  ];
  for (const list of candidates) {
    if (Array.isArray(list) && list.length) {
      return list
        .map((entry: any) => {
          const lane = entry?.lane || entry?.label || entry?.route;
          if (!lane || typeof lane !== "string") return null;
          return {
            lane,
            shipments: Number(entry.shipments) || Number(entry.count) || 0,
            teu: Number(entry.teu) || Number(entry.teuLast12m) || 0,
            spend: null,
          };
        })
        .filter(Boolean) as Array<{
        lane: string;
        shipments: number;
        teu: number;
        spend: null;
      }>;
    }
  }
  if (profile?.topRoute || profile?.top_route_12m || routeKpis?.topRouteLast12m) {
    const lane =
      profile?.topRoute ||
      profile?.top_route_12m ||
      routeKpis?.topRouteLast12m;
    if (lane && typeof lane === "string") {
      return [
        {
          lane,
          shipments:
            Number(profile?.totalShipments) ||
            Number(routeKpis?.shipmentsLast12m) ||
            0,
          teu:
            Number(profile?.teuLast12m) ||
            Number(routeKpis?.teuLast12m) ||
            0,
          spend: null,
        },
      ];
    }
  }
  return [];
}

function deriveCadence(profile: any): CadencePoint[] {
  const series = Array.isArray(profile?.timeSeries) ? profile.timeSeries : [];
  if (!series.length) return [];
  const points: CadencePoint[] = series
    .map((p: any) => {
      const label = formatMonthLabel(p?.month, p?.year);
      const fcl = Number(p?.fclShipments) || 0;
      const lcl = Number(p?.lclShipments) || 0;
      let total = fcl + lcl;
      if (total === 0) total = Number(p?.shipments) || 0;
      const teu = Number(p?.teu) || null;
      return { label, fcl, lcl, total, teu };
    })
    .filter((p: CadencePoint) => p.label);
  return points.slice(-12);
}

function deriveModes(profile: any): ModeSlice[] {
  // Prefer explicit modes; otherwise synthesize from FCL/LCL counts.
  const explicit = profile?.topModes || profile?.modes;
  if (Array.isArray(explicit) && explicit.length) {
    const total = explicit.reduce((s: number, e: any) => s + (Number(e?.count) || 0), 0);
    return explicit
      .filter((e: any) => e && (e.mode || e.name))
      .map((e: any, i: number) => ({
        mode: String(e.mode || e.name),
        count: Number(e.count) || 0,
        pct: total > 0 ? Math.round(((Number(e.count) || 0) / total) * 100) : 0,
        color: MODE_COLORS[i % MODE_COLORS.length],
      }));
  }
  const fcl = Number(profile?.containers?.fclShipments12m || profile?.fcl_shipments_all_time) || 0;
  const lcl = Number(profile?.containers?.lclShipments12m || profile?.lcl_shipments_all_time) || 0;
  const total = fcl + lcl;
  if (total === 0) return [];
  return [
    {
      mode: "Ocean FCL",
      count: fcl,
      pct: Math.round((fcl / total) * 100),
      color: MODE_COLORS[0],
    },
    {
      mode: "Ocean LCL",
      count: lcl,
      pct: Math.round((lcl / total) * 100),
      color: MODE_COLORS[1],
    },
  ];
}

function deriveContainerProfile(profile: any): ContainerProfile {
  // v200 shape: profile.containerProfile.{fcl,lcl,byLength,containerTypes,dominantContainer}
  const cp = profile?.containerProfile || profile?.container_profile || null;
  const fcl =
    Number(cp?.fcl?.shipments) ||
    Number(profile?.containers?.fclShipments12m) ||
    Number(profile?.fcl_shipments_all_time) ||
    0;
  const lcl =
    Number(cp?.lcl?.shipments) ||
    Number(profile?.containers?.lclShipments12m) ||
    Number(profile?.lcl_shipments_all_time) ||
    0;
  const totalShipments = Number(profile?.totalShipments) || fcl + lcl;
  const lengths: ContainerLength[] = [];
  const lengthSource =
    cp?.byLength ||
    profile?.container_lengths_breakdown ||
    profile?.containers_load ||
    [];
  if (Array.isArray(lengthSource)) {
    for (const entry of lengthSource) {
      const label = String(
        entry?.length || entry?.label || entry?.containerLength || entry?.code || "",
      ).trim();
      const count = Number(entry?.shipments) || Number(entry?.count) || Number(entry?.teu) || 0;
      if (!label || count <= 0) continue;
      lengths.push({
        label,
        count,
        teu: Number(entry?.teu) || undefined,
        yoy: entry?.yoy != null ? String(entry.yoy) : null,
      });
    }
  }
  if (lengths.length === 0 && profile?.topContainerLength) {
    lengths.push({
      label: String(profile.topContainerLength),
      count: Number(profile?.topContainerCount) || 0,
      teu: Number(profile?.topContainerTeu) || undefined,
    });
  }
  const isoCodes: ContainerIso[] = [];
  const isoSource =
    cp?.containerTypes ||
    profile?.container_iso_codes ||
    profile?.iso_codes ||
    null;
  if (Array.isArray(isoSource)) {
    for (const entry of isoSource) {
      const code = String(entry?.isoCode || entry?.type || entry?.code || entry?.iso || "").trim();
      if (!code) continue;
      isoCodes.push({
        code,
        group: entry?.group ? String(entry.group) : (entry?.length ? String(entry.length) : undefined),
        count: Number(entry?.shipments) || Number(entry?.count) || Number(entry?.teu) || 0,
      });
    }
  }
  const dominant =
    cp?.dominantContainer?.length ||
    cp?.dominantContainer?.type ||
    cp?.dominantContainer?.isoCode ||
    profile?.topContainerLength ||
    (lengths[0]?.label ?? null);
  return {
    fcl,
    lcl,
    totalShipments,
    topContainerLabel: dominant || null,
    lengths,
    isoCodes,
  };
}

function deriveCarriers(profile: any, recentBols: any[]): CarrierRow[] {
  // Prefer a normalized profile.topCarriers list when the backend supplies it.
  const explicit = profile?.topCarriers || profile?.carriers;
  if (Array.isArray(explicit) && explicit.length) {
    const total = explicit.reduce((s: number, e: any) => s + (Number(e?.count) || 0), 0);
    return explicit
      .filter((e: any) => e && (e.name || e.label))
      .map((e: any) => ({
        name: String(e.name || e.label),
        scac: e?.scac || null,
        shipments: Number(e?.count) || Number(e?.shipments) || 0,
        teu: Number(e?.teu) || null,
        trend: e?.trend || null,
        up: typeof e?.up === "boolean" ? e.up : null,
        inferred: Boolean(e?.inferred),
      }))
      .sort((a, b) => b.shipments - a.shipments)
      .slice(0, 8)
      .map((c) => ({
        ...c,
        // share computed at render time; total kept for ratio
        teu: c.teu,
        // ensure inferred is bool
        inferred: c.inferred,
        // share of sum
        // (kept on row for clarity but unused below)
        ...{ _total: total },
      }))
      .map(({ _total, ...rest }) => rest);
  }
  // Otherwise aggregate carriers found directly on recent BOLs (no MBL
  // prefix inference here — we surface only what the row already names).
  const counts = new Map<string, { ship: number; teu: number; inferred: boolean }>();
  for (const bol of recentBols) {
    const c = readCarrier(bol);
    if (!c) continue;
    const key = c.name;
    const cur = counts.get(key) || { ship: 0, teu: 0, inferred: c.inferred };
    cur.ship += 1;
    cur.teu += Number(bol?.teu) || 0;
    cur.inferred = cur.inferred || c.inferred;
    counts.set(key, cur);
  }
  return Array.from(counts.entries())
    .map(([name, v]) => ({
      name,
      scac: null,
      shipments: v.ship,
      teu: v.teu > 0 ? v.teu : null,
      trend: null,
      up: null,
      inferred: v.inferred,
    }))
    .sort((a, b) => b.shipments - a.shipments)
    .slice(0, 6);
}

function deriveForwarders(profile: any, recentBols: any[]): ForwarderRow[] {
  const explicit =
    profile?.topForwarders || profile?.forwarders || profile?.serviceProviders;
  const fromExplicit: ForwarderRow[] = Array.isArray(explicit)
    ? explicit
        .filter((e: any) => e && (e.name || e.label))
        .map((e: any) => ({
          name: String(e.name || e.label),
          roles: Array.isArray(e?.roles)
            ? e.roles.map((r: any) => String(r))
            : e?.role
              ? [String(e.role)]
              : [],
          shipments: Number(e?.count) || Number(e?.shipments) || 0,
          teu: Number(e?.teu) || null,
          lastShipment: e?.last_shipment || null,
          countries: Array.isArray(e?.countries) ? e.countries : undefined,
        }))
    : [];
  if (fromExplicit.length) {
    return fromExplicit.sort((a, b) => b.shipments - a.shipments).slice(0, 6);
  }
  // Fall back to aggregating shipper / notify-party / supplier names that
  // appear most often on recent BOLs. Each role contributes a different
  // pill in the resulting rows.
  const counts = new Map<
    string,
    { ship: number; teu: number; roles: Set<string>; last: string | null; countries: Set<string> }
  >();
  for (const bol of recentBols) {
    const date = getBolDate(bol);
    const country =
      bol?.supplier_country || bol?.origin_country || bol?.raw?.country || "";
    const roleEntries: Array<{ role: string; name: string | null }> = [
      { role: "Shipper", name: bol?.shipper_name || bol?.raw?.shipper_name || null },
      { role: "Notify", name: bol?.notify_party || bol?.raw?.notify_party_name || null },
      { role: "Supplier", name: bol?.supplier || bol?.supplier_name || null },
      { role: "Customs", name: bol?.customs_party || bol?.raw?.customs_party || null },
    ];
    for (const r of roleEntries) {
      const name = r.name && String(r.name).trim();
      if (!name) continue;
      const existing = counts.get(name) || {
        ship: 0,
        teu: 0,
        roles: new Set<string>(),
        last: null,
        countries: new Set<string>(),
      };
      existing.ship += 1;
      existing.teu += Number(bol?.teu) || 0;
      existing.roles.add(r.role);
      if (country) existing.countries.add(String(country));
      if (date && (!existing.last || new Date(date) > new Date(existing.last))) {
        existing.last = date;
      }
      counts.set(name, existing);
    }
  }
  return Array.from(counts.entries())
    .map(([name, v]) => ({
      name,
      roles: Array.from(v.roles),
      shipments: v.ship,
      teu: v.teu > 0 ? v.teu : null,
      lastShipment: v.last,
      countries: Array.from(v.countries),
    }))
    .sort((a, b) => b.shipments - a.shipments)
    .slice(0, 6);
}

function deriveSuppliers(profile: any, recentBols: any[] = []): SupplierRow[] {
  // Phase 5.1 — prefer service_provider_mix.suppliers (v200 parser, has counts)
  // over the flat string-only top_suppliers list.
  const structured =
    profile?.serviceProviderMix?.suppliers ||
    profile?.service_provider_mix?.suppliers ||
    null;
  const list =
    (Array.isArray(structured) && structured.length > 0
      ? structured.map((s: any) => ({
          name: s?.providerName ?? s?.name ?? null,
          shipments: Number(s?.shipments) || 0,
          country: s?.countryCode ?? s?.country_code ?? s?.country ?? "",
        }))
      : null) ||
    profile?.topSuppliers ||
    profile?.suppliers ||
    profile?.suppliers_sample ||
    [];
  // Phase 6 — when the explicit list has counts, use it; when it's a
  // bare string array, aggregate counts from recentBols using
  // getBolSupplier so the UI doesn't render "0% · 0 ship". Falls back to
  // BOL-only aggregation when no explicit list is present at all.
  if (Array.isArray(list) && list.length > 0) {
    const hasCounts = list.some(
      (e: any) =>
        typeof e !== "string" &&
        (Number(e?.shipments) > 0 || Number(e?.count) > 0),
    );
    if (hasCounts) {
      const totalShip = list.reduce(
        (s: number, e: any) =>
          s + (typeof e === "string" ? 0 : Number(e?.shipments || e?.count) || 0),
        0,
      );
      return list
        .map((e: any) => {
          const isString = typeof e === "string";
          const name = isString ? e : String(e?.name || e?.label || "");
          if (!name) return null;
          const ship = isString ? 0 : Number(e?.shipments || e?.count) || 0;
          const country = isString
            ? ""
            : String(e?.countryCode || e?.country_code || e?.country || "");
          return {
            name,
            country,
            shipments: ship,
            share: totalShip > 0 ? Math.round((ship / totalShip) * 100) : 0,
          };
        })
        .filter(Boolean) as SupplierRow[];
    }
    // String-only list: aggregate counts from recentBols where supplier
    // matches one of these names; if no recentBols provided, return
    // names with no count (caller renders without 0% · 0 ship).
    const nameSet = new Set(
      list
        .map((e: any) => (typeof e === "string" ? e : String(e?.name || e?.label || "")))
        .filter(Boolean)
        .map((n: string) => n.toLowerCase()),
    );
    const counts = new Map<string, { ship: number; country: string }>();
    for (const bol of recentBols) {
      const supplier = getBolSupplier(bol);
      if (!supplier || supplier === "—") continue;
      if (!nameSet.has(supplier.toLowerCase())) continue;
      const cur = counts.get(supplier) || {
        ship: 0,
        country: bol?.supplier_country || bol?.origin_country || "",
      };
      cur.ship += 1;
      counts.set(supplier, cur);
    }
    const totalShip = Array.from(counts.values()).reduce(
      (s, v) => s + v.ship,
      0,
    );
    if (totalShip > 0) {
      return Array.from(counts.entries())
        .map(([name, v]) => ({
          name,
          country: v.country,
          shipments: v.ship,
          share: totalShip > 0 ? Math.round((v.ship / totalShip) * 100) : 0,
        }))
        .sort((a, b) => b.shipments - a.shipments);
    }
    // Truly no counts available — surface names with `shipments: -1`
    // sentinel; the supplier card reads it as "no stat to show".
    return list
      .map((e: any) => {
        const isString = typeof e === "string";
        const name = isString ? e : String(e?.name || e?.label || "");
        if (!name) return null;
        return {
          name,
          country: isString
            ? ""
            : String(e?.countryCode || e?.country_code || e?.country || ""),
          shipments: -1,
          share: -1,
        };
      })
      .filter(Boolean) as SupplierRow[];
  }
  // No explicit list — aggregate purely from recentBols.
  if (!Array.isArray(recentBols) || recentBols.length === 0) return [];
  const counts = new Map<string, { ship: number; country: string }>();
  for (const bol of recentBols) {
    const supplier = getBolSupplier(bol);
    if (!supplier || supplier === "—") continue;
    const cur = counts.get(supplier) || {
      ship: 0,
      country: bol?.supplier_country || bol?.origin_country || "",
    };
    cur.ship += 1;
    counts.set(supplier, cur);
  }
  const total = Array.from(counts.values()).reduce((s, v) => s + v.ship, 0);
  return Array.from(counts.entries())
    .map(([name, v]) => ({
      name,
      country: v.country,
      shipments: v.ship,
      share: total > 0 ? Math.round((v.ship / total) * 100) : 0,
    }))
    .sort((a, b) => b.shipments - a.shipments)
    .slice(0, 6);
}

function deriveProducts(profile: any, recentBols: any[] = []): ProductRow[] {
  // v200 hsProfile is an object with topChapters[] + topHsChapter; expand to flat list
  const hsObj =
    (profile?.hsProfile && typeof profile.hsProfile === "object" && !Array.isArray(profile.hsProfile))
      ? profile.hsProfile
      : (profile?.hs_profile && typeof profile.hs_profile === "object" && !Array.isArray(profile.hs_profile))
        ? profile.hs_profile
        : null;
  const list =
    profile?.topProducts ||
    profile?.products ||
    profile?.commodities ||
    profile?.hs_categories ||
    profile?.productProfile?.topProducts ||
    profile?.product_profile?.topProducts ||
    (hsObj?.topChapters && Array.isArray(hsObj.topChapters) ? hsObj.topChapters : null) ||
    (Array.isArray(profile?.hs_profile) ? profile.hs_profile : null) ||
    (Array.isArray(profile?.hsProfile) ? profile.hsProfile : null) ||
    profile?.productBreakdown ||
    [];
  if (Array.isArray(list) && list.length > 0) {
    return list
      .map((e: any) => {
        const label = String(
          e?.description ||
            e?.label ||
            e?.name ||
            e?.commodity ||
            e?.product ||
            e?.hsCode ||
            e?.hs_code ||
            "",
        ).trim();
        if (!label) return null;
        return {
          label,
          count:
            Number(e?.shipments12m) ||
            Number(e?.shipments) ||
            Number(e?.count) ||
            0,
          hsCode: e?.hsCode || e?.hs_code || e?.code || null,
        };
      })
      .filter(Boolean)
      .sort((a: any, b: any) => b.count - a.count)
      .slice(0, 8) as ProductRow[];
  }
  // Phase 6 — aggregate from recentBols descriptions/HS when the
  // backend hasn't surfaced topProducts yet.
  if (!Array.isArray(recentBols) || recentBols.length === 0) return [];
  const counts = new Map<string, { count: number; hs?: string }>();
  for (const bol of recentBols) {
    const desc = getBolDescription(bol);
    const hs = getBolHs(bol);
    const safeHs = hs && hs !== "—" ? hs : undefined;
    const label = String(desc || "").trim();
    if (!label) continue;
    const trimmed = label.length > 80 ? label.slice(0, 80) + "…" : label;
    const cur = counts.get(trimmed) || { count: 0, hs: safeHs };
    cur.count += 1;
    if (!cur.hs && safeHs) cur.hs = safeHs;
    counts.set(trimmed, cur);
  }
  return Array.from(counts.entries())
    .map(([label, v]) => ({ label, count: v.count, hsCode: v.hs ?? null }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);
}

function bolMatchesLane(bol: any, lane: any): boolean {
  const fromName = String(lane?.fromMeta?.countryName || "").toLowerCase();
  const toName = String(lane?.toMeta?.countryName || "").toLowerCase();
  const origin = String(
    bol?.supplier_country || bol?.origin_country || bol?.raw?.country || "",
  ).toLowerCase();
  const destination = String(
    bol?.destination_country || bol?.us_port_country || "us",
  ).toLowerCase();
  const matchFrom = Boolean(
    fromName && origin && (origin.includes(fromName) || fromName.includes(origin)),
  );
  const matchTo = Boolean(
    toName && destination && (destination.includes(toName) || toName.includes(destination)),
  );
  return matchFrom || matchTo;
}

function formatMonthLabel(month: any, _year: any) {
  if (!month) return "";
  const str = String(month).trim();
  if (/^\d{4}-\d{2}$/.test(str)) {
    const date = new Date(`${str}-01`);
    if (!Number.isNaN(date.getTime())) {
      return date.toLocaleDateString("en-US", { month: "short" });
    }
  }
  if (/^\d+$/.test(str)) {
    const m = Number(str);
    if (m >= 1 && m <= 12) {
      const date = new Date(2024, m - 1, 1);
      return date.toLocaleDateString("en-US", { month: "short" });
    }
  }
  // Already a short month label like "Jan"
  if (str.length <= 4) return str;
  // Long month name — truncate
  return str.slice(0, 3);
}

function formatRelativeShort(value: any) {
  if (!value) return "—";
  const t = new Date(value).getTime();
  if (!Number.isFinite(t)) return "—";
  const delta = Date.now() - t;
  if (delta < 0) return "—";
  const day = 24 * 60 * 60 * 1000;
  if (delta < day) return "today";
  if (delta < 2 * day) return "yesterday";
  if (delta < 30 * day) return `${Math.round(delta / day)} days ago`;
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function trendIsPositive(trend: any): boolean | null {
  if (!trend) return null;
  const str = String(trend).trim();
  if (str.startsWith("+")) return true;
  if (str.startsWith("-") || str.startsWith("−") || str.startsWith("↓")) return false;
  if (str.toLowerCase().startsWith("new")) return true;
  return null;
}

function roleToTone(role: string): "blue" | "green" | "purple" | "amber" | "slate" {
  const r = role.toLowerCase();
  if (r.includes("ship")) return "blue";
  if (r.includes("supp")) return "green";
  if (r.includes("notif")) return "purple";
  if (r.includes("cust")) return "amber";
  return "slate";
}

const PROVIDER_COLORS = [
  "#3B82F6",
  "#6366F1",
  "#8B5CF6",
  "#0EA5E9",
  "#10B981",
  "#F59E0B",
];

const MODE_COLORS = ["#3B82F6", "#67E8F9", "#8B5CF6", "#10B981", "#F59E0B"];