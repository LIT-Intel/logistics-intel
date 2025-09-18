import React, { useEffect, useState } from "react";

const safeSummary = {
  shipments90d: 0,
  savedCompanies: 0,
  recentSearches7d: 0,
  modeBreakdown: [
    { mode: "ocean", value: 0 },
    { mode: "air", value: 0 },
    { mode: "truck", value: 0 },
  ],
  activitySeries: [],
};

export default function Dashboard() {
  const [data, setData] = useState(safeSummary);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const url = `${import.meta.env.VITE_API_BASE}/public/dashboard/summary`;
        const resp = await fetch(url, { credentials: "omit" });
        if (!resp.ok) throw new Error(`dashboard ${resp.status}`);
        const body = await resp.json();
        if (alive) setData(body || safeSummary);
      } catch (err) {
        console.error("Error loading dashboard data:", err);
        if (alive) setData(safeSummary);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl md:text-3xl font-semibold text-gray-900">Dashboard</h1>
        <p className="text-gray-600 mt-2">
          Overview of your recent activity and search performance.
        </p>
      </div>

      {loading ? (
        <div className="rounded-lg border border-gray-200 bg-white p-6 text-gray-600">
          Loading dashboard…
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
            <StatCard label="Shipments (90d)" value={data.shipments90d} />
            <StatCard label="Saved Companies" value={data.savedCompanies} />
            <StatCard label="Recent Searches (7d)" value={data.recentSearches7d} />
            <StatCard label="Data Source" value="Live / Fallback-safe" muted />
          </div>

          <div className="rounded-lg border border-gray-200 bg-white p-6">
            <h2 className="text-lg font-medium text-gray-900 mb-4">Shipment Volume by Mode</h2>
            <ul className="space-y-2 text-gray-700">
              {data.modeBreakdown.map((m) => (
                <li key={m.mode} className="flex items-center justify-between">
                  <span className="capitalize">{m.mode}</span>
                  <span className="font-semibold">{m.value}</span>
                </li>
              ))}
            </ul>
            {(!data.modeBreakdown || data.modeBreakdown.every(m => m.value === 0)) && (
              <p className="text-sm text-gray-500 mt-3">
                No data yet. Start searching and saving companies to see activity here.
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function StatCard({ label, value, muted = false }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5">
      <div className="text-sm text-gray-500">{label}</div>
      <div className={`text-2xl font-semibold ${muted ? "text-gray-500" : "text-gray-900"}`}>
        {value ?? 0}
      </div>
    </div>
  );
}