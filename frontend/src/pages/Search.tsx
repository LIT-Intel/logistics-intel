import { useCallback, useEffect, useMemo, useState } from "react";
import type { SVGProps } from "react";
import SearchFilters from "@/components/search/SearchFilters";
import CompanyCard from "@/components/search/CompanyCard";
import CompanyModal from "@/components/search/CompanyModal";
import useDebounce from "@/hooks/useDebounce";
import {
  getFilterOptions,
  searchCompanies,
  saveCompanyToCrm,
  iySearchShippers,
  type CompanyHit,
  type FilterOptions,
} from "@/lib/api";

const PAGE_SIZE = 20;

type SelectedFilters = {
  origins: string[];
  destinations: string[];
  modes: string[];
  hs: string[];
};

const emptyFilters = (): SelectedFilters => ({
  origins: [],
  destinations: [],
  modes: [],
  hs: [],
});

const Icon = {
  Search: (props: SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`h-4 w-4 ${props.className ?? ""}`}>
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  ),
};

function ensureStringArray(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((value) => {
      if (typeof value === "string") return value;
      if (value && typeof value === "object") {
        if ("value" in value && typeof (value as any).value === "string") return (value as any).value as string;
        if ("name" in value && typeof (value as any).name === "string") return (value as any).name as string;
        if ("route" in value && typeof (value as any).route === "string") return (value as any).route as string;
      }
      return null;
    })
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0);
}

function adaptShipperRow(row: Record<string, unknown>, fallback: string): CompanyHit {
  const idCandidate =
    typeof row.company_id === "string"
      ? row.company_id
      : typeof row.id === "string"
        ? row.id
        : typeof row.slug === "string"
          ? row.slug
          : null;
  const nameCandidate =
    typeof row.company_name === "string"
      ? row.company_name
      : typeof row.name === "string"
        ? row.name
        : typeof row.title === "string"
          ? row.title
          : null;
  const shipmentsCandidate =
    (row as any)?.shipments_12m ??
    (row as any)?.shipments ??
    (row as any)?.total_shipments ??
    (row as any)?.kpis?.shipments_12m ??
    0;
  const lastActivityCandidate =
    (row as any)?.last_activity ??
    (row as any)?.lastActivity ??
    (row as any)?.most_recent_shipment ??
    (row as any)?.lastShipment ??
    "";

  const routes = ensureStringArray((row as any)?.top_routes);
  const carriers = ensureStringArray((row as any)?.top_carriers);

  return {
    company_id: String(idCandidate ?? nameCandidate ?? fallback ?? ""),
    company_name: typeof nameCandidate === "string" && nameCandidate.trim() ? nameCandidate : "—",
    shipments_12m: Number.isFinite(Number(shipmentsCandidate)) ? Number(shipmentsCandidate) : 0,
    last_activity: typeof lastActivityCandidate === "string" ? lastActivityCandidate : "",
    top_routes: routes,
    top_carriers: carriers,
  };
}

