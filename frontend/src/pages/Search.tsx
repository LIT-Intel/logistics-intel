// src/pages/Search.tsx
import React, { useState } from "react";
import { api } from "@/lib/api";
import type { SearchFilters, SearchCompanyRow } from "@/lib/api/search";

export default function SearchPage() {
  const [q, setQ] = useState("");
  const [origin, setOrigin] = useState<string[]>([]);
  const [dest, setDest] = useState<string[]>([]);
  const [hs, setHs] = useState<string[]>([]);
  const [rows, setRows] = useState<SearchCompanyRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const run = async () => {
    setLoading(true);
    setErr(null);
    try {
      const filters: SearchFilters = { q, origin, dest, hs, limit: 24, offset: 0 };
      const resp = await api.searchCompanies(filters);
      setRows(resp.rows || []);
    } catch (e: any) {
      setErr(e?.message || "Search failed");
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 space-y-3">
      <div className="flex gap-2 flex-wrap">
        <input className="border px-2 py-1" placeholder="q" value={q} onChange={(e) => setQ(e.target.value)} />
        <input className="border px-2 py-1" placeholder='origin CSV e.g. "CN,US"'
          onChange={(e) => setOrigin(e.target.value.split(",").map(s=>s.trim()).filter(Boolean))} />
        <input className="border px-2 py-1" placeholder='dest CSV e.g. "DE,NL"'
          onChange={(e) => setDest(e.target.value.split(",").map(s=>s.trim()).filter(Boolean))} />
        <input className="border px-2 py-1" placeholder='hs CSV e.g. "847130,940360"'
          onChange={(e) => setHs(e.target.value.split(",").map(s=>s.trim()).filter(Boolean))} />
        <button className="border px-3 py-1 bg-blue-600 text-white" onClick={run} disabled={loading}>
          {loading ? "Searching..." : "Search"}
        </button>
      </div>
      {err && <div className="text-red-600 text-sm">{err}</div>}
      <div className="space-y-2">
        {rows.map((r) => (
          <div key={r.company_id} className="border rounded p-2">
            <div className="font-semibold">{r.name}</div>
            <div className="text-xs text-gray-600">
              12m shipments: {r.kpis.shipments_12m} • Last: {typeof r.kpis.last_activity === "string" ? r.kpis.last_activity : r.kpis.last_activity?.value}
            </div>
          </div>
        ))}
        {rows.length === 0 && !loading && !err && <div className="text-gray-500 text-sm">No results.</div>}
      </div>
    </div>
  );
}
