import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowRight,
  Sparkles,
  Info,
  Container,
} from "lucide-react";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
} from "recharts";
import LitSectionCard from "@/components/ui/LitSectionCard";
import LitFlag from "@/components/ui/LitFlag";
import LitPill from "@/components/ui/LitPill";
import ServiceModeChip from "@/components/intel/ServiceModeChip";
import { SupplyChainFilterProvider } from "@/components/intel/SupplyChainFilterContext";
import ServiceModeFilterChips from "@/components/intel/ServiceModeFilterChips";
import DataFreshnessChip from "@/components/intel/cards/DataFreshnessChip";
import ServiceModeDonut from "@/components/intel/cards/ServiceModeDonut";
import TopTradePartnersBar from "@/components/intel/cards/TopTradePartnersBar";
import MxTransborderKpi from "@/components/intel/cards/MxTransborderKpi";
import UsExportKpi from "@/components/intel/cards/UsExportKpi";
import LaneMixStackedBar from "@/components/intel/cards/LaneMixStackedBar";
import LaneYoyBarChart from "@/components/intel/cards/LaneYoyBarChart";
import DomesticInlandLegCard from "@/components/intel/cards/DomesticInlandLegCard";
import SupplierConcentrationDonut from "@/components/intel/cards/SupplierConcentrationDonut";
import CustomsBrokerMixSubcard from "@/components/intel/cards/CustomsBrokerMixSubcard";
import HsCodeTopBar from "@/components/intel/cards/HsCodeTopBar";
import { useDomesticInlandLeg, useMxImportActivity } from "@/api/intel";
import BuyingIntentTile from "@/components/intent/BuyingIntentTile";
import GlobeCanvas, { type GlobeLane } from "@/components/GlobeCanvas";
import LaneMap from "@/components/LaneMap";
import LaneViewToggle from "@/components/LaneViewToggle";
import { useLaneViewMode } from "@/hooks/useLaneViewMode";
import { canonicalizeLanes, resolveEndpoint } from "@/lib/laneGlobe";
import {
  aggregateSuppliers,
  supplierNameToSlug,
  type SupplierRow as SupplierAggregateRow,
} from "@/lib/suppliers/aggregate";
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

type SubTabId = "summary" | "lanes" | "suppliers" | "products";

const SUB_TABS: { id: SubTabId; label: string }[] = [
  { id: "summary", label: "Summary" },
  { id: "lanes", label: "Trade Lanes" },
  { id: "suppliers", label: "Suppliers" },
  { id: "products", label: "Products" },
];

