import React, { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CompanyAvatar } from "@/components/CompanyAvatar";
import {
  MapPin,
  Package,
  Ship,
  Info,
  Box,
  TrendingUp,
  Loader2,
} from "lucide-react";
import type { IyBolDetail, IyCompanyContact, IyShipperHit } from "@/lib/api";
import {
  deriveContactFromBol,
  getIyBolDetails,
  iyFetchCompanyBols,
} from "@/lib/api";
import type { ShipmentLite } from "@/types/importyeti";
import { getCompanyLogoUrl } from "@/lib/logo";

type ShipperDetailModalProps = {
  shipper: IyShipperHit | null;
  open: boolean;
  onClose: () => void;
  topRoute?: string | null;
  recentRoute?: string | null;
  contact?: IyCompanyContact | null;
  onSave?: (shipper: IyShipperHit) => void | Promise<void>;
  saving?: boolean;
};

type ChartMetric = "shipments" | "teu" | "containers" | "trend";

const chartMetricOptions: Array<{
  key: ChartMetric;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { key: "shipments", label: "Shipments", icon: Package },
  { key: "teu", label: "TEU", icon: Box },
  { key: "containers", label: "Containers", icon: Ship },
  { key: "trend", label: "Trend spikes", icon: TrendingUp },
];

const SHIPMENTS_LIMIT = 250;
const BOL_DETAIL_LIMIT = 50;
const BOL_DETAIL_CONCURRENCY = 5;

function countryCodeToEmoji(countryCode?: string | null): string | null {
  if (!countryCode) return null;
  const cc = countryCode.toUpperCase();
  if (cc.length !== 2) return null;

  const codePoints = Array.from(cc).map((ch) => 127397 + ch.charCodeAt(0));
  return String.fromCodePoint(...codePoints);
}

function safe(value: unknown): string {
  if (value == null) return "—";
  const text = String(value).trim();
  return text.length ? text : "—";
}

function formatNumber(value?: number | null): string {
  if (typeof value !== "number" || Number.isNaN(value)) return "—";
  return value.toLocaleString();
}

function formatGrowth(value: number | null): string {
  if (value == null || Number.isNaN(value)) return "—";
  const rounded = Math.round(value);
  return `${value >= 0 ? "+" : ""}${rounded}%`;
}

