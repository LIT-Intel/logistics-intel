import { useEffect, useMemo, useState } from "react";
import type { ComponentType, CSSProperties, ReactNode } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  X,
  Globe,
  Ship,
  TrendingUp,
  Box,
  Lock,
  MapPin,
  Database,
  Link as LinkIcon,
  BarChart as BarChartIcon,
} from "lucide-react";
import { getCompanyShipments, getCompanyKpis } from "@/lib/api";
import { hasFeature } from "@/lib/access";

type CompanyDetailModalProps = {
  company: any | null;
  isOpen: boolean;
  onClose?: () => void;
  onSave?: (company: any) => Promise<void> | void;
  user?: { email?: string | null };
  isSaved?: boolean;
};

type MonthlyVolume = {
  key: string;
  month: string;
  volume: number;
};

export default function CompanyDetailModal({
  company,
  isOpen,
  onClose,
  onSave,
  user,
  isSaved = false,
}: CompanyDetailModalProps) {
  const [allRows, setAllRows] = useState<any[]>([]);
  const [tableRows, setTableRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<"overview" | "summary" | "shipments" | "contacts">(
    "overview",
  );
  const [saving, setSaving] = useState(false);
  const [page, setPage] = useState(1);
  const [dateStart, setDateStart] = useState("");
  const [dateEnd, setDateEnd] = useState("");
  const [showGate, setShowGate] = useState(false);
  const [kpis, setKpis] = useState<{ teus12m: number | null; growthRate: number | null }>({
    teus12m: null,
    growthRate: null,
  });

  const companyId = company?.company_id || company?.id || null;
  const name = company?.company_name || company?.name || "Company";
  const website = company?.website || company?.domain || null;
  const hqText = [company?.hq_city, company?.hq_state].filter(Boolean).join(", ");

  const userEmail = String(user?.email || "").toLowerCase();
  const isWhitelisted =
    userEmail === "vraymond@logisticintel.com" ||
    userEmail === "support@logisticintel.com";
  const canViewContacts = isWhitelisted || hasFeature("contacts");

  // Load shipments + KPIs
  useEffect(() => {
    let abort = false;

    async function load() {
      if (!isOpen || !companyId) return;

      setLoading(true);
      setError("");

      try {
        // Large set for chart + top route
        const big = await getCompanyShipments(String(companyId), {
          limit: 1000,
          offset: 0,
        });
        const bigRows = Array.isArray(big?.rows) ? big.rows : [];
        if (!abort) setAllRows(bigRows);

        // First page for table
        const first = await getCompanyShipments(String(companyId), {
          limit: 50,
          offset: 0,
        });
        if (!abort) setTableRows(Array.isArray(first?.rows) ? first.rows : []);

        // KPIs
        try {
          const k = await getCompanyKpis({ company_id: String(companyId) });
          if (!abort && k) {
            const teuVal = k.total_teus_12m ?? k.teus_12m ?? k.total_teus ?? null;
            const growthVal = k.growth_rate ?? null;
            setKpis({
              teus12m: teuVal != null ? Number(teuVal) : null,
              growthRate: growthVal != null ? Number(growthVal) : null,
            });
          }
        } catch (err) {
          if (!abort) {
            console.warn("getCompanyKpis failed", err);
          }
        }
      } catch (e) {
        if (!abort) {
          setAllRows([]);
          setTableRows([]);
          setError("Failed to load shipments.");
        }
      } finally {
        if (!abort) setLoading(false);
      }
    }

    load();

    return () => {
      abort = true;
    };
  }, [isOpen, companyId]);

  // Top route from allRows
  const topRoute = useMemo(() => {
    const counts = new Map<string, number>();

    for (const r of allRows) {
      const o = r.origin_country || r.origin_city || r.origin_port || "—";
      const d = r.dest_country || r.dest_city || r.dest_port || "—";
      const key = `${o} → ${d}`;
      counts.set(key, (counts.get(key) || 0) + 1);
    }

    let best = "—";
    let max = 0;
    for (const [k, v] of counts) {
      if (v > max) {
        max = v;
        best = k;
      }
    }
    return best;
  }, [allRows]);

  // Monthly volumes (TEU if present else 1 per shipment)
  const monthlyVolumes: MonthlyVolume[] = useMemo(() => {
    const months: MonthlyVolume[] = [];
    const now = new Date();

    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      months.push({
        key,
        month: d.toLocaleString(undefined, { month: "short" }),
        volume: 0,
      });
    }

    const byKey = new Map<string, MonthlyVolume>(months.map((m) => [m.key, m]));

    for (const r of allRows) {
      const raw = r.shipped_on || r.date || r.snapshot_date || r.shipment_date;
      if (!raw) continue;
      const dt = new Date(String(raw));
      if (Number.isNaN(dt.getTime())) continue;

      const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
      const vol = typeof r.teu === "number" ? Number(r.teu) : 1;

      const entry = byKey.get(key);
      if (entry) entry.volume += vol;
    }

    return months;
  }, [allRows]);

  const displayTeus = useMemo(() => {
    if (kpis.teus12m != null) return Number(kpis.teus12m).toLocaleString();
    const fallback =
      company?.total_teus != null ? Number(company.total_teus) : null;
    return fallback != null ? fallback.toLocaleString() : "—";
  }, [kpis, company]);

  const displayGrowth = useMemo(() => {
    const raw =
      kpis.growthRate != null
        ? Number(kpis.growthRate)
        : company?.growth_rate != null
          ? Number(company.growth_rate)
          : null;

    if (raw == null || Number.isNaN(raw)) return "—";

    const pct = Math.abs(raw) <= 1 ? raw * 100 : raw;
    const rounded = Math.round(pct);

    return `${raw >= 0 ? "+" : ""}${rounded}%`;
  }, [kpis, company]);

  // Filter + paginate table rows client-side
  const filteredRows = useMemo(() => {
    if (!dateStart && !dateEnd) return tableRows;

    const s = dateStart ? new Date(dateStart) : null;
    const e = dateEnd ? new Date(dateEnd) : null;

    return tableRows.filter((r) => {
      const raw = r.shipped_on || r.date || r.snapshot_date || r.shipment_date;
      if (!raw) return false;

      const d = new Date(String(raw));
      if (s && d < s) return false;
      if (e && d > e) return false;

      return true;
    });
  }, [tableRows, dateStart, dateEnd]);

  const pagedRows = useMemo(() => {
    const start = (page - 1) * 50;
    return filteredRows.slice(start, start + 50);
  }, [filteredRows, page]);

  function KpiInfo({
    icon: Icon,
    label,
    value,
    link = false,
  }: {
    icon: ComponentType<{ className?: string; style?: CSSProperties }>;
    label: string;
    value: ReactNode;
    link?: boolean;
  }) {
    const displayValue = value ?? "—";

    if (link) {
      const href =
        typeof displayValue === "string" && displayValue
          ? `https://${displayValue.replace(/^https?:\/\//, "")}`
          : "#";

      return (
        <div className="flex min-h-[96px] flex-col items-center justify-center rounded-xl border border-slate-200 bg-white p-3 text-center">
          <Icon className="mb-1 h-5 w-5" style={{ color: "#7F3DFF" }} />
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 text-xs font-medium text-indigo-600 hover:underline"
          >
            {typeof displayValue === "string"
              ? displayValue.replace(/^https?:\/\//, "")
              : displayValue}
          </a>
          <div className="mt-1 text-[11px] font-medium uppercase text-slate-500">
            {label}
          </div>
        </div>
      );
    }

    return (
      <div className="flex min-h-[96px] flex-col items-center justify-center rounded-xl border border-slate-200 bg-white p-3 text-center">
        <Icon className="mb-1 h-5 w-5" style={{ color: "#7F3DFF" }} />
        <div className="text-xl font-bold text-slate-900">
          {displayValue ?? "—"}
        </div>
        <div className="mt-1 text-[11px] font-medium uppercase text-slate-500">
          {label}
        </div>
      </div>
    );
  }

  async function handleSave() {
    if (!onSave || saving || isSaved) return;
    setSaving(true);
    try {
      await onSave(company);
    } finally {
      setSaving(false);
    }
  }

  if (!isOpen || !company) return null;

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose?.();
      }}
    >
      <DialogContent className="max-h-[95vh] max-w-4xl rounded-xl bg-white">
        <DialogHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <DialogTitle
                className="truncate text-2xl font-bold text-slate-900"
                title={name}
              >
                {name}
              </DialogTitle>
              <div className="mt-1 flex items-center gap-2 text-sm text-slate-500">
                <span>ID: {String(companyId)}</span>
                {hqText && <span>• HQ: {hqText}</span>}
                {website && (
                  <span className="inline-flex items-center gap-1">
                    <Globe className="h-4 w-4" />
                    <a
                      href={`https://${String(website).replace(/^https?:\/\//, "")}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-indigo-600 hover:underline"
                    >
                      {String(website)}
                    </a>
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                onClick={handleSave}
                disabled={saving || isSaved}
                className="bg-[#7F3DFF] text-white hover:bg-[#6d2ee6]"
              >
                {isSaved ? "Saved" : saving ? "Saving…" : "Save to Command Center"}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={onClose}
                aria-label="Close"
                className="text-slate-500 hover:text-slate-700"
              >
                <X className="h-5 w-5" />
              </Button>
            </div>
          </div>
        </DialogHeader>

        <div className="mt-2">
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
            <div className="border-b border-slate-200 pb-2">
              <TabsList className="h-9 bg-slate-50">
                <TabsTrigger
                  value="overview"
                  className="data-[state=active]:text-[#7F3DFF]"
                >
                  Overview
                </TabsTrigger>
                <TabsTrigger
                  value="summary"
                  className="data-[state=active]:text-[#7F3DFF]"
                >
                  Shipment Summary
                </TabsTrigger>
                <TabsTrigger
                  value="shipments"
                  className="data-[state=active]:text-[#7F3DFF]"
                >
                  Shipments
                </TabsTrigger>
                <TabsTrigger
                  value="contacts"
                  className="data-[state=active]:text-[#7F3DFF]"
                  onClick={() => {
                    if (!isSaved || !canViewContacts) setShowGate(true);
                  }}
                >
                  Contacts
                </TabsTrigger>
              </TabsList>
            </div>

            <div className="mt-4 space-y-4">
              {/* Overview */}
              <TabsContent value="overview" className="space-y-6">
                <div>
                  <h3 className="mb-3 text-lg font-semibold text-slate-900">
                    Company Profile
                  </h3>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-4">
                    <KpiInfo
                      icon={Database}
                      label="Company ID"
                      value={companyId}
                    />
                    <KpiInfo
                      icon={LinkIcon}
                      label="Website"
                      value={website}
                      link
                    />
                    <KpiInfo
                      icon={Ship}
                      label="Total Shipments (12m)"
                      value={company?.shipments_12m ?? "—"}
                    />
                    <KpiInfo
                      icon={Box}
                      label="Total TEUs (12m)"
                      value={displayTeus}
                    />
                    <KpiInfo
                      icon={MapPin}
                      label="Top Trade Route"
                      value={topRoute}
                    />
                  </div>
                </div>

                <div>
                  <h4 className="flex items-center text-base font-semibold text-slate-900">
                    <BarChartIcon
                      className="mr-2 h-5 w-5"
                      style={{ color: "#7F3DFF" }}
                    />
                    Sales Intelligence Available
                  </h4>
                  <p className="mt-1 text-sm text-slate-600">
                    Access real-time contacts and AI-enriched insights about this
                    company&apos;s supply chain strategy by saving them to your
                    Command Center.
                  </p>
                </div>
              </TabsContent>

              {/* Shipment Summary */}
              <TabsContent value="summary" className="space-y-6">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-4">
                  <div className="rounded-xl border border-slate-200 bg-white p-3 text-center">
                    <Ship
                      className="mx-auto mb-2 h-6 w-6"
                      style={{ color: "#7F3DFF" }}
                    />
                    <div className="text-2xl font-bold text-slate-900">
                      {company?.shipments_12m ?? "—"}
                    </div>
                    <div className="mt-1 text-xs font-medium uppercase text-slate-500">
                      Total Shipments (12m)
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-white p-3 text-center">
                    <Box
                      className="mx-auto mb-2 h-6 w-6"
                      style={{ color: "#7F3DFF" }}
                    />
                    <div className="text-2xl font-bold text-slate-900">
                      {displayTeus}
                    </div>
                    <div className="mt-1 text-xs font-medium uppercase text-slate-500">
                      Total TEUs (12m)
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-white p-3 text-center">
                    <TrendingUp
                      className="mx-auto mb-2 h-6 w-6"
                      style={{ color: "#7F3DFF" }}
                    />
                    <div className="text-2xl font-bold text-slate-900">
                      {displayGrowth}
                    </div>
                    <div className="mt-1 text-xs font-medium uppercase text-slate-500">
                      Growth Rate (YoY)
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-white p-3 text-center">
                    <MapPin className="mx-auto mb-2 h-6 w-6 text-rose-500" />
                    <div className="text-lg font-bold text-slate-900">
                      {topRoute}
                    </div>
                    <div className="mt-1 text-xs font-medium uppercase text-slate-500">
                      Primary Route
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="flex items-center text-lg font-semibold text-slate-900">
                    <BarChartIcon
                      className="mr-2 h-5 w-5"
                      style={{ color: "#7F3DFF" }}
                    />
                    12-Month Shipment Volume (TEU Equivalent)
                  </h3>
                  <div className="mt-2 h-40 rounded-xl border border-slate-200 bg-white p-4">
                    <div className="flex h-full items-end gap-2">
                      {(() => {
                        const max = Math.max(
                          1,
                          ...monthlyVolumes.map((v) => v.volume),
                        );
                        return monthlyVolumes.map((v, idx) => {
                          const barH = Math.max(
                            5,
                            Math.round((v.volume / max) * 150),
                          );
                          const color =
                            idx === monthlyVolumes.length - 1
                              ? "#7F3DFF"
                              : "#A97EFF";
                          return (
                            <div
                              key={v.key}
                              className="flex flex-col items-center justify-end"
                              style={{ minWidth: "20px" }}
                            >
                              <div className="mb-1 text-[10px] text-slate-500">
                                {v.volume.toLocaleString()}
                              </div>
                              <div
                                className="w-4 rounded-t"
                                style={{
                                  height: `${barH}px`,
                                  background: `linear-gradient(180deg, ${color} 0%, ${color} 60%, #5f2fd1 100%)`,
                                }}
                              />
                              <div className="mt-1 text-[10px] text-slate-500">
                                {v.month}
                              </div>
                            </div>
                          );
                        });
                      })()}
                    </div>
                  </div>
                  <p className="mt-2 text-xs text-slate-500">
                    Data represents estimated monthly shipment volume over the last
                    12 months.
                  </p>
                </div>
              </TabsContent>

              {/* Shipments */}
              <TabsContent value="shipments" className="space-y-4">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div className="flex flex-wrap gap-3">
                    <div>
                      <div className="text-xs font-medium uppercase text-slate-500">
                        Start date
                      </div>
                      <input
                        type="date"
                        className="mt-1 h-8 rounded-md border border-slate-300 px-2 text-xs"
                        value={dateStart}
                        onChange={(e) => {
                          setPage(1);
                          setDateStart(e.target.value);
                        }}
                      />
                    </div>
                    <div>
                      <div className="text-xs font-medium uppercase text-slate-500">
                        End date
                      </div>
                      <input
                        type="date"
                        className="mt-1 h-8 rounded-md border border-slate-300 px-2 text-xs"
                        value={dateEnd}
                        onChange={(e) => {
                          setPage(1);
                          setDateEnd(e.target.value);
                        }}
                      />
                    </div>
                  </div>

                  <div className="text-xs text-slate-500">
                    Page {page} · 50 per page
                    {filteredRows.length
                      ? ` · ${filteredRows.length.toLocaleString()} filtered`
                      : ""}
                  </div>
                </div>

                {error && (
                  <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                    {error}
                  </div>
                )}

                <div className="overflow-auto rounded-xl border border-slate-200 bg-white">
                  {loading ? (
                    <div className="px-4 py-6 text-center text-sm text-slate-500">
                      Loading shipments…
                    </div>
                  ) : pagedRows.length === 0 ? (
                    <div className="px-4 py-6 text-center text-sm text-slate-500">
                      No shipment data available.
                    </div>
                  ) : (
                    <table className="min-w-full divide-y divide-slate-200 text-xs">
                      <thead className="bg-slate-50">
                        <tr>
                          <th className="px-3 py-2 text-left font-medium text-slate-500">
                            Date
                          </th>
                          <th className="px-3 py-2 text-left font-medium text-slate-500">
                            Mode
                          </th>
                          <th className="px-3 py-2 text-left font-medium text-slate-500">
                            Origin
                          </th>
                          <th className="px-3 py-2 text-left font-medium text-slate-500">
                            Destination
                          </th>
                          <th className="px-3 py-2 text-left font-medium text-slate-500">
                            Carrier
                          </th>
                          <th className="px-3 py-2 text-right font-medium text-slate-500">
                            Containers
                          </th>
                          <th className="px-3 py-2 text-right font-medium text-slate-500">
                            TEUs
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {pagedRows.map((r, i) => {
                          const raw =
                            r.shipped_on ||
                            r.date ||
                            r.snapshot_date ||
                            r.shipment_date;
                          const d = raw
                            ? new Date(String(raw)).toLocaleDateString()
                            : "—";
                          const mode =
                            r.mode || r.transport_mode || "—";
                          const origin =
                            r.origin ||
                            r.origin_city ||
                            r.origin_country ||
                            r.origin_port ||
                            "—";
                          const dest =
                            r.destination ||
                            r.dest_city ||
                            r.dest_country ||
                            r.dest_port ||
                            "—";
                          const carrier = r.carrier_name || r.carrier || "—";
                          const containers = r.container_count ?? "—";
                          const teu = r.teu ?? "—";

                          return (
                            <tr key={i} className="hover:bg-slate-50/60">
                              <td className="px-3 py-2 text-slate-700">{d}</td>
                              <td className="px-3 py-2 text-slate-700">
                                {String(mode).toLowerCase()}
                              </td>
                              <td className="px-3 py-2 text-slate-700">
                                {origin}
                              </td>
                              <td className="px-3 py-2 text-slate-700">
                                {dest}
                              </td>
                              <td className="px-3 py-2 text-slate-700">
                                {carrier}
                              </td>
                              <td className="px-3 py-2 text-right text-slate-700">
                                {typeof containers === "number"
                                  ? containers.toLocaleString()
                                  : containers}
                              </td>
                              <td className="px-3 py-2 text-right text-slate-700">
                                {typeof teu === "number"
                                  ? teu.toLocaleString()
                                  : teu}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>

                <div className="flex items-center justify-between pt-2 text-xs text-slate-500">
                  <div />
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="xs"
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page === 1}
                    >
                      Prev
                    </Button>
                    <Button
                      variant="outline"
                      size="xs"
                      onClick={() => setPage((p) => p + 1)}
                      disabled={page * 50 >= filteredRows.length}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              </TabsContent>

              {/* Contacts */}
              <TabsContent value="contacts">
                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-600">
                  Contacts are gated. Save this company and upgrade your plan to
                  unlock enriched contacts and outreach workflows.
                </div>
              </TabsContent>
            </div>
          </Tabs>
        </div>

        {/* Branded gating overlay */}
        {showGate && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4"
            role="dialog"
            aria-modal="true"
            onClick={() => setShowGate(false)}
          >
            <div
              className="max-w-md rounded-3xl bg-white p-6 shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-3">
                <div
                  className="flex h-10 w-10 items-center justify-center rounded-2xl"
                  style={{ backgroundColor: "#EEE6FF" }}
                >
                  <Lock
                    className="h-5 w-5"
                    style={{ color: "#7F3DFF" }}
                  />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-slate-900">
                    Command Center Access
                  </h3>
                  <p className="mt-1 text-xs text-slate-600">
                    Saving companies and unlocking features like detailed contacts
                    and AI enrichment requires a paid subscription.
                  </p>
                </div>
              </div>

              <div className="mt-4 flex justify-end gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowGate(false)}
                >
                  Not now
                </Button>
                <Button
                  size="sm"
                  className="bg-[#7F3DFF] text-white hover:bg-[#6d2ee6]"
                  onClick={() => setShowGate(false)}
                >
                  Upgrade now
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
