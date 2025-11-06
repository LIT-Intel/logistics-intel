"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  searchCompanies,
  kpiFrom,
  CompanyItem,
  getCompanyKey,
  getImportYetiCompany,
} from "@/lib/api";
import type { ImportYetiCompany } from "@/types/importyeti";
import CompanyLanesPanel from "@/components/CompanyLanesPanel";
import CompanyShipmentsPanel from "@/components/company/CompanyShipmentsPanel";
import { Input } from "@/components/ui/input";
import { Loader2, Search } from "lucide-react";
import {
  LineChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type TabKey =
  | "Overview"
  | "Shipments"
  | "Commodities"
  | "Suppliers"
  | "Ports"
  | "Aliases"
  | "Contacts"
  | "Campaigns"
  | "RFP";

const IMPORT_YETI_TABS: TabKey[] = [
  "Overview",
  "Shipments",
  "Commodities",
  "Suppliers",
  "Ports",
  "Aliases",
  "Contacts",
];

const DEFAULT_TABS: TabKey[] = [
  "Overview",
  "Shipments",
  "Contacts",
  "Campaigns",
  "RFP",
];

const DEFAULT_KPIS = {
  shipments12m: "—",
  lastActivity: "—",
  topOrigin: "—",
  topDestination: "—",
  topCarrier: "—",
};

const SHIPMENTS_PAGE_SIZE = 15;

function formatNumber(value: unknown) {
  if (value == null) return "—";
  const num = typeof value === "number" ? value : Number(String(value).replace(/,/g, ""));
  if (!Number.isFinite(num)) return "—";
  return new Intl.NumberFormat().format(num);
}

function formatDate(
  value: unknown,
  opts: Intl.DateTimeFormatOptions = { year: "numeric", month: "short", day: "numeric" }
) {
  if (!value) return "—";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString(undefined, opts);
}

function initialsFrom(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "";
  return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
}

function deriveLocation(company: Record<string, any>) {
  const city = company.city ?? company.company_city ?? company.origin_city ?? company.city_name ?? "";
  const state = company.state ?? company.company_state ?? company.origin_state ?? "";
  const country = company.country ?? company.company_country ?? company.origin_country ?? company.country_iso ?? "";
  const pieces = [city, state, country].filter(Boolean);
  return pieces.join(", ") || "Location unknown";
}

function deriveGrowth(company: Record<string, any>) {
  const growth =
    company.growth_rate ??
    company.growthRate ??
    company.yoy_growth ??
    company.change ??
    null;
  if (growth == null) return "—";
  const numeric = typeof growth === "number" ? growth : Number(growth);
  if (Number.isNaN(numeric)) return String(growth);
  const formatted = `${numeric > 0 ? "+" : ""}${numeric.toFixed(Math.abs(numeric) >= 10 ? 0 : 1)}%`;
  return formatted;
}

function formatPercent(value: number | null | undefined) {
  if (value == null || Number.isNaN(Number(value))) return "—";
  return `${Number(value).toFixed(1)}%`;
}

function formatDateRange(range?: { start_date?: string; end_date?: string }) {
  const start = range?.start_date ? formatDate(range.start_date, { month: "short", year: "numeric" }) : null;
  const end = range?.end_date ? formatDate(range.end_date, { month: "short", year: "numeric" }) : null;
  if (!start && !end) return "—";
  if (start && end) return `${start} → ${end}`;
  return start ?? end ?? "—";
}

function deriveImportYetiSlug(company: CompanyItem | null): string | null {
  if (!company) return null;
  const source = typeof (company as any).source === "string" ? (company as any).source.toLowerCase() : "";
  const candidates = [
    (company as any).importyeti_slug,
    (company as any).importYetiSlug,
    source.includes("importyeti") ? (company as any).slug : null,
    (company as any).external_slug,
    typeof (company as any).externalKey === "string" && (company as any).externalKey.startsWith("importyeti:")
      ? (company as any).externalKey.split(":")[1]
      : null,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }
  return null;
}

function topEntries(
  record: Record<string, any> | undefined,
  extractor: (value: any) => number,
  limit = 3
) {
  if (!record) return [] as Array<{ name: string; value: number }>;
  return Object.entries(record)
    .map(([name, value]) => ({ name, value: extractor(value) }))
    .filter((item) => Number.isFinite(item.value) && item.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, limit);
}

function truncate(text: string, max = 40) {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}
export default function CommandCenter() {
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [companies, setCompanies] = useState<CompanyItem[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("Overview");
  const [importYetiDetail, setImportYetiDetail] = useState<ImportYetiCompany | null>(null);
  const [importYetiLoading, setImportYetiLoading] = useState(false);
  const [importYetiError, setImportYetiError] = useState<string | null>(null);
  const [shipmentsSearch, setShipmentsSearch] = useState("");
  const [shipmentsPage, setShipmentsPage] = useState(1);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchInput.trim()), 250);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    setListLoading(true);
    setListError(null);
    (async () => {
      try {
        const data = await searchCompanies({
          q: debouncedSearch || null,
          origin: null,
          dest: null,
          hs: null,
          limit: 30,
          offset: 0,
        });
        if (cancelled) return;
        const rows = Array.isArray((data as any)?.rows) ? (data as any).rows : [];
        const typed = rows as CompanyItem[];
        setCompanies(typed);
        setSelectedKey((prev) => {
          if (!typed.length) return null;
          if (prev && typed.some((item) => getCompanyKey(item) === prev)) {
            return prev;
          }
          return getCompanyKey(typed[0]);
        });
      } catch (error: any) {
        if (cancelled) return;
        setCompanies([]);
        setSelectedKey(null);
        setListError(error?.message ?? "Failed to load companies");
      } finally {
        if (!cancelled) setListLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [debouncedSearch]);

  const selectedCompany = useMemo(() => {
    if (!selectedKey) return null;
    return companies.find((item) => getCompanyKey(item) === selectedKey) ?? null;
  }, [companies, selectedKey]);

  useEffect(() => {
    if (typeof window !== "undefined" && window.innerWidth < 768) {
      document.getElementById("command-center-detail")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [selectedCompany]);

  const derivedKpis = useMemo(() => {
    if (!selectedCompany) return DEFAULT_KPIS;
    const base = kpiFrom(selectedCompany as CompanyItem);
    const shipmentsValue = base.shipments12m != null ? formatNumber(base.shipments12m) : "—";
    const lastActivity = base.lastActivity ? formatDate(base.lastActivity) : "—";
    const topOrigin = base.originsTop?.[0] ?? "—";
    const topDestination = base.destsTop?.[0] ?? "—";
    const topCarrier = base.carriersTop?.[0] ?? "—";
    return {
      shipments12m: shipmentsValue,
      lastActivity,
      topOrigin,
      topDestination,
      topCarrier,
    };
  }, [selectedCompany]);

  const selectedCompanyId = selectedCompany?.company_id ? String(selectedCompany.company_id) : null;
  const importYetiSlug = useMemo(() => deriveImportYetiSlug(selectedCompany), [selectedCompany]);
  const hasImportYetiData = Boolean(importYetiSlug);

  useEffect(() => {
    setShipmentsSearch("");
    setShipmentsPage(1);
  }, [importYetiSlug]);

  useEffect(() => {
    setShipmentsPage(1);
  }, [shipmentsSearch]);

  useEffect(() => {
    if (!importYetiSlug) {
      setImportYetiDetail(null);
      setImportYetiError(null);
      setImportYetiLoading(false);
      return;
    }
    const controller = new AbortController();
    let cancelled = false;
    setImportYetiLoading(true);
    setImportYetiError(null);
    getImportYetiCompany(importYetiSlug, controller.signal)
      .then((data) => {
        if (!cancelled) setImportYetiDetail(data);
      })
      .catch((err: any) => {
        if (!cancelled) {
          setImportYetiDetail(null);
          setImportYetiError(err?.message ?? "Failed to load ImportYeti profile");
        }
      })
      .finally(() => {
        if (!cancelled) setImportYetiLoading(false);
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [importYetiSlug]);

  const tabs = useMemo(() => (hasImportYetiData ? IMPORT_YETI_TABS : DEFAULT_TABS), [hasImportYetiData]);

  useEffect(() => {
    if (!tabs.includes(activeTab)) {
      setActiveTab("Overview");
    }
  }, [tabs, activeTab]);
  const trendData = useMemo(() => {
    if (!importYetiDetail?.time_series) return [] as Array<{ label: string; shipments: number }>;
    return Object.entries(importYetiDetail.time_series)
      .map(([key, value]) => ({
        key,
        label: formatDate(key, { month: "short", year: "2-digit" }),
        shipments: Number(value?.shipments ?? 0),
      }))
      .sort((a, b) => new Date(a.key).getTime() - new Date(b.key).getTime());
  }, [importYetiDetail?.time_series]);

  const topEntryPorts = useMemo(
    () => topEntries(importYetiDetail?.map_table?.entry_ports, (value) => Number(value?.shipments ?? 0)),
    [importYetiDetail?.map_table?.entry_ports]
  );

  const topExitPorts = useMemo(
    () => topEntries(importYetiDetail?.map_table?.exit_ports, (value) => Number(value?.shipments ?? 0)),
    [importYetiDetail?.map_table?.exit_ports]
  );

  const topOriginCountries = useMemo(
    () => topEntries(importYetiDetail?.map_table?.shipments_by_country, (value) => Number(value ?? 0)),
    [importYetiDetail?.map_table?.shipments_by_country]
  );

  const loadMix = useMemo(() => {
    const full = importYetiDetail?.containers_load?.full;
    const less = importYetiDetail?.containers_load?.less;
    return {
      fcl: formatPercent(full?.shipments_perc ?? full?.teu_perc ?? null),
      lcl: formatPercent(less?.shipments_perc ?? less?.teu_perc ?? null),
    };
  }, [importYetiDetail?.containers_load]);

  const shipmentsRows = importYetiDetail?.recent_bols ?? [];
  const filteredShipments = useMemo(() => {
    if (!shipmentsRows.length) return [] as typeof shipmentsRows;
    if (!shipmentsSearch.trim()) return shipmentsRows;
    const needle = shipmentsSearch.trim().toLowerCase();
    return shipmentsRows.filter((row) => {
      const a = row?.Bill_of_Lading ?? "";
      const b = row?.Master_Bill_of_Lading ?? "";
      return a.toLowerCase().includes(needle) || b.toLowerCase().includes(needle);
    });
  }, [shipmentsRows, shipmentsSearch]);

  const shipmentsPageCount = Math.max(1, Math.ceil(filteredShipments.length / SHIPMENTS_PAGE_SIZE));
  const paginatedShipments = filteredShipments.slice(
    (shipmentsPage - 1) * SHIPMENTS_PAGE_SIZE,
    shipmentsPage * SHIPMENTS_PAGE_SIZE
  );
  const overviewContentDefault = (
    <div className="grid grid-cols-1 gap-[5px] md:grid-cols-12">
      <div className="md:col-span-7 rounded-2xl border border-slate-200 bg-white p-4 md:p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-800">Top Lanes</h3>
        </div>
        <div className="mt-3">
          <CompanyLanesPanel companyId={selectedCompanyId} limit={3} />
        </div>
      </div>
      <div className="md:col-span-5 rounded-2xl border border-slate-200 bg-white p-4 md:p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-800">At a Glance</h3>
        <dl className="mt-3 space-y-2 text-sm">
          <div className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2">
            <dt className="text-slate-500">Shipments (12m)</dt>
            <dd className="font-semibold text-slate-900">{derivedKpis.shipments12m}</dd>
          </div>
          <div className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2">
            <dt className="text-slate-500">Last activity</dt>
            <dd className="font-semibold text-slate-900">{derivedKpis.lastActivity}</dd>
          </div>
          <div className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2">
            <dt className="text-slate-500">Top origin</dt>
            <dd className="font-semibold text-slate-900">{derivedKpis.topOrigin}</dd>
          </div>
          <div className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2">
            <dt className="text-slate-500">Top destination</dt>
            <dd className="font-semibold text-slate-900">{derivedKpis.topDestination}</dd>
          </div>
          <div className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2">
            <dt className="text-slate-500">Top carrier</dt>
            <dd className="font-semibold text-slate-900">{derivedKpis.topCarrier}</dd>
          </div>
        </dl>
      </div>
    </div>
  );

  const overviewContentImportYeti = (
    <div className="space-y-4">
      {importYetiLoading ? (
        <div className="flex h-48 items-center justify-center text-slate-500">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading ImportYeti overview…
        </div>
      ) : importYetiError ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-6 text-sm text-red-700">
          {importYetiError}
        </div>
      ) : importYetiDetail ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <InfoCard label="Total shipments" value={formatNumber(importYetiDetail.total_shipments)} />
          <InfoCard
            label="Load mix"
            value={
              <div className="flex flex-col text-sm text-slate-700">
                <span>
                  FCL: <span className="font-semibold text-slate-900">{loadMix.fcl}</span>
                </span>
                <span>
                  LCL: <span className="font-semibold text-slate-900">{loadMix.lcl}</span>
                </span>
              </div>
            }
          />
          <InfoCard label="Date range" value={formatDateRange(importYetiDetail.date_range)} />
          <InfoCard
            label="Top entry ports"
            value={
              <ul className="space-y-1 text-sm text-slate-700">
                {topEntryPorts.length ? (
                  topEntryPorts.map((port) => (
                    <li key={port.name} className="flex justify-between">
                      <span className="truncate pr-3" title={port.name}>{truncate(port.name, 28)}</span>
                      <span className="font-semibold text-slate-900">{formatNumber(port.value)}</span>
                    </li>
                  ))
                ) : (
                  <li>—</li>
                )}
              </ul>
            }
          />
          <InfoCard
            label="Top origin countries"
            value={
              <ul className="space-y-1 text-sm text-slate-700">
                {topOriginCountries.length ? (
                  topOriginCountries.map((country) => (
                    <li key={country.name} className="flex justify-between">
                      <span>{country.name}</span>
                      <span className="font-semibold text-slate-900">{formatNumber(country.value)}</span>
                    </li>
                  ))
                ) : (
                  <li>—</li>
                )}
              </ul>
            }
          />
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Trend (12m)</span>
              <span className="text-xs text-slate-400">Shipments</span>
            </div>
            <div className="mt-3 h-40">
              {trendData.length ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trendData} margin={{ left: -20, right: 10, top: 10, bottom: 0 }}>
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#64748b" }} stroke="#e2e8f0" tickLine={false} axisLine={false} interval="preserveStartEnd" />
                    <YAxis hide domain={[0, "auto"]} />
                    <Tooltip
                      contentStyle={{ borderRadius: 12, borderColor: "#e2e8f0" }}
                      formatter={(value) => [formatNumber(value as number), "Shipments"]}
                    />
                    <Line type="monotone" dataKey="shipments" stroke="#4c1d95" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-full items-center justify-center text-xs text-slate-500">No trend data</div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-6 py-12 text-center text-sm text-slate-500">
          Select a shipper to load ImportYeti intelligence.
        </div>
      )}
    </div>
  );
  const shipmentsContentDefault = (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 md:p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-800">Recent Shipments</h3>
      </div>
      <CompanyShipmentsPanel companyId={selectedCompanyId} limit={50} />
    </div>
  );

  const shipmentsContentImportYeti = (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1">
          <h3 className="text-sm font-semibold text-slate-800">Recent Bills of Lading</h3>
          <p className="text-xs text-slate-500">
            Filter by B/L to locate a specific shipment. Showing {filteredShipments.length.toLocaleString()} records.
          </p>
        </div>
        <div className="flex w-full items-center gap-2 sm:w-72">
          <Input
            value={shipmentsSearch}
            onChange={(event) => setShipmentsSearch(event.target.value)}
            placeholder="Search by B/L number"
          />
        </div>
      </div>
      {importYetiLoading ? (
        <div className="flex h-48 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-500">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading shipments…
        </div>
      ) : importYetiError ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-6 text-sm text-red-700">
          {importYetiError}
        </div>
      ) : !filteredShipments.length ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-6 py-12 text-center text-sm text-slate-500">
          No shipments match this filter.
        </div>
      ) : (
        <div className="space-y-3">
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
            <table className="min-w-full divide-y divide-slate-100 text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 text-left">Date</th>
                  <th className="px-4 py-3 text-left">B/L</th>
                  <th className="px-4 py-3 text-left">MBL</th>
                  <th className="px-4 py-3 text-left">Bill Type</th>
                  <th className="px-4 py-3 text-left">Country</th>
                  <th className="px-4 py-3 text-right">Weight (kg)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white text-slate-700">
                {paginatedShipments.map((row, index) => (
                  <tr key={`${row?.Bill_of_Lading ?? row?.Master_Bill_of_Lading ?? index}-${index}`}>
                    <td className="whitespace-nowrap px-4 py-3">{formatDate(row?.date_formatted)}</td>
                    <td className="px-4 py-3 text-slate-900" title={row?.Bill_of_Lading ?? undefined}>{row?.Bill_of_Lading ?? "—"}</td>
                    <td className="px-4 py-3" title={row?.Master_Bill_of_Lading ?? undefined}>{row?.Master_Bill_of_Lading ?? "—"}</td>
                    <td className="px-4 py-3">{row?.Bill_Type_Code ?? "—"}</td>
                    <td className="px-4 py-3">{row?.Country ?? "—"}</td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-900">{formatNumber(row?.Weight_in_KG)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {shipmentsPageCount > 1 && (
            <div className="flex items-center justify-between text-sm text-slate-600">
              <span>
                Page {shipmentsPage} of {shipmentsPageCount}
              </span>
              <div className="flex gap-2">
                <button
                  className="rounded-xl border border-slate-200 px-3 py-1.5 text-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                  onClick={() => setShipmentsPage((prev) => Math.max(1, prev - 1))}
                  disabled={shipmentsPage === 1}
                >
                  Prev
                </button>
                <button
                  className="rounded-xl border border-slate-200 px-3 py-1.5 text-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                  onClick={() => setShipmentsPage((prev) => Math.min(shipmentsPageCount, prev + 1))}
                  disabled={shipmentsPage >= shipmentsPageCount}
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
  const commoditiesContent = (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-slate-800">Commodities</h3>
      {importYetiLoading ? (
        <div className="flex h-32 items-center justify-center text-slate-500">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading HS codes…
        </div>
      ) : !importYetiDetail?.hs_codes?.length ? (
        <div className="mt-6 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
          No commodity data available.
        </div>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-100 text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-3 text-left">HS Code</th>
                <th className="px-3 py-3 text-left">Description</th>
                <th className="px-3 py-3 text-right">Shipments</th>
                <th className="px-3 py-3 text-right">12m</th>
                <th className="px-3 py-3 text-right">TEU</th>
                <th className="px-3 py-3 text-right">Weight</th>
                <th className="px-3 py-3 text-center">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {importYetiDetail.hs_codes!.map((row, index) => (
                <tr key={`${row.hs_code}-${index}`} className="text-slate-700">
                  <td className="px-3 py-3 font-semibold text-slate-900">{row.hs_code}</td>
                  <td className="px-3 py-3">{row.description ?? "—"}</td>
                  <td className="px-3 py-3 text-right">{formatNumber(row.shipments)}</td>
                  <td className="px-3 py-3 text-right">{formatNumber(row.shipments_12m)}</td>
                  <td className="px-3 py-3 text-right">{formatNumber(row.teu)}</td>
                  <td className="px-3 py-3 text-right">{formatNumber(row.weight)}</td>
                  <td className="px-3 py-3 text-center">
                    {row.children && row.children.length ? (
                      <span className="inline-flex rounded-full bg-indigo-50 px-2 py-1 text-xs font-medium text-indigo-700">
                        Has sub-chapters
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );

  const suppliersContent = (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-slate-800">Suppliers</h3>
      {importYetiLoading ? (
        <div className="flex h-32 items-center justify-center text-slate-500">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading suppliers…
        </div>
      ) : !importYetiDetail?.suppliers_table?.length ? (
        <div className="mt-6 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
          No supplier data available.
        </div>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-100 text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-3 text-left">Supplier</th>
                <th className="px-3 py-3 text-left">Country</th>
                <th className="px-3 py-3 text-right">Shipments</th>
                <th className="px-3 py-3 text-right">12m</th>
                <th className="px-3 py-3 text-left">First</th>
                <th className="px-3 py-3 text-left">Most Recent</th>
                <th className="px-3 py-3 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {importYetiDetail.suppliers_table!.map((row, index) => (
                <tr key={`${row.supplier_name}-${index}`}>
                  <td className="px-3 py-3 font-semibold text-slate-900">{row.supplier_name}</td>
                  <td className="px-3 py-3">{row.country ?? row.country_code ?? "—"}</td>
                  <td className="px-3 py-3 text-right">{formatNumber(row.total_shipments_company)}</td>
                  <td className="px-3 py-3 text-right">{formatNumber(row.shipments_12m)}</td>
                  <td className="px-3 py-3">{row.first_shipment ? formatDate(row.first_shipment, { month: "short", year: "numeric" }) : "—"}</td>
                  <td className="px-3 py-3">{row.most_recent_shipment ? formatDate(row.most_recent_shipment, { month: "short", year: "numeric" }) : "—"}</td>
                  <td className="px-3 py-3 text-center">
                    <button className="rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-400" disabled>
                      View supplier
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );

  const portsContent = (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-800">Top Exit Ports</h3>
        {importYetiLoading ? (
          <div className="flex h-24 items-center justify-center text-slate-500">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : !topExitPorts.length ? (
          <div className="mt-3 text-sm text-slate-500">No exit port data.</div>
        ) : (
          <ul className="mt-3 space-y-2 text-sm text-slate-700">
            {topExitPorts.map((port) => (
              <li key={port.name} className="flex items-center justify-between">
                <span className="truncate pr-3" title={port.name}>{truncate(port.name, 28)}</span>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
                  {formatNumber(port.value)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-800">Top Entry Ports</h3>
        {importYetiLoading ? (
          <div className="flex h-24 items-center justify-center text-slate-500">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : !topEntryPorts.length ? (
          <div className="mt-3 text-sm text-slate-500">No entry port data.</div>
        ) : (
          <ul className="mt-3 space-y-2 text-sm text-slate-700">
            {topEntryPorts.map((port) => (
              <li key={port.name} className="flex items-center justify-between">
                <span className="truncate pr-3" title={port.name}>{truncate(port.name, 28)}</span>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
                  {formatNumber(port.value)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );

  const aliasesContent = (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-800">Aliases</h3>
        {importYetiLoading ? (
          <div className="flex h-24 items-center justify-center text-slate-500">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : !importYetiDetail?.also_known_names?.length ? (
          <div className="mt-3 text-sm text-slate-500">No aliases on record.</div>
        ) : (
          <div className="mt-3 flex flex-wrap gap-2">
            {importYetiDetail.also_known_names.map((alias, index) => (
              <span key={`${alias}-${index}`} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                {alias}
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-800">Addresses & Contacts</h3>
        {importYetiLoading ? (
          <div className="flex h-24 items-center justify-center text-slate-500">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : (
          <div className="mt-3 space-y-3 text-sm text-slate-700">
            {importYetiDetail?.address && (
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Primary</div>
                <div>{importYetiDetail.address}</div>
              </div>
            )}
            {importYetiDetail?.other_addresses_contact_info?.length ? (
              importYetiDetail.other_addresses_contact_info.map((entry, index) => (
                <div key={`${entry.address ?? index}-${index}`} className="rounded-xl border border-slate-200 px-3 py-2">
                  <div className="font-semibold text-slate-900">{entry.address ?? "—"}</div>
                  <div className="text-xs text-slate-500">
                    Most recent shipment to: {entry.most_recent_shipment_to ?? "—"}
                  </div>
                  {(entry.contact_info_data?.emails?.length || entry.contact_info_data?.phone_numbers?.length) && (
                    <div className="mt-1 space-y-1 text-xs text-slate-600">
                      {entry.contact_info_data?.emails?.length && (
                        <div>Emails: {entry.contact_info_data.emails.join(", ")}</div>
                      )}
                      {entry.contact_info_data?.phone_numbers?.length && (
                        <div>Phones: {entry.contact_info_data.phone_numbers.join(", ")}</div>
                      )}
                    </div>
                  )}
                </div>
              ))
            ) : (
              <div className="text-sm text-slate-500">No additional addresses recorded.</div>
            )}
          </div>
        )}
      </div>
    </div>
  );

  const contactsContent = (
    <div className="rounded-2xl border bg-white p-4 md:p-5 shadow-sm">
      <h3 className="text-sm font-semibold text-slate-800">Contacts</h3>
      <div className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center">
        <p className="text-sm text-slate-600">
          Unlock contact intelligence with <span className="font-semibold text-indigo-600">LIT Pro</span>.
        </p>
        <div className="mt-4 flex flex-col items-center justify-center gap-2 sm:flex-row">
          <button className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow hover:bg-indigo-700">
            Upgrade
          </button>
          <button className="rounded-xl border border-indigo-200 px-4 py-2 text-sm font-medium text-indigo-600 hover:bg-indigo-50">
            Learn more
          </button>
        </div>
      </div>
    </div>
  );

  const campaignsContent = (
    <div className="rounded-2xl border bg-white p-4 md:p-5 shadow-sm">
      <h3 className="text-sm font-semibold text-slate-800">Campaigns</h3>
      <p className="mt-3 text-sm text-slate-600">
        Send this company straight into a multichannel sequence or review existing outreach.
      </p>
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {["Start campaign", "Add to cadence", "Export prospect list"].map((title) => (
          <button
            key={title}
            className="rounded-2xl border border-indigo-200 bg-gradient-to-br from-indigo-50 via-white to-violet-50 px-4 py-3 text-left text-sm font-medium text-indigo-700 shadow-sm hover:shadow"
          >
            {title}
            <span className="mt-1 block text-xs font-normal text-indigo-500">Powered by LIT sequences</span>
          </button>
        ))}
      </div>
    </div>
  );

  const rfpContent = (
    <div className="rounded-2xl border bg-white p-4 md:p-5 shadow-sm">
      <h3 className="text-sm font-semibold text-slate-800">RFP Workspace</h3>
      <p className="mt-2 text-sm text-slate-600">
        Generate volume estimates, attach lane benchmarks, and export a branded proposal packet.
      </p>
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <button className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
          Upload rate cards
        </button>
        <button className="rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-4 py-2 text-sm font-medium text-white shadow hover:opacity-95">
          Generate proposal
        </button>
      </div>
    </div>
  );

  let tabContent: React.ReactNode;
  if (hasImportYetiData) {
    switch (activeTab) {
      case "Overview":
        tabContent = overviewContentImportYeti;
        break;
      case "Shipments":
        tabContent = shipmentsContentImportYeti;
        break;
      case "Commodities":
        tabContent = commoditiesContent;
        break;
      case "Suppliers":
        tabContent = suppliersContent;
        break;
      case "Ports":
        tabContent = portsContent;
        break;
      case "Aliases":
        tabContent = aliasesContent;
        break;
      case "Contacts":
        tabContent = contactsContent;
        break;
      default:
        tabContent = overviewContentImportYeti;
    }
  } else {
    switch (activeTab) {
      case "Overview":
        tabContent = overviewContentDefault;
        break;
      case "Shipments":
        tabContent = shipmentsContentDefault;
        break;
      case "Contacts":
        tabContent = contactsContent;
        break;
      case "Campaigns":
        tabContent = campaignsContent;
        break;
      case "RFP":
        tabContent = rfpContent;
        break;
      default:
        tabContent = overviewContentDefault;
    }
  }
  return (
    <div className="min-h-screen bg-gradient-to-b from-white via-slate-50 to-slate-100 text-slate-900">
      <main className="mx-[5px] my-[5px] sm:mx-2 sm:my-2">
        <header className="sticky top-0 z-20 rounded-xl border border-slate-200 bg-white/80 backdrop-blur">
          <div className="flex w-full flex-col gap-3 px-[5px] py-[5px] sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-base font-semibold tracking-tight sm:text-xl">LIT Command Center</h1>
              <p className="text-xs text-slate-500 sm:text-sm">ZoomInfo-style two-pane workflow · Search → Select → Act</p>
            </div>
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
              <div className="relative flex-1 sm:w-72">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={searchInput}
                  onChange={(event) => setSearchInput(event.target.value)}
                  placeholder="Search companies"
                  className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                />
              </div>
              <div className="hidden gap-2 sm:flex">
                <button className="rounded-xl border border-slate-200 px-3 py-2 text-sm hover:bg-slate-50">Export PDF</button>
                <button className="rounded-xl bg-indigo-600 px-3 py-2 text-sm font-medium text-white shadow hover:bg-indigo-700">
                  New Campaign
                </button>
              </div>
            </div>
          </div>
        </header>

        <div className="mt-[5px] grid grid-cols-1 gap-[5px] md:grid-cols-12">
          <aside className="md:col-span-4 rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 p-3 md:p-4">
              <div className="flex flex-wrap gap-2 text-xs text-slate-500">
                <span className="rounded-full bg-slate-100 px-2 py-1">Mode: Any</span>
                <span className="rounded-full bg-slate-100 px-2 py-1">Region: Global</span>
                <span className="rounded-full bg-slate-100 px-2 py-1">12m Active</span>
              </div>
            </div>
            <div className="relative">
              {listLoading && (
                <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/70">
                  <Loader2 className="h-5 w-5 animate-spin text-indigo-500" />
                </div>
              )}
              <ul className="max-h-[40vh] divide-y divide-slate-100 overflow-auto md:max-h-[68vh]">
                {listError && (
                  <li className="px-3 py-4 text-sm text-rose-600 md:px-4">{listError}</li>
                )}
                {!listError && !companies.length && !listLoading && (
                  <li className="px-3 py-4 text-sm text-slate-500 md:px-4">No companies found.</li>
                )}
                {companies.map((company) => {
                  const key = getCompanyKey(company);
                  const active = key === selectedKey;
                  const shipmentsValue = kpiFrom(company).shipments12m;
                  return (
                    <li key={key}>
                      <button
                        className={`flex w-full items-center gap-3 px-3 py-3 text-left transition md:px-4 ${
                          active ? "bg-indigo-50" : "hover:bg-slate-50"
                        }`}
                        onClick={() => setSelectedKey(key)}
                      >
                        <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 text-sm font-semibold text-white shadow">
                          {initialsFrom(company.company_name ?? (company as any).name ?? "") || "?"}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-slate-900">
                            {company.company_name ?? (company as any).name ?? "Unnamed company"}
                          </p>
                          <p className="truncate text-xs text-slate-500">{deriveLocation(company as any)}</p>
                        </div>
                        <div className="text-right text-xs text-slate-500">
                          <div className="text-sm font-semibold text-slate-900">{formatNumber(shipmentsValue)}</div>
                          <div className="text-xs text-emerald-600">{deriveGrowth(company as any)}</div>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
            <div className="sticky bottom-0 z-10 flex gap-2 border-t border-slate-200 bg-white p-3 sm:hidden">
              <button className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm">Export</button>
              <button className="flex-1 rounded-xl bg-indigo-600 px-3 py-2 text-sm font-medium text-white shadow">New Campaign</button>
            </div>
          </aside>

          <main id="command-center-detail" className="md:col-span-8 flex flex-col gap-3 md:gap-4">
            <section className="rounded-2xl border border-slate-200 bg-white p-4 md:p-5 shadow-sm">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex items-center gap-3 md:gap-4">
                  <div className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-600 text-base font-semibold text-white shadow">
                    {initialsFrom(selectedCompany?.company_name ?? (selectedCompany as any)?.name ?? "") || "?"}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-base font-semibold text-slate-900 md:text-lg">
                        {selectedCompany?.company_name ?? (selectedCompany as any)?.name ?? "Select a company"}
                      </h2>
                      {hasImportYetiData && (
                        <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
                          Verified Shipper
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 md:text-xs">
                      {selectedCompany ? deriveLocation(selectedCompany as any) : "Choose a company to view shipment intelligence."}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50">Save</button>
                  <button className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50">Archive</button>
                  <button className="rounded-xl bg-indigo-600 px-3 py-2 text-sm font-medium text-white shadow hover:bg-indigo-700">
                    Enrich now
                  </button>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4 md:gap-3">
                <KpiCard label="Shipments (12m)" value={derivedKpis.shipments12m} />
                <KpiCard label="Last activity" value={derivedKpis.lastActivity} />
                <KpiCard label="Top origin" value={derivedKpis.topOrigin} />
                <KpiCard label="Top destination" value={derivedKpis.topDestination} />
              </div>
            </section>

            <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <CtaCard title="Start Campaign" subtitle="Email + LinkedIn sequence" actionLabel="Create" />
              <CtaCard title="Pre-call Brief" subtitle="AI summary from shipments" actionLabel="Generate" />
              <CtaCard title="Export Profile" subtitle="Branded PDF/HTML" actionLabel="Export" />
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-3 md:p-4 shadow-sm">
              <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-2">
                {tabs.map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`rounded-full px-3 py-1 text-sm font-medium transition ${
                      activeTab === tab ? "bg-indigo-600 text-white shadow" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                    }`}
                  >
                    {tab}
                  </button>
                ))}
              </div>
              <div className="pt-4">{tabContent}</div>
            </section>
          </main>
        </div>
      </main>
    </div>
  );
}

function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className="text-lg font-semibold text-slate-900">{value}</div>
    </div>
  );
}

function CtaCard({ title, subtitle, actionLabel }: { title: string; subtitle: string; actionLabel: string }) {
  return (
    <div className="rounded-2xl border border-indigo-200 bg-gradient-to-br from-white via-indigo-50 to-violet-50 p-4 shadow-sm">
      <div className="text-sm font-semibold text-slate-900">{title}</div>
      <div className="mt-1 text-xs text-slate-600">{subtitle}</div>
      <button className="mt-3 rounded-xl bg-indigo-600 px-3 py-2 text-sm font-medium text-white shadow hover:bg-indigo-700">
        {actionLabel}
      </button>
    </div>
  );
}

function InfoCard({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-2 text-sm text-slate-800">{value}</div>
    </div>
  );
}
