import React, { useEffect, useState } from 'react';

type FilterOptions = {
  modes: string[];
  origins: string[];
  destinations: string[];
  date_min: string | null;
  date_max: string | null;
};

export default function SearchFilters() {
  const [data, setData] = useState<FilterOptions | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const base = import.meta.env.VITE_API_BASE;
        const resp = await fetch(`${base}/public/getFilterOptions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{}'
        });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const json = await resp.json();
        setData(json);
      } catch (e:any) {
        setErr(String(e?.message || e));
      }
    })();
  }, []);

  if (err) return <div className="p-4 text-red-600">Error: {err}</div>;
  if (!data) return <div className="p-4">Loading filters…</div>;

  return (
    <div className="p-4 space-y-2">
      <h2 className="text-xl font-bold">Search Filters</h2>
      <div>Modes: {data.modes.join(', ') || '—'}</div>
      <div>Origins: {data.origins.length}</div>
      <div>Destinations: {data.destinations.length}</div>
      <div>Date range: {data.date_min ?? '—'} → {data.date_max ?? '—'}</div>
    </div>
  );
}
