import React, { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { CompanyAvatar } from "@/components/CompanyAvatar";
import { MapPin, Calendar, Package, Ship, Info, Globe, Phone } from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { IyCompanyProfile, IyShipperSearchRow } from "@/lib/api";
import { getIyCompanyProfile } from "@/lib/api";
import { getCompanyLogoUrl } from "@/lib/logo";

type ChartMode = "shipments" | "teu" | "chinaShipments" | "chinaTeu";

type ShipperDetailModalProps = {
  shipper: IyShipperSearchRow | null;
  open: boolean;
  onClose: () => void;
  topRoute?: string | null;
  recentRoute?: string | null;
  onSave?: (shipper: IyShipperSearchRow) => void | Promise<void>;
  saving?: boolean;
};

const chartModeOptions: Array<{ key: ChartMode; label: string }> = [
  { key: "shipments", label: "Shipments" },
  { key: "teu", label: "TEUs" },
  { key: "chinaShipments", label: "China shipments" },
  { key: "chinaTeu", label: "China TEUs" },
];

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
  return parsed.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function normalizeWebsite(url: string | null | undefined): { href: string; label: string } | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  const href = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const label = trimmed.replace(/^https?:\/\//i, "").replace(/\/$/, "");
  return { href, label };
}

function countryCodeToEmoji(code: string | null | undefined): string | null {
  if (!code) return null;
  const normalized = code.trim().slice(0, 2).toUpperCase();
  if (normalized.length !== 2) return null;
  return normalized
    .split("")
    .map((char) => String.fromCodePoint(127397 + char.charCodeAt(0)))
    .join("");
}

function ensureCompanyKeyLocal(value: unknown): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  return trimmed.startsWith("company/") ? trimmed : `company/${trimmed}`;
}

function resolveCompanyId(shipper: IyShipperSearchRow | null): string | null {
  if (!shipper) return null;
  return ensureCompanyKeyLocal(shipper.companyId);
}

function buildAddress(
  profile: IyCompanyProfile | null,
  shipper: IyShipperSearchRow | null,
): string | null {
  if (profile?.address) return profile.address;
  if (shipper?.address) return shipper.address;
  if (!shipper) return null;
  const parts = [shipper.city, shipper.state, shipper.postalCode, shipper.country]
    .map((part) => (typeof part === "string" ? part.trim() : ""))
    .filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}

function formatMonthKey(value: string): string {
  if (!value) return "";
  const normalized = value.length === 7 && value.includes("-") ? `${value}-01` : value;
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString(undefined, { month: "short", year: "numeric" });
}