function getCompanySlug(key?: string | null) {
  if (!key) return "";
  return key.replace(/^company\//i, "");
}

type MonthlyPoint = {
  key: string;
  label: string;
  shipments: number;
  teu: number;
  containers: number;
};

type RouteInsights = {
  monthlySeries: MonthlyPoint[];
  shipmentsValue: number | null;
  teusTotal: number;
  teuWindows: { three: number; six: number; twelve: number };
  topRoute: string | null;
  topRoutes: Array<{ route: string; shipments: number }>;
  growthPercent: number | null;
};

function createMonthlyTemplate(monthCount = 12): MonthlyPoint[] {
  const template: MonthlyPoint[] = [];
  const now = new Date();
  for (let i = monthCount - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    template.push({
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      label: d.toLocaleString(undefined, { month: "short" }),
      shipments: 0,
      teu: 0,
      containers: 0,
    });
  }
  return template;
}

function parseDate(value?: string | null): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function buildRouteLabelFromDetail(detail: IyBolDetail): string | null {
  const rateRoute = detail.shipping_rate?.route;
  if (rateRoute && rateRoute.trim().length) {
    return rateRoute.trim();
  }
  const origin =
    detail.entry_port ??
    detail.origin_port ??
    detail.shipping_rate?.origin_port ??
    null;
  const destination =
    detail.exit_port ??
    detail.destination_port ??
    detail.shipping_rate?.destination_port ??
    null;
  if (origin && destination) return `${origin} → ${destination}`;
  if (origin) return origin;
  if (destination) return destination;
  return null;
}

function buildRouteLabelFromShipment(row: ShipmentLite): string | null {
  const origin = row.origin_port || row.origin_country_code;
  const destination = row.destination_port || row.dest_country_code;
  if (origin && destination) return `${origin} → ${destination}`;
  return origin || destination || null;
}

function computeGrowthPercentFromSeries(series: MonthlyPoint[]): number | null {
  if (!series.length) return null;
  const first = series[0].shipments || 0;
  const last = series[series.length - 1].shipments || 0;
  if (!first) return null;
  return ((last - first) / first) * 100;
}

function computeTeuWindowsFromSeries(series: MonthlyPoint[]) {
  const takeLast = (months: number) =>
    series.slice(-months).reduce((sum, row) => sum + row.teu, 0);
  return {
    three: takeLast(3),
    six: takeLast(6),
    twelve: takeLast(12),
  };
}

function buildInsightsFromDetails(
  details: IyBolDetail[],
): RouteInsights | null {
  if (!details.length) return null;
  const monthlySeries = createMonthlyTemplate();
  const bucketMap = new Map(monthlySeries.map((m) => [m.key, m]));
  const routeCounts = new Map<string, number>();

  details.forEach((detail) => {
    const arrival = parseDate(detail.arrival_date);
    const teuValue =
      toNumber(detail.company_teu_12m) ??
      toNumber(detail.total_teu) ??
      toNumber(detail.container_teu) ??
      0;
    const containersValue =
      toNumber(detail.container_count) ??
      toNumber(detail.container_teu) ??
      teuValue ??
      1;
    if (arrival) {
      const key = `${arrival.getFullYear()}-${String(arrival.getMonth() + 1).padStart(2, "0")}`;
      const bucket = bucketMap.get(key);
      if (bucket) {
        bucket.shipments += 1;
        bucket.teu += teuValue || 0;
        bucket.containers += containersValue || teuValue || 1;
      }
    }
    const routeLabel = buildRouteLabelFromDetail(detail);
    if (routeLabel) {
      routeCounts.set(routeLabel, (routeCounts.get(routeLabel) || 0) + 1);
    }
  });

  const teusTotal = monthlySeries.reduce((sum, row) => sum + row.teu, 0);
  const topRoutes = Array.from(routeCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([route, shipments]) => ({ route, shipments }));

  return {
    monthlySeries,
    shipmentsValue: details.length || null,
    teusTotal,
    teuWindows: computeTeuWindowsFromSeries(monthlySeries),
    topRoute: topRoutes[0]?.route ?? null,
    topRoutes,
    growthPercent: computeGrowthPercentFromSeries(monthlySeries),
  };
}

function buildInsightsFromShipments(rows: ShipmentLite[]): RouteInsights {
  const monthlySeries = createMonthlyTemplate();
  const bucketMap = new Map(monthlySeries.map((m) => [m.key, m]));
  const routeCounts = new Map<string, number>();

  rows.forEach((row) => {
    const dateValue = row.date ? new Date(row.date) : null;
    if (dateValue && !Number.isNaN(dateValue.getTime())) {
      const key = `${dateValue.getFullYear()}-${String(dateValue.getMonth() + 1).padStart(2, "0")}`;
      const bucket = bucketMap.get(key);
      if (bucket) {
        bucket.shipments += 1;
        const teu = typeof row.teu === "number" ? row.teu : 0;
        bucket.teu += teu;
        const containers =
          typeof (row as any)?.container_count === "number"
            ? (row as any).container_count
            : teu || 1;
        bucket.containers += containers;
      }
    }
    const routeLabel = buildRouteLabelFromShipment(row);
    if (routeLabel) {
      routeCounts.set(routeLabel, (routeCounts.get(routeLabel) || 0) + 1);
    }
  });

  const teusTotal = monthlySeries.reduce((sum, row) => sum + row.teu, 0);
  const topRoutes = Array.from(routeCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([route, shipments]) => ({ route, shipments }));

  return {
    monthlySeries,
    shipmentsValue: rows.length || null,
    teusTotal,
    teuWindows: computeTeuWindowsFromSeries(monthlySeries),
    topRoute: topRoutes[0]?.route ?? null,
    topRoutes,
    growthPercent: computeGrowthPercentFromSeries(monthlySeries),
  };
}

export default function ShipperDetailModal({
  shipper,
  open,
  onClose,
  topRoute,
  recentRoute,
  contact,
  onSave,
  saving = false,
}: ShipperDetailModalProps) {
  const [shipments, setShipments] = useState<ShipmentLite[]>([]);
  const [shipmentsLoading, setShipmentsLoading] = useState(false);
  const [shipmentsError, setShipmentsError] = useState<string | null>(null);
  const [chartMetric, setChartMetric] = useState<ChartMetric>("teu");
  const [bolDetails, setBolDetails] = useState<IyBolDetail[]>([]);
  const [bolDetailsLoading, setBolDetailsLoading] = useState(false);
  const [bolDetailsError, setBolDetailsError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !shipper?.key) return;
    const slug = getCompanySlug(shipper.key);
    if (!slug) return;

    let cancelled = false;
    setShipmentsLoading(true);
    setShipmentsError(null);

    if (import.meta.env.DEV) {
      console.debug("[ShipperDetailModal] Fetching ImportYeti BOLs", {
        key: shipper.key,
        slug,
      });
    }
    iyFetchCompanyBols({ companyKey: slug, limit: SHIPMENTS_LIMIT, offset: 0 })
      .then((result) => {
        if (!cancelled) {
          setShipments(result.shipments ?? []);
          if (!result.ok) {
            setShipmentsError("ImportYeti BOLs are temporarily unavailable.");
          } else {
            setShipmentsError(null);
          }
          if (import.meta.env.DEV) {
            console.debug("[ShipperDetailModal] BOL rows received", {
              key: shipper.key,
              count: result.shipments?.length ?? 0,
              ok: result.ok,
            });
          }
        }
      })
      .catch((error) => {
        console.warn("iyFetchCompanyBols failed", error);
        if (!cancelled) {
          setShipments([]);
          setShipmentsError("ImportYeti BOLs are temporarily unavailable.");
        }
      })
      .finally(() => {
        if (!cancelled) setShipmentsLoading(false);
        if (import.meta.env.DEV) {
          console.debug("[ShipperDetailModal] BOL fetch complete", {
            key: shipper.key,
            loaded: !cancelled,
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [open, shipper?.key]);

  useEffect(() => {
    if (!open || !shipper?.key || shipments.length === 0) {
      setBolDetails([]);
      setBolDetailsError(null);
      return;
    }
    const uniqueBolNumbers = shipments
      .map((row) => row.bol)
      .filter(
        (value, index, self): value is string =>
          typeof value === "string" &&
          value.trim().length > 0 &&
          self.indexOf(value) === index,
      )
      .slice(0, BOL_DETAIL_LIMIT);

    if (!uniqueBolNumbers.length) {
      setBolDetails([]);
      setBolDetailsError("No BOL numbers available for detail enrichment.");
      return;
    }

    let cancelled = false;
    const controller = new AbortController();
    setBolDetailsLoading(true);
    setBolDetailsError(null);

    getIyBolDetails(uniqueBolNumbers, {
      limit: BOL_DETAIL_LIMIT,
      concurrency: BOL_DETAIL_CONCURRENCY,
      signal: controller.signal,
    })
      .then((details) => {
        if (cancelled) return;
        setBolDetails(details);
        if (!details.length) {
          setBolDetailsError("ImportYeti BOL details unavailable.");
        }
      })
      .catch((error) => {
        if (cancelled) return;
        console.warn("getIyBolDetails failed", error);
        setBolDetails([]);
        setBolDetailsError("ImportYeti BOL detail lookup failed.");
      })
      .finally(() => {
        if (!cancelled) {
          setBolDetailsLoading(false);
        }
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [open, shipper?.key, shipments]);

  if (!open || !shipper) return null;

  const countryCode =
    shipper.countryCode ??
    (shipper as any)?.country_code ??
    (shipper as any)?.country ??
    null;

  const fallbackPhone =
    shipper.phone ??
    (shipper as any)?.company_main_phone_number ??
    (shipper as any)?.phone ??
    null;

  const fallbackWebsite =
    shipper.website ??
    (shipper as any)?.company_website ??
    (shipper as any)?.website ??
    null;

  const address = safe(
    shipper.address ??
      [
        (shipper as any)?.city,
        (shipper as any)?.state,
        (shipper as any)?.postal_code,
        shipper.countryCode ?? (shipper as any)?.country,
      ]
        .filter(Boolean)
        .join(", "),
  );

  const detailContact = useMemo(() => {
    if (!bolDetails.length) return null;
    for (const detail of bolDetails) {
      const candidate = deriveContactFromBol(detail);
      if (candidate.phone || candidate.website || candidate.email) {
        return candidate;
      }
    }
    return null;
  }, [bolDetails]);

  const mergedContact = contact ?? detailContact ?? null;

  const effectivePhone = mergedContact?.phone ?? fallbackPhone;
  const effectiveWebsite = mergedContact?.website ?? fallbackWebsite;
  const effectiveEmail = mergedContact?.email ?? null;
  const websiteLabel =
    effectiveWebsite?.replace(/^https?:\/\//i, "").replace(/\/$/, "") ?? null;
  const logoSource =
    mergedContact?.domain ??
    contact?.domain ??
    shipper.domain ??
    effectiveWebsite ??
    null;
  const logoUrl = getCompanyLogoUrl(logoSource);

  const detailInsights = useMemo(
    () => buildInsightsFromDetails(bolDetails),
    [bolDetails],
  );
  const shipmentInsights = useMemo(
    () => buildInsightsFromShipments(shipments),
    [shipments],
  );
  const activeInsights = detailInsights ?? shipmentInsights;
  const monthlySeries = activeInsights.monthlySeries;

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    console.debug("[ShipperDetailModal] Monthly series recomputed", {
      months: monthlySeries.length,
      shipmentsSource: detailInsights ? "bolDetails" : "shipments",
    });
  }, [monthlySeries, detailInsights]);

  const chartSeries = useMemo(() => {
    return monthlySeries.map((row, index, list) => {
      const prev = list[index - 1];
      let value = row.shipments;
      if (chartMetric === "teu") value = row.teu;
      if (chartMetric === "containers") value = row.containers;
      if (chartMetric === "trend")
        value = prev ? row.shipments - prev.shipments : 0;

      return {
        ...row,
        value,
        magnitude: Math.abs(value),
      };
    });
  }, [monthlySeries, chartMetric]);

  const maxMagnitude =
    chartSeries.reduce((max, point) => Math.max(max, point.magnitude), 0) || 0;

  const teusTotal = activeInsights.teusTotal || null;
  const teuWindows = activeInsights.teuWindows;
  const derivedTopRoute =
    topRoute ?? activeInsights.topRoute ?? recentRoute ?? null;
  const growthPercent = activeInsights.growthPercent;
  const shipmentsValue =
    typeof shipper.totalShipments === "number"
      ? shipper.totalShipments
      : (activeInsights.shipmentsValue ?? (shipments.length || null));
  const topRoutesList = activeInsights.topRoutes.slice(0, 5);

  const kpiCards = [
    {
      key: "shipments",
      label: "Shipments (12m)",
      value: shipmentsValue,
      icon: Ship,
    },
    {
      key: "teu",
      label: "TEUs (12m)",
      value: teusTotal,
      icon: Box,
    },
    {
      key: "growth",
      label: "Growth (YoY)",
      value: growthPercent,
      icon: TrendingUp,
      formatter: formatGrowth,
    },
    {
      key: "route",
      label: "Top route",
      value: derivedTopRoute,
      icon: MapPin,
      formatter: (val: unknown) => safe(val),
    },
  ];

  const handleSaveClick = async () => {
    if (!onSave) return;
    await onSave(shipper);
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="w-[95vw] max-w-4xl max-h-[95vh] overflow-hidden rounded-2xl bg-white p-0 flex flex-col">
        <DialogHeader className="border-b border-slate-100 px-6 py-5 shrink-0">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-start gap-4">
              <CompanyAvatar
                name={shipper.title}
                size="lg"
                className="shrink-0"
                logoUrl={logoUrl}
              />
              <div className="min-w-0">
                <DialogTitle
                  className="text-2xl font-semibold text-slate-900"
                  title={shipper.title}
                >
                  {shipper.title}
                </DialogTitle>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-500">
                  {countryCode && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-slate-600">
                      <span aria-hidden="true">
                        {countryCodeToEmoji(countryCode)}
                      </span>
                      <span>{countryCode}</span>
                    </span>
                  )}
                  {address && <span className="truncate">{address}</span>}
                </div>

                {(effectivePhone || effectiveEmail || effectiveWebsite) && (
                  <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                    {effectivePhone && <span>📞 {effectivePhone}</span>}
                    {effectiveEmail && (
                      <a
                        href={`mailto:${effectiveEmail}`}
                        className="underline decoration-slate-300 hover:decoration-slate-500"
                      >
                        {effectiveEmail}
                      </a>
                    )}
                    {effectiveWebsite && (
                      <a
                        href={
                          /^https?:\/\//i.test(effectiveWebsite)
                            ? effectiveWebsite
                            : `https://${effectiveWebsite}`
                        }
                        target="_blank"
                        rel="noreferrer"
                        className="underline decoration-slate-300 hover:decoration-slate-500"
                      >
                        {websiteLabel ?? effectiveWebsite}
                      </a>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              {onSave && (
                <Button
                  size="sm"
                  onClick={handleSaveClick}
                  disabled={saving}
                  className="rounded-full bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {saving ? "Saving…" : "Save to Command Center"}
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                onClick={onClose}
                aria-label="Close"
                className="rounded-full text-slate-500 hover:text-slate-900"
              >
                ✕
              </Button>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-6">
          {shipmentsLoading && (
            <div className="mb-4 flex items-center gap-2 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin text-indigo-500" />
              Loading ImportYeti BOLs…
            </div>
          )}
          {shipmentsError && (
            <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
              {shipmentsError}
            </div>
          )}
          {bolDetailsLoading && (
            <div className="mb-4 flex items-center gap-2 text-xs text-slate-500">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-indigo-500" />
              Enriching BOL contact & route intelligence…
            </div>
          )}
          {bolDetailsError && (
            <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
              {bolDetailsError}
            </div>
          )}

          <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {kpiCards.map((card) => {
              const Icon = card.icon;
              const rawValue =
                card.value == null
                  ? null
                  : typeof card.value === "number"
                    ? card.value
                    : card.value;
              const displayValue =
                typeof card.formatter === "function"
                  ? card.formatter(rawValue)
                  : formatNumber(rawValue as number | null);

              return (
                <div
                  key={card.key}
                  className="rounded-2xl border border-slate-200 bg-white p-4 min-h-[120px] flex flex-col justify-between"
                >
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase text-slate-500">
                    <Icon className="h-4 w-4 text-indigo-500" />
                    {card.label}
                  </div>
                  <div className="text-xl font-semibold text-slate-900">
                    {displayValue}
                  </div>
                </div>
              );
            })}
          </section>

          <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-900">
                  12-Month volume by metric
                </p>
                <p className="text-xs text-slate-500">
                  Toggle the metric to explore TEU, shipments, containers, or
                  trend spikes.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {chartMetricOptions.map((option) => {
                  const Icon = option.icon;
                  const active = chartMetric === option.key;
                  return (
                    <button
                      key={option.key}
                      type="button"
                      onClick={() => setChartMetric(option.key)}
                      className={[
                        "inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-medium transition",
                        active
                          ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                          : "border-slate-200 text-slate-600 hover:border-slate-300",
                      ].join(" ")}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {chartSeries.length === 0 ? (
              <div className="mt-4 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
                We&apos;re still collecting enough data to show this chart.
              </div>
            ) : (
              <div className="mt-4 flex h-48 items-end gap-2">
                {chartSeries.map((point) => {
                  const height =
                    maxMagnitude > 0
                      ? Math.max(
                          6,
                          Math.round((point.magnitude / maxMagnitude) * 170),
                        )
                      : 6;
                  const isTrend = chartMetric === "trend";
                  const barColor = isTrend
                    ? point.value >= 0
                      ? "from-emerald-400 to-emerald-600"
                      : "from-rose-400 to-rose-600"
                    : "from-indigo-400 to-indigo-600";

                  return (
                    <div
                      key={point.key}
                      className="flex flex-1 flex-col items-center gap-2"
                    >
                      <div className="text-[11px] text-slate-500">
                        {formatNumber(point.value)}
                      </div>
                      <div
                        className={[
                          "w-full rounded-t-md bg-gradient-to-b shadow-[inset_0_0_8px_rgba(255,255,255,0.3)]",
                          barColor,
                        ].join(" ")}
                        style={{ height }}
                        aria-label={`${point.label}: ${formatNumber(point.value)}`}
                      />
                      <div className="text-[11px] uppercase tracking-wide text-slate-500">
                        {point.label}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            <div className="mt-4 flex flex-wrap gap-4 text-xs text-slate-500">
              <span>
                3M TEU:{" "}
                <span className="font-semibold text-slate-900">
                  {formatNumber(teuWindows.three)}
                </span>
              </span>
              <span>
                6M TEU:{" "}
                <span className="font-semibold text-slate-900">
                  {formatNumber(teuWindows.six)}
                </span>
              </span>
              <span>
                12M TEU:{" "}
                <span className="font-semibold text-slate-900">
                  {formatNumber(teuWindows.twelve)}
                </span>
              </span>
            </div>
          </section>

          {topRoutesList.length > 0 && (
            <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-4">
              <div className="text-sm font-semibold text-slate-900">
                Top routes (12m)
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                {topRoutesList.map((route) => (
                  <div
                    key={route.route}
                    className="rounded-2xl border border-slate-100 bg-slate-50/60 px-3 py-3"
                  >
                    <div className="text-sm font-semibold text-slate-900">
                      {route.route}
                    </div>
                    <p className="text-xs text-slate-500">
                      {formatNumber(route.shipments)} shipments
                    </p>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="mt-6 rounded-2xl border border-indigo-50 bg-indigo-50/60 px-4 py-3 text-sm text-slate-700 flex gap-2">
            <Info className="h-5 w-5 text-indigo-500" />
            <p>
              ImportYeti DMA insights update weekly. Save this shipper to
              Command Center to unlock deeper contact enrichment, AI briefings,
              and multi-lane strategy recommendations.
            </p>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
