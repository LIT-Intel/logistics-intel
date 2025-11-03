"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AutocompleteInput from "@/components/search/AutocompleteInput";
import { Button } from "@/components/ui/button";
import { getFilterOptions, searchCompanies, type SearchCompaniesParams } from "@/lib/api";

type SearchRow = {
  company_id: string;
  company_name: string;
  shipments_12m: number | null;
  last_activity: string | null;
  top_routes?: Array<{ route?: string; origin_country?: string; dest_country?: string }>;
  top_carriers?: Array<{ carrier?: string }>;
};

type FiltersResponse = {
  modes?: string[];
  origins?: string[];
  dests?: string[];
  carriers?: string[];
};

function formatDate(value: string | null): string {
  if (!value) return "?";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function formatNumber(value: number | null | undefined): string {
  if (value == null || Number.isNaN(Number(value))) return "?";
  return Number(value).toLocaleString();
}

function normalizeHs(text: string): string[] {
  return text
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

const LIMIT_OPTIONS = [20, 30, 50];

export default function LegacySearchView() {
  const [filtersLoaded, setFiltersLoaded] = useState(false);
  const [filtersError, setFiltersError] = useState<string | null>(null);
  const [filterOptions, setFilterOptions] = useState<FiltersResponse>({ modes: [], origins: [], dests: [], carriers: [] });

  const [q, setQ] = useState("");
  const [mode, setMode] = useState<"any" | "air" | "ocean">("any");
  const [hsText, setHsText] = useState("");
  const [origin, setOrigin] = useState<string[]>([]);
  const [dest, setDest] = useState<string[]>([]);
  const [carrier, setCarrier] = useState<string[]>([]);
  const [limit, setLimit] = useState<number>(20);
  const [offset, setOffset] = useState<number>(0);

  const [rows, setRows] = useState<SearchRow[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [pageSize, setPageSize] = useState<number>(20);
  const [page, setPage] = useState<number>(1);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    getFilterOptions(ac.signal)
      .then((data) => {
        const nextModes = Array.isArray(data?.modes) && data.modes.length ? data.modes : ["air", "ocean"];
        setFilterOptions({
          modes: nextModes,
          origins: Array.isArray(data?.origins) ? data.origins : [],
          dests: Array.isArray(data?.dests) ? data.dests : [],
          carriers: Array.isArray((data as any)?.carriers) ? (data as any).carriers : [],
        });
        setFiltersLoaded(true);
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : "Failed to load filters";
        setFiltersError(message);
        setFiltersLoaded(true);
      });
    return () => ac.abort();
  }, []);

  const runSearch = useCallback(
    async (nextOffset: number) => {
      const trimmedQ = q.trim();
      const hs = normalizeHs(hsText);

      const params: SearchCompaniesParams = {
        q: trimmedQ,
        limit,
        offset: nextOffset,
      };

      if (mode !== "any") params.mode = mode;
      if (hs.length) params.hs = hs;
      if (origin.length) params.origin = origin;
      if (dest.length) params.dest = dest;
      if (carrier.length) params.carrier = carrier;

      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;

      setLoading(true);
      setError(null);

      try {
        const response = await searchCompanies(params, ac.signal);
        const nextRows = Array.isArray(response?.rows) ? (response.rows as SearchRow[]) : [];
        const meta = response?.meta ?? { total: nextRows.length, page: Math.floor(nextOffset / limit) + 1, page_size: limit };

        setRows(nextRows);
        setTotal(typeof meta?.total === "number" ? meta.total : nextRows.length);
        setPageSize(typeof meta?.page_size === "number" ? meta.page_size : limit);
        setPage(Math.floor(nextOffset / limit) + 1);
        setHasSearched(true);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Search failed";
        setRows([]);
        setTotal(0);
        setError(message);
      } finally {
        setLoading(false);
        setOffset(nextOffset);
      }
    },
    [carrier, dest, hsText, limit, mode, origin, q]
  );

  const onSearch = useCallback(
    (e?: React.FormEvent) => {
      if (e) e.preventDefault();
      runSearch(0);
    },
    [runSearch]
  );

  const onNext = useCallback(() => {
    const nextOffset = offset + limit;
    if (nextOffset >= total) return;
    runSearch(nextOffset);
  }, [limit, offset, runSearch, total]);

  const onPrev = useCallback(() => {
    const nextOffset = Math.max(0, offset - limit);
    if (nextOffset === offset) return;
    runSearch(nextOffset);
  }, [limit, offset, runSearch]);

  const hasNext = useMemo(() => offset + limit < total, [offset, limit, total]);
  const hasPrev = useMemo(() => offset > 0, [offset]);

  const originOptions = useMemo(() => filterOptions.origins ?? [], [filterOptions.origins]);
  const destOptions = useMemo(() => filterOptions.dests ?? [], [filterOptions.dests]);
  const carrierOptions = useMemo(() => filterOptions.carriers ?? [], [filterOptions.carriers]);

  const resultRange = useMemo(() => {
    if (!rows.length) return "";
    const start = offset + 1;
    const end = Math.min(offset + limit, total);
    return `Showing ${start.toLocaleString()}-${end.toLocaleString()} of ${total.toLocaleString()}`;
  }, [rows.length, offset, limit, total]);

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto w-full max-w-6xl px-4 py-8 lg:px-6">
        <header className="mb-6 flex flex-col gap-4 border-b border-slate-200 pb-6 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Search Companies</h1>
            <p className="mt-1 text-sm text-slate-600">Search shippers & receivers. Filter by mode, HS codes, and trade lanes.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <a
              href="/app/search/trends"
              className="inline-flex items-center rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-semibold text-indigo-700 shadow-sm transition hover:bg-indigo-100"
            >
              View Trends
            </a>
          </div>
        </header>

        {!filtersLoaded && (
          <div className="mb-6 rounded-lg bg-white p-4 shadow-sm">
            <div className="text-sm text-slate-600">Loading filters?</div>
          </div>
        )}

        {filtersError && (
          <div className="mb-6 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">
            {filtersError}
          </div>
        )}

        <form onSubmit={onSearch} className="mb-6 grid gap-4 rounded-xl bg-white p-5 shadow-md">
          <div>
            <label className="mb-2 block text-sm font-semibold text-slate-700">Company</label>
            <AutocompleteInput
              value={q}
              onChange={setQ}
              onSubmit={() => runSearch(0)}
              onSelect={(value) => setQ(value)}
              placeholder="Search by company name or alias"
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700">Mode</label>
              <select
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                value={mode}
                onChange={(e) => setMode(e.target.value as typeof mode)}
              >
                <option value="any">Any</option>
                {filterOptions.modes?.map((m) => (
                  <option key={m} value={m.toLowerCase()}>{m}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700">HS Codes</label>
              <input
                type="text"
                value={hsText}
                onChange={(e) => setHsText(e.target.value)}
                placeholder="Enter HS codes, separated by commas"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700">Origin Countries</label>
              <select
                multiple
                value={origin}
                onChange={(e) => setOrigin(Array.from(e.target.selectedOptions).map((opt) => opt.value))}
                className="h-32 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {originOptions.map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700">Destination Countries</label>
              <select
                multiple
                value={dest}
                onChange={(e) => setDest(Array.from(e.target.selectedOptions).map((opt) => opt.value))}
                className="h-32 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {destOptions.map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
            </div>
          </div>

          {carrierOptions.length > 0 && (
            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700">Carriers</label>
              <select
                multiple
                value={carrier}
                onChange={(e) => setCarrier(Array.from(e.target.selectedOptions).map((opt) => opt.value))}
                className="h-32 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {carrierOptions.map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" className="px-6" disabled={loading}>
              {loading ? "Searching?" : "Search"}
            </Button>
            <div className="ml-auto flex items-center gap-2 text-sm text-slate-600">
              <span>Results per page</span>
              <select
                value={limit}
                onChange={(e) => {
                  const nextLimit = Number(e.target.value) || 20;
                  setLimit(nextLimit);
                  setOffset(0);
                  runSearch(0);
                }}
                className="rounded-lg border border-slate-200 px-2 py-1 text-sm"
              >
                {LIMIT_OPTIONS.map((value) => (
                  <option key={value} value={value}>{value}</option>
                ))}
              </select>
            </div>
          </div>
        </form>

        {error && (
          <div className="mb-6 rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-700" role="alert">
            {error}
          </div>
        )}

        <section className="rounded-xl bg-white p-5 shadow-md">
          <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div className="text-sm font-medium text-slate-600">
              {resultRange || (hasSearched && !rows.length ? "No results found." : "Run a search to see results.")}
            </div>
            <div className="flex items-center gap-3 text-sm text-slate-600">
              <span>Page {page}</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onPrev}
                  disabled={!hasPrev || loading}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Prev
                </button>
                <button
                  type="button"
                  onClick={onNext}
                  disabled={!hasNext || loading}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          </div>

          {loading && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-600">
              Searching companies?
            </div>
          )}

          {!loading && rows.length > 0 && (
            <div className="grid gap-4">
              {rows.map((row) => {
                const key = row.company_id || row.company_name;
                return (
                  <article key={key} className="rounded-lg border border-slate-200 p-4 shadow-sm transition hover:border-indigo-200 hover:shadow">
                    <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                      <div>
                        <h2 className="text-lg font-semibold text-slate-900">{row.company_name}</h2>
                        <p className="text-xs text-slate-500">ID: {row.company_id || "?"}</p>
                      </div>
                      <div className="grid grid-cols-2 gap-4 text-sm text-slate-700 md:grid-cols-4">
                        <div>
                          <div className="text-xs uppercase text-slate-500">Shipments (12m)</div>
                          <div className="text-base font-semibold text-slate-900">{formatNumber(row.shipments_12m)}</div>
                        </div>
                        <div>
                          <div className="text-xs uppercase text-slate-500">Last Activity</div>
                          <div className="text-base font-semibold text-slate-900">{formatDate(row.last_activity)}</div>
                        </div>
                        <div>
                          <div className="text-xs uppercase text-slate-500">Top Route</div>
                          <div className="text-base font-semibold text-slate-900">
                            {row.top_routes?.length
                              ? `${row.top_routes[0]?.origin_country ?? "?"} ? ${row.top_routes[0]?.dest_country ?? "?"}`
                              : "?"}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs uppercase text-slate-500">Top Carrier</div>
                          <div className="text-base font-semibold text-slate-900">
                            {row.top_carriers?.length ? row.top_carriers[0]?.carrier ?? "?" : "?"}
                          </div>
                        </div>
                      </div>
                    </div>

                    {(row.top_routes?.length ?? 0) > 1 && (
                      <div className="mt-3 text-sm text-slate-600">
                        <span className="font-medium text-slate-700">Other routes:</span>{" "}
                        {row.top_routes
                          ?.slice(1, 4)
                          .map((route) => `${route.origin_country ?? "?"} ? ${route.dest_country ?? "?"}`)
                          .join(", ") || "?"}
                      </div>
                    )}

                    {(row.top_carriers?.length ?? 0) > 1 && (
                      <div className="mt-2 text-sm text-slate-600">
                        <span className="font-medium text-slate-700">Other carriers:</span>{" "}
                        {row.top_carriers?.slice(1, 4).map((c) => c.carrier || "?").join(", ") || "?"}
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}

          {!loading && hasSearched && rows.length === 0 && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-600">
              No companies match your filters. Try adjusting your criteria.
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
