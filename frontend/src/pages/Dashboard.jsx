import React, { useEffect, useState } from "react";
import DashboardKPICards from "@/components/dashboard/DashboardKPICards";
import DashboardHeroCards from "@/components/dashboard/DashboardHeroCards";
import RecentCompanies from "@/components/dashboard/RecentCompanies";

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
    <div className="max-w-[1440px] mx-auto px-5 py-6">
      <div className="mb-6">
        <h1 className="text-2xl md:text-3xl font-semibold text-gray-900">Dashboard</h1>
        <p className="text-gray-600 mt-2">Overview of your recent activity and search performance.</p>
      </div>

      {loading ? (
        <div className="rounded-lg border border-gray-200 bg-white p-6 text-gray-600">Loading dashboard…</div>
      ) : (
        <>
          {/* KPI row spacing exact */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-6">
            <DashboardKPICards stats={{ activeUsers: 0, searches: data.recentSearches7d, shipments: data.shipments90d, companies: data.savedCompanies }} />
          </div>

          {/* CTA Hero Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-8">
            <DashboardHeroCards />
          </div>

          {/* Recent Companies with empty state handled internally */}
          <div className="rounded-2xl p-6 bg-white shadow-sm">
            <RecentCompanies companies={[]} onNavigate={(url) => (window.location.href = url)} />
          </div>
        </>
      )}
    </div>
  );
}

// StatCard not used; DashboardKPICards provides spec-matching tiles