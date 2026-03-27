import React from "react";
import {
  ResponsiveContainer,
  BarChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  Bar,
} from "recharts";
import {
  BookmarkIcon,
  BookmarkSlashIcon,
  CubeIcon,
  CurrencyDollarIcon,
  GlobeAltIcon,
  PhoneIcon,
  Squares2X2Icon,
  SquaresPlusIcon,
  TruckIcon,
  ClockIcon,
  XMarkIcon,
  ChartPieIcon,
} from "@heroicons/react/24/solid";
import { CompanyAvatar } from "@/components/CompanyAvatar";
import { getCompanyLogoUrl } from "@/lib/logo";
import {
  type IyShipperHit,
  type IyCompanyProfile,
  type IyRouteKpis,
  getFclShipments12m,
  getLclShipments12m,
} from "@/lib/api";

const numberFormatter = new Intl.NumberFormat("en-US");
const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const formatNumber = (value: number | null | undefined) => {
  if (value == null || Number.isNaN(value)) return "—";
  return numberFormatter.format(value);
};

const formatCurrency = (value: number | null | undefined) => {
  if (value == null || Number.isNaN(value)) return "—";
  return currencyFormatter.format(value);
};

const formatDateLabel = (value: string | null | undefined) => {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString(undefined, {
    month: "short",
    day: "2-digit",
    year: "numeric",
  });
};

const normalizeWebsite = (value?: string | null) => {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
};

const monthLabel = (value: string) => {
  if (!value) return "";
  const isoMatch = value.match(/^(\d{4})-(\d{2})/);
  if (isoMatch) {
    const date = new Date(Number(isoMatch[1]), Number(isoMatch[2]) - 1, 1);
    return date.toLocaleDateString(undefined, { month: "short" });
  }
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toLocaleDateString(undefined, { month: "short" });
  }
  return value;
};

function coerceNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const cleaned = value.replace(/,/g, "").trim();
    if (!cleaned) return null;
    const parsed = Number(cleaned);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function normalizeEnrichmentList(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value
      .map((entry) => {
        if (typeof entry === "string") return entry.trim();
        if (entry && typeof entry === "object") {
          if ("text" in entry && typeof (entry as any).text === "string") {
            return ((entry as any).text as string).trim();
          }
          if ("value" in entry && typeof (entry as any).value === "string") {
            return ((entry as any).value as string).trim();
          }
          if ("description" in entry && typeof (entry as any).description === "string") {
            return ((entry as any).description as string).trim();
          }
          if ("title" in entry && typeof (entry as any).title === "string") {
            const title = ((entry as any).title as string).trim();
            const desc =
              typeof (entry as any).description === "string"
                ? (entry as any).description.trim()
                : "";
            return desc ? `${title} – ${desc}` : title;
          }
        }
        return "";
      })
      .filter((item) => item.length > 0)
      .filter((item) => item.toLowerCase().indexOf('missing in source document') === -1);
  }
  if (typeof value === "string") {
    return value
      // Split the string on one or more newline characters
      .split(/\n+/)
      // Remove leading bullet markers like "* " or "- " from each line
      .map((line) => line.replace(/^[*-]\s*/, "").trim())
      // Filter out any empty lines
      .filter((line) => line.length > 0)
      // Remove any lines that contain the placeholder text
      .filter((line) => line.toLowerCase().indexOf('missing in source document') === -1);
  }
  return [];
}

function pickEnrichmentSummary(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length ? trimmed : null;
  }
  if (!value || typeof value !== "object") return null;
  const candidates = [
    (value as any).summary,
    (value as any).overview,
    (value as any).description,
    (value as any).narrative,
    (value as any).highlights,
    (value as any).ai_summary,
    (value as any)?.ai?.summary,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string") {
      const trimmed = candidate.trim();
      if (trimmed) return trimmed;
    }
  }
  return null;
}

const ChartTooltip: React.FC<any> = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  const data = payload.reduce(
    (acc: Record<string, number>, item: any) => ({
      ...acc,
      [item.name]: item.value ?? 0,
    }),
    {},
  );
  return (
    <div className="rounded-lg bg-slate-900 px-3 py-2 text-xs text-slate-50 shadow-xl">
      <p className="font-semibold">Month: {label}</p>
      <p>FCL: {formatNumber(data.FCL ?? 0)}</p>
      <p>LCL: {formatNumber(data.LCL ?? 0)}</p>
    </div>
  );
};

