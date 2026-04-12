"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  listSavedCompanies,
  getSavedCompanyDetail,
  getFclShipments12m,
  getLclShipments12m,
  buildYearScopedProfile,
  type IyCompanyProfile,
  type IyRouteKpis,
} from "@/lib/api";
import type { CommandCenterRecord } from "@/types/importyeti";
import { useAuth } from "@/auth/AuthProvider";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/components/ui/use-toast";
import CompanyDetailPanel from "@/components/command-center/CompanyDetailPanel";
import { CompanyAvatar } from "@/components/CompanyAvatar";
import { getCompanyLogoUrl } from "@/lib/logo";
import { motion } from "framer-motion";
import {
  ArrowUpRight,
  BookOpenText,
  Building2,
  CalendarClock,
  ChevronRight,
  FileDown,
  Filter,
  Globe,
  LayoutGrid,
  ListFilter,
  Loader2,
  MapPin,
  Package,
  Search,
  Ship,
  Sparkles,
  TrendingUp,
} from "lucide-react";

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
    return "bg-emerald-50 text-emerald-700 border-emerald-200";
  }
  if (normalized === "qualified") {
    return "bg-indigo-50 text-indigo-700 border-indigo-200";
  }
  if (normalized === "nurture") {
    return "bg-amber-50 text-amber-700 border-amber-200";
  }
  return "bg-slate-100 text-slate-700 border-slate-200";
}

type FilterTab = "all" | "high_value" | "active" | "recent";

