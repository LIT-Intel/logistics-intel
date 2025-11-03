"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { searchCompanies } from "@/lib/api";
import { API_BASE } from "@/lib/apiBase";
import { kpiFrom } from "@/lib/kpi";
import CompanyLanesPanel from "@/components/CompanyLanesPanel";
import CompanyShipmentsPanel from "@/components/company/CompanyShipmentsPanel";
import { Loader2, Search } from "lucide-react";

type TabKey = "Overview" | "Shipments" | "Contacts" | "Campaigns" | "RFP";

type CompanyItem = {
  company_id?: string | null;
  company_name: string;
  shipments_12m?: number | null;
  last_activity?: string | { value?: string } | null;
  top_routes?: Array<{ origin_country?: string; dest_country?: string }>;
  top_carriers?: Array<{ carrier?: string }>;
  origins_top?: string[];
  dests_top?: string[];
  carriers_top?: string[];
  total_teus?: number | null;
  total_value_usd?: number | null;
};

function getCompanyKey(item: CompanyItem) {
  const explicit = item.company_id ? String(item.company_id).trim() : "";
  if (explicit) return explicit;
  return `name:${item.company_name.toLowerCase()}`;
}

const TABS: TabKey[] = ["Overview", "Shipments", "Contacts", "Campaigns", "RFP"];

const DEFAULT_KPIS = {
  shipments12m: "—",
  lastActivity: "—",
  topOrigin: "—",
  topDestination: "—",
  topCarrier: "—",
};

function formatNumber(value: unknown) {
  const num = typeof value === "number" ? value : value == null ? null : Number(value);
  if (num == null || Number.isNaN(num)) return "—";
  return new Intl.NumberFormat().format(num);
}

function formatCurrency(value: unknown) {
  const num = typeof value === "number" ? value : value == null ? null : Number(value);
  if (num == null || Number.isNaN(num)) return "—";
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(num);
}

function formatDate(value: unknown) {
  if (!value) return "—";
  const date = new Date(value as string);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
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

export default function CommandCenter() {
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [companies, setCompanies] = useState<CompanyItem[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("Overview");

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
        const resp = await searchCompanies({ q: debouncedSearch, limit: 30, offset: 0 }, controller.signal);
        if (cancelled) return;
        if (!resp.ok) {
          const text = await resp.text().catch(() => "");
          throw new Error(`POST ${API_BASE}/public/searchCompanies - ${resp.status} ${text}`);
        }
        const data = await resp.json();
        const rows = Array.isArray(data?.rows)
          ? data.rows
          : (Array.isArray(data?.items) ? data.items : []);
        const typed = (Array.isArray(rows) ? rows : []) as CompanyItem[];
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

  const overviewContent = (
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

  const shipmentsContent = (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 md:p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-800">Recent Shipments</h3>
      </div>
      <CompanyShipmentsPanel companyId={selectedCompanyId} limit={50} />
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
      <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
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
      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
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
  switch (activeTab) {
    case "Overview":
      tabContent = overviewContent;
      break;
    case "Shipments":
      tabContent = shipmentsContent;
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
      tabContent = overviewContent;
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
                    <h2 className="text-base font-semibold text-slate-900 md:text-lg">
                      {selectedCompany?.company_name ?? (selectedCompany as any)?.name ?? "Select a company"}
                    </h2>
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
                {TABS.map((tab) => (
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
              <div className="pt-4">
                {tabContent}
              </div>
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
