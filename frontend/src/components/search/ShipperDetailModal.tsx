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
  ArrowsRightLeftIcon,
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

function extractYear(value: unknown): number | null {
  if (!value) return null;
  if (typeof value === "number" && Number.isFinite(value)) {
    const asInt = Math.trunc(value);
    return asInt >= 1900 && asInt <= 3000 ? asInt : null;
  }

  const text = String(value).trim();
  if (!text) return null;

  const directYear = text.match(/\b(19|20)\d{2}\b/);
  if (directYear) return Number(directYear[0]);

  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) return parsed.getFullYear();

  return null;
}

function cleanSupplierName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/\s+/g, " ").trim();
  if (!cleaned) return null;

  const lowered = cleaned.toLowerCase();
  const blocked = new Set([
    "missing in source document",
    "missing",
    "n/a",
    "na",
    "null",
    "none",
    "unknown",
    "-",
    "--",
  ]);

  if (blocked.has(lowered)) return null;
  if (lowered.includes("missing in source document")) return null;

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
      .filter((item) => item.toLowerCase().indexOf("missing in source document") === -1);
  }
  if (typeof value === "string") {
    return value
      .split(/\n+/)
      .map((line) => line.replace(/^[*-]\s*/, "").trim())
      .filter((line) => line.length > 0)
      .filter((line) => line.toLowerCase().indexOf("missing in source document") === -1);
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

function pickTimeSeriesValue(point: any, keys: string[]): number {
  for (const key of keys) {
    const value = coerceNumber(point?.[key]);
    if (value != null) return value;
  }
  return 0;
}

function normalizeRouteLabel(entry: any): string | null {
  if (!entry) return null;

  const directRoute =
    entry.route ??
    entry.route_name ??
    entry.route_string ??
    entry.lane ??
    entry.trade_lane ??
    entry.tradeLane ??
    null;

  if (typeof directRoute === "string") {
    const trimmed = directRoute.trim();
    if (trimmed && trimmed.toLowerCase().indexOf("unknown") === -1) return trimmed;
  }

  const origin =
    entry.origin ??
    entry.origin_port ??
    entry.originPort ??
    entry.origin_city ??
    entry.originCity ??
    entry.origin_state ??
    entry.originState ??
    entry.origin_country ??
    entry.originCountry ??
    entry.supplier_address_loc ??
    entry.supplier_address_location ??
    entry.supplier_address_country ??
    null;

  const destination =
    entry.destination ??
    entry.dest_port ??
    entry.destination_port ??
    entry.destinationPort ??
    entry.destination_city ??
    entry.destinationCity ??
    entry.destination_state ??
    entry.destinationState ??
    entry.destination_country ??
    entry.destinationCountry ??
    entry.company_address_loc ??
    entry.company_address_location ??
    entry.company_address_country ??
    null;

  if (!origin && !destination) return null;

  const originLabel = String(origin ?? "Unknown").trim();
  const destinationLabel = String(destination ?? "Unknown").trim();
  const route = `${originLabel} → ${destinationLabel}`;

  if (route.toLowerCase().indexOf("unknown") !== -1) return null;
  return route;
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

const ACCENT_MAP: Record<string, string> = {
  indigo: "border-[#DDD6FE] bg-[#F3E8FF]",
  blue: "border-[#BFDBFE] bg-[#DBEAFE]",
  emerald: "border-[#BBF7D0] bg-[#DCFCE7]",
  "indigo-strong": "border-[#C7D2FE] bg-[#E0E7FF]",
  green: "border-[#BBF7D0] bg-[#DCFCE7]",
  slate: "border-[#E2E8F0] bg-[#F8FAFC]",
  purple: "border-[#D8B4FE] bg-[#F5E8FF]",
};

const ICON_CONTAINER_CLASS =
  "mb-1 inline-flex h-8 w-8 items-center justify-center rounded-full bg-slate-900/8 text-slate-700";

interface KpiTileProps {
  label: string;
  value: React.ReactNode;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  accent: keyof typeof ACCENT_MAP;
}

const KpiTile: React.FC<KpiTileProps> = ({ label, value, icon: Icon, accent }) => (
  <div className={`flex flex-col gap-1 rounded-xl border px-4 py-3 ${ACCENT_MAP[accent]}`}>
    <div className={ICON_CONTAINER_CLASS}>
      <Icon className="h-4.5 w-4.5" />
    </div>
    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
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
    coerceNumber((profile as any)?.teuLast12m) ??
    coerceNumber((profile as any)?.totalTeu) ??
    coerceNumber(shipper.teusLast12m);

  const estSpend12m =
    coerceNumber((resolvedRouteKpis as any)?.estSpendUsd12m) ??
    coerceNumber((resolvedRouteKpis as any)?.estSpendUsd) ??
    coerceNumber(profile?.estSpendUsd12m) ??
    coerceNumber((profile as any)?.estSpendUsd) ??
    coerceNumber(shipper.estSpendLast12m);

  const fclShipments12m = getFclShipments12m(profile);
  const lclShipments12m = getLclShipments12m(profile);

  const containerMix = React.useMemo(() => {
    const fcl = typeof fclShipments12m === "number" ? fclShipments12m : 0;
    const lcl = typeof lclShipments12m === "number" ? lclShipments12m : 0;
    const total = fcl + lcl;
    if (total === 0) return null;
    const fclPct = Math.round((fcl / total) * 100);
    const lclPct = 100 - fclPct;
    return `${fclPct}% FCL / ${lclPct}% LCL`;
  }, [fclShipments12m, lclShipments12m]);

  const availableYears = React.useMemo(() => {
    if (!Array.isArray(profile?.timeSeries)) return [];
    const years = Array.from(
      new Set(
        profile.timeSeries
          .map((point: any) => extractYear(point?.month ?? point?.period ?? point?.date))
          .filter((value): value is number => value != null),
      ),
    ).sort((a, b) => b - a);

    return years;
  }, [profile?.timeSeries]);

  const [selectedYear, setSelectedYear] = React.useState<number | null>(null);

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
    if (!Array.isArray(profile?.timeSeries)) return [] as any[];
    if (!selectedYear) return profile.timeSeries.slice(-12);

    return profile.timeSeries.filter((point: any) => {
      const pointYear = extractYear(point?.month ?? point?.period ?? point?.date);
      return pointYear === selectedYear;
    });
  }, [profile?.timeSeries, selectedYear]);

  const shipmentsYear = React.useMemo(() => {
    return (filteredTimeSeries as any[]).reduce((sum: number, point: any) => {
      const fcl = pickTimeSeriesValue(point, ["fclShipments", "fcl", "fcl_count"]);
      const lcl = pickTimeSeriesValue(point, ["lclShipments", "lcl", "lcl_count"]);
      return sum + fcl + lcl;
    }, 0);
  }, [filteredTimeSeries]);

  const fclShipmentsYear = React.useMemo(() => {
    return (filteredTimeSeries as any[]).reduce((sum: number, point: any) => {
      return sum + pickTimeSeriesValue(point, ["fclShipments", "fcl", "fcl_count"]);
    }, 0);
  }, [filteredTimeSeries]);

  const lclShipmentsYear = React.useMemo(() => {
    return (filteredTimeSeries as any[]).reduce((sum: number, point: any) => {
      return sum + pickTimeSeriesValue(point, ["lclShipments", "lcl", "lcl_count"]);
    }, 0);
  }, [filteredTimeSeries]);

  const teuYear = React.useMemo(() => {
    return (filteredTimeSeries as any[]).reduce((sum: number, point: any) => {
      return (
        sum +
        pickTimeSeriesValue(point, [
          "teu",
          "teus",
          "teuVolume",
          "teu_count",
          "totalTeu",
          "teuLast12m",
        ])
      );
    }, 0);
  }, [filteredTimeSeries]);

  const estSpendYear = React.useMemo(() => {
    return (filteredTimeSeries as any[]).reduce((sum: number, point: any) => {
      return (
        sum +
        pickTimeSeriesValue(point, [
          "estSpendUsd",
          "estimatedSpendUsd",
          "marketSpendUsd",
          "spendUsd",
          "est_spend_usd",
          "est_spend",
        ])
      );
    }, 0);
  }, [filteredTimeSeries]);

  const containerMixYear = React.useMemo(() => {
    const total = fclShipmentsYear + lclShipmentsYear;
    if (total === 0) return null;
    const fclPct = Math.round((fclShipmentsYear / total) * 100);
    const lclPct = 100 - fclPct;
    return `${fclPct}% FCL / ${lclPct}% LCL`;
  }, [fclShipmentsYear, lclShipmentsYear]);

  const lastShipmentDate =
    profile?.lastShipmentDate ??
    shipper.lastShipmentDate ??
    shipper.mostRecentShipment ??
    null;

  const rawRouteEntries = React.useMemo(() => {
    const primary = Array.isArray(resolvedRouteKpis?.topRoutesLast12m)
      ? (resolvedRouteKpis?.topRoutesLast12m as any[])
      : [];
    const profileRoutes = Array.isArray((profile as any)?.top_routes)
      ? ((profile as any)?.top_routes as any[])
      : Array.isArray((profile as any)?.topRoutes)
        ? ((profile as any)?.topRoutes as any[])
        : Array.isArray((profile as any)?.routes)
          ? ((profile as any)?.routes as any[])
          : [];

    return [...primary, ...profileRoutes];
  }, [resolvedRouteKpis?.topRoutesLast12m, profile]);

  const yearScopedRouteEntries = React.useMemo(() => {
    if (!selectedYear) return rawRouteEntries;

    const scoped = rawRouteEntries.filter((entry: any) => {
      const candidate =
        entry?.month ??
        entry?.period ??
        entry?.date ??
        entry?.lastShipmentDate ??
        entry?.shipmentMonth ??
        entry?.shipment_date ??
        entry?.year ??
        null;
      const candidateYear = extractYear(candidate);
      return candidateYear === selectedYear;
    });

    return scoped.length > 0 ? scoped : rawRouteEntries;
  }, [rawRouteEntries, selectedYear]);

  const topRoutes = React.useMemo(() => {
    const byRoute = new Map<
      string,
      { route: string; shipments: number; mostRecentDate: string | null }
    >();

    for (const entry of yearScopedRouteEntries) {
      const route = normalizeRouteLabel(entry);
      if (!route) continue;

      const shipments =
        coerceNumber(entry?.shipments) ??
        coerceNumber(entry?.count) ??
        coerceNumber(entry?.shipments_12m) ??
        coerceNumber(entry?.shipmentsLast12m) ??
        0;

      const routeDate =
        typeof entry?.lastShipmentDate === "string"
          ? entry.lastShipmentDate
          : typeof entry?.date === "string"
            ? entry.date
            : typeof entry?.shipment_date === "string"
              ? entry.shipment_date
              : typeof entry?.month === "string"
                ? entry.month
                : null;

      const existing = byRoute.get(route);
      if (!existing) {
        byRoute.set(route, {
          route,
          shipments,
          mostRecentDate: routeDate,
        });
        continue;
      }

      existing.shipments += shipments;

      if (routeDate) {
        const existingDateValue = existing.mostRecentDate ? new Date(existing.mostRecentDate).getTime() : 0;
        const candidateDateValue = new Date(routeDate).getTime();
        if (!Number.isNaN(candidateDateValue) && candidateDateValue > existingDateValue) {
          existing.mostRecentDate = routeDate;
        }
      }
    }

    return Array.from(byRoute.values())
      .sort((a, b) => b.shipments - a.shipments)
      .slice(0, 5);
  }, [yearScopedRouteEntries]);

  const topRouteLast12m =
    topRoutes[0]?.route ??
    (typeof resolvedRouteKpis?.topRouteLast12m === "string" ? resolvedRouteKpis.topRouteLast12m : null) ??
    shipper.primaryRouteSummary ??
    shipper.primaryRoute ??
    null;

  const mostRecentRoute = React.useMemo(() => {
    if (topRoutes.length > 0) {
      const sortedByDate = [...topRoutes].sort((a, b) => {
        const aTs = a.mostRecentDate ? new Date(a.mostRecentDate).getTime() : 0;
        const bTs = b.mostRecentDate ? new Date(b.mostRecentDate).getTime() : 0;
        return bTs - aTs;
      });
      if (sortedByDate[0]?.route) return sortedByDate[0].route;
    }

    if (
      typeof resolvedRouteKpis?.mostRecentRoute === "string" &&
      resolvedRouteKpis.mostRecentRoute.toLowerCase().indexOf("unknown") === -1
    ) {
      return resolvedRouteKpis.mostRecentRoute;
    }

    return shipper.primaryRouteSummary ?? shipper.primaryRoute ?? null;
  }, [topRoutes, resolvedRouteKpis?.mostRecentRoute, shipper.primaryRouteSummary, shipper.primaryRoute]);

  const topRouteShipments =
    topRoutes.find((lane) => lane.route === topRouteLast12m)?.shipments ?? null;
  const mostRecentRouteShipments =
    topRoutes.find((lane) => lane.route === mostRecentRoute)?.shipments ?? null;

  const activeYearLabel = selectedYear ? String(selectedYear) : "last 12m";
  const topRouteHeading = selectedYear ? `Top route (${selectedYear})` : "Top route (last 12m)";
  const mostRecentHeading = selectedYear
    ? `Most recent route (${selectedYear})`
    : "Most recent route";

  const chartData = React.useMemo(
    () =>
      Array.isArray(filteredTimeSeries)
        ? (filteredTimeSeries as any[]).slice(-12).map((point: any) => ({
            monthLabel: monthLabel(point?.month ?? point?.period ?? point?.date ?? ""),
            fcl: pickTimeSeriesValue(point, ["fclShipments", "fcl", "fcl_count"]),
            lcl: pickTimeSeriesValue(point, ["lclShipments", "lcl", "lcl_count"]),
          }))
        : [],
    [filteredTimeSeries],
  );

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
      if (!unique.has(key)) {
        unique.set(key, cleaned);
      }
    }

    return Array.from(unique.values()).slice(0, 6);
  }, [profile?.topSuppliers, shipper.topSuppliers]);

  const enrichmentSummary = React.useMemo(() => pickEnrichmentSummary(enrichment), [enrichment]);
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
          section?.items ?? section?.bullets ?? section?.points ?? section?.content,
        );
        if (!label || items.length === 0) return null;
        return { label, items };
      })
      .filter((entry): entry is { label: string; items: string[] } => Boolean(entry));
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
      label: selectedYear ? `FCL shipments (${selectedYear})` : "FCL shipments",
      value: formatNumber(selectedYear ? fclShipmentsYear : fclShipments12m),
      icon: SquaresPlusIcon,
      accent: "purple",
    },
    {
      label: selectedYear ? `LCL shipments (${selectedYear})` : "LCL shipments",
      value: formatNumber(selectedYear ? lclShipmentsYear : lclShipments12m),
      icon: Squares2X2Icon,
      accent: "indigo",
    },
    {
      label: selectedYear ? `TEU volume (${selectedYear})` : "TEU volume",
      value: formatNumber(selectedYear ? teuYear : teu12m),
      icon: CubeIcon,
      accent: "blue",
    },
    {
      label: selectedYear ? `Market spend (${selectedYear})` : "Market spend",
      value: formatCurrency(selectedYear ? estSpendYear : estSpend12m),
      icon: CurrencyDollarIcon,
      accent: "emerald",
    },
    {
      label: selectedYear ? `Container mix (${selectedYear})` : "Container mix",
      value: selectedYear ? containerMixYear ?? "—" : containerMix ?? "—",
      icon: ChartPieIcon,
      accent: "indigo-strong",
    },
  ];

  const handleSaveClick = () => {
    if (!shipper || saveLoading) return;
    onSaveToCommandCenter({ shipper, profile: profile ?? null });
  };

  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-slate-900/60 px-3 py-4 sm:px-4 sm:py-6">
      <div className="relative mb-6 mt-2 flex w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl sm:mt-6">
        <div className="border-b border-slate-200 bg-slate-50 px-4 py-4 sm:px-6 md:px-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex min-w-0 items-start gap-4">
              <CompanyAvatar name={shipper.title} logoUrl={logoUrl} size="lg" />
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="truncate text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
                    {profile?.title || shipper.title || shipper.name || "Company"}
                  </h2>
                  {isSaved && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-emerald-700">
                      Saved
                    </span>
                  )}
                </div>
                {companyId && <p className="text-xs text-slate-500">{companyId}</p>}
                <div className="flex flex-wrap gap-3 text-xs text-slate-600">
                  {normalizedWebsite && (
                    <a
                      href={normalizedWebsite}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex max-w-[220px] items-center gap-1 text-indigo-600 hover:underline"
                    >
                      <GlobeAltIcon className="h-4 w-4 shrink-0" />
                      <span className="truncate">
                        {normalizedWebsite.replace(/^https?:\/\//i, "")}
                      </span>
                    </a>
                  )}
                  {normalizedPhone && (
                    <a href={`tel:${normalizedPhone}`} className="inline-flex items-center gap-1">
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

            <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
              {availableYears.length > 0 && (
                <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm">
                  <CalendarDaysIcon className="h-4 w-4 text-slate-500" />
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Year
                  </span>
                  <select
                    value={selectedYear ?? ""}
                    onChange={(e) =>
                      setSelectedYear(e.target.value ? Number(e.target.value) : null)
                    }
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
                className={`inline-flex items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-semibold shadow-sm transition ${
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
                className="inline-flex h-10 w-10 items-center justify-center self-end rounded-full border border-slate-200 text-slate-500 hover:bg-slate-100 sm:self-auto"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>

        <div className="max-h-[calc(100vh-7rem)] overflow-y-auto px-4 py-5 sm:px-6 md:px-8">
          {(loadingProfile || error) && (
            <div className="mb-4 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              {loadingProfile && <div>Loading company profile…</div>}
              {error && !loadingProfile && <div className="text-rose-600">{error}</div>}
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {kpiItems.map((item) => (
              <KpiTile key={item.label} {...item} />
            ))}
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-2">
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

          <div className="mt-6 grid gap-6 xl:grid-cols-3">
            <div className="space-y-4 xl:col-span-2">
              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 md:px-6 md:py-5">
                <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">Shipment velocity</p>
                    <p className="text-xs text-slate-500">
                      Monthly shipments split between FCL and LCL services for {activeYearLabel}.
                    </p>
                  </div>
                  {loadingProfile && <p className="text-xs text-slate-400">Loading trend…</p>}
                </div>

                {chartData.length === 0 ? (
                  <p className="text-xs text-slate-500">
                    No shipment trend data available yet for this year.
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
                        <Tooltip
                          content={<ChartTooltip />}
                          cursor={{ fill: "rgba(15,23,42,0.04)" }}
                        />
                        <Legend wrapperStyle={{ fontSize: 10 }} verticalAlign="top" align="right" />
                        <Bar
                          dataKey="fcl"
                          name="FCL"
                          fill="url(#fclGradient)"
                          radius={[4, 4, 0, 0]}
                        />
                        <Bar dataKey="lcl" name="LCL" fill="#22c55e" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Trade corridor analysis ({activeYearLabel})
                  </p>
                  <p className="text-xs text-slate-400">
                    {formatNumber(selectedYear ? shipmentsYear : shipments12m)} shipments
                  </p>
                </div>

                {topRoutes.length === 0 ? (
                  <p className="mt-2 text-xs text-slate-500">
                    Lane-level shipment data is not available for this company yet.
                  </p>
                ) : (
                  <ul className="mt-3 space-y-2 text-xs text-slate-700">
                    {topRoutes.map((lane, idx) => (
                      <li
                        key={`${lane.route}-${idx}`}
                        className="flex items-start justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2"
                      >
                        <div className="flex min-w-0 items-start gap-2">
                          <ArrowsRightLeftIcon className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                          <span className="truncate leading-snug">{lane.route}</span>
                        </div>
                        <span className="shrink-0 text-[11px] text-slate-500">
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
                        <p className="mt-2 whitespace-pre-line text-sm text-slate-800">
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
                                  <li
                                    key={`section-${idx}-item-${idy}`}
                                    className="flex items-start gap-2"
                                  >
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

              {supplierList.length > 0 && (
                <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Key partners
                  </p>
                  <ul className="mt-2 space-y-1.5">
                    {supplierList.map((supplier, idx) => (
                      <li
                        key={`supplier-${idx}`}
                        className="flex items-start gap-2 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-700"
                      >
                        <span className="mt-1 h-1.5 w-1.5 rounded-full bg-indigo-500" />
                        <span className="leading-snug">{supplier}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

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
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
