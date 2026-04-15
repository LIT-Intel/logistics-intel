import React, { useState, useEffect } from "react";
import {
  Search as SearchIcon,
  Building2,
  MapPin,
  TrendingUp,
  Package,
  Ship,
  Plane,
  X,
  BookmarkPlus,
  Bookmark,
  Eye,
  Grid3x3,
  List,
  Loader2,
  Users,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { motion } from "framer-motion";
import { useAuth } from "@/auth/AuthProvider";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/components/ui/use-toast";
import {
  fetchCompanySnapshot,
  normalizeIyCompanyProfile,
  saveCompanyToCommandCenter,
  type IyCompanyProfile,
} from "@/lib/api";
import { searchShippers } from "@/lib/supabaseApi";
import {
  parseImportYetiDate,
  formatUserFriendlyDate,
  getDateBadgeInfo,
} from "@/lib/dateUtils";
import { CompanyAvatar } from "@/components/CompanyAvatar";
import { getCompanyLogoUrl } from "@/lib/logo";
import ShipperDetailModal from "@/components/search/ShipperDetailModal";

function getCountryFlag(countryCode?: string): string {
  if (!countryCode || countryCode.length !== 2) return "";
  return String.fromCodePoint(
    ...countryCode.toUpperCase().split("").map((c) => 127397 + c.charCodeAt(0)),
  );
}

type SearchCompany = {
  id: string;
  name: string;
  city: string;
  state: string;
  country: string;
  country_code: string;
  address: string;
  website: string;
  industry: string;
  shipments: number;
  shipments_12m: number;
  teu_estimate?: number;
  mode?: string;
  last_shipment: string;
  status: "Active" | "Inactive";
  frequency: "High" | "Medium" | "Low";
  trend: "up" | "flat" | "down";
  top_origins: string[];
  top_destinations: string[];
  top_suppliers: string[];
  gemini_summary: string;
  risk_flags: string[];
  importyeti_key?: string;
  enrichment_status?: "pending" | "partial" | "complete";
  enriched_at?: string;
  top_container_length?: string;
  top_container_count?: number;
  fcl_percent?: number;
  lcl_percent?: number;
  latest_year?: number;
  latest_year_shipments?: number;
  latest_year_teu?: number;
};

export default function SearchPage() {
  const { user, authReady } = useAuth();
  const { toast } = useToast();

  const [searchQuery, setSearchQuery] = useState("");
  const [results, setResults] = useState<SearchCompany[]>([]);
  const [selectedCompany, setSelectedCompany] = useState<SearchCompany | null>(null);
  const [rawData, setRawData] = useState<any>(null);
  const [normalizedProfile, setNormalizedProfile] = useState<IyCompanyProfile | null>(null);
  const [loadingSnapshot, setLoadingSnapshot] = useState(false);
  const [saving, setSaving] = useState(false);
  const [searching, setSearching] = useState(false);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [savedCompanyIds, setSavedCompanyIds] = useState<string[]>([]);
  const [hasSearched, setHasSearched] = useState(false);

  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);
  const years = Array.from({ length: 5 }, (_, i) => currentYear - i);

  useEffect(() => {
    const loadSavedCompanies = async () => {
      if (!user) return;

      try {
        const { data, error } = await supabase
          .from("lit_saved_companies")
          .select("company_id, lit_companies!inner(source_company_key)")
          .eq("user_id", user.id);

        if (error) throw error;

        if (data) {
          const keys = data
            .map((item: any) => item.lit_companies?.source_company_key)
            .filter(Boolean);
          setSavedCompanyIds(keys);
        }
      } catch (error) {
        console.error("[Search] Failed to load saved companies:", error);
      }
    };

    loadSavedCompanies();

    if (!user) return;

    const channel = supabase
      .channel("public:lit_saved_companies")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "lit_saved_companies",
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          loadSavedCompanies();
        },
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [user]);

  useEffect(() => {
    let cancelled = false;

    const loadSnapshot = async () => {
      if (!selectedCompany || !selectedCompany.importyeti_key) {
        setRawData(null);
        setNormalizedProfile(null);
        return;
      }

      setLoadingSnapshot(true);

      try {
        const result = await fetchCompanySnapshot(selectedCompany.importyeti_key);

        if (!cancelled) {
          if (result && result.snapshot) {
            setRawData(result.raw);
            const profile = normalizeIyCompanyProfile(result, selectedCompany.importyeti_key);
            setNormalizedProfile(profile);
          } else {
            setRawData(null);
            setNormalizedProfile(null);
          }
        }
      } catch (error) {
        console.error("[Search] Failed to load snapshot:", error);
        if (!cancelled) {
          setRawData(null);
          setNormalizedProfile(null);
        }
      } finally {
        if (!cancelled) {
          setLoadingSnapshot(false);
        }
      }
    };

    loadSnapshot();

    return () => {
      cancelled = true;
    };
  }, [selectedCompany]);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();

    const query = searchQuery.trim();

    if (!query || query.length < 2) {
      toast({
        title: "Search query required",
        description: "Please enter at least 2 characters to search",
        variant: "destructive",
      });
      return;
    }

    if (!authReady) {
      toast({
        title: "Authentication required",
        description: "Please wait for authentication to complete",
        variant: "destructive",
      });
      return;
    }

    setSearching(true);
    setHasSearched(true);

    try {
      // Keep the current backend contract stable: string query, page 1, page size 25.
      const response = await searchShippers(query, 1, 25);

      if (response?.ok && Array.isArray(response?.results)) {
        const mappedResults: SearchCompany[] = response.results.map((result: any, idx: number) => {
          const parsedAddress = result.address || "";
          const cityMatch = parsedAddress.match(/^([^,]+)/);
          const parsedDate = parseImportYetiDate(
            result.mostRecentShipment ||
              result.last_shipment_date ||
              result.lastShipmentDate,
          );

          const totalShipments =
            Number(result.totalShipments ?? result.total_shipments ?? 0) || 0;

          const fclPercent =
            typeof result.fcl_shipments_perc === "number"
              ? result.fcl_shipments_perc
              : typeof result.fcl_percent === "number"
                ? result.fcl_percent
                : undefined;

          const lclPercent =
            typeof result.lcl_shipments_perc === "number"
              ? result.lcl_shipments_perc
              : typeof result.lcl_percent === "number"
                ? result.lcl_percent
                : undefined;

          return {
            id: result.key || result.company_id || `iy-${Date.now()}-${idx}`,
            name: result.title || result.name || result.company_name || "Unknown Company",
            city: result.city || (cityMatch ? cityMatch[1] : "Unknown"),
            state: result.state || "",
            country: result.country || "United States",
            country_code: result.countryCode || result.country_code || "US",
            address: result.address || result.city || "",
            website: result.website || "",
            industry: "Import / Export",
            shipments: totalShipments,
            shipments_12m:
              Number(result.latest_year_shipments ?? result.shipments_12m ?? totalShipments) || 0,
            teu_estimate:
              result.latest_year_teu != null
                ? Number(result.latest_year_teu)
                : result.totalTEU != null
                  ? Number(result.totalTEU)
                  : undefined,
            mode: undefined,
            last_shipment:
              parsedDate || new Date().toISOString().split("T")[0],
            status: totalShipments > 0 ? "Active" : "Inactive",
            frequency:
              totalShipments > 10000
                ? "High"
                : totalShipments > 1000
                  ? "Medium"
                  : "Low",
            trend: "flat",
            top_origins: [],
            top_destinations: [],
            top_suppliers: Array.isArray(result.topSuppliers) ? result.topSuppliers : [],
            gemini_summary: `${result.title || result.company_name || "Company"} trade intelligence preview`,
            risk_flags: [],
            importyeti_key: result.key || (result.company_id ? `company/${result.company_id}` : undefined),
            enrichment_status: "pending",
            top_container_length: result.top_container_length,
            top_container_count:
              result.top_container_count != null ? Number(result.top_container_count) : undefined,
            fcl_percent: fclPercent,
            lcl_percent: lclPercent,
            latest_year:
              result.latest_year != null ? Number(result.latest_year) : undefined,
            latest_year_shipments:
              result.latest_year_shipments != null
                ? Number(result.latest_year_shipments)
                : undefined,
            latest_year_teu:
              result.latest_year_teu != null ? Number(result.latest_year_teu) : undefined,
          };
        });

        setResults(mappedResults);

        if (user?.id) {
          supabase.from("search_queries").insert({
            user_id: user.id,
            query,
            results_count: mappedResults.length,
          }).then(() => {});
        }

        if (mappedResults.length === 0) {
          toast({
            title: "No results found",
            description: `No companies found matching "${query}"`,
          });
        }
      } else {
        throw new Error(response?.error || "Search failed");
      }
    } catch (error: any) {
      console.error("Search error:", error);
      toast({
        title: "Search failed",
        description: error.message || "Unable to search companies. Please try again.",
        variant: "destructive",
      });
      setResults([]);
    } finally {
      setSearching(false);
    }
  };

  const handleClear = () => {
    setSearchQuery("");
    setResults([]);
    setHasSearched(false);
  };

  const saveToCommandCenter = async (company: SearchCompany) => {
    if (!user) {
      toast({
        title: "Authentication required",
        description: "Please log in to save companies",
        variant: "destructive",
      });
      return;
    }

    const companyKey = company.importyeti_key || company.id;
    if (!companyKey) {
      toast({
        title: "Save failed",
        description: "This company is missing a valid company key.",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);

    try {
      const shipper = {
        key: companyKey,
        companyId: companyKey,
        title: company.name,
        name: company.name,
        domain: company.website || undefined,
        website: company.website || undefined,
        phone: (normalizedProfile as any)?.phoneNumber || (normalizedProfile as any)?.phone || undefined,
        address: company.address || undefined,
        city: company.city || undefined,
        state: company.state || undefined,
        countryCode: company.country_code || undefined,
        totalShipments:
          normalizedProfile?.routeKpis?.shipmentsLast12m ??
          company.shipments_12m ??
          company.shipments ??
          0,
        teusLast12m:
          normalizedProfile?.routeKpis?.teuLast12m ??
          company.teu_estimate ??
          null,
        mostRecentShipment:
          normalizedProfile?.lastShipmentDate ??
          company.last_shipment ??
          null,
        lastShipmentDate:
          normalizedProfile?.lastShipmentDate ??
          company.last_shipment ??
          null,
        primaryRoute:
          normalizedProfile?.routeKpis?.topRouteLast12m ??
          null,
        topSuppliers: company.top_suppliers ?? [],
      };

      await saveCompanyToCommandCenter({
        shipper,
        profile: normalizedProfile,
        stage: "prospect",
        source: "importyeti",
      });

      toast({
        title: "Company saved",
        description: `${company.name} has been saved to your Command Center`,
      });

      setSavedCompanyIds((prev) =>
        prev.includes(companyKey) ? prev : [...prev, companyKey],
      );

      setSelectedCompany(null);
    } catch (error: any) {
      console.error("[saveToCommandCenter] Fatal error:", error);
      toast({
        title: "Save failed",
        description: error?.message || "Could not save company. Please try again.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const getModeIcon = (mode: string) => {
    if (mode === "Ocean") return <Ship className="h-4 w-4" />;
    if (mode === "Air") return <Plane className="h-4 w-4" />;
    return <Package className="h-4 w-4" />;
  };

  const getFrequencyColor = (frequency: string) => {
    if (frequency === "High") return "bg-emerald-50 text-emerald-700 border-emerald-200";
    if (frequency === "Medium") return "bg-amber-50 text-amber-700 border-amber-200";
    return "bg-slate-50 text-slate-700 border-slate-200";
  };

  if (!authReady) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-12 w-12 text-indigo-600 animate-spin mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-slate-900 mb-2">Initializing...</h2>
          <p className="text-slate-600">
            Please wait while we prepare your search experience
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 px-3 py-4 sm:px-6 sm:py-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <motion.div
          initial={{ opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border border-slate-200 bg-white px-4 py-5 shadow-sm sm:px-6"
        >
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
                Company Search
              </h1>
              <p className="mt-1 text-sm text-slate-600 sm:text-base">
                Search real import and export companies, then preview trade intelligence before saving to Command Center.
              </p>
            </div>

            <div className="flex items-center gap-2 self-start lg:self-auto">
              <div className="hidden md:flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-1">
                <button
                  type="button"
                  onClick={() => setViewMode("grid")}
                  className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
                    viewMode === "grid"
                      ? "bg-slate-900 text-white"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  <Grid3x3 className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("list")}
                  className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
                    viewMode === "list"
                      ? "bg-slate-900 text-white"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  <List className="h-4 w-4" />
                </button>
              </div>

              <div className="hidden md:flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Year
                </span>
                <select
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(Number(e.target.value))}
                  className="bg-transparent text-sm font-semibold text-slate-700 outline-none"
                >
                  {years.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </motion.div>

        <motion.form
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          onSubmit={handleSearch}
          className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4"
        >
          <div className="flex flex-col gap-3 md:flex-row">
            <div className="relative flex-1">
              <SearchIcon className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
              <Input
                type="text"
                placeholder="Search company name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-12 rounded-xl border-slate-300 pl-12 pr-12 text-sm focus:border-indigo-500 focus:ring-indigo-500 sm:h-14 sm:text-base"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={handleClear}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 transition-colors hover:text-slate-600"
                >
                  <X className="h-5 w-5" />
                </button>
              )}
            </div>

            <Button
              type="submit"
              size="lg"
              className="h-12 rounded-xl bg-indigo-600 px-6 text-sm font-semibold hover:bg-indigo-500 sm:h-14 sm:px-8 sm:text-base"
              disabled={!authReady || searchQuery.length < 2 || searching}
            >
              {searching ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Searching...
                </>
              ) : !authReady ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Authenticating...
                </>
              ) : (
                "Search"
              )}
            </Button>
          </div>
        </motion.form>

        {hasSearched && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm sm:flex-row sm:items-center sm:justify-between"
            >
              <p className="text-sm text-slate-600">
                {searching ? (
                  "Searching..."
                ) : (
                  <>
                    Showing <span className="font-semibold text-slate-900">{results.length}</span> companies
                  </>
                )}
              </p>

              <div className="flex items-center gap-2 md:hidden">
                <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-1">
                  <button
                    type="button"
                    onClick={() => setViewMode("grid")}
                    className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
                      viewMode === "grid"
                        ? "bg-slate-900 text-white"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    <Grid3x3 className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode("list")}
                    className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
                      viewMode === "list"
                        ? "bg-slate-900 text-white"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    <List className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </motion.div>

            {viewMode !== "list" ? (
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
                {results.map((company, index) => (
                  <motion.div
                    key={company.id}
                    initial={{ opacity: 0, y: 18 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.04 + index * 0.03 }}
                  >
                    <Card className="group h-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:border-indigo-300 hover:shadow-md">
                      <CardHeader className="space-y-4 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex min-w-0 items-start gap-3">
                            <CompanyAvatar
                              name={company.name}
                              logoUrl={getCompanyLogoUrl(company.website)}
                              size="md"
                              className="shrink-0"
                            />
                            <div className="min-w-0">
                              <div className="flex items-start gap-2">
                                <CardTitle className="truncate text-base font-semibold text-slate-900 transition group-hover:text-indigo-600">
                                  {company.name}
                                </CardTitle>
                                <span className="text-lg">{getCountryFlag(company.country_code)}</span>
                              </div>
                              <div className="mt-1 flex items-center gap-1 text-sm text-slate-600">
                                <MapPin className="h-3.5 w-3.5 shrink-0" />
                                <span className="truncate">
                                  {company.city}
                                  {company.state ? `, ${company.state}` : ""}
                                </span>
                              </div>
                            </div>
                          </div>

                          <Badge variant="outline" className={getFrequencyColor(company.frequency)}>
                            {company.frequency}
                          </Badge>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <Badge variant="secondary" className="rounded-full">
                            Search Preview
                          </Badge>
                          {company.importyeti_key && savedCompanyIds.includes(company.importyeti_key) && (
                            <Badge className="rounded-full bg-indigo-600 text-white hover:bg-indigo-600">
                              Saved
                            </Badge>
                          )}
                        </div>
                      </CardHeader>

                      <CardContent className="space-y-4 p-4 pt-0">
                        <div className="grid grid-cols-2 gap-3">
                          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
                            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                              Total shipments
                            </div>
                            <p className="mt-1 text-lg font-semibold text-slate-900">
                              {company.shipments.toLocaleString()}
                            </p>
                          </div>

                          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
                            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                              Latest year TEU
                            </div>
                            <p className="mt-1 text-lg font-semibold text-slate-900">
                              {company.teu_estimate != null ? company.teu_estimate.toLocaleString() : "—"}
                            </p>
                          </div>

                          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
                            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                              Top container
                            </div>
                            <p className="mt-1 text-sm font-semibold text-slate-900">
                              {company.top_container_length || "—"}
                            </p>
                            {company.top_container_count != null && (
                              <p className="text-xs text-slate-500">
                                {company.top_container_count.toLocaleString()} units
                              </p>
                            )}
                          </div>

                          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
                            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                              FCL / LCL
                            </div>
                            <p className="mt-1 text-sm font-semibold text-slate-900">
                              {company.fcl_percent != null && company.lcl_percent != null
                                ? `${Math.round(company.fcl_percent)}% / ${Math.round(company.lcl_percent)}%`
                                : "—"}
                            </p>
                          </div>
                        </div>

                        <div className="space-y-2 rounded-xl border border-slate-200 bg-white px-3 py-3">
                          {company.mode && (
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-slate-600">Mode</span>
                              <div className="flex items-center gap-1.5 font-medium text-slate-900">
                                {getModeIcon(company.mode)}
                                {company.mode}
                              </div>
                            </div>
                          )}

                          <div className="flex items-center justify-between text-sm">
                            <span className="text-slate-600">Latest year</span>
                            <span className="font-medium text-slate-900">
                              {company.latest_year ?? "—"}
                            </span>
                          </div>

                          <div className="flex items-center justify-between text-sm">
                            <span className="text-slate-600">Year shipments</span>
                            <span className="font-medium text-slate-900">
                              {company.latest_year_shipments != null
                                ? company.latest_year_shipments.toLocaleString()
                                : "—"}
                            </span>
                          </div>

                          <div className="flex items-center justify-between text-sm">
                            <span className="text-slate-600">Last shipment</span>
                            <div className="flex items-center gap-1.5">
                              <span className="font-medium text-slate-900">
                                {formatUserFriendlyDate(company.last_shipment)}
                              </span>
                              {(() => {
                                const badgeInfo = getDateBadgeInfo(company.last_shipment);
                                if (!badgeInfo) return null;
                                return (
                                  <Badge
                                    variant="secondary"
                                    className={`text-xs ${
                                      badgeInfo.color === "green"
                                        ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                        : badgeInfo.color === "yellow"
                                          ? "bg-amber-50 text-amber-700 border-amber-200"
                                          : "bg-slate-100 text-slate-600"
                                    }`}
                                  >
                                    {badgeInfo.label}
                                  </Badge>
                                );
                              })()}
                            </div>
                          </div>

                          <div className="flex items-start justify-between gap-3 text-sm">
                            <span className="text-slate-600">Suppliers</span>
                            {company.top_suppliers.length > 0 ? (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <div className="flex items-center gap-1 text-right">
                                      <Users className="mt-0.5 h-3.5 w-3.5 text-slate-500" />
                                      <span className="max-w-[160px] truncate font-medium text-slate-900">
                                        {company.top_suppliers[0]}
                                      </span>
                                      {company.top_suppliers.length > 1 && (
                                        <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
                                          +{company.top_suppliers.length - 1}
                                        </Badge>
                                      )}
                                    </div>
                                  </TooltipTrigger>
                                  <TooltipContent className="max-w-xs">
                                    <p className="mb-1 text-xs font-semibold">Suppliers</p>
                                    <ul className="space-y-0.5">
                                      {company.top_suppliers.map((supplier, idx) => (
                                        <li key={idx} className="text-xs">
                                          • {supplier}
                                        </li>
                                      ))}
                                    </ul>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            ) : (
                              <span className="text-xs text-slate-400">No data</span>
                            )}
                          </div>
                        </div>

                        <div className="flex gap-2 pt-1">
                          <Button
                            variant="default"
                            size="sm"
                            className="h-10 flex-1 rounded-xl bg-slate-900 text-sm font-semibold hover:bg-slate-800"
                            onClick={() => setSelectedCompany(company)}
                          >
                            <Eye className="mr-1.5 h-4 w-4" />
                            View Details
                          </Button>

                          <Button
                            variant={
                              company.importyeti_key && savedCompanyIds.includes(company.importyeti_key)
                                ? "secondary"
                                : "outline"
                            }
                            size="sm"
                            onClick={() => saveToCommandCenter(company)}
                            disabled={
                              saving ||
                              (company.importyeti_key && savedCompanyIds.includes(company.importyeti_key))
                            }
                            className={`h-10 rounded-xl px-3 ${
                              company.importyeti_key && savedCompanyIds.includes(company.importyeti_key)
                                ? "bg-indigo-50 text-indigo-700 hover:bg-indigo-100"
                                : ""
                            }`}
                          >
                            {company.importyeti_key && savedCompanyIds.includes(company.importyeti_key) ? (
                              <Bookmark className="h-4 w-4 fill-current" />
                            ) : (
                              <BookmarkPlus className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </div>
            ) : (
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[880px]">
                    <thead className="border-b border-slate-200 bg-slate-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
                          Company
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
                          Location
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
                          Total Shipments
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
                          Top Container
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
                          FCL / LCL
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
                          Last Shipment
                        </th>
                        <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-600">
                          Actions
                        </th>
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-slate-100">
                      {results.map((company, index) => (
                        <motion.tr
                          key={company.id}
                          initial={{ opacity: 0, x: -14 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: index * 0.02 }}
                          className="transition hover:bg-slate-50"
                        >
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <CompanyAvatar
                                name={company.name}
                                logoUrl={getCompanyLogoUrl(company.website)}
                                size="md"
                              />
                              <div>
                                <div className="font-semibold text-slate-900">{company.name}</div>
                                <div className="text-xs text-slate-500">Search Preview</div>
                              </div>
                            </div>
                          </td>

                          <td className="px-6 py-4">
                            <div className="text-sm text-slate-900">
                              {company.city}
                              {company.state ? `, ${company.state}` : ""}
                            </div>
                            <div className="text-xs text-slate-500">{company.country_code}</div>
                          </td>

                          <td className="px-6 py-4">
                            <div className="text-sm font-semibold text-slate-900">
                              {company.shipments.toLocaleString()}
                            </div>
                          </td>

                          <td className="px-6 py-4">
                            <div className="text-sm font-medium text-slate-900">
                              {company.top_container_length || "—"}
                            </div>
                            <div className="text-xs text-slate-500">
                              {company.top_container_count != null
                                ? `${company.top_container_count.toLocaleString()} units`
                                : "No detail"}
                            </div>
                          </td>

                          <td className="px-6 py-4">
                            <div className="text-sm font-medium text-slate-900">
                              {company.fcl_percent != null && company.lcl_percent != null
                                ? `${Math.round(company.fcl_percent)}% / ${Math.round(company.lcl_percent)}%`
                                : "—"}
                            </div>
                          </td>

                          <td className="px-6 py-4">
                            <div className="flex items-center gap-1.5">
                              <div className="text-sm text-slate-900">
                                {formatUserFriendlyDate(company.last_shipment)}
                              </div>
                              {(() => {
                                const badgeInfo = getDateBadgeInfo(company.last_shipment);
                                if (!badgeInfo) return null;
                                return (
                                  <Badge
                                    variant="secondary"
                                    className={`text-xs ${
                                      badgeInfo.color === "green"
                                        ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                        : badgeInfo.color === "yellow"
                                          ? "bg-amber-50 text-amber-700 border-amber-200"
                                          : "bg-slate-100 text-slate-600"
                                    }`}
                                  >
                                    {badgeInfo.label}
                                  </Badge>
                                );
                              })()}
                            </div>
                          </td>

                          <td className="px-6 py-4">
                            <div className="flex items-center justify-end gap-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setSelectedCompany(company)}
                                className="rounded-xl"
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => saveToCommandCenter(company)}
                                disabled={
                                  saving ||
                                  (company.importyeti_key && savedCompanyIds.includes(company.importyeti_key))
                                }
                                className={`rounded-xl ${
                                  company.importyeti_key && savedCompanyIds.includes(company.importyeti_key)
                                    ? "text-indigo-600"
                                    : ""
                                }`}
                              >
                                {company.importyeti_key && savedCompanyIds.includes(company.importyeti_key) ? (
                                  <Bookmark className="h-4 w-4 fill-current" />
                                ) : (
                                  <BookmarkPlus className="h-4 w-4" />
                                )}
                              </Button>
                            </div>
                          </td>
                        </motion.tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {!searching && results.length === 0 && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="rounded-2xl border border-slate-200 bg-white py-16 text-center shadow-sm"
              >
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-slate-100">
                  <SearchIcon className="h-8 w-8 text-slate-400" />
                </div>
                <h3 className="text-lg font-semibold text-slate-900">No companies found</h3>
                <p className="mt-1 text-slate-600">Try adjusting your search query</p>
              </motion.div>
            )}
          </>
        )}

        {!hasSearched && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="rounded-2xl border border-slate-200 bg-white py-20 text-center shadow-sm"
          >
            <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-indigo-50">
              <SearchIcon className="h-10 w-10 text-indigo-600" />
            </div>
            <h3 className="text-xl font-semibold text-slate-900">Start Your Search</h3>
            <p className="mx-auto mt-2 max-w-md text-slate-600">
              Enter a company name to discover trade intelligence and preview KPI insights before saving to Command Center.
            </p>
          </motion.div>
        )}

        {selectedCompany && (
          <ShipperDetailModal
            year={selectedYear}
            isOpen={true}
            shipper={selectedCompany as any}
            loadingProfile={loadingSnapshot}
            profile={normalizedProfile}
            routeKpis={normalizedProfile?.routeKpis ?? null}
            enrichment={null}
            error={null}
            onClose={() => setSelectedCompany(null)}
            onSaveToCommandCenter={() => {
              if (selectedCompany) {
                saveToCommandCenter(selectedCompany);
              }
            }}
            saveLoading={saving}
            isSaved={Boolean(
              selectedCompany?.importyeti_key &&
              savedCompanyIds.includes(selectedCompany.importyeti_key),
            )}
          />
        )}
      </div>
    </div>
  );
}
