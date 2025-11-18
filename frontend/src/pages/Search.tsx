import { useCallback, useEffect, useMemo, useState } from "react";
import SearchFilters from "@/components/search/SearchFilters";
import CompanyCard from "@/components/search/CompanyCard";
import CompanyModal from "@/components/search/CompanyModal";
import ShipperCard from "@/components/search/ShipperCard";
import ShipperDetailModal from "@/components/search/ShipperDetailModal";
import {
  getFilterOptions,
  searchCompanies,
  searchShippers,
  saveCompanyToCrm,
  getIyRouteKpisForCompany,
  type CompanyHit,
  type FilterOptions,
  type IySearchMeta,
  type IyShipperHit,
  type IyRouteKpis,
} from "@/lib/api";

const PAGE_SIZE = 25;

type TabKey = "company" | "shipper";

type FiltersState = {
  origin: string[];
  dest: string[];
  mode: string[];
  hs: string[];
};

const emptyFilters: FiltersState = { origin: [], dest: [], mode: [], hs: [] };

const iyEnabled = import.meta.env.VITE_IY_ENABLED === "1";

export default function SearchPage() {
  const [activeTab, setActiveTab] = useState<TabKey>("company");
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [filters, setFilters] = useState<FiltersState>(emptyFilters);
  const [page, setPage] = useState(0);

  const [filterOptions, setFilterOptions] = useState<FilterOptions | null>(null);
  const [filterError, setFilterError] = useState<string | null>(null);

  const [rows, setRows] = useState<CompanyHit[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [shipperQuery, setShipperQuery] = useState("");
  const [shipperPage, setShipperPage] = useState(1);
  const [shipperPageSize] = useState(25);
  const [shipperLoading, setShipperLoading] = useState(false);
  const [shipperError, setShipperError] = useState<string | null>(null);
  const [shipperResults, setShipperResults] = useState<IyShipperHit[]>([]);
  const [shipperMeta, setShipperMeta] = useState<IySearchMeta | null>(null);

  const [activeCompany, setActiveCompany] = useState<CompanyHit | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [activeShipper, setActiveShipper] = useState<IyShipperHit | null>(null);
  const [shipperModalOpen, setShipperModalOpen] = useState(false);
  const [shipperRouteKpis, setShipperRouteKpis] = useState<IyRouteKpis | null>(null);
  const [shipperSavingKey, setShipperSavingKey] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const options = await getFilterOptions();
        if (!cancelled) {
          setFilterOptions(options);
          setFilterError(null);
        }
      } catch (err) {
        if (!cancelled) {
          console.error("filter load error", err);
          setFilterError("Filters temporarily unavailable.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      setDebouncedQ(q.trim());
    }, 300);
    return () => window.clearTimeout(handle);
  }, [q]);

  useEffect(() => {
    setPage(0);
  }, [debouncedQ, filters.origin, filters.dest, filters.mode, filters.hs]);

  useEffect(() => {
    if (activeTab !== "company") {
      setRows([]);
      setTotal(0);
      setLoading(false);
      setError(null);
      return;
    }

    const query = debouncedQ;
    if (!query) {
      setRows([]);
      setTotal(0);
      setError(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    searchCompanies(
      {
        q: query,
        origin: filters.origin,
        dest: filters.dest,
        mode: filters.mode,
        hs: filters.hs,
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      },
    )
      .then((res) => {
        if (cancelled) return;
        setRows(res.rows);
        setTotal(res.total);
        setError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("search error", err);
        setRows([]);
        setTotal(0);
        setError("Search failed. Please try again.");
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeTab, debouncedQ, filters.origin, filters.dest, filters.mode, filters.hs, page]);

  useEffect(() => {
    if (!iyEnabled) {
      setShipperLoading(false);
      setShipperError(null);
      setShipperResults([]);
      setShipperMeta(null);
      return;
    }
    if (activeTab !== "shipper") {
      return;
    }
    const trimmed = shipperQuery.trim();
    if (!trimmed) {
      setShipperLoading(false);
      setShipperResults([]);
      setShipperMeta(null);
      setShipperError(null);
      return;
    }

    let cancelled = false;
    setShipperLoading(true);
    setShipperError(null);

    searchShippers({ q: trimmed, page: shipperPage, pageSize: shipperPageSize })
      .then((res) => {
        if (cancelled) return;
        setShipperError(null);
        setShipperResults(Array.isArray(res.results) ? res.results : []);
        setShipperMeta(res.meta ?? null);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("shipper search error", err);
        setShipperResults([]);
        setShipperMeta(null);
        setShipperError(err?.message ?? "ImportYeti search failed.");
      })
      .finally(() => {
        if (!cancelled) {
          setShipperLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeTab, shipperQuery, shipperPage, shipperPageSize, iyEnabled]);

  const resultsLabel = useMemo(() => {
    if (!debouncedQ) return "Showing 0 results";
    const count = total > 0 ? total : rows.length;
    return `Showing ${count.toLocaleString()} results`;
  }, [debouncedQ, total, rows.length]);

  const totalPages = total > 0 ? Math.ceil(total / PAGE_SIZE) : null;
  const hasPrev = page > 0;
  const hasNext = total > 0 ? (page + 1) * PAGE_SIZE < total : rows.length === PAGE_SIZE;

  const showEmptyState = activeTab === "company" && !loading && !!debouncedQ && rows.length === 0 && !error;
  const showIntro = activeTab === "company" && !loading && !debouncedQ;

  const handleTabChange = useCallback(
    (tab: TabKey) => {
      if (tab === activeTab) return;
      setActiveTab(tab);
      setPage(0);
      setError(null);
      if (tab === "shipper") {
        setRows([]);
        setTotal(0);
        setShipperPage(1);
        setShipperError(null);
      }
    },
    [activeTab],
  );

  const handleFiltersChange = useCallback((next: FiltersState) => {
    setFilters(next);
  }, []);

  const handleViewDetails = useCallback((company: CompanyHit) => {
    setActiveCompany(company);
  }, []);

  const handleModalChange = useCallback((open: boolean) => {
    if (!open) {
      setActiveCompany(null);
    }
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

  const handleSelectShipper = useCallback((shipper: IyShipperHit) => {
    if (!shipper) return;
    setActiveShipper(shipper);
    setShipperModalOpen(true);
    setShipperRouteKpis(null);
    if (!shipper.key) return;
    getIyRouteKpisForCompany({ companyKey: shipper.key })
      .then((kpis) => setShipperRouteKpis(kpis))
      .catch(() => setShipperRouteKpis(null));
  }, []);

  const handleShipperModalClose = useCallback(() => {
    setShipperModalOpen(false);
    setActiveShipper(null);
    setShipperRouteKpis(null);
  }, []);

  const handleSaveShipper = useCallback(async (shipper: IyShipperHit) => {
    if (!shipper?.key) return;
    setShipperSavingKey(shipper.key);
    try {
      await saveCompanyToCrm({
        company_id: shipper.key,
        company_name: shipper.title,
        source: "importyeti",
      });
    } catch (err) {
      console.error("save importyeti shipper failed", err);
    } finally {
      setShipperSavingKey(null);
    }
  }, []);

  const filtersActive =
    filters.origin.length + filters.dest.length + filters.mode.length + filters.hs.length > 0;

  return (
    <>
      <div className="min-h-screen bg-gradient-to-b from-white via-slate-50 to-slate-100">
        <div className="mx-auto w-full max-w-7xl px-4 pt-10 pb-16 sm:px-6 lg:px-8">
          <header className="flex flex-col gap-4">
            <div>
              <h1 className="text-3xl font-semibold text-slate-900">Search</h1>
              <p className="mt-1 text-sm text-slate-500">
                Explore prospect companies, review shipment activity, and push targets to Command Center.
              </p>
            </div>
          </header>

          <div className="mt-6 flex gap-2">
            <button
              type="button"
              onClick={() => handleTabChange("company")}
              className={`inline-flex items-center rounded-full px-4 py-1.5 text-sm font-medium transition ${
                activeTab === "company"
                  ? "bg-indigo-600 text-white"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
            >
              Companies
            </button>
            <button
              type="button"
              onClick={() => handleTabChange("shipper")}
              className={`inline-flex items-center rounded-full px-4 py-1.5 text-sm font-medium transition ${
                activeTab === "shipper"
                  ? "bg-indigo-600 text-white"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              } ${!iyEnabled ? "cursor-not-allowed opacity-70" : ""}`}
              aria-disabled={!iyEnabled}
              title={!iyEnabled ? "Temporarily gated" : undefined}
            >
              Shippers (DMA)
            </button>
          </div>

          <div className="mt-8">
          {activeTab === "company" ? (
            <div className="space-y-6">
              <div className="space-y-2">
                <input
                  value={q}
                  onChange={(event) => setQ(event.target.value)}
                  placeholder="Search companies by name or domain"
                  className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 shadow-sm transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                />
                {error && <p className="text-sm text-rose-600">{error}</p>}
              </div>

              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-500">
                  <span>{resultsLabel}</span>
                  <span className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                    Sort: Relevance
                  </span>
                </div>
                {filterError && (
                  <div className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[11px] font-medium text-amber-700">
                    {filterError}
                  </div>
                )}
                <SearchFilters
                  filterOptions={filterOptions}
                  origin={filters.origin}
                  dest={filters.dest}
                  mode={filters.mode}
                  hs={filters.hs}
                  onChange={handleFiltersChange}
                />
                {filtersActive && (
                  <p className="text-xs text-slate-500">
                    Filters narrow results to the most relevant companies.
                  </p>
                )}
              </div>

              <main className="space-y-6">
                {showIntro && (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-10 text-center shadow-sm">
                    <h2 className="text-lg font-semibold text-slate-900">Start searching</h2>
                    <p className="mt-2 text-sm text-slate-500">Enter a company name to load results.</p>
                  </div>
                )}

                {showEmptyState && (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-10 text-center shadow-sm">
                    <h2 className="text-lg font-semibold text-slate-900">No companies found</h2>
                    <p className="mt-2 text-sm text-slate-500">Try a different query or adjust your filters.</p>
                  </div>
                )}

                {rows.length > 0 && (
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {rows.map((company) => (
                      <CompanyCard
                        key={company.company_id}
                        data={company}
                        onViewDetails={handleViewDetails}
                        onSave={handleSaveCompany}
                        saving={savingId === company.company_id}
                      />
                    ))}
                  </div>
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

                {rows.length > 0 && (
                  <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
                    <button
                      type="button"
                      onClick={() => setPage((current) => Math.max(0, current - 1))}
                      disabled={!hasPrev || loading}
                      className="rounded-full border border-slate-200 px-3 py-1.5 text-sm text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Prev
                    </button>
                    <span className="text-sm text-slate-500">
                      Page {page + 1}
                      {totalPages ? ` of ${totalPages}` : ""}
                    </span>
                    <button
                      type="button"
                      onClick={() => setPage((current) => current + 1)}
                      disabled={!hasNext || loading}
                      className="rounded-full border border-slate-200 px-3 py-1.5 text-sm text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Next
                    </button>
                  </div>
                )}
              </main>
            </div>
          ) : (
            <div className="space-y-6">
              {!iyEnabled ? (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-10 text-center shadow-sm">
                  <h2 className="text-lg font-semibold text-slate-900">ImportYeti DMA access coming soon</h2>
                  <p className="mt-2 text-sm text-slate-500">
                    We’ll enable shipper search once ImportYeti DMA is live. Hang tight!
                  </p>
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="max-w-xl">
                    <input
                      value={shipperQuery}
                      onChange={(event) => {
                        setShipperQuery(event.target.value);
                        setShipperPage(1);
                      }}
                      placeholder="Search shippers by company name (e.g., Walmart)"
                      className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 shadow-sm transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                    />
                  </div>

                    {shipperError && <p className="text-xs text-rose-600">{shipperError}</p>}

                    {shipperMeta && (
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                        <span>
                          Showing <span className="font-medium">{shipperResults.length}</span> of{" "}
                          <span className="font-medium">{shipperMeta.total}</span> results for{" "}
                          <span className="font-semibold">"{shipperMeta.q}"</span>
                        </span>
                        {typeof shipperMeta.creditsRemaining === "number" && (
                          <span>Credits remaining: {shipperMeta.creditsRemaining}</span>
                        )}
                      </div>
                    )}

                    {shipperLoading ? (
                      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                        {Array.from({ length: 6 }).map((_, index) => (
                          <div
                            key={index}
                            className="h-48 animate-pulse rounded-2xl border border-slate-200 bg-white shadow-sm"
                          />
                        ))}
                      </div>
                    ) : shipperResults.length === 0 && shipperMeta?.q ? (
                      <p className="text-sm text-slate-500">No shippers found for "{shipperMeta.q}".</p>
                    ) : (
                      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                        {shipperResults.map((row) => (
                          <ShipperCard key={row.key || row.title} data={row} onSelect={handleSelectShipper} />
                        ))}
                      </div>
                    )}

                  {shipperMeta && shipperMeta.total > shipperPageSize && (
                    <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs text-slate-500 shadow-sm">
                      <button
                        type="button"
                        className="rounded-full border border-slate-200 px-3 py-1.5 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                        disabled={shipperPage === 1 || shipperLoading}
                        onClick={() => setShipperPage((prev) => Math.max(1, prev - 1))}
                      >
                        Prev
                      </button>
                      <span>Page {shipperPage}</span>
                      <button
                        type="button"
                        className="rounded-full border border-slate-200 px-3 py-1.5 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                        disabled={
                          shipperLoading || (shipperMeta.total ?? 0) <= shipperPage * shipperPageSize
                        }
                        onClick={() => setShipperPage((prev) => prev + 1)}
                      >
                        Next
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <CompanyModal company={activeCompany} open={Boolean(activeCompany)} onClose={handleModalChange} />
      <ShipperDetailModal
        shipper={activeShipper}
        open={shipperModalOpen && Boolean(activeShipper)}
        onClose={handleShipperModalClose}
        topRoute={shipperRouteKpis?.topRouteLast12m}
        recentRoute={shipperRouteKpis?.mostRecentRoute}
        onSave={handleSaveShipper}
        saving={Boolean(activeShipper?.key && shipperSavingKey === activeShipper.key)}
      />
    </>
  );
}

