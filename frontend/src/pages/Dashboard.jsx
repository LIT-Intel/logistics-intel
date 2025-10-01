import React, { useEffect, useState } from "react";
import DashboardKPICards from "@/components/dashboard/DashboardKPICards";
import DashboardHeroCards from "@/components/dashboard/DashboardHeroCards";
import RecentCompanies from "@/components/dashboard/RecentCompanies";
import DashboardKPICardsSkeleton from "@/components/dashboard/DashboardKPICards.skeleton";
import DashboardHeroCardsSkeleton from "@/components/dashboard/DashboardHeroCards.skeleton";
import RecentCompaniesSkeleton from "@/components/dashboard/RecentCompanies.skeleton";
import { Button } from "@/components/ui/button";
import { createPageUrl } from "@/utils";
import LitPageHeader from "../components/ui/LitPageHeader";
import LitPanel from "../components/ui/LitPanel";
import LitWatermark from "../components/ui/LitWatermark";
import LitKpi from "../components/ui/LitKpi";

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
    <div className="relative px-2 md:px-5 py-3 min-h-screen">
      <LitWatermark />
      <div className="max-w-7xl mx-auto">
        <LitPageHeader title="LIT Dashboard" />
        {loading ? (
          <div className="space-y-6">
            <DashboardKPICardsSkeleton />
            <DashboardHeroCardsSkeleton />
            <RecentCompaniesSkeleton />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-6">
              <LitKpi label="Shipments (90d)" value={data.shipments90d} accentClass="from-sky-400 to-violet-500" />
              <LitKpi label="Saved Companies" value={data.savedCompanies} accentClass="from-sky-400 to-violet-500" />
              <LitKpi label="Recent Searches" value={data.recentSearches7d} accentClass="from-sky-400 to-violet-500" />
              <LitKpi label="Active Users" value={0} accentClass="from-sky-400 to-violet-500" />
            </div>
            <div className="mb-6">
              <LitPanel>
                <DashboardKPICards stats={{ activeUsers: 0, searches: data.recentSearches7d, shipments: data.shipments90d, companies: data.savedCompanies }} />
              </LitPanel>
            </div>
            <div className="mb-8">
              <LitPanel>
                <DashboardHeroCards />
              </LitPanel>
            </div>
            <LitPanel>
              <RecentCompanies companies={data.recent_companies} onNavigate={(url) => (window.location.href = url)} />
            </LitPanel>
          </>
        )}
      </div>
    </div>
  );
}
