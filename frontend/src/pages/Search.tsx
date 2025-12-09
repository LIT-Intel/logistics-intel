/* frontend/src/pages/Search.tsx */

import React, {
  useEffect,
  useMemo,
  useState,
  useCallback,
  useRef,
} from "react";
import { useDebounce } from "use-debounce";

import {
  searchShippers,
  getIyCompanyProfile,
  iyCompanyStats,
  listSavedCompanies,
  saveCompanyToCommandCenter,
} from "@/lib/api";

import { cn } from "@/lib/utils";

import SearchResultCard from "@/components/search/SearchResultCard";
import SearchFilters from "@/components/search/SearchFilters";
import SearchWorkspacePanel from "@/components/search/SearchWorkspacePanel";
import ShipperDetailModal from "@/components/search/ShipperDetailModal";

/* -------------------------------------------------------------------------- */
/* Local types (so we don't depend on the broken "@/types" barrel)            */
/* -------------------------------------------------------------------------- */

type ModeFilter = "any" | "ocean" | "air";
type RegionFilter = "global" | "americas" | "emea" | "apac";
type ActivityFilter = "12m" | "24m" | "all";

type SearchFiltersValue = {
  mode: ModeFilter;
  region: RegionFilter;
  activity: ActivityFilter;
};

type SearchWorkspaceTab = "overview" | "lanes" | "suppliers" | "saved";

type ShipperStage = "prospect" | "customer" | "lost";
type SearchStage = ShipperStage | "none";

type IyCompanyHit = {
  key: string;
  title: string;
  address?: string | null;
  countryCode?: string | null;
  totalShipments?: number | null;
  mostRecentShipment?: string | null;
  topSuppliers?: string[] | null;
  // we don't need the rest of the shape here – it just gets passed through
};

type IyCompanyProfile = any;

type ActivityStats = {
  shipments12m: number | null;
  shipments6m: number | null;
  shipments3m: number | null;
  shipments1m: number | null;
  trend: string | null;
};

type SavedCompanyRecord = {
  id: string;
  companyKey: string;
  name: string;
  stage: SearchStage;
};

type EnrichmentState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; summary: string }
  | { status: "error"; message: string };

type SearchState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | {
      status: "loaded";
      results: IyCompanyHit[];
      total: number;
    };

type LanesState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | {
      status: "loaded";
      lanes: any[];
      shipments12m: number | null;
    };

type SuppliersState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | {
      status: "loaded";
      suppliers: any[];
    };

type ActivityState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | {
      status: "loaded";
      stats: ActivityStats;
    };

type WorkspaceState = {
  activeTab: SearchWorkspaceTab;
};

type SearchFormState = {
  companyName: string;
};

/* -------------------------------------------------------------------------- */
/* Helpers & defaults                                                         */
/* -------------------------------------------------------------------------- */

const defaultFilters: SearchFiltersValue = {
  mode: "any",
  region: "global",
  activity: "12m",
};

const defaultWorkspace: WorkspaceState = {
  activeTab: "overview",
};

const INITIAL_ENRICHMENT: EnrichmentState = { status: "idle" };

const INITIAL_SEARCH_STATE: SearchState = { status: "idle" };
const INITIAL_LANES_STATE: LanesState = { status: "idle" };
const INITIAL_SUPPLIERS_STATE: SuppliersState = { status: "idle" };
const INITIAL_ACTIVITY_STATE: ActivityState = { status: "idle" };

const defaultSearchFormState: SearchFormState = {
  companyName: "",
};

function normalizeStage(stage?: string | null): SearchStage {
  if (!stage) return "none";
  const s = stage.toLowerCase();
  if (s === "prospect" || s === "customer" || s === "lost") return s;
  return "none";
}

function isStageSaved(stage: SearchStage): boolean {
  return stage === "prospect" || stage === "customer" || stage === "lost";
}

