import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import {
  ArrowRight,
  ChevronDown,
  History,
  Info,
  Container,
  Maximize2,
  X,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import LitSectionCard from "@/components/ui/LitSectionCard";
import LitFlag from "@/components/ui/LitFlag";
import LitPill from "@/components/ui/LitPill";
import ServiceModeChip from "@/components/intel/ServiceModeChip";
import { SupplyChainFilterProvider } from "@/components/intel/SupplyChainFilterContext";
import ServiceModeFilterChips from "@/components/intel/ServiceModeFilterChips";
import DataFreshnessChip from "@/components/intel/cards/DataFreshnessChip";
import ServiceModeDonut from "@/components/intel/cards/ServiceModeDonut";
import MxTransborderKpi from "@/components/intel/cards/MxTransborderKpi";
import UsExportKpi from "@/components/intel/cards/UsExportKpi";
import LaneMixStackedBar from "@/components/intel/cards/LaneMixStackedBar";
import LaneYoyBarChart from "@/components/intel/cards/LaneYoyBarChart";
import DomesticInlandLegCard from "@/components/intel/cards/DomesticInlandLegCard";
import HsCodeTopBar from "@/components/intel/cards/HsCodeTopBar";
import {
  useCompanyModeCounts,
  useDomesticInlandLeg,
  useMxImportActivity,
} from "@/api/intel";
import BuyingIntentTile from "@/components/intent/BuyingIntentTile";
import { type GlobeLane } from "@/components/GlobeCanvas";
import LaneMap, { type LaneMapLaneColor } from "@/components/LaneMap";
import { canonicalizeLanes, resolveEndpoint } from "@/lib/laneGlobe";
import { laneRegionColor } from "@/lib/laneRegions";
import {
  useCompanyLaneMonths,
  type CompanyLaneMonthRow,
} from "@/api/laneHistory";
import {
  aggregateSuppliers,
  supplierNameToSlug,
  supplierInsight,
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
import LaneHistoryMatrix, {
  type LaneHistoryFilter,
} from "@/components/company/LaneHistoryMatrix";

type SubTabId = "summary" | "lanes" | "history" | "suppliers" | "products";

const SUB_TABS: { id: SubTabId; label: string }[] = [
  { id: "summary", label: "Summary" },
  { id: "lanes", label: "Trade Lanes" },
  { id: "history", label: "Lane History" },
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
  /** ImportYeti slug (lit_saved_companies.source_company_key /
   *  lit_company_lane_months.company_id) — drives the Lane History matrix.
   *  Null when the profile has no resolvable source key. */
  sourceCompanyKey?: string | null;
  /** UNSCOPED month-keyed timeSeries (every month back to 2015). The
   *  `profile` prop is year-scoped by buildYearScopedProfile, which truncates
   *  the cadence chart and kills YoY / past-year reconciliation — so the page
   *  passes the full series here. Cadence, the monthly reconciliation series
   *  and the map's year/month scope options all read this. (CEO P0 2026-08-14) */
  fullTimeSeries?: any[] | null;
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
  sourceCompanyKey,
  fullTimeSeries,
}: CDPSupplyChainProps) {
  const [sub, setSub] = useState<SubTabId>("summary");
  // Globe → Lane-History wiring: selecting "View monthly history" on a lane
  // in the hero stores the country pair here and jumps to the History
  // sub-tab, where the matrix pre-filters to that pair.
  const [laneHistoryFilter, setLaneHistoryFilter] =
    useState<LaneHistoryFilter | null>(null);
  const openLaneHistory = useCallback((pair: LaneHistoryFilter | null) => {
    setLaneHistoryFilter(pair);
    setSub("history");
  }, []);
  const companyName =
    (companyNameProp && String(companyNameProp).trim()) ||
    (profile?.companyName as string) ||
    (profile?.name as string) ||
    (profile?.identity?.companyName as string) ||
    "";

  // Per-mode shipment counts → drives chip enable/disable so users can't
  // click a mode the company has zero activity in (see feedback 2026-06-16).
  // Returns null (graceful) when RPC isn't deployed; chips stay enabled.
  const modeCountsQuery = useCompanyModeCounts(companyName || null);

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

  const recentBols = useMemo(() => deriveRecentBols(profile), [profile]);

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
  // UNSCOPED month-keyed series (every month back to 2015). Prefer the
  // explicit fullTimeSeries prop; fall back to profile.timeSeries so this
  // stays correct even for callers that don't thread the full series.
  const fullSeries = useMemo(
    () => deriveFullTimeSeries(fullTimeSeries, profile),
    [fullTimeSeries, profile],
  );
  // Cadence renders the SELECTED year's full 12 real months (zero-filled for
  // any month with no snapshot row) — no longer a truncated trailing window,
  // so picking 2025 shows the true 2025 cadence instead of going sparse.
  const cadence = useMemo(
    () => deriveCadence(fullSeries, selectedYear ?? null),
    [fullSeries, selectedYear],
  );
  // Full month-keyed REAL volume series (source of truth for reconciliation +
  // YoY) — every month back to 2015, not just the selected/trailing window.
  const monthlySeries = useMemo(
    () => deriveMonthlySeries(fullSeries),
    [fullSeries],
  );

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
      {/* ONE compact control row (CEO P1, 2026-08-12): sub-tabs + mode
          filter chips + freshness + year all share a single flex-wrap row
          so the trade-lanes hero below starts above the fold. Replaces the
          former three-high stack (chip strip / sub-tab row / strategic
          banner) — the banner's headline now lives inside the hero card. */}
      <div className="flex flex-wrap items-center gap-2">
        <div
          className={[
            "inline-flex max-w-full items-center gap-0.5 overflow-x-auto rounded-lg border border-slate-200 bg-white p-0.5 shadow-sm",
            "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
          ].join(" ")}
        >
          {SUB_TABS.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setSub(s.id)}
              className={[
                "font-display whitespace-nowrap rounded-md px-3 py-1.5 text-[12px] font-semibold transition-colors min-h-[40px]",
                sub === s.id
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900",
              ].join(" ")}
            >
              {s.label}
            </button>
          ))}
        </div>
        <div className="hidden h-6 w-px shrink-0 bg-slate-200 md:block" aria-hidden />
        <ServiceModeFilterChips modeCounts={modeCountsQuery.data ?? null} />
        <div className="ml-auto flex items-center gap-2">
          <DataFreshnessChip />
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
      </div>

      {/* Sub-tab content */}
      {sub === "summary" && (
        <SummaryView
          profile={profile}
          cadence={cadence}
          monthlySeries={monthlySeries}
          modes={modes}
          containerProfile={containerProfile}
          recentBols={recentBols}
          carriers={carriers}
          suppliers={suppliers}
          canonicalLanes={allLanes}
          globeLanes={globeLanes}
          onOpenPulseLive={onOpenPulseLive}
          onOpenLanesTab={() => setSub("lanes")}
          onOpenLaneHistory={openLaneHistory}
          headline={briefHeadline}
          companyName={companyName}
          sourceCompanyKey={sourceCompanyKey ?? null}
          selectedYear={selectedYear}
          years={years}
          onSelectYear={onSelectYear}
        />
      )}
      {sub === "history" && (
        <LaneHistoryMatrix
          companyId={sourceCompanyKey ?? null}
          companyName={companyName || null}
          sampleLanes={allLanes}
          recentBolCount={recentBols.length}
          laneFilter={laneHistoryFilter}
          onClearLaneFilter={() => setLaneHistoryFilter(null)}
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

/* ── Summary view ─────────────────────────────────────────────────────── */

function SummaryView({
  profile: _profile,
  cadence,
  monthlySeries,
  modes: _modes,
  containerProfile,
  recentBols,
  carriers: _carriers,
  suppliers: _suppliers,
  canonicalLanes,
  globeLanes,
  onOpenPulseLive,
  onOpenLanesTab,
  onOpenLaneHistory,
  headline,
  companyName,
  sourceCompanyKey,
  selectedYear,
  years,
  onSelectYear,
}: {
  profile: any;
  cadence: CadencePoint[];
  monthlySeries: MonthlyVolumePoint[];
  modes: ModeSlice[];
  containerProfile: ContainerProfile;
  recentBols: any[];
  carriers: CarrierRow[];
  suppliers: SupplierRow[];
  canonicalLanes: any[];
  globeLanes: any[];
  onOpenPulseLive?: () => void;
  onOpenLanesTab?: () => void;
  onOpenLaneHistory?: (pair: LaneHistoryFilter | null) => void;
  headline?: string | null;
  companyName: string;
  sourceCompanyKey?: string | null;
  selectedYear?: number;
  years?: number[];
  onSelectYear?: (year: number) => void;
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
  //   2. TopLanesCard (full-bleed map hero + floating lane cards + container mix)
  //   3. CadenceAndModalMix (area chart + small donut)
  //   4. MxTransborderKpi + UsExportKpi (compact KPIs side-by-side, hide-on-empty)
  //   5. RecentActivityCards
  // Removed 2026-06-16: TopTradePartnersBar — credit-burning PQ sync (11 credits / 0 rows for Walmart).
  // Existing Suppliers tab covers this via free BOL-derived aggregation.
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
        onOpenLaneHistory={onOpenLaneHistory}
        headline={headline}
        cadence={cadence}
        monthlySeries={monthlySeries}
        shipments12mTotal={
          Number(_profile?.routeKpis?.shipmentsLast12m) ||
          Number(_profile?.shipments_last_12m) ||
          null
        }
        sourceCompanyKey={sourceCompanyKey}
        selectedYear={selectedYear}
        years={years}
        onSelectYear={onSelectYear}
      />
      <CadenceAndModalMix
        cadence={cadence}
        monthlySeries={monthlySeries}
        containerProfile={containerProfile}
        reducedMotion={reducedMotion}
        companyName={companyName || null}
        donutCounts={donutCounts}
        selectedYear={selectedYear}
      />
      {companyName && (
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-2">
          <MxTransborderKpi companyName={companyName} />
          <UsExportKpi companyName={companyName} />
        </div>
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
  monthlySeries = [],
  containerProfile,
  reducedMotion,
  companyName,
  donutCounts,
  selectedYear,
}: {
  cadence: CadencePoint[];
  /** Full month-keyed REAL series — drives the per-month YoY overlay. */
  monthlySeries?: MonthlyVolumePoint[];
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
  /** Selected calendar year — when set, the cadence shows that year and the
   *  YoY overlay compares against the prior year (real monthly_volumes). */
  selectedYear?: number;
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

  // ── Year-over-year overlay (CEO priority, 2026-08-14) ────────────────
  // When a calendar year is selected, the user can flip on a per-month
  // "vs prior year" overlay + read an overall YoY chip — all from the REAL
  // monthly_volumes series (never fabricated). Prior-year totals are keyed
  // by month number so they line up 1:1 with the selected year's cadence.
  const [yoyMode, setYoyMode] = useState(false);
  const priorYear =
    typeof selectedYear === "number" && Number.isFinite(selectedYear)
      ? selectedYear - 1
      : null;
  const priorByMonth = useMemo(() => {
    const m = new Map<number, number>();
    if (priorYear == null) return m;
    for (const p of monthlySeries) {
      if (!/^\d{4}-\d{2}$/.test(p.month)) continue;
      if (Number(p.month.slice(0, 4)) !== priorYear) continue;
      m.set(Number(p.month.slice(5, 7)), p.shipments);
    }
    return m;
  }, [monthlySeries, priorYear]);
  const yoyAvailable = priorByMonth.size > 0;
  // Which month numbers the SELECTED year actually has real data for. Used to
  // align the overall YoY chip like-for-like: for the current (incomplete)
  // year we compare YTD vs the same Jan–<latest> window last year, not a
  // partial year against a full one (which would misread as a fake decline).
  const currentMonthsWithData = useMemo(() => {
    const s = new Set<number>();
    if (priorYear == null) return s;
    const cy = priorYear + 1;
    for (const p of monthlySeries) {
      if (!/^\d{4}-\d{2}$/.test(p.month)) continue;
      if (Number(p.month.slice(0, 4)) !== cy) continue;
      if (p.shipments > 0) s.add(Number(p.month.slice(5, 7)));
    }
    return s;
  }, [monthlySeries, priorYear]);
  const overallYoy = useMemo(() => {
    if (selectedYear == null || currentMonthsWithData.size === 0) return null;
    // Current = the selected year's real months.
    let cur = 0;
    for (const c of cadence) cur += Number(c.total) || 0;
    // Prior = the SAME months last year (period-aligned YTD comparison).
    let prior = 0;
    for (const [mnum, v] of priorByMonth) {
      if (currentMonthsWithData.has(mnum)) prior += v;
    }
    if (prior <= 0) return null;
    const delta = cur - prior;
    return { current: cur, prior, deltaShip: delta, pct: (delta / prior) * 100 };
  }, [cadence, priorByMonth, currentMonthsWithData, selectedYear]);

  // Stacked area data: FCL/LCL come from cadence; Air is the per-row
  // average from MX air rows, spread across the cadence buckets. We don't
  // pretend to know the time distribution — when MX rows lack a per-month
  // breakdown, we leave each bucket's air bar at 0 and let the disclosure
  // carry the air signal. When YoY overlay is on, each bucket also carries
  // that month's prior-year total as a ghost bar.
  const showYoy = yoyMode && yoyAvailable && selectedYear != null;
  const chartData = cadence.map((c, i) => ({
    label: c.label,
    fcl: c.fcl,
    lcl: c.lcl,
    priorTotal: showYoy ? priorByMonth.get(i + 1) ?? 0 : 0,
  }));
  const serviceBars = [
    { key: "fcl", label: "FCL", color: "#0EA5E9" },
    { key: "lcl", label: "LCL", color: "#F59E0B" },
  ].filter((bar) =>
    chartData.some((point) => Number(point[bar.key as "fcl" | "lcl"] || 0) > 0),
  );

  const fcl = containerProfile.fcl;
  const lcl = containerProfile.lcl;
  // Air slice: real MX-derived count. NEVER hardcoded — when zero, the
  // donut hides the slice entirely (no fake 0% wedge) and a disclosure
  // chip renders below the chart explaining the ImportYeti coverage gap.
  const air = mxAirCount;
  const total = fcl + lcl + air;
  const cadenceSub =
    selectedYear != null
      ? `${selectedYear} monthly cadence - hover a month to inspect service totals`
      : "Trailing 12 months - hover a month to inspect service totals";
  if (cadence.length === 0 && total === 0) {
    return (
      <LitSectionCard title="Cadence & Modal Mix" sub={cadenceSub}>
        <EmptyMessage text="No cadence data on file yet - try Refresh Intel to pull the latest shipments." />
      </LitSectionCard>
    );
  }

  return (
    <LitSectionCard
      title="Cadence & Modal Mix"
      sub={cadenceSub}
      action={
        yoyAvailable && selectedYear != null ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setYoyMode((v) => !v)}
              title={`Overlay ${priorYear} volumes and show the year-over-year change`}
              className={[
                "font-display inline-flex h-6 shrink-0 items-center whitespace-nowrap rounded-full border px-2 text-[10px] font-semibold transition-colors",
                yoyMode
                  ? "border-blue-600 bg-blue-600 text-white"
                  : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900",
              ].join(" ")}
            >
              YoY vs {priorYear}
            </button>
            {overallYoy && <YoyChip delta={overallYoy} />}
          </div>
        ) : undefined
      }
    >
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
      <div className="flex flex-col gap-4 lg:flex-row">
        {/* Left ≥lg 60% / <lg full-width — stacked area. Mobile-first
            heights so the chart never crushes vertically on a phone. */}
        <div className="min-w-0 flex-1 lg:basis-[60%]">
          <div className="h-[200px] sm:h-[240px] md:h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chartData}
                margin={{ top: 10, right: 8, left: 0, bottom: 0 }}
                barCategoryGap="24%"
                barGap={4}
              >
                <CartesianGrid vertical={false} stroke="#E2E8F0" strokeDasharray="3 3" />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 10, fill: "#64748B" }}
                  tickLine={false}
                  axisLine={{ stroke: "#E2E8F0" }}
                />
                <YAxis hide allowDecimals={false} />
                <Tooltip
                  cursor={{ fill: "#EEF2FF", opacity: 0.65 }}
                  content={<CadenceBarTooltip />}
                />
                {/* Prior-year ghost bar (YoY overlay) — rendered first so the
                    current-year FCL/LCL bars sit in front of it. Real prior-
                    year totals from monthly_volumes; never fabricated. */}
                {showYoy && (
                  <Bar
                    key="priorTotal"
                    dataKey="priorTotal"
                    name={`${priorYear} total`}
                    fill="#CBD5E1"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={26}
                    isAnimationActive={!reducedMotion}
                    animationDuration={reducedMotion ? 0 : 700}
                  />
                )}
                {serviceBars.map((bar, index) => (
                  <Bar
                    key={bar.key}
                    dataKey={bar.key}
                    name={bar.label}
                    fill={bar.color}
                    stackId={showYoy ? "current" : undefined}
                    radius={[4, 4, 0, 0]}
                    maxBarSize={26}
                    isAnimationActive={!reducedMotion}
                    animationDuration={reducedMotion ? 0 : 900}
                    animationBegin={reducedMotion ? 0 : index * 120}
                    activeBar={{ stroke: "#0F172A", strokeWidth: 1.25, fillOpacity: 0.92 }}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <LegendDot color="#0EA5E9" label="FCL" />
            <LegendDot color="#F59E0B" label="LCL" />
            {showYoy && <LegendDot color="#CBD5E1" label={`${priorYear} total`} />}
            {hasMxAir ? (
              <LegendDot color="#8B5CF6" label={`Air - ${mxAirCount} MX`} />
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

        {/* Right ≥lg 40% / <lg full-width — interactive ServiceModeDonut
            (drives tab filter). */}
        <div className="flex min-w-0 flex-col lg:basis-[40%]">
          <ServiceModeDonut counts={donutCounts} embedded />
        </div>
      </div>
    </LitSectionCard>
  );
}

function CadenceBarTooltip({ active, payload, label }: any) {
  if (!active || !Array.isArray(payload) || payload.length === 0) return null;
  // Prior-year ghost bar is a YoY reference, not part of this month's total —
  // split it out so the "N shipments this month" line stays honest.
  const priorEntry = payload.find((e: any) => e?.dataKey === "priorTotal");
  const priorTotal = priorEntry ? Number(priorEntry.value || 0) : 0;
  const rows = payload
    .filter((entry) => entry?.dataKey !== "priorTotal" && Number(entry?.value || 0) > 0)
    .map((entry) => ({
      name: entry.name,
      value: Number(entry.value || 0),
      color: entry.color || entry.fill,
    }));
  if (!rows.length && priorTotal <= 0) return null;
  const total = rows.reduce((sum, row) => sum + row.value, 0);
  const yoyPct =
    priorTotal > 0 ? Math.round(((total - priorTotal) / priorTotal) * 100) : null;
  return (
    <div className="rounded-md border border-slate-200 bg-white px-2.5 py-2 text-[11px] shadow-sm">
      <div className="font-display mb-1 font-semibold text-slate-900">{label}</div>
      <div className="space-y-1">
        {rows.map((row) => (
          <div key={row.name} className="flex min-w-[130px] items-center justify-between gap-4">
            <span className="inline-flex items-center gap-1.5 text-slate-600">
              <span className="h-2 w-2 rounded-full" style={{ background: row.color }} />
              {row.name}
            </span>
            <span className="font-mono font-semibold text-slate-900">{row.value}</span>
          </div>
        ))}
      </div>
      <div className="mt-1 border-t border-slate-100 pt-1 font-mono text-[10px] text-slate-500">
        {total} shipments this month
      </div>
      {priorTotal > 0 && (
        <div className="mt-1 border-t border-slate-100 pt-1 font-mono text-[10px] text-slate-500">
          {priorTotal.toLocaleString()} prior year
          {yoyPct != null && (
            <span
              className={
                yoyPct > 0
                  ? "ml-1 text-emerald-600"
                  : yoyPct < 0
                    ? "ml-1 text-rose-500"
                    : "ml-1 text-slate-400"
              }
            >
              ({yoyPct > 0 ? "+" : ""}
              {yoyPct}% YoY)
            </span>
          )}
        </div>
      )}
    </div>
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
      {/* Legend chips — flex-wrap inside the card with truncation + title
          tooltips so long type/carrier labels never clip at the card edge
          (CEO feedback 2026-08-13). */}
      <div className="mt-2 flex min-w-0 max-w-full flex-wrap gap-x-3 gap-y-1">
        {present.map((seg) => {
          const pct = total > 0 ? Math.round((seg.count / total) * 100) : 0;
          return (
            <div
              key={seg.key}
              className="flex min-w-0 items-center gap-1.5"
              title={`${seg.key} · ${seg.count} (${pct}%)`}
            >
              <span
                className="inline-block h-2 w-2 shrink-0 rounded-sm"
                style={{ background: CONTAINER_TYPE_COLORS[seg.key] }}
              />
              <span className="font-display max-w-[110px] truncate text-[10px] font-semibold text-slate-700">
                {seg.key}
              </span>
              <span className="font-mono whitespace-nowrap text-[10px] text-slate-500">
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

/**
 * Resolve the recent-BOL array off a company profile, tolerant of the
 * several shapes upstream uses. Exported so a standalone Suppliers tab
 * (CompanyProfileV2) derives BOLs identically to the Supply Chain tab —
 * one source of truth, no drift. (T4)
 */
export function deriveRecentBols(profile: any): any[] {
  const items =
    profile?.recentBols ||
    profile?.recent_bols ||
    profile?.bols ||
    profile?.shipments ||
    [];
  return Array.isArray(items) ? items : [];
}

// Exported (T4) so it can mount as a dedicated top-level "Suppliers" tab in
// CompanyProfileV2 — suppliers are trade intelligence, not a Supply-Chain
// sub-tab buried two levels down. Same component, two mount points.
export function SuppliersView({
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
        <div className="mt-0.5 flex items-center gap-1.5">
          <span className="font-mono text-[10px] text-slate-500">
            {supplier.country || "Unknown country"}
          </span>
          {supplier.teu_12m != null && supplier.teu_12m > 0 && (
            <span className="font-mono text-[10px] text-slate-400">
              · {Math.round(supplier.teu_12m).toLocaleString()} TEU
            </span>
          )}
          {/* Trend/recency badge — real data only (trend from the supplier's
              monthly history, recency from its last-shipment date). Never
              rendered on guessed data. */}
          {(() => {
            const t = supplier.trend ?? supplier.recency;
            if (!t) return null;
            const tone =
              t === "growing"
                ? "bg-emerald-50 text-emerald-600"
                : t === "declining"
                  ? "bg-rose-50 text-rose-500"
                  : t === "new"
                    ? "bg-blue-50 text-blue-600"
                    : t === "dormant"
                      ? "bg-slate-100 text-slate-400"
                      : "bg-slate-100 text-slate-500";
            return (
              <span
                className={`font-mono rounded px-1 py-px text-[9px] font-semibold uppercase tracking-wide ${tone}`}
              >
                {t === "active" ? "active" : t}
              </span>
            );
          })()}
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
      // parseBolDate — snapshot BOL dates are DD/MM/YYYY; native Date()
      // would read "05/08/2026" as May 8 instead of Aug 5.
      .map((d: any) => parseBolDate(d)?.getTime() ?? NaN)
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
                  {supplier.share}% of this receiver's last-12-month shipments
                </div>
              )}
            </div>

            {/* T6: derived opportunity note — clearly labeled approx so it
                reads as a prompt, never a verified fact. Only renders when
                the trustworthy fields surface something notable. */}
            {(() => {
              const insight = supplierInsight(supplier);
              if (!insight) return null;
              return (
                <div
                  className={`rounded-md border px-3 py-2 ${
                    insight.tone === "opportunity"
                      ? "border-emerald-100 bg-emerald-50/60"
                      : "border-amber-100 bg-amber-50/60"
                  }`}
                >
                  <div className="font-display text-[9px] font-bold uppercase tracking-[0.1em] text-slate-400">
                    Derived insight · approx
                  </div>
                  <p className="font-body mt-1 text-[11.5px] leading-snug text-slate-700">
                    {insight.text}
                  </p>
                </div>
              );
            })()}

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

            {/* Rich detail parsed from the full ImportYeti suppliers_table.
                Each block renders only when the real field is present. */}
            {supplier.address && (
              <div>
                <div className="font-display text-[9px] font-bold uppercase tracking-[0.1em] text-slate-400">
                  Supplier address
                </div>
                <div className="font-body mt-1 text-[11.5px] leading-snug text-slate-700">
                  {supplier.address}
                </div>
              </div>
            )}

            {(supplier.teu_12m != null || supplier.total_teu != null) && (
              <div>
                <div className="font-display text-[9px] font-bold uppercase tracking-[0.1em] text-slate-400">
                  TEU
                </div>
                <div className="font-mono mt-1 text-[12px] text-slate-700">
                  {supplier.teu_12m != null
                    ? `${Math.round(supplier.teu_12m).toLocaleString()} (12m)`
                    : "—"}
                  {supplier.total_teu != null && (
                    <span className="text-slate-400">
                      {" "}
                      · {Math.round(supplier.total_teu).toLocaleString()} all-time
                    </span>
                  )}
                </div>
              </div>
            )}

            {(supplier.first_shipment_date ||
              supplier.last_shipment_date ||
              supplier.business_length) && (
              <div>
                <div className="font-display text-[9px] font-bold uppercase tracking-[0.1em] text-slate-400">
                  Relationship
                </div>
                <div className="font-mono mt-1 text-[12px] text-slate-700">
                  {(supplier.first_shipment_date || "—") +
                    " → " +
                    (supplier.last_shipment_date || "—")}
                  {supplier.business_length && (
                    <span className="text-slate-400"> · {supplier.business_length}</span>
                  )}
                </div>
              </div>
            )}

            {Array.isArray(supplier.other_buyers) &&
              supplier.other_buyers.length > 0 && (
                <div>
                  <div className="font-display text-[9px] font-bold uppercase tracking-[0.1em] text-slate-400">
                    Other importers this supplier ships to
                  </div>
                  <div className="mt-1.5 flex flex-col gap-1">
                    {supplier.other_buyers.map((b, i) => (
                      <div
                        key={`${b.name}-${i}`}
                        className="flex items-center justify-between gap-2"
                      >
                        <span className="font-body truncate text-[11.5px] text-slate-700">
                          {b.name}
                        </span>
                        {b.shipments != null && (
                          <span className="font-mono shrink-0 text-[10.5px] text-slate-400">
                            {b.shipments.toLocaleString()}
                          </span>
                        )}
                      </div>
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

/**
 * TopLanesCard — CEO-approved map-hero redesign (2026-08-13).
 *
 * The trade-lanes section is now a FULL-BLEED interactive map — the same
 * basemap style as the Explorer page (LaneMap `variant="light"`: Stadia
 * Alidade Smooth in production, CARTO Voyager fallback — medium tone per
 * CEO, replacing both the 3-D globe and the old navy map). The ranked
 * country-pair lane cards float OVER the map as a glass panel docked
 * top-right on desktop; the strategic headline + 12-month trend ride in
 * a slim glass strip top-left. Lane lines are volume-weighted and the
 * endpoint markers volume-scaled; clicking a lane (on map or in the
 * panel) selects it — the map flies to the lane, highlights it and dims
 * the rest (same pairKey selection model as before).
 *
 * An expand control opens a full-screen dialog (TradeLanesMapDialog)
 * with the maximized map, filter chips (origin country, min shipments,
 * transport mode when the data carries it), a legend, zoom controls and
 * a lane-detail popover (city route, shipments, TEU, last activity).
 *
 * MOBILE (<768px): the map renders full-width (~320px tall) with the
 * lane list BELOW as a scrollable sheet — nothing overlays the map
 * except the expand button. Taps highlight the lane and open the
 * endpoint bottom-sheet popover; all tap targets are ≥44px.
 *
 * The old Globe/Map toggle is retired here — the globe composition
 * (centered sphere + side legend) is incompatible with the full-bleed
 * hero, so the Map view is now the only view. GlobeCanvas still powers
 * the Dashboard GlobeCard.
 *
 * Density-adaptive height (CEO feedback 2026-08-13 preserved): ≤4 pairs
 * → 380px, 5-10 → 460px, >10 → 520px (desktop; mobile is a fixed 320px).
 * Container-mix strip and the honesty caption keep their spots below
 * the hero.
 */

/** md-and-up breakpoint hook — drives overlay-vs-stacked composition. */
function useIsMdUp(): boolean {
  const [isMdUp, setIsMdUp] = useState<boolean>(() => {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia("(min-width: 768px)").matches;
  });
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mql = window.matchMedia("(min-width: 768px)");
    const handler = (e: MediaQueryListEvent) => setIsMdUp(e.matches);
    setIsMdUp(mql.matches);
    if (mql.addEventListener) {
      mql.addEventListener("change", handler);
      return () => mql.removeEventListener("change", handler);
    }
    mql.addListener(handler);
    return () => mql.removeListener(handler);
  }, []);
  return isMdUp;
}

function pairToHistoryFilter(p: any): LaneHistoryFilter {
  return {
    originKey: p?.fromMeta?.canonicalKey ?? null,
    originLabel: p?.fromMeta?.countryName ?? "Origin",
    destKey: p?.toMeta?.canonicalKey ?? null,
    destLabel: p?.toMeta?.countryName ?? "Destination",
  };
}

/** Glass-panel styling shared by every floating card over the map. */
const GLASS_PANEL =
  "rounded-xl border border-white/60 bg-white/85 shadow-[0_8px_30px_rgba(2,6,23,0.14)] backdrop-blur-md";

/* ── Year/month lane scope (CEO 2026-08-13: filtering inside the map) ── */

const MONTH_ABBR = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** Year-over-year delta shared by the overall chip + per-lane annotations. */
type YoyDelta = {
  current: number;
  prior: number;
  deltaShip: number;
  pct: number;
};

/**
 * Small ▲/▼ YoY chip: "+18% YoY" green up / red down. Flat (0) reads neutral.
 * `compact` drops the "YoY" suffix for the tight per-lane row slot.
 */
function YoyChip({
  delta,
  compact = false,
}: {
  delta: YoyDelta;
  compact?: boolean;
}) {
  const up = delta.deltaShip > 0;
  const flat = delta.deltaShip === 0;
  const rounded = Math.round(Math.abs(delta.pct));
  const sign = up ? "+" : flat ? "" : "-";
  const tone = flat
    ? "border-slate-200 bg-slate-50 text-slate-500"
    : up
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : "border-rose-200 bg-rose-50 text-rose-600";
  const arrow = flat ? "" : up ? "▲" : "▼";
  return (
    <span
      title={`${delta.current.toLocaleString()} vs ${delta.prior.toLocaleString()} prior year (${
        up ? "+" : flat ? "" : "-"
      }${Math.abs(delta.deltaShip).toLocaleString()})`}
      className={[
        "font-mono inline-flex shrink-0 items-center gap-0.5 whitespace-nowrap rounded-full border px-1.5 py-[1px] text-[9px] font-bold",
        tone,
      ].join(" ")}
    >
      {arrow && <span aria-hidden>{arrow}</span>}
      {sign}
      {rounded}%{compact ? "" : " YoY"}
    </span>
  );
}

/** "2026-07" → "Jul 2026". */
function laneMonthLabel(mk: string): string {
  const y = mk.slice(0, 4);
  const m = Number(mk.slice(5, 7));
  const abbr = MONTH_ABBR[m - 1];
  return abbr ? `${abbr} ${y}` : mk;
}

/**
 * 12 sequential YYYY-MM keys for the per-lane mini month bars: Jan–Dec of
 * `year` when a year is scoped, otherwise the 12 months ending at `endKey`
 * (the latest month with data).
 */
function laneMonthWindowKeys(year: number | null, endKey: string | null): string[] {
  if (year != null) {
    return Array.from(
      { length: 12 },
      (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`,
    );
  }
  let ey: number;
  let em: number;
  if (endKey && /^\d{4}-\d{2}/.test(endKey)) {
    ey = Number(endKey.slice(0, 4));
    em = Number(endKey.slice(5, 7));
  } else {
    const now = new Date();
    ey = now.getUTCFullYear();
    em = now.getUTCMonth() + 1;
  }
  const out: string[] = [];
  for (let i = 11; i >= 0; i--) {
    let m = em - i;
    let y = ey;
    while (m <= 0) {
      m += 12;
      y -= 1;
    }
    out.push(`${y}-${String(m).padStart(2, "0")}`);
  }
  return out;
}

/**
 * Rollup city fields sometimes carry the country name itself ("China",
 * "United States of America") instead of a real city — treat those as null
 * so we don't render "China → United States of America" as a city route.
 */
function cleanRollupCity(raw: string | null | undefined, meta: any): string | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  const lc = s.toLowerCase();
  const country = String(meta?.countryName || "").toLowerCase();
  const code = String(meta?.countryCode || "").toLowerCase();
  if (
    lc === country ||
    (code && lc === code) ||
    lc === "unknown" ||
    lc === "united states" ||
    lc === "united states of america" ||
    lc === "usa"
  ) {
    return null;
  }
  return s;
}

type ScopedLaneData = {
  /** Country-pair lanes shaped like canonicalizeLanes() output. */
  pairs: any[];
  cityRoutesByPair: Map<string, any[]>;
  lastActivityByPair: Map<string, Date>;
  unresolvedCount: number;
  unresolvedShipments: number;
  /** Source-record count (lane-months or BOLs) for the honesty caption. */
  sourceRecords: number;
};

/**
 * Build country-pair lanes + city routes + last-activity from (already
 * scope-filtered) `lit_company_lane_months` rollup rows. `dest_country`
 * is null on some early rollup rows — this is the US-import BOL feed, so
 * null destination resolves to the United States.
 */
function buildPairsFromRollup(rows: CompanyLaneMonthRow[]): ScopedLaneData {
  const pairMap = new Map<string, any>();
  const routeMap = new Map<string, Map<string, any>>();
  const lastMap = new Map<string, string>();
  let unresolvedCount = 0;
  let unresolvedShipments = 0;
  for (const r of rows) {
    const from = resolveEndpoint(r.origin_country);
    const to = resolveEndpoint(r.dest_country || "United States");
    if (!from?.coords || !to?.coords) {
      unresolvedCount += 1;
      unresolvedShipments += Number(r.shipments) || 0;
      continue;
    }
    const pairKey = `${from.canonicalKey}::${to.canonicalKey}`;
    const draft = pairMap.get(pairKey) || {
      pairKey,
      displayLabel: `${from.flag} ${from.countryName} → ${to.flag} ${to.countryName}`,
      fromMeta: from,
      toMeta: to,
      shipments: 0,
      teu: 0,
    };
    draft.shipments += Number(r.shipments) || 0;
    draft.teu += Number(r.teu) || 0;
    pairMap.set(pairKey, draft);

    const mk = String(r.month).slice(0, 7);
    const prev = lastMap.get(pairKey);
    if (!prev || mk > prev) lastMap.set(pairKey, mk);

    const oCity = cleanRollupCity(r.origin_city, from);
    const dCityRaw = cleanRollupCity(r.dest_city, to);
    const dCity = dCityRaw
      ? r.dest_state
        ? `${dCityRaw}, ${r.dest_state}`
        : dCityRaw
      : null;
    if (oCity || dCity) {
      const rk = `${oCity ?? ""}>${dCity ?? ""}`;
      const perPair = routeMap.get(pairKey) || new Map<string, any>();
      const route = perPair.get(rk) || {
        displayLabel: `${oCity ?? from.countryName} → ${dCity ?? to.countryName}`,
        fromMeta: { ...from, label: oCity ?? from.countryName },
        toMeta: { ...to, label: dCity ?? to.countryName },
        rawFrom: oCity,
        rawTo: dCity,
        shipments: 0,
        teu: 0,
      };
      route.shipments += Number(r.shipments) || 0;
      route.teu += Number(r.teu) || 0;
      perPair.set(rk, route);
      routeMap.set(pairKey, perPair);
    }
  }
  const pairs = [...pairMap.values()].sort(
    (a, b) => b.shipments - a.shipments || b.teu - a.teu,
  );
  const cityRoutesByPair = new Map<string, any[]>();
  for (const [k, perPair] of routeMap.entries()) {
    cityRoutesByPair.set(
      k,
      [...perPair.values()].sort((a, b) => b.shipments - a.shipments),
    );
  }
  const lastActivityByPair = new Map<string, Date>();
  for (const [k, mk] of lastMap.entries()) {
    const d = new Date(`${mk}-01T00:00:00Z`);
    if (!Number.isNaN(d.getTime())) lastActivityByPair.set(k, d);
  }
  return {
    pairs,
    cityRoutesByPair,
    lastActivityByPair,
    unresolvedCount,
    unresolvedShipments,
    sourceRecords: rows.length,
  };
}

/**
 * Sample-mode equivalent: build country-pair lanes from (already
 * date-filtered) recent BOLs. Used when a company has no rollup rows yet —
 * counts derive from the ~50-BOL snapshot sample, labeled "(sample)".
 */
function buildPairsFromSampleBols(
  dated: Array<{ bol: any; d: Date }>,
): ScopedLaneData {
  const pairMap = new Map<string, any>();
  const routeMap = new Map<string, Map<string, any>>();
  const lastMap = new Map<string, number>();
  let unresolvedCount = 0;
  for (const { bol, d } of dated) {
    const originRaw = getBolOrigin(bol);
    const destRaw = getBolDestination(bol);
    const from = resolveEndpoint(originRaw === "—" ? null : originRaw);
    const to = resolveEndpoint(destRaw === "—" ? null : destRaw);
    if (!from?.coords || !to?.coords) {
      unresolvedCount += 1;
      continue;
    }
    const pairKey = `${from.canonicalKey}::${to.canonicalKey}`;
    const draft = pairMap.get(pairKey) || {
      pairKey,
      displayLabel: `${from.flag} ${from.countryName} → ${to.flag} ${to.countryName}`,
      fromMeta: from,
      toMeta: to,
      shipments: 0,
      teu: 0,
    };
    draft.shipments += 1;
    draft.teu += Number(bol?.teu) || Number(bol?.containers_teu) || 0;
    pairMap.set(pairKey, draft);

    const prev = lastMap.get(pairKey);
    if (!prev || d.getTime() > prev) lastMap.set(pairKey, d.getTime());

    const oCity = cleanRollupCity(String(originRaw).split(",")[0], from);
    const dCity = cleanRollupCity(String(destRaw).split(",")[0], to);
    if (oCity || dCity) {
      const rk = `${oCity ?? ""}>${dCity ?? ""}`;
      const perPair = routeMap.get(pairKey) || new Map<string, any>();
      const route = perPair.get(rk) || {
        displayLabel: `${oCity ?? from.countryName} → ${dCity ?? to.countryName}`,
        fromMeta: { ...from, label: oCity ?? from.countryName },
        toMeta: { ...to, label: dCity ?? to.countryName },
        rawFrom: oCity,
        rawTo: dCity,
        shipments: 0,
        teu: 0,
      };
      route.shipments += 1;
      perPair.set(rk, route);
      routeMap.set(pairKey, perPair);
    }
  }
  const pairs = [...pairMap.values()].sort(
    (a, b) => b.shipments - a.shipments || b.teu - a.teu,
  );
  const cityRoutesByPair = new Map<string, any[]>();
  for (const [k, perPair] of routeMap.entries()) {
    cityRoutesByPair.set(
      k,
      [...perPair.values()].sort((a, b) => b.shipments - a.shipments),
    );
  }
  const lastActivityByPair = new Map<string, Date>();
  for (const [k, t] of lastMap.entries()) lastActivityByPair.set(k, new Date(t));
  return {
    pairs,
    cityRoutesByPair,
    lastActivityByPair,
    unresolvedCount,
    unresolvedShipments: unresolvedCount,
    sourceRecords: dated.length,
  };
}

/** pairKey → { "YYYY-MM": shipments } from the full rollup window. */
function buildLaneMonthsFromRollup(
  rows: CompanyLaneMonthRow[],
): Map<string, Record<string, number>> {
  const m = new Map<string, Record<string, number>>();
  for (const r of rows) {
    const from = resolveEndpoint(r.origin_country);
    const to = resolveEndpoint(r.dest_country || "United States");
    if (!from || !to) continue;
    const pairKey = `${from.canonicalKey}::${to.canonicalKey}`;
    const mk = String(r.month).slice(0, 7);
    const rec = m.get(pairKey) || {};
    rec[mk] = (rec[mk] || 0) + (Number(r.shipments) || 0);
    m.set(pairKey, rec);
  }
  return m;
}

/** Sample-mode month series from dated BOLs (labelled "(sample)" in UI). */
function buildLaneMonthsFromBols(
  dated: Array<{ bol: any; d: Date }>,
): Map<string, Record<string, number>> {
  const m = new Map<string, Record<string, number>>();
  for (const { bol, d } of dated) {
    const from = resolveEndpoint(getBolOrigin(bol));
    const to = resolveEndpoint(getBolDestination(bol));
    if (!from || !to) continue;
    const pairKey = `${from.canonicalKey}::${to.canonicalKey}`;
    const mk = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    const rec = m.get(pairKey) || {};
    rec[mk] = (rec[mk] || 0) + 1;
    m.set(pairKey, rec);
  }
  return m;
}

/**
 * MapScopeControls — the focus toggle + year/month filter chips that live
 * INSIDE the map view (glass strip over the hero on desktop, a row under
 * the map on mobile, and the expand-dialog's filter bar). One component,
 * three mounts — same state, so the views can't drift.
 */
function MapScopeControls({
  yearFilter,
  monthFilter,
  availableYears,
  availableMonths,
  onYear,
  onMonth,
  showAllLanes,
  onToggleShowAllLanes,
  sampleMode = false,
  yoyMode = false,
  onToggleYoy,
  overallYoy = null,
  yoyAvailable = false,
}: {
  yearFilter: number | null;
  monthFilter: number | null;
  availableYears: number[];
  availableMonths: Set<number>;
  onYear: (y: number | null) => void;
  onMonth: (m: number | null) => void;
  showAllLanes: boolean;
  onToggleShowAllLanes: () => void;
  sampleMode?: boolean;
  /** YoY delta mode — annotates lanes + shows the overall chip. */
  yoyMode?: boolean;
  onToggleYoy?: () => void;
  overallYoy?: YoyDelta | null;
  /** True when a prior-period real total exists to diff against. */
  yoyAvailable?: boolean;
}) {
  const chip = (active: boolean, disabled = false) =>
    [
      "font-display inline-flex h-6 shrink-0 items-center whitespace-nowrap rounded-full border px-2 text-[10px] font-semibold transition-colors",
      disabled
        ? "cursor-default border-slate-100 bg-slate-50 text-slate-300"
        : active
          ? "border-blue-600 bg-blue-600 text-white"
          : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900",
    ].join(" ");

  return (
    <div className="flex items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {/* Focus / full-network toggle. */}
      <button
        type="button"
        onClick={onToggleShowAllLanes}
        title={
          showAllLanes
            ? "Focus the selected lane — other lanes fade to thin ghost lines"
            : "Show all lanes at full strength"
        }
        className={chip(showAllLanes)}
      >
        {showAllLanes ? "Showing all" : "Show all"}
      </button>
      {/* YoY delta toggle — real overall delta from monthly_volumes. */}
      {onToggleYoy && yoyAvailable && (
        <>
          <button
            type="button"
            onClick={onToggleYoy}
            title="Year-over-year: show each lane's and the overall volume change vs the prior year"
            className={chip(yoyMode)}
          >
            YoY
          </button>
          {yoyMode && overallYoy && <YoyChip delta={overallYoy} />}
        </>
      )}
      {availableYears.length > 0 && (
        <>
          <span className="mx-0.5 h-4 w-px shrink-0 bg-slate-200" aria-hidden />
          <span className="font-display shrink-0 text-[9px] font-bold uppercase tracking-wide text-slate-400">
            Year
          </span>
          <button
            type="button"
            className={chip(yearFilter === null)}
            onClick={() => onYear(null)}
          >
            All
          </button>
          {availableYears.map((y) => (
            <button
              key={y}
              type="button"
              className={chip(yearFilter === y)}
              onClick={() => onYear(yearFilter === y ? null : y)}
            >
              {y}
            </button>
          ))}
          <span className="mx-0.5 h-4 w-px shrink-0 bg-slate-200" aria-hidden />
          <span className="font-display shrink-0 text-[9px] font-bold uppercase tracking-wide text-slate-400">
            Month
          </span>
          <button
            type="button"
            className={chip(monthFilter === null)}
            onClick={() => onMonth(null)}
          >
            All
          </button>
          {MONTH_ABBR.map((label, i) => {
            const m = i + 1;
            const has = availableMonths.has(m);
            return (
              <button
                key={label}
                type="button"
                disabled={!has}
                title={
                  has
                    ? undefined
                    : `No shipments recorded in ${label} for this scope`
                }
                className={chip(monthFilter === m, !has)}
                onClick={() => has && onMonth(monthFilter === m ? null : m)}
              >
                {label}
              </button>
            );
          })}
          {sampleMode && (yearFilter != null || monthFilter != null) && (
            <span className="font-display ml-0.5 shrink-0 rounded-full border border-amber-200 bg-amber-50 px-1.5 py-[1px] text-[9px] font-bold text-amber-700">
              sample
            </span>
          )}
        </>
      )}
    </div>
  );
}

/**
 * LaneRankRows — the ranked country-pair rows (rank, flags, origin→dest,
 * shipments, share bar, TEU, expand-in-place city routes + Lane-history
 * jump). Shared by the hero's floating panel (desktop), the below-map
 * sheet (mobile) and the full-screen dialog. Row click = select + fly.
 */
function LaneRankRows({
  rankedPairs,
  totalShipments,
  selectedPair,
  expandedPair,
  onRowClick,
  cityRoutesByPair,
  onOpenLaneHistory,
  reducedMotion = false,
  registerRowRef,
  laneColors,
  laneMonthsByPair,
  monthWindow,
  sampleMode = false,
  yoyMode = false,
  perLaneYoy = null,
}: {
  rankedPairs: any[];
  totalShipments: number;
  selectedPair: string | null;
  expandedPair: string | null;
  onRowClick: (pairKey: string) => void;
  cityRoutesByPair: Map<string, any[]>;
  onOpenLaneHistory?: (pair: LaneHistoryFilter | null) => void;
  reducedMotion?: boolean;
  registerRowRef?: (key: string, el: HTMLButtonElement | null) => void;
  /** Origin-region palette keyed by pairKey — rank chips + share bars use
   *  the SAME color as the lane's map line (card ↔ line mapping). */
  laneColors?: Record<string, LaneMapLaneColor>;
  /** pairKey → { "YYYY-MM": shipments } for the expand-in-place mini bars. */
  laneMonthsByPair?: Map<string, Record<string, number>>;
  /** 12 sequential YYYY-MM keys rendered by the mini bars. */
  monthWindow?: string[];
  /** True when month data derives from the recent-BOL sample, not rollup. */
  sampleMode?: boolean;
  /** YoY mode — annotate each lane with its prior-year delta chip. */
  yoyMode?: boolean;
  /** pairKey → prior-year reconciled shipments (real, rollup path only).
   *  Null when per-lane YoY isn't real for this scope (see TopLanesCard). */
  perLaneYoy?: Map<string, number> | null;
}) {
  return (
    <>
      {rankedPairs.map((pair: any, i: number) => {
        const isSelected = pair.pairKey === selectedPair;
        const isExpanded = pair.pairKey === expandedPair;
        const shipments = Number(pair?.shipments) || 0;
        const share = totalShipments > 0 ? shipments / totalShipments : 0;
        const cityRoutes = cityRoutesByPair.get(pair.pairKey) || [];
        const lc = laneColors?.[pair.pairKey];
        // Per-lane YoY (real, rollup path only). Prior value present but 0 →
        // treat as a new lane; prior missing → no reliable diff (skip chip).
        const priorShip = perLaneYoy?.get(pair.pairKey);
        const laneYoy: YoyDelta | null =
          yoyMode && perLaneYoy && priorShip != null && priorShip > 0
            ? {
                current: shipments,
                prior: priorShip,
                deltaShip: shipments - priorShip,
                pct: ((shipments - priorShip) / priorShip) * 100,
              }
            : null;
        return (
          <div
            key={pair.pairKey}
            className="border-b border-slate-100/80 last:border-b-0"
          >
            <button
              ref={(el) => registerRowRef?.(pair.pairKey, el)}
              type="button"
              onClick={() => onRowClick(pair.pairKey)}
              className={[
                "w-full min-h-[44px] px-3.5 py-2 text-left transition-colors",
                isSelected
                  ? "border-l-2 border-l-blue-600 bg-blue-50/80"
                  : "border-l-2 border-l-transparent hover:bg-slate-50/80",
              ].join(" ")}
            >
              <div className="flex items-center gap-2">
                <span
                  className="font-mono w-5 shrink-0 text-center text-[9px] font-bold"
                  style={{
                    // Rank chip carries the lane's map-line color so the
                    // card ↔ line mapping is instant (CEO 2026-08-13).
                    color: lc
                      ? isSelected
                        ? lc.selected
                        : lc.base
                      : isSelected
                        ? "#2563EB"
                        : "#94A3B8",
                  }}
                >
                  {String(i + 1).padStart(2, "0")}
                </span>
                <LitFlag
                  code={pair.fromMeta?.countryCode}
                  size={13}
                  label={pair.fromMeta?.countryName}
                />
                <span
                  className={[
                    "font-mono truncate text-[11px] font-semibold",
                    isSelected ? "text-slate-900" : "text-slate-700",
                  ].join(" ")}
                >
                  {pair.fromMeta?.countryName}
                </span>
                <ArrowRight
                  className="h-2 w-2 shrink-0 text-slate-400"
                  aria-hidden
                />
                <LitFlag
                  code={pair.toMeta?.countryCode}
                  size={13}
                  label={pair.toMeta?.countryName}
                />
                <span
                  className={[
                    "font-mono truncate text-[11px] font-semibold",
                    isSelected ? "text-slate-900" : "text-slate-700",
                  ].join(" ")}
                >
                  {pair.toMeta?.countryName}
                </span>
                {laneYoy && (
                  <span className="ml-auto shrink-0">
                    <YoyChip delta={laneYoy} compact />
                  </span>
                )}
                <span
                  className={[
                    "font-mono shrink-0 text-[11px] font-bold text-slate-900",
                    laneYoy ? "" : "ml-auto",
                  ].join(" ")}
                >
                  {shipments.toLocaleString()}
                </span>
                <ChevronDown
                  className={[
                    "h-3 w-3 shrink-0 text-slate-400 transition-transform",
                    isExpanded ? "rotate-180" : "",
                  ].join(" ")}
                  aria-hidden
                />
              </div>
              <div className="mt-1.5 flex items-center gap-2 pl-7">
                <div className="h-1 flex-1 overflow-hidden rounded bg-slate-200/70">
                  <div
                    className="h-full rounded"
                    style={{
                      width: `${Math.max(2, share * 100)}%`,
                      // Share bar rides the lane's origin-region color —
                      // exactly what the map line paints — so scanning the
                      // cards against the map takes zero translation.
                      background: lc
                        ? isSelected
                          ? lc.selected
                          : lc.base
                        : isSelected
                          ? "#2563EB"
                          : "#F59E0B",
                      transition: reducedMotion
                        ? "none"
                        : `width 1200ms ease-out ${i * 120}ms`,
                    }}
                  />
                </div>
                <span className="font-mono w-16 shrink-0 text-right text-[9.5px] text-slate-500">
                  {Number(pair.teu) > 0
                    ? `${Math.round(Number(pair.teu)).toLocaleString()} TEU`
                    : `${Math.round(share * 100)}%`}
                </span>
              </div>
            </button>
            {/* Expand-in-place: per-lane month detail + city routes. */}
            {isExpanded && (
              <div className="bg-slate-50/90 px-3.5 py-1.5 pl-10">
                {/* Slate-style per-lane detail (CEO 2026-08-13): a mini
                    month-by-month shipment bar row for THIS lane, from the
                    lane-month rollup (or the dated BOL sample). Hover a
                    bar for the month + exact count. */}
                {monthWindow &&
                  monthWindow.length > 0 &&
                  (() => {
                    const series = laneMonthsByPair?.get(pair.pairKey);
                    if (
                      !series ||
                      !monthWindow.some((mk) => (series[mk] || 0) > 0)
                    ) {
                      return null;
                    }
                    const max = Math.max(
                      1,
                      ...monthWindow.map((mk) => series[mk] || 0),
                    );
                    const barColor = lc?.base ?? "#3B82F6";
                    return (
                      <div className="pb-1.5 pt-1">
                        <div className="font-display text-[9px] font-bold uppercase tracking-[0.1em] text-slate-400">
                          Monthly shipments{sampleMode ? " (sample)" : ""}
                        </div>
                        <div className="mt-1 flex h-7 max-w-[250px] items-end gap-[2px]">
                          {monthWindow.map((mk) => {
                            const v = series[mk] || 0;
                            return (
                              <div
                                key={mk}
                                title={`${laneMonthLabel(mk)} · ${v.toLocaleString()} shipment${v === 1 ? "" : "s"}`}
                                className="min-w-0 flex-1 rounded-[2px]"
                                style={{
                                  height:
                                    v === 0
                                      ? "8%"
                                      : `${Math.max(14, Math.round((v / max) * 100))}%`,
                                  background: v === 0 ? "#E2E8F0" : barColor,
                                  opacity: v === 0 ? 0.8 : 0.9,
                                  transition: reducedMotion
                                    ? "none"
                                    : "height 500ms ease-out",
                                }}
                              />
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}
                {cityRoutes.length === 0 ? (
                  <div className="font-body py-1 text-[10.5px] text-slate-400">
                    No city-level routes resolved for this pair.
                  </div>
                ) : (
                  cityRoutes.slice(0, 6).map((route: any, ri: number) => (
                    <div
                      key={route.displayLabel || ri}
                      className="flex items-center gap-1.5 py-1"
                    >
                      <span className="h-1 w-1 shrink-0 rounded-full bg-blue-500/70" />
                      <span className="font-mono min-w-0 flex-1 truncate text-[10.5px] text-slate-600">
                        {laneEndpointLabel(
                          route.fromMeta,
                          route.rawFrom || undefined,
                        )}{" "}
                        →{" "}
                        {laneEndpointLabel(
                          route.toMeta,
                          route.rawTo || undefined,
                        )}
                      </span>
                      <span className="font-mono shrink-0 text-[10px] text-slate-500">
                        {(Number(route.shipments) || 0).toLocaleString()}
                      </span>
                    </div>
                  ))
                )}
                {cityRoutes.length > 6 && (
                  <div className="font-body py-0.5 text-[10px] text-slate-400">
                    +{cityRoutes.length - 6} more city routes
                  </div>
                )}
                {onOpenLaneHistory && (
                  <button
                    type="button"
                    onClick={() => onOpenLaneHistory(pairToHistoryFilter(pair))}
                    className="font-display mb-1 mt-1 inline-flex min-h-[32px] items-center gap-1 text-[10.5px] font-semibold text-blue-600 hover:text-blue-700"
                  >
                    <History className="h-3 w-3" />
                    View monthly history →
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}

function TopLanesCard({
  canonicalLanes,
  globeLanes: countryPairLanes,
  recentBols = [],
  containerProfile,
  reducedMotion = false,
  onOpenLanesTab,
  onOpenLaneHistory,
  headline = null,
  cadence = [],
  monthlySeries = [],
  shipments12mTotal = null,
  sourceCompanyKey = null,
  selectedYear,
  years,
  onSelectYear,
}: {
  /** Granular per-route rows (city-level) from the snapshot. */
  canonicalLanes: any[];
  /** Canonical country-pair lanes from canonicalizeLanes(). */
  globeLanes?: any[];
  recentBols?: any[];
  containerProfile?: ContainerProfile;
  reducedMotion?: boolean;
  onOpenLanesTab?: () => void;
  onOpenLaneHistory?: (pair: LaneHistoryFilter | null) => void;
  /** ImportYeti slug — resolves the lit_company_lane_months rollup that
   *  powers exact year/month filtering + per-lane month bars. */
  sourceCompanyKey?: string | null;
  /** Page-level Year selector state — wired into the in-map scope so the
   *  existing dropdown is no longer decorative for this card. */
  selectedYear?: number;
  years?: number[];
  onSelectYear?: (year: number) => void;
  /** Strategic-brief headline folded into the hero (ex-banner). */
  headline?: string | null;
  /**
   * 12-month FCL/LCL cadence (parsed_summary.monthly_volumes — same series
   * the Cadence card renders). Drives the compact "12-month shipment trend"
   * strip in the top-left glass panel.
   */
  cadence?: CadencePoint[];
  /**
   * Full month-keyed REAL volume series (parsed_summary.monthly_volumes) —
   * the SAME source the Cadence chart totals. Drives volume reconciliation
   * (lane share × real scope total) + year-over-year deltas so lane cards,
   * map lines and the cadence chart can never disagree.
   */
  monthlySeries?: MonthlyVolumePoint[];
  /**
   * Snapshot's 12-mo shipment total (parsed_summary.shipments_last_12m →
   * routeKpis.shipmentsLast12m). Drives the honesty caption's "~X% of
   * 12-mo volume" share. Null/0 = unknown → the % is omitted.
   */
  shipments12mTotal?: number | null;
}) {
  const isMdUp = useIsMdUp();

  // ── Country pairs (single granularity for map + lane cards) ──────────
  // Prefer the canonicalized country-pair lanes; when absent (legacy
  // callers), group the granular rows by resolved country-pair key.
  const pairs = useMemo(() => {
    if (Array.isArray(countryPairLanes) && countryPairLanes.length > 0) {
      return countryPairLanes.filter(
        (p: any) => p?.fromMeta?.coords && p?.toMeta?.coords,
      );
    }
    const m = new Map<string, any>();
    for (const l of canonicalLanes) {
      const fk = l?.fromMeta?.canonicalKey;
      const tk = l?.toMeta?.canonicalKey;
      if (!fk || !tk || !l?.fromMeta?.coords || !l?.toMeta?.coords) continue;
      const key = `${fk}::${tk}`;
      const draft = m.get(key) || {
        pairKey: key,
        displayLabel: `${l.fromMeta.flag} ${l.fromMeta.countryName} → ${l.toMeta.flag} ${l.toMeta.countryName}`,
        fromMeta: l.fromMeta,
        toMeta: l.toMeta,
        shipments: 0,
        teu: 0,
      };
      draft.shipments += Number(l.shipments) || 0;
      draft.teu += Number(l.teu) || 0;
      m.set(key, draft);
    }
    return [...m.values()].sort(
      (a: any, b: any) => b.shipments - a.shipments || b.teu - a.teu,
    );
  }, [countryPairLanes, canonicalLanes]);

  // ── Year/month scope (CEO 2026-08-13) ────────────────────────────────
  // When the company has lit_company_lane_months rollup rows, an active
  // year/month filter recomputes lanes/counts/TEU/share bars AND the map
  // lines from that exact data. Companies with only the ~50-BOL snapshot
  // filter by the BOLs' dates instead, labeled "(sample)". No filter →
  // the snapshot lanes render exactly as before.
  const laneMonthsQuery = useCompanyLaneMonths(sourceCompanyKey ?? null);
  const rollupRows = laneMonthsQuery.data;
  const hasRollup = Array.isArray(rollupRows) && rollupRows.length > 0;

  const [yearFilter, setYearFilter] = useState<number | null>(null);
  const [monthFilter, setMonthFilter] = useState<number | null>(null);
  const [showAllLanes, setShowAllLanes] = useState(false);
  const scopeActive = yearFilter != null || monthFilter != null;

  // Page-level Year selector wiring: respond to CHANGES of the dropdown
  // (initial mount keeps the unfiltered "All" view). Nothing decorative —
  // picking a year up top scopes this card exactly like the in-map chips.
  const prevSelectedYearRef = useRef(selectedYear);
  useEffect(() => {
    if (prevSelectedYearRef.current === selectedYear) return;
    prevSelectedYearRef.current = selectedYear;
    if (typeof selectedYear === "number" && Number.isFinite(selectedYear)) {
      setYearFilter(selectedYear);
      setMonthFilter(null);
    }
  }, [selectedYear]);

  const handleYearScope = useCallback(
    (y: number | null) => {
      setYearFilter(y);
      setMonthFilter(null);
      // Keep the page-level dropdown in sync when it can represent the pick.
      if (y != null && onSelectYear && Array.isArray(years) && years.includes(y)) {
        onSelectYear(y);
      }
    },
    [onSelectYear, years],
  );
  const handleMonthScope = useCallback((m: number | null) => {
    setMonthFilter(m);
  }, []);

  const sampleDatedBols = useMemo(
    () =>
      recentBols
        .map((bol: any) => ({ bol, d: parseBolDate(getBolDate(bol)) }))
        .filter((x: any): x is { bol: any; d: Date } => Boolean(x.d)),
    [recentBols],
  );

  // Years/months the scope selector exposes. The lane-split SOURCE (rollup or
  // BOL sample) is narrow, but the REAL monthly_volumes series spans every
  // month back to 2015 — and every one of those months has a real total we
  // can reconcile lanes against. So union both: the sample tells us where
  // exact lane manifests exist; monthly_volumes tells us where real TOTAL
  // volume exists (CEO P0 2026-08-14: 2025 was un-scopable + missing months
  // because the selector only saw the ~50-BOL sample). A month present in
  // monthly_volumes but not the sample still reconciles lanes to its real
  // total (modeled distribution), never an empty "no lane activity" state.
  const availableYears = useMemo(() => {
    const s = new Set<number>();
    if (hasRollup) {
      for (const r of rollupRows!) s.add(Number(String(r.month).slice(0, 4)));
    } else {
      for (const { d } of sampleDatedBols) s.add(d.getUTCFullYear());
    }
    for (const p of monthlySeries) {
      if (/^\d{4}-\d{2}$/.test(p.month) && p.shipments > 0) {
        s.add(Number(p.month.slice(0, 4)));
      }
    }
    return [...s].filter((y) => Number.isFinite(y)).sort((a, b) => b - a);
  }, [hasRollup, rollupRows, sampleDatedBols, monthlySeries]);

  const availableMonths = useMemo(() => {
    const s = new Set<number>();
    if (hasRollup) {
      for (const r of rollupRows!) {
        const y = Number(String(r.month).slice(0, 4));
        if (yearFilter != null && y !== yearFilter) continue;
        s.add(Number(String(r.month).slice(5, 7)));
      }
    } else {
      for (const { d } of sampleDatedBols) {
        if (yearFilter != null && d.getUTCFullYear() !== yearFilter) continue;
        s.add(d.getUTCMonth() + 1);
      }
    }
    // Every month with a real total in the selected year is scopable.
    for (const p of monthlySeries) {
      if (!/^\d{4}-\d{2}$/.test(p.month) || p.shipments <= 0) continue;
      const y = Number(p.month.slice(0, 4));
      if (yearFilter != null && y !== yearFilter) continue;
      s.add(Number(p.month.slice(5, 7)));
    }
    return s;
  }, [hasRollup, rollupRows, sampleDatedBols, yearFilter, monthlySeries]);

  const scoped = useMemo<ScopedLaneData | null>(() => {
    if (!scopeActive) return null;
    if (hasRollup) {
      const rows = rollupRows!.filter((r) => {
        const y = Number(String(r.month).slice(0, 4));
        const m = Number(String(r.month).slice(5, 7));
        return (
          (yearFilter == null || y === yearFilter) &&
          (monthFilter == null || m === monthFilter)
        );
      });
      return buildPairsFromRollup(rows);
    }
    const dated = sampleDatedBols.filter(
      ({ d }: { d: Date }) =>
        (yearFilter == null || d.getUTCFullYear() === yearFilter) &&
        (monthFilter == null || d.getUTCMonth() + 1 === monthFilter),
    );
    return buildPairsFromSampleBols(dated);
  }, [scopeActive, hasRollup, rollupRows, sampleDatedBols, yearFilter, monthFilter]);

  // ── Volume reconciliation (CEO P0, 2026-08-14) ───────────────────────
  // The pairs above carry raw ~50-BOL SAMPLE counts (rollup rows are the
  // same sample re-shaped). Reconcile them to the REAL scope total from
  // monthly_volumes (the exact series the Cadence chart totals) so lane
  // volumes + map line weights SUM to the verified total instead of the
  // sample. Each lane's share (shipments AND TEU, independently) is applied
  // to the real total. When the real series is unknown, pairs pass through
  // as raw sample (honest fallback).
  const scopeTotal = useMemo(
    () => realScopeTotal(monthlySeries, yearFilter, monthFilter),
    [monthlySeries, yearFilter, monthFilter],
  );
  /** Prior-period real total for the overall YoY chip (real, spans years). */
  const priorScopeTotal = useMemo(() => {
    if (yearFilter == null) {
      // Trailing-12 default: prior-year window is the 12 months before it.
      const all = monthlySeries.map((p) => p.month);
      if (all.length < 13) return null;
      const priorKeys = new Set(all.slice(-24, -12));
      if (priorKeys.size === 0) return null;
      let shipments = 0;
      let teu = 0;
      for (const p of monthlySeries) {
        if (!priorKeys.has(p.month)) continue;
        shipments += p.shipments;
        teu += p.teu;
      }
      return shipments > 0 || teu > 0 ? { shipments, teu, months: priorKeys.size } : null;
    }
    // Year scoped. When a single month is picked, compare that month LY.
    if (monthFilter != null) {
      return realScopeTotal(monthlySeries, yearFilter - 1, monthFilter);
    }
    // Whole year scoped: align the prior year to only the months the CURRENT
    // year actually has data for, so a partial current year (e.g. 2026 Jan–
    // Jul) compares YTD vs the same window LY instead of a full prior year
    // (which would misread as a decline). For a complete past year this is
    // simply all 12 months.
    const curMonths = new Set<number>();
    for (const p of monthlySeries) {
      if (!/^\d{4}-\d{2}$/.test(p.month)) continue;
      if (Number(p.month.slice(0, 4)) !== yearFilter) continue;
      if (p.shipments > 0) curMonths.add(Number(p.month.slice(5, 7)));
    }
    if (curMonths.size === 0) return null;
    let shipments = 0;
    let teu = 0;
    for (const p of monthlySeries) {
      if (!/^\d{4}-\d{2}$/.test(p.month)) continue;
      if (Number(p.month.slice(0, 4)) !== yearFilter - 1) continue;
      if (!curMonths.has(Number(p.month.slice(5, 7)))) continue;
      shipments += p.shipments;
      teu += p.teu;
    }
    return shipments > 0 || teu > 0
      ? { shipments, teu, months: curMonths.size }
      : null;
  }, [monthlySeries, yearFilter, monthFilter]);

  // Lane-split source for the scoped view. Prefer the scoped sample (exact
  // rollup rows or dated BOLs for the period). But when a period is scoped
  // and the sample carries NO lanes for it (common for past years — the
  // ~50-BOL sample is recent-only) YET monthly_volumes has a real total for
  // that period, fall back to the all-time lane distribution so we can still
  // reconcile it to the real total. This is the CEO P0 fix: a scoped year
  // with real volume must show reconciled lanes, never "no lane activity".
  const rawViewPairs = useMemo(() => {
    if (!scoped) return pairs;
    if (scoped.pairs.length > 0) return scoped.pairs;
    // Scoped but empty sample → if the period has real total volume, model
    // the split from the all-time snapshot lanes; else stay honestly empty.
    if (scopeTotal && scopeTotal.shipments > 0 && pairs.length > 0) return pairs;
    return scoped.pairs;
  }, [scoped, pairs, scopeTotal]);
  /** True when lanes are modeled off the all-time distribution because the
   *  scoped period's own sample was empty (drives an honest caption). */
  const usedAllTimeSplit =
    scopeActive &&
    !!scoped &&
    scoped.pairs.length === 0 &&
    rawViewPairs.length > 0;
  const { pairs: reconciledPairs, reconciled: isReconciled } = useMemo(
    () => reconcilePairsToTotal(rawViewPairs, scopeTotal),
    [rawViewPairs, scopeTotal],
  );
  /** Pairs the hero + dialog actually render: reconciled to the real total. */
  const viewPairs = reconciledPairs;

  // ── Year-over-year toggle (CEO new, 2026-08-14) ──────────────────────
  const [yoyMode, setYoyMode] = useState(false);
  /** Overall YoY delta from the REAL monthly series (source of truth). */
  const overallYoy = useMemo(() => {
    if (!scopeTotal || !priorScopeTotal || priorScopeTotal.shipments <= 0) {
      return null;
    }
    const deltaShip = scopeTotal.shipments - priorScopeTotal.shipments;
    const pct = (deltaShip / priorScopeTotal.shipments) * 100;
    return {
      current: scopeTotal.shipments,
      prior: priorScopeTotal.shipments,
      deltaShip,
      pct,
    };
  }, [scopeTotal, priorScopeTotal]);
  /**
   * Per-lane YoY. REAL only when a year is scoped: reconcile the prior year's
   * lanes to the prior year's real total and diff by pairKey. On the
   * trailing-12 default (no year) we can't cleanly split lanes across the
   * year boundary from the sample, so per-lane YoY is omitted (overall YoY
   * still shows — it's real). Never fabricated.
   */
  const perLaneYoy = useMemo(() => {
    if (!yoyMode || yearFilter == null || !hasRollup) return null;
    const priorTotal = realScopeTotal(monthlySeries, yearFilter - 1, monthFilter);
    if (!priorTotal || priorTotal.shipments <= 0) return null;
    const priorRows = rollupRows!.filter((r) => {
      const y = Number(String(r.month).slice(0, 4));
      const m = Number(String(r.month).slice(5, 7));
      return y === yearFilter - 1 && (monthFilter == null || m === monthFilter);
    });
    if (priorRows.length === 0) return null;
    const priorBuilt = buildPairsFromRollup(priorRows);
    const { pairs: priorReconciled } = reconcilePairsToTotal(
      priorBuilt.pairs,
      priorTotal,
    );
    const map = new Map<string, number>();
    for (const p of priorReconciled) map.set(p.pairKey, Number(p.shipments) || 0);
    return map;
  }, [yoyMode, yearFilter, monthFilter, hasRollup, rollupRows, monthlySeries]);

  const scopeLabel = scopeActive
    ? monthFilter != null && yearFilter != null
      ? `${MONTH_ABBR[monthFilter - 1]} ${yearFilter}`
      : monthFilter != null
        ? `${MONTH_ABBR[monthFilter - 1]} (all years)`
        : String(yearFilter)
    : null;

  const rankedPairs = useMemo(
    () =>
      viewPairs
        .slice()
        .sort(
          (a: any, b: any) =>
            (Number(b?.shipments) || 0) - (Number(a?.shipments) || 0),
        )
        .slice(0, 10),
    [viewPairs],
  );

  // Origin-region lane colors — same record drives the map lines, the
  // rank chips and the share bars (deterministic, keyed by pairKey).
  const laneColors = useMemo(() => {
    const out: Record<string, LaneMapLaneColor> = {};
    for (const p of viewPairs) {
      const c = laneRegionColor(p?.fromMeta?.countryCode);
      out[p.pairKey] = { base: c.base, selected: c.selected, glow: c.glow };
    }
    return out;
  }, [viewPairs]);

  // Per-lane month series for the expand-in-place mini bars (Slate-style
  // per-load detail). Rollup when it exists; dated-BOL sample otherwise.
  const laneMonthsByPair = useMemo(() => {
    if (hasRollup) return buildLaneMonthsFromRollup(rollupRows!);
    return buildLaneMonthsFromBols(sampleDatedBols);
  }, [hasRollup, rollupRows, sampleDatedBols]);

  const monthWindow = useMemo(() => {
    let endKey: string | null = null;
    for (const rec of laneMonthsByPair.values()) {
      for (const mk of Object.keys(rec)) {
        if (!endKey || mk > endKey) endKey = mk;
      }
    }
    if (!endKey) return [] as string[];
    return laneMonthWindowKeys(yearFilter, endKey);
  }, [laneMonthsByPair, yearFilter]);
  const totalPairShipments = useMemo(
    () =>
      rankedPairs.reduce(
        (s: number, p: any) => s + (Number(p?.shipments) || 0),
        0,
      ),
    [rankedPairs],
  );

  // GlobeLane[] for the map — id = pairKey so map ids and lane-card ids
  // are literally the same key (selection can't desync).
  const heroLanes: GlobeLane[] = useMemo(
    () =>
      rankedPairs.map((p: any) => ({
        id: p.pairKey,
        from: p.fromMeta.canonicalKey,
        to: p.toMeta.canonicalKey,
        coords: [p.fromMeta.coords, p.toMeta.coords],
        fromMeta: p.fromMeta,
        toMeta: p.toMeta,
        shipments: Number(p.shipments) || 0,
      })),
    [rankedPairs],
  );

  // City routes per pair — the granular rows whose resolved endpoints
  // collapse into this country pair. Rendered in the expand-in-place
  // drawer under a lane-card row.
  const cityRoutesByPair = useMemo(() => {
    const m = new Map<string, any[]>();
    for (const l of canonicalLanes) {
      const fk = l?.fromMeta?.canonicalKey;
      const tk = l?.toMeta?.canonicalKey;
      if (!fk || !tk) continue;
      const key = `${fk}::${tk}`;
      const arr = m.get(key) || [];
      arr.push(l);
      m.set(key, arr);
    }
    for (const arr of m.values()) {
      arr.sort(
        (a: any, b: any) =>
          (Number(b?.shipments) || 0) - (Number(a?.shipments) || 0),
      );
    }
    return m;
  }, [canonicalLanes]);

  // Granular routes that resolved to no pair (unresolvable endpoint) —
  // surfaced as one muted, non-selectable remainder row so counts stay
  // honest against the "N routes" the snapshot reports.
  const unresolvedRoutes = useMemo(
    () =>
      canonicalLanes.filter(
        (l: any) => !l?.fromMeta?.canonicalKey || !l?.toMeta?.canonicalKey,
      ),
    [canonicalLanes],
  );

  // Last-activity month per pair from the recent-BOL sample (origin-country
  // match — destination is ~always US in this feed so origin is the
  // discriminator). Powers the expanded dialog's lane-detail popover.
  const lastActivityByPair = useMemo(() => {
    const m = new Map<string, Date>();
    for (const p of rankedPairs) {
      const fromName = String(p?.fromMeta?.countryName || "").toLowerCase();
      if (!fromName) continue;
      let best: Date | null = null;
      for (const b of recentBols) {
        const origin = String(
          b?.supplier_country || b?.origin_country || b?.raw?.country || "",
        ).toLowerCase();
        if (!origin) continue;
        if (!origin.includes(fromName) && !fromName.includes(origin)) continue;
        const d = parseBolDate(getBolDate(b));
        if (d && (!best || d.getTime() > best.getTime())) best = d;
      }
      if (best) m.set(p.pairKey, best);
    }
    return m;
  }, [rankedPairs, recentBols]);

  // Scoped views override the snapshot-derived maps while filtering. When the
  // scoped sample was empty and we modeled lanes off the all-time split, keep
  // the all-time city-route / last-activity maps so the expand drawer still
  // has route detail (the reconciled pairs share the same pairKeys).
  const cityRoutesEffective =
    scoped && !usedAllTimeSplit ? scoped.cityRoutesByPair : cityRoutesByPair;
  const lastActivityEffective =
    scoped && !usedAllTimeSplit ? scoped.lastActivityByPair : lastActivityByPair;

  const [selectedPair, setSelectedPair] = useState<string | null>(
    rankedPairs[0]?.pairKey ?? null,
  );
  const [expandedPair, setExpandedPair] = useState<string | null>(null);
  // Keep selection valid as data arrives / scope changes: default to the
  // #1 lane (focused view opens on the top lane), and re-anchor to the new
  // top lane whenever the current selection drops out of the ranked set.
  useEffect(() => {
    if (rankedPairs.length === 0) return;
    if (
      !selectedPair ||
      !rankedPairs.some((p: any) => p.pairKey === selectedPair)
    ) {
      setSelectedPair(rankedPairs[0].pairKey);
      setExpandedPair(null);
    }
  }, [rankedPairs, selectedPair]);
  const [mapDialogOpen, setMapDialogOpen] = useState(false);

  // Track whether the latest selection came from the map so we only
  // auto-scroll the lane cards when selection originates there.
  const lastSelectionSourceRef = useRef<"row" | "map" | null>(null);
  const rowRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  useEffect(() => {
    if (!selectedPair) return;
    if (lastSelectionSourceRef.current !== "map") return;
    const el = rowRefs.current[selectedPair];
    if (el && typeof el.scrollIntoView === "function") {
      el.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [selectedPair]);

  const handleSelectFromMap = useCallback((id: string) => {
    lastSelectionSourceRef.current = "map";
    setSelectedPair(id);
    if (id) setExpandedPair(id);
  }, []);

  const handleRowClick = useCallback(
    (pairKey: string) => {
      lastSelectionSourceRef.current = "row";
      if (pairKey === selectedPair && pairKey === expandedPair) {
        setExpandedPair(null);
      } else {
        setSelectedPair(pairKey);
        setExpandedPair(pairKey);
      }
    },
    [selectedPair, expandedPair],
  );

  const registerRowRef = useCallback(
    (key: string, el: HTMLButtonElement | null) => {
      rowRefs.current[key] = el;
    },
    [],
  );

  // ── Density-adaptive height (CEO feedback 2026-08-13, preserved) ─────
  // Sparse accounts get a ~380px map, mid 460px, rich the full 520px.
  // Mobile is a fixed 320px with the lane sheet below.
  const laneCount = viewPairs.length;
  const density: "compact" | "medium" | "rich" =
    laneCount <= 4 ? "compact" : laneCount <= 10 ? "medium" : "rich";
  const heroHeightClass =
    density === "compact"
      ? "h-[320px] md:h-[380px]"
      : density === "medium"
        ? "h-[320px] md:h-[460px]"
        : "h-[320px] md:h-[520px]";

  // Keep lanes clear of the floating panels: on ≥md the lane cards dock
  // top-right (340px + gutters) and the headline strip sits top-left.
  const fitPadding = isMdUp
    ? { top: 56, right: 380, bottom: 48, left: 40 }
    : { top: 20, right: 20, bottom: 56, left: 20 };

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
      <LitSectionCard title="Top trade lanes" sub="By trailing-12m share">
        <EmptyMessage text="No lane data yet — try Refresh Intel to pull the latest shipments." />
      </LitSectionCard>
    );
  }

  // Shared headline block — glass strip top-left on desktop, regular
  // header block above the map on mobile.
  const headlineBlock = (
    <>
      <div className="flex items-center gap-2">
        <span className="font-display text-[9px] font-bold uppercase tracking-[0.14em] text-blue-600">
          Global trade lanes
        </span>
        <span className="h-px w-8 bg-blue-200" />
        <span className="font-display text-[9px] font-semibold text-slate-400">
          Recent activity
        </span>
      </div>
      <div className="font-display mt-1 max-w-[420px] text-[13.5px] font-semibold leading-snug tracking-tight text-slate-900 md:text-[14.5px]">
        {headline ||
          `${rankedPairs.length} active country ${
            rankedPairs.length === 1 ? "lane" : "lanes"
          } across this account's recent import history.`}
      </div>
      {/* 12-month shipment trend — real parsed_summary.monthly_volumes
          data as a quiet bar strip. Hover a bar for month + count. */}
      {cadence.length > 0 && (
        <div className="mt-2">
          <div className="font-display text-[9px] font-bold uppercase tracking-[0.1em] text-slate-400">
            12-month shipment trend
          </div>
          <div className="mt-1 flex h-6 max-w-[240px] items-end gap-[3px]">
            {(() => {
              const maxTotal = Math.max(
                1,
                ...cadence.map((c) => Number(c.total) || 0),
              );
              return cadence.map((c, ci) => (
                <div
                  key={`${c.label}-${ci}`}
                  title={`${c.label} · ${(Number(c.total) || 0).toLocaleString()} shipment${
                    (Number(c.total) || 0) === 1 ? "" : "s"
                  }`}
                  className="w-[13px] shrink-0 rounded-[2px] bg-slate-300 transition-colors hover:bg-blue-400"
                  style={{
                    height: `${Math.max(
                      10,
                      Math.round(((Number(c.total) || 0) / maxTotal) * 100),
                    )}%`,
                  }}
                />
              ));
            })()}
          </div>
        </div>
      )}
    </>
  );

  const honestyCaption = (() => {
    // Reconciled path (CEO P0, 2026-08-14): lane volumes are the lane's
    // SAMPLE share applied to the REAL scope total from monthly_volumes, so
    // they SUM to the verified total the Cadence chart shows. Label it as
    // modeled — a share applied to a verified volume, never a raw manifest.
    const scopeWord = scopeLabel
      ? scopeLabel
      : yearFilter == null
        ? "the trailing 12 months"
        : String(yearFilter);
    if (isReconciled && scopeTotal) {
      const src = usedAllTimeSplit
        ? "this account's all-time lane distribution"
        : scoped && hasRollup
          ? `${scoped.sourceRecords.toLocaleString()} lane-month rollup record${
              scoped.sourceRecords === 1 ? "" : "s"
            }`
          : `the ${recentBols.length.toLocaleString()}-shipment lane sample`;
      return `Modeled — each lane's share (from ${src}) applied to the verified ${scopeWord} volume of ${scopeTotal.shipments.toLocaleString()} shipments${
        scopeTotal.teu > 0 ? ` / ${scopeTotal.teu.toLocaleString()} TEU` : ""
      }. Lane totals reconcile to the Cadence chart.`;
    }
    // Real series unknown → honest raw-sample fallback (legacy behavior).
    if (scoped && scopeLabel) {
      if (hasRollup) {
        return `Filtered to ${scopeLabel} — exact counts from ${scoped.sourceRecords.toLocaleString()} lane-month rollup record${
          scoped.sourceRecords === 1 ? "" : "s"
        }.`;
      }
      return `Filtered to ${scopeLabel} using the dates on the ${recentBols.length.toLocaleString()} most recent shipments (sample — not the full manifest).`;
    }
    if (recentBols.length === 0) return null;
    const n = recentBols.length;
    const total = Number(shipments12mTotal);
    const pct =
      Number.isFinite(total) && total > 0
        ? Math.min(100, Math.max(1, Math.round((n / total) * 100)))
        : null;
    return `Lanes derived from the ${n.toLocaleString()} most recent shipments${
      pct != null ? ` (~${pct}% of 12-mo volume)` : ""
    }`;
  })();

  const unresolvedInfo = scoped
    ? { count: scoped.unresolvedCount, shipments: scoped.unresolvedShipments }
    : {
        count: unresolvedRoutes.length,
        shipments: unresolvedRoutes.reduce(
          (s: number, l: any) => s + (Number(l.shipments) || 0),
          0,
        ),
      };

  const laneListFooter = (
    <>
      {unresolvedInfo.count > 0 && (
        <div className="flex items-center gap-2 px-3.5 py-2">
          <span className="font-mono w-5 shrink-0 text-center text-[9px] font-bold text-slate-300">
            ··
          </span>
          <span className="font-body min-w-0 flex-1 truncate text-[10.5px] text-slate-400">
            {unresolvedInfo.count} unresolved route
            {unresolvedInfo.count === 1 ? "" : "s"}
          </span>
          <span className="font-mono shrink-0 text-[10px] text-slate-400">
            {unresolvedInfo.shipments.toLocaleString()}
          </span>
        </div>
      )}
      {!scoped && onOpenLanesTab && canonicalLanes.length > 0 && (
        <div className="px-3.5 py-2">
          <button
            type="button"
            onClick={onOpenLanesTab}
            className="font-body inline-flex min-h-[32px] items-center gap-1 text-[11.5px] font-medium text-blue-600 hover:text-blue-700"
          >
            View all {canonicalLanes.length.toLocaleString()} routes →
          </button>
        </div>
      )}
    </>
  );

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
      {/* Mobile header — regular block above the map so the small map
          stays fully visible (nothing overlays it except Expand). */}
      <div className="px-4 pb-3 pt-3.5 md:hidden">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">{headlineBlock}</div>
          {onOpenLaneHistory && (
            <button
              type="button"
              onClick={() => onOpenLaneHistory(null)}
              className="font-display inline-flex min-h-[44px] shrink-0 items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 text-[10.5px] font-semibold text-slate-600 hover:bg-slate-50 hover:text-slate-900"
            >
              <History className="h-3 w-3" />
              Lane history
            </button>
          )}
        </div>
      </div>

      {/* ── Full-bleed interactive map hero ───────────────────────────── */}
      {/* While the full-screen dialog is open the hero map + its floating
          glass overlays UNMOUNT entirely (CEO bug 2026-08-13: the dialog
          stacked on top of the still-rendered hero, producing a
          double-layer view — two copies of the same map). The sized
          container div stays so the page layout doesn't jump on close.
          All selection/filter state lives up here in TopLanesCard, so
          closing the dialog remounts the hero with selection, year/month
          scope and focus toggle intact; LaneMap re-creates its Leaflet
          instance fresh on remount (its own ResizeObserver handles
          sizing), so no manual invalidateSize is needed. */}
      <div className={["relative w-full", heroHeightClass].join(" ")}>
        {!mapDialogOpen && (
          <>
        <LaneMap
          lanes={heroLanes}
          selectedLane={selectedPair}
          onSelectLane={handleSelectFromMap}
          height="fill"
          variant="light"
          volumeScale
          zoomControlPosition="bottomleft"
          fitPadding={fitPadding}
          laneColors={laneColors}
          unselectedStyle={showAllLanes ? "fade" : "ghost"}
          flow
        />

        {/* Desktop: scope controls (focus toggle + year/month chips) in a
            glass strip along the bottom, clear of the zoom control (left)
            and the lane cards (right). */}
        <div className="pointer-events-none absolute bottom-4 left-14 right-[372px] z-[700] hidden md:block">
          <div
            className={[
              "pointer-events-auto inline-block max-w-full px-2.5 py-1.5",
              GLASS_PANEL,
            ].join(" ")}
          >
            <MapScopeControls
              yearFilter={yearFilter}
              monthFilter={monthFilter}
              availableYears={availableYears}
              availableMonths={availableMonths}
              onYear={handleYearScope}
              onMonth={handleMonthScope}
              showAllLanes={showAllLanes}
              onToggleShowAllLanes={() => setShowAllLanes((v) => !v)}
              sampleMode={!hasRollup}
              yoyMode={yoyMode}
              onToggleYoy={() => setYoyMode((v) => !v)}
              overallYoy={overallYoy}
              yoyAvailable={overallYoy != null}
            />
          </div>
        </div>

        {/* Desktop: slim glass strip top-left — headline + 12-mo trend. */}
        <div className="pointer-events-none absolute left-4 top-4 z-[700] hidden max-w-[calc(100%-400px)] md:block">
          <div className={["pointer-events-auto px-4 py-3", GLASS_PANEL].join(" ")}>
            {headlineBlock}
          </div>
        </div>

        {/* Desktop: floating lane cards top-right. */}
        <div
          className={[
            "absolute right-4 top-4 z-[700] hidden max-h-[calc(100%-32px)] w-[340px] flex-col overflow-hidden md:flex",
            GLASS_PANEL,
          ].join(" ")}
        >
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-100 px-3.5 pb-2 pt-2.5">
            <div className="flex min-w-0 items-center gap-1.5">
              <span className="font-display truncate text-[10px] font-bold uppercase tracking-wide text-slate-500">
                Top lanes · country pairs
              </span>
              <span className="font-mono shrink-0 text-[10px] font-semibold text-slate-400">
                {rankedPairs.length}
              </span>
              {scopeActive && scopeLabel && (
                <span className="font-display shrink-0 rounded-full border border-blue-200 bg-blue-50 px-1.5 py-[1px] text-[9px] font-bold text-blue-700">
                  {scopeLabel}
                </span>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {onOpenLaneHistory && (
                <button
                  type="button"
                  onClick={() => onOpenLaneHistory(null)}
                  title="Lane history"
                  className="font-display inline-flex h-7 items-center gap-1 rounded-md border border-slate-200 bg-white/80 px-2 text-[10px] font-semibold text-slate-600 hover:bg-white hover:text-slate-900"
                >
                  <History className="h-3 w-3" />
                  History
                </button>
              )}
              <button
                type="button"
                onClick={() => setMapDialogOpen(true)}
                title="Expand map"
                aria-label="Expand map to full screen"
                className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 bg-white/80 text-slate-600 hover:bg-white hover:text-blue-600"
              >
                <Maximize2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {scopeActive && rankedPairs.length === 0 ? (
              <ScopedEmptyState
                scopeLabel={scopeLabel}
                onReset={() => handleYearScope(null)}
              />
            ) : (
              <LaneRankRows
                rankedPairs={rankedPairs}
                totalShipments={totalPairShipments}
                selectedPair={selectedPair}
                expandedPair={expandedPair}
                onRowClick={handleRowClick}
                cityRoutesByPair={cityRoutesEffective}
                onOpenLaneHistory={onOpenLaneHistory}
                reducedMotion={reducedMotion}
                registerRowRef={registerRowRef}
                laneColors={laneColors}
                laneMonthsByPair={laneMonthsByPair}
                monthWindow={monthWindow}
                sampleMode={!hasRollup}
                yoyMode={yoyMode}
                perLaneYoy={perLaneYoy}
              />
            )}
            {laneListFooter}
          </div>
        </div>

        {/* Mobile: expand button floats top-right over the map. */}
        <button
          type="button"
          onClick={() => setMapDialogOpen(true)}
          aria-label="Expand map to full screen"
          className={[
            "absolute right-3 top-3 z-[700] inline-flex h-11 w-11 items-center justify-center text-slate-600 md:hidden",
            GLASS_PANEL,
          ].join(" ")}
        >
          <Maximize2 className="h-4 w-4" />
        </button>
          </>
        )}
      </div>

      {/* Mobile: scope controls as a scrollable row under the map. */}
      <div className="border-t border-slate-100 px-3 py-2 md:hidden">
        <MapScopeControls
          yearFilter={yearFilter}
          monthFilter={monthFilter}
          availableYears={availableYears}
          availableMonths={availableMonths}
          onYear={handleYearScope}
          onMonth={handleMonthScope}
          showAllLanes={showAllLanes}
          onToggleShowAllLanes={() => setShowAllLanes((v) => !v)}
          sampleMode={!hasRollup}
          yoyMode={yoyMode}
          onToggleYoy={() => setYoyMode((v) => !v)}
          overallYoy={overallYoy}
          yoyAvailable={overallYoy != null}
        />
      </div>

      {/* Mobile: lane cards BELOW the map as a scrollable sheet. */}
      <div className="max-h-[340px] overflow-y-auto border-t border-slate-100 md:hidden">
        <div className="flex items-center gap-1.5 px-3.5 pb-1 pt-3">
          <span className="font-display text-[10px] font-bold uppercase tracking-wide text-slate-500">
            Top lanes · country pairs
          </span>
          {scopeActive && scopeLabel && (
            <span className="font-display rounded-full border border-blue-200 bg-blue-50 px-1.5 py-[1px] text-[9px] font-bold text-blue-700">
              {scopeLabel}
            </span>
          )}
          <span className="font-mono ml-auto text-[10px] font-semibold text-slate-400">
            {rankedPairs.length}
          </span>
        </div>
        {scopeActive && rankedPairs.length === 0 ? (
          <ScopedEmptyState
            scopeLabel={scopeLabel}
            onReset={() => handleYearScope(null)}
          />
        ) : (
          <LaneRankRows
            rankedPairs={rankedPairs}
            totalShipments={totalPairShipments}
            selectedPair={selectedPair}
            expandedPair={expandedPair}
            onRowClick={handleRowClick}
            cityRoutesByPair={cityRoutesEffective}
            onOpenLaneHistory={onOpenLaneHistory}
            reducedMotion={reducedMotion}
            registerRowRef={registerRowRef}
            laneColors={laneColors}
            laneMonthsByPair={laneMonthsByPair}
            monthWindow={monthWindow}
            sampleMode={!hasRollup}
            yoyMode={yoyMode}
            perLaneYoy={perLaneYoy}
          />
        )}
        {laneListFooter}
      </div>

      {/* Container-mix bar — white strip below the hero. */}
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

      {/* Honesty label (CEO trust P0, f8dbf067) — lanes derive from the
          snapshot's recent-BOL sample, not the full 12-mo manifest. */}
      {honestyCaption && (
        <div className="border-t border-slate-100 px-3 py-2 sm:px-4">
          <p className="font-body m-0 text-[10.5px] leading-snug text-slate-400">
            {honestyCaption}
          </p>
        </div>
      )}

      {/* Full-screen map dialog — shares the SAME scope state as the hero
          so year/month filtering stays consistent between the two views. */}
      {mapDialogOpen && (
        <TradeLanesMapDialog
          pairs={viewPairs}
          cityRoutesByPair={cityRoutesEffective}
          lastActivityByPair={lastActivityEffective}
          initialSelected={selectedPair}
          reducedMotion={reducedMotion}
          onClose={() => setMapDialogOpen(false)}
          onOpenLaneHistory={
            onOpenLaneHistory
              ? (f: LaneHistoryFilter | null) => {
                  setMapDialogOpen(false);
                  onOpenLaneHistory(f);
                }
              : undefined
          }
          laneColors={laneColors}
          laneMonthsByPair={laneMonthsByPair}
          monthWindow={monthWindow}
          sampleMode={!hasRollup}
          showAllLanes={showAllLanes}
          onToggleShowAllLanes={() => setShowAllLanes((v) => !v)}
          yoyMode={yoyMode}
          onToggleYoy={() => setYoyMode((v) => !v)}
          overallYoy={overallYoy}
          perLaneYoy={perLaneYoy}
          scope={{
            yearFilter,
            monthFilter,
            availableYears,
            availableMonths,
            onYear: handleYearScope,
            onMonth: handleMonthScope,
            label: scopeLabel,
          }}
        />
      )}
    </div>
  );
}

/** Honest empty state when an active year/month scope has zero lanes. */
function ScopedEmptyState({
  scopeLabel,
  onReset,
}: {
  scopeLabel: string | null;
  onReset: () => void;
}) {
  return (
    <div className="px-3.5 py-4">
      <p className="font-display m-0 text-[11.5px] font-semibold text-slate-700">
        No lane activity in {scopeLabel || "this scope"}
      </p>
      <p className="font-body mt-0.5 text-[10.5px] leading-snug text-slate-400">
        Shipment records don't cover this period yet.
      </p>
      <button
        type="button"
        onClick={onReset}
        className="font-display mt-1.5 inline-flex min-h-[32px] items-center text-[10.5px] font-semibold text-blue-600 hover:text-blue-700"
      >
        Reset filters →
      </button>
    </div>
  );
}

/**
 * TradeLanesMapDialog — full-screen expansion of the trade-lanes map.
 *
 * Maximized map (same Explorer-style light basemap) + richer tooling:
 * filter chips (origin country, min shipments, transport mode when the
 * lane data carries a `mode` field), a volume legend, Leaflet zoom
 * controls, the floating lane cards, and a lane-detail popover for the
 * selected lane (top city route, shipments, TEU, last activity, jump to
 * monthly history).
 *
 * Desktop: lane cards dock right, filters ride top-left over the map,
 * legend bottom-left, detail popover bottom-center. Mobile: filters are
 * a horizontal chip row above the map, the lane list is a bottom sheet
 * below it, and the detail card renders at the top of that sheet.
 */
function TradeLanesMapDialog({
  pairs,
  cityRoutesByPair,
  lastActivityByPair,
  initialSelected,
  reducedMotion = false,
  onClose,
  onOpenLaneHistory,
  laneColors,
  laneMonthsByPair,
  monthWindow,
  sampleMode = false,
  showAllLanes = false,
  onToggleShowAllLanes,
  yoyMode = false,
  onToggleYoy,
  overallYoy = null,
  perLaneYoy = null,
  scope,
}: {
  pairs: any[];
  cityRoutesByPair: Map<string, any[]>;
  lastActivityByPair: Map<string, Date>;
  initialSelected: string | null;
  reducedMotion?: boolean;
  onClose: () => void;
  onOpenLaneHistory?: (pair: LaneHistoryFilter | null) => void;
  /** Origin-region palette keyed by pairKey (shared with the hero). */
  laneColors?: Record<string, LaneMapLaneColor>;
  laneMonthsByPair?: Map<string, Record<string, number>>;
  monthWindow?: string[];
  sampleMode?: boolean;
  showAllLanes?: boolean;
  onToggleShowAllLanes?: () => void;
  yoyMode?: boolean;
  onToggleYoy?: () => void;
  overallYoy?: YoyDelta | null;
  perLaneYoy?: Map<string, number> | null;
  /** Shared year/month scope state — lives in TopLanesCard so the hero
   *  and this dialog can never disagree. */
  scope?: {
    yearFilter: number | null;
    monthFilter: number | null;
    availableYears: number[];
    availableMonths: Set<number>;
    onYear: (y: number | null) => void;
    onMonth: (m: number | null) => void;
    label: string | null;
  };
}) {
  const isMdUp = useIsMdUp();
  const [selected, setSelected] = useState<string | null>(initialSelected);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState<boolean>(!!initialSelected);
  const [originFilter, setOriginFilter] = useState<string | null>(null);
  const [modeFilter, setModeFilter] = useState<string | null>(null);
  const [minShipments, setMinShipments] = useState<number>(0);

  // Escape closes; lock body scroll while open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  const ranked = useMemo(
    () =>
      pairs
        .slice()
        .sort(
          (a: any, b: any) =>
            (Number(b?.shipments) || 0) - (Number(a?.shipments) || 0),
        ),
    [pairs],
  );

  // Origin-country chips — top origins by shipments.
  const originChips = useMemo(() => {
    const m = new Map<
      string,
      { key: string; name: string; code: string; shipments: number }
    >();
    for (const p of ranked) {
      const key = p?.fromMeta?.canonicalKey;
      if (!key) continue;
      const cur = m.get(key) || {
        key,
        name: p?.fromMeta?.countryName || key,
        code: p?.fromMeta?.countryCode || "",
        shipments: 0,
      };
      cur.shipments += Number(p?.shipments) || 0;
      m.set(key, cur);
    }
    return [...m.values()]
      .sort((a, b) => b.shipments - a.shipments)
      .slice(0, 8);
  }, [ranked]);

  // Transport-mode chips — only when the lane data actually carries a
  // mode field (honest: no fake "Ocean/Air" toggles on mode-less data).
  const modeChips = useMemo(() => {
    const s = new Set<string>();
    for (const p of ranked) {
      const mode = String(p?.mode || "").trim();
      if (mode) s.add(mode);
    }
    return [...s].sort();
  }, [ranked]);

  const filtered = useMemo(
    () =>
      ranked.filter(
        (p: any) =>
          (!originFilter || p?.fromMeta?.canonicalKey === originFilter) &&
          (!modeFilter || String(p?.mode || "") === modeFilter) &&
          (Number(p?.shipments) || 0) >= minShipments,
      ),
    [ranked, originFilter, modeFilter, minShipments],
  );

  const totalShipments = useMemo(
    () =>
      filtered.reduce((s: number, p: any) => s + (Number(p?.shipments) || 0), 0),
    [filtered],
  );

  // Map lanes — every filtered pair (capped at 30 for render sanity;
  // the hero only shows 10, this is the "richer tools" view).
  const lanes: GlobeLane[] = useMemo(
    () =>
      filtered.slice(0, 30).map((p: any) => ({
        id: p.pairKey,
        from: p.fromMeta.canonicalKey,
        to: p.toMeta.canonicalKey,
        coords: [p.fromMeta.coords, p.toMeta.coords],
        fromMeta: p.fromMeta,
        toMeta: p.toMeta,
        shipments: Number(p.shipments) || 0,
      })),
    [filtered],
  );

  // Drop the selection when a filter removes its lane.
  useEffect(() => {
    if (selected && !filtered.some((p: any) => p.pairKey === selected)) {
      setSelected(null);
      setDetailOpen(false);
    }
  }, [filtered, selected]);

  const handleSelect = useCallback((id: string) => {
    setSelected(id);
    setExpandedRow(id);
    setDetailOpen(true);
  }, []);

  const handleRowClick = useCallback(
    (pairKey: string) => {
      if (pairKey === selected && pairKey === expandedRow) {
        setExpandedRow(null);
      } else {
        setSelected(pairKey);
        setExpandedRow(pairKey);
        setDetailOpen(true);
      }
    },
    [selected, expandedRow],
  );

  const selPair = selected
    ? ranked.find((p: any) => p.pairKey === selected)
    : null;
  const selRoutes = selPair ? cityRoutesByPair.get(selPair.pairKey) || [] : [];
  const selLast = selPair ? lastActivityByPair.get(selPair.pairKey) : null;

  const fitPadding = isMdUp
    ? { top: 24, right: 380, bottom: 96, left: 40 }
    : { top: 20, right: 20, bottom: 40, left: 20 };

  const chipClass = (active: boolean) =>
    [
      "inline-flex h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-[11px] font-semibold transition-colors md:h-7",
      active
        ? "border-blue-600 bg-blue-600 text-white"
        : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900",
    ].join(" ");

  // Lane-detail card — shared by desktop popover + mobile sheet header.
  const detailCard =
    selPair && detailOpen ? (
      <div className="px-3.5 py-3">
        <div className="flex items-start justify-between gap-2">
          <div className="font-display flex min-w-0 items-center gap-1.5 text-[12.5px] font-bold text-slate-900">
            <LitFlag
              code={selPair.fromMeta?.countryCode}
              size={14}
              label={selPair.fromMeta?.countryName}
            />
            <span className="truncate">{selPair.fromMeta?.countryName}</span>
            <ArrowRight className="h-3 w-3 shrink-0 text-blue-500" aria-hidden />
            <LitFlag
              code={selPair.toMeta?.countryCode}
              size={14}
              label={selPair.toMeta?.countryName}
            />
            <span className="truncate">{selPair.toMeta?.countryName}</span>
          </div>
          <button
            type="button"
            onClick={() => setDetailOpen(false)}
            aria-label="Close lane details"
            className="-mr-1 -mt-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="font-mono mt-1 text-[11px] text-slate-600">
          {(Number(selPair.shipments) || 0).toLocaleString()} shipments
          {Number(selPair.teu) > 0 && (
            <> · {Math.round(Number(selPair.teu)).toLocaleString()} TEU</>
          )}
          {selLast && (
            <>
              {" "}· last:{" "}
              {selLast.toLocaleDateString("en-US", {
                month: "short",
                year: "numeric",
              })}
            </>
          )}
        </div>
        {selRoutes.length > 0 && (
          <div className="mt-1.5 space-y-0.5">
            {selRoutes.slice(0, 3).map((route: any, ri: number) => (
              <div
                key={route.displayLabel || ri}
                className="flex items-center gap-1.5"
              >
                <span className="h-1 w-1 shrink-0 rounded-full bg-blue-500/70" />
                <span className="font-mono min-w-0 flex-1 truncate text-[10.5px] text-slate-600">
                  {laneEndpointLabel(route.fromMeta, route.rawFrom || undefined)}{" "}
                  → {laneEndpointLabel(route.toMeta, route.rawTo || undefined)}
                </span>
                <span className="font-mono shrink-0 text-[10px] text-slate-500">
                  {(Number(route.shipments) || 0).toLocaleString()}
                </span>
              </div>
            ))}
            {selRoutes.length > 3 && (
              <div className="font-body text-[10px] text-slate-400">
                +{selRoutes.length - 3} more city routes
              </div>
            )}
          </div>
        )}
        {onOpenLaneHistory && (
          <button
            type="button"
            onClick={() => onOpenLaneHistory(pairToHistoryFilter(selPair))}
            className="font-display mt-1.5 inline-flex min-h-[32px] items-center gap-1 text-[10.5px] font-semibold text-blue-600 hover:text-blue-700"
          >
            <History className="h-3 w-3" />
            View monthly history →
          </button>
        )}
      </div>
    ) : null;

  // Portal to document.body (app dialog idiom — see CDPDetailsPanel /
  // EmailComposerModal) so the dialog escapes the card's stacking context
  // entirely. z-[1000] clears the app shell (z-40), the supplier drawer
  // (z-[610]) and Leaflet's internal panes (400–700); bg-white is the
  // opaque backdrop — nothing behind it can bleed through.
  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      className="fixed inset-0 z-[1000] flex flex-col bg-white"
      role="dialog"
      aria-modal="true"
      aria-label="Trade lanes map — expanded"
    >
      {/* Header bar */}
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-slate-200 px-4">
        <div className="min-w-0">
          <div className="font-display text-[13px] font-bold text-slate-900">
            Trade lanes map
          </div>
          <div className="font-mono text-[10.5px] text-slate-500">
            {filtered.length.toLocaleString()} of {ranked.length.toLocaleString()}{" "}
            country {ranked.length === 1 ? "pair" : "pairs"} ·{" "}
            {totalShipments.toLocaleString()} shipments
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close expanded map"
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Filter chips — year/month scope + focus toggle (shared with the
          hero), then origin country, min shipments, mode (when data
          carries it). Horizontal-scroll row on mobile. */}
      <div className="flex shrink-0 items-center gap-1.5 overflow-x-auto border-b border-slate-100 px-4 py-2">
        {scope && onToggleShowAllLanes && (
          <>
            <MapScopeControls
              yearFilter={scope.yearFilter}
              monthFilter={scope.monthFilter}
              availableYears={scope.availableYears}
              availableMonths={scope.availableMonths}
              onYear={scope.onYear}
              onMonth={scope.onMonth}
              showAllLanes={showAllLanes}
              onToggleShowAllLanes={onToggleShowAllLanes ?? (() => {})}
              sampleMode={sampleMode}
              yoyMode={yoyMode}
              onToggleYoy={onToggleYoy}
              overallYoy={overallYoy}
              yoyAvailable={overallYoy != null}
            />
            <span className="mx-1 h-4 w-px shrink-0 bg-slate-200" />
          </>
        )}
        <span className="font-display shrink-0 text-[9.5px] font-bold uppercase tracking-wide text-slate-400">
          Origin
        </span>
        <button
          type="button"
          className={chipClass(originFilter === null)}
          onClick={() => setOriginFilter(null)}
        >
          All
        </button>
        {originChips.map((o) => (
          <button
            key={o.key}
            type="button"
            className={chipClass(originFilter === o.key)}
            onClick={() =>
              setOriginFilter((prev) => (prev === o.key ? null : o.key))
            }
          >
            <LitFlag code={o.code} size={12} label={o.name} />
            {o.name}
          </button>
        ))}
        <span className="mx-1 h-4 w-px shrink-0 bg-slate-200" />
        <span className="font-display shrink-0 text-[9.5px] font-bold uppercase tracking-wide text-slate-400">
          Min shipments
        </span>
        {[0, 5, 25, 100].map((n) => (
          <button
            key={n}
            type="button"
            className={chipClass(minShipments === n)}
            onClick={() => setMinShipments(n)}
          >
            {n === 0 ? "All" : `${n}+`}
          </button>
        ))}
        {modeChips.length > 0 && (
          <>
            <span className="mx-1 h-4 w-px shrink-0 bg-slate-200" />
            <span className="font-display shrink-0 text-[9.5px] font-bold uppercase tracking-wide text-slate-400">
              Mode
            </span>
            <button
              type="button"
              className={chipClass(modeFilter === null)}
              onClick={() => setModeFilter(null)}
            >
              All
            </button>
            {modeChips.map((mode) => (
              <button
                key={mode}
                type="button"
                className={chipClass(modeFilter === mode)}
                onClick={() =>
                  setModeFilter((prev) => (prev === mode ? null : mode))
                }
              >
                {mode}
              </button>
            ))}
          </>
        )}
      </div>

      {/* Body — maximized map with floating tools; mobile stacks the
          lane sheet below the map. */}
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="relative min-h-[240px] flex-1">
          <LaneMap
            lanes={lanes}
            selectedLane={selected}
            onSelectLane={handleSelect}
            height="fill"
            variant="light"
            volumeScale
            zoomControlPosition="bottomleft"
            fitPadding={fitPadding}
            laneColors={laneColors}
            unselectedStyle={showAllLanes ? "fade" : "ghost"}
            flow
          />

          {/* Desktop: floating lane cards, right side. */}
          <div
            className={[
              "absolute bottom-4 right-4 top-4 z-[700] hidden w-[340px] flex-col overflow-hidden md:flex",
              GLASS_PANEL,
            ].join(" ")}
          >
            <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-3.5 pb-2 pt-2.5">
              <span className="font-display text-[10px] font-bold uppercase tracking-wide text-slate-500">
                Lanes · ranked by shipments
              </span>
              <span className="font-mono text-[10px] font-semibold text-slate-400">
                {filtered.length}
              </span>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {filtered.length === 0 ? (
                <div className="font-body px-3.5 py-4 text-[11px] text-slate-400">
                  No lanes match the current filters.
                </div>
              ) : (
                <LaneRankRows
                  rankedPairs={filtered}
                  totalShipments={totalShipments}
                  selectedPair={selected}
                  expandedPair={expandedRow}
                  onRowClick={handleRowClick}
                  cityRoutesByPair={cityRoutesByPair}
                  onOpenLaneHistory={onOpenLaneHistory}
                  reducedMotion={reducedMotion}
                  laneColors={laneColors}
                  laneMonthsByPair={laneMonthsByPair}
                  monthWindow={monthWindow}
                  sampleMode={sampleMode}
                  yoyMode={yoyMode}
                  perLaneYoy={perLaneYoy}
                />
              )}
            </div>
          </div>

          {/* Desktop: volume legend, bottom-left above the zoom control. */}
          <div
            className={[
              "pointer-events-none absolute bottom-4 left-16 z-[700] hidden px-3 py-2.5 md:block",
              GLASS_PANEL,
            ].join(" ")}
          >
            <div className="font-display text-[9px] font-bold uppercase tracking-wide text-slate-500">
              Legend
            </div>
            <div className="mt-1.5 space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="flex w-9 flex-col justify-between gap-[3px]">
                  <span className="h-[1.5px] w-full rounded bg-indigo-500/80" />
                  <span className="h-[2.5px] w-full rounded bg-indigo-500/80" />
                  <span className="h-[4px] w-full rounded bg-indigo-500/80" />
                </span>
                <span className="font-body text-[10px] text-slate-600">
                  Line weight = shipment volume
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="flex w-9 items-center justify-center">
                  <span className="h-2.5 w-2.5 rounded-full border-2 border-white bg-blue-600 shadow" />
                </span>
                <span className="font-body text-[10px] text-slate-600">
                  Marker size = market volume
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="flex w-9 items-center">
                  <span className="h-[3px] w-full rounded bg-blue-600" />
                </span>
                <span className="font-body text-[10px] text-slate-600">
                  Selected lane
                </span>
              </div>
            </div>
            {/* Origin-region color key — one swatch per region present in
                the filtered lane set (deterministic laneRegions palette). */}
            {(() => {
              const seen = new Map<string, { label: string; base: string }>();
              for (const p of filtered) {
                const c = laneRegionColor(p?.fromMeta?.countryCode);
                if (!seen.has(c.region)) {
                  seen.set(c.region, { label: c.label, base: c.base });
                }
              }
              if (seen.size === 0) return null;
              return (
                <div className="mt-2 border-t border-slate-100 pt-1.5">
                  <div className="font-display text-[9px] font-bold uppercase tracking-wide text-slate-500">
                    Origin region
                  </div>
                  <div className="mt-1 space-y-1">
                    {[...seen.values()].map((r) => (
                      <div key={r.label} className="flex items-center gap-2">
                        <span
                          className="h-[3px] w-9 rounded"
                          style={{ background: r.base }}
                        />
                        <span className="font-body text-[10px] text-slate-600">
                          {r.label}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}
          </div>

          {/* Desktop: lane-detail popover, bottom-center. */}
          {detailCard && (
            <div className="pointer-events-none absolute bottom-4 left-1/2 z-[700] hidden w-[360px] max-w-[calc(100%-420px)] -translate-x-1/2 md:block">
              <div className={["pointer-events-auto", GLASS_PANEL].join(" ")}>
                {detailCard}
              </div>
            </div>
          )}
        </div>

        {/* Mobile: detail card + lane sheet below the map. */}
        <div className="max-h-[45%] shrink-0 overflow-y-auto border-t border-slate-200 md:hidden">
          {detailCard && (
            <div className="border-b border-slate-100 bg-blue-50/40">
              {detailCard}
            </div>
          )}
          {filtered.length === 0 ? (
            <div className="font-body px-3.5 py-4 text-[11px] text-slate-400">
              No lanes match the current filters.
            </div>
          ) : (
            <LaneRankRows
              rankedPairs={filtered}
              totalShipments={totalShipments}
              selectedPair={selected}
              expandedPair={expandedRow}
              onRowClick={handleRowClick}
              cityRoutesByPair={cityRoutesByPair}
              onOpenLaneHistory={onOpenLaneHistory}
              reducedMotion={reducedMotion}
              laneColors={laneColors}
              laneMonthsByPair={laneMonthsByPair}
              monthWindow={monthWindow}
              sampleMode={sampleMode}
              yoyMode={yoyMode}
              perLaneYoy={perLaneYoy}
            />
          )}
        </div>
      </div>
    </div>,
    document.body,
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
          <thead className="sticky top-0 z-[2]">
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
              ].map((h, idx) => (
                <th
                  key={h}
                  className={[
                    "font-display whitespace-nowrap border-b border-slate-100 px-3 py-1.5 text-left text-[9px] font-bold uppercase tracking-[0.08em] text-slate-400 md:py-2.5",
                    // First column sticks left on <md so the lane identity
                    // is always visible while the user scrolls horizontally
                    // through carrier/forwarder/container columns.
                    idx === 0 ? "sticky left-0 z-[3] bg-[#FAFBFC]" : "",
                  ].join(" ")}
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
                  {/* First column sticky-left on <md so the lane identity
                      stays anchored as the user scrolls horizontally. */}
                  <td className="sticky left-0 z-[1] bg-white px-3 py-1.5 md:py-2.5">
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
                  <td className="font-mono px-3 py-1.5 text-[11px] text-slate-700 md:py-2.5">
                    {(Number(lane.shipments) || 0).toLocaleString()}
                  </td>
                  <td className="font-mono px-3 py-1.5 text-[11px] text-slate-700 md:py-2.5">
                    {Number(lane.teu) > 0
                      ? Math.round(Number(lane.teu)).toLocaleString()
                      : "—"}
                  </td>
                  <td className="px-3 py-1.5 md:py-2.5">
                    {topCarrier ? (
                      <span className="font-display text-[11px] font-semibold text-slate-900">
                        {topCarrier}
                      </span>
                    ) : (
                      <span className="font-body text-[11px] text-slate-300">—</span>
                    )}
                  </td>
                  <td className="px-3 py-1.5 md:py-2.5">
                    {topForwarder ? (
                      <span className="font-display truncate text-[11px] font-semibold text-slate-900">
                        {topForwarder}
                      </span>
                    ) : (
                      <span className="font-body text-[11px] text-slate-300">—</span>
                    )}
                  </td>
                  <td className="px-3 py-1.5 md:py-2.5">
                    {container && container !== "—" ? (
                      <LitPill tone="slate">{container}</LitPill>
                    ) : (
                      <span className="font-body text-[11px] text-slate-300">—</span>
                    )}
                  </td>
                  <td className="px-3 py-1.5 md:py-2.5">
                    {fclLcl && fclLcl !== "—" ? (
                      <LitPill tone={fclLcl === "FCL" ? "blue" : "purple"}>
                        {fclLcl}
                      </LitPill>
                    ) : (
                      <span className="font-body text-[11px] text-slate-300">—</span>
                    )}
                  </td>
                  <td className="px-3 py-1.5 md:py-2.5">
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
                  <td className="font-mono px-3 py-1.5 text-[10px] text-slate-500 md:py-2.5">
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
  // Compact "City, CC" — never the full country name. meta.label sometimes
  // already embeds the country, e.g. "Atlanta, United States of America",
  // which (with the code appended) produced the overflowing
  // "Atlanta, United States of America, US". Strip any segment that is the
  // country name / its ISO code / "USA" so only the city remains, then append
  // the 2-letter code once.
  const rawLabel = String(meta?.label || "").trim();
  const country = String(meta?.countryName || "").trim();
  const code = String(meta?.countryCode || "").toUpperCase().trim();
  const lcCountry = country.toLowerCase();
  const isCountryish = (s: string) => {
    const lc = s.toLowerCase();
    return (
      lc === lcCountry ||
      (code && s.toUpperCase() === code) ||
      lc === "usa" ||
      lc === "united states" ||
      lc === "united states of america"
    );
  };
  const cityParts = rawLabel
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((s) => !isCountryish(s));
  const city = cityParts.length ? cityParts[0] : null;
  if (city) return code ? `${city}, ${code}` : `${city}, ${country}`;
  if (code) return code;
  return rawLabel || country || fallback || "—";
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

/**
 * Cadence points for the Cadence & Modal Mix chart + the hero's 12-mo trend
 * strip. `series` is the FULL month-keyed timeSeries (every month back to
 * 2015 — see deriveFullTimeSeries), NOT a trailing window, so a selected year
 * renders that year's full 12 months of REAL data.
 *
 *  - year set → all 12 months of that calendar year (Jan..Dec), with any
 *    month that has no snapshot row zero-filled so the chart never goes
 *    sparse/empty (CEO bug 2026-08-14: 2025 rendered mostly-empty because
 *    the series was pre-scoped upstream and .slice(-12) dropped real months).
 *  - no year → trailing 12 months (rolling window, legacy default).
 */
function deriveCadence(series: any[], year?: number | null): CadencePoint[] {
  const list = Array.isArray(series) ? series : [];
  if (!list.length) return [];
  const toPoint = (p: any): CadencePoint => {
    const fcl = Number(p?.fclShipments) || 0;
    const lcl = Number(p?.lclShipments) || 0;
    let total = fcl + lcl;
    if (total === 0) total = Number(p?.shipments) || 0;
    const teu = Number(p?.teu) || null;
    return { label: formatMonthLabel(p?.month, p?.year), fcl, lcl, total, teu };
  };

  if (typeof year === "number" && Number.isFinite(year)) {
    // Index the year's real rows by month number so we can render all 12
    // calendar months in order, zero-filling gaps.
    const byMonth = new Map<number, any>();
    for (const p of list) {
      const mk = String(p?.month || "");
      const py = Number(p?.year) || (/^\d{4}-\d{2}$/.test(mk) ? Number(mk.slice(0, 4)) : NaN);
      if (py !== year) continue;
      const mnum = /^\d{4}-\d{2}$/.test(mk)
        ? Number(mk.slice(5, 7))
        : Number(p?.month);
      if (mnum >= 1 && mnum <= 12) byMonth.set(mnum, p);
    }
    if (byMonth.size === 0) return [];
    return Array.from({ length: 12 }, (_, i) => {
      const mnum = i + 1;
      const row = byMonth.get(mnum);
      if (row) return toPoint(row);
      // Zero-fill: label from a synthesized YYYY-MM so the axis stays aligned.
      const mk = `${year}-${String(mnum).padStart(2, "0")}`;
      return { label: formatMonthLabel(mk, year), fcl: 0, lcl: 0, total: 0, teu: null };
    });
  }

  const points: CadencePoint[] = list
    .map(toPoint)
    .filter((p: CadencePoint) => p.label);
  return points.slice(-12);
}

/**
 * Full month-keyed timeSeries (every month back to 2015). The `profile`
 * prop CompanyProfileV2 hands down is YEAR-SCOPED (buildYearScopedProfile
 * filters timeSeries to the selected year), which truncated the cadence
 * chart, killed year-over-year (no prior-year rows), and made past years
 * reconcile to an empty sample. So the page also passes the UNSCOPED series
 * as `fullTimeSeries`; prefer it, falling back to profile.timeSeries for any
 * caller that doesn't thread it. (CEO P0, 2026-08-14)
 */
function deriveFullTimeSeries(fullTimeSeries: any, profile: any): any[] {
  if (Array.isArray(fullTimeSeries) && fullTimeSeries.length) return fullTimeSeries;
  return Array.isArray(profile?.timeSeries) ? profile.timeSeries : [];
}

/* ── Volume reconciliation (CEO P0, 2026-08-14) ───────────────────────────
 *
 * The lane cards / map lines used to show raw ~50-BOL SAMPLE counts while the
 * Cadence chart showed the REAL month-keyed total from monthly_volumes — the
 * two disagreed and destroyed trust. `MonthlyVolumeSeries` is the single
 * source of truth for the REAL totals (the exact series the Cadence chart
 * renders): one entry per month keyed "YYYY-MM" with real shipments + TEU
 * back to 2015. Lane volumes are RECONCILED to this series by applying each
 * lane's SAMPLE share to the real scope total (see reconcilePairsToTotal).
 */
export type MonthlyVolumePoint = {
  /** "YYYY-MM" */
  month: string;
  shipments: number;
  teu: number;
};

/**
 * Full month-keyed real-volume series from parsed_summary.monthly_volumes
 * (via the normalized profile.timeSeries — same source the Cadence chart
 * uses). Spans every month on file (back to 2015), NOT just the trailing 12,
 * so it can drive per-year scope totals AND year-over-year deltas.
 */
function deriveMonthlySeries(series: any[]): MonthlyVolumePoint[] {
  const list = Array.isArray(series) ? series : [];
  const out: MonthlyVolumePoint[] = [];
  for (const p of list) {
    const month = String(p?.month || "");
    if (!/^\d{4}-\d{2}$/.test(month)) continue;
    const fcl = Number(p?.fclShipments) || 0;
    const lcl = Number(p?.lclShipments) || 0;
    let shipments = Number(p?.shipments);
    if (!Number.isFinite(shipments) || shipments === 0) shipments = fcl + lcl;
    out.push({
      month,
      shipments: Number.isFinite(shipments) ? shipments : 0,
      teu: Number(p?.teu) || 0,
    });
  }
  return out.sort((a, b) => a.month.localeCompare(b.month));
}

/** Real shipment + TEU total over a scope, summed from the monthly series. */
type ScopeTotal = { shipments: number; teu: number; months: number };

/**
 * Real scope total from the monthly series (source of truth):
 *  - no year → trailing 12 months (matches the Cadence card window)
 *  - year set → Jan–Dec of that year
 *  - month set → that single month (within the year if one is set)
 * Returns null when the series is empty (unknown → callers fall back to raw
 * sample counts rather than fabricating a total).
 */
function realScopeTotal(
  series: MonthlyVolumePoint[],
  yearFilter: number | null,
  monthFilter: number | null,
): ScopeTotal | null {
  if (!series.length) return null;
  let keys: string[];
  if (yearFilter == null && monthFilter == null) {
    keys = series.slice(-12).map((p) => p.month);
  } else {
    keys = series
      .map((p) => p.month)
      .filter((mk) => {
        const y = Number(mk.slice(0, 4));
        const m = Number(mk.slice(5, 7));
        return (
          (yearFilter == null || y === yearFilter) &&
          (monthFilter == null || m === monthFilter)
        );
      });
  }
  const set = new Set(keys);
  let shipments = 0;
  let teu = 0;
  for (const p of series) {
    if (!set.has(p.month)) continue;
    shipments += p.shipments;
    teu += p.teu;
  }
  return { shipments, teu, months: set.size };
}

/**
 * Reconcile a set of country-pair lanes to a REAL scope total by applying
 * each lane's SAMPLE share (of shipments and TEU independently) to the real
 * total. So the displayed lane volumes SUM to the verified scope total the
 * Cadence chart shows, instead of the raw ~50-BOL sample counts.
 *
 * When `total` is null (no real series) the pairs pass through untouched
 * (honest raw-sample fallback). Mutates copies — never the inputs.
 */
function reconcilePairsToTotal<T extends { shipments?: number; teu?: number }>(
  pairs: T[],
  total: ScopeTotal | null,
): { pairs: T[]; reconciled: boolean } {
  if (!total || total.shipments <= 0 || pairs.length === 0) {
    return { pairs, reconciled: false };
  }
  const sampleShip = pairs.reduce((s, p) => s + (Number(p.shipments) || 0), 0);
  const sampleTeu = pairs.reduce((s, p) => s + (Number(p.teu) || 0), 0);
  if (sampleShip <= 0) return { pairs, reconciled: false };
  const out = pairs.map((p) => {
    const shipShare = (Number(p.shipments) || 0) / sampleShip;
    // TEU share falls back to the shipment share when the sample carries no
    // TEU (some snapshots have null TEU) so TEU still reconciles sensibly.
    const teuShare =
      sampleTeu > 0 ? (Number(p.teu) || 0) / sampleTeu : shipShare;
    return {
      ...p,
      shipments: Math.round(shipShare * total.shipments),
      teu:
        total.teu > 0
          ? Math.round(teuShare * total.teu)
          : Number(p.teu) || 0,
    };
  });
  return { pairs: out, reconciled: true };
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
      if (date) {
        // parseBolDate — DD/MM/YYYY snapshot dates misparse under native
        // Date() ("05/08/2026" → May 8 instead of Aug 5).
        const dNew = parseBolDate(String(date))?.getTime();
        const dOld = existing.last
          ? parseBolDate(String(existing.last))?.getTime()
          : null;
        if (dNew != null && (dOld == null || dNew > dOld)) {
          existing.last = date;
        }
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
  // parseBolDate first — BOL date strings are DD/MM/YYYY and native
  // Date() would flip day/month; falls through to native parse for ISO.
  const parsed =
    typeof value === "string" ? parseBolDate(value) : new Date(value);
  const t = parsed ? parsed.getTime() : NaN;
  if (!Number.isFinite(t)) return "—";
  const delta = Date.now() - t;
  if (delta < 0) return "—";
  const day = 24 * 60 * 60 * 1000;
  if (delta < day) return "today";
  if (delta < 2 * day) return "yesterday";
  if (delta < 30 * day) return `${Math.round(delta / day)} days ago`;
  return new Date(t).toLocaleDateString("en-US", {
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
