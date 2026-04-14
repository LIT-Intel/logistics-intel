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
  Filter,
  Globe,
  Loader2,
  MapPin,
  Package,
  Search,
  Ship,
  TrendingUp,
  Route,
  Boxes,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

type FilterTab = "all" | "high_value" | "active" | "recent";

type SavedCompaniesResponse =
  | CommandCenterRecord[]
  | {
      rows?: CommandCenterRecord[];
    }
  | null
  | undefined;

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

const PAGE_SIZE = 25;

function normalizeSavedCompaniesResponse(
  input: SavedCompaniesResponse,
): CommandCenterRecord[] {
  if (Array.isArray(input)) {
    return input;
  }

  if (input && Array.isArray(input.rows)) {
    return input.rows;
  }

  return [];
}

function recordKey(record: CommandCenterRecord) {
  return (
    record.company?.company_id ||
    (record as any)?.company?.source_company_key ||
    record.company?.name ||
    (record as any)?.company?.company_name ||
    (record as any)?.saved_company_id ||
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

  const sourceCompanyKey =
    company?.company_id ||
    (company as any)?.source_company_key ||
    null;

  return {
    record,
    key: recordKey(record),
    companyId: sourceCompanyKey,
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
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    let isMounted = true;

    async function loadSavedCompanies() {
      setSavedLoading(true);
      setSavedError(null);

      try {
        const response = (await listSavedCompanies()) as SavedCompaniesResponse;
        const rows = normalizeSavedCompaniesResponse(response);

        if (!isMounted) return;
        setSavedCompanies(rows);
      } catch (error: any) {
        if (!isMounted) return;
        setSavedError(error?.message ?? "Failed to load saved companies");
        setSavedCompanies([]);
      } finally {
        if (isMounted) {
          setSavedLoading(false);
        }
      }
    }

    loadSavedCompanies();

    return () => {
      isMounted = false;
    };
  }, []);

  const listRows = useMemo(() => {
    return savedCompanies.map(buildListRow).filter((row) => row.key);
  }, [savedCompanies]);

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

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, activeFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const paginatedRows = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredRows.slice(start, start + PAGE_SIZE);
  }, [filteredRows, currentPage]);

  const pageStart = filteredRows.length ? (currentPage - 1) * PAGE_SIZE + 1 : 0;
  const pageEnd = filteredRows.length
    ? Math.min(currentPage * PAGE_SIZE, filteredRows.length)
    : 0;

  const summaryMetrics = useMemo(() => {
    const totalCompanies = listRows.length;
    const totalShipments = listRows.reduce((sum, row) => sum + (row.shipments12m || 0), 0);
    const activeAccounts = listRows.filter((row) => (row.shipments12m || 0) > 0).length;

    return {
      totalCompanies,
      totalShipments,
      activeAccounts,
    };
  }, [listRows]);

  const handleOpenCompany = (row: ListRow) => {
    if (!row.companyId) {
      toast({
        title: "Company unavailable",
        description: "This saved record does not have a source company key yet.",
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
          domain: row.domain,
          website: row.website,
        }),
      );
    } catch {
      // ignore localStorage failures
    }

    navigate(`/app/companies/${encodeURIComponent(row.companyId)}`);
  };

  return (
    <div className="flex flex-col gap-4 px-0 pb-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
            <BookOpenText className="h-3 w-3" />
            Command Center
          </div>
          <h1 className="mt-1.5 text-xl font-semibold tracking-tight text-slate-950 sm:text-2xl">
            Saved companies
          </h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Click any row to open the full company intelligence page.
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap gap-2 sm:flex-nowrap">
          <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
            <Ship className="h-3.5 w-3.5 text-cyan-500" />
            <span className="font-semibold text-slate-900">
              {formatNumber(summaryMetrics.totalCompanies)}
            </span>
            <span className="text-slate-500">saved</span>
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
            <Package className="h-3.5 w-3.5 text-indigo-500" />
            <span className="font-semibold text-slate-900">
              {formatNumber(summaryMetrics.totalShipments)}
            </span>
            <span className="text-slate-500">shipments</span>
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
            <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
            <span className="font-semibold text-slate-900">
              {formatNumber(summaryMetrics.activeAccounts)}
            </span>
            <span className="text-slate-500">active</span>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
        <div className="flex flex-wrap gap-1.5">
          {FILTER_TABS.map((tab) => {
            const active = activeFilter === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveFilter(tab.id)}
                className={[
                  "inline-flex items-center rounded-full px-3 py-1.5 text-xs font-semibold transition",
                  active
                    ? "bg-slate-900 text-white shadow-sm"
                    : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
                ].join(" ")}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        <div className="relative flex-1 sm:min-w-[260px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search companies, routes, domains…"
            className="h-9 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-indigo-300"
          />
        </div>

        <div className="hidden items-center gap-1.5 text-xs text-slate-400 sm:flex">
          <Filter className="h-3.5 w-3.5" />
          {formatNumber(filteredRows.length)} shown
        </div>
      </div>

      <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
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

        <div>
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
            paginatedRows.map((row, index) => {
              const logoUrl = getCompanyLogoUrl(row.domain || row.website || undefined);

              return (
                <motion.button
                  key={row.key}
                  type="button"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.18, delay: index * 0.015 }}
                  onClick={() => handleOpenCompany(row)}
                  className="group block w-full border-b border-slate-100 px-4 py-4 text-left transition hover:bg-slate-50/90 last:border-b-0 md:px-5"
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
                            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 transition-all duration-200 group-hover:border-indigo-200 group-hover:bg-indigo-50/70 group-hover:shadow-sm">
                              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 group-hover:text-indigo-700">
                                <Route className="h-3.5 w-3.5" />
                                Top lane
                              </div>
                              <div className="mt-1 truncate text-sm font-medium text-slate-900 group-hover:text-indigo-950">
                                {row.topRoute12m || row.recentRoute || "—"}
                              </div>
                            </div>

                            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 transition-all duration-200 group-hover:border-indigo-200 group-hover:bg-indigo-50/70 group-hover:shadow-sm">
                              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 group-hover:text-indigo-700">
                                <Boxes className="h-3.5 w-3.5" />
                                Structure
                              </div>
                              <div className="mt-1 text-sm font-medium text-slate-900 group-hover:text-indigo-950">
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

                      <span className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition group-hover:border-indigo-200 group-hover:bg-indigo-50 group-hover:text-indigo-700">
                        <ArrowUpRight className="h-4 w-4" />
                      </span>
                    </div>
                  </div>
                </motion.button>
              );
            })
          )}
        </div>

        {!savedLoading && !savedError && filteredRows.length > 0 ? (
          <div className="flex flex-col gap-3 border-t border-slate-200 bg-slate-50/70 px-4 py-3 sm:flex-row sm:items-center sm:justify-between md:px-5">
            <div className="text-xs text-slate-500">
              Showing {pageStart}–{pageEnd} of {filteredRows.length} companies
            </div>

            <div className="flex items-center gap-2 self-end sm:self-auto">
              <button
                type="button"
                onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                disabled={currentPage === 1}
                className="inline-flex h-9 items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronLeft className="h-4 w-4" />
                Prev
              </button>

              <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900">
                {currentPage} / {totalPages}
              </div>

              <button
                type="button"
                onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                disabled={currentPage === totalPages}
                className="inline-flex h-9 items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
