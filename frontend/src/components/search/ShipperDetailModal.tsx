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
import { Globe, Phone } from "lucide-react";
import { CompanyAvatar } from "@/components/CompanyAvatar";
import type {
  IyShipperHit,
  IyRouteKpis,
  IyCompanyProfile,
} from "@/lib/api";
import { getCompanyLogoUrl } from "@/lib/logo";

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

type MonthlyActivityPoint = {
  period: string;
  totalShipments: number;
  fclShipments: number;
  lclShipments: number;
  teu: number;
};

function buildMonthlyActivitySeries(
  profile?: IyCompanyProfile | null,
  fclRatio = 0,
  lclRatio = 0,
): MonthlyActivityPoint[] {
  if (!profile?.time_series) return [];

  const entries = Object.entries(profile.time_series)
    .map(([dateStr, value]) => {
      if (!value) return null;
      const [day, month, year] = dateStr.split("/").map((num) => Number(num));
      if (!day || !month || !year) return null;
      const date = new Date(year, month - 1, day);
      return {
        date,
        shipments: value.shipments ?? 0,
        teu: value.teu ?? 0,
      };
    })
    .filter(
      (
        point,
      ): point is { date: Date; shipments: number; teu: number } => point !== null,
    )
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  const last12 = entries.slice(-12);
  const safeFclRatio = Math.min(Math.max(fclRatio || 0, 0), 1);
  let safeLclRatio = Math.min(Math.max(lclRatio || 0, 0), 1);
  if (safeLclRatio === 0 && safeFclRatio > 0) {
    safeLclRatio = 1 - safeFclRatio;
  }
  const fallbackRatio = safeFclRatio === 0 && safeLclRatio === 0 ? 0.5 : safeFclRatio;

  return last12.map((entry) => {
    const total = entry.shipments ?? 0;
    const fclValue = Math.round(total * (safeFclRatio || fallbackRatio));
    const lclValue = Math.max(total - fclValue, 0);
    const period = `${MONTH_LABELS[entry.date.getMonth()]} ${entry.date.getFullYear()}`;

    return {
      period,
      totalShipments: total,
      fclShipments: fclValue,
      lclShipments: lclValue,
      teu: entry.teu ?? 0,
    };
  });
}

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

const formatPercent = (value: number | null | undefined) => {
  if (value == null || Number.isNaN(value)) return null;
  const formatted = value.toFixed(1);
  return formatted.endsWith(".0") ? formatted.slice(0, -2) : formatted;
};

type KpiCardProps = {
  label: string;
  value: React.ReactNode;
  sublabel?: string;
  toneClass?: string;
};

const KpiCard: React.FC<KpiCardProps> = ({ label, value, sublabel, toneClass }) => (
  <div
    className={`rounded-xl border px-3 py-3 ${
      toneClass ?? "bg-slate-50 border-slate-100"
    }`}
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
  onClose: () => void;
  onSaveToCommandCenter: (shipper: IyShipperHit) => void;
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
  onClose,
  onSaveToCommandCenter,
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
  const displayCountryCode = profile?.country_code || countryCode || "Unknown";

  const displayWebsite = normalizeWebsite(profile?.website || shipperWebsite || null);
  const websiteLabel = displayWebsite
    ? displayWebsite.replace(/^https?:\/\//i, "").replace(/\/$/, "")
    : null;
  const displayPhone = profile?.phone_number || shipperPhone || null;

  const derivedDomain = profile?.domain
    ? profile.domain.replace(/^https?:\/\//i, "")
    : (() => {
        if (!displayWebsite) return shipperDomain ?? null;
        try {
          const parsed = new URL(displayWebsite);
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
    () => buildMonthlyActivitySeries(profile, fclRatio, lclRatio),
    [profile, fclRatio, lclRatio],
  );
  const hasMonthlySeries = monthlySeries.length > 0;
  const totalShipmentsFromSeries = monthlySeries.reduce(
    (sum, point) => sum + point.totalShipments,
    0,
  );
  const totalTeuFromSeries = monthlySeries.reduce((sum, point) => sum + point.teu, 0);

  const shipmentsKpi =
    totalShipmentsFromSeries || routeKpis?.shipmentsLast12m || profile?.total_shipments || totalShipments || null;
  const teuKpi = totalTeuFromSeries || routeKpis?.teuLast12m || null;
  const spendKpi = routeKpis?.estSpendUsd ?? null;
  const lastShipmentDisplay = formatDateValue(mostRecentShipment);

  const totalFcl = fclKpi?.shipments ?? null;
  const totalLcl = lclKpi?.shipments ?? null;
  const fclPercent = totalContainers > 0 && totalFcl != null ? (totalFcl / totalContainers) * 100 : null;
  const lclPercent = totalContainers > 0 && totalLcl != null ? (totalLcl / totalContainers) * 100 : null;

  const topRoute = routeKpis?.topRouteLast12m || primaryRouteSummary || null;
  const mostRecentRoute = routeKpis?.mostRecentRoute || null;
  const suppliers = Array.isArray(topSuppliers) ? topSuppliers : [];

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
          {fclPercent != null && (
            <span className="text-xs text-slate-500">
              ({formatPercent(fclPercent)}%)
            </span>
          )}
        </span>
      ),
      toneClass: "bg-indigo-50/40 border-indigo-100",
    },
    {
      label: "LCL shipments",
      value: (
        <span className="flex items-baseline gap-1">
          <span>{formatNumber(totalLcl)}</span>
          {lclPercent != null && (
            <span className="text-xs text-slate-500">
              ({formatPercent(lclPercent)}%)
            </span>
          )}
        </span>
      ),
      toneClass: "bg-emerald-50/40 border-emerald-100",
    },
    {
      label: "Last shipment",
      value: lastShipmentDisplay,
      toneClass: "bg-amber-50 border-amber-100",
    },
  ];

  const handleSaveClick = () => {
    if (!shipper || saveLoading) return;
    onSaveToCommandCenter(shipper);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="max-h-[90vh] w-full max-w-5xl overflow-hidden rounded-2xl bg-white shadow-xl">
        <div className="border-b px-6 py-4">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-start gap-4">
              <CompanyAvatar name={displayTitle} logoUrl={logoUrl ?? undefined} size="lg" />
              <div className="min-w-0 space-y-1">
                <h2 className="text-xl font-semibold tracking-wide uppercase text-slate-900">
                  {displayTitle}
                </h2>
                <p className="text-sm text-slate-600">{displayAddress}</p>
                <p className="text-xs text-slate-500">Country: {displayCountryCode}</p>
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
                className="rounded-full bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saveLoading ? "Saving…" : "Save to Command Center"}
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
            <KpiCard
              label="Top route (last 12m)"
              value={topRoute || "No route data"}
              sublabel={routeKpis?.sampleSize ? `${formatNumber(routeKpis.sampleSize)} shipments` : undefined}
            />
            <KpiCard
              label="Most recent route"
              value={mostRecentRoute || "No recent route"}
              sublabel={lastShipmentDisplay !== "—" ? `Last shipment ${lastShipmentDisplay}` : undefined}
            />
          </div>

          {suppliers.length > 0 && (
            <div className="mt-8">
              <h3 className="text-sm font-semibold text-slate-700">Top suppliers (sample)</h3>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700">
                {suppliers.slice(0, 5).map((supplier) => (
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
                    <YAxis />
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
