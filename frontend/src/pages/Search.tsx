/**
 * ============================================================================
 * SEARCH EXPERIENCE CONTRACT
 * ----------------------------------------------------------------------------
 * This page drives production prospecting search.  Any changes must keep:
 *   • Shippers/Companies toggle semantics (Shippers → ImportYeti proxy).
 *   • URL query sync (q, mode, page) for shareability without causing rerenders.
 *   • Explicit fetch triggers (no auto-search per keystroke) with AbortController.
 *   • ImportYeti cards in the legacy layout shown to execs.
 *   • Companies (Lusha) toggle acting as a placeholder until that API is ready.
 * If you need to refactor, run manual smoke tests for both toggles and
 *   import the core helpers from '@/lib/api'.  Do NOT remove this guard.
 * ============================================================================
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import CompanyDrawer from "@/components/company/CompanyDrawer";
import {
  iySearchShippers,
  ImportYetiShipperRow,
} from "@/lib/api";

const PAGE_SIZE = 20;
const COMPANIES_PLACEHOLDER = "Companies (Lusha) search is coming soon. Toggle back to Shippers (ImportYeti) while we finish that integration.";

type Mode = "shippers" | "companies";
type RowSource = "importyeti" | "local";

type UnifiedRow = {
  company_id: string;
  company_name: string;
  shipments_12m: number | null;
  last_activity: string | null;
  top_routes?: Array<{ route?: string; origin_country?: string; dest_country?: string }>;
  top_carriers?: Array<{ carrier?: string }>;
  kpis: { shipments_12m: number; last_activity: string | null };
  _source: RowSource;
  _iy?: ImportYetiShipperRow["_iy"];
};

export default function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  const initialMode: Mode = searchParams.get("mode") === "companies" ? "companies" : "shippers";
  const initialQuery = searchParams.get("q") ?? "";
  const initialPage = Math.max(1, Number.parseInt(searchParams.get("page") ?? "1", 10) || 1);

  const [mode, setMode] = useState<Mode>(initialMode);
  const [inputValue, setInputValue] = useState<string>(initialQuery);
  const [committedQuery, setCommittedQuery] = useState<string>(initialQuery.trim());
  const [page, setPage] = useState<number>(initialPage);
  const [totalPages, setTotalPages] = useState<number>(1);

  const [rows, setRows] = useState<UnifiedRow[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(initialMode === "companies" ? COMPANIES_PLACEHOLDER : null);

  const abortRef = useRef<AbortController | null>(null);
  const lastParamsRef = useRef<string>(searchParams.toString());

  const syncSearchParams = useCallback(
    (keyword: string, currentMode: Mode, currentPage: number) => {
      const params = new URLSearchParams();
      if (keyword.trim()) params.set("q", keyword.trim());
      if (currentMode === "companies") params.set("mode", "companies");
      if (currentPage > 1) params.set("page", String(currentPage));
      const next = params.toString();
      if (lastParamsRef.current === next) return;
      lastParamsRef.current = next;
      if (next) {
        setSearchParams(params, { replace: true });
      } else {
        setSearchParams({}, { replace: true });
      }
    },
    [setSearchParams]
  );

  const runSearch = useCallback(
    async (term: string, targetPage = 1, options?: { modeOverride?: Mode; skipSync?: boolean }) => {
      const activeMode = options?.modeOverride ?? mode;
      const trimmed = term.trim();

      if (abortRef.current) {
        abortRef.current.abort();
        abortRef.current = null;
      }

      if (!trimmed) {
        setCommittedQuery("");
        setRows([]);
        setTotal(0);
        setTotalPages(1);
        setPage(1);
        setError(null);
        setInfoMessage(activeMode === "companies" ? COMPANIES_PLACEHOLDER : null);
        if (!options?.skipSync) syncSearchParams("", activeMode, 1);
        return;
      }

      if (activeMode === "companies") {
        setLoading(false);
        setCommittedQuery(trimmed);
        setRows([]);
        setTotal(0);
        setTotalPages(1);
        setPage(1);
        setError(null);
        setInfoMessage(COMPANIES_PLACEHOLDER);
        if (!options?.skipSync) syncSearchParams(trimmed, activeMode, 1);
        return;
      }

      const controller = new AbortController();
      abortRef.current = controller;
      setLoading(true);
      setError(null);
      setInfoMessage(null);

      try {
        const offset = (targetPage - 1) * PAGE_SIZE;
        const { rows: iyRows, meta } = await iySearchShippers(trimmed, PAGE_SIZE, offset);
        if (controller.signal.aborted) return;

        const mapped: UnifiedRow[] = (iyRows ?? []).map((row) => ({
          company_id: row.company_id,
          company_name: row.company_name,
          shipments_12m: row.shipments_12m,
          last_activity: row.last_activity,
          top_routes: [],
          top_carriers: [],
          kpis: {
            shipments_12m: row.shipments_12m,
            last_activity: row.last_activity,
          },
          _source: "importyeti" as RowSource,
          _iy: row._iy,
        }));

        const totalValue = Number.isFinite(meta?.total) ? Number(meta?.total) : mapped.length;
        const nextTotalPages = Math.max(1, Math.ceil(totalValue / PAGE_SIZE));

        setRows(mapped);
        setTotal(totalValue);
        setTotalPages(nextTotalPages);
        setPage(targetPage);
        setCommittedQuery(trimmed);

        if (!options?.skipSync) {
          syncSearchParams(trimmed, activeMode, targetPage);
        } else {
          const params = new URLSearchParams();
          if (trimmed) params.set("q", trimmed);
          if (activeMode === "companies") params.set("mode", "companies");
          if (targetPage > 1) params.set("page", String(targetPage));
          lastParamsRef.current = params.toString();
        }
      } catch (err: any) {
        if (controller.signal.aborted) return;
        console.error("search error", err);
        setRows([]);
        setTotal(0);
        setTotalPages(1);
        setError(err?.message ?? "Search failed");
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
          abortRef.current = null;
        }
      }
    },
    [mode, syncSearchParams]
  );

  useEffect(() => {
    if (!initialQuery.trim()) {
      setInfoMessage(initialMode === "companies" ? COMPANIES_PLACEHOLDER : null);
      return;
    }

    if (initialMode === "companies") {
      setInfoMessage(COMPANIES_PLACEHOLDER);
    } else {
      runSearch(initialQuery, initialPage, { modeOverride: initialMode, skipSync: true }).catch(() => undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedRow, setSelectedRow] = useState<UnifiedRow | null>(null);

  const handleSearch = useCallback(
    (event?: React.FormEvent) => {
      event?.preventDefault();
      setPage(1);
      runSearch(inputValue, 1).catch(() => undefined);
    },
    [inputValue, runSearch]
  );

  const handleModeChange = useCallback(
    (next: Mode) => {
      if (next === mode) return;
      setMode(next);
      setPage(1);
      if (next === "companies") {
        if (abortRef.current) {
          abortRef.current.abort();
          abortRef.current = null;
        }
        setRows([]);
        setTotal(0);
        setTotalPages(1);
        setError(null);
        setInfoMessage(COMPANIES_PLACEHOLDER);
        syncSearchParams(committedQuery, next, 1);
      } else {
        setInfoMessage(null);
        syncSearchParams(committedQuery, next, committedQuery ? 1 : 1);
        if (committedQuery) {
          runSearch(committedQuery, 1, { modeOverride: next }).catch(() => undefined);
        }
      }
    },
    [mode, committedQuery, runSearch, syncSearchParams]
  );

  const handlePrev = useCallback(() => {
    if (loading || !committedQuery || page <= 1) return;
    const nextPage = page - 1;
    setPage(nextPage);
    runSearch(committedQuery, nextPage).catch(() => undefined);
  }, [loading, committedQuery, page, runSearch]);

  const handleNext = useCallback(() => {
    if (loading || !committedQuery || page >= totalPages) return;
    const nextPage = page + 1;
    setPage(nextPage);
    runSearch(committedQuery, nextPage).catch(() => undefined);
  }, [loading, committedQuery, page, totalPages, runSearch]);

  const handleOpenDrawer = useCallback((row: UnifiedRow) => {
    if (row._source !== "importyeti") return;
    setSelectedRow(row);
    setDrawerOpen(true);
  }, []);

  const pageSummary = useMemo(() => {
    if (!rows.length) return "";
    if (mode === "companies") return "Companies (Lusha) results pending.";
    if (!committedQuery) return `${rows.length} shippers`;
    return total ? `${rows.length} of ${total.toLocaleString()} shippers` : `${rows.length} shippers`;
  }, [rows.length, committedQuery, total, mode]);

  const showInitialPrompt = !loading && !error && !infoMessage && !committedQuery && rows.length === 0;

  return (
    <div className="mx-auto max-w-[1500px] px-4 pb-24">
      <header className="pt-8 pb-4">
        <h1 className="text-2xl font-semibold text-slate-900">Search</h1>
        <p className="text-sm text-slate-500">
          Find shippers with ImportYeti data today; the Companies (Lusha) view will follow soon.
        </p>
      </header>

      <form onSubmit={handleSearch} className="flex flex-wrap items-center gap-3 pb-4">
        <div className="inline-flex rounded-2xl border border-slate-200 p-0.5">
          <button
            type="button"
            onClick={() => handleModeChange("shippers")}
            className={`px-3 py-1.5 text-sm rounded-2xl ${
              mode === "shippers" ? "bg-indigo-600 text-white" : "text-slate-700 hover:bg-slate-100"
            }`}
            aria-pressed={mode === "shippers"}
          >
            Shippers
          </button>
          <button
            type="button"
            onClick={() => handleModeChange("companies")}
            className={`px-3 py-1.5 text-sm rounded-2xl ${
              mode === "companies" ? "bg-indigo-600 text-white" : "text-slate-700 hover:bg-slate-100"
            }`}
            aria-pressed={mode === "companies"}
          >
            Companies
          </button>
        </div>

        <input
          value={inputValue}
          onChange={(event) => setInputValue(event.target.value)}
          placeholder="Search by company name or alias…"
          className="flex-1 min-w-[220px] sm:w-80 rounded-2xl border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <button
          type="submit"
          disabled={loading}
          className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? "Searching…" : "Search"}
        </button>
      </form>

      <div className="flex flex-wrap items-center justify-between gap-3 py-2 text-xs text-slate-500">
        <div>{loading ? "Loading…" : pageSummary || "No results"}</div>
        <div className="text-slate-400">
          Page {page} / {totalPages}
        </div>
      </div>

      {error && (
        <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      {!error && infoMessage && (
        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
          {infoMessage}
        </div>
      )}

      {showInitialPrompt && (
        <div className="mt-6 text-sm text-slate-500">
          Type a company or shipper name and press Search.
        </div>
      )}

      {!error && rows.length > 0 && (
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((row) => (
            <article key={row.company_id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-sm uppercase tracking-wide text-slate-400">Company</div>
                  <div className="mt-0.5 text-base font-semibold text-slate-900">{row.company_name}</div>
                  <div className="text-[11px] uppercase text-slate-400 mt-0.5">ID</div>
                  <div className="text-xs text-slate-600 break-all">{row.company_id}</div>
                </div>
                <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[11px] font-medium text-indigo-700">
                  {row._source === "importyeti" ? "ImportYeti" : "Local"}
                </span>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2">
                <div className="rounded-xl border border-slate-200 p-2">
                  <div className="text-[10px] uppercase text-slate-400">Shipments (12m)</div>
                  <div className="text-sm font-medium text-slate-900">{row.shipments_12m ?? "—"}</div>
                </div>
                <div className="rounded-xl border border-slate-200 p-2">
                  <div className="text-[10px] uppercase text-slate-400">Last Activity</div>
                  <div className="text-sm font-medium text-slate-900">{row.last_activity ?? "—"}</div>
                </div>
                <div className="rounded-xl border border-slate-200 p-2">
                  <div className="text-[10px] uppercase text-slate-400">Top Carrier</div>
                  <div className="text-sm font-medium text-slate-400">—</div>
                </div>
              </div>
              <div className="mt-4">
                <button
                  type="button"
                  className="rounded-xl bg-indigo-600 px-3 py-1.5 text-sm text-white hover:bg-indigo-500 disabled:opacity-60"
                  onClick={() => handleOpenDrawer(row)}
                  disabled={row._source !== "importyeti"}
                >
                  View Details
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      {loading && rows.length === 0 && (
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((key) => (
            <div key={key} className="h-32 animate-pulse rounded-2xl border border-slate-200 bg-white shadow-sm" />
          ))}
        </div>
      )}

      <div className="mt-6 flex items-center justify-center gap-2">
        <button
          type="button"
          className="rounded-xl border border-slate-200 px-3 py-1.5 text-sm disabled:opacity-40"
          onClick={handlePrev}
          disabled={loading || !committedQuery || page <= 1}
        >
          Prev
        </button>
        <button
          type="button"
          className="rounded-xl border border-slate-200 px-3 py-1.5 text-sm disabled:opacity-40"
          onClick={handleNext}
          disabled={loading || !committedQuery || page >= totalPages}
        >
          Next
        </button>
      </div>

      <CompanyDrawer
        company={
          selectedRow
            ? {
                ...selectedRow,
                shipments_12m: selectedRow.kpis.shipments_12m,
                last_activity: selectedRow.kpis.last_activity,
              }
            : null
        }
        open={drawerOpen && Boolean(selectedRow)}
        onOpenChange={(open) => {
          setDrawerOpen(open);
          if (!open) setSelectedRow(null);
        }}
      />
    </div>
  );
}