type CDPSupplyChainProps = {
  profile?: any;
  routeKpis?: any;
  selectedYear?: number;
  years?: number[];
  onSelectYear?: (year: number) => void;
  onOpenPulseLive?: () => void;
  /** Resolved canonical company name — passed down from CompanyProfileV2 so
   *  the Premium-Intel-folded cards (MX transborder, US export, broker mix,
   *  lane carrier mix, YoY, supplier concentration, top trade partners) can
   *  query their PowerQuery-backed RPCs without re-deriving the name. */
  companyName?: string | null;
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
export default function CDPSupplyChain(props: CDPSupplyChainProps) {
  // Wrap the whole tab in the filter context so the chip strip + every chart
  // share `activeMode` / `selectedHs`. Provider must live OUTSIDE the inner
  // body component so the body itself can `useSupplyChainFilter()`.
  return (
    <SupplyChainFilterProvider>
      <CDPSupplyChainBody {...props} />
    </SupplyChainFilterProvider>
  );
}

function CDPSupplyChainBody({
  profile,
  routeKpis,
  selectedYear,
  years,
  onSelectYear,
  onOpenPulseLive,
  companyName: companyNameProp,
}: CDPSupplyChainProps) {
  const [sub, setSub] = useState<SubTabId>("summary");
  const companyName =
    (companyNameProp && String(companyNameProp).trim()) ||
    (profile?.companyName as string) ||
    (profile?.name as string) ||
    (profile?.identity?.companyName as string) ||
    "";

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
      return `${fromName} → ${toName} carries ${share}% of recent import volume.`;
    }
    return `${fromName} → ${toName} is the dominant lane.`;
  }, [allLanes]);

  return (
    <div className="flex flex-col gap-3.5">
      {/* Top header strip — filter chips (left) + freshness chip (right). The
          filter chips drive `SupplyChainFilterContext.activeMode` so child
          charts can scope. */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <ServiceModeFilterChips />
        <DataFreshnessChip />
      </div>

      {/* Sub-tabs (left) + year selector (right). Sub-tab styling uses the
          same blue language as the main tab row above so the visual
          hierarchy reads as "tab → sub-tab" instead of two competing pill
          groups. Year selector is pulled out as its own chip on the right
          with a calendar icon affordance. */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex items-center gap-0.5 rounded-lg border border-slate-200 bg-white p-0.5 shadow-sm">
          {SUB_TABS.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setSub(s.id)}
              className={[
                "font-display whitespace-nowrap rounded-md px-3 py-1.5 text-[12px] font-semibold transition-colors",
                sub === s.id
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900",
              ].join(" ")}
            >
              {s.label}
            </button>
          ))}
        </div>
        {Array.isArray(years) && years.length > 1 && onSelectYear && (
          <label className="font-display inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 shadow-sm">
            <svg
              width="11"
              height="11"
              viewBox="0 0 16 16"
              fill="none"
              aria-hidden
              className="text-slate-400"
            >
              <rect x="2" y="3" width="12" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.4"/>
              <path d="M2 6h12M5.5 2v2M10.5 2v2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
            </svg>
            <span className="text-slate-500">Year</span>
            <select
              value={selectedYear ?? years[0]}
              onChange={(e) => onSelectYear(Number(e.target.value))}
              className="font-mono cursor-pointer appearance-none bg-transparent text-[11.5px] font-bold text-slate-900 focus:outline-none"
            >
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
            <svg
              width="9"
              height="9"
              viewBox="0 0 16 16"
              fill="none"
              aria-hidden
              className="text-slate-400"
            >
              <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </label>
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
          onOpenLanesTab={() => setSub("lanes")}
          companyName={companyName}
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
          companyName={companyName}
        />
      )}
      {sub === "suppliers" && (
        <SuppliersView
          profile={profile}
          recentBols={recentBols}
          companyName={companyName}
        />
      )}
      {sub === "products" && (
        <ProductsView products={products} recentBols={recentBols} />
      )}
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
          Recent activity
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
            across this account's recent import history.
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
  profile: _profile,
  cadence,
  modes: _modes,
  containerProfile,
  recentBols,
  carriers: _carriers,
  suppliers: _suppliers,
  canonicalLanes,
  globeLanes,
  onOpenPulseLive,
  onOpenLanesTab,
  companyName,
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
  onOpenLanesTab?: () => void;
  companyName: string;
}) {
  const reducedMotion = usePrefersReducedMotion();

  // Derive the seven-mode shipment counts that feed the ServiceModeDonut.
  // Ocean from container profile (fcl+lcl), Air/Truck/Rail from MX transport
  // type strings. Drayage/Domestic come from the domestic inland-leg RPC.
  // Broker = MX declarations with a customs_broker_name set.
  const { data: mxRows } = useMxImportActivity(companyName || null);
  const { data: domesticRows } = useDomesticInlandLeg(companyName || null);
  const donutCounts = useMemo(() => {
    const counts = {
      ocean: containerProfile.fcl + containerProfile.lcl,
      air: 0,
      truck: 0,
      rail: 0,
      drayage: 0,
      broker: 0,
      domestic: 0,
    };
    for (const r of mxRows || []) {
      const m = String(r.transport_type || "").toLowerCase();
      if (m.includes("air")) counts.air += 1;
      else if (m.includes("rail") || m.includes("ferrocarril")) counts.rail += 1;
      else if (m.includes("sea") || m.includes("ocean")) counts.ocean += 1;
      else counts.truck += 1;
      if ((r.customs_broker_name || "").trim()) counts.broker += 1;
    }
    for (const d of domesticRows || []) {
      const m = String(d.est_mode || "").toLowerCase();
      if (m.startsWith("inter")) counts.drayage += (d.shipment_count || 0);
      else counts.domestic += (d.shipment_count || 0);
    }
    return counts;
  }, [containerProfile.fcl, containerProfile.lcl, mxRows, domesticRows]);

  // Per-lane TEU totals — used by LaneMixStackedBar's right rail. Derived
  // from recentBols + canonicalLanes country-pair match.
  // (Calculated here so the same data feeds both Summary's KPIs and Lanes'
  // stacked bar consumers via the LaneMix component pulling its own data.)

  // Consolidated Summary order (post-rebuild):
  //   1. BuyingIntentTile
  //   2. ServiceModeDonut (interactive — drives filter)
  //   3. TopLanesCard (globe + lane list + container mix)
  //   4. CadenceAndModalMix (area chart + small donut)
  //   5. MxTransborderKpi + UsExportKpi (compact KPIs side-by-side)
  //   6. TopTradePartnersBar (PowerQuery top-5 suppliers)
  //   7. RecentActivityCards
  return (
    <>
      <BuyingIntentTile profile={_profile} recentBols={recentBols} />
      <TopLanesCard
        canonicalLanes={canonicalLanes}
        globeLanes={globeLanes}
        recentBols={recentBols}
        containerProfile={containerProfile}
        reducedMotion={reducedMotion}
        onOpenLanesTab={onOpenLanesTab}
      />
      <CadenceAndModalMix
        cadence={cadence}
        containerProfile={containerProfile}
        reducedMotion={reducedMotion}
        companyName={companyName || null}
        donutCounts={donutCounts}
      />
      {companyName && (
        <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2">
          <MxTransborderKpi companyName={companyName} />
          <UsExportKpi companyName={companyName} />
        </div>
      )}
      {companyName && (
        <TopTradePartnersBar companyName={companyName} />
      )}
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

/* ── A. Cadence & Modal Mix ───────────────────────────────────────────── */

function CadenceAndModalMix({
  cadence,
  containerProfile,
  reducedMotion,
  companyName,
  donutCounts,
}: {
  cadence: CadencePoint[];
  containerProfile: ContainerProfile;
  reducedMotion: boolean;
  companyName: string | null;
  donutCounts: {
    ocean: number;
    air: number;
    truck: number;
    rail: number;
    drayage: number;
    broker: number;
    domestic: number;
  };
}) {
  // Air count: derived from MX customs import declarations where
  // transport_type = 'Air'. ImportYeti's US-import feed does NOT track air
  // freight, so the disclosure below explains the coverage gap when no MX
  // air rows are on file. We never fake an air value — no air:0 hardcode.
  const { data: mxRows } = useMxImportActivity(companyName);
  const { data: domesticRows } = useDomesticInlandLeg(companyName);
  const mxAirCount = useMemo(() => {
    if (!Array.isArray(mxRows)) return 0;
    return mxRows.filter(
      (r) => String(r.transport_type || "").toLowerCase().includes("air"),
    ).length;
  }, [mxRows]);
  const hasMxAir = mxAirCount > 0;
  const hasDomestic = Array.isArray(domesticRows) && domesticRows.length > 0;

  // Active service modes — derived from real signal in this account. Drives
  // the "Service modes covered" chip strip above the chart. The "domestic"
  // chip surfaces whenever there's at least one US inland leg on file (port
  // -> destination city), giving the user visibility into the post-arrival
  // truck/intermodal/rail movement that ImportYeti's BOL feed alone can't
  // distinguish.
  const activeModes = useMemo(() => {
    const modes: Array<"ocean" | "air" | "truck" | "rail" | "domestic"> = [];
    if (containerProfile.fcl > 0 || containerProfile.lcl > 0) modes.push("ocean");
    if (hasMxAir) modes.push("air");
    const truckLike = (mxRows || []).some((r) =>
      /(truck|rail|carretera|ferrocarril)/i.test(String(r.transport_type || "")),
    );
    const railOnly = (mxRows || []).some((r) =>
      /(rail|ferrocarril|tren)/i.test(String(r.transport_type || "")),
    );
    if (truckLike && !railOnly) modes.push("truck");
    if (railOnly) modes.push("rail");
    if (hasDomestic) modes.push("domestic");
    return modes;
  }, [containerProfile.fcl, containerProfile.lcl, hasMxAir, mxRows, hasDomestic]);

  // Stacked area data: FCL/LCL come from cadence; Air is the per-row
  // average from MX air rows, spread across the cadence buckets. We don't
  // pretend to know the time distribution — when MX rows lack a per-month
  // breakdown, we leave each bucket's air bar at 0 and let the disclosure
  // carry the air signal.
  const chartData = cadence.map((c) => ({
    label: c.label,
    fcl: c.fcl,
    lcl: c.lcl,
    air: 0,
  }));

  const fcl = containerProfile.fcl;
  const lcl = containerProfile.lcl;
  // Air slice: real MX-derived count. NEVER hardcoded — when zero, the
  // donut hides the slice entirely (no fake 0% wedge) and a disclosure
  // chip renders below the chart explaining the ImportYeti coverage gap.
  const air = mxAirCount;
  const total = fcl + lcl + air;
  const donut = [
    { name: "FCL", value: fcl, color: "#0EA5E9" },
    { name: "LCL", value: lcl, color: "#F59E0B" },
    // Only push the air slice when there's REAL air data — no 0% wedges.
    ...(air > 0 ? [{ name: "Air", value: air, color: "#8B5CF6" }] : []),
  ].filter((s) => s.value > 0);

  if (cadence.length === 0 && total === 0) {
    return (
      <LitSectionCard title="Cadence & Modal Mix" sub="Trailing 12 months · click a slice to filter">
        <EmptyMessage text="No cadence data on file yet — try Refresh Intel to pull the latest shipments." />
      </LitSectionCard>
    );
  }

  return (
    <LitSectionCard title="Cadence & Modal Mix" sub="Trailing 12 months · click a slice to filter">
      {/* Service modes covered — derived from real signal in this account.
          Replaces the prior implicit FCL/LCL-only framing so the user can
          see at a glance which legs LIT has coverage for on this shipper. */}
      {activeModes.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="font-display text-[9px] font-bold uppercase tracking-[0.1em] text-slate-400">
            Service modes covered
          </span>
          <div className="flex flex-wrap gap-1.5">
            {activeModes.map((m) => (
              <ServiceModeChip key={m} mode={m} size="xs" />
            ))}
          </div>
        </div>
      )}
      <div className="flex flex-col gap-4 md:flex-row">
        {/* Left 60% — stacked area */}
        <div className="min-w-0 flex-1 md:basis-[60%]">
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
                    <stop offset="0%" stopColor="#8B5CF6" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="#8B5CF6" stopOpacity={0.05} />
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
                  animationDuration={reducedMotion ? 0 : 1600}
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
                  animationDuration={reducedMotion ? 0 : 1600}
                  animationBegin={0}
                />
                {hasMxAir && (
                  <Area
                    type="monotone"
                    dataKey="air"
                    stackId="1"
                    stroke="#8B5CF6"
                    fill="url(#cad-air)"
                    name="Air"
                    isAnimationActive={!reducedMotion}
                    animationDuration={reducedMotion ? 0 : 1600}
                    animationBegin={0}
                  />
                )}
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <LegendDot color="#0EA5E9" label="FCL" />
            <LegendDot color="#F59E0B" label="LCL" />
            {hasMxAir ? (
              <LegendDot color="#8B5CF6" label={`Air · ${mxAirCount} MX`} />
            ) : (
              // Honest disclosure — no air series, no fake 0% slice. The
              // ImportYeti US-import feed doesn't carry air freight; we say
              // so explicitly with a tooltip that explains the coverage gap.
              <span
                className="font-display inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-1.5 py-[2px] text-[10px] font-semibold text-slate-500"
                title="Air freight is not tracked in the US-import BOL feed (ImportYeti coverage). When MX customs declarations carry transport_type='Air' for this importer, this chip flips to the live count."
              >
                <Info className="h-2.5 w-2.5" aria-hidden />
                Air freight not tracked for US imports
              </span>
            )}
          </div>
        </div>

        {/* Right 40% — interactive ServiceModeDonut (drives tab filter) */}
        <div className="flex min-w-0 flex-col md:basis-[40%]">
          <ServiceModeDonut counts={donutCounts} embedded />
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

/* ── Container Mix (merged into TopLanesCard) ─────────────────────────── */

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
                  : `width 1400ms ease-out ${seg.idx * 200}ms`,
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

/* ── B. Recent Activity Cards ─────────────────────────────────────────── */

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
      <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2 lg:grid-cols-5">
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
    const id = window.setTimeout(() => setMounted(true), 16 + index * 150);
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
          : "opacity 560ms ease-out, transform 560ms ease-out",
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
  companyName,
}: {
  canonicalLanes: any[];
  globeLanes?: any[];
  carriers: CarrierRow[];
  forwarders: ForwarderRow[];
  containerProfile: ContainerProfile;
  recentBols: any[];
  companyName: string;
}) {
  // Per-lane TEU totals derived from recent BOLs that match a lane's
  // country pair. Passed to LaneMixStackedBar so its right-rail can show
  // total TEU per lane next to the carrier-mix bar.
  const laneTeuTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const lane of canonicalLanes) {
      const fromLabel = laneEndpointLabel(lane.fromMeta, undefined);
      const toLabel = laneEndpointLabel(lane.toMeta, undefined);
      const key = `${fromLabel} → ${toLabel}`;
      let teuSum = 0;
      for (const b of recentBols) {
        if (!bolMatchesLane(b, lane)) continue;
        teuSum += Number(b?.teu) || Number(b?.containers_teu) || 0;
      }
      if (teuSum > 0) totals[key] = teuSum;
    }
    return totals;
  }, [canonicalLanes, recentBols]);

  // Trade Lanes tab — premium charted views first, then the legacy table.
  //   1. LaneMixStackedBar (top lanes × top-3 carriers)
  //   2. LaneYoyBarChart (YoY trailing/prior/prior-prior)
  //   3. DomesticInlandLegCard (port-of-entry → destination)
  //   4. CombinedLaneIntelligenceTable (full table — operator drill-down)
  return (
    <>
      {companyName && (
        <LaneMixStackedBar
          companyName={companyName}
          laneTeuTotals={laneTeuTotals}
        />
      )}
      {companyName && <LaneYoyBarChart companyName={companyName} />}
      {companyName && <DomesticInlandLegCard companyName={companyName} />}
      <CombinedLaneIntelligenceTable
        canonicalLanes={canonicalLanes}
        carriers={carriers}
        forwarders={forwarders}
        containerProfile={containerProfile}
        recentBols={recentBols}
      />
    </>
  );
}

