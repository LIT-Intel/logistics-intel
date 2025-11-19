// frontend/src/components/search/CompanyModal.tsx
// @ts-nocheck

import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { getGatewayBase } from "@/lib/env";
import {
  X,
  Ship,
  Box,
  TrendingUp,
  MapPin,
  Globe,
  Database,
  Link as LinkIcon,
  Lock,
  BarChart as BarChartIcon,
} from "lucide-react";

type Company = {
  company_id?: string | null;
  company_name?: string;
  domain?: string | null;
  website?: string | null;
};

type ModalProps = {
  company: Company | null;
  open: boolean;
  onClose: (open: boolean) => void;
};

function normalizeString(value: unknown): string | null {
  if (value == null) return null;
  const text = String(value).trim();
  return text.length ? text : null;
}

export default function CompanyModal({ company, open, onClose }: ModalProps) {
  const [chartRows, setChartRows] = useState<any[]>([]);
  const [tableRows, setTableRows] = useState<any[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState<number>(0);
  const [loadingTable, setLoadingTable] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<
    "overview" | "summary" | "shipments" | "contacts"
  >("overview");
  const [mode, setMode] = useState<"air" | "ocean" | "">("");
  const [origin, setOrigin] = useState<string>("");
  const [dest, setDest] = useState<string>("");
  const [dateStart, setDateStart] = useState<string>("");
  const [dateEnd, setDateEnd] = useState<string>("");
  const [showGate, setShowGate] = useState(false);

  const companyId = normalizeString(
    company?.company_id ?? (company as any)?.companyId ?? (company as any)?.id,
  );
  const companyName = normalizeString(
    company?.company_name ?? (company as any)?.name,
  );
  const displayName = companyName ?? "Company";
  const apiBase = getGatewayBase();

  async function fetchShipmentsPage(params: {
    limit: number;
    offset: number;
    mode?: string;
    origin?: string;
    dest?: string;
    startDate?: string;
    endDate?: string;
  }) {
    if (!companyId && !companyName) {
      return { rows: [] as any[], total: 0 };
    }
    const search = new URLSearchParams();
    if (companyId) search.set("company_id", companyId);
    else if (companyName) search.set("company_name", companyName);
    search.set("limit", String(params.limit ?? 20));
    search.set("offset", String(params.offset ?? 0));
    if (params.mode) search.set("mode", params.mode);
    if (params.origin) search.set("origin", params.origin);
    if (params.dest) search.set("dest", params.dest);
    if (params.startDate) search.set("startDate", params.startDate);
    if (params.endDate) search.set("endDate", params.endDate);

    const response = await fetch(
      `${apiBase}/public/getCompanyShipments?${search.toString()}`,
      {
        method: "GET",
        headers: { accept: "application/json" },
      },
    );
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(text || `getCompanyShipments ${response.status}`);
    }
    const data = await response.json();
    const rows = Array.isArray(data?.rows)
      ? data.rows
      : Array.isArray(data)
        ? data
        : Array.isArray(data?.items)
          ? data.items
          : [];
    const total = Number(
      data?.meta?.total ?? data?.total ?? rows.length ?? 0,
    );
    return {
      rows: Array.isArray(rows) ? rows : [],
      total: Number.isFinite(total) ? total : rows.length,
    };
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!open || (!companyId && !companyName)) return;
      try {
        const { rows } = await fetchShipmentsPage({ limit: 1000, offset: 0 });
        if (!cancelled) setChartRows(Array.isArray(rows) ? rows : []);
      } catch {
        if (!cancelled) setChartRows([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, companyId, companyName, apiBase]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!open || activeTab !== "shipments" || (!companyId && !companyName))
        return;
      setLoadingTable(true);
      setError(null);
      try {
        const { rows, total } = await fetchShipmentsPage({
          limit: 50,
          offset: (page - 1) * 50,
          mode: mode || undefined,
          origin: origin || undefined,
          dest: dest || undefined,
          startDate: dateStart || undefined,
          endDate: dateEnd || undefined,
        });
        if (!cancelled) {
          setTableRows(Array.isArray(rows) ? rows : []);
          setTotal(
            typeof total === "number" && Number.isFinite(total)
              ? total
              : Array.isArray(rows)
                ? rows.length
                : 0,
          );
        }
      } catch (e: any) {
        if (!cancelled) {
          setTableRows([]);
          setTotal(0);
          setError("Failed to load shipments");
        }
      } finally {
        if (!cancelled) setLoadingTable(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    open,
    activeTab,
    page,
    companyId,
    companyName,
    mode,
    origin,
    dest,
    dateStart,
    dateEnd,
    apiBase,
  ]);

  const website = (company?.website || company?.domain || "")?.toString();

  const monthlyVolumes = useMemo(() => {
    const now = new Date();
    const months: { key: string; month: string; volume: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
        2,
        "0",
      )}`;
      months.push({
        key,
        month: d.toLocaleString(undefined, { month: "short" }),
        volume: 0,
      });
    }
    const byKey = new Map(months.map((m) => [m.key, m]));
    for (const r of chartRows) {
      const raw =
        (r as any)?.date?.value ||
        (r as any)?.shipment_date?.value ||
        (r as any)?.shipped_on ||
        null;
      if (!raw) continue;
      const dt = new Date(String(raw));
      if (isNaN(dt.getTime())) continue;
      const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(
        2,
        "0",
      )}`;
      const vol =
        typeof (r as any)?.teu === "number" ? Number((r as any).teu) : 1;
      if (byKey.has(key)) byKey.get(key)!.volume += vol;
    }
    return months;
  }, [chartRows]);

  const topRoute = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of chartRows) {
      const o =
        (r as any)?.origin_country ||
        (r as any)?.origin_city ||
        (r as any)?.origin_port ||
        "—";
      const d =
        (r as any)?.dest_country ||
        (r as any)?.dest_city ||
        (r as any)?.dest_port ||
        "—";
      const key = `${o} → ${d}`;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    let best = "—",
      max = 0;
    for (const [k, v] of counts) {
      if (v > max) {
        max = v;
        best = k;
      }
    }
    return best;
  }, [chartRows]);

  const displayedRows = useMemo(() => {
    if (!dateStart && !dateEnd) return tableRows;
    const s = dateStart ? new Date(dateStart) : null;
    const e = dateEnd ? new Date(dateEnd) : null;
    return tableRows.filter((r) => {
      const raw =
        (r as any)?.date?.value ||
        (r as any)?.shipment_date?.value ||
        (r as any)?.shipped_on ||
        null;
      if (!raw) return false;
      const dt = new Date(String(raw));
      if (s && dt < s) return false;
      if (e && dt > e) return false;
      return true;
    });
  }, [tableRows, dateStart, dateEnd]);

  if (!open || !company) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="flex h-[95vh] max-w-4xl flex-col rounded-xl bg-white p-0">
        <DialogHeader className="border-b p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <DialogTitle
                className="truncate text-2xl font-bold"
                style={{ color: "#7F3DFF" }}
                title={displayName}
              >
                {displayName}
              </DialogTitle>
              <div className="mt-2 flex flex-wrap items-center gap-4 text-sm text-gray-600">
                <div>ID: {companyId ?? "—"}</div>
                {website && (
                  <div className="flex items-center gap-1.5">
                    <Globe className="h-4 w-4" />
                    <a
                      className="text-blue-600 hover:underline"
                      href={`https://${website.replace(/^https?:\/\//, "")}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {website.replace(/^https?:\/\//, "")}
                    </a>
                  </div>
                )}
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onClose(false)}
              aria-label="Close"
              className="rounded-full text-gray-500 hover:text-gray-900"
            >
              <X className="h-5 w-5" />
            </Button>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-hidden">
          <Tabs
            value={activeTab}
            onValueChange={(v: any) => setActiveTab(v)}
            className="flex h-full flex-col"
          >
            <div className="border-b px-6">
              <TabsList className="gap-2">
                <TabsTrigger
                  value="overview"
                  className="border-b-2 border-transparent rounded-none data-[state=active]:border-b-2 data-[state=active]:border-[#7F3DFF] data-[state=active]:text-[#7F3DFF]"
                >
                  Overview
                </TabsTrigger>
                <TabsTrigger
                  value="summary"
                  className="border-b-2 border-transparent rounded-none data-[state=active]:border-b-2 data-[state=active]:border-[#7F3DFF] data-[state=active]:text-[#7F3DFF]"
                >
                  Shipment Summary
                </TabsTrigger>
                <TabsTrigger
                  value="shipments"
                  className="border-b-2 border-transparent rounded-none data-[state=active]:border-b-2 data-[state=active]:border-[#7F3DFF] data-[state=active]:text-[#7F3DFF]"
                >
                  Shipments
                </TabsTrigger>
                <TabsTrigger
                  value="contacts"
                  className="border-b-2 border-transparent rounded-none data-[state=active]:border-b-2 data-[state=active]:border-[#7F3DFF] data-[state=active]:text-[#7F3DFF]"
                  onClick={() => setShowGate(true)}
                >
                  Contacts
                </TabsTrigger>
              </TabsList>
            </div>

            <div className="flex-1 overflow-auto">
              {/* Overview */}
              <TabsContent value="overview" className="space-y-6 p-6">
                <h3 className="text-xl font-bold text-gray-900">
                  Company Profile
                </h3>
                <div className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
                  <div className="flex items-center gap-2 rounded-lg border border-gray-100 bg-white p-3 shadow-sm">
                    <Database className="h-5 w-5 text-gray-500" />
                    <div>
                      <div className="text-xs font-semibold uppercase text-gray-500">
                        Company ID
                      </div>
                      <div className="font-semibold text-gray-800">
                        {companyId ?? "—"}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 rounded-lg border border-gray-100 bg-white p-3 shadow-sm">
                    <LinkIcon className="h-5 w-5 text-gray-500" />
                    <div>
                      <div className="text-xs font-semibold uppercase text-gray-500">
                        Website
                      </div>
                      <div className="max-w-[280px] truncate font-semibold text-gray-800">
                        {website ? website.replace(/^https?:\/\//, "") : "—"}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 rounded-lg border border-gray-100 bg-white p-3 shadow-sm">
                    <Ship className="h-5 w-5 text-gray-500" />
                    <div>
                      <div className="text-xs font-semibold uppercase text-gray-500">
                        Total Shipments (12m)
                      </div>
                      <div className="font-semibold text-gray-800">
                        {(company as any)?.shipments_12m ?? "—"}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 rounded-lg border border-gray-100 bg-white p-3 shadow-sm">
                    <Box className="h-5 w-5 text-gray-500" />
                    <div>
                      <div className="text-xs font-semibold uppercase text-gray-500">
                        Total TEUs (12m)
                      </div>
                      <div className="font-semibold text-gray-800">
                        {(company as any)?.total_teus != null
                          ? Number((company as any).total_teus).toLocaleString()
                          : "—"}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 rounded-lg border border-gray-100 bg-white p-3 shadow-sm sm:col-span-2">
                    <MapPin className="h-5 w-5 text-gray-500" />
                    <div>
                      <div className="text-xs font-semibold uppercase text-gray-500">
                        Top Trade Route
                      </div>
                      <div className="font-semibold text-gray-800">
                        {topRoute}
                      </div>
                    </div>
                  </div>
                </div>
                <div
                  className="rounded-xl border p-4"
                  style={{ backgroundColor: "#EEE6FF" }}
                >
                  <h4 className="mb-1 flex items-center text-lg font-bold text-gray-800">
                    <BarChartIcon
                      className="mr-2 h-5 w-5"
                      style={{ color: "#7F3DFF" }}
                    />
                    Sales Intelligence Available
                  </h4>
                  <p className="text-sm text-gray-700">
                    Access real-time contacts and AI-enriched insights about
                    this company&apos;s supply chain strategy by saving them to
                    your Command Center.
                  </p>
                </div>
              </TabsContent>

              {/* Summary */}
              <TabsContent value="summary" className="space-y-6 p-6">
                <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                  <div className="rounded-xl border border-gray-200 bg-white p-4 text-center">
                    <Ship
                      className="mx-auto mb-2 h-6 w-6"
                      style={{ color: "#7F3DFF" }}
                    />
                    <div className="text-2xl font-bold">
                      {(company as any)?.shipments_12m ?? "—"}
                    </div>
                    <div className="mt-1 text-xs font-medium uppercase text-gray-500">
                      Total Shipments (12m)
                    </div>
                  </div>
                  <div className="rounded-xl border border-gray-200 bg-white p-4 text-center">
                    <Box
                      className="mx-auto mb-2 h-6 w-6"
                      style={{ color: "#7F3DFF" }}
                    />
                    <div className="text-2xl font-bold">
                      {(company as any)?.total_teus != null
                        ? Number((company as any).total_teus).toLocaleString()
                        : "—"}
                    </div>
                    <div className="mt-1 text-xs font-medium uppercase text-gray-500">
                      Total TEUs (12m)
                    </div>
                  </div>
                  <div className="rounded-xl border border-gray-200 bg-white p-4 text-center">
                    <TrendingUp
                      className="mx-auto mb-2 h-6 w-6"
                      style={{ color: "#7F3DFF" }}
                    />
                    <div className="text-2xl font-bold">
                      {(company as any)?.growth_rate != null
                        ? `${Math.round(
                            Number((company as any).growth_rate) * 100,
                          )}%`
                        : "—"}
                    </div>
                    <div className="mt-1 text-xs font-medium uppercase text-gray-500">
                      Growth Rate (YoY)
                    </div>
                  </div>
                  <div className="rounded-xl border border-gray-200 bg-white p-4 text-center">
                    <MapPin className="mx-auto mb-2 h-6 w-6 text-red-500" />
                    <div className="text-lg font-bold">{topRoute}</div>
                    <div className="mt-1 text-xs font-medium uppercase text-gray-500">
                      Primary Route
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
                  <h3 className="mb-4 flex items-center text-lg font-bold text-gray-900">
                    <BarChartIcon
                      className="mr-2 h-5 w-5"
                      style={{ color: "#7F3DFF" }}
                    />
                    12-Month Shipment Volume (TEU Equivalent)
                  </h3>
                  <div className="relative h-[150px]">
                    <div className="absolute inset-x-0 top-0 h-0 border-t border-dashed border-gray-200" />
                    <div className="absolute inset-x-0 top-1/2 h-0 -translate-y-1/2 border-t border-dashed border-gray-200" />
                    <div className="absolute inset-x-0 bottom-0 h-0 border-t border-dashed border-gray-200" />
                    <div className="flex h-full items-end justify-around gap-2 px-1">
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
                              className="group relative flex flex-1 flex-col items-center justify-end"
                              style={{ minWidth: "20px" }}
                            >
                              <div className="absolute -top-7 whitespace-nowrap rounded bg-gray-900 px-2 py-1 text-[11px] text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
                                {v.volume.toLocaleString()}
                              </div>
                              <div
                                className="w-full rounded-t-sm shadow-[inset_0_0_6px_rgba(255,255,255,0.3),0_6px_12px_rgba(0,0,0,0.15)] transition-all duration-300 hover:opacity-90"
                                style={{
                                  height: `${barH}px`,
                                  background: `linear-gradient(180deg, ${color} 0%, ${color} 60%, #5f2fd1 100%)`,
                                }}
                              />
                              <div className="mt-1 text-[11px] text-gray-500">
                                {v.month}
                              </div>
                            </div>
                          );
                        });
                      })()}
                    </div>
                  </div>
                  <p className="mt-4 text-center text-xs text-gray-400">
                    Data represents estimated monthly shipment volume over the
                    last 12 months.
                  </p>
                </div>
              </TabsContent>

              {/* Shipments */}
              <TabsContent value="shipments" className="space-y-4 p-6">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                  <div>
                    <div className="mb-1 text-xs text-gray-600">Start date</div>
                    <input
                      type="date"
                      className="rounded border px-3 py-2 text-sm"
                      value={dateStart}
                      onChange={(e) => {
                        setPage(1);
                        setDateStart(e.target.value);
                      }}
                    />
                  </div>
                  <div>
                    <div className="mb-1 text-xs text-gray-600">End date</div>
                    <input
                      type="date"
                      className="rounded border px-3 py-2 text-sm"
                      value={dateEnd}
                      onChange={(e) => {
                        setPage(1);
                        setDateEnd(e.target.value);
                      }}
                    />
                  </div>
                  <div>
                    <div className="mb-1 text-xs text-gray-600">Mode</div>
                    <select
                      className="rounded border px-3 py-2 text-sm"
                      value={mode}
                      onChange={(e) => {
                        setPage(1);
                        setMode(e.target.value as any);
                      }}
                    >
                      <option value="">Any</option>
                      <option value="ocean">Ocean</option>
                      <option value="air">Air</option>
                    </select>
                  </div>
                  <div>
                    <div className="mb-1 text-xs text-gray-600">Origin</div>
                    <input
                      className="rounded border px-3 py-2 text-sm"
                      value={origin}
                      onChange={(e) => {
                        setPage(1);
                        setOrigin(e.target.value);
                      }}
                      placeholder="CN"
                    />
                  </div>
                  <div>
                    <div className="mb-1 text-xs text-gray-600">
                      Destination
                    </div>
                    <input
                      className="rounded border px-3 py-2 text-sm"
                      value={dest}
                      onChange={(e) => {
                        setPage(1);
                        setDest(e.target.value);
                      }}
                      placeholder="US"
                    />
                  </div>
                  <div className="text-sm text-gray-600 sm:ml-auto">
                    Page {page} · 50 per page{" "}
                    {total ? `· ${total} total` : ""}
                  </div>
                </div>

                {error && (
                  <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                    {error}
                  </div>
                )}

                <div className="overflow-auto rounded-xl border border-gray-200 bg-white">
                  {loadingTable ? (
                    <div className="p-6 text-sm text-gray-500">
                      Loading shipments…
                    </div>
                  ) : displayedRows.length === 0 ? (
                    <div className="p-6 text-sm text-gray-500">
                      No shipments found.
                    </div>
                  ) : (
                    <table className="min-w-full text-sm">
                      <thead className="bg-gray-50 text-gray-600">
                        <tr>
                          <th className="px-3 py-2 text-left font-medium">
                            Date
                          </th>
                          <th className="px-3 py-2 text-left font-medium">
                            Mode
                          </th>
                          <th className="px-3 py-2 text-left font-medium">
                            Origin
                          </th>
                          <th className="px-3 py-2 text-left font-medium">
                            Destination
                          </th>
                          <th className="px-3 py-2 text-left font-medium">
                            Carrier
                          </th>
                          <th className="px-3 py-2 text-right font-medium">
                            Containers
                          </th>
                          <th className="px-3 py-2 text-right font-medium">
                            TEUs
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {displayedRows.map((r, i) => {
                          const d =
                            (r as any)?.date?.value ||
                            (r as any)?.shipment_date?.value ||
                            (r as any)?.shipped_on ||
                            null;
                          const modeVal =
                            (r as any)?.mode ||
                            (r as any)?.transport_mode ||
                            "—";
                          const originVal =
                            (r as any)?.origin_city ||
                            (r as any)?.origin_country ||
                            (r as any)?.origin_port ||
                            "—";
                          const destVal =
                            (r as any)?.dest_city ||
                            (r as any)?.dest_country ||
                            (r as any)?.dest_port ||
                            "—";
                          const carrier = (r as any)?.carrier || "—";
                          const containers =
                            (r as any)?.container_count ?? "—";
                          const teu = (r as any)?.teu ?? "—";
                          return (
                            <tr key={i} className="bg-white">
                              <td className="whitespace-nowrap px-3 py-2">
                                {d
                                  ? new Date(String(d)).toLocaleDateString()
                                  : "—"}
                              </td>
                              <td className="px-3 py-2 capitalize">
                                {String(modeVal).toLowerCase()}
                              </td>
                              <td className="px-3 py-2">{originVal}</td>
                              <td className="px-3 py-2">{destVal}</td>
                              <td className="px-3 py-2">{carrier}</td>
                              <td className="px-3 py-2 text-right">
                                {typeof containers === "number"
                                  ? containers.toLocaleString()
                                  : containers}
                              </td>
                              <td className="px-3 py-2 text-right">
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

                <div className="flex items-center justify-between">
                  <div />
                  <div className="space-x-2">
                    <button
                      className="rounded px-3 py-1 border disabled:opacity-50"
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page === 1}
                    >
                      Prev
                    </button>
                    <button
                      className="rounded px-3 py-1 border disabled:opacity-50"
                      onClick={() => setPage((p) => p + 1)}
                      disabled={page * 50 >= total}
                    >
                      Next
                    </button>
                  </div>
                </div>
              </TabsContent>

              {/* Contacts */}
              <TabsContent value="contacts" className="p-6">
                <div className="text-sm text-gray-600">
                  Contacts are gated.
                </div>
              </TabsContent>
            </div>
          </Tabs>
        </div>

        {showGate && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/75 p-4"
            role="dialog"
            aria-modal="true"
            onClick={() => setShowGate(false)}
          >
            <div
              className="w-full max-w-sm rounded-xl bg-white p-6 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div
                className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full"
                style={{ backgroundColor: "#EEE6FF" }}
              >
                <Lock className="h-8 w-8" style={{ color: "#7F3DFF" }} />
              </div>
              <h3 className="mb-2 text-xl font-bold text-gray-900">
                Command Center Access
              </h3>
              <p className="mb-4 text-sm text-gray-600">
                Saving companies and unlocking features like detailed contacts
                and AI enrichment requires a paid subscription.
              </p>
              <div className="flex justify-end gap-2">
                <button
                  className="rounded-lg px-3 py-2 text-sm text-gray-700 hover:bg-gray-100"
                  onClick={() => setShowGate(false)}
                >
                  Not now
                </button>
                <button
                  className="rounded-lg px-3 py-2 text-sm text-white"
                  style={{ backgroundColor: "#7F3DFF" }}
                  onClick={() => setShowGate(false)}
                >
                  Upgrade Now
                </button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
