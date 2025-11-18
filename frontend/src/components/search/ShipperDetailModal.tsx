import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import {
  iyCompanyStats,
  iyFetchCompanyBols,
  type IyCompanyStats,
  type IyShipperHit,
} from "@/lib/api";
import type { ShipmentLite } from "@/types/importyeti";
import { Loader2, MapPin, Ship, TrendingUp, BarChart3, Target, Lock, X } from "lucide-react";

type Props = {
  shipper: IyShipperHit | null;
  open: boolean;
  onClose: () => void;
  topRoute?: string | null;
  recentRoute?: string | null;
  onSave?: (shipper: IyShipperHit) => void;
  saving?: boolean;
};

const SHIPMENT_PAGE_LIMIT = 25;

const formatNumber = (value?: number | null) => {
  if (value == null || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat().format(value);
};

const formatDate = (value?: string | null) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
};

const getCompanySlug = (key: string | undefined) => {
  if (!key) return "";
  return key.replace(/^company\//, "");
};

export default function ShipperDetailModal({
  shipper,
  open,
  onClose,
  topRoute,
  recentRoute,
  onSave,
  saving,
}: Props) {
  const [activeTab, setActiveTab] = useState<"overview" | "kpis" | "shipments" | "contacts">("overview");
  const [shipments, setShipments] = useState<ShipmentLite[]>([]);
  const [shipmentsLoading, setShipmentsLoading] = useState(false);
  const [shipmentsError, setShipmentsError] = useState<string | null>(null);

  const [stats, setStats] = useState<IyCompanyStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsError, setStatsError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !shipper?.key) {
      setShipments([]);
      setShipmentsError(null);
      return;
    }
    let cancelled = false;
    setShipmentsLoading(true);
    setShipmentsError(null);
    iyFetchCompanyBols({ companyKey: shipper.key, limit: SHIPMENT_PAGE_LIMIT, offset: 0 })
      .then((rows) => {
        if (cancelled) return;
        setShipments(rows);
      })
      .catch((err) => {
        if (cancelled) return;
        setShipments([]);
        setShipmentsError(err?.message ?? "Failed to pull ImportYeti BOLs.");
      })
      .finally(() => {
        if (!cancelled) setShipmentsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, shipper?.key]);

  useEffect(() => {
    if (!open || !shipper?.key) {
      setStats(null);
      setStatsError(null);
      return;
    }
    let cancelled = false;
    const slug = getCompanySlug(shipper.key);
    if (!slug) return;
    setStatsLoading(true);
    setStatsError(null);
    iyCompanyStats({ company: slug })
      .then((payload) => {
        if (cancelled) return;
        setStats(payload);
      })
      .catch((err) => {
        if (cancelled) return;
        setStats(null);
        setStatsError(err?.message ?? "Stats temporarily unavailable.");
      })
      .finally(() => {
        if (!cancelled) setStatsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, shipper?.key]);

  useEffect(() => {
    if (!open) {
      setActiveTab("overview");
    }
  }, [open]);

  if (!open || !shipper) return null;

  const handleSaveClick = () => {
    if (!onSave) return;
    onSave(shipper);
  };

  const derivedTopRoute = (() => {
    if (topRoute) return topRoute;
    const lane = stats?.topLanes?.[0];
    if (!lane) return null;
    const origin = lane.origin_port || lane.origin_country_code;
    const dest = lane.dest_port || lane.dest_country_code;
    if (origin && dest) return `${origin} → ${dest}`;
    return origin || dest || null;
  })();

  const derivedRecentRoute = recentRoute ?? derivedTopRoute ?? null;

  const breakdown = stats?.shipmentTypeBreakdown;
  const fcl = breakdown?.fcl_shipments ?? 0;
  const lcl = breakdown?.lcl_shipments ?? 0;
  const monthlySeries = stats?.monthlyShipments ?? [];

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent className="max-w-5xl max-h-[95vh] overflow-hidden rounded-2xl bg-white p-0">
        <DialogHeader className="border-b px-6 py-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <DialogTitle className="text-2xl font-semibold text-slate-900 truncate" title={shipper.title}>
                {shipper.title}
              </DialogTitle>
              <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                {shipper.address && <span>{shipper.address}</span>}
                {shipper.countryCode && <span>{shipper.countryCode}</span>}
                {shipper.type && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">{shipper.type}</span>}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {onSave && (
                <Button
                  type="button"
                  onClick={handleSaveClick}
                  disabled={saving}
                  className="rounded-full bg-indigo-600 px-4 py-2 text-sm text-white hover:bg-indigo-500"
                >
                  {saving ? "Saving…" : "Save to Command Center"}
                </Button>
              )}
              <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
                <X className="h-5 w-5" />
              </Button>
            </div>
          </div>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as "overview" | "kpis" | "shipments" | "contacts")}>
          <div className="border-b px-6">
            <TabsList className="flex gap-2 border-b border-transparent">
              <TabsTrigger value="overview" className="data-[state=active]:text-indigo-600">Overview</TabsTrigger>
              <TabsTrigger value="kpis" className="data-[state=active]:text-indigo-600">KPIs</TabsTrigger>
              <TabsTrigger value="shipments" className="data-[state=active]:text-indigo-600">Shipments</TabsTrigger>
              <TabsTrigger value="contacts" className="data-[state=active]:text-indigo-600">Contacts</TabsTrigger>
            </TabsList>
          </div>

          <div className="overflow-y-auto px-6 py-6 max-h-[calc(95vh-140px)] space-y-6">
            <TabsContent value="overview" className="space-y-6">
              <section className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <KpiCard icon={<Ship className="h-5 w-5 text-indigo-500" />} label="Total Shipments" value={formatNumber(shipper.totalShipments)} />
                <KpiCard icon={<TrendingUp className="h-5 w-5 text-indigo-500" />} label="Last Shipment" value={shipper.mostRecentShipment ?? "—"} />
                <KpiCard icon={<MapPin className="h-5 w-5 text-indigo-500" />} label="Top Route (12m)" value={derivedTopRoute ?? "—"} />
              </section>

              <section className="rounded-2xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-600">
                ImportYeti DMA unlocks full shipment intelligence for this shipper. Save them to Command Center to track lanes, TEUs, and AI-enriched summaries alongside your sales workflows.
              </section>

              <section className="rounded-2xl border border-slate-200 p-5">
                <h3 className="text-sm font-semibold text-slate-800 mb-3">Top suppliers</h3>
                {shipper.topSuppliers?.length ? (
                  <div className="flex flex-wrap gap-2 text-xs text-slate-700">
                    {shipper.topSuppliers.map((supplier) => (
                      <span key={supplier} className="rounded-full bg-slate-100 px-3 py-1">{supplier}</span>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-slate-500">No supplier data yet.</p>
                )}
              </section>
            </TabsContent>

            <TabsContent value="kpis" className="space-y-6">
              {statsLoading && (
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading DMA stats…
                </div>
              )}
              {statsError && !statsLoading && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
                  {statsError}
                </div>
              )}
              {!statsLoading && stats && (
                <>
                  <section className="grid gap-4 md:grid-cols-3">
                    <KpiCard icon={<Target className="h-5 w-5 text-indigo-500" />} label="FCL Shipments" value={formatNumber(fcl)} />
                    <KpiCard icon={<Target className="h-5 w-5 text-indigo-500" />} label="LCL Shipments" value={formatNumber(lcl)} />
                    <KpiCard icon={<BarChart3 className="h-5 w-5 text-indigo-500" />} label="Most Recent Route" value={derivedRecentRoute ?? "—"} />
                  </section>

                  {monthlySeries.length > 0 && (
                    <section>
                      <h3 className="mb-3 text-sm font-semibold text-slate-800">Monthly shipments (last 12m)</h3>
                      <div className="rounded-2xl border border-slate-200 bg-white p-4">
                        <MonthlyChart data={monthlySeries} />
                      </div>
                    </section>
                  )}

                  {stats.topLanes?.length ? (
                    <section className="space-y-3">
                      <h3 className="text-sm font-semibold text-slate-800">Top lanes</h3>
                      <div className="space-y-2">
                        {stats.topLanes.slice(0, 5).map((lane, idx) => (
                          <div key={`${lane.origin_port}-${lane.dest_port}-${idx}`} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
                            <span>
                              {lane.origin_port || lane.origin_country_code || "—"} → {lane.dest_port || lane.dest_country_code || "—"}
                            </span>
                            <span className="font-semibold text-slate-900">{formatNumber(lane.shipments_12m)} shipments</span>
                          </div>
                        ))}
                      </div>
                    </section>
                  ) : null}
                </>
              )}
            </TabsContent>

            <TabsContent value="shipments" className="space-y-4">
              {shipmentsLoading && (
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading ImportYeti BOLs…
                </div>
              )}
              {shipmentsError && !shipmentsLoading && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                  {shipmentsError}
                </div>
              )}
              {!shipmentsLoading && !shipmentsError && (
                <div className="rounded-2xl border border-slate-200 bg-white">
                  <div className="border-b px-4 py-2 text-xs text-slate-500">
                    Showing first {SHIPMENT_PAGE_LIMIT} BOLs
                  </div>
                  <div className="overflow-auto">
                    <table className="min-w-full text-sm">
                      <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                        <tr>
                          <th className="px-3 py-2">Date</th>
                          <th className="px-3 py-2">BOL</th>
                          <th className="px-3 py-2">Origin</th>
                          <th className="px-3 py-2">Destination</th>
                          <th className="px-3 py-2">TEU</th>
                          <th className="px-3 py-2">Description</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {shipments.map((row, index) => (
                          <tr key={`${row.bol}-${index}`} className="bg-white">
                            <td className="px-3 py-2">{formatDate(row.date)}</td>
                            <td className="px-3 py-2">{row.bol || "—"}</td>
                            <td className="px-3 py-2">{row.origin_port || row.origin_country_code || "—"}</td>
                            <td className="px-3 py-2">{row.destination_port || row.dest_country_code || "—"}</td>
                            <td className="px-3 py-2 text-right">{formatNumber(row.teu)}</td>
                            <td className="px-3 py-2 text-slate-600">{row.description || "—"}</td>
                          </tr>
                        ))}
                        {!shipments.length && (
                          <tr>
                            <td colSpan={6} className="px-3 py-6 text-center text-sm text-slate-500">
                              No ImportYeti shipments available yet.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </TabsContent>

            <TabsContent value="contacts">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-600">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white">
                    <Lock className="h-5 w-5 text-slate-500" />
                  </div>
                  <div>
                    <p className="font-semibold text-slate-800">Contacts are gated</p>
                    <p className="text-xs text-slate-500">
                      Save this shipper to Command Center to unlock DMA contacts, playbooks, and AI enrichment.
                    </p>
                  </div>
                </div>
              </div>
            </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

type KpiCardProps = {
  icon: ReactNode;
  label: string;
  value: string;
};

function KpiCard({ icon, label, value }: KpiCardProps) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
        {icon}
        {label}
      </div>
      <div className="mt-2 text-lg font-semibold text-slate-900">{value}</div>
    </div>
  );
}

function MonthlyChart({ data }: { data: NonNullable<IyCompanyStats["monthlyShipments"]> }) {
  if (!data.length) return null;
  const max = Math.max(...data.map((item) => Number(item.shipments ?? 0)));
  return (
    <div className="flex items-end gap-2">
      {data.map((item) => {
        const height = max > 0 ? Math.max(8, Math.round((Number(item.shipments ?? 0) / max) * 120)) : 8;
        return (
          <div key={item.month} className="flex flex-1 flex-col items-center">
            <div className="text-[11px] text-slate-500">{formatNumber(item.shipments)}</div>
            <div className="mt-1 w-full rounded-t bg-gradient-to-b from-indigo-400 to-indigo-600" style={{ height }} />
            <div className="mt-1 text-[11px] text-slate-500">{item.month}</div>
          </div>
        );
      })}
    </div>
  );
}
