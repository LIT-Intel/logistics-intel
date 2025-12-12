import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import SearchResultCard from "@/components/search/SearchResultCard";
import SearchWorkspacePanel, {
  type SearchWorkspaceTab,
} from "@/components/search/SearchWorkspacePanel";
import ShipperDetailModal from "@/components/search/ShipperDetailModal";
import SearchFilters from "@/components/search/SearchFilters";
import { cn } from "@/lib/utils";
import {
  searchShippers,
  listSavedCompanies,
  saveCompanyToCommandCenter,
  getIyCompanyProfile,
  type IyShipperHit,
  type IyCompanyProfile,
} from "@/lib/api";

// -----------------------------------------------------------------------------
// Local filter type to match SearchFilters
// -----------------------------------------------------------------------------

type ModeFilter = "any" | "ocean" | "air";
type RegionFilter = "global" | "americas" | "emea" | "apac";
type ActivityFilter = "12m" | "24m" | "all";

type SearchFiltersValue = {
  mode: ModeFilter;
  region: RegionFilter;
  activity: ActivityFilter;
};

// -----------------------------------------------------------------------------
// Saved companies list (for showing saved state in cards / panel)
// -----------------------------------------------------------------------------

type SavedCompanyRecord = {
  id: string;
  companyKey: string;
  name: string;
  stage: string | null;
};

type SearchState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "loaded"; rows: IyShipperHit[]; total: number };

const defaultFilters: SearchFiltersValue = {
  mode: "any",
  region: "global",
  activity: "12m",
};

const INITIAL_SEARCH_STATE: SearchState = { status: "idle" };