/* ── Products view ────────────────────────────────────────────────────── */

/* ── Suppliers view (F1 — Wk1) ──────────────────────────────────────── */

function SuppliersView({
  profile,
  recentBols,
  companyName,
}: {
  profile: any;
  recentBols: any[];
  companyName: string;
}) {
  const navigate = useNavigate();
  // F1: full supplier list (limit=Infinity), paginated client-side. Top 50
  // visible; "Show more" reveals next 50. No virtualization in v1 — Finding
  // 4.1 / Q1 from /plan-eng-review locked pagination over react-window
  // because 99% of receivers have <50 suppliers.
  const allSuppliers = useMemo(
    () => aggregateSuppliers(profile, recentBols, { limit: Infinity }),
    [profile, recentBols],
  );
  const [visibleCount, setVisibleCount] = useState(50);
  const [openSupplier, setOpenSupplier] = useState<SupplierAggregateRow | null>(null);

  const visible = allSuppliers.slice(0, visibleCount);
  const hasMore = visibleCount < allSuppliers.length;

  // BOLs filtered to the open supplier — passed to the drawer + the
  // SupplierProfile page (via location.state) so the navigation has real
  // data the moment the page mounts.
  const supplierBols = useMemo(() => {
    if (!openSupplier) return [];
    const want = openSupplier.name.toLowerCase();
    return recentBols.filter((b) => {
      const s = getBolSupplier(b);
      return s && s.toLowerCase() === want;
    });
  }, [openSupplier, recentBols]);

  // Display fallback for the supplier subtitle when the parent didn't pass a
  // resolved companyName (renders as "this receiver" rather than a blank).
  const displayCompanyName =
    companyName ||
    (profile?.companyName as string) ||
    (profile?.name as string) ||
    "this receiver";
  const companyId =
    (profile?.companyId as string) || (profile?.id as string) || null;

  if (allSuppliers.length === 0) {
    return (
      <LitSectionCard title="Suppliers" sub="From shipment history">
        <div className="px-6 py-10 text-center">
          <p className="font-display text-[12px] font-semibold text-slate-700">
            No supplier shipments on file for the last 12 months
          </p>
          <p className="font-body mt-1 text-[11px] text-slate-500">
            Try <strong>Refresh Intel</strong> to pull the latest BOLs into
            this account.
          </p>
        </div>
      </LitSectionCard>
    );
  }

  return (
    <>
      {companyName && (
        <SupplierConcentrationDonut companyName={companyName} />
      )}
      {companyName && (
        <CustomsBrokerMixSubcard companyName={companyName} />
      )}
      <LitSectionCard
        title={`${allSuppliers.length.toLocaleString()} unique suppliers`}
        sub={`Shipping to ${displayCompanyName} in the last 12 months · ranked by share`}
        padded={false}
      >
        <div className="max-h-[680px] overflow-y-auto">
          {visible.map((s, i) => (
            <SupplierRowFull
              key={`${s.name}-${i}`}
              supplier={s}
              index={i}
              onOpen={() => setOpenSupplier(s)}
            />
          ))}
        </div>
        {hasMore && (
          <div className="border-t border-slate-100 px-3 py-2.5 sm:px-4">
            <button
              type="button"
              onClick={() => setVisibleCount((c) => c + 50)}
              className="font-display w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-[11.5px] font-semibold text-slate-700 transition-colors hover:bg-slate-50"
            >
              Show more ({visibleCount} of {allSuppliers.length} visible)
            </button>
          </div>
        )}
      </LitSectionCard>
      <SupplierDrawer
        supplier={openSupplier}
        supplierBols={supplierBols}
        receiverName={displayCompanyName}
        receiverId={companyId}
        onClose={() => setOpenSupplier(null)}
        onOpenFullProfile={() => {
          if (!openSupplier) return;
          const slug = supplierNameToSlug(openSupplier.name);
          navigate(`/app/suppliers/${slug}`, {
            state: {
              supplier: openSupplier,
              supplierBols,
              originReceiver: {
                id: companyId || undefined,
                name: displayCompanyName,
              },
            },
          });
        }}
      />
    </>
  );
}

