import React, { useEffect, useState } from "react";
import DashboardKPICards from "@/components/dashboard/DashboardKPICards";
import DashboardHeroCards from "@/components/dashboard/DashboardHeroCards";
import RecentCompanies from "@/components/dashboard/RecentCompanies";
import DashboardLayout from "@/components/layout/DashboardLayout";
import DashboardKPICardsSkeleton from "@/components/dashboard/DashboardKPICards.skeleton";
import DashboardHeroCardsSkeleton from "@/components/dashboard/DashboardHeroCards.skeleton";
import RecentCompaniesSkeleton from "@/components/dashboard/RecentCompanies.skeleton";
import { Button } from "@/components/ui/button";
import { createPageUrl } from "@/utils";

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
    // Temporarily disable remote fetch to avoid 404/CORS noise. Fall back to safe defaults.
    (async () => {
      if (alive) setData(safeSummary);
      if (alive) setLoading(false);
    })();
    return () => { alive = false; };
  }, []);

  return (
    <DashboardLayout>
      <div className="mb-6">
        <h1 className="text-2xl md:text-3xl font-semibold text-gray-900">Dashboard</h1>
        <p className="text-gray-600 mt-2">Overview of your recent activity and search performance.</p>
      </div>

      {loading ? (
        <div className="space-y-6">
          <DashboardKPICardsSkeleton />
          <DashboardHeroCardsSkeleton />
          <RecentCompaniesSkeleton />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-12 gap-4 mb-6">
            <DashboardKPICards stats={{ activeUsers: 0, searches: data.recentSearches7d, shipments: data.shipments90d, companies: data.savedCompanies }} />
          </div>

          <div className="mb-8">
            <DashboardHeroCards />
          </div>

          <RecentCompanies companies={data.recent_companies} onNavigate={(url) => (window.location.href = url)} />
        </>
      )}
    </DashboardLayout>
  );
}
