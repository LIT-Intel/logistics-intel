"use client";

import React, { useEffect, useState } from "react";
import { searchCompanies } from "@/lib/api";

type SearchRow = {
  company_id: string;
  company_name: string;
  shipments_12m: number | null;
  last_activity: string | null;
  top_routes?: Array<{ origin_country?: string; dest_country?: string }>;
};

function formatNumber(value: number | null | undefined): string {
  if (value == null || Number.isNaN(Number(value))) return "?";
  return Number(value).toLocaleString();
}

function formatDate(value: string | null): string {
  if (!value) return "?";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export default function TrendsView() {
  const [rows, setRows] = useState<SearchRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    setLoading(true);
    searchCompanies({ q: "", limit: 20, offset: 0 }, ac.signal)
      .then((res) => {
        const data = Array.isArray(res?.rows) ? (res.rows as SearchRow[]) : [];
        setRows(data);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Failed to load trends");
      })
      .finally(() => setLoading(false));
    return () => ac.abort();
  }, []);

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto w-full max-w-5xl px-4 py-8 lg:px-6">
        <header className="mb-6 border-b border-slate-200 pb-6">
          <h1 className="text-3xl font-bold text-slate-900">Search Trends</h1>
          <p className="mt-1 text-sm text-slate-600">Top companies over the last 12 months.</p>
        </header>

        {error && (
          <div className="mb-6 rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-700" role="alert">
            {error}
          </div>
        )}

        {loading ? (
          <div className="rounded-lg border border-slate-200 bg-white px-4 py-6 text-center text-sm text-slate-600 shadow-sm">
            Loading trends?
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-lg border border-slate-200 bg-white px-4 py-6 text-center text-sm text-slate-600 shadow-sm">
            No data available.
          </div>
        ) : (
          <div className="grid gap-4">
            {rows.map((row, index) => (
              <article key={`${row.company_id || row.company_name}-${index}`} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900">{row.company_name}</h2>
                    <p className="text-xs text-slate-500">ID: {row.company_id || "?"}</p>
                  </div>
                  <div className="flex flex-wrap gap-4 text-sm text-slate-700">
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
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