// Small debounce hook
function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState<T>(value);

  useEffect(() => {
    const handle = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(handle);
  }, [value, delay]);

  return debounced;
}

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<SearchFiltersValue>(defaultFilters);
  const [searchState, setSearchState] =
    useState<SearchState>(INITIAL_SEARCH_STATE);
  const [selectedShipper, setSelectedShipper] = useState<IyShipperHit | null>(
    null,
  );
  const [profile, setProfile] = useState<IyCompanyProfile | null>(null);
  const [enrichment, setEnrichment] = useState<any | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  const [savedCompanies, setSavedCompanies] = useState<SavedCompanyRecord[]>(
    [],
  );
  const [savedLoading, setSavedLoading] = useState(false);

  const [activeTab, setActiveTab] =
    useState<SearchWorkspaceTab>("overview");
  const [saving, setSaving] = useState(false);

  const debouncedQuery = useDebouncedValue(query.trim(), 400);
  const summaryRef = useRef<HTMLDivElement | null>(null);

  // ---------------------------------------------------------------------------
  // Load saved companies (Command Center)
  // ---------------------------------------------------------------------------

  const reloadSavedCompanies = useCallback(async () => {
    setSavedLoading(true);
    try {
      const res = await listSavedCompanies();
      setSavedCompanies(res.records);
    } catch (err) {
      console.error("listSavedCompanies failed", err);
      setSavedCompanies([]);
    } finally {
      setSavedLoading(false);
    }
  }, []);

  useEffect(() => {
    void reloadSavedCompanies();
  }, [reloadSavedCompanies]);

  const isCompanySaved = useCallback(
    (companyKey?: string | null) => {
      if (!companyKey) return false;
      return savedCompanies.some((r) => r.companyKey === companyKey);
    },
    [savedCompanies],
  );

  // ---------------------------------------------------------------------------
  // Search shippers (ImportYeti DMA via /public/iy/searchShippers)
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!debouncedQuery) {
      setSearchState(INITIAL_SEARCH_STATE);
      setSelectedShipper(null);
      setProfile(null);
      setEnrichment(null);
      setProfileError(null);
      return;
    }

    let cancelled = false;

    setSearchState({ status: "loading" });
    setSelectedShipper(null);
    setProfile(null);
    setEnrichment(null);
    setProfileError(null);

    async function run() {
      try {
        const result = await searchShippers({
          q: debouncedQuery,
          pageSize: 25,
          mode: filters.mode,
          region: filters.region,
          activity: filters.activity,
        });

        if (cancelled) return;

        setSearchState({
          status: "loaded",
          rows: result.rows,
          total: result.total,
        });

        if (result.rows.length > 0) {
          const first = result.rows[0];
          handleSelectShipper(first, false);
        }
      } catch (err: any) {
        if (cancelled) return;
        console.error("searchShippers failed", err);
        setSearchState({
          status: "error",
          message:
            err?.message ||
            "Unable to load shippers. Please try again.",
        });
      }
    }

    void run();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQuery, filters.mode, filters.region, filters.activity]);

  // ---------------------------------------------------------------------------
  // Load profile + enrichment for ShipperDetailModal and as initialProfile
  // for SearchWorkspacePanel
  // ---------------------------------------------------------------------------

  const loadProfileForShipper = useCallback(
    async (shipper: IyShipperHit) => {
      if (!shipper?.key) {
        setProfile(null);
        setEnrichment(null);
        return;
      }

      setProfileLoading(true);
      setProfileError(null);

      try {
        const response = await getIyCompanyProfile({
          companyKey: shipper.key,
          userGoal:
            "Populate LIT Search detail modal and workspace panel with company intelligence",
        });

        setProfile(response.companyProfile ?? null);
        setEnrichment(response.enrichment ?? null);
      } catch (err: any) {
        console.error("getIyCompanyProfile failed", err);
        setProfile(null);
        setEnrichment(null);
        setProfileError(
          err?.message || "Unable to load company profile",
        );
      } finally {
        setProfileLoading(false);
      }
    },
    [],
  );

  // When user selects a card
  const handleSelectShipper = useCallback(
    (shipper: IyShipperHit, scrollIntoView = true) => {
      setSelectedShipper(shipper);
      setActiveTab("overview");
      void loadProfileForShipper(shipper);

      if (scrollIntoView && summaryRef.current) {
        summaryRef.current.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }
    },
    [loadProfileForShipper],
  );

  // ---------------------------------------------------------------------------
  // Save to Command Center (used by cards & modal)
  // ---------------------------------------------------------------------------

  const handleSaveToCommandCenter = useCallback(
    async (shipper: IyShipperHit, profileForSave: IyCompanyProfile | null) => {
      if (!shipper?.key) return;
      setSaving(true);
      try {
        await saveCompanyToCommandCenter({
          companyKey: shipper.key,
          name:
            profileForSave?.companyName ??
            shipper.title ??
            shipper.name ??
            "Company",
          stage: "prospect",
        });

        // Optimistically update local saved list
        setSavedCompanies((prev) => {
          if (prev.some((r) => r.companyKey === shipper.key)) {
            return prev;
          }
          return [
            ...prev,
            {
              id: shipper.key,
              companyKey: shipper.key,
              name:
                shipper.title ??
                shipper.name ??
                profileForSave?.companyName ??
                "Company",
              stage: "prospect",
            },
          ];
        });
      } catch (err) {
        console.error("saveCompanyToCommandCenter failed", err);
      } finally {
        setSaving(false);
      }
    },
    [],
  );

  const handleToggleSaveFromCard = useCallback(
    async (shipper: IyShipperHit) => {
      if (isCompanySaved(shipper.key)) {
        // For now, no unsave API; just no-op.
        return;
      }
      await handleSaveToCommandCenter(shipper, profile);
    },
    [handleSaveToCommandCenter, isCompanySaved, profile],
  );

  // ---------------------------------------------------------------------------
  // Derived values for UI
  // ---------------------------------------------------------------------------

  const canSearch = Boolean(debouncedQuery);

  const selectedCompanyForWorkspace = useMemo(() => {
    if (!selectedShipper) return null;

    const companyKey =
      selectedShipper.key ||
      selectedShipper.companyKey ||
      selectedShipper.companyId ||
      selectedShipper.title ||
      selectedShipper.name ||
      "";

    const subtitle =
      selectedShipper.address ||
      [selectedShipper.city, selectedShipper.state, selectedShipper.country]
        .filter(Boolean)
        .join(", ") ||
      null;

    return {
      companyKey,
      title:
        selectedShipper.title ??
        selectedShipper.name ??
        "Company",
      subtitle,
      shipper: selectedShipper,
      isSaved: isCompanySaved(companyKey),
      initialProfile: profile,
    };
  }, [isCompanySaved, profile, selectedShipper]);

  const mainContent = useMemo(() => {
    if (!canSearch) {
      return (
        <div className="flex h-full flex-col items-center justify-center text-center text-muted-foreground">
          <p className="text-base font-medium">
            Enter a company name to search the LIT DMA index.
          </p>
          <p className="mt-1 text-sm text-muted-foreground/80 max-w-xl">
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
          <p className="text-sm text-muted-foreground/80 max-w-md">
            {searchState.message}
          </p>
        </div>
      );
    }

    if (
      searchState.status === "loaded" &&
      searchState.rows.length === 0
    ) {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-muted-foreground">
          <p className="font-medium">No shippers match your filters</p>
          <p className="text-sm text-muted-foreground/80 max-w-md">
            Try relaxing your filters or searching for a slightly broader
            company name.
          </p>
        </div>
      );
    }

    if (searchState.status === "loaded") {
      return (
        <div className="flex h-full flex-col gap-4" ref={summaryRef}>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <div>
              Showing{" "}
              <span className="font-medium">
                {searchState.total}
              </span>{" "}
              shippers for{" "}
              <span className="font-medium">
                &ldquo;{debouncedQuery}&rdquo;
              </span>
            </div>
          </div>

          <div className="space-y-3">
            {searchState.rows.map((row) => {
              const companyKey =
                row.key ||
                row.companyKey ||
                row.companyId ||
                row.title ||
                row.name ||
                "";
              return (
                <SearchResultCard
                  key={companyKey}
                  shipper={row}
                  isSaved={isCompanySaved(companyKey)}
                  saving={saving}
                  isActive={selectedShipper?.key === row.key}
                  onToggleSave={() => handleToggleSaveFromCard(row)}
                  onOpenDetails={() => handleSelectShipper(row)}
                  onSelect={() => handleSelectShipper(row)}
                  profile={profile}
                />
              );
            })}
          </div>
        </div>
      );
    }

    return null;
  }, [
    canSearch,
    debouncedQuery,
    handleSelectShipper,
    handleToggleSaveFromCard,
    isCompanySaved,
    profile,
    saving,
    searchState,
    selectedShipper?.key,
  ]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="flex h-full flex-col">
      <header className="border-b bg-white/60 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 md:px-6 md:py-5">
          <div>
            <h1 className="text-xl font-semibold tracking-tight md:text-2xl">
              LIT Search Shipper Search
            </h1>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              Search the LIT Search DMA index for verified shippers, view
              live BOL activity, and save companies to Command Center.
            </p>
          </div>

          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-1 flex-col gap-3 md:flex-row md:items-center md:gap-4">
              <div className="flex-1">
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  Company name
                </label>
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search for Nike, Walmart, Mohawk, etc."
                  className="h-10 w-full rounded-lg border border-input bg-white px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                />
              </div>

              <SearchFilters
                value={filters}
                onChange={setFilters}
                className="md:self-end"
              />
            </div>

            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <div className="flex items-center gap-2 rounded-full border border-dashed border-amber-300 bg-amber-50/70 px-3 py-1.5 text-amber-800">
                <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-white shadow-sm">
                  <span className="text-[11px] font-semibold">AI</span>
                </span>
                <div className="flex flex-col">
                  <span className="font-medium">
                    AI enrichment runs automatically
                  </span>
                  <span className="text-[11px] text-amber-900/80">
                    Gemini summarizes trade and risk once a company is
                    selected.
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-4 px-4 py-4 md:px-6 md:py-6">
        <div className="grid h-full gap-4 lg:grid-cols-[minmax(0,_1.9fr)_minmax(0,_2.1fr)]">
          {/* Left pane: result list */}
          <section className="flex min-h-[400px] flex-col rounded-xl border bg-white p-3 shadow-sm md:p-4">
            <header className="mb-3 flex items-center justify-between gap-2">
              <div>
                <div className="text-xs font-medium text-muted-foreground">
                  RESULTS
                </div>
                {searchState.status === "loaded" &&
                  searchState.total > 0 &&
                  debouncedQuery && (
                    <div className="text-xs text-muted-foreground/80">
                      Showing{" "}
                      <span className="font-semibold">
                        {searchState.total}
                      </span>{" "}
                      shippers for{" "}
                      <span className="font-semibold">
                        &ldquo;{debouncedQuery}&rdquo;
                      </span>
                    </div>
                  )}
              </div>
            </header>

            <div className="relative flex-1">
              <div className="absolute inset-0 overflow-y-auto pr-2">
                {mainContent}
              </div>
            </div>
          </section>

          {/* Right pane: workspace panel */}
          <section className="flex min-h-[400px] flex-col rounded-xl border bg-white p-3 shadow-sm md:p-4">
            <SearchWorkspacePanel
              activeTab={activeTab}
              onTabChange={setActiveTab}
              selectedCompany={selectedCompanyForWorkspace}
            />
          </section>
        </div>

        {/* Detail modal */}
        <ShipperDetailModal
          isOpen={!!selectedShipper}
          shipper={selectedShipper}
          loadingProfile={profileLoading}
          profile={profile}
          enrichment={enrichment}
          error={profileError}
          onClose={() => setSelectedShipper(null)}
          onSaveToCommandCenter={({ shipper, profile }) =>
            handleSaveToCommandCenter(shipper, profile)
          }
          saveLoading={saving}
          isSaved={
            selectedShipper ? isCompanySaved(selectedShipper.key) : false
          }
        />
      </main>
    </div>
  );
}
