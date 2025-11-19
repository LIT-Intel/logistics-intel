// frontend/src/pages/Search.tsx

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import ShipperCard from "@/components/search/ShipperCard";
import ShipperDetailModal from "@/components/search/ShipperDetailModal";
import SearchFilters, { type SearchFiltersValue } from "@/components/search/SearchFilters";
import {
  searchShippers,
  saveCompanyToCrm,
  getIyRouteKpisForCompany,
  type IySearchMeta,
  type IyShipperHit,
  type IyRouteKpis,
} from "@/lib/api";

const RESULTS_PER_PAGE = 25;

type RouteSummary = {
  topRoute?: string | null;
  teus12m?: number | null;
  shipments12m?: number | null;
};

export default function SearchPage() {
  const [shipperQuery, setShipperQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [shipperPage, setShipperPage] = useState(1);
  const [shipperResults, setShipperResults] = useState<IyShipperHit[]>([]);
  const [shipperMeta, setShipperMeta] = useState<IySearchMeta | null>(null);
  const [shipperLoading, setShipperLoading] = useState(false);
  const [shipperError, setShipperError] = useState<string | null>(null);

  const [activeShipper, setActiveShipper] = useState<IyShipperHit | null>(null);
  const [routeKpis, setRouteKpis] = useState<IyRouteKpis | null>(null);
  const [modalLoading, setModalLoading] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [saveLoading, setSaveLoading] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [modeFilter, setModeFilter] = useState<"any" | "fcl" | "lcl">("any");
  const [regionFilter, setRegionFilter] = useState<"global" | "us-importers">("global");
  const [activityFilter, setActivityFilter] = useState<"12m" | "6m" | "3m">("12m");

  const handleSubmit = useCallback(
    (event?: FormEvent<HTMLFormElement>) => {
      event?.preventDefault();
      const trimmed = shipperQuery.trim();
      if (!trimmed) return;
      setSubmittedQuery(trimmed);
      setShipperPage(1);
    },
    [shipperQuery],
  );

  // Run ImportYeti search
  useEffect(() => {
    if (!submittedQuery) {
      setShipperResults([]);
      setShipperMeta(null);
      setShipperError(null);
      setShipperLoading(false);
      return;
    }

    const controller = new AbortController();
    setShipperLoading(true);
    setShipperError(null);

    // Filters currently UI-only; backend ImportYeti proxy supports only q/page/pageSize.
    searchShippers(
      {
        q: submittedQuery,
        page: shipperPage,
        pageSize: RESULTS_PER_PAGE,
      },
      controller.signal,
    )
      .then((res) => {
        if (controller.signal.aborted) return;
        setShipperResults(Array.isArray(res.results) ? res.results : []);
        setShipperMeta(res.meta ?? null);
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setShipperResults([]);
        setShipperMeta(null);
        setShipperError(err?.message ?? "ImportYeti search failed. Please try again.");
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setShipperLoading(false);
        }
      });

    return () => controller.abort();
  }, [submittedQuery, shipperPage]);

  // Fetch lightweight route/TEU stats for *visible* shippers (used on cards)
  useEffect(() => {
    if (!shipperResults.length) {
      setRouteStatsByKey({});
      return;
    }

    let cancelled = false;

    (async () => {
      const nextStats: Record<string, RouteSummary> = {};

      await Promise.all(
        shipperResults
          .filter((s) => !!s.key)
          .map(async (shipper) => {
            const key = shipper.key as string;
            try {
              const kpis = await getIyRouteKpisForCompany({ companyKey: key });
              if (!kpis) return;
              nextStats[key] = {
                topRoute: kpis.topRouteLast12m ?? null,
                teus12m: (kpis as any).totalTeus12m ?? null, // adjust if your type exposes a different field
                shipments12m: (kpis as any).shipments12m ?? null,
              };
            } catch {
              // If stats fail for a company, we just leave its entry undefined
            }
          }),
      );

      if (!cancelled) {
        setRouteStatsByKey(nextStats);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [shipperResults]);

  const handleViewDetails = useCallback(async (shipper: IyShipperHit) => {
    if (!shipper) return;
    setActiveShipper(shipper);
    setModalLoading(true);
    setModalError(null);

    try {
      const kpis = await getIyRouteKpisForCompany({ companyKey: shipper.key as string });
      setRouteKpis(kpis ?? null);
    } catch (err) {
      console.warn("getIyRouteKpisForCompany failed", err);
      setRouteKpis(null);
      setModalError("Route KPIs unavailable for this shipper.");
    } finally {
      setModalLoading(false);
    }
  }, []);

  const handleCloseModal = useCallback(() => {
    setActiveShipper(null);
    setRouteKpis(null);
    setModalError(null);
    setModalLoading(false);
  }, []);

  const handleSaveToCommandCenter = useCallback(
    async (shipper: IyShipperHit) => {
      if (!shipper?.key) return;

      setSaveLoadingKey(shipper.key);
      try {
        await saveCompanyToCrm({
          company_id: shipper.key,
          company_name: shipper.title,
          source: "importyeti",
        });

        setSavedKeys((prev) => ({
          ...prev,
          [shipper.key as string]: true,
        }));
      } catch (err) {
        console.error("saveCompanyToCrm failed", err);
      } finally {
        setSaveLoadingKey(null);
      }
    },
    [],
  );

  const resultSummary = useMemo(() => {
    if (!submittedQuery || !shipperMeta) return null;
    const countLabel = shipperMeta.total?.toLocaleString() ?? "0";
    return `Showing ${shipperResults.length} of ${countLabel} results for "${shipperMeta.q}"`;
  }, [submittedQuery, shipperMeta, shipperResults.length]);

  const showIntroState = !submittedQuery;
  const showNoResults = Boolean(submittedQuery && !shipperLoading && shipperResults.length === 0);

  const totalPages = shipperMeta?.total ? Math.ceil(shipperMeta.total / RESULTS_PER_PAGE) : 0;
  const hasPrevPage = shipperPage > 1;
  const hasNextPage = shipperMeta ? shipperPage * RESULTS_PER_PAGE < shipperMeta.total : false;

  return (
    <>
      <div className="min-h-screen bg-gradient-to-b from-white via-slate-50 to-slate-100">
        <div className="mx-auto w-full max-w-5xl px-4 pt-10 pb-16 sm:px-6 lg:px-8">
          <header className="flex flex-col gap-4">
            <div>
              <h1 className="text-3xl font-semibold text-slate-900">ImportYeti Shipper Search</h1>
              <p className="mt-1 text-sm text-slate-500">
                Search the ImportYeti DMA index for verified shippers, view live BOL activity, and save
                companies to Command Center.
              </p>
            </div>
          </header>

          {/* Search bar */}
          <section className="mt-8 space-y-4">
            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="flex flex-col gap-3 sm:flex-row">
                <input
                  value={shipperQuery}
                  onChange={(event) => setShipperQuery(event.target.value)}
                  placeholder="Search by company, retailer, or brand (e.g., Walmart, Target, Nike)"
                  className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 shadow-sm transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                />
                <button
                  type="submit"
                  disabled={shipperLoading || !shipperQuery.trim()}
                  className="h-11 rounded-xl bg-indigo-600 px-6 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {shipperLoading ? "Searching…" : "Search"}
                </button>
              </div>
              <p className="text-xs text-slate-500">All searches route through /api/lit/public/iy/searchShippers.</p>
            </form>

            <div className="flex flex-col gap-3">
              <p className="text-xs text-slate-500">
                All searches route through{" "}
                <code className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px]">
                  /api/lit/public/iy/searchShippers
                </code>
                .
              </p>

              <SearchFilters value={filters} onChange={setFilters} />
            </div>

            {shipperError && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {shipperError}
              </div>
            )}

            {resultSummary && (
              <div className="inline-flex flex-wrap items-center gap-3 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs text-slate-600">
                <span>{resultSummary}</span>
                {typeof shipperMeta?.creditsRemaining === "number" && (
                  <span className="text-slate-400">
                    Credits remaining: {shipperMeta.creditsRemaining}
                  </span>
                )}
              </div>
            )}
          </section>

          {/* Results */}
          <section className="mt-8 space-y-6">
            {showIntroState ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-10 text-center shadow-sm">
                <h2 className="text-lg font-semibold text-slate-900">Start with a shipper</h2>
                <p className="mt-2 text-sm text-slate-500">
                  Search for a retailer, importer, or brand to pull live ImportYeti DMA data.
                </p>
              </div>
            ) : showNoResults ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-10 text-center shadow-sm">
                <h2 className="text-lg font-semibold text-slate-900">No shippers found</h2>
                <p className="mt-2 text-sm text-slate-500">Try another query or broaden your search.</p>
              </div>
            ) : (
              <div className="space-y-6">
                {shipperLoading && shipperResults.length === 0 ? (
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {Array.from({ length: 6 }).map((_, index) => (
                      <div
                        key={`skeleton-${index}`}
                        className="h-48 animate-pulse rounded-2xl border border-slate-200 bg-white shadow-sm"
                      />
                    ))}
                  </div>
                ) : (
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {shipperResults.map((shipper) => {
                      const key = shipper.key as string;
                      const stats = routeStatsByKey[key] || {};

                      return (
                        <ShipperCard
                          key={key || shipper.title}
                          shipper={shipper}
                          topRoute={stats.topRoute ?? null}
                          teus12m={stats.teus12m ?? null}
                          shipments12m={stats.shipments12m ?? null}
                          onViewDetails={() => handleViewDetails(shipper)}
                          onSave={() => handleSaveToCommandCenter(shipper)}
                          isSaving={saveLoadingKey === key}
                          isSaved={Boolean(savedKeys[key])}
                        />
                      );
                    })}
                  </div>
                )}

                {shipperMeta && shipperMeta.total > RESULTS_PER_PAGE && (
                  <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs text-slate-500 shadow-sm">
                    <button
                      type="button"
                      className="rounded-full border border-slate-200 px-3 py-1.5 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                      disabled={!hasPrevPage || shipperLoading}
                      onClick={() => setShipperPage((prev) => Math.max(1, prev - 1))}
                    >
                      Prev
                    </button>
                    <span>
                      Page {shipperPage}
                      {totalPages > 0 ? ` of ${totalPages}` : ""}
                    </span>
                    <button
                      type="button"
                      className="rounded-full border border-slate-200 px-3 py-1.5 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                      disabled={!hasNextPage || shipperLoading}
                      onClick={() => setShipperPage((prev) => prev + 1)}
                    >
                      Next
                    </button>
                  </div>
                )}
              </div>
            )}
          </section>
        </div>
      </div>

        {modalLoading && activeShipper && (
          <div className="pointer-events-none fixed inset-x-0 top-6 z-40 flex justify-center">
            <div className="rounded-full bg-white/90 px-4 py-2 text-xs font-medium text-slate-600 shadow">
              Loading route insights…
            </div>
          </div>
        )}

      {modalError && activeShipper && (
        <div className="pointer-events-none fixed inset-x-0 top-16 z-40 flex justify-center">
          <div className="rounded-full border border-rose-200 bg-rose-50 px-4 py-2 text-xs font-medium text-rose-700 shadow">
            {modalError}
          </div>
        </div>
      )}

        <ShipperDetailModal
          shipper={activeShipper}
          open={Boolean(activeShipper)}
          onClose={handleCloseModal}
          topRoute={routeKpis?.topRouteLast12m ?? null}
          recentRoute={routeKpis?.mostRecentRoute ?? null}
          onSave={handleSaveToCommandCenter}
          saving={saveLoading}
        />
    </>
  );
}
