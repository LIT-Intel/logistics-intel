import React, { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CompanyAvatar } from "@/components/CompanyAvatar";
import { AlertCircle, ExternalLink, Globe, Loader2, MapPin, Phone } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { IyCompanyProfile, IyRouteKpis, IyShipperHit } from "@/lib/api";
import { getIyCompanyProfile } from "@/lib/api";
import { getCompanyLogoUrl } from "@/lib/logo";

const chartMetrics = [
  { key: "shipments" as const, label: "Shipments" },
  { key: "teu" as const, label: "TEU" },
];

type ChartMetric = (typeof chartMetrics)[number]["key"];

type Props = {
  shipper: IyShipperHit | null;
  routeKpis: IyRouteKpis | null;
  isOpen: boolean;
  isLoading: boolean;
  error: string | null;
  onClose: () => void;
  onSaveToCommandCenter?: (shipper: IyShipperHit) => void;
  saveLoading?: boolean;
};

function safe(value: unknown): string {
  if (value == null) return "—";
  const text = String(value).trim();
  return text.length ? text : "—";
}

function formatNumber(value: unknown): string {
  if (value == null) return "—";
  const num = Number(value);
  if (!Number.isFinite(num)) return "—";
  return num.toLocaleString();
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return safe(value);
  return parsed.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function normalizeWebsite(url: string | null | undefined) {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  const href = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const label = trimmed.replace(/^https?:\/\//i, "").replace(/\/$/, "");
  return { href, label };
}

function countryCodeToEmoji(code?: string | null) {
  if (!code) return null;
  const normalized = code.trim().slice(0, 2).toUpperCase();
  if (normalized.length !== 2) return null;
  return normalized
    .split("")
    .map((char) => String.fromCodePoint(127397 + char.charCodeAt(0)))
    .join("");
}

function buildAddress(profile: IyCompanyProfile | null, shipper: IyShipperHit | null) {
  if (profile?.address) return profile.address;
  if (shipper?.address) return shipper.address;
  if (!shipper) return null;
  const parts = [shipper.city, shipper.state, shipper.country]
    .map((part) => (typeof part === "string" ? part.trim() : ""))
    .filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}

function formatMonthKey(value: string) {
  if (!value) return "";
  const normalized = value.length === 7 && value.includes("-") ? `${value}-01` : value;
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString(undefined, { month: "short", year: "numeric" });
}

export default function ShipperDetailModal({
  shipper,
  routeKpis,
  isOpen,
  isLoading,
  error,
  onClose,
  onSaveToCommandCenter,
  saveLoading = false,
}: Props) {
  const [profile, setProfile] = useState<IyCompanyProfile | null>(null);
  const [profileKey, setProfileKey] = useState<string | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [chartMetric, setChartMetric] = useState<ChartMetric>("shipments");

  const shipperKey = shipper?.key ?? null;

  useEffect(() => {
    if (!isOpen || !shipperKey) {
      if (!isOpen) {
        setProfile(null);
        setProfileKey(null);
      }
      setProfileLoading(false);
      setProfileError(null);
      return;
    }

    if (profile && profileKey === shipperKey) return;

    let cancelled = false;
    const controller = new AbortController();
    setProfileLoading(true);
    setProfileError(null);

    getIyCompanyProfile(shipperKey, controller.signal)
      .then((data) => {
        if (!cancelled) {
          setProfile(data);
          setProfileKey(shipperKey);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setProfile(null);
          setProfileKey(null);
          setProfileError(err instanceof Error ? err.message : "Unable to load ImportYeti profile.");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setProfileLoading(false);
        }
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [isOpen, shipperKey, profile, profileKey]);

  if (!isOpen || !shipper) return null;

  const displayTitle = profile?.title ?? shipper.title ?? shipper.name ?? "Company";
  const flagEmoji = countryCodeToEmoji(profile?.countryCode ?? shipper.countryCode);
  const address = buildAddress(profile, shipper);
  const websiteInfo = normalizeWebsite(profile?.website ?? shipper.website ?? shipper.domain);
  const phoneNumber = profile?.phoneNumber ?? shipper.phone ?? null;
  const logoSource =
    profile?.domain ?? shipper.domain ?? profile?.website ?? shipper.website ?? shipper.name;
  const logoUrl = logoSource ? getCompanyLogoUrl(logoSource) : null;
  const importYetiUrl = `https://www.importyeti.com/company/${encodeURIComponent(
    shipper.title || shipper.key,
  )}`;
  const mostRecentShipment = formatDate(
    profile?.lastShipmentDate ?? shipper.lastShipmentDate ?? null,
  );

  const shipmentsValue =
    profile?.shipmentsLast12m ?? routeKpis?.shipmentsLast12m ?? shipper.shipmentsLast12m ?? null;
  const teuValue = profile?.teusLast12m ?? shipper.teusLast12m ?? null;
  const estSpendValue = shipper.estSpendLast12m ?? null;

  const chartData = useMemo(() => {
    if (!profile?.timeseries?.length) return [];
    return [...profile.timeseries]
      .sort((a, b) => a.monthKey.localeCompare(b.monthKey))
      .map((point) => ({
        month: formatMonthKey(point.monthKey),
        shipments: point.shipments,
        teu: point.teu,
      }));
  }, [profile]);

  const shipmentsDenominator =
    routeKpis?.shipmentsLast12m ?? profile?.shipmentsLast12m ?? shipper.shipmentsLast12m ?? 0;

  const topLocations = useMemo(() => {
    const aggregatedOrigins = new Map<string, number>();
    const aggregatedDestinations = new Map<string, number>();

    routeKpis?.topRoutesLast12m?.forEach((route) => {
      if (!route.route) return;
      const [origin, destination] = route.route.split("→").map((part) => part.trim());
      if (origin) {
        aggregatedOrigins.set(origin, (aggregatedOrigins.get(origin) ?? 0) + (route.shipments ?? 0));
      }
      if (destination) {
        aggregatedDestinations.set(
          destination,
          (aggregatedDestinations.get(destination) ?? 0) + (route.shipments ?? 0),
        );
      }
    });

    const computeTop = (map: Map<string, number>) => {
      let bestLabel: string | null = null;
      let bestCount = -1;
      map.forEach((count, key) => {
        if (count > bestCount) {
          bestLabel = key;
          bestCount = count;
        }
      });
      if (!bestLabel) return null;
      return {
        label: bestLabel,
        share:
          shipmentsDenominator > 0
            ? `${Math.round((bestCount / shipmentsDenominator) * 100)}%`
            : "—",
      };
    };

    return {
      origin: computeTop(aggregatedOrigins),
      destination: computeTop(aggregatedDestinations),
    };
  }, [routeKpis, shipmentsDenominator]);

  const chartHasData = chartData.length > 0;
  const chartKey = chartMetric === "shipments" ? "shipments" : "teu";

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-5xl max-h-[95vh] overflow-hidden rounded-2xl bg-white p-0">
        <DialogHeader className="space-y-4 border-b border-slate-100 px-6 py-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-4">
              <CompanyAvatar name={displayTitle} logoUrl={logoUrl ?? undefined} size="lg" />
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <DialogTitle className="text-2xl font-semibold text-slate-900">
                    {displayTitle}
                  </DialogTitle>
                  {flagEmoji && <span className="text-2xl leading-none">{flagEmoji}</span>}
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium uppercase text-slate-600">
                    Company
                  </span>
                </div>
                {address && (
                  <p className="flex items-center gap-1 text-sm text-slate-500">
                    <MapPin className="h-4 w-4 text-indigo-500" />
                    <span>{address}</span>
                  </p>
                )}
                <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
                  {websiteInfo && (
                    <a
                      className="inline-flex items-center gap-1 text-indigo-600 hover:underline"
                      href={websiteInfo.href}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <Globe className="h-3.5 w-3.5" />
                      {websiteInfo.label}
                    </a>
                  )}
                  {phoneNumber && (
                    <span className="inline-flex items-center gap-1">
                      <Phone className="h-3.5 w-3.5 text-indigo-500" />
                      {phoneNumber}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex flex-col items-end gap-2">
              <p className="text-xs uppercase text-slate-500">Most recent shipment</p>
              <p className="text-sm font-semibold text-slate-900">{mostRecentShipment}</p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" asChild>
                  <a href={importYetiUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1">
                    <ExternalLink className="h-3.5 w-3.5" />
                    View in ImportYeti
                  </a>
                </Button>
                {onSaveToCommandCenter && (
                  <Button
                    size="sm"
                    className="bg-indigo-600 text-white hover:bg-indigo-500"
                    onClick={() => onSaveToCommandCenter(shipper)}
                    disabled={saveLoading}
                  >
                    {saveLoading ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : null}
                    Save to Command Center
                  </Button>
                )}
              </div>
            </div>
          </div>
          {(error || profileError) && (
            <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              <AlertCircle className="h-4 w-4" />
              <span>{error ?? profileError}</span>
            </div>
          )}
          {isLoading && (
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading route insights…
            </div>
          )}
        </DialogHeader>

        <div className="space-y-6 overflow-auto px-6 py-5">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <KpiTile label="Shipments (12m)" value={formatNumber(shipmentsValue)} />
            <KpiTile label="TEU (12m)" value={formatNumber(teuValue)} />
            <KpiTile
              label="Est. spend (12m)"
              value={estSpendValue ? `$${formatNumber(estSpendValue)}` : "—"}
            />
            <KpiTile label="Most recent shipment" value={mostRecentShipment} muted />
            <KpiTile
              label="Top origin"
              value={topLocations.origin?.label ?? "—"}
              description={topLocations.origin?.share}
            />
            <KpiTile
              label="Top destination"
              value={topLocations.destination?.label ?? "—"}
              description={topLocations.destination?.share}
            />
          </div>

          <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase text-slate-500 font-semibold">
                  Sea shipments over time
                </p>
                <p className="text-sm font-semibold text-slate-900">ImportYeti timeseries</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {chartMetrics.map((metric) => (
                  <Button
                    key={metric.key}
                    variant={chartMetric === metric.key ? "default" : "outline"}
                    size="sm"
                    className={
                      chartMetric === metric.key
                        ? "bg-indigo-600 text-white hover:bg-indigo-500"
                        : "border-slate-200 text-slate-600"
                    }
                    onClick={() => setChartMetric(metric.key)}
                  >
                    {metric.label}
                  </Button>
                ))}
              </div>
            </div>
            <div className="mt-4 h-72">
              {profileLoading && !chartHasData ? (
                <div className="flex h-full items-center justify-center text-slate-500">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : chartHasData ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis
                      dataKey="month"
                      tickLine={false}
                      axisLine={false}
                      tick={{ fontSize: 12, fill: "#94a3b8" }}
                    />
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(value: number) => formatNumber(value)}
                      tick={{ fontSize: 12, fill: "#94a3b8" }}
                    />
                    <Tooltip
                      formatter={(value: number) => formatNumber(value)}
                      labelFormatter={(label) => label}
                    />
                    <Bar dataKey={chartKey} fill="#4f46e5" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-slate-500">
                  No timeseries data yet for this company.
                </div>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
            Deeper profile, contact enrichment, and lane analytics will appear in Command Center
            after saving this shipper.
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

type KpiTileProps = {
  label: string;
  value: string;
  description?: string | null;
  muted?: boolean;
};

function KpiTile({ label, value, description, muted }: KpiTileProps) {
  return (
    <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
      <p className="text-[11px] font-semibold uppercase text-slate-500">{label}</p>
      <p className={`text-lg font-semibold ${muted ? "text-slate-600" : "text-slate-900"}`}>
        {value}
      </p>
      {description && <p className="text-xs text-slate-500">{description}</p>}
    </div>
  );
}