const modeOptions: { label: string; value: ModeFilter }[] = [
  { label: "Any", value: "any" },
  { label: "Ocean", value: "ocean" },
  { label: "Air", value: "air" },
];

const regionOptions: { label: string; value: RegionFilter }[] = [
  { label: "Global", value: "global" },
  { label: "Americas", value: "americas" },
  { label: "EMEA", value: "emea" },
  { label: "APAC", value: "apac" },
];

const activityOptions: { label: string; value: ActivityFilter }[] = [
  { label: "12m Active", value: "12m" },
  { label: "24m", value: "24m" },
  { label: "All time", value: "all" },
];

/* -------------------------------------------------------------------------- */
/* Saved companies (Command Center)                                          */
/* -------------------------------------------------------------------------- */

function useSavedCompanies() {
  const [stageFilter, setStageFilter] = useState<SearchStage | "all">("all");
  const [records, setRecords] = useState<SavedCompanyRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadSavedCompanies = useCallback(
    async (stage?: SearchStage | "all") => {
      setLoading(true);
      setError(null);
      try {
        // API helper is typed to return CommandCenterRecord[], not { records: [] }
        const resultAny: any = await listSavedCompanies();
        const list: any[] = Array.isArray(resultAny)
          ? resultAny
          : Array.isArray(resultAny?.records)
            ? resultAny.records
            : [];

        const mapped: SavedCompanyRecord[] = list.map((r: any) => ({
          id:
            r.id ??
            r.company_id ??
            r.companyKey ??
            r.company?.company_id ??
            r.company?.id ??
            "",
          companyKey:
            r.companyKey ??
            r.company_id ??
            r.company?.company_id ??
            r.company?.key ??
            "",
          name:
            r.name ??
            r.company?.name ??
            r.payload?.name ??
            r.company_name ??
            "",
          stage: normalizeStage(r.stage),
        }));

        setRecords(mapped);
        if (stage) {
          setStageFilter(stage);
        }
      } catch (err: any) {
        setError(
          err?.message ||
            "Unable to load Command Center saved companies. Try again.",
        );
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    void loadSavedCompanies();
  }, [loadSavedCompanies]);

  const filteredRecords = useMemo(() => {
    if (stageFilter === "all") return records;
    return records.filter((r) => r.stage === stageFilter);
  }, [records, stageFilter]);

  return {
    stageFilter,
    setStageFilter,
    records,
    filteredRecords,
    loading,
    error,
    reload: loadSavedCompanies,
  };
}

/* -------------------------------------------------------------------------- */
/* Page component                                                             */
/* -------------------------------------------------------------------------- */

export default function SearchPage() {
  const [form, setForm] = useState<SearchFormState>(defaultSearchFormState);
  const [filters, setFilters] =
    useState<SearchFiltersValue>(defaultFilters);
  const [workspace, setWorkspace] =
    useState<WorkspaceState>(defaultWorkspace);
  const [selectedShipper, setSelectedShipper] =
    useState<IyCompanyHit | null>(null);
  const [profile, setProfile] = useState<IyCompanyProfile | null>(null);

  const [searchState, setSearchState] =
    useState<SearchState>(INITIAL_SEARCH_STATE);
  const [lanesState, setLanesState] =
    useState<LanesState>(INITIAL_LANES_STATE);
  const [suppliersState, setSuppliersState] =
    useState<SuppliersState>(INITIAL_SUPPLIERS_STATE);
  const [activityState, setActivityState] =
    useState<ActivityState>(INITIAL_ACTIVITY_STATE);

  const [enrichment, setEnrichment] =
    useState<EnrichmentState>(INITIAL_ENRICHMENT);

  const [saving, setSaving] = useState(false);
  const [savedStage, setSavedStage] = useState<SearchStage>("none");

  const [debouncedName] = useDebounce(form.companyName.trim(), 400);
  const [lastQueryKey, setLastQueryKey] = useState<string | null>(null);

  const [shipperSyncKey, setShipperSyncKey] = useState<string | null>(null);
  const [shipperCommandCenterStatus, setShipperCommandCenterStatus] =
    useState<{
      stage: SearchStage;
      lastUpdatedAt?: string | null;
    }>({
      stage: "none",
      lastUpdatedAt: null,
    });

  const {
    filteredRecords: savedCompanies,
    loading: savedLoading,
    error: savedError,
    reload: reloadSavedCompanies,
    stageFilter,
    setStageFilter,
  } = useSavedCompanies();

  const summaryScrollRef = useRef<HTMLDivElement | null>(null);

  const shipperHit = useMemo(() => {
    if (!selectedShipper) return null;
    const baseKey = selectedShipper.key;
    if (!baseKey) return null;
    if (!shipperSyncKey) return selectedShipper;
    if (baseKey === shipperSyncKey) return selectedShipper;

    const found =
      searchState.status === "loaded"
        ? searchState.results.find((row) => row.key === shipperSyncKey)
        : null;
    return found || selectedShipper;
  }, [selectedShipper, shipperSyncKey, searchState]);

  const normalizedActivity = useMemo(() => {
    if (activityState.status !== "loaded") return null;
    const stats = activityState.stats;
    return {
      shipments12m: stats.shipments12m ?? null,
      shipments6m: stats.shipments6m ?? null,
      shipments3m: stats.shipments3m ?? null,
      shipments1m: stats.shipments1m ?? null,
      trend: stats.trend ?? null,
    };
  }, [activityState]);

  const normalizedLanes = useMemo(() => {
    if (lanesState.status !== "loaded") return [];
    return lanesState.lanes || [];
  }, [lanesState]);

  const normalizedSuppliers = useMemo(() => {
    if (suppliersState.status !== "loaded") return [];
    return suppliersState.suppliers || [];
  }, [suppliersState]);

  const enrichmentReadyLabel = useMemo(() => {
    if (enrichment.status === "ready") return "Enriched";
    if (enrichment.status === "loading") return "Enriching…";
    if (enrichment.status === "error") return "Enrichment error";
    return "AI enrichment ready";
  }, [enrichment.status]);

  const activeTab = workspace.activeTab;
  const canSearch = !!debouncedName;

  const scrollSummaryIntoView = useCallback(() => {
    if (summaryScrollRef.current) {
      summaryScrollRef.current.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }
  }, []);

  /* ---------------------------- core search effect ---------------------------- */

  useEffect(() => {
    if (!debouncedName) {
      setSearchState(INITIAL_SEARCH_STATE);
      setSelectedShipper(null);
      setProfile(null);
      setLanesState(INITIAL_LANES_STATE);
      setSuppliersState(INITIAL_SUPPLIERS_STATE);
      setActivityState(INITIAL_ACTIVITY_STATE);
      setEnrichment(INITIAL_ENRICHMENT);
      setLastQueryKey(null);
      setShipperSyncKey(null);
      setShipperCommandCenterStatus({
        stage: "none",
        lastUpdatedAt: null,
      });
      return;
    }

    const queryKey = JSON.stringify({
      name: debouncedName,
      filters,
    });

    if (queryKey === lastQueryKey) {
      return;
    }
    setLastQueryKey(queryKey);

    let cancelled = false;

    setSearchState({ status: "loading" });
    setSelectedShipper(null);
    setProfile(null);
    setLanesState(INITIAL_LANES_STATE);
    setSuppliersState(INITIAL_SUPPLIERS_STATE);
    setActivityState(INITIAL_ACTIVITY_STATE);
    setEnrichment(INITIAL_ENRICHMENT);
    setShipperSyncKey(null);
    setShipperCommandCenterStatus({
      stage: "none",
      lastUpdatedAt: null,
    });
    setSavedStage("none");
    setWorkspace((prev: WorkspaceState) => ({
      ...prev,
      activeTab: "overview",
    }));

    void (async () => {
      try {
        const result = await searchShippers({
          q: debouncedName,
          page: 1,
          pageSize: 25,
        });

        if (cancelled) return;

        const results: IyCompanyHit[] = (result as any)?.results ?? [];
        const total: number = (result as any)?.total ?? results.length;

        setSearchState({
          status: "loaded",
          results,
          total,
        });

        if (results.length === 1) {
          const single = results[0];
          setSelectedShipper(single);
          setShipperSyncKey(single.key ?? null);
          if (single.key) {
            void loadCompanyProfile(single.key);
            void loadCompanyStats(single.key);
            scrollSummaryIntoView();
          }
        } else if (results.length > 1) {
          const top = results[0];
          setSelectedShipper(top);
          setShipperSyncKey(top.key ?? null);
          if (top.key) {
            void loadCompanyProfile(top.key);
            void loadCompanyStats(top.key);
            scrollSummaryIntoView();
          }
        }
      } catch (err: any) {
        if (cancelled) return;
        setSearchState({
          status: "error",
          message:
            err?.message ||
            "Unable to load shippers. Check your filters and try again.",
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [debouncedName, filters, lastQueryKey, scrollSummaryIntoView]);

  /* ------------------------- company profile + stats ------------------------- */

  const loadCompanyProfile = useCallback(async (companyKey: string) => {
    setProfile(null);
    setEnrichment(INITIAL_ENRICHMENT);

    try {
      const result: any = await getIyCompanyProfile({
        companyKey,
      });

      const companyProfile: IyCompanyProfile | undefined =
        result?.companyProfile;

      if (!companyProfile) {
        setEnrichment({ status: "error", message: "No profile found." });
        return;
      }

      setProfile(companyProfile);

      const summary: string | undefined =
        result?.enrichment?.summary ??
        result?.enrichment?.cachedSummary ??
        result?.cachedSummary ??
        result?.summary;

      if (summary) {
        setEnrichment({ status: "ready", summary });
      } else {
        setEnrichment({
          status: "idle",
        });
      }
    } catch (err: any) {
      setEnrichment({
        status: "error",
        message:
          err?.message ||
          "Unable to load company profile. ImportYeti may be temporarily unavailable.",
      });
    }
  }, []);

  const loadCompanyStats = useCallback(
    async (companyKey: string) => {
      setLanesState({ status: "loading" });
      setSuppliersState({ status: "loading" });
      setActivityState({ status: "loading" });

      try {
        const result: any = await iyCompanyStats({
          company: companyKey,
          range: filters.activity,
        });

        setLanesState({
          status: "loaded",
          lanes: result?.lanes ?? [],
          shipments12m: result?.activity?.shipments12m ?? null,
        });

        setSuppliersState({
          status: "loaded",
          suppliers: result?.suppliers ?? [],
        });

        const activity: ActivityStats = {
          shipments12m: result?.activity?.shipments12m ?? null,
          shipments6m: result?.activity?.shipments6m ?? null,
          shipments3m: result?.activity?.shipments3m ?? null,
          shipments1m: result?.activity?.shipments1m ?? null,
          trend: result?.activity?.trend ?? null,
        };

        setActivityState({
          status: "loaded",
          stats: activity,
        });
      } catch (err: any) {
        const msg =
          err?.message || "Unable to load company stats. Try again later.";
        setLanesState({ status: "error", message: msg });
        setSuppliersState({ status: "error", message: msg });
        setActivityState({ status: "error", message: msg });
      }
    },
    [filters.activity],
  );

  /* ------------------------------ event handlers ----------------------------- */

  const onSearchInputChange = (value: string) => {
    setForm((prev: SearchFormState) => ({
      ...prev,
      companyName: value,
    }));
  };

  const onFiltersChange = (next: SearchFiltersValue) => {
    setFilters(next);
  };

  const onWorkspaceTabChange = (tab: SearchWorkspaceTab) => {
    setWorkspace((prev: WorkspaceState) => ({ ...prev, activeTab: tab }));
  };

  const onSelectShipper = (hit: IyCompanyHit) => {
    setSelectedShipper(hit);
    setShipperSyncKey(hit.key ?? null);
    setWorkspace((prev: WorkspaceState) => ({ ...prev, activeTab: "overview" }));
    setEnrichment(INITIAL_ENRICHMENT);

    if (hit.key) {
      void loadCompanyProfile(hit.key);
      void loadCompanyStats(hit.key);
      scrollSummaryIntoView();
    }
  };

  const onRefreshProfile = async () => {
    if (!shipperHit?.key) return;

    setEnrichment({ status: "loading" });

    try {
      const updated: any = await getIyCompanyProfile({
        companyKey: shipperHit.key,
      });

      const companyProfile: IyCompanyProfile | undefined =
        updated?.companyProfile;

      if (!companyProfile) {
        setEnrichment({
          status: "error",
          message: "Unable to refresh profile from ImportYeti.",
        });
        return;
      }

      setProfile(companyProfile);

      const summary: string | undefined =
        updated?.enrichment?.summary ??
        updated?.enrichment?.cachedSummary ??
        updated?.cachedSummary ??
        updated?.summary;

      setEnrichment(
        summary
          ? {
              status: "ready",
              summary,
            }
          : {
              status: "ready",
              summary:
                "Profile refreshed. Gemini enrichment will be available soon.",
            },
      );
    } catch (err: any) {
      setEnrichment({
        status: "error",
        message:
          err?.message ||
          "Unable to refresh profile. ImportYeti or Gemini may be temporarily unavailable.",
      });
    }
  };

  const onSaveToCommandCenter = async (stage: ShipperStage) => {
    if (!shipperHit?.key) return;

    setSaving(true);
    try {
      await saveCompanyToCommandCenter({
        companyKey: shipperHit.key,
        name: shipperHit.title || "",
        stage,
      });

      const normalized = normalizeStage(stage);
      setSavedStage(normalized);
      setShipperCommandCenterStatus({
        stage: normalized,
        lastUpdatedAt: new Date().toISOString(),
      });

      setTimeout(() => {
        void reloadSavedCompanies();
      }, 400);
    } catch (err: any) {
      console.error("saveCompanyToCommandCenter error", err);
    } finally {
      setSaving(false);
    }
  };

  const handleCardSaveClick = async (hit: IyCompanyHit) => {
    setSelectedShipper(hit);
    setShipperSyncKey(hit.key ?? null);
    setWorkspace((prev: WorkspaceState) => ({ ...prev, activeTab: "overview" }));

    if (hit.key) {
      void loadCompanyProfile(hit.key);
      void loadCompanyStats(hit.key);
      scrollSummaryIntoView();
    }
  };

  const handleStageChangeFromPanel = (stage: ShipperStage) => {
    void onSaveToCommandCenter(stage);
  };

  const handleStageFilterChange = (stage: SearchStage | "all") => {
    setStageFilter(stage);
  };

  const handleSavedCompanyClick = (record: SavedCompanyRecord) => {
    const hit =
      searchState.status === "loaded"
        ? searchState.results.find((row) => row.key === record.companyKey)
        : null;

    if (hit) {
      onSelectShipper(hit);
    } else {
      setForm((prev: SearchFormState) => ({
        ...prev,
        companyName: record.name || "",
      }));
    }
  };

  /* --------------------------- main left panel UI ---------------------------- */

  const mainContent = useMemo(() => {
    if (!canSearch) {
      return (
        <div className="flex h-full flex-col items-center justify-center text-center text-muted-foreground">
          <p className="text-base font-medium">
            Enter a company name to search the LIT DMA index.
          </p>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground/80">
            You&apos;ll see top shippers, recent activity, lanes, suppliers,
            and Command Center status for each company.
          </p>
        </div>
      );
    }

    if (searchState.status === "loading") {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-muted-foreground">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <div>
            <p className="font-medium">Searching ImportYeti…</p>
            <p className="text-sm text-muted-foreground/80">
              This usually takes just a few seconds.
            </p>
          </div>
        </div>
      );
    }

    if (searchState.status === "error") {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-red-500">
          <p className="font-medium">Unable to load shippers</p>
          <p className="max-w-md text-sm text-muted-foreground/80">
            {searchState.message}
          </p>
        </div>
      );
    }

    if (
      searchState.status === "loaded" &&
      (!searchState.results || searchState.results.length === 0)
    ) {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-muted-foreground">
          <p className="font-medium">No shippers match your filters</p>
          <p className="max-w-md text-sm text-muted-foreground/80">
            Try relaxing your filters or searching for a slightly broader
            company name.
          </p>
        </div>
      );
    }

    if (searchState.status === "loaded") {
      return (
        <div className="flex h-full flex-col gap-4">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <div>
              Showing <span className="font-medium">{searchState.total}</span>{" "}
              shippers for{" "}
              <span className="font-medium">&ldquo;{debouncedName}&rdquo;</span>
            </div>
          </div>

          <div className="space-y-3" ref={summaryScrollRef}>
            {searchState.results.map((row) => (
              <SearchResultCard
                key={row.key || row.title}
                shipper={row}
                isSaved={
                  !!savedCompanies.find((r) => r.companyKey === row.key)
                }
                onViewDetails={() => onSelectShipper(row)}
                onSave={() => handleCardSaveClick(row)}
              />
            ))}
          </div>
        </div>
      );
    }

    return null;
  }, [
    canSearch,
    debouncedName,
    onSelectShipper,
    savedCompanies,
    searchState,
    handleCardSaveClick,
  ]);

  /* ----------------------------------- JSX ---------------------------------- */

  return (
    <div className="flex h-full flex-col">
      <header className="border-b bg-white/60 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 md:px-6 md:py-5">
          <div>
            <h1 className="text-xl font-semibold tracking-tight md:text-2xl">
              LIT Search Shipper Search
            </h1>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              Search the LIT Search DMA index for verified shippers, view live
              BOL activity, and save companies to Command Center.
            </p>
          </div>

          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-1 flex-col gap-3 md:flex-row md:items-center md:gap-4">
              <div className="flex-1">
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  Company name
                </label>
                <input
                  value={form.companyName}
                  onChange={(e) => onSearchInputChange(e.target.value)}
                  placeholder="Search for Nike, Walmart, Mohawk, etc."
                  className="h-10 w-full rounded-lg border border-input bg-white px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                />
              </div>

              <div className="flex flex-wrap gap-2 text-xs font-medium md:flex-nowrap">
                <div className="flex items-center gap-2 rounded-full bg-muted px-2 py-1">
                  <span className="text-muted-foreground/80">MODE</span>
                  <div className="flex gap-1">
                    {modeOptions.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() =>
                          setFilters((prev: SearchFiltersValue) => ({
                            ...prev,
                            mode: opt.value,
                          }))
                        }
                        className={cn(
                          "rounded-full px-2 py-0.5 text-[11px]",
                          filters.mode === opt.value
                            ? "bg-white text-primary shadow-sm"
                            : "text-muted-foreground hover:bg-white/60",
                        )}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-2 rounded-full bg-muted px-2 py-1">
                  <span className="text-muted-foreground/80">REGION</span>
                  <div className="flex gap-1">
                    {regionOptions.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() =>
                          setFilters((prev: SearchFiltersValue) => ({
                            ...prev,
                            region: opt.value,
                          }))
                        }
                        className={cn(
                          "rounded-full px-2 py-0.5 text-[11px]",
                          filters.region === opt.value
                            ? "bg-white text-primary shadow-sm"
                            : "text-muted-foreground hover:bg-white/60",
                        )}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-2 rounded-full bg-muted px-2 py-1">
                  <span className="text-muted-foreground/80">ACTIVITY</span>
                  <div className="flex gap-1">
                    {activityOptions.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() =>
                          setFilters((prev: SearchFiltersValue) => ({
                            ...prev,
                            activity: opt.value,
                          }))
                        }
                        className={cn(
                          "rounded-full px-2 py-0.5 text-[11px]",
                          filters.activity === opt.value
                            ? "bg-white text-primary shadow-sm"
                            : "text-muted-foreground hover:bg-white/60",
                        )}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <div className="flex items-center gap-2 rounded-full border border-dashed border-amber-300 bg-amber-50/70 px-3 py-1.5 text-amber-800">
                <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-white shadow-sm">
                  <span className="text-[11px] font-semibold">AI</span>
                </span>
                <div className="flex flex-col">
                  <span className="font-medium">
                    {enrichmentReadyLabel || "AI enrichment ready"}
                  </span>
                  <span className="text-[11px] text-amber-900/80">
                    Gemini will summarize trade activity and risk once a company
                    is selected.
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-4 px-4 py-4 md:px-6 md:py-6">
        <div className="grid h-full gap-4 lg:grid-cols-[minmax(0,_1.9fr)_minmax(0,_2.1fr)]">
          <section className="flex min-h-[400px] flex-col rounded-xl border bg-white p-3 shadow-sm md:p-4">
            <header className="mb-3 flex items-center justify-between gap-2">
              <div>
                <div className="text-xs font-medium text-muted-foreground">
                  RESULTS
                </div>
                {searchState.status === "loaded" &&
                  searchState.total > 0 &&
                  debouncedName && (
                    <div className="text-xs text-muted-foreground/80">
                      Showing{" "}
                      <span className="font-semibold">
                        {searchState.total}
                      </span>{" "}
                      shippers for{" "}
                      <span className="font-semibold">
                        &ldquo;{debouncedName}&rdquo;
                      </span>
                    </div>
                  )}
                {searchState.status === "idle" && (
                  <div className="text-xs text-muted-foreground/80">
                    Type a company name and press enter to search.
                  </div>
                )}
              </div>

              <SearchFilters
                value={filters}
                onChange={onFiltersChange}
                className="ml-auto"
              />
            </header>

            <div className="relative flex-1">
              <div className="absolute inset-0 overflow-y-auto pr-2">
                {mainContent}
              </div>
            </div>
          </section>

          <section className="flex min-h-[400px] flex-col rounded-xl border bg-white p-3 shadow-sm md:p-4">
            <SearchWorkspacePanel
              {...({
                activeTab,
                onTabChange: onWorkspaceTabChange,
                shipper: shipperHit,
                profile,
                activity: normalizedActivity,
                lanes: normalizedLanes,
                suppliers: normalizedSuppliers,
                enrichment,
                enrichmentReadyLabel,
                searchState,
                onRefreshProfile,
                onSaveStage: handleStageChangeFromPanel,
                savedCompanies,
                savedLoading,
                savedError,
                onSavedStageFilterChange: handleStageFilterChange,
                activeStageFilter: stageFilter,
                onSavedCompanyClick: handleSavedCompanyClick,
                commandCenterStatus: shipperCommandCenterStatus,
              } as any)}
            />
          </section>
        </div>

        <ShipperDetailModal
          shipper={shipperHit}
          profile={profile}
          enrichment={enrichment}
          enrichmentReadyLabel={enrichmentReadyLabel}
          isOpen={!!shipperHit}
          isSaved={isStageSaved(savedStage)}
          loading={searchState.status === "loading"}
          error={
            searchState.status === "error"
              ? searchState.message
              : enrichment.status === "error"
                ? enrichment.message
                : null
          }
          onClose={() => setSelectedShipper(null)}
          onSaveToCommandCenter={onSaveToCommandCenter}
          saving={saving}
        />
      </main>
    </div>
  );
}
