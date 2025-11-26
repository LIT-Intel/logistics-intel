import * as React from "react";
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
  Globe,
  Phone,
  Bookmark,
  BookmarkCheck,
} from "lucide-react";
import { CompanyAvatar } from "@/components/CompanyAvatar";
import {
  getCompanyLogoUrl,
} from "@/lib/logo";
import type {
  IyShipperHit,
  IyRouteKpis,
  IyCompanyProfile,
  IyCompanyProfileRoute,
} from "@/lib/api";

const MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const percentFormatter = new Intl.NumberFormat("en-US", {
  style: "percent",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

const formatShare = (numerator: number | null, denominator: number | null) => {
  if (!numerator || !denominator || denominator === 0) return null;
  return percentFormatter.format(numerator / denominator);
};

const normalizeWebsite = (value: string | null | undefined) => {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
};

const formatNumber = (value: number | null | undefined) => {
  if (value == null || Number.isNaN(value)) return "—";
  try {
    return value.toLocaleString();
  } catch {
    return String(value);
  }
};

const formatCurrency = (value: number | null | undefined) => {
  if (value == null || Number.isNaN(value)) return "—";
  try {
    return value.toLocaleString(undefined, {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    });
  } catch {
    return `$${value}`;
  }
};

const formatDateValue = (value?: string | null) => {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
};

const formatRouteLabel = (route?: IyCompanyProfileRoute | null) => {
  if (!route) return null;
  if (route.label) return route.label;
  if (route.origin && route.destination) return `${route.origin} → ${route.destination}`;
  return route.origin ?? route.destination ?? null;
};

type MonthlyActivityPoint = {
  period: string;
  fclShipments: number;
  lclShipments: number;
  totalTeu: number;
};

const coerceNumber = (value: unknown): number | null => {
  if (value == null) return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};

function buildMonthlyActivitySeries(
  profile?: IyCompanyProfile | null,
  fallbackFclShare = 0,
): MonthlyActivityPoint[] {
  if (!profile?.time_series) return [];

  const entries = Object.entries(profile.time_series)
    .map(([dateStr, raw]) => {
      if (!raw) return null;
      const [day, month, year] = dateStr.split("/").map((piece) => Number(piece));
      if (!day || !month || !year) return null;
      const date = new Date(year, month - 1, day);
      const shipments = coerceNumber((raw as any).shipments) ?? 0;
      const teu = coerceNumber((raw as any).teu) ?? 0;
      const fcl =
        coerceNumber((raw as any).fcl_shipments) ??
        coerceNumber((raw as any).shipments_fcl) ??
        coerceNumber((raw as any).fcl) ??
        null;
      const lcl =
        coerceNumber((raw as any).lcl_shipments) ??
        coerceNumber((raw as any).shipments_lcl) ??
        coerceNumber((raw as any).lcl) ??
        null;
      return { date, shipments, fcl, lcl, teu };
    })
    .filter(
      (
        entry,
      ): entry is {
        date: Date;
        shipments: number;
        fcl: number | null;
        lcl: number | null;
        teu: number;
      } => !!entry,
    )
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  const last12 = entries.slice(-12);
  const safeFclShare = Math.min(Math.max(fallbackFclShare || 0, 0), 1);

  return last12.map((entry) => {
    const label = `${MONTH_LABELS[entry.date.getMonth()]} ${entry.date.getFullYear()}`;
    if (entry.fcl != null || entry.lcl != null) {
      const fclValue = entry.fcl ?? Math.max(entry.shipments - (entry.lcl ?? 0), 0);
      const lclValue = entry.lcl ?? Math.max(entry.shipments - fclValue, 0);
      return {
        period: label,
        fclShipments: Math.max(fclValue, 0),
        lclShipments: Math.max(lclValue, 0),
        totalTeu: Math.max(entry.teu, 0),
      };
    }
    const derivedFcl = Math.round(entry.shipments * (safeFclShare || 0.5));
    return {
      period: label,
      fclShipments: Math.max(derivedFcl, 0),
      lclShipments: Math.max(entry.shipments - derivedFcl, 0),
      totalTeu: Math.max(entry.teu, 0),
    };
  });
}

type KpiCardProps = {
  label: string;
  value: React.ReactNode;
  sublabel?: string;
  toneClass?: string;
};

const KpiCard: React.FC<KpiCardProps> = ({ label, value, sublabel, toneClass }) => (
  <div
    className={`rounded-xl border px-3 py-3 ${toneClass ?? "bg-slate-50 border-slate-100"}`}
  >
    <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
      {label}
    </div>
    <div className="mt-1 text-lg font-semibold text-slate-900">{value}</div>
    {sublabel && <div className="mt-1 text-xs text-slate-500">{sublabel}</div>}
  </div>
);

type ShipperDetailModalProps = {
  isOpen: boolean;
  shipper: IyShipperHit | null;
  routeKpis: IyRouteKpis | null;
  loading: boolean;
  error: string | null;
  companyProfile?: IyCompanyProfile | null;
  profileLoading?: boolean;
  profileError?: string | null;
  isSaved?: boolean;
  onClose: () => void;
  onSaveToCommandCenter: (shipper: IyShipperHit) => void;
  onToggleSaved?: (shipper: IyShipperHit) => void;
  saveLoading: boolean;
};

const ShipperDetailModal: React.FC<ShipperDetailModalProps> = ({
  isOpen,
  shipper,
  routeKpis,
  loading,
  error,
  companyProfile,
  profileLoading = false,
  profileError = null,
  isSaved = false,
  onClose,
  onSaveToCommandCenter,
  onToggleSaved,
  saveLoading,
}) => {
  if (!isOpen || !shipper) return null;

  const profile = companyProfile ?? null;

  const {
    title,
    countryCode,
    address,
    totalShipments,
    mostRecentShipment,
    topSuppliers,
    website: shipperWebsite,
    phone: shipperPhone,
    domain: shipperDomain,
    primaryRouteSummary,
  } = shipper;

  const displayTitle =
    profile?.title || title || shipper.name || shipper.normalizedName || "Unknown company";
  const displayAddress = profile?.address || address || "Address not available";
  const displayCountry = profile?.country_code || countryCode || "Unknown";

  const rawWebsite =
    profile?.website ??
    (profile as any)?.company_website ??
    (profile as any)?.url ??
    (profile as any)?.company_url ??
    shipperWebsite ??
    shipper.domain ??
    null;
  const normalizedWebsite = normalizeWebsite(rawWebsite);
  const websiteHref = normalizedWebsite ?? null;
  const websiteLabel = websiteHref
    ? websiteHref.replace(/^https?:\/\//i, "").replace(/\/$/, "")
    : null;
  const displayPhone =
    profile?.phone_number ??
    (profile as any)?.company_phone ??
    (profile as any)?.phone ??
    (profile as any)?.company_phone_number ??
    shipperPhone ??
    null;

  const derivedDomain = profile?.domain
    ? profile.domain.replace(/^https?:\/\//i, "")
    : (() => {
        if (!websiteHref) return shipperDomain ?? null;
        try {
          const parsed = new URL(websiteHref);
          return parsed.hostname.replace(/^www\./i, "");
        } catch {
          return shipperDomain ?? null;
        }
      })();

  const logoUrl = derivedDomain
    ? getCompanyLogoUrl(derivedDomain)
    : shipperDomain
    ? getCompanyLogoUrl(shipperDomain)
    : undefined;

  const fclKpi = profile?.containers_load?.find(
    (c) => c.load_type?.toUpperCase() === "FCL",
  );
  const lclKpi = profile?.containers_load?.find(
    (c) => c.load_type?.toUpperCase() === "LCL",
  );
  const totalContainers = (fclKpi?.shipments ?? 0) + (lclKpi?.shipments ?? 0);
  const fclRatio = fclKpi?.shipments_perc ?? (totalContainers ? (fclKpi?.shipments ?? 0) / totalContainers : 0);
  const lclRatio = lclKpi?.shipments_perc ?? (totalContainers ? (lclKpi?.shipments ?? 0) / totalContainers : 0);

  const monthlySeries = React.useMemo(
    () => buildMonthlyActivitySeries(profile, fclRatio || 0),
    [profile, fclRatio],
  );
  const hasMonthlySeries = monthlySeries.length > 0;
  const shipmentsFromSeries = monthlySeries.reduce(
    (sum, point) => sum + point.fclShipments + point.lclShipments,
    0,
  );
  const teuFromSeries = monthlySeries.reduce(
    (sum, point) => sum + point.totalTeu,
    0,
  );
  const shipmentsKpi =
    shipmentsFromSeries || routeKpis?.shipmentsLast12m || profile?.total_shipments || totalShipments || null;
  const teuKpi = teuFromSeries || routeKpis?.teuLast12m || null;
  const spendKpi = routeKpis?.estSpendUsd ?? null;
  const lastShipmentDate = profile?.last_shipment_date ?? mostRecentShipment ?? null;

  const totalFcl = fclKpi?.shipments ?? null;
  const totalLcl = lclKpi?.shipments ?? null;
  const fclShareLabel = formatShare(totalFcl, totalContainers);
  const lclShareLabel = formatShare(totalLcl, totalContainers);

  const primaryTopRoute = profile?.top_routes?.[0] ?? null;
  const topRouteLabel =
    formatRouteLabel(primaryTopRoute) ||
    routeKpis?.topRouteLast12m ||
    primaryRouteSummary ||
    "No route data";
  const topRouteSublabel =
    primaryTopRoute?.shipments != null
      ? `${formatNumber(primaryTopRoute.shipments)} shipments`
      : undefined;

  const mostRecentRouteData = profile?.most_recent_route ?? null;
  const mostRecentRouteLabel =
    formatRouteLabel(mostRecentRouteData) || routeKpis?.mostRecentRoute || "No recent route";
  const mostRecentRouteSub = mostRecentRouteData?.last_shipment_date
    ? `Last shipment ${formatDateValue(mostRecentRouteData.last_shipment_date)}`
    : undefined;

  const supplierSample = profile?.suppliers_sample ?? topSuppliers ?? [];

  const statusHasMessage = loading || error || profileLoading || profileError;

  const topKpis: KpiCardProps[] = [
    {
      label: "Shipments (12m)",
      value: formatNumber(shipmentsKpi),
      toneClass: "bg-indigo-50 border-indigo-100",
    },
    {
      label: "Estimated TEU (12m)",
      value: formatNumber(teuKpi),
      toneClass: "bg-sky-50 border-sky-100",
    },
    {
      label: "Est. spend (12m)",
      value: formatCurrency(spendKpi),
      toneClass: "bg-emerald-50 border-emerald-100",
    },
    {
      label: "FCL shipments",
      value: (
        <span className="flex items-baseline gap-1">
          <span>{formatNumber(totalFcl)}</span>
          {fclShareLabel && (
            <span className="text-xs text-slate-500">({fclShareLabel})</span>
          )}
        </span>
      ),
      toneClass: "bg-indigo-50/60 border-indigo-100",
    },
    {
      label: "LCL shipments",
      value: (
        <span className="flex items-baseline gap-1">
          <span>{formatNumber(totalLcl)}</span>
          {lclShareLabel && (
            <span className="text-xs text-slate-500">({lclShareLabel})</span>
          )}
        </span>
      ),
      toneClass: "bg-emerald-50/60 border-emerald-100",
    },
    {
      label: "Last shipment",
      value: formatDateValue(lastShipmentDate),
      toneClass: "bg-amber-50 border-amber-100",
    },
  ];

  const handleSaveClick = () => {
    if (!shipper || saveLoading) return;
    if (onToggleSaved) {
      onToggleSaved(shipper);
      return;
    }
    onSaveToCommandCenter(shipper);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="max-h-[90vh] w-full max-w-5xl overflow-hidden rounded-2xl bg-white shadow-xl">
        <div className="border-b px-6 py-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-start gap-4">
              <CompanyAvatar name={displayTitle} logoUrl={logoUrl} size="lg" />
              <div className="min-w-0 space-y-1">
                <div className="flex items-center gap-2">
                  <h2 className="text-2xl font-semibold tracking-[0.08em] uppercase text-slate-900">
                    {displayTitle}
                  </h2>
                  {isSaved && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-emerald-700">
                      <BookmarkCheck className="h-3 w-3" /> Saved
                    </span>
                  )}
                </div>
                <p className="text-sm text-slate-600">{displayAddress}</p>
                <p className="text-xs text-slate-500">Country: {displayCountry}</p>
                <div className="mt-3 flex flex-wrap items-center gap-4 text-sm text-slate-600">
                  {websiteLabel && websiteHref && (
                    <a
                      href={websiteHref}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 hover:text-indigo-600"
                    >
                      <Globe className="h-4 w-4" />
                      <span className="truncate max-w-[200px]">{websiteLabel}</span>
                    </a>
                  )}
                  {displayPhone && (
                    <a
                      href={`tel:${displayPhone}`}
                      className="inline-flex items-center gap-1 hover:text-indigo-600"
                    >
                      <Phone className="h-4 w-4" />
                      <span>{displayPhone}</span>
                    </a>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
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
                  <BookmarkCheck className="h-4 w-4" />
                ) : (
                  <Bookmark className="h-4 w-4" />
                )}
                <span>
                  {isSaved ? "Saved to Command Center" : saveLoading ? "Saving…" : "Save to Command Center"}
                </span>
              </button>
              <button
                type="button"
                onClick={onClose}
                className="rounded-full border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
              >
                Close
              </button>
            </div>
          </div>
        </div>

        <div className="max-h-[calc(90vh-96px)] overflow-y-auto px-6 pb-8">
          {statusHasMessage && (
            <div className="mt-5 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              {loading && <div>Loading shipment insights…</div>}
              {error && !loading && <div className="text-red-600">{error}</div>}
              {profileLoading && <div>Loading company profile…</div>}
              {profileError && !profileLoading && (
                <div className="text-red-600">{profileError}</div>
              )}
            </div>
          )}

          <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
            {topKpis.map((kpi) => (
              <KpiCard
                key={kpi.label}
                label={kpi.label}
                value={kpi.value}
                sublabel={kpi.sublabel}
                toneClass={kpi.toneClass}
              />
            ))}
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <KpiCard label="Top route (last 12m)" value={topRouteLabel} sublabel={topRouteSublabel} />
            <KpiCard
              label="Most recent route"
              value={mostRecentRouteLabel}
              sublabel={mostRecentRouteSub}
            />
          </div>

          {supplierSample.length > 0 && (
            <div className="mt-8">
              <h3 className="text-sm font-semibold text-slate-700">Top suppliers (sample)</h3>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700">
                {supplierSample.slice(0, 5).map((supplier) => (
                  <li key={supplier}>{supplier}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-8">
            <h3 className="text-sm font-semibold text-slate-700">
              Activity last 12 months
            </h3>
            <p className="text-xs text-slate-500">Monthly shipments split between FCL and LCL services.</p>
            {hasMonthlySeries ? (
              <div className="mt-4 h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={monthlySeries}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="period" tickLine={false} tick={{ fontSize: 10 }} />
                    <YAxis allowDecimals={false} />
                    <Tooltip
                      formatter={(value: number) => formatNumber(value as number)}
                      labelFormatter={(label) => label}
                    />
                    <Legend />
                    <Bar dataKey="fclShipments" name="FCL" stackId="shipments" fill="#4f46e5" />
                    <Bar dataKey="lclShipments" name="LCL" stackId="shipments" fill="#10b981" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="mt-3 text-sm text-slate-500">
                No time-series data available for this company yet.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ShipperDetailModal;