type EnrichedListRow = {
  record: CommandCenterRecord;
  key: string;
  companyName: string;
  companyId: string | null;
  domain: string | null;
  website: string | null;
  address: string | null;
  countryCode: string | null;
  stage: string | null;
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

function buildListRow(record: CommandCenterRecord): EnrichedListRow {
  const company = record.company || ({} as any);
  const kpis = (company as any)?.kpis || {};
  return {
    record,
    key: recordKey(record),
    companyName: company?.name || (company as any)?.company_name || "Company",
    companyId: company?.company_id || null,
    domain: (company as any)?.domain || null,
    website: (company as any)?.website || null,
    address: company?.address || null,
    countryCode: company?.country_code || null,
    stage: (record as any)?.stage || "prospect",
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
  const { user } = useAuth();
  const { toast } = useToast();

  const [savedCompanies, setSavedCompanies] = useState<CommandCenterRecord[]>([]);
  const [savedLoading, setSavedLoading] = useState(true);
  const [savedError, setSavedError] = useState<string | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const [profile, setProfile] = useState<IyCompanyProfile | null>(null);
  const [routeKpis, setRouteKpis] = useState<IyRouteKpis | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [generatingBrief, setGeneratingBrief] = useState(false);

  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [activeFilter, setActiveFilter] = useState<FilterTab>("all");

  useEffect(() => {
    setSavedLoading(true);
    setSavedError(null);

    Promise.resolve()
      .then(() => listSavedCompanies("prospect"))
      .then((rows) => ({ rows }))
      .then((response) => {
        const rows = Array.isArray(response?.rows) ? response.rows : [];
        setSavedCompanies(rows as CommandCenterRecord[]);
        setSelectedKey((prev) => {
          if (prev && rows.some((row: CommandCenterRecord) => recordKey(row) === prev)) {
            return prev;
          }
          return rows.length ? recordKey(rows[0] as CommandCenterRecord) : null;
        });
      })
      .catch((error: any) => {
        setSavedError(error?.message ?? "Failed to load saved companies");
        setSavedCompanies([]);
        setSelectedKey(null);
      })
      .finally(() => setSavedLoading(false));
  }, []);

  const listRows = useMemo(
    () => savedCompanies.map((record) => buildListRow(record)).filter((row) => row.key),
    [savedCompanies],
  );

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

  const selectedRecord = useMemo(() => {
    if (!selectedKey) return null;
    return savedCompanies.find((record) => recordKey(record) === selectedKey) ?? null;
  }, [savedCompanies, selectedKey]);

  useEffect(() => {
    const companyKey = selectedRecord?.company?.company_id;
    if (!companyKey) {
      setProfile(null);
      setRouteKpis(null);
      return;
    }

    let cancelled = false;
    setDetailLoading(true);
    setDetailError(null);

    getSavedCompanyDetail(companyKey)
      .then(({ profile: nextProfile, routeKpis: nextRouteKpis }) => {
        if (cancelled) return;
        setProfile(nextProfile);
        setRouteKpis(nextRouteKpis);
      })
      .catch((error: any) => {
        if (cancelled) return;
        setDetailError(error?.message ?? "Failed to load company profile");
        setProfile(null);
        setRouteKpis(null);
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedRecord?.company?.company_id]);

  const hydratedSelectedRecord = useMemo(() => {
    if (!selectedRecord) return null;
    if (!profile) return selectedRecord;

    const fallbackKpis = (selectedRecord as any)?.company?.kpis ?? {};
    const mergedCompany = {
      ...selectedRecord.company,
      name: profile.title || profile.name || selectedRecord.company?.name,
      domain: profile.domain ?? selectedRecord.company?.domain ?? null,
      website: profile.website ?? (selectedRecord.company as any)?.website ?? null,
      address: profile.address ?? selectedRecord.company?.address ?? null,
      country_code: profile.countryCode ?? selectedRecord.company?.country_code ?? null,
      kpis: {
        ...fallbackKpis,
        shipments_12m:
          profile.routeKpis?.shipmentsLast12m ?? fallbackKpis?.shipments_12m ?? 0,
        teu_12m: profile.routeKpis?.teuLast12m ?? fallbackKpis?.teu_12m ?? null,
        est_spend_12m:
          profile.routeKpis?.estSpendUsd12m ??
          profile.estSpendUsd12m ??
          fallbackKpis?.est_spend_12m ??
          null,
        fcl_shipments_12m:
          getFclShipments12m(profile) ?? fallbackKpis?.fcl_shipments_12m ?? null,
        lcl_shipments_12m:
          getLclShipments12m(profile) ?? fallbackKpis?.lcl_shipments_12m ?? null,
        last_activity: profile.lastShipmentDate ?? fallbackKpis?.last_activity ?? null,
        top_route_12m:
          profile.routeKpis?.topRouteLast12m ?? fallbackKpis?.top_route_12m ?? null,
        recent_route:
          profile.routeKpis?.mostRecentRoute ?? fallbackKpis?.recent_route ?? null,
      },
    };

    return {
      ...selectedRecord,
      company: mergedCompany,
    } as CommandCenterRecord;
  }, [selectedRecord, profile]);

  const yearScopedProfile = useMemo(
    () => buildYearScopedProfile(profile, selectedYear),
    [profile, selectedYear],
  );

  const yearHydratedSelectedRecord = useMemo(() => {
    if (!hydratedSelectedRecord) return null;
    if (!yearScopedProfile) return hydratedSelectedRecord;

    const fallbackKpis = (hydratedSelectedRecord as any)?.company?.kpis ?? {};
    return {
      ...hydratedSelectedRecord,
      company: {
        ...hydratedSelectedRecord.company,
        kpis: {
          ...fallbackKpis,
          shipments_12m:
            yearScopedProfile.routeKpis?.shipmentsLast12m ??
            fallbackKpis?.shipments_12m ??
            0,
          teu_12m:
            yearScopedProfile.routeKpis?.teuLast12m ?? fallbackKpis?.teu_12m ?? null,
          est_spend_12m:
            yearScopedProfile.routeKpis?.estSpendUsd12m ??
            fallbackKpis?.est_spend_12m ??
            null,
          fcl_shipments_12m:
            getFclShipments12m(yearScopedProfile) ??
            fallbackKpis?.fcl_shipments_12m ??
            null,
          lcl_shipments_12m:
            getLclShipments12m(yearScopedProfile) ??
            fallbackKpis?.lcl_shipments_12m ??
            null,
          last_activity:
            yearScopedProfile.lastShipmentDate ?? fallbackKpis?.last_activity ?? null,
        },
      },
    } as CommandCenterRecord;
  }, [hydratedSelectedRecord, yearScopedProfile]);

  const handleGenerateBrief = async () => {
    if (!yearHydratedSelectedRecord) {
      toast({
        title: "No company selected",
        description: "Please select a company to generate a brief",
        variant: "destructive",
      });
      return;
    }

    setGeneratingBrief(true);
    try {
      const name = yearHydratedSelectedRecord.company?.name ?? "";
      const shipments =
        yearScopedProfile?.routeKpis?.shipmentsLast12m ??
        profile?.routeKpis?.shipmentsLast12m ??
        0;
      const teu =
        yearScopedProfile?.routeKpis?.teuLast12m ?? profile?.routeKpis?.teuLast12m ?? 0;
      const estSpend =
        yearScopedProfile?.routeKpis?.estSpendUsd12m ??
        profile?.routeKpis?.estSpendUsd12m ??
        profile?.estSpendUsd12m ??
        0;
      const topRoute =
        yearScopedProfile?.routeKpis?.topRouteLast12m ??
        profile?.routeKpis?.topRouteLast12m ??
        "unknown";
      const recentRoute =
        yearScopedProfile?.routeKpis?.mostRecentRoute ??
        profile?.routeKpis?.mostRecentRoute ??
        "unknown";

      const { data, error } = await supabase.functions.invoke("generate-brief", {
        body: {
          companyName: name,
          shipments,
          teu,
          estSpendUsd: estSpend,
          topRoute,
          recentRoute,
        },
      });

      if (error) {
        toast({
          title: "Brief generation failed",
          description: error.message || "Could not generate brief",
          variant: "destructive",
        });
      } else if (data?.brief) {
        toast({
          title: "Brief generated",
          description: "AI brief generated successfully. Check the console for details.",
        });
        console.log("AI brief:\n", data.brief);
      } else {
        toast({
          title: "Brief generated",
          description: "No content returned from AI function.",
        });
      }
    } catch (error: any) {
      console.error("Brief generation error:", error);
      toast({
        title: "Brief generation failed",
        description: error?.message || "Could not generate brief",
        variant: "destructive",
      });
    } finally {
      setGeneratingBrief(false);
    }
  };

  const handleExportPDF = () => {
    if (!yearHydratedSelectedRecord) {
      toast({
        title: "No company selected",
        description: "Please select a company to export",
        variant: "destructive",
      });
      return;
    }

    try {
      window.print();
    } catch {
      toast({
        title: "Export failed",
        description: "PDF export encountered an error",
        variant: "destructive",
      });
    }
  };

  const selectedYears = useMemo(() => {
    return Array.from(
      new Set(
        (profile?.timeSeries ?? [])
          .map((point) => Number((point as any)?.year))
          .filter((year) => Number.isFinite(year) && year > 2000),
      ),
    ).sort((a, b) => b - a);
  }, [profile]);

  const selectedCompanyName =
    yearHydratedSelectedRecord?.company?.name ||
    profile?.title ||
    selectedRecord?.company?.name ||
    "Select a company";

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
                This view turns your saved companies into a premium intelligence workspace. KPI
                cards, charts, shipment trends, trade lanes, products, contacts, and history all
                read from the real company profile and snapshot payloads we already store.
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
                Selected company
              </div>
              <div className="mt-2 truncate text-xl font-semibold text-white">
                {selectedCompanyName}
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
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

            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={handleExportPDF}
                className="inline-flex items-center justify-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/10"
              >
                <FileDown className="h-4 w-4" />
                Export intelligence
              </button>
              <button
                type="button"
                onClick={handleGenerateBrief}
                disabled={generatingBrief || !yearHydratedSelectedRecord}
                className="inline-flex items-center justify-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {generatingBrief ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                Generate AI brief
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,460px)_minmax(0,1fr)] 2xl:grid-cols-[minmax(0,500px)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-4">
          <div className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm md:p-5">
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
                    Saved company pipeline
                  </div>
                  <h2 className="mt-1 text-xl font-semibold tracking-tight text-slate-950">
                    Search-style list view for your CRM intelligence
                  </h2>
                </div>

                <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-600">
                  <Filter className="h-3.5 w-3.5" />
                  {formatNumber(filteredRows.length)} shown
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
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
                  <LayoutGrid className="h-4 w-4" />
                  <span>Live view</span>
                </div>
              </div>
            </div>
          </div>

          <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
            <div className="hidden border-b border-slate-200 bg-slate-50/80 px-5 py-3 lg:grid lg:grid-cols-[minmax(0,1.6fr)_120px_120px_140px_120px] lg:gap-4">
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
                Activity
              </div>
            </div>

            <div className="max-h-[720px] overflow-auto">
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
                  const active = row.key === selectedKey;
                  const logoUrl = getCompanyLogoUrl(row.domain || row.website || undefined);

                  return (
                    <motion.button
                      key={row.key}
                      type="button"
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.18, delay: index * 0.015 }}
                      onClick={() => {
                        setSelectedKey(row.key);
                        localStorage.setItem(
                          "lit:selectedCompany",
                          JSON.stringify({
                            company_id: row.companyId,
                            source_company_key: row.companyId,
                            name: row.companyName,
                          }),
                        );
                      }}
                      className={[
                        "block w-full border-b border-slate-100 px-4 py-4 text-left transition last:border-b-0 md:px-5",
                        active
                          ? "bg-indigo-50/70"
                          : "bg-white hover:bg-slate-50/80",
                      ].join(" ")}
                    >
                      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_120px_120px_140px_120px] lg:items-center">
                        <div className="min-w-0">
                          <div className="flex min-w-0 items-start gap-3">
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
                                  {row.stage || "prospect"}
                                </span>
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
                              </div>

                              <div className="mt-3 grid gap-2 sm:grid-cols-2">
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
                                    FCL {formatNumber(row.fclShipments12m)} · LCL{" "}
                                    {formatNumber(row.lclShipments12m)}
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 lg:border-0 lg:bg-transparent lg:px-0 lg:py-0">
                          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 lg:hidden">
                            Shipments
                          </div>
                          <div className="mt-1 text-sm font-semibold text-slate-950 lg:mt-0">
                            {formatNumber(row.shipments12m)}
                          </div>
                        </div>

                        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 lg:border-0 lg:bg-transparent lg:px-0 lg:py-0">
                          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 lg:hidden">
                            TEU
                          </div>
                          <div className="mt-1 text-sm font-semibold text-slate-950 lg:mt-0">
                            {formatNumber(row.teu12m, 1)}
                          </div>
                        </div>

                        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 lg:border-0 lg:bg-transparent lg:px-0 lg:py-0">
                          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 lg:hidden">
                            Est. Spend
                          </div>
                          <div className="mt-1 text-sm font-semibold text-slate-950 lg:mt-0">
                            {formatCurrency(row.estSpend12m)}
                          </div>
                        </div>

                        <div className="flex items-center justify-between gap-3 lg:justify-end">
                          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 lg:border-0 lg:bg-transparent lg:px-0 lg:py-0">
                            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 lg:hidden">
                              Last activity
                            </div>
                            <div className="mt-1 text-sm font-semibold text-slate-950 lg:mt-0">
                              {formatDate(row.lastActivity)}
                            </div>
                          </div>

                          <span
                            className={[
                              "inline-flex h-10 w-10 items-center justify-center rounded-full transition",
                              active
                                ? "bg-indigo-600 text-white"
                                : "border border-slate-200 bg-white text-slate-500",
                            ].join(" ")}
                          >
                            <ChevronRight className="h-4 w-4" />
                          </span>
                        </div>
                      </div>
                    </motion.button>
                  );
                })
              )}
            </div>
          </div>
        </div>

        <div className="min-w-0 space-y-4">
          <div className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm md:p-5">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div className="min-w-0">
                <div className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
                  Account intelligence workspace
                </div>
                <h2 className="mt-1 truncate text-xl font-semibold tracking-tight text-slate-950 md:text-2xl">
                  {selectedCompanyName}
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  High-level KPIs and charts are derived from the actual snapshot payload, recent
                  BOL data, and stored profile enrichment.
                </p>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                {selectedYears.length > 0 ? (
                  <div className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
                    <CalendarClock className="h-4 w-4 text-slate-400" />
                    <label className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                      Year
                    </label>
                    <select
                      value={selectedYear}
                      onChange={(e) => setSelectedYear(Number(e.target.value))}
                      className="bg-transparent text-sm font-medium text-slate-900 outline-none"
                    >
                      {selectedYears.map((year) => (
                        <option key={year} value={year}>
                          {year}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : null}

                {selectedRecord?.company?.company_id ? (
                  <a
                    href={`/app/companies/${selectedRecord.company.company_id}`}
                    className="inline-flex items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-900 transition hover:bg-slate-50"
                  >
                    Open company page
                    <ArrowUpRight className="h-4 w-4" />
                  </a>
                ) : null}
              </div>
            </div>

            {yearHydratedSelectedRecord ? (
              <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                  <div className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                    <Package className="h-3.5 w-3.5 text-indigo-500" />
                    Shipments
                  </div>
                  <div className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
                    {formatNumber(
                      yearHydratedSelectedRecord.company?.kpis?.shipments_12m ?? null,
                    )}
                  </div>
                </div>

                <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                  <div className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                    <Ship className="h-3.5 w-3.5 text-cyan-500" />
                    TEU
                  </div>
                  <div className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
                    {formatNumber(
                      yearHydratedSelectedRecord.company?.kpis?.teu_12m ?? null,
                      1,
                    )}
                  </div>
                </div>

                <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                  <div className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                    <TrendingUp className="h-3.5 w-3.5 text-violet-500" />
                    Market spend
                  </div>
                  <div className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
                    {formatCurrency(
                      yearHydratedSelectedRecord.company?.kpis?.est_spend_12m ?? null,
                    )}
                  </div>
                </div>

                <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                  <div className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                    <ListFilter className="h-3.5 w-3.5 text-emerald-500" />
                    Recent route
                  </div>
                  <div className="mt-2 truncate text-sm font-semibold text-slate-950">
                    {yearHydratedSelectedRecord.company?.kpis?.recent_route || "—"}
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          <CompanyDetailPanel
            record={yearHydratedSelectedRecord}
            profile={yearScopedProfile ?? profile}
            routeKpis={(yearScopedProfile?.routeKpis ?? routeKpis) as IyRouteKpis | null}
            loading={detailLoading}
            error={detailError}
            onGenerateBrief={handleGenerateBrief}
            onExportPDF={handleExportPDF}
          />
        </div>
      </section>
    </div>
  );
}
