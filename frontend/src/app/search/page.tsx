'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import SearchBar from "@/components/SearchBar";

const PAGE_SIZE = 20;

type Row = {
  company_id: string;
  company_name: string;
  shipments_12m: number | null;
  last_activity: string | null;
};

export default function SearchPage() {
  const [isClient, setIsClient] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [committedQuery, setCommittedQuery] = useState("");
  const [searchInputSeed, setSearchInputSeed] = useState("");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const lastUrlRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setIsClient(true);
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const syncUrl = useCallback(
    (keyword: string, targetPage: number) => {
      if (!isClient) return;
      const url = new URL(window.location.href);
      const params = new URLSearchParams();
      if (keyword.trim()) params.set("q", keyword.trim());
      if (targetPage > 1) params.set("page", String(targetPage));
      const nextSearch = params.toString();
      const nextUrl = nextSearch ? `${url.pathname}?${nextSearch}${url.hash}` : `${url.pathname}${url.hash}`;
      if (lastUrlRef.current === nextUrl) return;
      lastUrlRef.current = nextUrl;
      window.history.replaceState(null, "", nextUrl);
    },
    [isClient]
  );

  const runSearch = useCallback(
    async (rawTerm: string, targetPage = 1, options?: { skipUrl?: boolean }) => {
      if (!isClient) return;
      const keyword = rawTerm.trim();

      if (abortRef.current) {
        abortRef.current.abort();
        abortRef.current = null;
      }

      if (!keyword) {
        setCommittedQuery("");
        setPage(1);
        setRows([]);
        setTotal(0);
        setError(null);
        setSearchInputSeed("");
        if (!options?.skipUrl) {
          syncUrl("", 1);
        } else if (lastUrlRef.current == null && typeof window !== "undefined") {
          lastUrlRef.current = window.location.pathname + window.location.hash;
        }
        return;
      }

      const controller = new AbortController();
      abortRef.current = controller;
      setLoading(true);
      setError(null);
      setPage(targetPage);

      const offset = (targetPage - 1) * PAGE_SIZE;

      try {
        const response = await fetch("/api/searchCompanies", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            keyword,
            limit: PAGE_SIZE,
            offset,
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          const text = await response.text().catch(() => "");
          throw new Error(text || `searchCompanies failed ${response.status}`);
        }

        const data = await response.json();
        const rawRows = Array.isArray(data?.rows)
          ? data.rows
          : Array.isArray(data?.items)
            ? data.items
            : [];

        const mapped: Row[] = rawRows.map((item: any) => {
          const idCandidate = item?.company_id ?? item?.id ?? null;
          const nameCandidate =
            typeof item?.company_name === "string" && item.company_name.trim()
              ? item.company_name.trim()
              : typeof item?.name === "string"
                ? item.name.trim()
                : "";
          const shipmentsValue = item?.kpis?.shipments_12m ?? item?.shipments_12m ?? null;
          const lastActivityValue = item?.kpis?.last_activity ?? item?.last_activity ?? null;

          return {
            company_id: String(idCandidate ?? nameCandidate || keyword),
            company_name: nameCandidate || "—",
            shipments_12m: shipmentsValue != null ? Number(shipmentsValue) : null,
            last_activity: lastActivityValue ?? null,
          };
        });

        const totalValue = (() => {
          const metaTotal = data?.meta?.total;
          if (Number.isFinite(metaTotal)) return Number(metaTotal);
          if (Number.isFinite(data?.total)) return Number(data.total);
          return mapped.length;
        })();

        setRows(mapped);
        setTotal(totalValue);
        setCommittedQuery(keyword);
        setSearchInputSeed(keyword);
        if (!options?.skipUrl) {
          syncUrl(keyword, targetPage);
        } else if (lastUrlRef.current == null && typeof window !== "undefined") {
          const params = new URLSearchParams();
          if (keyword) params.set("q", keyword);
          if (targetPage > 1) params.set("page", String(targetPage));
          const nextSearch = params.toString();
          lastUrlRef.current = nextSearch
            ? `${window.location.pathname}?${nextSearch}${window.location.hash}`
            : `${window.location.pathname}${window.location.hash}`;
        }
      } catch (err: any) {
        if (controller.signal.aborted) return;
        console.error("searchCompanies error", err);
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
    [isClient, syncUrl]
  );

  useEffect(() => {
    if (!isClient || initialized) return;

    try {
      const url = new URL(window.location.href);
      const params = url.searchParams;
      const initialQuery = (params.get("q") ?? params.get("keyword") ?? "").trim();
      const pageParam = Number.parseInt(params.get("page") ?? "1", 10);
      const initialPage = Number.isFinite(pageParam) && pageParam > 0 ? pageParam : 1;

      const initialUrl = params.toString()
        ? `${url.pathname}?${params.toString()}${url.hash}`
        : `${url.pathname}${url.hash}`;
      lastUrlRef.current = initialUrl;

      setSearchInputSeed(initialQuery);
      setPage(initialPage);

      if (initialQuery) {
        void runSearch(initialQuery, initialPage, { skipUrl: true });
      }
    } catch (err) {
      console.error("search init failed", err);
    } finally {
      setInitialized(true);
    }
  }, [isClient, initialized, runSearch]);

  const totalPages = useMemo(() => {
    if (total <= 0) return committedQuery ? 1 : 0;
    return Math.max(1, Math.ceil(total / PAGE_SIZE));
  }, [total, committedQuery]);

  const pageStart = rows.length ? (page - 1) * PAGE_SIZE + 1 : 0;
  const pageEnd = rows.length ? Math.min(total || pageStart + rows.length - 1, (page - 1) * PAGE_SIZE + rows.length) : 0;

  const handleSearch = useCallback(
    (keyword: string) => {
      if (!keyword.trim()) {
        void runSearch("", 1);
        return;
      }
      void runSearch(keyword, 1);
    },
    [runSearch]
  );

  const handlePrev = useCallback(() => {
    if (loading) return;
    if (!committedQuery) return;
    if (page <= 1) return;
    const nextPage = page - 1;
    void runSearch(committedQuery, nextPage);
  }, [loading, committedQuery, page, runSearch]);

  const handleNext = useCallback(() => {
    if (loading) return;
    if (!committedQuery) return;
    if (totalPages === 0 || page >= totalPages) return;
    const nextPage = page + 1;
    void runSearch(committedQuery, nextPage);
  }, [loading, committedQuery, page, totalPages, runSearch]);

  if (!isClient || !initialized) {
    return (
      <div className="mx-auto max-w-screen-xl px-4 py-10 space-y-6">
        <div className="h-12 w-72 animate-pulse rounded-xl bg-slate-200" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((key) => (
            <div key={key} className="h-32 animate-pulse rounded-2xl border border-slate-200 bg-white shadow-sm" />
          ))}
        </div>
      </div>
    );
  }

  const showInitialPrompt = !loading && !committedQuery && rows.length === 0 && !error;
  const showEmptyState = !loading && committedQuery && rows.length === 0 && !error;

  return (
    <div className="mx-auto max-w-screen-xl px-4 py-10 space-y-8">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold text-slate-900">Search</h1>
        <p className="text-slate-600">
          Query the logistics intelligence index for companies and shippers. Use the Search button or press Enter to run
          a query.
        </p>
      </header>

      <SearchBar initialQuery={searchInputSeed} onSearch={handleSearch} isLoading={loading} />

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {showInitialPrompt && (
        <div className="text-sm text-slate-500">Type a company or shipper name and press Enter to search.</div>
      )}

      {showEmptyState && (
        <div className="text-sm text-slate-500">
          No results found for “{committedQuery}”. Try adjusting the spelling or searching for a different company.
        </div>
      )}

      {rows.length > 0 && (
        <div className="space-y-3">
          <div className="text-sm text-slate-500">
            Showing {pageStart.toLocaleString()}-{pageEnd.toLocaleString()} of {total.toLocaleString()} companies
          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {rows.map((row) => (
              <div key={`${row.company_id}-${row.company_name}`} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition">
                <div className="flex items-center justify-between gap-2">
                  <div className="font-medium text-slate-900">{row.company_name}</div>
                  <span className="text-[11px] uppercase tracking-wide text-slate-500">{row.company_id}</span>
                </div>
                <div className="mt-3 text-sm text-slate-600">
                  Shipments (12m): {row.shipments_12m != null ? row.shipments_12m.toLocaleString() : "—"}
                </div>
                <div className="text-sm text-slate-600">Last activity: {row.last_activity ?? "—"}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {loading && rows.length === 0 && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((key) => (
            <div key={key} className="h-32 animate-pulse rounded-2xl border border-slate-200 bg-white shadow-sm" />
          ))}
        </div>
      )}

      {rows.length > 0 && totalPages > 1 && (
        <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
          <button
            type="button"
            onClick={handlePrev}
            disabled={loading || page <= 1}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Prev
          </button>
          <span className="text-sm text-slate-500">
            Page {page} of {totalPages}
          </span>
          <button
            type="button"
            onClick={handleNext}
            disabled={loading || page >= totalPages}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
