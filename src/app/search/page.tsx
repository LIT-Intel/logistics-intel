'use client';

import { useState } from 'react';

type Row = {
  company_id: string;
  company_name: string;
  shipments_12m: number | null;
  last_activity: string | null;
  top_carriers?: string[] | null;
};

export default function SearchPage() {
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function runSearch(offset = 0) {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/searchCompanies', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ q: q || null, origin: null, dest: null, hs: null, limit: 20, offset }),
      });
      if (!response.ok) {
        throw new Error(`searchCompanies failed ${response.status}`);
      }
      const data = await response.json();
      setRows(Array.isArray(data?.rows) ? data.rows : []);
    } catch (err: any) {
      setError(err?.message ?? 'Search failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-screen-xl px-4 py-10">
      <h1 className="text-3xl font-semibold">Search</h1>
      <p className="mt-1 text-slate-600">
        Query the logistics intelligence index with filters for origin, destination, and HS codes.
      </p>

      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-4">
        <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">
          Keyword
          <input
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder="Search companies…"
            className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
          />
        </label>
        <div className="mt-4 flex gap-3">
          <button
            onClick={() => runSearch(0)}
            disabled={loading}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-indigo-400"
          >
            {loading ? 'Searching…' : 'Search'}
          </button>
        </div>
      </div>

      {error && (
        <div className="mt-4 rounded-lg border border-rose-300 bg-rose-50 p-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {rows.map((row) => (
          <div key={row.company_id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-2 flex items-center justify-between">
              <div className="font-medium text-slate-900">{row.company_name}</div>
              <span className="text-[11px] uppercase tracking-wide text-slate-500">{row.company_id}</span>
            </div>
            <div className="text-sm text-slate-600">Shipments (12m): {row.shipments_12m ?? '—'}</div>
            <div className="text-sm text-slate-600">Last Activity: {row.last_activity ?? '—'}</div>
            <div className="text-sm text-slate-600">
              Top Carriers: {row.top_carriers?.join(', ') || '—'}
            </div>
          </div>
        ))}
      </div>

      {!rows.length && !loading && !error && (
        <div className="mt-6 text-sm text-slate-500">Run a search to see results.</div>
      )}

      {loading && (
        <div className="mt-6 text-sm text-slate-500">Loading…</div>
      )}
    </div>
  );
}