// Use a more saturated palette for KPI tiles inspired by the bar chart gradient.
// Each entry defines a border and background color that pair nicely with the
// overall LIT colour system.
const ACCENT_MAP: Record<string, string> = {
  indigo: 'border-[#DDD6FE] bg-[#F3E8FF]',
  blue: 'border-[#BFDBFE] bg-[#DBEAFE]',
  emerald: 'border-[#BBF7D0] bg-[#DCFCE7]',
  'indigo-strong': 'border-[#C7D2FE] bg-[#E0E7FF]',
  green: 'border-[#BBF7D0] bg-[#DCFCE7]',
  slate: 'border-[#E2E8F0] bg-[#F8FAFC]',
  purple: 'border-[#D8B4FE] bg-[#F5E8FF]',
};

const ICON_CONTAINER_CLASS =
  "mb-1 inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-900/5 text-slate-600";

interface KpiTileProps {
  label: string;
  value: React.ReactNode;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  accent: keyof typeof ACCENT_MAP;
}

const KpiTile: React.FC<KpiTileProps> = ({ label, value, icon: Icon, accent }) => (
  <div className={`flex flex-col gap-1 rounded-xl border px-4 py-3 ${ACCENT_MAP[accent]}`}> 
    <div className={ICON_CONTAINER_CLASS}>
      <Icon className="h-3.5 w-3.5" />
    </div>
    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
      {label}
    </p>
    <p className="text-xl font-semibold text-slate-900 md:text-2xl">{value}</p>
  </div>
);

export type ShipperDetailModalProps = {
  isOpen: boolean;
  shipper: IyShipperHit | null;
  loadingProfile: boolean;
  profile: IyCompanyProfile | null;
  routeKpis?: IyRouteKpis | null;
  enrichment: any | null;
  error: string | null;
  onClose: () => void;
  onSaveToCommandCenter: (opts: { shipper: IyShipperHit; profile: IyCompanyProfile | null }) => void;
  saveLoading: boolean;
  isSaved?: boolean;
  year?: number | null;
};

