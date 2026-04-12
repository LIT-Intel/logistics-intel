"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { listSavedCompanies } from "@/lib/api";
import type { CommandCenterRecord } from "@/types/importyeti";
import { CompanyAvatar } from "@/components/CompanyAvatar";
import { getCompanyLogoUrl } from "@/lib/logo";
import { useToast } from "@/components/ui/use-toast";
import {
  ArrowUpRight,
  BookOpenText,
  Building2,
  Clock3,
  Filter,
  Globe,
  Loader2,
  MapPin,
  Package,
  Search,
  Ship,
  Sparkles,
  TrendingUp,
} from "lucide-react";

type FilterTab = "all" | "high_value" | "active" | "recent";

type ListRow = {
  record: CommandCenterRecord;
  key: string;
  companyId: string | null;
  companyName: string;
  stage: string;
  address: string | null;
  domain: string | null;
  website: string | null;
  countryCode: string | null;
  shipments12m: number;
  teu12m: number | null;
  estSpend12m: number | null;
  fclShipments12m: number | null;
  lclShipments12m: number | null;
  lastActivity: string | null;
  topRoute12m: string | null;
  recentRoute: string | null;
};

const FILTER_TABS: Array<{ id: FilterTab; label: string }> = [
  { id: "all", label: "All saved" },
  { id: "high_value", label: "High value" },
  { id: "active", label: "Active shippers" },
  { id: "recent", label: "Recent activity" },
];

function recordKey(record: CommandCenterRecord) {
  return (
    record.company?.company_id ||
    record.company?.name ||
    (record as any)?.company?.company_name ||
    ""
  );
}

function formatNumber(value: number | null | undefined, digits = 0) {
  if (value == null || Number.isNaN(Number(value))) return "—";
  return Number(value).toLocaleString(undefined, {
    maximumFractionDigits: digits,
  });
}

