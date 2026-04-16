import React, { useMemo, useState } from "react";
import {
  X,
  Bookmark,
  MapPin,
  Globe,
  Phone,
  Package2,
  Route,
  Truck,
  CalendarDays,
  BarChart3,
  ShipWheel,
  Boxes,
  ChevronRight,
  FileText,
} from "lucide-react";
import {
  BarChart,
  Bar,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CompanyAvatar } from "@/components/CompanyAvatar";
import { getCompanyLogoUrl } from "@/lib/logo";
import {
  type IyCompanyProfile,
  type IyRouteKpis,
} from "@/lib/api";
import { formatUserFriendlyDate } from "@/lib/dateUtils";

type SearchPreviewShipper = {
  id?: string;
  key?: string;
  companyId?: string;
  company_id?: string;
  importyeti_key?: string;
  name?: string;
  title?: string;
  website?: string;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  country_code?: string;
  last_shipment?: string;
  shipments?: number;
  shipments_12m?: number;
  teu_estimate?: number;
  top_suppliers?: string[];
};

type ShipmentRow = {
  date: string | null;
  bol: string | null;
  route: string | null;
  origin: string | null;
  destination: string | null;
  teu: number | null;
};

type Props = {
  isOpen: boolean;
  shipper: SearchPreviewShipper | null;
  profile: IyCompanyProfile | null;
  routeKpis: IyRouteKpis | null;
  enrichment?: any | null;
  loadingProfile?: boolean;
  saveLoading?: boolean;
  isSaved?: boolean;
  year?: number;
  error?: string | null;
  onClose: () => void;
  onSaveToCommandCenter?: () => void;
};

type TabKey = "overview" | "routes" | "shipments";

function safeNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const cleaned = value.replace(/,/g, "").trim();
    if (!cleaned) return null;
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function titleCaseMonth(monthKey: string): string {
  if (!monthKey) return "";
  if (/^\d{4}-\d{2}$/.test(monthKey)) {
    const [year, month] = monthKey.split("-");
    const date = new Date(Number(year), Number(month) - 1, 1);
    return date.toLocaleString("en-US", { month: "short" });
  }
  return monthKey;
}

function compactNumber(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: value >= 100 ? 0 : 1,
  }).format(value);
}

function fullNumber(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-US").format(value);
}

