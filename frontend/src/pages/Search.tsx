import React, { useEffect, useMemo, useState } from "react";
import {
  Search as SearchIcon,
  MapPin,
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
import { useSearchParams } from "react-router-dom";
import { useAuth } from "@/auth/AuthProvider";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/components/ui/use-toast";
import {
  searchShippers,
  fetchCompanySnapshot,
  normalizeIyCompanyProfile,
  saveCompanyToCommandCenter,
  fetchSearchKpiOverlay,
  type CompanySnapshot,
  type IyCompanyProfile,
} from "@/lib/api";
import {
  parseImportYetiDate,
  formatUserFriendlyDate,
  getDateBadgeInfo,
  formatSafeShipmentDate,
  capFutureDate,
} from "@/lib/dateUtils";
import { CompanyAvatar } from "@/components/CompanyAvatar";
import { getCompanyLogoUrl } from "@/lib/logo";
import { canonicalContainerCode } from "@/lib/containerUtils";
import ShipperDetailModal from "@/components/search/ShipperDetailModal";
import { UpgradeModal } from "@/components/billing/UpgradeModal";
import type { LimitExceeded } from "@/lib/usage";
import { LimitExceededError } from "@/lib/saveCompany";

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
  last_shipment: string | null;
  latest_year?: number | null;
  latest_year_shipments?: number | null;
  latest_year_teu?: number | null;
  top_container_length?: string | null;
  fcl_shipments_perc?: number | null;
  lcl_shipments_perc?: number | null;
  status: 'Active' | 'Inactive';
  frequency: 'High' | 'Medium' | 'Low';
  trend: 'up' | 'flat' | 'down';
  top_origins: string[];
  top_destinations: string[];
  top_suppliers: string[];
  gemini_summary: string;
  risk_flags: string[];
  importyeti_key?: string;
  enrichment_status?: "pending" | "partial" | "complete";
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
  const [searchParams] = useSearchParams();

  // Phase 5 — initialize `searchQuery` from the `?q=` URL parameter on
  // mount so deep links like /app/search?q=Rivian land with the input
  // pre-populated and the search auto-runs (effect below).
  const initialQ = searchParams.get("q") || "";
  const [searchQuery, setSearchQuery] = useState(initialQ);
  const [results, setResults] = useState<SearchCompany[]>([]);
  const [upgradeModal, setUpgradeModal] = useState<LimitExceeded | null>(null);
  const [selectedCompany, setSelectedCompany] = useState<SearchCompany | null>(null);
  const [rawData, setRawData] = useState<any>(null);
  const [normalizedProfile, setNormalizedProfile] = useState<IyCompanyProfile | null>(null);
  const [loadingSnapshot, setLoadingSnapshot] = useState(false);
  const [saving, setSaving] = useState(false);
  const [searching, setSearching] = useState(false);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [savedCompanyIds, setSavedCompanyIds] = useState<string[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [contacts, setContacts] = useState<any[]>([]);
  const [loadingContacts, setLoadingContacts] = useState(false);

  // Phase D client-side filters. Every chip maps to a field that's already
  // populated on the mapped company rows — nothing fetched, nothing mocked.
  // Defaults are "any" / false so the filter is a pass-through until the
  // user changes it.
  type TeuRange = "any" | "<=1k" | "1k-10k" | "10k-100k" | ">100k";
  type LoadType = "any" | "fcl" | "lcl";
  type TopContainer = "any" | "20FT" | "40FT" | "40HC" | "45FT";
  const [teuRange, setTeuRange] = useState<TeuRange>("any");
  const [loadType, setLoadType] = useState<LoadType>("any");
  const [topContainer, setTopContainer] = useState<TopContainer>("any");
  const [savedOnly, setSavedOnly] = useState(false);

  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);
  const years = useMemo(
    () => Array.from({ length: 5 }, (_, i) => currentYear - i),
    [currentYear],
  );

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
        setContacts([]);
        return;
      }

      setLoadingSnapshot(true);
      setLoadingContacts(true);

      try {
        const result = await fetchCompanySnapshot(selectedCompany.importyeti_key);

        if (!cancelled) {
          if (result && (result.snapshot || result.company)) {
            setRawData(result);
            const profile = normalizeIyCompanyProfile(
              result,
              selectedCompany.importyeti_key,
            );
            setNormalizedProfile(profile);

            // Load contacts
            const companyId = selectedCompany.id || selectedCompany.importyeti_key;
            const { data: contactsData, error: contactsError } = await supabase
              .from("lit_contacts")
              .select("*")
              .eq("company_id", companyId)
              .limit(20);

            if (!cancelled) {
              if (!contactsError && Array.isArray(contactsData)) {
                setContacts(contactsData);
              } else {
                setContacts([]);
              }
            }
          } else {
            setRawData(null);
            setNormalizedProfile(null);
            setContacts([]);
          }
        }
      } catch (error) {
        console.error("[Search] Failed to load snapshot:", error);
        if (!cancelled) {
          setRawData(null);
          setNormalizedProfile(null);
          setContacts([]);
        }
      } finally {
        if (!cancelled) {
          setLoadingSnapshot(false);
          setLoadingContacts(false);
        }
      }
    };

    loadSnapshot();

    return () => {
      cancelled = true;
    };
  }, [selectedCompany]);

  const computeKPIsFromRaw = () => {
    if (!rawData?.snapshot) {
      return {
        totalTEU: 0,
        fclCount: 0,
        lclCount: 0,
        estSpend: 0,
        totalShipments: 0,
        lastShipmentDate: null,
      };
    }
    const snapshot = rawData.snapshot;
    return {
      totalTEU: snapshot.total_teu || 0,
      fclCount: snapshot.fcl_count || 0,
      lclCount: snapshot.lcl_count || 0,
      estSpend: snapshot.est_spend || 0,
      totalShipments: snapshot.total_shipments || 0,
      lastShipmentDate: snapshot.last_shipment_date || null,
    };
  };

  const computeMonthlyVolumes = () => {
    if (!rawData) {
      return {};
    }
    const snapshot = rawData.snapshot;
    if (snapshot?.monthly_volumes && Object.keys(snapshot.monthly_volumes).length > 0) {
      return snapshot.monthly_volumes;
    }
    if (rawData?.analytics?.timeSeries && rawData.analytics.timeSeries.length > 0) {
      const fromSeries: Record<string, { fcl: number; lcl: number; shipments?: number; teu?: number }> = {};
      rawData.analytics.timeSeries.forEach((pt: any) => {
        fromSeries[pt.month] = { fcl: pt.fcl ?? 0, lcl: pt.lcl ?? 0, shipments: pt.shipments, teu: pt.teu };
      });
      return fromSeries;
    }
    return {};
  };

  const computeTradeRoutes = () => {
    if (!rawData?.snapshot?.top_ports) {
      return { origins: [], destinations: [] };
    }
    const topPorts = rawData.snapshot.top_ports || [];
    return { origins: topPorts.slice(0, 5), destinations: [] };
  };

  const kpis = computeKPIsFromRaw();
  const monthlyVolumes = computeMonthlyVolumes();
  const tradeRoutes = computeTradeRoutes();

  function resolveLastShipmentDate(r: any): string | null {
    return r?.lastShipmentDate ?? r?.mostRecentShipment
      ?? r?.last_shipment_date ?? r?.most_recent_shipment ?? null;
  }

  const handleSearch = async (e: React.FormEvent, overrideQuery?: string) => {
    e.preventDefault();

    // Phase 5 — accept an optional `overrideQuery` so the URL-param
    // auto-run path (?q=…) can fire the search before the controlled
    // input state has flushed through React's render cycle. The form
    // submit path keeps the existing behavior (reads `searchQuery`).
    const query = (overrideQuery ?? searchQuery).trim();

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

    // Fire-and-forget usage event so the Dashboard "Searches Used" KPI
    // reflects real activity. Never awaited, never surfaced to the user —
    // if the insert fails (RLS, network, schema), the search continues.
    // Phase H P1 fix — payload previously used `event_data` which is not a
    // column on `lit_activity_events` (schema has `metadata jsonb`). The
    // REST call was silently rejected and zero rows landed, so the
    // Searches Used KPI read 0 forever. Renamed to `metadata` to match
    // the real schema.
    if (user?.id) {
      void supabase
        .from("lit_activity_events")
        .insert({
          user_id: user.id,
          event_type: "search",
          metadata: { q: query },
        })
        .then(
          () => undefined,
          () => undefined,
        );
    }

    try {
      const response = await searchShippers({ q: query, page: 1, pageSize: 50 });

      if (response?.ok && Array.isArray(response?.results)) {
        const mappedResults: SearchCompany[] = response.results.map((result: any, idx: number) => {
          const parsedAddress = result.address || "";
          const cityMatch = parsedAddress.match(/^([^,]+)/);

          const parsedDate = parseImportYetiDate(
            result.lastShipmentDate ??
            result.mostRecentShipment ??
            result.last_shipment_date ??
            result.most_recent_shipment
          );

          const totalShipments =
            Number(result.totalShipments ?? result.total_shipments ?? 0) || 0;

          // Extract FCL/LCL counts with camelCase priority
          const fclCount =
            Number(
              result.fclShipments12m ??
              result.fcl_shipments ??
              result.fcl_count ??
              0
            ) || 0;

          const lclCount =
            Number(
              result.lclShipments12m ??
              result.lcl_shipments ??
              result.lcl_count ??
              0
            ) || 0;

          const totalCount = fclCount + lclCount;

          const fclPercent = totalCount > 0 ? (fclCount / totalCount) * 100 : undefined;
          const lclPercent = totalCount > 0 ? (lclCount / totalCount) * 100 : undefined;

          const fclPercentFromResult =
            typeof result.fcl_shipments_perc === "number"
              ? result.fcl_shipments_perc
              : typeof result.fcl_percent === "number"
                ? result.fcl_percent
                : fclPercent;

          const lclPercentFromResult =
            typeof result.lcl_shipments_perc === "number"
              ? result.lcl_shipments_perc
              : typeof result.lcl_percent === "number"
                ? result.lcl_percent
                : lclPercent;

          const mapped = {
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
              Number(
                result.latestYearShipments ??
                result.latest_year_shipments ??
                result.shipmentsLast12m ??
                result.shipments_12m ??
                totalShipments
              ) || 0,
            teu_estimate: (() => {
              // Prefer normalized parsed_summary / companyProfile shapes first,
              // then fall back to flat fields the search action returns, then
              // finally anything on raw_payload-shaped objects.
              const candidates: Array<unknown> = [
                result?.parsed_summary?.total_teu,
                result?.parsed_summary?.route_kpis?.teuLast12m,
                result?.companyProfile?.routeKpis?.teuLast12m,
                result?.routeKpis?.teuLast12m,
                result?.route_kpis?.teuLast12m,
                result?.snapshot?.total_teu,
                result?.total_teu,
                result?.totalTEU,
                result?.latestYearTeu,
                result?.latest_year_teu,
                result?.teusLast12m,
              ];
              for (const value of candidates) {
                if (value == null) continue;
                const num = Number(value);
                if (Number.isFinite(num)) return num;
              }
              return undefined;
            })(),
            mode: undefined,
            last_shipment: parsedDate ?? null,
            status: (result.totalShipments || 0) > 0 ? 'Active' : 'Inactive',
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
            top_container_length:
              result.topContainerLength ??
              result.top_container_length ??
              undefined,
            top_container_count:
              result.top_container_count != null
                ? Number(result.top_container_count)
                : result.topContainerCount != null
                  ? Number(result.topContainerCount)
                  : undefined,
            fcl_percent: fclPercentFromResult,
            lcl_percent: lclPercentFromResult,
            latest_year:
              result.latest_year != null
                ? Number(result.latest_year)
                : undefined,
            latest_year_shipments:
              result.latestYearShipments != null
                ? Number(result.latestYearShipments)
                : result.latest_year_shipments != null
                  ? Number(result.latest_year_shipments)
                  : undefined,
            latest_year_teu:
              result.latestYearTeu != null
                ? Number(result.latestYearTeu)
                : result.latest_year_teu != null
                  ? Number(result.latest_year_teu)
                  : undefined,
          };

          return mapped;
        });

        // Overlay KPI data from lit_company_search_results
        try {
          const keys = mappedResults
            .map((r: MockCompany) => r.importyeti_key)
            .filter((k): k is string => Boolean(k));
          const overlay = await fetchSearchKpiOverlay(keys);
          const enriched = mappedResults.map((r: MockCompany) => {
            const kpiRow = r.importyeti_key ? overlay[r.importyeti_key] : null;
            if (!kpiRow) return r;
            return {
              ...r,
              last_shipment: resolveLastShipmentDate(kpiRow) ?? r.last_shipment,
              latest_year: kpiRow.latest_year ?? null,
              latest_year_shipments: kpiRow.latest_year_shipments ?? null,
              latest_year_teu: kpiRow.latest_year_teu ?? null,
              top_container_length: kpiRow.top_container_length ?? null,
              fcl_shipments_perc: kpiRow.fcl_shipments_perc ?? null,
              lcl_shipments_perc: kpiRow.lcl_shipments_perc ?? null,
            };
          });
          setResults(enriched);
        } catch {
          setResults(mappedResults);
        }
        // Track search usage in search_queries table
        if (user?.id) {
          supabase
            .from("search_queries")
            .insert({
              user_id: user.id,
              query,
              results_count: mappedResults.length,
            })
            .then(() => {});
        }

        if (mappedResults.length === 0) {
          toast({
            title: "No results found",
            description: `No companies found matching "${query}"`,
          });
        }
      } else {
        throw new Error(response?.meta ? "Search returned invalid payload" : "Search failed");
      }
    } catch (error: any) {
      console.error("Search error:", error);
      // LIMIT_EXCEEDED: surface the upgrade modal instead of a "0 results"
      // toast. The error was tagged in api.ts:searchShippers when the
      // edge function returned 403 + LIMIT_EXCEEDED.
      if (error?.code === "LIMIT_EXCEEDED" && error?.limitExceeded) {
        setUpgradeModal(error.limitExceeded as LimitExceeded);
        setResults([]);
      } else {
        toast({
          title: "Search failed",
          description: error.message || "Unable to search companies. Please try again.",
          variant: "destructive",
        });
        setResults([]);
      }
    } finally {
      setSearching(false);
    }
  };

  // Phase 5 — auto-run a search when the URL carries `?q=…` and auth is
  // ready. Single-shot guard via a ref so editing the input or routing
  // back doesn't re-trigger. The Pulse AI tab's "Similar Companies"
  // links route here with q=<encoded company name> to deep-link a fresh
  // search.
  const autoRanRef = React.useRef(false);
  useEffect(() => {
    if (autoRanRef.current) return;
    if (!authReady) return;
    const q = (searchParams.get("q") || "").trim();
    if (q.length < 2) return;
    autoRanRef.current = true;
    setSearchQuery(q);
    const fakeEvent = {
      preventDefault: () => {},
    } as unknown as React.FormEvent;
    void handleSearch(fakeEvent, q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authReady, searchParams]);

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
      // LimitExceededError thrown from the canonical save path: surface
      // the upgrade modal instead of a generic "Save failed" toast.
      if (error instanceof LimitExceededError) {
        setUpgradeModal({
          ok: false,
          code: "LIMIT_EXCEEDED",
          feature: error.feature as any,
          used: error.used,
          limit: error.limit,
          plan: error.plan,
          reset_at: null,
          upgrade_url: error.upgrade_url || "/app/billing",
          message: error.message,
        });
      } else {
        toast({
          title: "Save failed",
          description: error?.message || "Could not save company. Please try again.",
          variant: "destructive",
        });
      }
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

  // Phase D client-side filter pipeline. Applies the 4 approved chips
  // (TEU Range, Load Type, Top Container, Saved Only) to `results` in-memory.
  // Zero new network calls. Every field read here is already on the mapped
  // company rows from the existing searchShippers → fetchSearchKpiOverlay
  // path. When every chip is at its default value the filter is a
  // pass-through identity, so unfiltered UX is byte-for-byte unchanged.
  const filteredResults = useMemo(() => {
    return results.filter((co) => {
      if (teuRange !== "any") {
        const t = co.teu_estimate;
        if (t == null || !Number.isFinite(t)) return false;
        if (teuRange === "<=1k" && t > 1000) return false;
        if (teuRange === "1k-10k" && (t <= 1000 || t > 10000)) return false;
        if (teuRange === "10k-100k" && (t <= 10000 || t > 100000)) return false;
        if (teuRange === ">100k" && t <= 100000) return false;
      }
      if (loadType === "fcl") {
        const pct = (co as any).fcl_percent;
        if (pct == null || Number(pct) < 50) return false;
      }
      if (loadType === "lcl") {
        const pct = (co as any).lcl_percent;
        if (pct == null || Number(pct) < 50) return false;
      }
      if (topContainer !== "any") {
        const code = canonicalContainerCode((co as any).top_container_length);
        if (code !== topContainer) return false;
      }
      if (savedOnly) {
        const key =
          (co as any).importyeti_key ||
          ((co as any).company_id ? `company/${(co as any).company_id}` : null);
        if (!key || !savedCompanyIds.includes(key)) return false;
      }
      return true;
    });
  }, [results, teuRange, loadType, topContainer, savedOnly, savedCompanyIds]);

  const hasActiveFilter =
    teuRange !== "any" || loadType !== "any" || topContainer !== "any" || savedOnly;

  const clearFilters = () => {
    setTeuRange("any");
    setLoadType("any");
    setTopContainer("any");
    setSavedOnly(false);
  };

  // KPI strip values — Total / Active / Avg TEU / Saved. All read from
  // already-fetched results or existing savedCompanyIds. `—` when empty.
  const kpiTotal = results.length;
  const kpiActive = results.filter((co) => (co.shipments || 0) > 0).length;
  const kpiAvgTeu = (() => {
    const vals = results
      .map((co) => co.teu_estimate)
      .filter((v): v is number => typeof v === "number" && Number.isFinite(v));
    if (vals.length === 0) return null;
    return Math.round(vals.reduce((s, v) => s + v, 0) / vals.length);
  })();
  const kpiSaved = savedCompanyIds.length;

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
              <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                Discover
              </div>
              <h1 className="mt-1 text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
                Discover Companies
              </h1>
              <p className="mt-1 text-sm text-slate-500">
                Global shipment and company intelligence
                {hasSearched && !searching && filteredResults.length > 0 ? (
                  <span className="ml-2 text-slate-400">·</span>
                ) : null}
                {hasSearched && !searching && filteredResults.length > 0 ? (
                  <span className="ml-2 text-slate-600">
                    <span className="font-semibold text-slate-900">{filteredResults.length.toLocaleString()}</span>{" "}
                    {filteredResults.length === 1 ? "company" : "companies"} shown
                  </span>
                ) : null}
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

        {/* Phase D — Discover KPI strip. All four tiles read real, already
            in-flight data; no extra fetches, no mock numbers. Tiles show
            "—" when their source is empty. Only rendered after a search
            completes so the pre-search empty state stays calm. */}
        {hasSearched && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.04 }}
            className="rounded-2xl border border-slate-200 p-3 md:p-4 shadow-sm"
            style={{
              background:
                "linear-gradient(180deg, rgba(255,255,255,0.9) 0%, rgba(248,250,252,0.9) 100%)",
              boxShadow: "0 10px 30px -22px rgba(15, 23, 42, 0.22)",
            }}
          >
            <div className="mb-3 text-[10px] font-semibold uppercase tracking-[0.22em] text-indigo-500">
              Discover · This search
            </div>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              {
                label: "Total Companies",
                value: kpiTotal > 0 ? kpiTotal.toLocaleString() : "—",
                icon: SearchIcon,
                tintBg: "bg-indigo-50",
                tintText: "text-indigo-600",
                tintRing: "ring-indigo-100",
              },
              {
                label: "Active Shippers",
                value: kpiActive > 0 ? kpiActive.toLocaleString() : "—",
                icon: Ship,
                tintBg: "bg-cyan-50",
                tintText: "text-cyan-600",
                tintRing: "ring-cyan-100",
              },
              {
                label: "Avg TEU / Year",
                value: kpiAvgTeu != null && kpiAvgTeu > 0 ? kpiAvgTeu.toLocaleString() : "—",
                icon: Package,
                tintBg: "bg-amber-50",
                tintText: "text-amber-600",
                tintRing: "ring-amber-100",
              },
              {
                label: "In Command Center",
                value: kpiSaved > 0 ? kpiSaved.toLocaleString() : "—",
                icon: Bookmark,
                tintBg: "bg-emerald-50",
                tintText: "text-emerald-600",
                tintRing: "ring-emerald-100",
              },
            ].map((k) => (
              <div
                key={k.label}
                className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm"
              >
                <div
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1 ${k.tintBg} ${k.tintRing}`}
                >
                  <k.icon className={`h-4 w-4 ${k.tintText}`} />
                </div>
                <div className="min-w-0">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                    {k.label}
                  </div>
                  <div className="mt-0.5 truncate text-lg font-semibold tracking-tight text-slate-950">
                    {k.value}
                  </div>
                </div>
              </div>
            ))}
            </div>
          </motion.div>
        )}

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

        {/* Phase D — Inline filter chips. Only shown after a search, and
            only for filters backed by real fields already on the mapped
            results (teu_estimate, fcl_percent / lcl_percent,
            top_container_length via canonicalContainerCode, savedCompanyIds).
            No Carrier / Trade Lane / HS Code chips because those fields
            aren't on search results today. */}
        {hasSearched && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm"
          >
            {[
              {
                label: "TEU Range",
                value: teuRange,
                onChange: (v: string) => setTeuRange(v as TeuRange),
                options: [
                  { value: "any", label: "Any" },
                  { value: "<=1k", label: "≤1K" },
                  { value: "1k-10k", label: "1K–10K" },
                  { value: "10k-100k", label: "10K–100K" },
                  { value: ">100k", label: ">100K" },
                ] as Array<{ value: string; label: string }>,
              },
              {
                label: "Load Type",
                value: loadType,
                onChange: (v: string) => setLoadType(v as LoadType),
                options: [
                  { value: "any", label: "Any" },
                  { value: "fcl", label: "FCL-heavy" },
                  { value: "lcl", label: "LCL-heavy" },
                ] as Array<{ value: string; label: string }>,
              },
              {
                label: "Top Container",
                value: topContainer,
                onChange: (v: string) => setTopContainer(v as TopContainer),
                options: [
                  { value: "any", label: "Any" },
                  { value: "20FT", label: "20FT" },
                  { value: "40FT", label: "40FT" },
                  { value: "40HC", label: "40HC" },
                  { value: "45FT", label: "45FT" },
                ] as Array<{ value: string; label: string }>,
              },
            ].map((group) => (
              <div key={group.label} className="flex items-center gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  {group.label}
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {group.options.map((opt) => {
                    const active = group.value === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => group.onChange(opt.value)}
                        aria-pressed={active}
                        className={`inline-flex items-center rounded-full px-3 py-1.5 text-xs font-medium transition focus:outline-none focus:ring-2 focus:ring-indigo-200 ${
                          active
                            ? "bg-slate-900 text-white shadow-sm"
                            : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                        }`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}

            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Saved Only
              </span>
              <button
                type="button"
                onClick={() => setSavedOnly((v) => !v)}
                aria-pressed={savedOnly}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition focus:outline-none focus:ring-2 focus:ring-indigo-200 ${
                  savedOnly
                    ? "bg-emerald-600 text-white shadow-sm"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                {savedOnly ? <Bookmark className="h-3 w-3" /> : null}
                {savedOnly ? "On" : "Off"}
              </button>
            </div>

            {hasActiveFilter && (
              <button
                type="button"
                onClick={clearFilters}
                className="ml-auto inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
              >
                <X className="h-3 w-3" /> Clear filters
              </button>
            )}
          </motion.div>
        )}

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
                    Showing{" "}
                    <span className="font-semibold text-slate-900">{filteredResults.length.toLocaleString()}</span>
                    {hasActiveFilter && filteredResults.length !== results.length ? (
                      <>
                        {" "}
                        of <span className="font-semibold text-slate-700">{results.length.toLocaleString()}</span>
                      </>
                    ) : null}{" "}
                    companies
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
                {filteredResults.map((company, index) => (
                  <motion.div
                    key={company.id}
                    initial={{ opacity: 0, y: 18 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.04 + index * 0.03 }}
                  >
                    <Card className="group h-full overflow-hidden rounded-2xl border border-slate-200 shadow-sm transition hover:border-slate-300 hover:shadow-md" style={{ background: 'linear-gradient(180deg,#FFFFFF 0%,#F8FAFC 100%)' }}>
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
                                <CardTitle className="truncate text-base font-semibold text-slate-900 transition group-hover:text-indigo-600 font-['Space_Grotesk']">
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

                          <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: 4,
                            padding: '3px 9px', borderRadius: 9999, fontSize: 11, fontWeight: 600,
                            fontFamily: "'Space Grotesk', sans-serif", whiteSpace: 'nowrap',
                            ...(company.status === 'Active' && (company.shipments || 0) > 0
                              ? { background: '#F0FDF4', color: '#15803d', border: '1px solid #BBF7D0' }
                              : { background: '#F1F5F9', color: '#64748b', border: '1px solid #E2E8F0' }),
                          }}>
                            <span style={{ width: 5, height: 5, borderRadius: '50%', display: 'inline-block', background: company.status === 'Active' && (company.shipments || 0) > 0 ? '#22C55E' : '#94A3B8' }} />
                            {company.status === 'Active' && (company.shipments || 0) > 0 ? 'Active' : 'Inactive'}
                          </span>
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
                          {company.latest_year_teu == null &&
                            company.latest_year_shipments == null &&
                            company.top_container_length == null &&
                            company.fcl_percent == null &&
                            company.lcl_percent == null && (
                            <Badge variant="outline" className="rounded-full text-xs text-slate-500">
                              More intelligence on open
                            </Badge>
                          )}
                        </div>
                      </CardHeader>

                      <CardContent className="space-y-4 p-4 pt-0">
                        <div className="grid grid-cols-3 gap-2">
                          <div style={{ background: '#F8FAFC', borderRadius: 6, padding: '8px 10px' }}>
                            <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#94a3b8', fontFamily: "'Space Grotesk', sans-serif", marginBottom: 3 }}>
                              Shipments
                            </div>
                            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 14, fontWeight: 600, color: '#1d4ed8' }}>
                              {company.shipments_12m ? company.shipments_12m.toLocaleString() : company.shipments.toLocaleString()}
                            </div>
                          </div>

                          <div style={{ background: '#F8FAFC', borderRadius: 6, padding: '8px 10px' }}>
                            <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#94a3b8', fontFamily: "'Space Grotesk', sans-serif", marginBottom: 3 }}>
                              TEU
                            </div>
                            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 14, fontWeight: 600, color: '#374151' }}>
                              {company.teu_estimate != null ? company.teu_estimate.toLocaleString() : "—"}
                            </div>
                          </div>

                          <div style={{ background: '#F8FAFC', borderRadius: 6, padding: '8px 10px' }}>
                            <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#94a3b8', fontFamily: "'Space Grotesk', sans-serif", marginBottom: 3 }}>
                              Last Ship
                            </div>
                            <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600, color: '#374151' }}>
                              {/* Phase B.5 — cap future-dated shipment values so a stale row never paints "Dec 26, 2027" on a card. */}
                              {formatSafeShipmentDate(company.last_shipment, "—")}
                            </div>
                          </div>
                        </div>

                        <div style={{ borderTop: '1px solid #F1F5F9', paddingTop: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span style={{ fontSize: 11, color: '#94a3b8', fontFamily: "'DM Sans', sans-serif", display: 'flex', alignItems: 'center', gap: 4 }}>
                            <Users className="h-3 w-3" />
                            {company.top_suppliers.length > 0 ? company.top_suppliers[0] : '—'}
                            {company.top_suppliers.length > 1 && (
                              <span style={{ fontSize: 10, fontWeight: 600, padding: '1px 5px', borderRadius: 9999, background: '#F1F5F9', color: '#64748b' }}>
                                +{company.top_suppliers.length - 1}
                              </span>
                            )}
                          </span>
                          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                            {company.top_container_length && (
                              <span style={{ fontSize: 10, fontWeight: 600, fontFamily: "'Space Grotesk', sans-serif", padding: '2px 7px', borderRadius: 4, background: '#EFF6FF', color: '#3b82f6', border: '1px solid #BFDBFE' }}>
                                {company.top_container_length}
                              </span>
                            )}
                            {(company.fcl_shipments_perc != null || company.fcl_percent != null) && (
                              <span style={{ fontSize: 10, fontWeight: 600, fontFamily: "'Space Grotesk', sans-serif", padding: '2px 7px', borderRadius: 4, background: '#F8FAFC', color: '#64748b', border: '1px solid #E5E7EB' }}>
                                {Math.round(company.fcl_shipments_perc ?? company.fcl_percent ?? 0)}% FCL
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex gap-2 pt-1">
                          <Button
                            variant="default"
                            size="sm"
                            className="h-10 flex-1 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-sm font-semibold text-white shadow-sm hover:from-blue-700 hover:to-indigo-700"
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
                      {filteredResults.map((company, index) => (
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
                                {/* Phase B.5 — cap future dates and only show recency badges when the date is actually in the past. */}
                                {formatSafeShipmentDate(company.last_shipment, "—")}
                              </div>
                              {(() => {
                                const cappedForBadge = capFutureDate(company.last_shipment);
                                const badgeInfo = cappedForBadge
                                  ? getDateBadgeInfo(cappedForBadge)
                                  : null;
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

            {!searching && filteredResults.length === 0 && (
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
            contacts={contacts}
            loadingContacts={loadingContacts}
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
      <UpgradeModal limit={upgradeModal} onClose={() => setUpgradeModal(null)} />
    </div>
  );
}
