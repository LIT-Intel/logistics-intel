import React, { useMemo, useState } from "react";
import {
  X,
  Building2,
  MapPin,
  Globe,
  Phone,
  Bookmark,
  BookmarkPlus,
  Loader2,
  Package,
  TrendingUp,
  Route,
  Truck,
  Calendar,
  Users,
  BarChart3,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
} from "recharts";
import { CompanyAvatar } from "@/components/CompanyAvatar";
import { getCompanyLogoUrl } from "@/lib/logo";
import {
  type IyCompanyProfile,
  type IyRouteKpis,
  getFclShipments12m,
  getLclShipments12m,
} from "@/lib/api";
import { formatUserFriendlyDate, getDateBadgeInfo } from "@/lib/dateUtils";

type ShipperLike = {
  id?: string;
  key?: string;
  companyId?: string;
  company_id?: string;
  importyeti_key?: string;
  name?: string;
  title?: string;
  website?: string;
  domain?: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  country_code?: string;
  countryCode?: string;
  shipments?: number;
  shipments_12m?: number;
  totalShipments?: number;
  teu_estimate?: number;
  top_suppliers?: string[];
  topSuppliers?: string[];
  last_shipment?: string;
  lastShipmentDate?: string;
  mostRecentShipment?: string;
};

type Props = {
  year?: number;
  isOpen: boolean;
  shipper: ShipperLike | null;
  loadingProfile?: boolean;
  profile?: IyCompanyProfile | null;
  routeKpis?: IyRouteKpis | null;
  enrichment?: any | null;
  error?: string | null;
  onClose: () => void;
  onSaveToCommandCenter: (args: {
    shipper: ShipperLike | null;
    profile: IyCompanyProfile | null | undefined;
  }) => void;
  saveLoading?: boolean;
  isSaved?: boolean;
};

function formatNumber(value: number | null | undefined): string {
  if (value == null || Number.isNaN(Number(value))) return "—";
  return Number(value).toLocaleString();
}

