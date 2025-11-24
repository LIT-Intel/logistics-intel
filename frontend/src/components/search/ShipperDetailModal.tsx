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
import { CompanyAvatar } from "@/components/CompanyAvatar";
import type {
  IyShipperHit,
  IyRouteKpis,
  IyCompanyProfile,
} from "@/lib/api";

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
  } = shipper;

  const displayTitle =
    profile?.title ||
    title ||
    shipper.name ||
    shipper.normalizedName ||
    "Unknown company";

  const displayAddress = profile?.address || address || null;
  const displayCountryCode = profile?.country_code || countryCode || null;

  const normalizeWebsite = (value: string | null) => {
    if (!value) return null;
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    return `https://${trimmed}`;
  };

  const websiteSource = profile?.website || shipperWebsite || null;
  const displayWebsite = normalizeWebsite(websiteSource);
  const displayPhone = profile?.phone_number || shipperPhone || null;

  const derivedDomain = (() => {
    if (profile?.domain) {
      return profile.domain.replace(/^https?:\/\//i, "");
    }
    if (displayWebsite) {
      try {
        const parsed = new URL(displayWebsite);
        return parsed.hostname.replace(/^www\./i, "");
      } catch {
        return shipperDomain ?? null;
      }
    }
    return shipperDomain ?? null;
  })();

  const fallbackShipments =
    profile?.total_shipments ?? totalShipments ?? null;

  const shipments12m =
    routeKpis?.shipmentsLast12m ??
    (typeof fallbackShipments === "number" ? fallbackShipments : null);
  const teu12m =
    typeof routeKpis?.teuLast12m === "number" ? routeKpis.teuLast12m : null;
  const estSpendUsd =
    typeof routeKpis?.estSpendUsd === "number" ? routeKpis.estSpendUsd : null;
  const topRoute = routeKpis?.topRouteLast12m ?? null;
  const mostRecentRoute = routeKpis?.mostRecentRoute ?? null;

  function buildMonthlySeries(profile?: IyCompanyProfile | null) {
    if (!profile?.time_series) return [];
    const entries = Object.entries(profile.time_series)
      .map(([dateStr, v]) => {
        if (!v) return null;
        const [day, month, year] = dateStr.split("/").map((x) => Number(x));
        if (!day || !month || !year) return null;
        const d = new Date(year, month - 1, day);
        return {
          dateStr,
          date: d,
          shipments: v.shipments ?? 0,
          teu: v.teu ?? 0,
        };
      })
      .filter(
        (
          p,
        ): p is { dateStr: string; date: Date; shipments: number; teu: number } =>
          !!p,
      )
      .sort((a, b) => a.date.getTime() - b.date.getTime());

    const last12 = entries.slice(-12);
    const monthNames = [
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

    return last12.map((p) => ({
      period: `${monthNames[p.date.getMonth()]} ${p.date.getFullYear()}`,
      shipments: p.shipments,
      teu: p.teu,
    }));
  }

  const monthlySeries = buildMonthlySeries(companyProfile);
  const hasMonthlySeries = monthlySeries.length > 0;
  const fclKpi = companyProfile?.containers_load?.find(
    (c) => c.load_type?.toUpperCase() === "FCL",
  );
  const lclKpi = companyProfile?.containers_load?.find(
    (c) => c.load_type?.toUpperCase() === "LCL",
  );

  const suppliers = Array.isArray(topSuppliers) ? topSuppliers : [];

  const handleSaveClick = () => {
    if (!shipper || saveLoading) return;
    onSaveToCommandCenter(shipper);
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

    const formatTooltipValue = (value: number, name: string) => {
      if (name?.startsWith("Est. spend")) {
        return formatCurrency(value);
      }
      return formatNumber(value);
    };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="max-h-[90vh] w-full max-w-5xl overflow-hidden rounded-2xl bg-white shadow-xl">
        <div className="flex items-start justify-between border-b px-6 py-4">
          <div>
            <div className="flex items-center gap-3">
              <CompanyAvatar
                name={displayTitle}
                domain={derivedDomain ?? undefined}
                size={40}
              />
              <div>
                <h2 className="text-lg font-semibold text-gray-900">
                  {displayTitle}
                </h2>
                <div className="mt-0.5 text-xs text-gray-500">
                  {displayAddress || "Address not available"}
                </div>
                <div className="mt-0.5 text-xs text-gray-500">
                  {displayCountryCode
                    ? `Country: ${displayCountryCode}`
                    : "Country unknown"}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                  {displayWebsite && (
                    <a
                      href={displayWebsite}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-full bg-indigo-50 px-2 py-0.5 font-medium text-indigo-700 hover:bg-indigo-100"
                    >
                      {displayWebsite.replace(/^https?:\/\//, "")}
                    </a>
                  )}
                  {displayPhone && (
                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 font-medium text-emerald-700">
                      {displayPhone}
                    </span>
                  )}
                </div>
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
              className="rounded-full border border-gray-200 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
            >
              Close
            </button>
          </div>
        </div>

        <div className="space-y-6 overflow-y-auto px-6 py-5">
          {(loading || error || profileLoading || profileError) && (
            <div className="rounded-lg bg-gray-50 px-4 py-3 text-sm">
              {loading && <div className="text-gray-600">Loading shipment insights…</div>}
              {error && !loading && (
                <div className="text-red-600">
                  Unable to load route KPIs right now. <span className="text-xs text-gray-500">Details: {error}</span>
                </div>
              )}
              {profileLoading && (
                <div className="text-gray-600">Loading company profile…</div>
              )}
              {profileError && !profileLoading && (
                <div className="text-red-600">
                  Unable to load company profile.{" "}
                  <span className="text-xs text-gray-500">Details: {profileError}</span>
                </div>
              )}
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
              <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Shipments (12m)</div>
              <div className="mt-1 text-2xl font-semibold text-gray-900">{formatNumber(shipments12m)}</div>
              <div className="mt-1 text-xs text-gray-500">Using ImportYeti totals when available</div>
            </div>
            <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
              <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Estimated TEU (12m)</div>
              <div className="mt-1 text-2xl font-semibold text-gray-900">{formatNumber(teu12m)}</div>
              <div className="mt-1 text-xs text-gray-500">This will be refined once route KPIs are wired</div>
            </div>
            <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
              <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Est. Spend (12m)</div>
              <div className="mt-1 text-2xl font-semibold text-gray-900">{formatCurrency(estSpendUsd)}</div>
              <div className="mt-1 text-xs text-gray-500">Placeholder until full spend model is enabled</div>
            </div>
            {fclKpi && (
              <div className="rounded-xl border border-gray-100 bg-indigo-50/40 px-4 py-3">
                <div className="text-xs font-medium uppercase tracking-wide text-gray-600">
                  FCL shipments
                </div>
                <div className="mt-1 text-2xl font-semibold text-gray-900">
                  {formatNumber(fclKpi.shipments)}
                </div>
                <div className="mt-1 text-xs text-gray-500">
                  {((fclKpi.shipments_perc ?? 0) * 100).toFixed(2)}% of shipments
                </div>
              </div>
            )}
            {lclKpi && (
              <div className="rounded-xl border border-gray-100 bg-emerald-50/40 px-4 py-3">
                <div className="text-xs font-medium uppercase tracking-wide text-gray-600">
                  LCL shipments
                </div>
                <div className="mt-1 text-2xl font-semibold text-gray-900">
                  {formatNumber(lclKpi.shipments)}
                </div>
                <div className="mt-1 text-xs text-gray-500">
                  {((lclKpi.shipments_perc ?? 0) * 100).toFixed(2)}% of shipments
                </div>
              </div>
            )}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-gray-100 px-4 py-3">
              <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Top route (last 12m)</div>
              <div className="mt-1 text-sm text-gray-900">{topRoute || "Route data coming soon"}</div>
            </div>
            <div className="rounded-xl border border-gray-100 px-4 py-3">
              <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Most recent route</div>
              <div className="mt-1 text-sm text-gray-900">{mostRecentRoute || "Most recent route not yet mapped"}</div>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-gray-100 px-4 py-3">
              <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Last shipment</div>
              <div className="mt-1 text-sm text-gray-900">{mostRecentShipment || "No recent shipment date available"}</div>
            </div>
            <div className="rounded-xl border border-gray-100 px-4 py-3">
              <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Top suppliers (sample)</div>
              {suppliers.length === 0 ? (
                <div className="mt-1 text-sm text-gray-900">Supplier list not available yet.</div>
              ) : (
                <ul className="mt-1 space-y-1 text-sm text-gray-900">
                  {suppliers.slice(0, 5).map((s) => (
                    <li key={s} className="truncate">
                      • {s}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

              <div className="rounded-xl border border-gray-100 px-4 py-4">
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <div className="text-xs font-medium uppercase tracking-wide text-gray-500">
                      Activity last 12 months
                    </div>
                    <div className="mt-0.5 text-xs text-gray-400">
                      Shipments and TEU volumes using ImportYeti company profile
                    </div>
                  </div>
                </div>

                {hasMonthlySeries ? (
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={monthlySeries}
                        margin={{ top: 10, right: 24, left: 0, bottom: 24 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis
                          dataKey="period"
                          height={40}
                          tickLine={false}
                          tick={{ fontSize: 10 }}
                        />
                        <YAxis />
                        <Tooltip
                          formatter={(value, name) =>
                            formatTooltipValue(value as number, name as string)
                          }
                          labelFormatter={(label) => label}
                        />
                        <Legend />
                        <Bar dataKey="shipments" name="Shipments" />
                        <Bar dataKey="teu" name="TEU" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed border-gray-200 px-4 py-6 text-sm text-gray-500">
                    No time-series data yet. Once ImportYeti BOL-based metrics are available for this
                    shipper, the monthly chart will render automatically.
                  </div>
                )}
              </div>
        </div>
      </div>
    </div>
  );
};

export default ShipperDetailModal;
