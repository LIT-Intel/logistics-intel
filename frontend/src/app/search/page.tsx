'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SearchResponse } from '@/lib/types';

type SearchReq = {
  q: string | null;
  origin: string[] | null;
  dest: string[] | null;
  hs: string[] | null;
  limit: number;
  offset: number;
};

const DEFAULT_LIMIT = 20;

function parseCsv(value: string): string[] | null {
  const parts = value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  return parts.length ? parts : null;
}

function formatNumber(value: unknown) {
  const num = typeof value === 'number' ? value : Number(value ?? NaN);
  if (Number.isNaN(num)) return '—';
  return new Intl.NumberFormat().format(num);
}

export default function SearchPage() {
  const [q, setQ] = useState('');
  const [originInput, setOriginInput] = useState('');
  const [destInput, setDestInput] = useState('');
  const [hsInput, setHsInput] = useState('');
  const [limit, setLimit] = useState(DEFAULT_LIMIT);
  const [offset, setOffset] = useState(0);
  const [view, setView] = useState<'cards' | 'list'>('cards');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<SearchResponse | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const lastPayloadRef = useRef<SearchReq | null>(null);

  const origin = useMemo(() => parseCsv(originInput), [originInput]);
  const dest = useMemo(() => parseCsv(destInput), [destInput]);
  const hs = useMemo(() => parseCsv(hsInput), [hsInput]);

  const fetchSearch = useCallback(async (payload: SearchReq) => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    const res = await fetch('/api/lit/public/searchCompanies', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      cache: 'no-store',
      signal: ac.signal,
    });
    if (!res.ok) {
      throw new Error(`searchCompanies failed ${res.status}`);
    }
    return res.json() as Promise<SearchResponse>;
  }, []);

  const runQuery = useCallback(async (payload: SearchReq) => {
    setLoading(true);
    setError(null);
    try {
      const json = await fetchSearch(payload);
      setData(json);
      setOffset(payload.offset);
      lastPayloadRef.current = payload;
    } catch (err: any) {
      setError(err?.message || 'Search failed');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [fetchSearch]);

  const buildPayload = useCallback((nextOffset: number): SearchReq => ({
    q: q.trim() || null,
    origin,
    dest,
    hs,
    limit,
    offset: nextOffset,
  }), [q, origin, dest, hs, limit]);

  const onSubmit = useCallback(async (event?: React.FormEvent) => {
    event?.preventDefault();
    const payload = buildPayload(0);
    await runQuery(payload);
  }, [buildPayload, runQuery]);

  const onNext = useCallback(async () => {
    if (!data) return;
    const pageSize = data.meta.page_size || limit;
    const nextOffset = offset + pageSize;
    const payload = { ...(lastPayloadRef.current ?? buildPayload(nextOffset)), offset: nextOffset };
    await runQuery(payload);
  }, [data, offset, limit, runQuery, buildPayload]);

  const onPrev = useCallback(async () => {
    if (!data) return;
    const pageSize = data.meta.page_size || limit;
    const nextOffset = Math.max(0, offset - pageSize);
    const payload = { ...(lastPayloadRef.current ?? buildPayload(nextOffset)), offset: nextOffset };
    await runQuery(payload);
  }, [data, offset, limit, runQuery, buildPayload]);

  useEffect(() => {
    onSubmit().catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (lastPayloadRef.current) {
      onSubmit().catch(() => undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [limit]);

  const hasResults = !!(data && data.rows && data.rows.length);
  const hasNext = !!(data && (data.meta.page * data.meta.page_size) < data.meta.total);
  const hasPrev = offset > 0;

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold text-slate-900">Unified Search</h1>
        <p className="text-sm text-slate-600">Query the logistics intelligence index with filters for origin, destination, and HS codes.</p>
      </header>

      <form onSubmit={onSubmit} className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center">
        <div className="flex-1">
          <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
            Keyword
            <input
              value={q}
              onChange={(event) => setQ(event.target.value)}
              placeholder="Search companies…"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
            />
          </label>
        </div>
        <div className="flex items-center gap-2">
          <label className="hidden flex-col text-xs font-medium text-slate-500 sm:flex">
            Page size
            <select
              value={limit}
              onChange={(event) => setLimit(Number(event.target.value))}
              className="rounded-lg border border-slate-300 px-2 py-1 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
            >
              {[20, 30, 50].map((value) => (
                <option key={value} value={value}>{value}</option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => setView((prev) => (prev === 'cards' ? 'list' : 'cards'))}
            className="hidden rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 sm:block"
          >
            {view === 'cards' ? 'List view' : 'Card view'}
          </button>
          <button
            type="button"
            onClick={() => setFiltersOpen(true)}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
          >
            Filters
          </button>
          <button
            type="submit"
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-indigo-400"
            disabled={loading}
            aria-busy={loading}
          >
            {loading && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/60 border-t-transparent" />}Search
          </button>
        </div>
      </form>

      {(origin || dest || hs) && (
        <div className="flex flex-wrap gap-2 text-xs">
          {origin?.map((value) => (
            <span key={`origin-${value}`} className="rounded-full bg-indigo-50 px-3 py-1 font-medium text-indigo-700">Origin: {value}</span>
          ))}
          {dest?.map((value) => (
            <span key={`dest-${value}`} className="rounded-full bg-violet-50 px-3 py-1 font-medium text-violet-700">Destination: {value}</span>
          ))}
          {hs?.map((value) => (
            <span key={`hs-${value}`} className="rounded-full bg-slate-200 px-3 py-1 font-medium text-slate-700">HS: {value}</span>
          ))}
        </div>
      )}

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>}

      {loading && !hasResults && !error && (
        <div className="flex items-center justify-center rounded-xl border border-dashed border-slate-300 py-12 text-sm text-slate-500">
          Running search…
        </div>
      )}

      {!loading && data && !data.rows.length && (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 shadow-sm">
          No companies matched this query.
        </div>
      )}

      {hasResults && data && (
        <section className="space-y-4">
          {view === 'cards' ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {data.rows.map((row) => (
                <article key={row.company_id ?? row.company_name} className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <header className="space-y-1">
                    <h2 className="truncate text-lg font-semibold text-slate-900" title={row.company_name}>{row.company_name}</h2>
                    <p className="text-xs text-slate-500">ID: {row.company_id ?? '—'}</p>
                  </header>
                  <dl className="grid grid-cols-2 gap-2 text-xs text-slate-600">
                    <div>
                      <dt className="font-medium text-slate-500">Shipments (12m)</dt>
                      <dd className="text-sm font-semibold text-slate-900">{formatNumber(row.shipments_12m)}</dd>
                    </div>
                    <div>
                      <dt className="font-medium text-slate-500">Last activity</dt>
                      <dd>{row.last_activity?.value ?? row.last_activity ?? '—'}</dd>
                    </div>
                    <div>
                      <dt className="font-medium text-slate-500">Top origin</dt>
                      <dd>{row.top_routes?.[0]?.origin_country ?? '—'}</dd>
                    </div>
                    <div>
                      <dt className="font-medium text-slate-500">Top destination</dt>
                      <dd>{row.top_routes?.[0]?.dest_country ?? '—'}</dd>
                    </div>
                  </dl>
                </article>
              ))}
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-slate-200">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Company</th>
                    <th className="px-4 py-3">Shipments (12m)</th>
                    <th className="px-4 py-3">Last activity</th>
                    <th className="px-4 py-3">Top route</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white text-sm text-slate-600">
                  {data.rows.map((row) => {
                    const top = row.top_routes?.[0];
                    return (
                      <tr key={row.company_id ?? row.company_name}>
                        <td className="px-4 py-3 text-slate-900" title={row.company_name}>{row.company_name}</td>
                        <td className="px-4 py-3">{formatNumber(row.shipments_12m)}</td>
                        <td className="px-4 py-3">{row.last_activity?.value ?? row.last_activity ?? '—'}</td>
                        <td className="px-4 py-3">{top ? `${top.origin_country ?? '—'} → ${top.dest_country ?? '—'}` : '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      <footer className="flex items-center justify-between gap-3">
        <span className="text-xs text-slate-500">
          {data ? `Showing ${(offset / (data.meta.page_size || limit)) + 1} of ${Math.max(1, Math.ceil(data.meta.total / (data.meta.page_size || limit)))}` : '—'}
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={onPrev}
            disabled={!hasPrev || loading}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300"
          >
            Prev
          </button>
          <button
            onClick={onNext}
            disabled={!hasNext || loading}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300"
          >
            Next
          </button>
        </div>
      </footer>

      {filtersOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 px-4 py-8">
          <div className="w-full max-w-lg space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
            <header className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-slate-900">Filters</h2>
              <button onClick={() => setFiltersOpen(false)} className="text-sm text-slate-500 hover:text-slate-700">Close</button>
            </header>
            <div className="space-y-3 text-sm">
              <label className="flex flex-col gap-1 font-medium text-slate-600">
                Origin countries (CSV)
                <textarea
                  value={originInput}
                  onChange={(event) => setOriginInput(event.target.value)}
                  className="min-h-[60px] rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                  placeholder="US, MX, CN"
                />
              </label>
              <label className="flex flex-col gap-1 font-medium text-slate-600">
                Destination countries (CSV)
                <textarea
                  value={destInput}
                  onChange={(event) => setDestInput(event.target.value)}
                  className="min-h-[60px] rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                  placeholder="US, CA, DE"
                />
              </label>
              <label className="flex flex-col gap-1 font-medium text-slate-600">
                HS codes (CSV)
                <textarea
                  value={hsInput}
                  onChange={(event) => setHsInput(event.target.value)}
                  className="min-h-[60px] rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                  placeholder="940330, 940340"
                />
              </label>
            </div>
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => {
                  setOriginInput('');
                  setDestInput('');
                  setHsInput('');
                  setFiltersOpen(false);
                  onSubmit().catch(() => undefined);
                }}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={() => {
                  setFiltersOpen(false);
                  onSubmit().catch(() => undefined);
                }}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow hover:bg-indigo-700"
              >
                Apply filters
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
