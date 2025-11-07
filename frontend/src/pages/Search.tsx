import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import CompanyDrawer from "@/components/company/CompanyDrawer";
import SearchBar from "@/components/SearchBar";
import {
  getFilterOptions,
  searchCompanies,
  iySearchShippers,
  ImportYetiShipperRow,
} from "@/lib/api";

const ENABLE_ADV =
  (typeof process !== "undefined" && process.env?.NEXT_PUBLIC_ENABLE_ADVANCED_FILTERS === "true") ||
  (typeof import.meta !== "undefined" && (import.meta as any)?.env?.NEXT_PUBLIC_ENABLE_ADVANCED_FILTERS === "true");

type FilterOptions = {
  origin_countries: string[];
  dest_countries: string[];
  modes: string[];
  hs_top?: string[];
};

type SourceMode = "local" | "importyeti";

type UnifiedRow = {
  company_id: string;
  company_name: string;
  shipments_12m: number | null;
  last_activity: string | null;
  top_routes?: Array<{ route?: string; origin_country?: string; dest_country?: string }>;
  top_carriers?: Array<{ carrier?: string }>;
  kpis: { shipments_12m: number; last_activity: string | null };
  _source: SourceMode;
  _iy?: ImportYetiShipperRow["_iy"];
};

const PAGE_SIZE = 20;

function formatDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString();
}

