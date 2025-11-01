'use client';

import { useCallback, useRef, useState } from 'react';

type SearchRequest = {
  q: string | null;
  origin: string[] | null;
  dest: string[] | null;
  hs: string[] | null;
  limit: number;
  offset: number;
};

type SearchResponse = {
  meta: { total: number; page: number; page_size: number };
  rows: Array<{ company_id?: string; company_name: string; shipments_12m?: number; last_activity?: { value?: string } | string | null }>;
};

export default function SearchPage() {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SearchResponse | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const runSearch = useCallback(async (payload: SearchRequest) => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    const res = await fetch('/api/searchCompanies', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      signal: ac.signal,
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(`searchCompanies failed ${res.status}`);
    return res.json() as Promise<SearchResponse>;
  }, []);

  const onSubmit = useCallback(async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const payload: SearchRequest = {
        q: query.trim() || null,
        origin: null,
        dest: null,
        hs: null,
        limit: 20,
        offset: 0,
      };
      const json = await runSearch(payload);
      setResult(json);
    } catch (err: any) {
      setError(err?.message || 'Search failed');
      setResult(null);
    } finally {
      setLoading(false);
    }
  }, [query, runSearch]);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-10">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold text-slate-900">Search Companies</h1>
        <p className="text-sm text-slate-600">Proxying through <code>/api/searchCompanies</code> with POST.</p>
      </header>

      <form onSubmit={onSubmit} className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search by company name"
          className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
        />
        <button
          type="submit"
          disabled={loading}
          className="inline-flex items-center justify-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-indigo-400"
        >
          {loading ? 'Searching…' : 'Search'}
        </button>
      </form>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading && !result && !error && (
        <div className="rounded-xl border border-dashed border-slate-300 py-10 text-center text-sm text-slate-500">
          Running search…
        </div>
      )}

      {result && result.rows.length === 0 && !loading && (
        <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
          No companies matched this query.
        </div>
      )}

      {result && result.rows.length > 0 && (
        <div className="space-y-3">
          <p className="text-sm text-slate-500">
            Showing {result.rows.length} of {result.meta.total} companies (page {result.meta.page}).
          </p>
          <ul className="space-y-3">
            {result.rows.map((row) => (
              <li key={row.company_id ?? row.company_name} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="text-base font-semibold text-slate-900">{row.company_name}</div>
                <div className="text-xs text-slate-500">ID: {row.company_id ?? '—'}</div>
                <div className="mt-2 text-sm text-slate-600">Shipments (12m): {row.shipments_12m ?? '—'}</div>
                <div className="text-sm text-slate-600">Last activity: {typeof row.last_activity === 'string' ? row.last_activity : row.last_activity?.value ?? '—'}</div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