function formatCurrency(value: number | null | undefined): string {
  if (value == null || Number.isNaN(Number(value))) return "—";
  const num = Number(value);
  if (num >= 1_000_000) return `$${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `$${(num / 1_000).toFixed(0)}K`;
  return `$${num.toLocaleString()}`;
}

function getCountryFlag(countryCode?: string): string {
  if (!countryCode || countryCode.length !== 2) return "";
  return String.fromCodePoint(
    ...countryCode.toUpperCase().split("").map((c) => 127397 + c.charCodeAt(0)),
  );
}

function buildMonthlyChartData(profile?: IyCompanyProfile | null, selectedYear?: number) {
  const points = Array.isArray(profile?.timeSeries) ? profile!.timeSeries : [];
  const filtered = selectedYear
    ? points.filter((p) => Number(p?.year) === Number(selectedYear))
    : points;

  return filtered
    .map((point) => ({
      month: typeof point.month === "string" && point.month.includes("-")
        ? point.month.slice(5, 7)
        : point.month,
      shipments: Number(point.shipments ?? 0),
      teu: Number(point.teu ?? 0),
      fcl: Number(point.fclShipments ?? 0),
      lcl: Number(point.lclShipments ?? 0),
      estSpendUsd: Number(point.estSpendUsd ?? 0),
    }))
    .sort((a, b) => String(a.month).localeCompare(String(b.month)));
}

function normalizeTopSuppliers(shipper: ShipperLike | null, profile?: IyCompanyProfile | null): string[] {
  const fromProfile = Array.isArray(profile?.topSuppliers) ? profile!.topSuppliers! : [];
  const fromShipper =
    (Array.isArray(shipper?.top_suppliers) ? shipper?.top_suppliers : []) ??
    (Array.isArray(shipper?.topSuppliers) ? shipper?.topSuppliers : []) ??
    [];

  return [...new Set([...fromProfile, ...fromShipper].filter(Boolean))].slice(0, 12);
}

export default function ShipperDetailModal({
  year,
  isOpen,
  shipper,
  loadingProfile = false,
  profile,
  routeKpis,
  enrichment,
  error,
  onClose,
  onSaveToCommandCenter,
  saveLoading = false,
  isSaved = false,
}: Props) {
  const [activeTab, setActiveTab] = useState("overview");

  const companyName =
    profile?.title ||
    profile?.name ||
    shipper?.title ||
    shipper?.name ||
    "Unknown Company";

  const website =
    profile?.website ||
    shipper?.website ||
    (profile?.domain ? `https://${profile.domain}` : null);

  const phone =
    profile?.phoneNumber ||
    profile?.phone ||
    shipper?.phone ||
    null;

  const address =
    profile?.address ||
    shipper?.address ||
    [shipper?.city, shipper?.state].filter(Boolean).join(", ") ||
    "—";

  const countryCode =
    profile?.countryCode ||
    shipper?.countryCode ||
    shipper?.country_code ||
    null;

  const shipments12m =
    routeKpis?.shipmentsLast12m ??
    profile?.routeKpis?.shipmentsLast12m ??
    shipper?.shipments_12m ??
    shipper?.totalShipments ??
    shipper?.shipments ??
    null;

  const teu12m =
    routeKpis?.teuLast12m ??
    profile?.routeKpis?.teuLast12m ??
    shipper?.teu_estimate ??
    null;

  const estSpend12m =
    routeKpis?.estSpendUsd12m ??
    profile?.routeKpis?.estSpendUsd12m ??
    profile?.estSpendUsd12m ??
    null;

  const topRoute =
    routeKpis?.topRouteLast12m ??
    profile?.routeKpis?.topRouteLast12m ??
    null;

  const recentRoute =
    routeKpis?.mostRecentRoute ??
    profile?.routeKpis?.mostRecentRoute ??
    null;

  const lastShipmentDate =
    profile?.lastShipmentDate ||
    shipper?.lastShipmentDate ||
    shipper?.mostRecentShipment ||
    shipper?.last_shipment ||
    null;

  const fclShipments = getFclShipments12m(profile) ?? null;
  const lclShipments = getLclShipments12m(profile) ?? null;

  const monthlyChartData = useMemo(
    () => buildMonthlyChartData(profile, year),
    [profile, year],
  );

  const topRoutes = useMemo(
    () => (profile?.routeKpis?.topRoutesLast12m || routeKpis?.topRoutesLast12m || []).slice(0, 8),
    [profile, routeKpis],
  );

  const recentBols = useMemo(
    () => (Array.isArray(profile?.recentBols) ? profile!.recentBols.slice(0, 12) : []),
    [profile],
  );

  const topSuppliers = useMemo(
    () => normalizeTopSuppliers(shipper, profile),
    [shipper, profile],
  );

  const dateBadge = getDateBadgeInfo(lastShipmentDate || undefined);

  const showProfileSkeleton = loadingProfile && !profile;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-[95vw] w-[1200px] p-0 overflow-hidden border-slate-200">
        <div className="flex h-[85vh] flex-col bg-slate-50">
          <div className="border-b border-slate-200 bg-white px-6 py-5">
            <div className="flex items-start justify-between gap-4">
              <div className="flex min-w-0 items-start gap-4">
                <CompanyAvatar
                  name={companyName}
                  logoUrl={getCompanyLogoUrl(website || shipper?.website)}
                  size="lg"
                />
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="truncate text-2xl font-semibold text-slate-900">
                      {companyName}
                    </h2>
                    {countryCode ? (
                      <span className="text-xl">{getCountryFlag(countryCode)}</span>
                    ) : null}
                    {isSaved ? (
                      <Badge className="bg-blue-600 text-white hover:bg-blue-600">Saved</Badge>
                    ) : null}
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-slate-600">
                    <div className="flex items-center gap-1.5">
                      <MapPin className="h-4 w-4" />
                      <span>{address}</span>
                    </div>

                    {website ? (
                      <a
                        href={website.startsWith("http") ? website : `https://${website}`}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1.5 hover:text-slate-900"
                      >
                        <Globe className="h-4 w-4" />
                        <span className="truncate max-w-[260px]">
                          {website.replace(/^https?:\/\//, "")}
                        </span>
                      </a>
                    ) : null}

                    {phone ? (
                      <div className="flex items-center gap-1.5">
                        <Phone className="h-4 w-4" />
                        <span>{phone}</span>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant={isSaved ? "secondary" : "default"}
                  onClick={() => onSaveToCommandCenter({ shipper, profile })}
                  disabled={saveLoading || isSaved}
                  className={isSaved ? "bg-blue-50 text-blue-700 hover:bg-blue-100" : ""}
                >
                  {saveLoading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : isSaved ? (
                    <Bookmark className="mr-2 h-4 w-4 fill-current" />
                  ) : (
                    <BookmarkPlus className="mr-2 h-4 w-4" />
                  )}
                  {isSaved ? "Saved to Command Center" : "Save to Command Center"}
                </Button>

                <Button variant="ghost" size="icon" onClick={onClose}>
                  <X className="h-5 w-5" />
                </Button>
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-5">
            {error ? (
              <Card className="border-red-200 bg-red-50">
                <CardContent className="py-6 text-sm text-red-700">
                  {error}
                </CardContent>
              </Card>
            ) : null}

            {showProfileSkeleton ? (
              <div className="space-y-6">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Card key={i}>
                      <CardContent className="p-5">
                        <div className="h-4 w-24 animate-pulse rounded bg-slate-200" />
                        <div className="mt-3 h-8 w-32 animate-pulse rounded bg-slate-200" />
                      </CardContent>
                    </Card>
                  ))}
                </div>
                <Card>
                  <CardContent className="p-6">
                    <div className="h-[320px] animate-pulse rounded bg-slate-200" />
                  </CardContent>
                </Card>
              </div>
            ) : (
              <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-5">
                <TabsList className="grid w-full grid-cols-3 max-w-[520px]">
                  <TabsTrigger value="overview">Overview</TabsTrigger>
                  <TabsTrigger value="routes">Routes</TabsTrigger>
                  <TabsTrigger value="shipments">Shipments</TabsTrigger>
                </TabsList>

                <TabsContent value="overview" className="space-y-5">
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <Card>
                      <CardContent className="p-5">
                        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                          <Package className="h-4 w-4" />
                          Shipments 12m
                        </div>
                        <div className="mt-2 text-3xl font-semibold text-slate-900">
                          {formatNumber(shipments12m)}
                        </div>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardContent className="p-5">
                        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                          <TrendingUp className="h-4 w-4" />
                          TEU 12m
                        </div>
                        <div className="mt-2 text-3xl font-semibold text-slate-900">
                          {formatNumber(teu12m)}
                        </div>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardContent className="p-5">
                        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                          <Truck className="h-4 w-4" />
                          FCL / LCL
                        </div>
                        <div className="mt-2 text-2xl font-semibold text-slate-900">
                          {formatNumber(fclShipments)} / {formatNumber(lclShipments)}
                        </div>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardContent className="p-5">
                        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                          <Calendar className="h-4 w-4" />
                          Last Shipment
                        </div>
                        <div className="mt-2 text-lg font-semibold text-slate-900">
                          {formatUserFriendlyDate(lastShipmentDate || undefined)}
                        </div>
                        {dateBadge ? (
                          <div className="mt-2">
                            <Badge
                              variant="secondary"
                              className={
                                dateBadge.color === "green"
                                  ? "bg-green-50 text-green-700 border-green-200"
                                  : dateBadge.color === "yellow"
                                  ? "bg-yellow-50 text-yellow-700 border-yellow-200"
                                  : "bg-slate-100 text-slate-600"
                              }
                            >
                              {dateBadge.label}
                            </Badge>
                          </div>
                        ) : null}
                      </CardContent>
                    </Card>
                  </div>

                  <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
                    <Card className="xl:col-span-2">
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-base">
                          <BarChart3 className="h-4 w-4" />
                          Monthly activity
                          {year ? <span className="text-slate-400">• {year}</span> : null}
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        {monthlyChartData.length > 0 ? (
                          <div className="h-[320px]">
                            <ResponsiveContainer width="100%" height="100%">
                              <BarChart data={monthlyChartData}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                <XAxis dataKey="month" />
                                <YAxis />
                                <RechartsTooltip />
                                <Bar dataKey="shipments" radius={[6, 6, 0, 0]} />
                              </BarChart>
                            </ResponsiveContainer>
                          </div>
                        ) : (
                          <div className="flex h-[320px] items-center justify-center text-sm text-slate-500">
                            No monthly activity available for this company yet.
                          </div>
                        )}
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base">Snapshot</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4 text-sm">
                        <div>
                          <div className="text-slate-500">Estimated spend 12m</div>
                          <div className="mt-1 text-lg font-semibold text-slate-900">
                            {formatCurrency(estSpend12m)}
                          </div>
                        </div>

                        <div>
                          <div className="text-slate-500">Top route</div>
                          <div className="mt-1 font-medium text-slate-900">
                            {topRoute || "—"}
                          </div>
                        </div>

                        <div>
                          <div className="text-slate-500">Most recent route</div>
                          <div className="mt-1 font-medium text-slate-900">
                            {recentRoute || "—"}
                          </div>
                        </div>

                        <div>
                          <div className="text-slate-500">Suppliers</div>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {topSuppliers.length ? (
                              topSuppliers.slice(0, 6).map((supplier) => (
                                <Badge key={supplier} variant="secondary">
                                  {supplier}
                                </Badge>
                              ))
                            ) : (
                              <span className="text-slate-400">No supplier data</span>
                            )}
                          </div>
                        </div>

                        {enrichment ? (
                          <div>
                            <div className="text-slate-500">Enrichment</div>
                            <div className="mt-1 text-slate-900">
                              Available
                            </div>
                          </div>
                        ) : null}
                      </CardContent>
                    </Card>
                  </div>
                </TabsContent>

                <TabsContent value="routes" className="space-y-5">
                  <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
                    <Card className="xl:col-span-2">
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-base">
                          <Route className="h-4 w-4" />
                          Top routes
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        {topRoutes.length ? (
                          <div className="space-y-3">
                            {topRoutes.map((routeItem, idx) => (
                              <div
                                key={`${routeItem.route}-${idx}`}
                                className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"
                              >
                                <div className="min-w-0">
                                  <div className="truncate font-medium text-slate-900">
                                    {routeItem.route}
                                  </div>
                                </div>
                                <div className="ml-4 flex items-center gap-4 text-sm text-slate-600">
                                  <span>{formatNumber(routeItem.shipments)} shipments</span>
                                  <span>{formatNumber(routeItem.teu)} TEU</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-sm text-slate-500">
                            No route data available yet.
                          </div>
                        )}
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base">Route KPIs</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4 text-sm">
                        <div>
                          <div className="text-slate-500">Top route 12m</div>
                          <div className="mt-1 font-medium text-slate-900">
                            {topRoute || "—"}
                          </div>
                        </div>

                        <div>
                          <div className="text-slate-500">Most recent route</div>
                          <div className="mt-1 font-medium text-slate-900">
                            {recentRoute || "—"}
                          </div>
                        </div>

                        <div>
                          <div className="text-slate-500">Sample size</div>
                          <div className="mt-1 font-medium text-slate-900">
                            {formatNumber(
                              routeKpis?.sampleSize ?? profile?.routeKpis?.sampleSize ?? null,
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </TabsContent>

                <TabsContent value="shipments" className="space-y-5">
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-base">
                        <Users className="h-4 w-4" />
                        Recent shipment records
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {recentBols.length ? (
                        <div className="overflow-x-auto">
                          <table className="w-full min-w-[760px] text-sm">
                            <thead className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                              <tr>
                                <th className="py-3 pr-4">Date</th>
                                <th className="py-3 pr-4">BOL</th>
                                <th className="py-3 pr-4">Route</th>
                                <th className="py-3 pr-4">Origin</th>
                                <th className="py-3 pr-4">Destination</th>
                                <th className="py-3 pr-4">TEU</th>
                              </tr>
                            </thead>
                            <tbody>
                              {recentBols.map((bol, idx) => (
                                <tr key={`${bol.bolNumber || "bol"}-${idx}`} className="border-b border-slate-100">
                                  <td className="py-3 pr-4 text-slate-700">
                                    {formatUserFriendlyDate(bol.date || undefined)}
                                  </td>
                                  <td className="py-3 pr-4 font-medium text-slate-900">
                                    {bol.bolNumber || "—"}
                                  </td>
                                  <td className="py-3 pr-4 text-slate-700">
                                    {bol.route || "—"}
                                  </td>
                                  <td className="py-3 pr-4 text-slate-700">
                                    {bol.origin || "—"}
                                  </td>
                                  <td className="py-3 pr-4 text-slate-700">
                                    {bol.destination || "—"}
                                  </td>
                                  <td className="py-3 pr-4 text-slate-700">
                                    {formatNumber(bol.teu)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <div className="text-sm text-slate-500">
                          No shipment rows available in the current profile payload.
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
