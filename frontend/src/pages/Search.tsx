import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import ShipperCard from "@/components/search/ShipperCard";
import ShipperDetailModal from "@/components/search/ShipperDetailModal";
import SearchFilters, { type SearchFiltersValue } from "@/components/search/SearchFilters";
import {
  searchIyShippers,
  saveCompanyToCrm,
  getIyRouteKpisForCompany,
  type IyShipperSearchMeta,
  type IyShipperSearchRow,
  type IyRouteKpis,
} from "@/lib/api";

const RESULTS_PER_PAGE = 25;

type FiltersState = SearchFiltersValue;

export default function SearchPage() {
  const [shipperQuery, setShipperQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [shipperPage, setShipperPage] = useState(1);
  const [iyResults, setIyResults] = useState<IyShipperSearchRow[]>([]);
  const [iyMeta, setIyMeta] = useState<IyShipperSearchMeta | null>(null);
  const [iyTotal, setIyTotal] = useState(0);
  const [iyLoading, setIyLoading] = useState(false);
  const [iyError, setIyError] = useState<string | null>(null);
  const [activeShipper, setActiveShipper] = useState<IyShipperSearchRow | null>(null);
  const [routeKpis, setRouteKpis] = useState<IyRouteKpis | null>(null);
  const [modalLoading, setModalLoading] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [saveLoading, setSaveLoading] = useState(false);
  const [filters, setFilters] = useState<FiltersState>({
    mode: "any",
    region: "global",
    activity: "12m",
  });

  const handleSubmit = useCallback(
    (event?: FormEvent<HTMLFormElement>) => {
      event?.preventDefault();
      const trimmed = shipperQuery.trim();
      setSubmittedQuery(trimmed);
      setShipperPage(1);
    },
    [shipperQuery],
  );

  useEffect(() => {
    if (!submittedQuery) {
      setIyResults([]);
      setIyMeta(null);
      setIyTotal(0);
      setIyError(null);
      setIyLoading(false);
      return;
    }

    const controller = new AbortController();
    setIyLoading(true);
    setIyError(null);

    searchIyShippers(
      { q: submittedQuery, page: shipperPage, pageSize: RESULTS_PER_PAGE },
      controller.signal,
    )
      .then((res) => {
        if (controller.signal.aborted) return;
        setIyResults(Array.isArray(res.rows) ? res.rows : []);
        setIyMeta(res.meta ?? null);
        setIyTotal(typeof res.total === "number" ? res.total : res.rows.length);
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setIyResults([]);
        setIyMeta(null);
        setIyTotal(0);
        setIyError(err?.message ?? "ImportYeti search failed. Please try again.");
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIyLoading(false);
        }
      });

    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submittedQuery, shipperPage]);

    const handleViewDetails = useCallback(async (shipper: IyShipperSearchRow) => {
      if (!shipper) return;
      setActiveShipper(shipper);
      setModalLoading(true);
      setModalError(null);
      try {
        const companyKey = shipper.companyId;
        const kpis = companyKey
          ? await getIyRouteKpisForCompany({ companyKey })
          : null;
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

    const handleSaveToCommandCenter = useCallback(async (shipper: IyShipperSearchRow) => {
      if (!shipper?.companyId) return;
      setSaveLoading(true);
      try {
        await saveCompanyToCrm({
          company_id: shipper.companyId,
          company_name: shipper.name,
          source: "importyeti",
        });
      } catch (err) {
        console.error("saveCompanyToCrm failed", err);
      } finally {
        setSaveLoading(false);
      }
    }, []);

    const resultSummary = useMemo(() => {
      if (!submittedQuery || !iyMeta) return null;
      const totalLabel = iyTotal ? iyTotal.toLocaleString() : "0";
      return `Showing ${iyResults.length} of ${totalLabel} results for "${iyMeta.q}"`;
    }, [submittedQuery, iyMeta, iyResults, iyTotal]);

    const showIntroState = !submittedQuery;
    const showNoResults = Boolean(submittedQuery && !iyLoading && iyResults.length === 0);
    const totalPages = iyTotal ? Math.ceil(iyTotal / RESULTS_PER_PAGE) : 0;
    const hasPrevPage = shipperPage > 1;
    const hasNextPage = iyTotal ? shipperPage * RESULTS_PER_PAGE < iyTotal : false;

  return (
    <>
      <div className="min-h-screen bg-slate-50">
        <div className="mx-auto max-w-6xl px-4 py-6 md:px-8 md:py-8">
          <header className="flex flex-col gap-4">
            <div>
              <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
                ImportYeti Shipper Search
              </h1>
              <p className="mt-2 text-sm text-slate-500 max-w-2xl">
                Search the ImportYeti DMA index for verified shippers, view live BOL activity, and
                save companies to Command Center.
              </p>
            </div>
          </header>

          <section className="mt-8 space-y-4">
            <form onSubmit={handleSubmit} className="space-y-3">
                <div className="flex flex-col gap-3 sm:flex-row">
                  <input
                    value={shipperQuery}
                    onChange={(event) => setShipperQuery(event.target.value)}
                    placeholder="Search by company, retailer, or brand (e.g., Walmart, Nike, Target)"
                    className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 shadow-sm transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                  />
                  <button
                    type="submit"
                    disabled={iyLoading || !shipperQuery.trim()}
                    className="h-11 rounded-xl bg-indigo-600 px-6 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {iyLoading ? "Searching…" : "Search"}
                  </button>
                </div>
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

              {iyError && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  {iyError}
                </div>
              )}

              {resultSummary && (
                <div className="inline-flex flex-wrap items-center gap-3 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs text-slate-600">
                  <span>{resultSummary}</span>
                  {typeof iyMeta?.creditsRemaining === "number" && (
                    <span className="text-slate-400">
                      Credits remaining: {iyMeta.creditsRemaining}
                    </span>
                  )}
                </div>
              )}
            </section>

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
                <p className="mt-2 text-sm text-slate-500">
                  Try another query or broaden your search.
                </p>
              </div>
            ) : (
                <div className="space-y-6">
                  {iyLoading && iyResults.length === 0 ? (
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
                      {iyResults.map((shipper) => (
                        <ShipperCard
                          key={shipper.companyId}
                          shipper={shipper}
                          onViewDetails={() => handleViewDetails(shipper)}
                          onSave={() => handleSaveToCommandCenter(shipper)}
                        />
                      ))}
                    </div>
                  )}

                  {iyTotal > RESULTS_PER_PAGE && (
                    <div className="flex items-center justify_between rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs text-slate-500 shadow-sm">
                      <button
                        type="button"
                        className="rounded-full border border-slate-200 px-3 py-1.5 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                        disabled={!hasPrevPage || iyLoading}
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
                        disabled={!hasNextPage || iyLoading}
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
        topRoute={(routeKpis as any)?.topRouteLast12m ?? null}
        recentRoute={(routeKpis as any)?.mostRecentRoute ?? null}
        onSave={handleSaveToCommandCenter}
        saving={saveLoading}
      />
    </>
  );
}