function SupplierRowFull({
  supplier,
  index,
  onOpen,
}: {
  supplier: SupplierAggregateRow;
  index: number;
  onOpen: () => void;
}) {
  const hasShare = supplier.share >= 0;
  const hasShipments = supplier.shipments >= 0;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="grid w-full items-center gap-2.5 border-b border-slate-100 px-3 py-2.5 text-left transition-colors last:border-b-0 hover:bg-slate-50/60 sm:px-4"
      style={{
        gridTemplateColumns: "20px 18px minmax(0,1fr) 70px 80px",
      }}
    >
      <span className="font-mono shrink-0 text-[10px] text-slate-400">
        #{index + 1}
      </span>
      <LitFlag code={supplier.country} size={14} label={supplier.country} />
      <div className="min-w-0">
        <div className="font-display truncate text-[12px] font-semibold text-slate-900">
          {supplier.name}
        </div>
        <div className="font-mono mt-0.5 text-[10px] text-slate-500">
          {supplier.country || "Unknown country"}
        </div>
      </div>
      <div className="text-right">
        {hasShipments && (
          <span className="font-mono text-[11px] font-bold text-slate-900">
            {supplier.shipments.toLocaleString()}
          </span>
        )}
      </div>
      <div className="flex flex-col items-end gap-1 sm:flex">
        {hasShare && (
          <>
            <div className="hidden h-1 w-[68px] overflow-hidden rounded bg-slate-100 sm:block">
              <div
                className="h-full rounded bg-blue-500"
                style={{ width: `${Math.max(1, supplier.share)}%` }}
              />
            </div>
            <span className="font-mono text-[10px] text-slate-500">
              {supplier.share}%
            </span>
          </>
        )}
      </div>
    </button>
  );
}