function currencyCompact(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

function buildLocationLine(shipper: SearchPreviewShipper, profile: IyCompanyProfile | null): string {
  const address =
    profile?.address ||
    shipper?.address ||
    [shipper?.city, shipper?.state, shipper?.country].filter(Boolean).join(", ");

  return address || "Location unavailable";
}

function buildWebsite(shipper: SearchPreviewShipper, profile: IyCompanyProfile | null): string | null {
  return profile?.website || shipper?.website || profile?.domain || null;
}

function buildPhone(profile: IyCompanyProfile | null): string | null {
  return (profile as any)?.phoneNumber || (profile as any)?.phone || null;
}

function buildShipments12m(shipper: SearchPreviewShipper, profile: IyCompanyProfile | null, routeKpis: IyRouteKpis | null): number | null {
  return (
    safeNumber(routeKpis?.shipmentsLast12m) ??
    safeNumber(profile?.routeKpis?.shipmentsLast12m) ??
    safeNumber(shipper?.shipments_12m) ??
    safeNumber(shipper?.shipments) ??
    safeNumber(profile?.totalShipments) ??
    null
  );
}

function buildTeu12m(shipper: SearchPreviewShipper, profile: IyCompanyProfile | null, routeKpis: IyRouteKpis | null): number | null {
  return (
    safeNumber(routeKpis?.teuLast12m) ??
    safeNumber(profile?.routeKpis?.teuLast12m) ??
    safeNumber(shipper?.teu_estimate) ??
    null
  );
}

function buildFclLcl(profile: IyCompanyProfile | null): string {
  const fcl12m =
    safeNumber((profile as any)?.containers?.fclShipments12m) ??
    safeNumber((profile as any)?.fcl_count_12m) ??
    0;
  const lcl12m =
    safeNumber((profile as any)?.containers?.lclShipments12m) ??
    safeNumber((profile as any)?.lcl_count_12m) ??
    0;

  if (!fcl12m && !lcl12m) {
    const fclAllTime = safeNumber((profile as any)?.fcl_shipments_all_time);
    const lclAllTime = safeNumber((profile as any)?.lcl_shipments_all_time);
    if (fclAllTime != null || lclAllTime != null) {
      return `${fullNumber(fclAllTime ?? 0)} / ${fullNumber(lclAllTime ?? 0)}`;
    }
    return "—";
  }

  return `${fullNumber(fcl12m)} / ${fullNumber(lcl12m)}`;
}

function buildLastShipment(shipper: SearchPreviewShipper, profile: IyCompanyProfile | null): string | null {
  return (
    profile?.lastShipmentDate ||
    shipper?.last_shipment ||
    null
  );
}

function buildMonthlyChartData(profile: IyCompanyProfile | null, selectedYear?: number) {
  const monthlyTotals = Array.isArray((profile as any)?.monthly_totals)
    ? (profile as any).monthly_totals
    : [];

  if (monthlyTotals.length > 0) {
    return monthlyTotals
      .filter((row: any) => !selectedYear || Number(row?.year) === Number(selectedYear))
      .map((row: any) => {
        const total = safeNumber(row?.shipments) ?? 0;
        const fcl = safeNumber(row?.fcl_shipments ?? row?.fcl) ?? Math.round(total * 0.65);
        const lcl = safeNumber(row?.lcl_shipments ?? row?.lcl) ?? Math.max(0, total - fcl);
        return {
          month: titleCaseMonth(`${row?.year}-${String(row?.month).padStart(2, "0")}`),
          shipments: total,
          teu: safeNumber(row?.teu) ?? 0,
          fcl,
          lcl,
        };
      });
  }

  const timeSeries = Array.isArray(profile?.timeSeries) ? profile.timeSeries : [];
  return timeSeries
    .filter((row: any) => !selectedYear || Number(row?.year) === Number(selectedYear))
    .map((row: any) => {
      const total = safeNumber(row?.shipments) ?? 0;
      const fcl = safeNumber(row?.fcl_shipments ?? row?.fcl) ?? Math.round(total * 0.65);
      const lcl = safeNumber(row?.lcl_shipments ?? row?.lcl) ?? Math.max(0, total - fcl);
      return {
        month: titleCaseMonth(row?.month || ""),
        shipments: total,
        teu: safeNumber(row?.teu) ?? 0,
        fcl,
        lcl,
      };
    });
}

function buildRoutes(profile: IyCompanyProfile | null, routeKpis: IyRouteKpis | null) {
  const source =
    routeKpis?.topRoutesLast12m ||
    profile?.routeKpis?.topRoutesLast12m ||
    (Array.isArray((profile as any)?.top_routes) ? (profile as any).top_routes : []);

  return (Array.isArray(source) ? source : [])
    .map((row: any) => ({
      route: row?.route || "Unknown route",
      shipments: safeNumber(row?.shipments) ?? 0,
      teu: safeNumber(row?.teu) ?? 0,
      fcl: safeNumber(row?.fclShipments ?? row?.fcl_shipments) ?? 0,
      lcl: safeNumber(row?.lclShipments ?? row?.lcl_shipments) ?? 0,
    }))
    .filter((row) => row.route && row.route !== "Unknown → Unknown");
}

function buildShipmentRows(profile: IyCompanyProfile | null): ShipmentRow[] {
  const recentBols = Array.isArray((profile as any)?.recent_bols)
    ? (profile as any).recent_bols
    : Array.isArray(profile?.recentBols)
      ? profile.recentBols
      : [];

  return recentBols.map((row: any) => {
    const raw = row?.raw || row || {};
    const date =
      row?.date ||
      raw?.date_formatted ||
      raw?.date ||
      raw?.arrival_date ||
      null;

    const route =
      row?.route ||
      raw?.shipping_route ||
      raw?.route ||
      null;

    const origin =
      row?.origin ||
      raw?.origin_port ||
      raw?.origin ||
      raw?.supplier_address_loc ||
      raw?.origin_city ||
      null;

    const destination =
      row?.destination ||
      raw?.destination_port ||
      raw?.destination ||
      raw?.company_address_loc ||
      raw?.destination_city ||
      null;

    return {
      date,
      bol:
        row?.bolNumber ||
        raw?.bol_number ||
        raw?.bol ||
        raw?.bill_of_lading_number ||
        null,
      route,
      origin,
      destination,
      teu:
        safeNumber(row?.teu) ??
        safeNumber(raw?.TEU) ??
        safeNumber(raw?.teu) ??
        safeNumber(raw?.total_teu) ??
        null,
    };
  });
}

function buildSuppliers(shipper: SearchPreviewShipper, profile: IyCompanyProfile | null): string[] {
  const profileSuppliers = Array.isArray(profile?.topSuppliers) ? profile.topSuppliers : [];
  const shipperSuppliers = Array.isArray(shipper?.top_suppliers) ? shipper.top_suppliers : [];
  return [...new Set([...profileSuppliers, ...shipperSuppliers])].filter(Boolean).slice(0, 6);
}

function KpiCard({
  icon,
  label,
  value,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  accent: string;
}) {
  return (
    <div className={`group rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md ${accent}`}>
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
        {icon}
        <span>{label}</span>
      </div>
      <div className="mt-3 text-2xl font-semibold tracking-tight text-slate-900">{value}</div>
    </div>
  );
}

export default function ShipperDetailModal({
  isOpen,
  shipper,
  profile,
  routeKpis,
  loadingProfile = false,
  saveLoading = false,
  isSaved = false,
  year,
  error,
  onClose,
  onSaveToCommandCenter,
}: Props) {
  const [activeTab, setActiveTab] = useState<TabKey>("overview");

  const companyName = shipper?.name || shipper?.title || profile?.title || "Company";
  const website = buildWebsite(shipper || {}, profile);
  const phone = buildPhone(profile);
  const locationLine = buildLocationLine(shipper || {}, profile);

  const shipments12m = buildShipments12m(shipper || {}, profile, routeKpis);
  const teu12m = buildTeu12m(shipper || {}, profile, routeKpis);
  const fclLcl = buildFclLcl(profile);
  const lastShipment = buildLastShipment(shipper || {}, profile);

  const chartData = useMemo(
    () => buildMonthlyChartData(profile, year),
    [profile, year],
  );

  const routeRows = useMemo(
    () => buildRoutes(profile, routeKpis),
    [profile, routeKpis],
  );

  const shipmentRows = useMemo(
    () => buildShipmentRows(profile),
    [profile],
  );

  const suppliers = useMemo(
    () => buildSuppliers(shipper || {}, profile),
    [shipper, profile],
  );

  const topContainer =
    (profile as any)?.top_container_length ||
    "—";

  const estSpend12m =
    safeNumber(routeKpis?.estSpendUsd12m) ??
    safeNumber(profile?.estSpendUsd12m) ??
    safeNumber((profile as any)?.estSpendUsd) ??
    null;

  const topRoute =
    routeKpis?.topRouteLast12m ||
    profile?.routeKpis?.topRouteLast12m ||
    "—";

  const mostRecentRoute =
    routeKpis?.mostRecentRoute ||
    profile?.routeKpis?.mostRecentRoute ||
    "—";

  if (!isOpen || !shipper) return null;

  const tabButtonClass = (tab: TabKey) =>
    `inline-flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition ${
      activeTab === tab
        ? "bg-indigo-600 text-white shadow-sm"
        : "bg-white text-slate-600 hover:bg-indigo-50 hover:text-indigo-700"
    }`;

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-950/45 p-0 sm:items-center sm:p-4">
      <div className="flex h-[96vh] w-full max-w-6xl flex-col overflow-hidden rounded-t-3xl border border-slate-200 bg-slate-50 shadow-2xl sm:h-[90vh] sm:rounded-3xl">
        <div className="border-b border-slate-200 bg-white px-4 py-3 sm:px-6 sm:py-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-3">
              <CompanyAvatar
                name={companyName}
                logoUrl={getCompanyLogoUrl(website || undefined)}
                size="md"
                className="mt-0.5 shrink-0"
              />

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="truncate text-lg font-semibold tracking-tight text-slate-900 sm:text-2xl">
                    {companyName}
                  </h2>
                  <span className="shrink-0 text-xs font-medium uppercase tracking-wide text-slate-500 sm:text-sm">
                    {shipper?.country_code || (profile as any)?.countryCode || "US"}
                  </span>
                </div>

                <div className="mt-1 flex flex-col gap-1 text-xs text-slate-500 sm:mt-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-4 sm:gap-y-1 sm:text-sm">
                  <div className="inline-flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                    <span className="truncate">{locationLine}</span>
                  </div>

                  {website && (
                    <div className="inline-flex items-center gap-1">
                      <Globe className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                      <span className="truncate">{website.replace(/^https?:\/\//, "")}</span>
                    </div>
                  )}

                  {phone && (
                    <div className="inline-flex items-center gap-1">
                      <Phone className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                      <span>{phone}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="hidden rounded-xl border-slate-200 bg-white text-slate-700 hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 sm:inline-flex"
                onClick={onSaveToCommandCenter}
                disabled={saveLoading || isSaved}
              >
                <Bookmark className={`mr-2 h-4 w-4 ${isSaved ? "fill-current" : ""}`} />
                {isSaved ? "Saved" : "Save"}
              </Button>
              <button
                type="button"
                onClick={onSaveToCommandCenter}
                disabled={saveLoading || isSaved}
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-500 transition hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 sm:hidden"
              >
                <Bookmark className={`h-4 w-4 ${isSaved ? "fill-current text-indigo-600" : ""}`} />
              </button>

              <button
                type="button"
                onClick={onClose}
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>

        <div className="border-b border-slate-200 bg-slate-50 px-4 py-3 sm:px-6">
          <div className="flex flex-wrap gap-2">
            <button type="button" className={tabButtonClass("overview")} onClick={() => setActiveTab("overview")}>
              <BarChart3 className="h-4 w-4" />
              Overview
            </button>
            <button type="button" className={tabButtonClass("routes")} onClick={() => setActiveTab("routes")}>
              <Route className="h-4 w-4" />
              Routes
            </button>
            <button type="button" className={tabButtonClass("shipments")} onClick={() => setActiveTab("shipments")}>
              <Truck className="h-4 w-4" />
              Shipments
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-6">
          {loadingProfile ? (
            <div className="rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
              <div className="text-base font-medium text-slate-900">Loading company preview...</div>
              <div className="mt-2 text-sm text-slate-500">Pulling trade intelligence and KPI snapshot.</div>
            </div>
          ) : error ? (
            <div className="rounded-3xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-700">
              {error}
            </div>
          ) : activeTab === "overview" ? (
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <KpiCard
                  icon={<Package2 className="h-4 w-4 text-indigo-500" />}
                  label="Shipments 12m"
                  value={fullNumber(shipments12m)}
                  accent="hover:bg-indigo-50/60"
                />
                <KpiCard
                  icon={<ShipWheel className="h-4 w-4 text-cyan-500" />}
                  label="TEU 12m"
                  value={fullNumber(teu12m)}
                  accent="hover:bg-cyan-50/60"
                />
                <KpiCard
                  icon={<Boxes className="h-4 w-4 text-violet-500" />}
                  label="FCL / LCL"
                  value={fclLcl}
                  accent="hover:bg-violet-50/60"
                />
                <KpiCard
                  icon={<CalendarDays className="h-4 w-4 text-emerald-500" />}
                  label="Last shipment"
                  value={lastShipment ? formatUserFriendlyDate(lastShipment) : "—"}
                  accent="hover:bg-emerald-50/60"
                />
              </div>

              <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,2fr)_360px]">
                <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="mb-4 flex items-center justify-between">
                    <div>
                      <div className="inline-flex items-center gap-2 text-lg font-semibold text-slate-900">
                        <BarChart3 className="h-5 w-5 text-indigo-500" />
                        Monthly activity
                      </div>
                      <div className="mt-1 text-sm text-slate-500">
                        {year ? `Year ${year}` : "Latest 12-month activity"} · Shipments by month
                      </div>
                    </div>
                    <Badge variant="outline" className="rounded-full border-indigo-200 bg-indigo-50 text-indigo-700">
                      Preview
                    </Badge>
                  </div>

                  <div className="mb-3 flex items-center gap-4 text-xs text-slate-500">
                    <span className="flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: "#2563EB" }} />
                      FCL
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: "#EA580C" }} />
                      LCL
                    </span>
                  </div>
                  <div className="h-[240px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartData} barCategoryGap="30%">
                        <CartesianGrid vertical={false} strokeDasharray="3 3" />
                        <XAxis
                          dataKey="month"
                          tickLine={false}
                          axisLine={false}
                          tick={{ fontSize: 11 }}
                        />
                        <YAxis
                          tickLine={false}
                          axisLine={false}
                          tick={{ fontSize: 11 }}
                        />
                        <RechartsTooltip
                          cursor={{ fill: "rgba(0,0,0,0.04)" }}
                          formatter={(value: any, name: any) => [
                            fullNumber(safeNumber(value)),
                            name === "fcl" ? "FCL Shipments" : "LCL Shipments",
                          ]}
                        />
                        <Bar dataKey="fcl" stackId="a" fill="#2563EB" radius={[0, 0, 0, 0]} />
                        <Bar dataKey="lcl" stackId="a" fill="#EA580C" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="text-lg font-semibold text-slate-900">Snapshot</div>

                  <div className="mt-5 space-y-5">
                    <div>
                      <div className="text-sm text-slate-500">Estimated spend 12m</div>
                      <div className="mt-1 text-3xl font-semibold tracking-tight text-slate-900">
                        {currencyCompact(estSpend12m)}
                      </div>
                    </div>

                    <div>
                      <div className="text-sm text-slate-500">Top route</div>
                      <div className="mt-1 text-base font-medium leading-7 text-slate-900">{topRoute}</div>
                    </div>

                    <div>
                      <div className="text-sm text-slate-500">Most recent route</div>
                      <div className="mt-1 text-base font-medium leading-7 text-slate-900">{mostRecentRoute}</div>
                    </div>

                    <div>
                      <div className="text-sm text-slate-500">Top container</div>
                      <div className="mt-1 text-base font-medium text-slate-900">{topContainer}</div>
                    </div>

                    <div>
                      <div className="text-sm text-slate-500">Suppliers</div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {suppliers.length > 0 ? (
                          suppliers.map((supplier) => (
                            <Badge
                              key={supplier}
                              variant="outline"
                              className="rounded-full border-slate-200 bg-slate-50 px-3 py-1 text-slate-700"
                            >
                              {supplier}
                            </Badge>
                          ))
                        ) : (
                          <div className="text-sm text-slate-400">No supplier data</div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : activeTab === "routes" ? (
            <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,2fr)_340px]">
              <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-4 inline-flex items-center gap-2 text-lg font-semibold text-slate-900">
                  <Route className="h-5 w-5 text-indigo-500" />
                  Top routes
                </div>

                <div className="space-y-3">
                  {routeRows.length > 0 ? (
                    routeRows.map((route, index) => (
                      <div
                        key={`${route.route}-${index}`}
                        className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-4 transition hover:border-indigo-200 hover:bg-indigo-50/60"
                      >
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <div className="min-w-0">
                            <div className="flex items-start gap-2">
                              <div className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-indigo-700">
                                <ChevronRight className="h-4 w-4" />
                              </div>
                              <div className="min-w-0">
                                <div className="text-base font-semibold leading-6 text-slate-900">
                                  {route.route}
                                </div>
                                <div className="mt-1 flex flex-wrap gap-2">
                                  <Badge className="rounded-full bg-indigo-100 text-indigo-700 hover:bg-indigo-100">
                                    {fullNumber(route.shipments)} shipments
                                  </Badge>
                                  <Badge className="rounded-full bg-cyan-100 text-cyan-700 hover:bg-cyan-100">
                                    {fullNumber(route.teu)} TEU
                                  </Badge>
                                  {(route.fcl > 0 || route.lcl > 0) && (
                                    <Badge className="rounded-full bg-violet-100 text-violet-700 hover:bg-violet-100">
                                      FCL {fullNumber(route.fcl)} · LCL {fullNumber(route.lcl)}
                                    </Badge>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
                      No route breakdown available for this company yet.
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="text-lg font-semibold text-slate-900">Route KPIs</div>

                <div className="mt-5 space-y-5">
                  <div>
                    <div className="text-sm text-slate-500">Top route 12m</div>
                    <div className="mt-1 text-base font-medium leading-7 text-slate-900">{topRoute}</div>
                  </div>

                  <div>
                    <div className="text-sm text-slate-500">Most recent route</div>
                    <div className="mt-1 text-base font-medium leading-7 text-slate-900">{mostRecentRoute}</div>
                  </div>

                  <div>
                    <div className="text-sm text-slate-500">Sample size</div>
                    <div className="mt-1 text-2xl font-semibold text-slate-900">
                      {fullNumber(safeNumber(routeKpis?.sampleSize ?? profile?.routeKpis?.sampleSize))}
                    </div>
                  </div>

                  <div>
                    <div className="text-sm text-slate-500">Shipments 12m</div>
                    <div className="mt-1 text-2xl font-semibold text-slate-900">
                      {fullNumber(shipments12m)}
                    </div>
                  </div>

                  <div>
                    <div className="text-sm text-slate-500">TEU 12m</div>
                    <div className="mt-1 text-2xl font-semibold text-slate-900">
                      {fullNumber(teu12m)}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4 inline-flex items-center gap-2 text-lg font-semibold text-slate-900">
                <FileText className="h-5 w-5 text-indigo-500" />
                Recent shipment records
              </div>

              <div className="overflow-hidden rounded-2xl border border-slate-200">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[860px]">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                          Date
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                          BOL
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                          Route
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                          Origin
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                          Destination
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                          TEU
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {shipmentRows.length > 0 ? (
                        shipmentRows.map((row, index) => (
                          <tr key={`${row.bol || row.date || "shipment"}-${index}`} className="hover:bg-indigo-50/40">
                            <td className="px-4 py-3 text-sm text-slate-700">
                              {row.date ? formatUserFriendlyDate(row.date) : "—"}
                            </td>
                            <td className="px-4 py-3 text-sm font-medium text-slate-900">
                              {row.bol || "—"}
                            </td>
                            <td className="px-4 py-3 text-sm text-slate-700">
                              {row.route || "—"}
                            </td>
                            <td className="px-4 py-3 text-sm text-slate-700">
                              {row.origin || "—"}
                            </td>
                            <td className="px-4 py-3 text-sm text-slate-700">
                              {row.destination || "—"}
                            </td>
                            <td className="px-4 py-3 text-sm font-medium text-slate-900">
                              {row.teu != null ? fullNumber(row.teu) : "—"}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={6} className="px-4 py-10 text-center text-sm text-slate-500">
                            No shipment rows available.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="mt-4 text-xs text-slate-500">
                Preview only. Save to Command Center to work with the full company intelligence record.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
