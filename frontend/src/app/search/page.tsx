'use client';

import { useState } from 'react';
import { searchCompanies } from '@/lib/api';

type Row = {
  company_id: string;
  company_name: string;
  shipments_12m: number | null;
  last_activity: string | null;
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
      const { items } = await searchCompanies({ q: q || null, limit: 20, offset });
      setRows(Array.isArray(items) ? (items as Row[]) : []);
    } catch (err: any) {
      setError(err?.message ?? 'Search failed');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-screen-xl px-4 py-10">
      <h1 className="text-3xl font-semibold text-slate-900">Search</h1>
      <p className="mt-1 text-slate-600">
        Query the logistics intelligence index with filters for origin, destination, and HS codes.
      </p>

      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
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
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {rows.length > 0 && (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((row) => (
            <div key={row.company_id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="font-medium text-slate-900">{row.company_name}</div>
                <span className="text-[11px] uppercase tracking-wide text-slate-500">{row.company_id}</span>
              </div>
              <div className="mt-2 text-sm text-slate-600">Shipments (12m): {row.shipments_12m ?? '—'}</div>
              <div className="text-sm text-slate-600">Last Activity: {row.last_activity ?? '—'}</div>
            </div>
          ))}
        </div>
      )}

      {loading && <div className="mt-6 text-sm text-slate-500">Loading…</div>}
      {!loading && !error && rows.length === 0 && (
        <div className="mt-6 text-sm text-slate-500">Run a search to see results.</div>
      )}
    </div>
  );
}