export default function SearchPage() {
  const [activeTab, setActiveTab] = useState<"companies" | "shippers">("companies");
  const [queryInput, setQueryInput] = useState("");
  const [industry, setIndustry] = useState("");
  const [hqLocation, setHqLocation] = useState("");
  const debouncedInput = useDebounce(queryInput.trim(), 300);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchTrigger, setSearchTrigger] = useState(0);

  const [selectedFilters, setSelectedFilters] = useState<SelectedFilters>(emptyFilters);
  const [page, setPage] = useState(1);

  const [filterOptions, setFilterOptions] = useState<FilterOptions | null>(null);
  const [filtersLoading, setFiltersLoading] = useState(true);
  const [filtersError, setFiltersError] = useState<string | null>(null);
  const [filtersErrorDismissed, setFiltersErrorDismissed] = useState(false);

  const [results, setResults] = useState<CompanyHit[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasNextPage, setHasNextPage] = useState(false);

  const [activeCompany, setActiveCompany] = useState<CompanyHit | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setFiltersLoading(true);
    setFiltersError(null);
    setFiltersErrorDismissed(false);

    getFilterOptions()
      .then((options) => {
        if (!cancelled) setFilterOptions(options);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setFiltersError(err instanceof Error ? err.message : "Failed to load filters");
          setFilterOptions(null);
        }
      })
      .finally(() => {
        if (!cancelled) setFiltersLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const trimmed = debouncedInput;
    if (trimmed !== searchTerm) {
      setSearchTerm(trimmed);
      setPage(1);
    }
  }, [debouncedInput, searchTerm]);

  useEffect(() => {
    const controller = new AbortController();
    const currentPage = Math.max(1, page);
    const offset = (currentPage - 1) * PAGE_SIZE;

    setLoading(true);
    setError(null);
    setHasNextPage(false);

    if (activeTab === "companies") {
      searchCompanies(
        {
          q: searchTerm,
          origin: selectedFilters.origins,
          dest: selectedFilters.destinations,
          hs: selectedFilters.hs,
          mode: selectedFilters.modes,
          limit: PAGE_SIZE,
          offset,
        },
        controller.signal,
      )
        .then((response) => {
          if (controller.signal.aborted) return;
          if (response.ok) {
            setResults(response.results);
            setTotal(response.total);
            setHasNextPage(currentPage * PAGE_SIZE < response.total);
            setError(null);
          } else {
            setError(response.message ?? (response.code ? `search ${response.code}` : "Search failed"));
          }
        })
        .catch((err: unknown) => {
          if (controller.signal.aborted) return;
          setError(err instanceof Error ? err.message : "Search failed");
        })
        .finally(() => {
          if (!controller.signal.aborted) {
            setLoading(false);
          }
        });
    } else {
      iySearchShippers({ q: searchTerm, limit: PAGE_SIZE, offset }, controller.signal)
        .then((payload) => {
          if (controller.signal.aborted) return;
          const container = (payload && typeof payload === "object" ? payload : {}) as Record<string, unknown>;
          const data = container.data && typeof container.data === "object" ? (container.data as any) : container;
          const rawRows = Array.isArray((data as any)?.rows)
            ? (data as any).rows
            : Array.isArray((container as any)?.rows)
              ? (container as any).rows
              : Array.isArray(data)
                ? (data as any)
                : [];
          const normalized = rawRows.map((row: any, index: number) =>
            adaptShipperRow(
              typeof row === "object" && row !== null ? (row as Record<string, unknown>) : {},
              `${searchTerm || "shipper"}-${offset + index}`,
            ),
          );
          setResults(normalized);
          setError(null);

          const totalCandidate =
            typeof (data as any)?.total === "number"
              ? (data as any).total
              : typeof (container as any)?.total === "number"
                ? (container as any).total
                : null;

          if (typeof totalCandidate === "number" && Number.isFinite(totalCandidate)) {
            setTotal(totalCandidate);
            setHasNextPage(offset + normalized.length < totalCandidate);
          } else {
            setTotal(null);
            setHasNextPage(normalized.length === PAGE_SIZE);
          }
        })
        .catch((err: unknown) => {
          if (controller.signal.aborted) return;
          setError(err instanceof Error ? err.message : "Search failed");
        })
        .finally(() => {
          if (!controller.signal.aborted) {
            setLoading(false);
          }
        });
    }

    return () => {
      controller.abort();
    };
  }, [activeTab, searchTerm, selectedFilters, page, searchTrigger]);

  const hasSelectedFilters = useMemo(
    () =>
      selectedFilters.origins.length > 0 ||
      selectedFilters.destinations.length > 0 ||
      selectedFilters.modes.length > 0 ||
      selectedFilters.hs.length > 0,
    [selectedFilters],
  );

  const computedTotal = useMemo(() => {
    if (typeof total === "number" && total >= 0) return total;
    return (page - 1) * PAGE_SIZE + results.length;
  }, [total, page, results]);

  const totalPages = computedTotal > 0 ? Math.max(1, Math.ceil(computedTotal / PAGE_SIZE)) : 1;
  const canPrev = page > 1;
  const canNext = hasNextPage;

  const handleQueryChange = useCallback((value: string) => {
    setQueryInput(value);
  }, []);

  const handleClearFilters = useCallback(() => {
    setSelectedFilters(emptyFilters());
    setPage(1);
  }, []);

  const handleToggleFilter = useCallback((facet: keyof SelectedFilters, value: string) => {
    setSelectedFilters((prev) => {
      const normalizedValue = facet === "modes" ? value.toLowerCase() : value;
      const existing = prev[facet];
      const nextValues = existing.includes(normalizedValue)
        ? existing.filter((item) => item !== normalizedValue)
        : [...existing, normalizedValue];
      return { ...prev, [facet]: nextValues };
    });
    setPage(1);
  }, []);

  const handleSearchClick = useCallback(() => {
    const trimmed = queryInput.trim();
    if (!trimmed) return;
    setSearchTerm(trimmed);
    setSearchTrigger(Date.now());
    setPage(1);
  }, [queryInput]);

  const handleTabChange = useCallback(
    (tab: "companies" | "shippers") => {
      if (tab === activeTab) return;
      setActiveTab(tab);
      setPage(1);
      setSearchTrigger(Date.now());
      setError(null);
      setResults([]);
      setTotal(null);
      setHasNextPage(false);
      setActiveCompany(null);
    },
    [activeTab],
  );

  const handlePrev = useCallback(() => {
    if (canPrev) setPage((prev) => Math.max(1, prev - 1));
  }, [canPrev]);

  const handleNext = useCallback(() => {
    if (canNext) setPage((prev) => prev + 1);
  }, [canNext]);

  const handleOpenCompany = useCallback((company: CompanyHit) => {
    setActiveCompany(company);
  }, []);

  const handleModalChange = useCallback((open: boolean) => {
    if (!open) setActiveCompany(null);
  }, []);

  const handleSaveCompany = useCallback(async (company: CompanyHit) => {
    if (!company.company_id) return;
    setSavingId(company.company_id);
    try {
      await saveCompanyToCrm({
        company_id: company.company_id,
        company_name: company.company_name,
        source: "search",
      });
      } catch (err) {
      console.error("saveCompanyToCrm failed", err);
    } finally {
      setSavingId(null);
    }
  }, []);

  const handleDismissFiltersError = useCallback(() => {
    setFiltersErrorDismissed(true);
  }, []);

  const filtersErrorMessage = filtersErrorDismissed ? null : filtersError;

  const showFilters = activeTab === "companies";

  const resultsLabel = useMemo(() => `Showing ${computedTotal.toLocaleString()} results`, [computedTotal]);
  const emptyStateTitle = activeTab === "companies" ? "No companies found" : "No shippers found";
  const emptyStateDescription =
    activeTab === "companies"
      ? "Adjust your filters or broaden the search to uncover more prospects."
      : "Try another keyword to explore ImportYeti shippers.";

  return (
    <>
      <div className="min-h-screen bg-gradient-to-b from-white via-slate-50 to-slate-100">
        <div className="mx-auto w-full max-w-7xl px-4 pt-10 pb-16 sm:px-6 lg:px-8">
          <header className="flex flex-col gap-4">
            <div>
              <h1 className="text-3xl font-semibold text-slate-900">Company Search</h1>
              <p className="mt-1 text-sm text-slate-500">
                Find companies, preview key signals, and save targets to Command Center.
              </p>
            </div>
          </header>

          <div className="mt-6 flex gap-2">
            <button
              type="button"
              onClick={() => handleTabChange("companies")}
              className={`inline-flex items-center rounded-full px-4 py-1.5 text-sm font-medium transition ${
                activeTab === "companies"
                  ? "bg-indigo-600 text-white"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
            >
              Companies
            </button>
            <button
              type="button"
              onClick={() => handleTabChange("shippers")}
              className={`inline-flex items-center rounded-full px-4 py-1.5 text-sm font-medium transition ${
                activeTab === "shippers"
                  ? "bg-indigo-600 text-white"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
            >
              Shippers
            </button>
          </div>

          <div className="mt-8 space-y-6">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-4 md:items-end">
                <div className="md:col-span-2">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <div className="relative flex-1">
                      <Icon.Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        value={queryInput}
                        onChange={(event) => handleQueryChange(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            handleSearchClick();
                          }
                        }}
                        placeholder="Search by company name or domain (e.g., wahoofitness or wahoofitness.com)"
                        className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 pl-9 text-sm text-slate-900 shadow-sm transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={handleSearchClick}
                      disabled={queryInput.trim().length === 0}
                      className="inline-flex items-center justify-center rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Search
                    </button>
                  </div>
                  {error && <p className="text-sm text-rose-600">{error}</p>}
                </div>
                <div className="md:col-span-1">
                  <input
                    value={industry}
                    onChange={(event) => setIndustry(event.target.value)}
                    placeholder="Industry"
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                  />
                </div>
                <div className="md:col-span-1">
                  <input
                    value={hqLocation}
                    onChange={(event) => setHqLocation(event.target.value)}
                    placeholder="HQ Location"
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                  />
                </div>
              </div>

              <SearchFilters
                className="mt-2"
                filters={showFilters ? filterOptions : null}
                selected={selectedFilters}
                onToggle={handleToggleFilter}
                onClearAll={handleClearFilters}
                loading={showFilters && filtersLoading}
                errorMessage={showFilters ? filtersErrorMessage : null}
                onDismissError={handleDismissFiltersError}
                visible={showFilters}
              />

              <main className="space-y-6">
                {!loading && !error && results.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-10 text-center shadow-sm">
                    <h2 className="text-lg font-semibold text-slate-900">{emptyStateTitle}</h2>
                    <p className="mt-2 text-sm text-slate-500">{emptyStateDescription}</p>
                    {showFilters && hasSelectedFilters && (
                      <button
                        type="button"
                        onClick={handleClearFilters}
                        className="mt-4 inline-flex items-center rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 shadow-sm transition hover:bg-slate-50"
                      >
                        Clear filters
                      </button>
                    )}
                  </div>
                ) : (
                  <>
                    <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-500">
                      <span>{resultsLabel}</span>
                      <span className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                        Sort: Relevance
                      </span>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                      {results.map((company) => (
                        <CompanyCard
                          key={`${company.company_id}-${company.company_name}`}
                          row={company}
                          onOpen={activeTab === "companies" ? handleOpenCompany : undefined}
                          onSave={activeTab === "companies" ? handleSaveCompany : undefined}
                          saving={activeTab === "companies" && savingId === company.company_id}
                        />
                      ))}
                    </div>

                    {(totalPages > 1 || page > 1 || hasNextPage) && (
                      <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
                        <button
                          type="button"
                          onClick={handlePrev}
                          disabled={!canPrev || loading}
                          className="rounded-full border border-slate-200 px-3 py-1.5 text-sm text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          Prev
                        </button>
                        <span className="text-sm text-slate-500">
                          Page {page} of {totalPages}
                        </span>
                        <button
                          type="button"
                          onClick={handleNext}
                          disabled={!canNext || loading}
                          className="rounded-full border border-slate-200 px-3 py-1.5 text-sm text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          Next
                        </button>
                      </div>
                    )}
                  </>
                )}

                {loading && (
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {Array.from({ length: 6 }).map((_, index) => (
                      <div
                        key={index}
                        className="h-48 animate-pulse rounded-2xl border border-slate-200 bg-white shadow-sm"
                      />
                    ))}
                  </div>
                )}
              </main>
            </div>
          </div>
        </div>
      </div>

      <CompanyModal company={activeCompany} open={Boolean(activeCompany)} onClose={handleModalChange} />
    </>
  );
}