function formatCurrency(value: number | null | undefined) {
  if (value == null || Number.isNaN(Number(value))) return "—";
  return Number(value).toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

function formatDate(value?: string | null) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function badgeToneForStage(stage?: string | null) {
  const normalized = String(stage || "prospect").toLowerCase();
  if (normalized === "customer") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
  if (normalized === "qualified") {
    return "border-indigo-200 bg-indigo-50 text-indigo-700";
  }
  if (normalized === "nurture") {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }
  return "border-slate-200 bg-slate-100 text-slate-700";
}

function buildListRow(record: CommandCenterRecord): ListRow {
  const company = record.company || ({} as any);
  const kpis = (company as any)?.kpis || {};

  return {
    record,
    key: recordKey(record),
    companyId: company?.company_id || null,
    companyName: company?.name || (company as any)?.company_name || "Company",
    stage: String((record as any)?.stage || "prospect"),
    address: company?.address || null,
    domain: (company as any)?.domain || null,
    website: (company as any)?.website || null,
    countryCode: company?.country_code || null,
    shipments12m: Number(kpis?.shipments_12m || 0),
    teu12m: kpis?.teu_12m != null ? Number(kpis.teu_12m) : null,
    estSpend12m: kpis?.est_spend_12m != null ? Number(kpis.est_spend_12m) : null,
    fclShipments12m:
      kpis?.fcl_shipments_12m != null ? Number(kpis.fcl_shipments_12m) : null,
    lclShipments12m:
      kpis?.lcl_shipments_12m != null ? Number(kpis.lcl_shipments_12m) : null,
    lastActivity: kpis?.last_activity || null,
    topRoute12m: kpis?.top_route_12m || null,
    recentRoute: kpis?.recent_route || null,
  };
}

export default function CommandCenter() {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [savedCompanies, setSavedCompanies] = useState<CommandCenterRecord[]>([]);
  const [savedLoading, setSavedLoading] = useState(true);
  const [savedError, setSavedError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeFilter, setActiveFilter] = useState<FilterTab>("all");

  useEffect(() => {
    setSavedLoading(true);
    setSavedError(null);

    Promise.resolve()
      .then(() => listSavedCompanies("prospect"))
      .then((response: any) => {
        const rows = Array.isArray(response?.rows) ? response.rows : [];
        setSavedCompanies(rows);
      })
      .catch((error: any) => {
        setSavedError(error?.message ?? "Failed to load saved companies");
        setSavedCompanies([]);
      })
      .finally(() => setSavedLoading(false));
  }, []);

  const listRows = useMemo(
    () => savedCompanies.map(buildListRow).filter((row) => row.key),
    [savedCompanies]
  );

  const filteredRows = useMemo(() => {
    const lower = searchTerm.trim().toLowerCase();

    return listRows.filter((row) => {
      const haystack = [
        row.companyName,
        row.domain,
        row.website,
        row.address,
        row.countryCode,
        row.topRoute12m,
        row.recentRoute,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      const matchesSearch = !lower || haystack.includes(lower);

      const lastActivityTime = row.lastActivity ? new Date(row.lastActivity).getTime() : null;
      const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;

      let matchesFilter = true;
      if (activeFilter === "high_value") {
        matchesFilter = (row.estSpend12m || 0) >= 100000 || (row.teu12m || 0) >= 100;
      } else if (activeFilter === "active") {
        matchesFilter = (row.shipments12m || 0) >= 12;
      } else if (activeFilter === "recent") {
        matchesFilter = !!lastActivityTime && lastActivityTime >= thirtyDaysAgo;
      }

      return matchesSearch && matchesFilter;
    });
  }, [listRows, searchTerm, activeFilter]);

  const summaryMetrics = useMemo(() => {
    const totalCompanies = listRows.length;
    const totalShipments = listRows.reduce((sum, row) => sum + (row.shipments12m || 0), 0);
    const totalTeu = listRows.reduce((sum, row) => sum + (row.teu12m || 0), 0);
    const totalSpend = listRows.reduce((sum, row) => sum + (row.estSpend12m || 0), 0);
    const activeAccounts = listRows.filter((row) => (row.shipments12m || 0) > 0).length;

    return {
      totalCompanies,
      totalShipments,
      totalTeu,
      totalSpend,
      activeAccounts,
    };
  }, [listRows]);

  const featuredCompanyName = filteredRows[0]?.companyName || "No company selected";

  const handleOpenCompany = (row: ListRow) => {
    if (!row.companyId) {
      toast({
        title: "Company unavailable",
        description: "This saved record does not have a company id yet.",
        variant: "destructive",
      });
      return;
    }

    try {
      localStorage.setItem(
        "lit:selectedCompany",
        JSON.stringify({
          company_id: row.companyId,
          source_company_key: row.companyId,
          name: row.companyName,
        })
      );
    } catch {}

    navigate(`/app/companies/${row.companyId}`);
  };

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-[32px] border border-slate-200 bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 p-5 text-white shadow-xl md:p-7 xl:p-8">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(129,140,248,0.22),transparent_30%),radial-gradient(circle_at_bottom_left,rgba(34,211,238,0.14),transparent_28%)]" />
        <div className="relative flex flex-col gap-6">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div className="max-w-3xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-indigo-200">
                <BookOpenText className="h-3.5 w-3.5" />
                Command Center
              </div>
              <h1 className="mt-4 text-2xl font-semibold tracking-tight text-white md:text-4xl">
                Buyer intelligence built from your saved company dataset
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300 md:text-base">
                This is the default saved-companies list view. Click any account to open a dedicated
                company intelligence page with KPIs, charts, shipment data, trade lanes, locations,
                products, and full tabbed detail.
              </p>
            </div>

            <div className="grid w-full gap-3 sm:grid-cols-2 xl:w-auto xl:min-w-[360px]">
              <div className="rounded-3xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-300">
                  Saved accounts
                </div>
                <div className="mt-2 text-2xl font-semibold text-white">
                  {formatNumber(summaryMetrics.totalCompanies)}
                </div>
                <div className="mt-1 text-xs text-slate-300">
                  Companies already in your CRM intelligence layer
                </div>
              </div>

              <div className="rounded-3xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-300">
                  Visible shipments
                </div>
                <div className="mt-2 text-2xl font-semibold text-white">
                  {formatNumber(summaryMetrics.totalShipments)}
                </div>
                <div className="mt-1 text-xs text-slate-300">
                  Aggregated from current saved-company KPI payloads
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-3xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-300">
                <Ship className="h-3.5 w-3.5 text-cyan-300" />
                Total TEU
              </div>
              <div className="mt-2 text-xl font-semibold text-white">
                {formatNumber(summaryMetrics.totalTeu, 1)}
              </div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-300">
                <TrendingUp className="h-3.5 w-3.5 text-violet-300" />
                Market spend
              </div>
              <div className="mt-2 text-xl font-semibold text-white">
                {formatCurrency(summaryMetrics.totalSpend)}
              </div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-300">
                <Package className="h-3.5 w-3.5 text-emerald-300" />
                Active shippers
              </div>
              <div className="mt-2 text-xl font-semibold text-white">
                {formatNumber(summaryMetrics.activeAccounts)}
              </div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-300">
                <Sparkles className="h-3.5 w-3.5 text-amber-300" />
                Featured account
              </div>
              <div className="mt-2 truncate text-xl font-semibold text-white">
                {featuredCompanyName}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {FILTER_TABS.map((tab) => {
              const active = activeFilter === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveFilter(tab.id)}
                  className={[
                    "inline-flex items-center rounded-full px-4 py-2 text-xs font-semibold transition",
                    active
                      ? "bg-white text-slate-950 shadow-sm"
                      : "border border-white/10 bg-white/5 text-slate-200 hover:bg-white/10",
                  ].join(" ")}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <section className="rounded-[32px] border border-slate-200 bg-white p-4 shadow-sm md:p-6">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
                Saved company pipeline
              </div>
              <h2 className="mt-1 text-xl font-semibold tracking-tight text-slate-950 md:text-2xl">
                Search-style list view for your CRM intelligence
              </h2>
              <p className="mt-1 max-w-2xl text-sm text-slate-500">
                Each saved row surfaces the most important commercial signals before the user opens
                the full company page.
              </p>
            </div>

            <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-600">
              <Filter className="h-3.5 w-3.5" />
              {formatNumber(filteredRows.length)} shown
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search saved companies, routes, domains, or markets"
                className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 pl-10 pr-4 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-indigo-300 focus:bg-white"
              />
            </div>

            <div className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
              <Clock3 className="h-4 w-4" />
              Click a row to open the company page
            </div>
          </div>
        </div>

        <div className="mt-5 overflow-hidden rounded-[28px] border border-slate-200 bg-white">
          <div className="hidden border-b border-slate-200 bg-slate-50/80 px-5 py-3 xl:grid xl:grid-cols-[minmax(0,2.1fr)_110px_110px_140px_150px] xl:gap-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
              Account
            </div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
              Shipments
            </div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
              TEU
            </div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
              Est. Spend
            </div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
              Last activity
            </div>
          </div>

          <div className="max-h-[calc(100vh-280px)] min-h-[320px] overflow-auto">
            {savedLoading ? (
              <div className="flex items-center justify-center gap-3 px-6 py-16 text-sm text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading saved companies…
              </div>
            ) : savedError ? (
              <div className="px-6 py-10 text-sm text-rose-600">{savedError}</div>
            ) : filteredRows.length === 0 ? (
              <div className="px-6 py-16 text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-slate-100">
                  <Building2 className="h-6 w-6 text-slate-400" />
                </div>
                <div className="mt-4 text-base font-semibold text-slate-900">
                  No saved companies match this view
                </div>
                <div className="mt-1 text-sm text-slate-500">
                  Try changing your filters or save more companies from Search.
                </div>
              </div>
            ) : (
              filteredRows.map((row, index) => {
                const logoUrl = getCompanyLogoUrl(row.domain || row.website || undefined);

                return (
                  <motion.button
                    key={row.key}
                    type="button"
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.18, delay: index * 0.015 }}
                    onClick={() => handleOpenCompany(row)}
                    className="block w-full border-b border-slate-100 px-4 py-4 text-left transition hover:bg-slate-50/90 last:border-b-0 md:px-5"
                  >
                    <div className="grid gap-4 xl:grid-cols-[minmax(0,2.1fr)_110px_110px_140px_150px] xl:items-center">
                      <div className="min-w-0">
                        <div className="flex items-start gap-3">
                          <CompanyAvatar
                            name={row.companyName}
                            logoUrl={logoUrl ?? undefined}
                            size="md"
                            className="shrink-0"
                          />

                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <div className="truncate text-base font-semibold text-slate-950">
                                {row.companyName}
                              </div>
                              <span
                                className={[
                                  "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.14em]",
                                  badgeToneForStage(row.stage),
                                ].join(" ")}
                              >
                                {row.stage}
                              </span>
                              {row.companyId ? (
                                <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-500">
                                  Open page
                                  <ArrowUpRight className="h-3 w-3" />
                                </span>
                              ) : null}
                            </div>

                            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                              {row.address ? (
                                <span className="inline-flex items-center gap-1">
                                  <MapPin className="h-3.5 w-3.5" />
                                  {row.address}
                                </span>
                              ) : null}
                              {row.domain ? (
                                <span className="inline-flex items-center gap-1">
                                  <Globe className="h-3.5 w-3.5" />
                                  {row.domain}
                                </span>
                              ) : null}
                              {row.countryCode ? (
                                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                                  {row.countryCode}
                                </span>
                              ) : null}
                            </div>

                            <div className="mt-3 grid gap-2 md:grid-cols-2">
                              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
                                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                                  Top lane
                                </div>
                                <div className="mt-1 truncate text-sm font-medium text-slate-900">
                                  {row.topRoute12m || row.recentRoute || "—"}
                                </div>
                              </div>

                              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
                                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                                  Structure
                                </div>
                                <div className="mt-1 text-sm font-medium text-slate-900">
                                  FCL {formatNumber(row.fclShipments12m)} · LCL {formatNumber(row.lclShipments12m)}
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 xl:border-0 xl:bg-transparent xl:px-0 xl:py-0">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 xl:hidden">
                          Shipments
                        </div>
                        <div className="mt-1 text-sm font-semibold text-slate-950 xl:mt-0">
                          {formatNumber(row.shipments12m)}
                        </div>
                      </div>

                      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 xl:border-0 xl:bg-transparent xl:px-0 xl:py-0">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 xl:hidden">
                          TEU
                        </div>
                        <div className="mt-1 text-sm font-semibold text-slate-950 xl:mt-0">
                          {formatNumber(row.teu12m, 1)}
                        </div>
                      </div>

                      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 xl:border-0 xl:bg-transparent xl:px-0 xl:py-0">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 xl:hidden">
                          Est. Spend
                        </div>
                        <div className="mt-1 text-sm font-semibold text-slate-950 xl:mt-0">
                          {formatCurrency(row.estSpend12m)}
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-3 xl:justify-between">
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 xl:border-0 xl:bg-transparent xl:px-0 xl:py-0">
                          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 xl:hidden">
                            Last activity
                          </div>
                          <div className="mt-1 text-sm font-semibold text-slate-950 xl:mt-0">
                            {formatDate(row.lastActivity)}
                          </div>
                        </div>

                        <span className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500">
                          <ArrowUpRight className="h-4 w-4" />
                        </span>
                      </div>
                    </div>
                  </motion.button>
                );
              })
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