export default function ShipperDetailModal({
  isOpen,
  shipper,
  loadingProfile,
  profile,
  routeKpis = null,
  enrichment,
  error,
  onClose,
  onSaveToCommandCenter,
  saveLoading,
  isSaved = false,
  year = null,
}: ShipperDetailModalProps) {
  if (!isOpen || !shipper) return null;

  const normalizedWebsite = React.useMemo(() => {
    const profileWebsite =
      profile?.website || (profile?.domain ? `https://${profile.domain}` : null);
    const hitWebsite = shipper.website || (shipper.domain ? `https://${shipper.domain}` : null);
    return normalizeWebsite(profileWebsite ?? hitWebsite ?? null);
  }, [profile?.website, profile?.domain, shipper.website, shipper.domain]);

  const normalizedPhone =
    profile?.phoneNumber ??
    profile?.phone ??
    shipper.phone ??
    ((shipper as any)?.contact?.phone ?? null);

  const companyId =
    profile?.key ??
    profile?.companyId ??
    shipper.key ??
    shipper.companyId ??
    "";
  const domain = profile?.domain ?? shipper.domain ?? shipper.website ?? null;
  const logoUrl = domain ? getCompanyLogoUrl(domain) : undefined;

  const resolvedRouteKpis = routeKpis ?? profile?.routeKpis ?? null;
  const shipments12m =
    coerceNumber(resolvedRouteKpis?.shipmentsLast12m) ??
    coerceNumber(profile?.totalShipments) ??
    coerceNumber(shipper.totalShipments) ??
    coerceNumber(shipper.shipmentsLast12m);
  const teu12m =
    coerceNumber(resolvedRouteKpis?.teuLast12m) ??
    coerceNumber(shipper.teusLast12m);
  const estSpend12m =
    coerceNumber(resolvedRouteKpis?.estSpendUsd12m) ??
    coerceNumber(profile?.estSpendUsd12m) ??
    coerceNumber(shipper.estSpendLast12m);
  const fclShipments12m = getFclShipments12m(profile);
  const lclShipments12m = getLclShipments12m(profile);
  // Calculate container mix ratio based on FCL and LCL shipment counts.
  const containerMix = React.useMemo(() => {
    const fcl = typeof fclShipments12m === 'number' ? fclShipments12m : 0;
    const lcl = typeof lclShipments12m === 'number' ? lclShipments12m : 0;
    const total = fcl + lcl;
    if (total === 0) return null;
    const fclPct = Math.round((fcl / total) * 100);
    const lclPct = 100 - fclPct;
    return `${fclPct}% FCL / ${lclPct}% LCL`;
  }, [fclShipments12m, lclShipments12m]);

  const lastShipmentDate =
    profile?.lastShipmentDate ??
    shipper.lastShipmentDate ??
    shipper.mostRecentShipment ??
    null;

  /* Determine the list of top lanes to display along with the primary and most recent route.
     We prioritize lanes provided in resolvedRouteKpis.topRoutesLast12m when they contain
     non‑placeholder route strings. If those lanes are missing or only contain
     "Unknown → Unknown" routes, we fall back to aggregated top routes available on
     the profile (top_routes or topRoutes). When falling back we build lane labels
     from origin/destination fields such as origin_city, origin_country, supplier_address_loc,
     company_address_loc, etc. This ensures that the Top lanes list always shows the
     best available route labels rather than Unknown values.
   */

  // extract and sort primary lanes from resolvedRouteKpis.topRoutesLast12m,
  // filtering out any routes that contain "unknown" in a case-insensitive manner.
  let primaryTopRoutes: { route: string; shipments?: number | null }[] = [];
  if (Array.isArray(resolvedRouteKpis?.topRoutesLast12m)) {
    primaryTopRoutes = (resolvedRouteKpis.topRoutesLast12m as any[])
      .filter((entry: any) => {
        if (!entry || typeof entry.route !== "string") return false;
        // treat any route containing the word "unknown" (any separator) as invalid
        return entry.route.toLowerCase().indexOf("unknown") === -1;
      })
      .sort(
        (a: any, b: any) =>
          (coerceNumber(b?.shipments) ?? 0) - (coerceNumber(a?.shipments) ?? 0),
      )
      .slice(0, 5);
  }

  // build aggregated lanes from profile.top_routes or profile.topRoutes
  let aggregatedTopRoutes: { route: string; shipments?: number | null }[] = [];
  const rawAgg: any[] =
    (profile as any)?.top_routes ?? (profile as any)?.topRoutes ?? [];
  if (Array.isArray(rawAgg)) {
    aggregatedTopRoutes = rawAgg
      .map((entry: any) => {
        if (!entry) return null;
        // attempt to use provided route string when available
        let route: string | null =
          entry.route ?? entry.route_name ?? entry.route_string ?? null;
        // if no route, construct from origin/destination fields
        if (!route) {
          const origin =
            entry.origin ||
            entry.origin_port ||
            entry.origin_city ||
            entry.origin_state ||
            entry.origin_country ||
            entry.supplier_address_loc ||
            entry.supplier_address_location ||
            entry.supplier_address_country ||
            null;
          const dest =
            entry.destination ||
            entry.dest_port ||
            entry.destination_city ||
            entry.destination_state ||
            entry.destination_country ||
            entry.company_address_loc ||
            entry.company_address_location ||
            entry.company_address_country ||
            null;
          if (origin || dest) {
            const originLabel = origin ?? "Unknown";
            const destLabel = dest ?? "Unknown";
            route = `${originLabel} → ${destLabel}`;
          }
        }
        if (!route) return null;
        // discard any constructed route that contains "unknown"
        if (route.toLowerCase().indexOf("unknown") !== -1) return null;
        const shipments =
          coerceNumber((entry as any)?.shipments) ??
          coerceNumber((entry as any)?.count) ??
          coerceNumber((entry as any)?.shipments_12m) ??
          null;
        return { route, shipments };
      })
      .filter(
        (v): v is { route: string; shipments?: number | null } => Boolean(v),
      );
    // sort aggregated lanes by shipments descending and cap to 5
    aggregatedTopRoutes.sort(
      (a, b) => (b.shipments ?? 0) - (a.shipments ?? 0),
    );
    aggregatedTopRoutes = aggregatedTopRoutes.slice(0, 5);
  }

  // choose which list of lanes to display: prefer primary if available,
  // otherwise fall back to aggregated list
  const displayTopRoutes =
    primaryTopRoutes.length > 0 ? primaryTopRoutes : aggregatedTopRoutes;

  // derive top and most recent routes from available KPI fields or display lanes.
  // prefer normalized KPI values when they are defined and not "unknown".
  const resolvedTopRouteKpi =
    typeof resolvedRouteKpis?.topRouteLast12m === "string" &&
    resolvedRouteKpis.topRouteLast12m.toLowerCase().indexOf("unknown") === -1
      ? resolvedRouteKpis.topRouteLast12m
      : null;
  const resolvedMostRecentRouteKpi =
    typeof resolvedRouteKpis?.mostRecentRoute === "string" &&
    resolvedRouteKpis.mostRecentRoute.toLowerCase().indexOf("unknown") === -1
      ? resolvedRouteKpis.mostRecentRoute
      : null;

  const displayTopRouteLast12m: string | null =
    resolvedTopRouteKpi ??
    (displayTopRoutes[0]?.route as string | undefined) ??
    shipper.primaryRouteSummary ??
    shipper.primaryRoute ??
    null;
  const displayMostRecentRoute: string | null =
    resolvedMostRecentRouteKpi ??
    (displayTopRoutes[0]?.route as string | undefined) ??
    shipper.primaryRouteSummary ??
    shipper.primaryRoute ??
    null;

  // assign display variables to be used in render
  const topRouteLast12m = displayTopRouteLast12m;
  const mostRecentRoute = displayMostRecentRoute;
  const topRoutes = displayTopRoutes;

  // Filter time series data for the selected year (if provided) and compute year‑specific KPIs.
  const filteredTimeSeries = React.useMemo(() => {
    if (!Array.isArray(profile?.timeSeries)) return [] as any[];
    if (!year) return profile.timeSeries.slice(-12);
    return profile.timeSeries.filter((point: any) => {
      const monthStr = String(point.month);
      return monthStr.startsWith(String(year));
    });
  }, [profile?.timeSeries, year]);

  const shipmentsYear = React.useMemo(() => {
    return (filteredTimeSeries as any[]).reduce((sum: number, point: any) => {
      const fcl = coerceNumber(point.fclShipments) ?? 0;
      const lcl = coerceNumber(point.lclShipments) ?? 0;
      return sum + fcl + lcl;
    }, 0);
  }, [filteredTimeSeries]);

  const fclShipmentsYear = React.useMemo(() => {
    return (filteredTimeSeries as any[]).reduce((sum: number, point: any) => {
      const fcl = coerceNumber(point.fclShipments) ?? 0;
      return sum + fcl;
    }, 0);
  }, [filteredTimeSeries]);

  const lclShipmentsYear = React.useMemo(() => {
    return (filteredTimeSeries as any[]).reduce((sum: number, point: any) => {
      const lcl = coerceNumber(point.lclShipments) ?? 0;
      return sum + lcl;
    }, 0);
  }, [filteredTimeSeries]);

  const containerMixYear = React.useMemo(() => {
    const total = fclShipmentsYear + lclShipmentsYear;
    if (total === 0) return null;
    const fclPct = Math.round((fclShipmentsYear / total) * 100);
    const lclPct = 100 - fclPct;
    return `${fclPct}% FCL / ${lclPct}% LCL`;
  }, [fclShipmentsYear, lclShipmentsYear]);

  // Compute shipments for top/most recent routes to display counts in KPI cards
  const topRouteShipments = topRoutes.find((lane) => lane.route === topRouteLast12m)?.shipments ?? null;
  const mostRecentRouteShipments = topRoutes.find((lane) => lane.route === mostRecentRoute)?.shipments ?? null;

  // Create dynamic headings for route cards
  const topRouteHeading = year ? `Top route (${year})` : 'Top route (last 12m)';
  const mostRecentHeading = year ? `Most recent route (${year})` : 'Most recent route';

  // Prepare chart data for the monthly FCL/LCL shipments chart
  const chartData = React.useMemo(() =>
    Array.isArray(filteredTimeSeries)
      ? (filteredTimeSeries as any[]).slice(-12).map((point: any) => ({
          monthLabel: monthLabel(point.month),
          fcl: coerceNumber(point.fclShipments) ?? 0,
          lcl: coerceNumber(point.lclShipments) ?? 0,
        }))
      : []
  , [filteredTimeSeries]);

  const supplierList = React.useMemo(() => {
    const list = profile?.topSuppliers ?? shipper.topSuppliers ?? [];
    if (!Array.isArray(list)) return [];
    return list
      .map((entry: any) =>
        typeof entry === "string"
          ? entry
          : entry?.name ?? entry?.supplier_name ?? entry?.company ?? "",
      )
      .filter((value: string) => Boolean(value))
      .slice(0, 6);
  }, [profile?.topSuppliers, shipper.topSuppliers]);

  const enrichmentSummary = React.useMemo(
    () => pickEnrichmentSummary(enrichment),
    [enrichment],
  );
  const enrichmentOpportunities = React.useMemo(
    () =>
      normalizeEnrichmentList(
        enrichment?.opportunities ??
          enrichment?.opportunityInsights ??
          enrichment?.opportunity_insights ??
          enrichment?.ai?.opportunities ??
          enrichment?.opportunityBullets,
      ),
    [enrichment],
  );
  const enrichmentRisks = React.useMemo(
    () =>
      normalizeEnrichmentList(
        enrichment?.risks ??
          enrichment?.riskInsights ??
          enrichment?.risk_insights ??
          enrichment?.watchouts ??
          enrichment?.ai?.risks,
      ),
    [enrichment],
  );
  const enrichmentTalkingPoints = React.useMemo(
    () =>
      normalizeEnrichmentList(
        enrichment?.talkingPoints ??
          enrichment?.recommendedTalkingPoints ??
          enrichment?.recommended_actions ??
          enrichment?.actions ??
          enrichment?.ai?.talkingPoints,
      ),
    [enrichment],
  );
  const enrichmentExtraSections = React.useMemo(() => {
    if (!Array.isArray(enrichment?.sections)) return [];
    return enrichment.sections
      .map((section: any) => {
        const label =
          typeof section?.title === "string"
            ? section.title
            : typeof section?.label === "string"
              ? section.label
              : null;
        const items = normalizeEnrichmentList(
          section?.items ??
            section?.bullets ??
            section?.points ??
            section?.content,
        );
        if (!label || items.length === 0) return null;
        return { label, items };
      })
      .filter(
        (entry): entry is { label: string; items: string[] } => Boolean(entry),
      );
  }, [enrichment]);

  const hasEnrichmentContent = Boolean(
    enrichmentSummary ||
    enrichmentOpportunities.length ||
    enrichmentRisks.length ||
    enrichmentTalkingPoints.length ||
    enrichmentExtraSections.length,
  );

  const showEnrichmentBanner = !enrichment && !loadingProfile;

  const kpiItems: KpiTileProps[] = [
    // Replace the general shipments KPI with FCL shipments
    {
      label: year ? `FCL shipments (${year})` : 'FCL shipments',
      value: formatNumber(year ? fclShipmentsYear : fclShipments12m),
      icon: SquaresPlusIcon,
      accent: 'purple',
    },
    // Show LCL shipments on its own card (previously FCL)
    {
      label: year ? `LCL shipments (${year})` : 'LCL shipments',
      value: formatNumber(year ? lclShipmentsYear : lclShipments12m),
      icon: Squares2X2Icon,
      accent: 'indigo',
    },
    {
      label: 'TEU volume',
      value: formatNumber(teu12m),
      icon: CubeIcon,
      accent: 'blue',
    },
    {
      label: 'Market spend',
      value: formatCurrency(estSpend12m),
      icon: CurrencyDollarIcon,
      accent: 'emerald',
    },
    {
      label: year ? `Container mix (${year})` : 'Container mix',
      value: year ? (containerMixYear ?? '—') : (containerMix ?? '—'),
      icon: ChartPieIcon,
      accent: 'indigo-strong',
    },
  ];

  const handleSaveClick = () => {
    if (!shipper || saveLoading) return;
    onSaveToCommandCenter({ shipper, profile: profile ?? null });
  };

  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-slate-900/60 px-4 py-6">
      <div className="relative mt-6 mb-6 flex w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-6 py-4 md:px-8">
          <div className="flex items-start gap-4">
            <CompanyAvatar name={shipper.title} logoUrl={logoUrl} size="lg" />
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-2xl font-semibold tracking-tight text-slate-900">
                  {profile?.title || shipper.title || shipper.name || "Company"}
                </h2>
                {isSaved && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-emerald-700">
                    Saved
                  </span>
                )}
              </div>
              {companyId && (
                <p className="text-xs text-slate-500">{companyId}</p>
              )}
              <div className="flex flex-wrap gap-3 text-xs text-slate-600">
                {normalizedWebsite && (
                  <a
                    href={normalizedWebsite}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items