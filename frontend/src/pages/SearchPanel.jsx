import React, { useState } from 'react';
import { getFilterOptions, searchCompanies } from '@/lib/api';

export default function SearchPanel() {
  const [q, setQ] = useState("");
  const [mode, setMode] = useState("all");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState(null);
  const [results, setResults] = useState(null);

  async function onLoadFilters() {
    try {
      setError(null); setLoading(true);
      const data = await getFilterOptions({});
      setFilters(data);
    } catch (e) {
      setError(e?.message || 'Failed to load filters');
    } finally {
      setLoading(false);
    }
  }

  async function onSearch() {
    try {
      setError(null); setLoading(true);
      const data = await searchCompanies({ q, mode, pagination: { limit: 10, offset: 0 } });
      setResults(data);
    } catch (e) {
      setError(e?.message || 'Search failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-4 space-y-3">
      <div className="flex gap-2 items-center">
        <input
          className="border rounded px-3 py-2 w-64"
          placeholder="Search companies…"
          value={q}
          onChange={(e)=>setQ(e.target.value)}
        />
        <select className="border rounded px-3 py-2" value={mode} onChange={(e)=>setMode(e.target.value)}>
          <option value="all">All</option>
          <option value="ocean">Ocean</option>
          <option value="air">Air</option>
        </select>
        <button className="px-4 py-2 rounded bg-black text-white" onClick={onSearch} disabled={loading}>Search</button>
        <button className="px-4 py-2 rounded border" onClick={onLoadFilters} disabled={loading}>Load Filters</button>
      </div>

      {error && <div className="text-red-600 text-sm">{error}</div>}
      {loading && <div className="text-gray-500 text-sm">Loading…</div>}

      {filters && (
        <pre className="bg-gray-50 p-3 rounded text-xs overflow-auto max-h-64">{JSON.stringify(filters, null, 2)}</pre>
      )}

      {results && (
        <pre className="bg-gray-50 p-3 rounded text-xs overflow-auto max-h-96">{JSON.stringify(results, null, 2)}</pre>
      )}
    </div>
  );
}

