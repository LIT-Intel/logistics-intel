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
  CalendarDaysIcon,
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

function extractYearFromMonth(value: unknown): number | null {
  if (!value) return null;
  const text = String(value).trim();
  if (!text) return null;
  const match = text.match(/^(\d{4})-(\d{2})$/);
  if (match) return Number(match[1]);
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed.getFullYear();
}

function normalizeMonthBucket(value: unknown): string | null {
  if (!value) return null;
  const text = String(value).trim();
  if (!text) return null;
  const direct = text.match(/^(\d{4})-(\d{2})$/);
  if (direct) return `${direct[1]}-${direct[2]}`;
  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) {
    return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}`;
  }
  return null;
}

function buildAuthoritativeMonthlySeries(profile: any): any[] {
  const sources = [
    (profile as any)?.monthlyShipments,
    (profile as any)?.monthly_shipments,
    (profile as any)?.monthly_volumes,
    (profile as any)?.time_series,
    profile?.timeSeries,
  ];

  for (const source of sources) {
    if (!source) continue;

    if (Array.isArray(source)) {
      const rows = source
        .map((point: any) => {
          const month = normalizeMonthBucket(point?.month ?? point?.period ?? point?.date ?? point?.label);
          if (!month) return null;
          const shipments = coerceNumber(point?.shipments) ?? 0;
          const fcl = coerceNumber(point?.fclShipments ?? point?.fcl_shipments ?? point?.fcl ?? point?.fcl_count) ?? 0;
          const lcl = coerceNumber(point?.lclShipments ?? point?.lcl_shipments ?? point?.lcl ?? point?.lcl_count) ?? 0;
          const teu = coerceNumber(point?.teu ?? point?.total_teu ?? point?.teuVolume) ?? 0;
          const estSpendUsd =
            coerceNumber(point?.estSpendUsd ?? point?.est_spend_usd ?? point?.shipping_cost ?? point?.est_spend) ?? 0;
          return {
            month,
            shipments: shipments > 0 ? shipments : fcl + lcl,
            fclShipments: fcl,
            lclShipments: lcl,
            teu,
            estSpendUsd,
          };
        })
        .filter(Boolean)
        .sort((a: any, b: any) => a.month.localeCompare(b.month));
      if (rows.length > 0) return rows;
    }

    if (typeof source === "object") {
      const rows = Object.entries(source)
        .map(([key, value]: [string, any]) => {
          const month = normalizeMonthBucket(key);
          if (!month || !value || typeof value !== "object") return null;
          const shipments = coerceNumber(value?.shipments) ?? 0;
          const fcl = coerceNumber(value?.fclShipments ?? value?.fcl_shipments ?? value?.fcl ?? value?.fcl_count) ?? 0;
          const lcl = coerceNumber(value?.lclShipments ?? value?.lcl_shipments ?? value?.lcl ?? value?.lcl_count) ?? 0;
          const teu = coerceNumber(value?.teu ?? value?.total_teu ?? value?.teuVolume) ?? 0;
          const estSpendUsd =
            coerceNumber(value?.estSpendUsd ?? value?.est_spend_usd ?? value?.shipping_cost ?? value?.est_spend) ?? 0;
          return {
            month,
            shipments: shipments > 0 ? shipments : fcl + lcl,
            fclShipments: fcl,
            lclShipments: lcl,
            teu,
            estSpendUsd,
          };
        })
        .filter(Boolean)
        .sort((a: any, b: any) => a.month.localeCompare(b.month));
      if (rows.length > 0) return rows;
    }
  }

  return [];
}


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

function cleanSupplierName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/\s+/g, " ").trim();
  if (!cleaned) return null;
  const lowered = cleaned.toLowerCase();
  if (
    lowered === "missing in source document" ||
    lowered.includes("missing in source document") ||
    lowered === "missing" ||
    lowered === "n/a" ||
    lowered === "na" ||
    lowered === "null" ||
    lowered === "none" ||
    lowered === "unknown" ||
    lowered === "-" ||
    lowered === "--"
  ) {
    return null;
  }
  return cleaned;
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

  const baselineLastShipmentDate =
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

  const authoritativeMonthlySeries = React.useMemo(
    () => buildAuthoritativeMonthlySeries(profile),
    [profile],
  );

  const availableYears = React.useMemo(() => {
    const years = Array.from(
      new Set(
        authoritativeMonthlySeries
          .map((point: any) => extractYearFromMonth(point.month))
          .filter((value: any): value is number => typeof value === "number"),
      ),
    ).sort((a, b) => b - a);
    return years;
  }, [authoritativeMonthlySeries]);

  const [selectedYear, setSelectedYear] = React.useState<number | null>(year ?? null);

  React.useEffect(() => {
    if (year && availableYears.includes(year)) {
      setSelectedYear(year);
      return;
    }
    if (availableYears.length > 0) {
      setSelectedYear((current) => {
        if (current && availableYears.includes(current)) return current;
        return availableYears[0];
      });
      return;
    }
    setSelectedYear(null);
  }, [year, availableYears]);

  const filteredTimeSeries = React.useMemo(() => {
    if (!Array.isArray(authoritativeMonthlySeries)) return [] as any[];
    if (!selectedYear) return authoritativeMonthlySeries.slice(-12);
    return authoritativeMonthlySeries.filter((point: any) => {
      return extractYearFromMonth(point.month) === selectedYear;
    });
  }, [authoritativeMonthlySeries, selectedYear]);

  const shipmentsYear = React.useMemo(() => {
    return (filteredTimeSeries as any[]).reduce((sum: number, point: any) => {
      const shipments = coerceNumber(point.shipments);
      if (shipments != null && shipments > 0) return sum + shipments;
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

  const teuYear = React.useMemo(() => {
    return (filteredTimeSeries as any[]).reduce((sum: number, point: any) => {
      return sum + (coerceNumber(point.teu) ?? 0);
    }, 0);
  }, [filteredTimeSeries]);

  const estSpendYear = React.useMemo(() => {
    return (filteredTimeSeries as any[]).reduce((sum: number, point: any) => {
      return sum + (coerceNumber(point.estSpendUsd) ?? 0);
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
  const topRouteHeading = selectedYear ? `Top route (${selectedYear})` : 'Top route (last 12m)';
  const mostRecentHeading = selectedYear ? `Most recent route (${selectedYear})` : 'Most recent route';

  // Prepare chart data for the monthly FCL/LCL shipments chart
  const chartData = React.useMemo(() =>
    Array.isArray(filteredTimeSeries)
      ? (filteredTimeSeries as any[]).slice(-12).map((point: any) => {
          const shipments = coerceNumber(point.shipments) ?? 0;
          const fcl = coerceNumber(point.fclShipments) ?? 0;
          const lcl = coerceNumber(point.lclShipments) ?? 0;
          const showShipmentAsFcl = fcl === 0 && lcl === 0 && shipments > 0;
          return {
            monthLabel: monthLabel(point.month),
            fcl: showShipmentAsFcl ? shipments : fcl,
            lcl,
          };
        })
      : []
  , [filteredTimeSeries]);

  const activeTeu = selectedYear ? teuYear : teu12m;
  const activeSpend = selectedYear
    ? (estSpendYear > 0
        ? estSpendYear
        : (coerceNumber((profile as any)?.estSpendUsd12m) ??
           coerceNumber((profile as any)?.estSpendUsd) ??
           estSpend12m))
    : estSpend12m;

  const lastShipmentDate =
    (Array.isArray((profile as any)?.recent_bols) && selectedYear
      ? (() => {
          const rows = ((profile as any).recent_bols as any[])
            .map((bol) => {
              const rawDate = bol?.date_formatted ?? bol?.date ?? bol?.arrival_date ?? null;
              if (!rawDate) return null;
              let parsed: Date | null = null;
              const ddmmyyyy = String(rawDate).match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
              if (ddmmyyyy) {
                parsed = new Date(`${ddmmyyyy[3]}-${ddmmyyyy[2]}-${ddmmyyyy[1]}T00:00:00`);
              } else {
                parsed = new Date(String(rawDate));
              }
              if (Number.isNaN(parsed.getTime()) || parsed.getFullYear() !== selectedYear) return null;
              return parsed;
            })
            .filter(Boolean) as Date[];
          rows.sort((a, b) => b.getTime() - a.getTime());
          return rows[0] ? rows[0].toISOString().slice(0, 10) : null;
        })()
      : null) ??
    (profile as any)?.last_shipment_date ??
    profile?.lastShipmentDate ??
    shipper.lastShipmentDate ??
    shipper.mostRecentShipment ??
    null;

  const supplierList = React.useMemo(() => {
    const list = profile?.topSuppliers ?? shipper.topSuppliers ?? [];
    if (!Array.isArray(list)) return [];
    const unique = new Map<string, string>();
    for (const entry of list) {
      const rawName =
        typeof entry === "string"
          ? entry
          : entry?.name ?? entry?.supplier_name ?? entry?.company ?? entry?.title ?? "";
      const cleaned = cleanSupplierName(rawName);
      if (!cleaned) continue;
      const key = cleaned.toLowerCase();
      if (!unique.has(key)) unique.set(key, cleaned);
    }
    return Array.from(unique.values()).slice(0, 6);
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
    {
      label: selectedYear ? `Total shipments (${selectedYear})` : 'Total shipments',
      value: formatNumber(selectedYear ? shipmentsYear : shipments12m),
      icon: TruckIcon,
      accent: 'slate',
    },
    {
      label: selectedYear ? `FCL shipments (${selectedYear})` : 'FCL shipments',
      value: formatNumber(selectedYear ? fclShipmentsYear : fclShipments12m),
      icon: SquaresPlusIcon,
      accent: 'purple',
    },
    {
      label: selectedYear ? `LCL shipments (${selectedYear})` : 'LCL shipments',
      value: formatNumber(selectedYear ? lclShipmentsYear : lclShipments12m),
      icon: Squares2X2Icon,
      accent: 'indigo',
    },
    {
      label: selectedYear ? `TEU volume (${selectedYear})` : 'TEU volume',
      value: formatNumber(activeTeu),
      icon: CubeIcon,
      accent: 'blue',
    },
    {
      label: selectedYear ? `Market spend est. (${selectedYear})` : 'Market spend est.',
      value: formatCurrency(activeSpend),
      icon: CurrencyDollarIcon,
      accent: 'emerald',
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
                    className="inline-flex items-center gap-1 text-indigo-600 hover:underline"
                  >
                    <GlobeAltIcon className="h-4 w-4" />
                    <span className="truncate max-w-[180px]">
                      {normalizedWebsite.replace(/^https?:\/\//i, "")}
                    </span>
                  </a>
                )}
                {normalizedPhone && (
                  <a
                    href={`tel:${normalizedPhone}`}
                    className="inline-flex items-center gap-1"
                  >
                    <PhoneIcon className="h-4 w-4" />
                    <span>{normalizedPhone}</span>
                  </a>
                )}
              </div>
              {showEnrichmentBanner && (
                <p className="text-xs text-amber-600">
                  AI enrichment not available for this company yet.
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {availableYears.length > 0 && (
              <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm">
                <CalendarDaysIcon className="h-4 w-4 text-slate-500" />
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Year
                </span>
                <select
                  value={selectedYear ?? ""}
                  onChange={(e) => setSelectedYear(e.target.value ? Number(e.target.value) : null)}
                  className="bg-transparent text-sm font-semibold text-slate-700 outline-none"
                >
                  {availableYears.map((optionYear) => (
                    <option key={optionYear} value={optionYear}>
                      {optionYear}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <button
              type="button"
              onClick={handleSaveClick}
              disabled={saveLoading}
              className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold shadow-sm transition ${
                isSaved
                  ? "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  : "bg-indigo-600 text-white hover:bg-indigo-500"
              } disabled:cursor-not-allowed disabled:opacity-60`}
            >
              {isSaved ? (
                <BookmarkSlashIcon className="h-4 w-4" />
              ) : (
                <BookmarkIcon className="h-4 w-4" />
              )}
              <span>
                {isSaved
                  ? "Saved to Command Center"
                  : saveLoading
                  ? "Saving…"
                  : "Save to Command Center"}
              </span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-slate-500 hover:bg-slate-100"
            >
              <XMarkIcon className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="max-h-[calc(100vh-8rem)] overflow-y-auto px-6 py-6 md:px-8">
          {(loadingProfile || error) && (
            <div className="mb-4 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              {loadingProfile && <div>Loading company profile…</div>}
              {error && !loadingProfile && (
                <div className="text-rose-600">{error}</div>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
            {kpiItems.map((item) => (
              <KpiTile key={item.label} {...item} />
            ))}
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                {topRouteHeading}
              </p>
              <p className="mt-1 text-sm font-semibold text-slate-900">
                {topRouteLast12m || "Not available yet"}
              </p>
              {topRouteShipments != null && topRouteLast12m && (
                <p className="mt-0.5 text-xs text-slate-500">
                  {formatNumber(topRouteShipments)} shipments
                </p>
              )}
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                {mostRecentHeading}
              </p>
              <p className="mt-1 text-sm font-semibold text-slate-900">
                {mostRecentRoute || "Not available yet"}
              </p>
              {mostRecentRouteShipments != null && mostRecentRoute && (
                <p className="mt-0.5 text-xs text-slate-500">
                  {formatNumber(mostRecentRouteShipments)} shipments
                </p>
              )}
            </div>
          </div>

          <div className="mt-6 grid gap-6 md:grid-cols-3">
            <div className="space-y-4 md:col-span-2">
              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 md:px-6 md:py-5">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      Shipment velocity
                    </p>
                    <p className="text-xs text-slate-500">
                      Monthly shipments split between FCL and LCL services                    </p>
                  </div>
                  {loadingProfile && (
                    <p className="text-xs text-slate-400">Loading trend…</p>
                  )}
                </div>
                {chartData.length === 0 ? (
                  <p className="text-xs text-slate-500">
                    No lane-level trend data available yet for this shipper.
                  </p>
                ) : (
                  <div className="h-56 w-full">
                    <ResponsiveContainer>
                      <BarChart
                        data={chartData}
                        margin={{ top: 8, right: 12, left: 0, bottom: 8 }}
                        barSize={12}
                      >
                        <defs>
                          <linearGradient id="fclGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#6C4DFF" stopOpacity={1} />
                            <stop offset="100%" stopColor="#4C8DFF" stopOpacity={0.9} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis
                          dataKey="monthLabel"
                          tick={{ fontSize: 10, fill: "#64748b" }}
                          tickLine={false}
                        />
                        <YAxis tick={{ fontSize: 10, fill: "#64748b" }} allowDecimals={false} />
                        <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(15,23,42,0.04)" }} />
                        <Legend wrapperStyle={{ fontSize: 10 }} verticalAlign="top" align="right" />
                        <Bar
                          dataKey="fcl"
                          name="FCL"
                          fill="url(#fclGradient)"
                          radius={[4, 4, 0, 0]}
                        />
                        <Bar
                          dataKey="lcl"
                          name="LCL"
                          fill="#22c55e"
                          radius={[4, 4, 0, 0]}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Trade corridor analysis ({selectedYear ? selectedYear : 'last 12m'})
                </p>
                {topRoutes.length === 0 ? (
                  <p className="mt-2 text-xs text-slate-500">
                    Lane-level shipment data is not available for this company yet.
                  </p>
                ) : (
                  <ul className="mt-2 space-y-1.5 text-xs text-slate-700">
                    {topRoutes.map((lane, idx) => (
                      <li key={`${lane.route}-${idx}`} className="flex items-center justify-between gap-2">
                        <span className="truncate">{lane.route}</span>
                        <span className="text-[11px] text-slate-500">
                          {formatNumber(lane.shipments ?? null)} shipments
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            <div className="space-y-4">
              {enrichment && (
                <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    AI insights
                  </p>
                  {hasEnrichmentContent ? (
                    <>
                      {enrichmentSummary && (
                        <p className="mt-2 text-sm text-slate-800 whitespace-pre-line">
                          {enrichmentSummary}
                        </p>
                      )}
                      {enrichmentOpportunities.length > 0 && (
                        <div className="mt-3">
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                            Opportunities
                          </p>
                          <ul className="mt-1 space-y-1 text-xs text-slate-700">
                            {enrichmentOpportunities.map((item, idx) => (
                              <li key={`opp-${idx}`} className="flex items-start gap-2">
                                <span className="mt-1 h-1.5 w-1.5 rounded-full bg-indigo-500" />
                                <span className="leading-snug">{item}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {enrichmentRisks.length > 0 && (
                        <div className="mt-3">
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                            Risks
                          </p>
                          <ul className="mt-1 space-y-1 text-xs text-slate-700">
                            {enrichmentRisks.map((item, idx) => (
                              <li key={`risk-${idx}`} className="flex items-start gap-2">
                                <span className="mt-1 h-1.5 w-1.5 rounded-full bg-rose-500" />
                                <span className="leading-snug">{item}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {enrichmentTalkingPoints.length > 0 && (
                        <div className="mt-3">
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                            Recommended talking points
                          </p>
                          <ul className="mt-1 space-y-1 text-xs text-slate-700">
                            {enrichmentTalkingPoints.map((item, idx) => (
                              <li key={`talk-${idx}`} className="flex items-start gap-2">
                                <span className="mt-1 h-1.5 w-1.5 rounded-full bg-emerald-500" />
                                <span className="leading-snug">{item}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {enrichmentExtraSections.length > 0 && (
                        <div className="mt-3 space-y-2">
                          {enrichmentExtraSections.map((section, idx) => (
                            <div key={`section-${idx}`}>
                              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                                {section.label}
                              </p>
                              <ul className="mt-1 space-y-1 text-xs text-slate-700">
                                {section.items.map((item, idy) => (
                                  <li key={`section-${idx}-item-${idy}`} className="flex items-start gap-2">
                                    <span className="mt-1 h-1.5 w-1.5 rounded-full bg-indigo-500" />
                                    <span className="leading-snug">{item}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  ) : (
                    <p className="mt-2 text-xs text-slate-500">
                      AI enrichment is not available for this company yet.
                    </p>
                  )}
                </div>
              )}

              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {selectedYear ? `Container mix (${selectedYear})` : 'Container mix'}
                </p>
                <div className="mt-3">
                  <KpiTile
                    label={selectedYear ? `Container mix (${selectedYear})` : 'Container mix'}
                    value={selectedYear ? (containerMixYear ?? '—') : (containerMix ?? '—')}
                    icon={ChartPieIcon}
                    accent="indigo-strong"
                  />
                </div>
              </div>

              {lastShipmentDate && (
                <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Shipment activity
                  </p>
                  <div className="mt-2 flex items-center gap-2 text-sm text-slate-700">
                    <ClockIcon className="h-4 w-4 text-slate-400" />
                    <span>Last shipment: {formatDateLabel(lastShipmentDate)}</span>
                  </div>
                </div>
              )}

              {supplierList.length > 0 && (
                <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Key partners
                  </p>
                  <ul className="mt-2 space-y-1.5">
                    {supplierList.map((supplier, idx) => (
                      <li key={`supplier-${idx}`} className="flex items-start gap-2 text-xs text-slate-700">
                        <span className="mt-1 h-1.5 w-1.5 rounded-full bg-indigo-500" />
                        <span className="leading-snug">{supplier}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