export default function ShipperDetailModal({
  shipper,
  open,
  onClose,
  topRoute,
  recentRoute,
  onSave,
  saving = false,
}: ShipperDetailModalProps) {
  const [profile, setProfile] = useState<IyCompanyProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [chartMode, setChartMode] = useState<ChartMode>("shipments");

  useEffect(() => {
    if (!open || !shipper) {
      setProfile(null);
      setError(null);
      setLoading(false);
      return;
    }
    const companyId = resolveCompanyId(shipper);
    if (!companyId) {
      setError("Missing company id for ImportYeti profile");
      setProfile(null);
      return;
    }
    setProfile(null);

    let cancelled = false;
    const controller = new AbortController();

    async function load() {
      try {
        setLoading(true);
        setError(null);
        const data = await getIyCompanyProfile(companyId, controller.signal);
        if (!cancelled) {
          setProfile(data);
        }
      } catch (err) {
        if (!cancelled) {
          const message =
            err instanceof Error
              ? err.message
              : "Unable to load ImportYeti company profile";
          setError(message);
          setProfile(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    load();

    return () => {
      cancelled = true;
      controller.abort();
    };
    }, [open, shipper?.companyId]);

  if (!open || !shipper) return null;

  const displayTitle =
    profile?.title ?? shipper.normalizedName ?? shipper.name ?? "Company";
  const flagEmoji = countryCodeToEmoji(profile?.countryCode ?? shipper.countryCode);
  const address = buildAddress(profile, shipper);
  const websiteInfo = normalizeWebsite(profile?.website ?? shipper.website ?? shipper.domain);
  const phoneNumber = profile?.phoneNumber ?? shipper.phone ?? null;
  const logoSource =
    profile?.domain ?? shipper.domain ?? profile?.website ?? shipper.website ?? shipper.name;
  const logoUrl = logoSource ? getCompanyLogoUrl(logoSource) : null;
  const totalShipments = formatNumber(
    profile?.totalShipments ?? shipper.totalShipments ?? shipper.shipmentsLast12m,
  );
  const shipmentsLast12m = formatNumber(profile?.shipmentsLast12m ?? shipper.shipmentsLast12m);
  const teusLast12m = formatNumber(profile?.teusLast12m ?? shipper.teusLast12m);
  const lastShipmentDate = formatDate(profile?.lastShipmentDate ?? shipper.lastShipmentDate);
  const chartPoints = useMemo(() => {
    if (!profile?.timeseries?.length) return [];
    const series = [...profile.timeseries];
    series.sort((a, b) => a.monthKey.localeCompare(b.monthKey));
    return series.map((point) => {
      let value = 0;
      if (chartMode === "shipments") value = point.shipments;
      if (chartMode === "teu") value = point.teu;
      if (chartMode === "chinaShipments") value = point.chinaShipments;
      if (chartMode === "chinaTeu") value = point.chinaTeu;
      return { label: formatMonthKey(point.monthKey), value };
    });
  }, [chartMode, profile]);
  const hasChartData = chartPoints.length > 0;
  const topLocations = (profile?.locations ?? []).slice(0, 4);
  const routeInsightsAvailable = Boolean(topRoute || recentRoute);

  const handleSaveClick = async () => {
    if (!onSave) return;
    await onSave(shipper);
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-4xl max-h-[95vh] bg-white rounded-2xl p-0 flex flex-col">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-slate-100">
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex items-start gap-4">
                <CompanyAvatar name={displayTitle} logoUrl={logoUrl ?? undefined} size="lg" />
                <div className="min-w-0 space-y-2">
                  <div className="flex items-center gap-2">
                    {flagEmoji && <span className="text-2xl">{flagEmoji}</span>}
                    <DialogTitle
                      className="text-2xl font-semibold text-slate-900 truncate"
                      title={displayTitle}
                    >
                      {displayTitle}
                    </DialogTitle>
                  </div>
                  <div className="space-y-1 text-sm text-slate-600">
                    {websiteInfo && (
                      <a
                        href={websiteInfo.href}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-2 text-indigo-600 hover:underline"
                      >
                        <Globe className="h-4 w-4" />
                        <span className="truncate">{websiteInfo.label}</span>
                      </a>
                    )}
                    {phoneNumber && (
                      <div className="flex items-center gap-2">
                        <Phone className="h-4 w-4 text-indigo-500" />
                        <span>{phoneNumber}</span>
                      </div>
                    )}
                    {address && (
                      <div className="flex items-start gap-2">
                        <MapPin className="h-4 w-4 mt-0.5 text-indigo-500" />
                        <span className="truncate">{address}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {onSave && (
                  <Button
                    size="sm"
                    onClick={handleSaveClick}
                    disabled={saving}
                    className="rounded-full bg-indigo-600 text-xs font-semibold text-white px-4 py-2 hover:bg-indigo-500 disabled:opacity-60 disabled:cursor-not-allowed"
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
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col">
          <Tabs defaultValue="overview" className="flex-1 flex flex-col">
            <div className="px-6 border-b border-slate-100">
              <TabsList className="h-11 gap-2 bg-transparent p-0">
                <TabsTrigger
                  value="overview"
                  className="px-3 py-2 text-xs font-semibold text-slate-500 data-[state=active]:text-indigo-600 data-[state=active]:border-b-2 data-[state=active]:border-indigo-600 rounded-none border-b-2 border-transparent"
                >
                  Overview
                </TabsTrigger>
              </TabsList>
            </div>

              <div className="flex-1 overflow-auto">
                <TabsContent value="overview" className="p-6 space-y-5">
                  {error && (
                    <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                      {error}
                    </div>
                  )}
                  {!loading && !error && !profile && (
                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                      No ImportYeti profile found for this shipper. Showing available search data instead.
                    </div>
                  )}

                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                    <KpiCard icon={Ship} label="Total shipments" value={totalShipments} sublabel="lifetime" />
                    <KpiCard icon={Ship} label="Shipments (last 12m)" value={shipmentsLast12m} />
                    <KpiCard icon={Package} label="TEUs (last 12m)" value={teusLast12m} />
                    <KpiCard icon={Calendar} label="Most recent shipment" value={lastShipmentDate} />
                  </div>

                  {routeInsightsAvailable && (
                    <div className="rounded-xl border border-slate-100 bg-white px-4 py-4 space-y-3">
                      <div className="text-xs font-semibold uppercase text-slate-500">
                        Route insights
                      </div>
                      <div className="grid gap-4 sm:grid-cols-2">
                        {topRoute && (
                          <div>
                            <div className="text-xs text-slate-500">Top route (12m)</div>
                            <div className="text-base font-semibold text-slate-900">
                              {safe(topRoute)}
                            </div>
                          </div>
                        )}
                        {recentRoute && (
                          <div>
                            <div className="text-xs text-slate-500">Recent lane</div>
                            <div className="text-base font-semibold text-slate-900">
                              {safe(recentRoute)}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                <div className="rounded-2xl border border-slate-100 bg-white p-4 space-y-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                      <div className="text-xs uppercase text-slate-500 font-semibold">
                        Volume trend
                      </div>
                      <div className="text-base font-semibold text-slate-900">
                        ImportYeti timeseries
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {chartModeOptions.map((option) => (
                        <Button
                          key={option.key}
                          variant={chartMode === option.key ? "default" : "outline"}
                          size="sm"
                          className={
                            chartMode === option.key
                              ? "bg-indigo-600 hover:bg-indigo-500 text-white"
                              : "bg-white text-slate-600 border-slate-200"
                          }
                          onClick={() => setChartMode(option.key)}
                        >
                          {option.label}
                        </Button>
                      ))}
                    </div>
                  </div>
                  <div className="h-72">
                    {loading && !profile && (
                      <div className="flex h-full items-center justify-center">
                        <span className="h-6 w-6 animate-spin rounded-full border-2 border-slate-300 border-t-indigo-500" />
                      </div>
                    )}
                    {!loading && hasChartData && (
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart
                          data={chartPoints}
                          margin={{ top: 10, right: 16, left: -14, bottom: 0 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                          <XAxis
                            dataKey="label"
                            tickLine={false}
                            axisLine={false}
                            tick={{ fontSize: 12, fill: "#64748b" }}
                          />
                          <YAxis
                            tickLine={false}
                            axisLine={false}
                            tickFormatter={(value: number) => formatNumber(value)}
                            tick={{ fontSize: 12, fill: "#64748b" }}
                            width={70}
                          />
                          <Tooltip
                            formatter={(value: number) => formatNumber(value)}
                            labelFormatter={(label) => label}
                          />
                          <Line
                            type="monotone"
                            dataKey="value"
                            stroke="#4f46e5"
                            strokeWidth={2}
                            dot={false}
                            activeDot={{ r: 4 }}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    )}
                    {!loading && !hasChartData && (
                      <div className="flex h-full items-center justify-center text-sm text-slate-500">
                        No timeseries data yet for this company.
                      </div>
                    )}
                  </div>
                </div>

                {topLocations.length > 0 && (
                  <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 space-y-3">
                    <div className="text-xs uppercase text-slate-500 font-semibold">
                      Locations ({topLocations.length})
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      {topLocations.map((location, idx) => (
                        <div key={`${location.address}-${idx}`} className="rounded-xl bg-white p-3 shadow-sm border border-slate-100">
                          <div className="text-sm font-semibold text-slate-900">
                            {safe(location.address)}
                          </div>
                          <div className="text-xs text-slate-500 mt-1">
                            Most recent shipment to{" "}
                            <span className="font-medium text-slate-700">
                              {safe(location.mostRecentShipmentTo)}
                            </span>
                          </div>
                          {(location.emails?.length || location.phoneNumbers?.length) && (
                            <div className="mt-2 text-xs text-slate-600 space-y-1">
                              {location.emails?.length ? (
                                <div>Email: {location.emails[0]}</div>
                              ) : null}
                              {location.phoneNumbers?.length ? (
                                <div>Phone: {location.phoneNumbers[0]}</div>
                              ) : null}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="rounded-xl border border-indigo-50 bg-indigo-50/60 px-4 py-3 flex gap-2 text-xs text-slate-700">
                  <Info className="h-4 w-4 mt-0.5 text-indigo-500" />
                  <p>
                    ImportYeti company profiles power this view. Save the shipper to Command Center to
                    unlock AI briefings, contact enrichment, and multi-lane summaries.
                  </p>
                </div>
              </TabsContent>
            </div>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
}

type KpiCardProps = {
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  label: string;
  value: string;
  sublabel?: string;
};

function KpiCard({ icon: Icon, label, value, sublabel }: KpiCardProps) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 flex items-start gap-3">
      <Icon className="h-5 w-5 text-indigo-500" />
      <div>
        <div className="text-xs font-semibold uppercase text-slate-500">{label}</div>
        <div className="text-lg font-semibold text-slate-900">{value}</div>
        {sublabel && <div className="text-xs text-slate-500">{sublabel}</div>}
      </div>
    </div>
  );
}
