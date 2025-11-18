import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import ShipperCard from "@/components/search/ShipperCard";
import ShipperDetailModal from "@/components/search/ShipperDetailModal";
import {
  searchShippers,
  saveCompanyToCrm,
  getIyRouteKpisForCompany,
  type IySearchMeta,
  type IyShipperHit,
  type IyRouteKpis,
} from "@/lib/api";

const RESULTS_PER_PAGE = 25;

export default function SearchPage() {
  const [shipperQuery, setShipperQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [shipperPage, setShipperPage] = useState(1);
  const [shipperResults, setShipperResults] = useState<IyShipperHit[]>([]);
  const [shipperMeta, setShipperMeta] = useState<IySearchMeta | null>(null);
  const [shipperLoading, setShipperLoading] = useState(false);
  const [shipperError, setShipperError] = useState<string | null>(null);
  const [activeShipper, setActiveShipper] = useState<IyShipperHit | null>(null);
  const [shipperModalOpen, setShipperModalOpen] = useState(false);
  const [shipperRouteKpis, setShipperRouteKpis] = useState<IyRouteKpis | null>(null);
  const [shipperSavingKey, setShipperSavingKey] = useState<string | null>(null);

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
      setShipperResults([]);
      setShipperMeta(null);
      setShipperError(null);
      setShipperLoading(false);
      return;
    }

    const controller = new AbortController();
    setShipperLoading(true);
    setShipperError(null);

    searchShippers(
      { q: submittedQuery, page: shipperPage, pageSize: RESULTS_PER_PAGE },
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

  const resultSummary = useMemo(() => {
    if (!submittedQuery || !shipperMeta) return null;
    const totalLabel = shipperMeta.total?.toLocaleString() ?? "0";
    return `Showing ${shipperResults.length} of ${totalLabel} results for "${shipperMeta.q}"`;
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
                  disabled={shipperLoading || !shipperQuery.trim()}
                  className="h-11 rounded-xl bg-indigo-600 px-6 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {shipperLoading ? "Searching…" : "Search"}
                </button>
              </div>
              <p className="text-xs text-slate-500">All searches route through /api/lit/public/iy/searchShippers.</p>
            </form>

            {shipperError && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {shipperError}
              </div>
            )}

            {resultSummary && (
              <div className="inline-flex flex-wrap items-center gap-3 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs text-slate-600">
                <span>{resultSummary}</span>
                {typeof shipperMeta?.creditsRemaining === "number" && (
                  <span className="text-slate-400">Credits remaining: {shipperMeta.creditsRemaining}</span>
                )}
              </div>
            )}
          </section>

          <section className="mt-8 space-y-6">
            {showIntroState ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-10 text-center shadow-sm">
                <h2 className="text-lg font-semibold text-slate-900">Start with a shipper</h2>
                <p className="mt-2 text-sm text-slate-500">Search for a retailer, importer, or brand to pull live ImportYeti DMA data.</p>
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
                    {shipperResults.map((shipper) => (
                      <ShipperCard key={shipper.key || shipper.title} data={shipper} onSelect={handleSelectShipper} />
                    ))}
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