/* ── Supplier drawer (F1 — Wk1) ─────────────────────────────────────── */

function SupplierDrawer({
  supplier,
  supplierBols,
  receiverName,
  receiverId,
  onClose,
  onOpenFullProfile,
}: {
  supplier: SupplierAggregateRow | null;
  supplierBols: any[];
  receiverName: string;
  receiverId: string | null;
  onClose: () => void;
  onOpenFullProfile: () => void;
}) {
  // ESC closes — matches design review accessibility spec.
  useEffect(() => {
    if (!supplier) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [supplier, onClose]);

  if (!supplier) return null;

  const dateRange = (() => {
    const ts = supplierBols
      .map(getBolDate)
      .filter(Boolean)
      .map((d: any) => new Date(d).getTime())
      .filter((t) => Number.isFinite(t)) as number[];
    if (!ts.length) return null;
    const fmt = (n: number) =>
      new Date(n).toLocaleDateString("en-US", { month: "short", year: "numeric" });
    return `${fmt(Math.min(...ts))} – ${fmt(Math.max(...ts))}`;
  })();

  const topHsChapters = (() => {
    const map = new Map<string, number>();
    for (const bol of supplierBols) {
      const hs = getBolHs(bol);
      if (!hs || hs === "—") continue;
      const ch = String(hs).slice(0, 2);
      if (ch) map.set(ch, (map.get(ch) || 0) + 1);
    }
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([ch, count]) => ({ ch, count }));
  })();

  return (
    <>
      {/* Backdrop — tap to close on both viewports. */}
      <div
        className="fixed inset-0 z-[600] bg-slate-900/30 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden
      />
      {/* Panel — right-slide on desktop, bottom-sheet on mobile. */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="supplier-drawer-title"
        className={[
          "fixed z-[610] flex flex-col bg-white shadow-2xl",
          // Mobile bottom-sheet — 70% height, swipe-down dismiss handled by
          // the backdrop tap + ESC since we don't ship a swipe lib in v1.
          "inset-x-0 bottom-0 max-h-[70vh] rounded-t-2xl",
          // Desktop right-slide — 420px panel from the right edge.
          "sm:bottom-auto sm:left-auto sm:right-0 sm:top-0 sm:h-full sm:max-h-none sm:w-[420px] sm:max-w-[90vw] sm:rounded-none",
        ].join(" ")}
      >
        {/* Drawer header */}
        <div className="flex items-start gap-3 border-b border-slate-100 px-4 py-3.5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100">
            <LitFlag
              code={supplier.country}
              size={24}
              label={supplier.country || "Supplier"}
            />
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-display text-[9px] font-bold uppercase tracking-[0.1em] text-slate-400">
              Supplier
            </div>
            <h2
              id="supplier-drawer-title"
              className="font-display mt-0.5 truncate text-[15px] font-bold leading-tight text-slate-900"
            >
              {supplier.name}
            </h2>
            <div className="font-mono mt-0.5 text-[10px] text-slate-500">
              {supplier.country || "Unknown country"}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="font-display rounded-md border border-slate-200 bg-white px-2 py-1 text-[10px] font-semibold text-slate-500 transition-colors hover:bg-slate-50"
            aria-label="Close supplier detail"
          >
            Close
          </button>
        </div>

        {/* Drawer body */}
        <div className="flex-1 overflow-y-auto px-4 py-4">
          <div className="space-y-3.5">
            {/* Big metric */}
            <div>
              <div className="font-display text-[9px] font-bold uppercase tracking-[0.1em] text-slate-400">
                Total shipments to {receiverName}
              </div>
              <div className="font-mono mt-1 text-[28px] font-bold leading-none text-slate-900">
                {supplier.shipments >= 0
                  ? supplier.shipments.toLocaleString()
                  : "—"}
              </div>
              {supplier.share >= 0 && (
                <div className="font-mono mt-1 text-[10.5px] text-slate-500">
                  {supplier.share}% of this receiver's supplier volume
                </div>
              )}
            </div>

            {dateRange && (
              <div>
                <div className="font-display text-[9px] font-bold uppercase tracking-[0.1em] text-slate-400">
                  Shipment date range
                </div>
                <div className="font-mono mt-1 text-[12px] text-slate-700">{dateRange}</div>
              </div>
            )}

            {topHsChapters.length > 0 && (
              <div>
                <div className="font-display text-[9px] font-bold uppercase tracking-[0.1em] text-slate-400">
                  Top commodity categories
                </div>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {topHsChapters.map(({ ch, count }) => (
                    <LitPill key={ch} tone="blue">
                      HS {ch} · {count}
                    </LitPill>
                  ))}
                </div>
              </div>
            )}

            {supplierBols.length === 0 && (
              <p className="font-body text-[11px] text-slate-500">
                No shipment records loaded for this supplier on the receiver.
              </p>
            )}
          </div>
        </div>

        {/* Drawer footer */}
        <div className="border-t border-slate-100 px-4 py-3">
          <button
            type="button"
            onClick={onOpenFullProfile}
            className="font-display w-full rounded-md bg-blue-600 px-3 py-2 text-[12px] font-semibold text-white shadow-sm transition-colors hover:bg-blue-700"
          >
            View full supplier profile →
          </button>
        </div>
      </div>
    </>
  );
}

function ProductsView({
  products,
  recentBols,
}: {
  products: ProductRow[];
  recentBols: any[];
}) {
  const productTotal = products.reduce((s, p) => s + p.count, 0);
  return (
    <>
      <HsCodeTopBar recentBols={recentBols} />
      {products.length === 0 ? (
        <LitSectionCard
          title="Products / Commodities"
          sub="From BOL descriptions"
        >
          <EmptyMessage text="No product data on file yet — try Refresh Intel to pull the latest shipments." />
        </LitSectionCard>
      ) : (
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
      )}
    </>
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
  recentBols = [],
  containerProfile,
  reducedMotion = false,
  onOpenLanesTab,
}: {
  canonicalLanes: any[];
  globeLanes?: any[];
  recentBols?: any[];
  containerProfile?: ContainerProfile;
  reducedMotion?: boolean;
  onOpenLanesTab?: () => void;
}) {
  // Persisted globe / map preference — shared with the Dashboard's GlobeCard
  // so a user who picks Map view on one surface sees Map on the other.
  // Matches ZoomInfo's TerritoryView pattern: one preference, two consumers.
  const { mode: viewMode, setMode: setViewMode } = useLaneViewMode();

  // Globe needs resolved coordinates; fall back to filtering canonicalLanes
  // for backwards compatibility when globeLanes prop isn't passed.
  const sourceForGlobe = (Array.isArray(globeOnlyLanes) && globeOnlyLanes.length > 0
    ? globeOnlyLanes
    : canonicalLanes.filter((l: any) => l.fromMeta?.coords && l.toMeta?.coords));
  const globeLanes: GlobeLane[] = sourceForGlobe.slice(0, 8).map((l: any) => ({
    id: l.displayLabel,
    from: l.fromMeta.canonicalKey,
    to: l.toMeta.canonicalKey,
    coords: [l.fromMeta.coords, l.toMeta.coords],
    fromMeta: l.fromMeta,
    toMeta: l.toMeta,
    shipments: Number(l.shipments) || 0,
  }));

  // Map from canonical country-pair key (`${fromKey}::${toKey}`) -> GlobeLane.id.
  // Ranked rows (granular, per-route) are matched into globe arcs (collapsed by
  // country pair) through this map so selection stays in sync between the row
  // list, the 2-D <LaneMap>, and the 3-D <GlobeCanvas>. All three now compare
  // against canonical GlobeLane.id (not the row's per-route displayLabel, which
  // never matched anything on the globe).
  const pairKeyToGlobeId = useMemo(() => {
    const m = new Map<string, string>();
    for (const g of globeLanes) {
      const fromKey = g.fromMeta?.canonicalKey;
      const toKey = g.toMeta?.canonicalKey;
      if (fromKey && toKey) m.set(`${fromKey}::${toKey}`, g.id);
    }
    return m;
  }, [globeLanes]);

  // initialSelected: prefer the first globe lane's canonical id. The legacy
  // fallback to canonicalLanes[0].displayLabel was always wrong for selection
  // sync (row labels don't match globe ids) — translate it through the map if
  // possible, otherwise fall back to null. New callers should pass canonical
  // ids going forward.
  const initialFallbackPairKey = (() => {
    const first = canonicalLanes[0];
    const fromKey = first?.fromMeta?.canonicalKey;
    const toKey = first?.toMeta?.canonicalKey;
    return fromKey && toKey ? `${fromKey}::${toKey}` : null;
  })();
  const initialSelected =
    globeLanes[0]?.id ||
    (initialFallbackPairKey ? pairKeyToGlobeId.get(initialFallbackPairKey) ?? null : null);
  const [selectedId, setSelectedId] = useState<string | null>(initialSelected);

  // Track whether the latest selection came from the map (or globe in future)
  // so we only auto-scroll the row list when selection originates externally.
  // Row clicks set this to "row" and skip the scroll-into-view side effect.
  const lastSelectionSourceRef = useRef<"row" | "map" | null>(null);
  const rowRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  useEffect(() => {
    if (!selectedId) return;
    if (lastSelectionSourceRef.current !== "map") return;
    const el = rowRefs.current[selectedId];
    if (el && typeof el.scrollIntoView === "function") {
      el.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [selectedId]);

  // Container-mix bar data (merged from former EquipmentAndLaneFootprint).
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
    if (sourceCounted === 0 && containerProfile) {
      for (const len of containerProfile.lengths) {
        const t = classifyContainerType(len.label);
        if (t) counts[t]! += len.count;
      }
      if (containerProfile.lcl > 0) counts.LCL += containerProfile.lcl;
    }
    const total = Object.values(counts).reduce((s, n) => s + n, 0);
    return { counts, total };
  }, [recentBols, containerProfile]);

  const orderedKeys: Array<keyof typeof CONTAINER_TYPE_COLORS> = [
    "20ST",
    "40ST",
    "40HC",
    "45HC",
    "LCL",
  ];

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

  // Top lanes for the ranked list — sorted by shipments. Keep up to 12 so
  // the right-rail fills the card height on lg+ viewports.
  const rankedLanes = canonicalLanes
    .slice()
    .sort((a: any, b: any) => (Number(b?.shipments) || 0) - (Number(a?.shipments) || 0))
    .slice(0, 12);
  const maxLaneShipments = Math.max(
    1,
    ...rankedLanes.map((l: any) => Number(l?.shipments) || 0),
  );

  return (
    <LitSectionCard
      title="Top trade lanes"
      sub={viewMode === "globe" ? "Globe · ranked share · container mix" : "Map · ranked share · container mix"}
      action={<LaneViewToggle mode={viewMode} onChange={setViewMode} />}
      padded={false}
    >
      <div className="flex flex-col lg:grid lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        {/* Left ~40% — interactive globe OR 2D map. Full-width on mobile/tablet. */}
        <div
          className={[
            "flex items-center justify-center p-3 sm:p-4 lg:p-4",
            viewMode === "globe" ? "bg-slate-50" : "bg-white",
          ].join(" ")}
        >
          {viewMode === "globe" ? (
            <div className="aspect-square w-full max-w-[320px]">
              <GlobeCanvas
                lanes={globeLanes}
                selectedLane={selectedId}
                size={260}
                theme="trade"
                showFlagPins
              />
            </div>
          ) : (
            <div className="w-full">
              <LaneMap
                lanes={globeLanes}
                selectedLane={selectedId}
                onSelectLane={(id) => {
                  lastSelectionSourceRef.current = "map";
                  setSelectedId(id);
                }}
                height={300}
              />
            </div>
          )}
        </div>

        {/* Right ~60% — lane list. On mobile stacks below globe with its
            own internal scroll so the card never overflows the viewport. */}
        <div className="max-h-[340px] overflow-y-auto border-t border-slate-100 lg:max-h-[420px] lg:border-l lg:border-t-0">
          {rankedLanes.map((lane: any, i: number) => {
            // Resolve this row's canonical globe-lane id (collapsed by country
            // pair) so selection compares against the same key shape the globe
            // and 2-D map use. Rows whose pair isn't on the globe (e.g. the
            // endpoint didn't resolve to coords) get null and don't participate
            // in selection — they degrade gracefully to a non-selectable row.
            const fromKey = lane?.fromMeta?.canonicalKey;
            const toKey = lane?.toMeta?.canonicalKey;
            const globeLaneId =
              fromKey && toKey
                ? pairKeyToGlobeId.get(`${fromKey}::${toKey}`) ?? null
                : null;
            const isSelected =
              globeLaneId !== null && globeLaneId === selectedId;
            const shipments = Number(lane?.shipments) || 0;
            const widthPct = (shipments / maxLaneShipments) * 100;
            return (
              <button
                key={lane.displayLabel}
                ref={(el) => {
                  if (globeLaneId) rowRefs.current[globeLaneId] = el;
                }}
                type="button"
                onClick={() => {
                  lastSelectionSourceRef.current = "row";
                  setSelectedId(isSelected ? null : globeLaneId ?? null);
                }}
                className={[
                  "flex w-full items-center gap-2.5 border-b border-slate-100 px-3 py-2.5 text-left last:border-b-0 sm:px-4",
                  isSelected
                    ? "border-l-2 border-l-blue-500 bg-blue-50"
                    : "border-l-2 border-l-transparent hover:bg-slate-50/60",
                ].join(" ")}
              >
                <div className="flex w-full items-center gap-2.5">
                  <LaneRowInner lane={lane} index={i} highlight={isSelected} />
                </div>
                {/* Inline share bar — visualises lane share-of-shipments
                    so the founder gets the equipment/footprint affordance
                    inside the same card. */}
                <div className="hidden w-[68px] shrink-0 sm:block">
                  <div className="h-1 overflow-hidden rounded bg-slate-100">
                    <div
                      className="h-full rounded bg-blue-500"
                      style={{
                        width: `${widthPct}%`,
                        transition: reducedMotion
                          ? "none"
                          : `width 1400ms ease-out ${i * 150}ms`,
                      }}
                    />
                  </div>
                  <div className="font-mono mt-1 text-right text-[10px] font-semibold text-slate-600">
                    {shipments.toLocaleString()}
                  </div>
                </div>
              </button>
            );
          })}
          {canonicalLanes.length > 12 ? (
            <div className="px-3 py-2 sm:px-4">
              <button
                type="button"
                onClick={() => {
                  if (onOpenLanesTab) {
                    onOpenLanesTab();
                  }
                }}
                className="font-body inline-flex items-center gap-1 text-[12px] font-medium text-blue-600 hover:text-blue-700"
              >
                View all {canonicalLanes.length.toLocaleString()} lanes →
              </button>
            </div>
          ) : null}
        </div>
      </div>

      {/* Container-mix bar — spans full width below the globe + lane list.
          Replaces the deleted Equipment & Lane Footprint card. */}
      {mix.total > 0 && (
        <div className="border-t border-slate-100 px-3 py-3 sm:px-4">
          <div className="font-display mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            Container Mix
          </div>
          <ContainerMixBar
            counts={mix.counts as Record<string, number>}
            total={mix.total}
            orderedKeys={orderedKeys as string[]}
            reducedMotion={reducedMotion}
          />
        </div>
      )}
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
  onClick,
}: {
  supplier: SupplierRow;
  hasStats: boolean;
  onClick?: () => void;
}) {
  const [hover, setHover] = useState(false);
  // Prefer the parser-emitted `country_code` (ISO-2). Fall back to the
  // legacy `country` field when it happens to look like a 2-letter code
  // — covers the BOL-aggregated rows where country is sourced from
  // bol.supplier_country / origin_country which is already ISO-2.
  const iso =
    (s.country_code && /^[A-Za-z]{2}$/.test(s.country_code) ? s.country_code : null) ||
    (typeof s.country === "string" && /^[A-Za-z]{2}$/.test(s.country) ? s.country : null);
  const countryLabel = s.country || "Country pending";
  const lastShipped = s.last_shipment_date ? formatRelativeShort(s.last_shipment_date) : null;

  const RowTag = onClick ? "button" : "div";
  const interactiveProps = onClick
    ? ({ type: "button" as const, onClick })
    : ({} as const);

  return (
    <RowTag
      {...interactiveProps}
      className={[
        "relative flex w-full items-center gap-2.5 rounded text-left transition-colors hover:bg-emerald-50/50",
        onClick ? "cursor-pointer" : "",
      ].join(" ")}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {hover && hasStats && (
        <div
          className="font-display pointer-events-none absolute left-8 z-20 min-w-[200px] rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-[11px] leading-tight text-white shadow-lg"
          style={{ bottom: "100%", marginBottom: 6 }}
        >
          <div className="font-semibold">{s.name}</div>
          {countryLabel && <div className="text-[10px] opacity-75">{countryLabel}</div>}
          <div className="opacity-90">Shipments: {s.shipments.toLocaleString()}</div>
          {s.share > 0 && <div className="opacity-90">Share: {s.share}%</div>}
          {lastShipped && lastShipped !== "—" && (
            <div className="opacity-90">Last shipped: {lastShipped}</div>
          )}
        </div>
      )}
      <LitFlag code={iso} size={14} label={countryLabel} />
      <div className="min-w-0 flex-1">
        <div className="font-display truncate text-[12px] font-semibold text-slate-900">
          {s.name || "—"}
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
              {lastShipped && lastShipped !== "—" ? ` · ${lastShipped}` : ""}
            </span>
          </div>
        ) : (
          <div className="font-body mt-0.5 text-[10px] text-slate-400">
            {countryLabel === "Country pending"
              ? "Counterparty on file · count pending"
              : `${countryLabel}${lastShipped && lastShipped !== "—" ? ` · last shipped ${lastShipped}` : " · count pending"}`}
          </div>
        )}
      </div>
    </RowTag>
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
      // Synthesized single-lane row. Use the 12-month rolling shipment
      // count (Task 14) — profile.totalShipments can resolve to the
      // lifetime BOL count in api.ts, which would silently inflate the
      // lane row for snapshots that lack an explicit 12m number.
      return [
        {
          lane,
          shipments: Number(routeKpis?.shipmentsLast12m) || 0,
          teu:
            Number(routeKpis?.teuLast12m) ||
            Number(profile?.teuLast12m) ||
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

// deriveSuppliers used to live here as 130 LOC of inline logic. Extracted to
// @/lib/suppliers/aggregate (with full Vitest coverage) per /plan-eng-review's
// REGRESSION RULE. This local wrapper preserves the 6-row cap so the existing
// TopSuppliersCard renders unchanged; the F1 Suppliers sub-tab and the
// Supplier Profile page pass their own limit (Infinity / paginated).
function deriveSuppliers(profile: any, recentBols: any[] = []): SupplierRow[] {
  return aggregateSuppliers(profile, recentBols, { limit: 6 }) as SupplierRow[];
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