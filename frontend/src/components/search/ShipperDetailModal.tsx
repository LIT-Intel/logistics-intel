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
import {
  type IyShipperHit,
  type IyRouteKpis,
  type IyCompanyProfile,
  type IyCompanyProfileRoute,
  normalizeIyCompanyProfile,
} from "@/lib/api";

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

type LaneActivityPoint = {
  lane: string;
  fclShipments: number;
  lclShipments: number;
};

const coerceNumber = (value: unknown): number | null => {
  if (value == null) return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};

function deriveLaneLabel(input: any, index: number): string {
  if (!input) return `Lane ${index + 1}`;
  const origin =
    input.origin ??
    input.origin_port ??
    input.origin_country ??
    input.origin_country_code ??
    null;
  const destination =
    input.destination ??
    input.destination_port ??
    input.destination_country ??
    input.destination_country_code ??
    null;
  return (
    input.lane ||
    input.route ||
    input.label ||
    (origin && destination ? `${origin} → ${destination}` : origin || destination) ||
    `Lane ${index + 1}`
  );
}

function buildLaneActivitySeries(
  logisticsKpis: any,
  profile?: IyCompanyProfile | null,
): LaneActivityPoint[] {
  const map = new Map<string, { fcl: number; lcl: number }>();
  const lanes = Array.isArray(logisticsKpis?.top_lanes)
    ? logisticsKpis.top_lanes
    : [];

  lanes.forEach((lane, index) => {
    const label = deriveLaneLabel(lane, index);
    const mode = (lane?.mode ?? lane?.service ?? lane?.load_type)
      ?.toString()
      .toUpperCase();
    const shipments =
      coerceNumber(
        lane?.shipments_12m ??
          lane?.shipments ??
          lane?.total_shipments ??
          lane?.count,
      ) ?? 0;
    const fclValue =
      coerceNumber(
        lane?.fcl_shipments ?? lane?.shipments_fcl ?? lane?.fcl,
      ) ?? 0;
    const lclValue =
      coerceNumber(
        lane?.lcl_shipments ?? lane?.shipments_lcl ?? lane?.lcl,
      ) ?? 0;
    const bucket = map.get(label) ?? { fcl: 0, lcl: 0 };

    if (fclValue || lclValue) {
      bucket.fcl += fclValue;
      bucket.lcl += lclValue;
    } else if (mode === "FCL") {
      bucket.fcl += shipments;
    } else if (mode === "LCL") {
      bucket.lcl += shipments;
    } else if (shipments) {
      const derivedFcl = Math.round(shipments * 0.65);
      bucket.fcl += derivedFcl;
      bucket.lcl += Math.max(shipments - derivedFcl, 0);
    }
    map.set(label, bucket);
  });

  const fallbackRoutes = profile?.top_routes ?? [];
  fallbackRoutes.forEach((route, index) => {
    const label =
      route.label ||
      (route.origin && route.destination
        ? `${route.origin} → ${route.destination}`
        : route.origin || route.destination || `Route ${index + 1}`);
    if (!label) return;
    const shipments = coerceNumber(route.shipments) ?? 0;
    if (!shipments) return;
    const bucket = map.get(label) ?? { fcl: 0, lcl: 0 };
    const derivedFcl = Math.round(shipments * 0.65);
    bucket.fcl += derivedFcl;
    bucket.lcl += Math.max(shipments - derivedFcl, 0);
    map.set(label, bucket);
  });

  return Array.from(map.entries())
    .map(([lane, stats]) => ({
      lane,
      fclShipments: Math.max(Math.round(stats.fcl), 0),
      lclShipments: Math.max(Math.round(stats.lcl), 0),
    }))
    .filter((point) => point.fclShipments + point.lclShipments > 0)
    .sort(
      (a, b) =>
        b.fclShipments +
        b.lclShipments -
        (a.fclShipments + a.lclShipments),
    )
    .slice(0, 6);
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
  companyProfile?: any;
  companyEnrichment?: any;
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
  companyEnrichment,
  profileLoading = false,
  profileError = null,
  isSaved = false,
  onClose,
  onSaveToCommandCenter,
  onToggleSaved,
  saveLoading,
}) => {
  if (!isOpen || !shipper) return null;

  const rawProfile = companyProfile ?? null;
  const profileKey =
    shipper.companyKey ||
    shipper.key ||
    shipper.companyId ||
    shipper.title ||
    "";
  const normalizedProfile = rawProfile
    ? normalizeIyCompanyProfile(rawProfile, profileKey)
    : null;
  const normalizedCompany =
    (companyEnrichment?.normalized_company as Record<string, any>) ?? {};
  const logisticsKpis = companyEnrichment?.logistics_kpis ?? {};

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

  const rawProfileData = (rawProfile?.data ?? rawProfile) || {};
  const fallbackWebsite =
    rawProfileData?.website ??
    rawProfileData?.company_website ??
    rawProfileData?.url ??
    null;
  const fallbackPhone =
    rawProfileData?.phone_number ??
    rawProfileData?.phone ??
    rawProfileData?.company_phone ??
    null;
  const fallbackDomain =
    rawProfileData?.domain ??
    rawProfileData?.company_domain ??
    rawProfileData?.website_domain ??
    null;

  const displayTitle =
    (normalizedCompany?.name as string) ||
    normalizedProfile?.title ||
    title ||
    shipper.name ||
    shipper.normalizedName ||
    "Unknown company";
  const displayAddress =
    (normalizedCompany?.hq as string) ||
    normalizedProfile?.address ||
    address ||
    "Address not available";
  const displayCountry =
    (normalizedCompany?.country as string) ||
    normalizedProfile?.country_code ||
    countryCode ||
    "Unknown";

  const websiteSource =
    (normalizedCompany?.website as string) ||
    (normalizedCompany?.domain as string) ||
    normalizedProfile?.website ||
    fallbackWebsite ||
    shipperWebsite ||
    null;
  const displayWebsite = normalizeWebsite(websiteSource);
  const websiteLabel = displayWebsite
    ? displayWebsite.replace(/^https?:\/\//i, "").replace(/\/$/, "")
    : null;
  const displayPhone =
    (normalizedCompany?.phone as string) ||
    normalizedProfile?.phone_number ||
    fallbackPhone ||
    shipperPhone ||
    null;

  const derivedDomain = (() => {
    const candidate =
      (normalizedCompany?.domain as string) ||
      normalizedProfile?.domain ||
      fallbackDomain ||
      shipperDomain ||
      null;
    if (candidate) {
      return candidate.replace(/^https?:\/\//i, "").replace(/\/$/, "");
    }
    if (!displayWebsite) return null;
    try {
      const parsed = new URL(displayWebsite);
      return parsed.hostname.replace(/^www\./i, "");
    } catch {
      return null;
    }
  })();

  const logoUrl = derivedDomain
    ? getCompanyLogoUrl(derivedDomain)
    : shipperDomain
    ? getCompanyLogoUrl(shipperDomain)
    : undefined;

  const totalFcl =
    coerceNumber(
      logisticsKpis?.fcl_shipments ??
        logisticsKpis?.shipments_fcl ??
        logisticsKpis?.fcl,
    ) ?? null;
  const totalLcl =
    coerceNumber(
      logisticsKpis?.lcl_shipments ??
        logisticsKpis?.shipments_lcl ??
        logisticsKpis?.lcl,
    ) ?? null;
  const totalVolume = (totalFcl ?? 0) + (totalLcl ?? 0);
  const fclShareLabel = formatShare(totalFcl, totalVolume || null);
  const lclShareLabel = formatShare(totalLcl, totalVolume || null);

  const shipmentsKpi =
    coerceNumber(logisticsKpis?.shipments_12m) ??
    routeKpis?.shipmentsLast12m ??
    normalizedProfile?.total_shipments ??
    totalShipments ??
    null;
  const teuKpi =
    coerceNumber(logisticsKpis?.teus_12m) ?? routeKpis?.teuLast12m ?? null;
  const spendKpi =
    coerceNumber(logisticsKpis?.est_spend_usd) ?? routeKpis?.estSpendUsd ?? null;
  const lastShipmentDate =
    logisticsKpis?.last_shipment_date ??
    normalizedProfile?.last_shipment_date ??
    mostRecentShipment ??
    null;

  const primaryTopRoute = normalizedProfile?.top_routes?.[0] ?? null;
  const topRouteLabel =
    formatRouteLabel(primaryTopRoute) ||
    routeKpis?.topRouteLast12m ||
    primaryRouteSummary ||
    "No route data";
  const topRouteSublabel =
    primaryTopRoute?.shipments != null
      ? `${formatNumber(primaryTopRoute.shipments)} shipments`
      : undefined;

  const mostRecentRouteData = normalizedProfile?.most_recent_route ?? null;
  const mostRecentRouteLabel =
    formatRouteLabel(mostRecentRouteData) || routeKpis?.mostRecentRoute || "No recent route";
  const mostRecentRouteSub = mostRecentRouteData?.last_shipment_date
    ? `Last shipment ${formatDateValue(mostRecentRouteData.last_shipment_date)}`
    : undefined;

  const supplierSample = normalizedProfile?.suppliers_sample ?? topSuppliers ?? [];

  const laneSeries = React.useMemo(
    () => buildLaneActivitySeries(logisticsKpis, normalizedProfile),
    [logisticsKpis, normalizedProfile],
  );
  const hasLaneSeries = laneSeries.length > 0;

  const statusHasMessage = loading || error || profileLoading || profileError;
  const enrichmentUnavailable =
    !companyEnrichment && !profileLoading && !loading;

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
                  {websiteLabel && displayWebsite && (
                    <a
                      href={displayWebsite}
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
          {(statusHasMessage || enrichmentUnavailable) && (
            <div className="mt-5 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              {loading && <div>Loading shipment insights…</div>}
              {error && !loading && <div className="text-red-600">{error}</div>}
              {profileLoading && <div>Loading company profile…</div>}
              {profileError && !profileLoading && (
                <div className="text-red-600">{profileError}</div>
              )}
              {enrichmentUnavailable && (
                <div className="text-indigo-600">
                  AI enrichment not available for this company yet.
                </div>
              )}
            </div>
          )}

          <div className="mt-6 grid gap-4 md:grid-cols-3 lg:grid-cols-6">
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
              Top lanes (last 12 months)
            </h3>
            <p className="text-xs text-slate-500">
              FCL vs LCL shipment mix across the leading trade lanes.
            </p>
            {hasLaneSeries ? (
              <div className="mt-4 h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={laneSeries}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="lane" tickLine={false} tick={{ fontSize: 10 }} />
                    <YAxis allowDecimals={false} />
                    <Tooltip
                      formatter={(value: number) => `${formatNumber(value as number)} shipments`}
                      labelFormatter={(label) => label}
                    />
                    <Legend />
                    <Bar dataKey="fclShipments" name="FCL" stackId="lanes" fill="#4f46e5" />
                    <Bar dataKey="lclShipments" name="LCL" stackId="lanes" fill="#10b981" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="mt-3 text-sm text-slate-500">
                Lane-level shipment data is not available for this company yet.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ShipperDetailModal;