export default function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  const [initialized, setInitialized] = useState(false);
  const [source, setSource] = useState<SourceMode>("local");
  const [searchInputSeed, setSearchInputSeed] = useState("");
  const [committedQuery, setCommittedQuery] = useState("");
  const [mode, setMode] = useState<"air" | "ocean" | "" | undefined>("");
  const [hs, setHs] = useState<string>("");
  const [origin, setOrigin] = useState<string[]>([]);
  const [dest, setDest] = useState<string[]>([]);
  const [options, setOptions] = useState<FilterOptions>({ origin_countries: [], dest_countries: [], modes: [] });
  const [rows, setRows] = useState<UnifiedRow[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selected, setSelected] = useState<UnifiedRow | null>(null);

  const lastParamsRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    let cancelled = false;
    getFilterOptions()
      .then((data) => {
        if (cancelled) return;
        setOptions({
          origin_countries: Array.isArray(data?.origin_countries) ? data.origin_countries : [],
          dest_countries: Array.isArray(data?.dest_countries) ? data.dest_countries : [],
          modes: Array.isArray(data?.modes) ? data.modes : [],
          hs_top: data?.hs_top,
        });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const computedHs = useMemo(() => {
    if (!hs.trim()) return undefined;
    if (hs.includes(",")) {
      const arr = hs.split(",").map((s) => s.trim()).filter(Boolean);
      return arr.length ? arr : undefined;
    }
    return hs.trim();
  }, [hs]);

  useEffect(() => {
    if (source !== "local" && showFilters) {
      setShowFilters(false);
    }
  }, [source, showFilters]);

  const syncSearchParams = useCallback(
    (keyword: string, src: SourceMode) => {
      const params = new URLSearchParams();
      if (keyword.trim()) params.set("q", keyword.trim());
      if (src === "importyeti") params.set("source", "importyeti");
      const next = params.toString();
      if (lastParamsRef.current === next) return;
      lastParamsRef.current = next;
      setSearchParams(next, { replace: true });
    },
    [setSearchParams]
  );

  const runSearch = useCallback(
    async (rawTerm: string, overrides?: { sourceOverride?: SourceMode; skipSync?: boolean }) => {
      const term = rawTerm.trim();
      const activeSource = overrides?.sourceOverride ?? source;

      if (abortRef.current) {
        abortRef.current.abort();
        abortRef.current = null;
      }

      if (!term) {
        setLoading(false);
        setRows([]);
        setTotal(0);
        setError(null);
        setCommittedQuery("");
        setSearchInputSeed("");
        if (!overrides?.skipSync) {
          syncSearchParams("", activeSource);
        } else if (lastParamsRef.current == null && typeof window !== "undefined") {
          lastParamsRef.current = window.location.pathname + window.location.hash;
        }
        return;
      }

      const controller = new AbortController();
      abortRef.current = controller;
      setLoading(true);
      setError(null);

      try {
        if (activeSource === "importyeti") {
          const { rows: iyRows, meta } = await iySearchShippers(term, PAGE_SIZE, 0);
          const mapped: UnifiedRow[] = iyRows.map((row) => ({
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
            _source: "importyeti",
            _iy: row._iy,
          }));
          if (controller.signal.aborted) return;
          setRows(mapped);
          setTotal(meta?.total ?? mapped.length);
        } else {
          const res = await searchCompanies(
            {
              q: term,
              mode: mode || undefined,
              hs: computedHs ?? undefined,
              origin: origin.length ? origin : undefined,
              dest: dest.length ? dest : undefined,
              limit: PAGE_SIZE,
              offset: 0,
            },
            controller.signal
          );
          if (controller.signal.aborted) return;
          const items = Array.isArray(res?.items) ? res.items : [];
          const mapped: UnifiedRow[] = items.map((item: any) => {
            const companyId = String(item?.company_id ?? item?.id ?? "");
            const name = item?.company_name ?? item?.name ?? "Unknown Company";
            const shipmentsValue = Number(item?.shipments_12m ?? item?.shipments ?? 0);
            const shipments = Number.isFinite(shipmentsValue) ? shipmentsValue : 0;
            const lastActivityRaw = item?.last_activity ?? null;
            const lastActivity = typeof lastActivityRaw === "string" ? lastActivityRaw : null;
            return {
              company_id: companyId,
              company_name: name,
              shipments_12m: Number.isFinite(shipmentsValue) ? shipmentsValue : null,
              last_activity: lastActivity,
              top_routes: Array.isArray(item?.top_routes) ? item.top_routes : [],
              top_carriers: Array.isArray(item?.top_carriers) ? item.top_carriers : [],
              kpis: {
                shipments_12m: shipments,
                last_activity: lastActivity,
              },
              _source: "local" as const,
            };
          });
          setRows(mapped);
          setTotal(res?.total ?? mapped.length);
        }

        setCommittedQuery(term);
        setSearchInputSeed(term);
        if (!overrides?.skipSync) {
          syncSearchParams(term, activeSource);
        } else if (lastParamsRef.current == null && typeof window !== "undefined") {
          const params = new URLSearchParams();
          if (term) params.set("q", term);
          if (activeSource === "importyeti") params.set("source", "importyeti");
          const next = params.toString();
          lastParamsRef.current = next
            ? `${window.location.pathname}?${next}${window.location.hash}`
            : `${window.location.pathname}${window.location.hash}`;
        }
      } catch (err: any) {
        if (controller.signal.aborted) return;
        console.error("search error", err);
        setRows([]);
        setTotal(0);
        setError(err?.message ?? "Search failed");
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
          if (abortRef.current === controller) {
            abortRef.current = null;
          }
        }
      }
    },
    [source, mode, computedHs, origin, dest, syncSearchParams]
  );

  useEffect(() => {
    if (initialized) return;
    const params = new URLSearchParams(searchParams);
    const initialQuery = (params.get("q") ?? params.get("keyword") ?? "").trim();
    const initialSource = params.get("source") === "importyeti" ? "importyeti" : "local";

    lastParamsRef.current = params.toString();
    setSource(initialSource);
    setSearchInputSeed(initialQuery);

    if (initialQuery) {
      runSearch(initialQuery, { sourceOverride: initialSource, skipSync: true }).finally(() => {
        setInitialized(true);
      });
    } else {
      setInitialized(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialized, runSearch]);

  const handleSearch = useCallback(
    (term: string) => {
      void runSearch(term);
    },
    [runSearch]
  );

  const handleSourceChange = useCallback(
    (next: SourceMode) => {
      if (next === source) return;
      setSource(next);
      if (next !== "local") {
        setShowFilters(false);
      }
      syncSearchParams(committedQuery, next);
      if (committedQuery) {
        void runSearch(committedQuery, { sourceOverride: next, skipSync: true });
      }
    },
    [source, committedQuery, syncSearchParams, runSearch]
  );

  const handleOpenDrawer = (row: UnifiedRow) => {
    setSelected(row);
    setDrawerOpen(true);
  };

  const computedTotals = useMemo(() => {
    if (!rows.length) return { pageText: "", hasRows: false };
    if (source === "importyeti") {
      const count = rows.length;
      return {
        pageText: count === 1 ? "1 shipper" : `${count} shippers`,
        hasRows: true,
      };
    }
    const count = rows.length;
    return {
      pageText: total ? `${count} of ${total.toLocaleString()} companies` : `${count} companies`,
      hasRows: true,
    };
  }, [rows.length, total, source]);

  const showInitialPrompt = !loading && !error && !committedQuery && rows.length === 0;
  const showEmptyState = !loading && !error && committedQuery && rows.length === 0;

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
      <header className="flex flex-wrap items-start gap-3">
        <div className="flex-1 min-w-[280px] space-y-1">
          <h1 className="text-4xl font-bold">Search</h1>
          <p className="text-slate-600">
            Query the logistics intelligence index with filters for origin, destination, mode, and HS codes.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="source-select" className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Source
          </label>
          <select
            id="source-select"
            value={source}
            onChange={(event) => handleSourceChange(event.target.value as SourceMode)}
            className="rounded-xl border px-3 py-2 text-sm"
          >
            <option value="local">Local (BigQuery)</option>
            <option value="importyeti">ImportYeti</option>
          </select>
        </div>
        <a
          className="inline-flex items-center px-3 py-2 rounded-xl border text-slate-700 hover:bg-slate-50"
          href="/app/search/trends"
        >
          View Trends
        </a>
        {source === "local" && (
          <button
            type="button"
            onClick={() => setShowFilters((prev) => !prev)}
            className="inline-flex items-center px-3 py-2 rounded-xl border text-slate-700 hover:bg-slate-50"
          >
            {showFilters ? "Hide Filters" : "Show Filters"}
          </button>
        )}
      </header>

      <SearchBar initialQuery={searchInputSeed} onSearch={handleSearch} isLoading={loading} />

      {source === "local" && showFilters && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-4">
          <div className="grid md:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold block mb-1">Mode</label>
              <select
                className="w-full rounded-xl border p-3"
                value={mode ?? ""}
                onChange={(e) => setMode((e.target.value || undefined) as any)}
              >
                <option value="">Any</option>
                {options.modes.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold block mb-1">HS (comma-separated)</label>
              <input
                className="w-full rounded-xl border p-3"
                value={hs}
                onChange={(e) => setHs(e.target.value)}
                placeholder="e.g. 9506, 4202"
              />
            </div>
            <div>
              <label className="text-xs font-semibold block mb-1">Origin Country</label>
              <select
                multiple
                className="w-full rounded-xl border p-3 h-32"
                value={origin}
                onChange={(e) => setOrigin(Array.from(e.target.selectedOptions).map((o) => o.value))}
              >
                {options.origin_countries.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold block mb-1">Destination Country</label>
              <select
                multiple
                className="w-full rounded-xl border p-3 h-32"
                value={dest}
                onChange={(e) => setDest(Array.from(e.target.selectedOptions).map((o) => o.value))}
              >
                {options.dest_countries.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {ENABLE_ADV && (
            <div className="opacity-60 pointer-events-none">
              <div className="text-xs font-semibold">Advanced (coming soon)</div>
              <div className="grid md:grid-cols-3 gap-3 mt-2">
                <input className="rounded-xl border p-3" placeholder="Origin city" />
                <input className="rounded-xl border p-3" placeholder="Origin state" />
                <input className="rounded-xl border p-3" placeholder="Origin port" />
                <input className="rounded-xl border p-3" placeholder="Dest city" />
                <input className="rounded-xl border p-3" placeholder="Dest state" />
                <input className="rounded-xl border p-3" placeholder="Dest ZIP" />
                <input className="rounded-xl border p-3" placeholder="Commodity type" />
              </div>
            </div>
          )}
        </div>
      )}

      {source === "importyeti" && (
        <div className="text-xs text-slate-500">
          ImportYeti mode uses keyword-only search; filters are disabled.
        </div>
      )}

      {error && (
        <div className="rounded-xl bg-red-50 text-red-700 border border-red-200 p-3 text-sm break-all">
          {error}
        </div>
      )}

      {showInitialPrompt && (
        <div className="text-sm text-slate-500">Type a company or shipper name, then press Enter or hit Search.</div>
      )}

      {showEmptyState && (
        <div className="text-sm text-slate-500">
          {source === "importyeti"
            ? "No companies found via ImportYeti. Try a different keyword or switch source."
            : `No results found for “${committedQuery}”. Try adjusting filters or keywords.`}
        </div>
      )}

      {rows.length > 0 && (
        <div className="space-y-3">
          {computedTotals.hasRows && (
            <div className="text-sm text-slate-500">{computedTotals.pageText}</div>
          )}
          <div className="grid md:grid-cols-2 gap-4">
            {rows.map((r) => (
              <div key={r.company_id} className="rounded-2xl border p-4 bg-white space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-semibold text-lg">{r.company_name}</div>
                    <div className="text-sm text-slate-600">Shipments (12m): {r.kpis.shipments_12m ?? "—"}</div>
                    <div className="text-sm text-slate-600">Last activity: {formatDate(r.kpis.last_activity)}</div>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <span className="inline-flex items-center rounded-full border border-slate-200 px-2 py-1 text-[11px] uppercase tracking-wide text-slate-500">
                      {r._source === "importyeti" ? "ImportYeti" : "Local"}
                    </span>
                    <span className="text-xs text-slate-500 break-all">{r.company_id}</span>
                  </div>
                </div>
                {r._source === "importyeti" ? (
                  <>
                    <div className="text-sm text-slate-600">Address: {r._iy?.address ?? "—"}</div>
                    <div className="text-sm text-slate-600">Country: {r._iy?.countryCode ?? "—"}</div>
                  </>
                ) : (
                  <>
                    <div className="text-sm mt-2">
                      <div className="font-medium">Top routes</div>
                      <div className="text-slate-600">
                        {Array.isArray(r.top_routes) && r.top_routes.length
                          ? r.top_routes
                              .map((t) => t.route || [t.origin_country, t.dest_country].filter(Boolean).join(" → "))
                              .filter(Boolean)
                              .join(" • ")
                          : "—"}
                      </div>
                    </div>
                    <div className="text-sm mt-1">
                      <div className="font-medium">Top carriers</div>
                      <div className="text-slate-600">
                        {Array.isArray(r.top_carriers) && r.top_carriers.length
                          ? r.top_carriers.map((t) => t.carrier ?? "").filter(Boolean).join(" • ") || "—"
                          : "—"}
                      </div>
                    </div>
                  </>
                )}
                <button
                  type="button"
                  onClick={() => handleOpenDrawer(r)}
                  className="inline-flex items-center rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                >
                  View details
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {loading && rows.length === 0 && (
        <div className="grid md:grid-cols-2 gap-4">
          {[0, 1, 2, 3].map((key) => (
            <div key={key} className="h-32 animate-pulse rounded-2xl border border-slate-200 bg-white shadow-sm" />
          ))}
        </div>
      )}

      <CompanyDrawer
        company={
          selected
            ? {
                ...selected,
                shipments_12m: selected.kpis.shipments_12m,
                last_activity: selected.kpis.last_activity,
              }
            : null
        }
        open={drawerOpen && Boolean(selected)}
        onOpenChange={(open) => {
          setDrawerOpen(open);
          if (!open) setSelected(null);
        }}
        />
    </div>
  );
}
