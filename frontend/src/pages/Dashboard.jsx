import React, { useEffect, useState } from "react";
import { useAuth } from "@/auth/AuthProvider";
import DashboardKPICards from "@/components/dashboard/DashboardKPICards";
import AutocompleteInput from "@/components/search/AutocompleteInput";
import CompanyCard from "@/components/search/CompanyCard";
import RecentCompanies from "@/components/dashboard/RecentCompanies";
import DashboardKPICardsSkeleton from "@/components/dashboard/DashboardKPICards.skeleton";
// Removed hero cards in favor of search panel on dashboard
import RecentCompaniesSkeleton from "@/components/dashboard/RecentCompanies.skeleton";
import { Button } from "@/components/ui/button";
import { createPageUrl } from "@/utils";
import LitPageHeader from "../components/ui/LitPageHeader";
import WelcomeBanner from "@/components/WelcomeBanner";
import LitPanel from "../components/ui/LitPanel";
import LitWatermark from "../components/ui/LitWatermark";
import LitKpi from "../components/ui/LitKpi";
import { searchCompanies as searchCompaniesApi } from "@/lib/api";

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
  const { user } = useAuth();
  const [data, setData] = useState(safeSummary);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [seedRows, setSeedRows] = useState([]);

  // Load saved companies count + featured companies from localStorage/proxy
  useEffect(() => {
    try {
      const arr = JSON.parse(localStorage.getItem('lit_companies') || '[]');
      const savedCount = Array.isArray(arr) ? arr.length : 0;
      setData((d) => ({ ...d, savedCompanies: savedCount }));
    } catch {
      /* ignore localStorage read failure */
    }
  }, []);

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
        <WelcomeBanner userName={String((user?.displayName)||'there')} lastLoginIso={null} />
        {loading ? (
          <div className="space-y-6">
            <DashboardKPICardsSkeleton />
            <RecentCompaniesSkeleton />
          </div>
        ) : (
          <>
            {/* KPI row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-4">
              <LitKpi label="Active Companies (search)" value={data.shipments90d} accentClass="from-sky-400 to-violet-500" deltaPercent={3.2} deltaPositive icon={null} />
              <LitKpi label="Saved Companies" value={data.savedCompanies} accentClass="from-emerald-400 to-teal-500" deltaPercent={1.4} deltaPositive icon={null} />
              <LitKpi label="Saved Contacts" value={0} accentClass="from-indigo-400 to-purple-500" deltaPercent={0.0} icon={null} />
              <LitKpi label="Active Campaigns" value={0} accentClass="from-amber-400 to-orange-500" deltaPercent={0.0} icon={null} />
            </div>

            {/* Search panel */}
            <div className="mb-6">
              <LitPanel>
                <div className="p-4">
                  <div className="mb-3 text-sm text-gray-600 text-center">Quick company search</div>
                  <div className="relative max-w-2xl mx-auto">
                    <AutocompleteInput
                      value={q}
                      onChange={setQ}
                      onSubmit={() => { if (q.trim()) window.location.href = `/search?q=${encodeURIComponent(q.trim())}`; }}
                      placeholder="Type a company name…"
                    />
                  </div>
                  <div className="mt-4 text-xs text-gray-500 text-center">Select a suggestion to jump into the Search page to view company details.</div>
                </div>
              </LitPanel>
            </div>

            {/* Featured companies */}
            {Array.isArray(seedRows) && seedRows.length > 0 && (
              <div className="mb-6">
                <LitPanel>
                  <div className="p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="text-sm font-semibold text-gray-800">Companies</div>
                      <a className="text-sm text-indigo-600 hover:underline" href="/search">See full search</a>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      {seedRows.slice(0,6).map((row, i) => (
                        <CompanyCard
                          key={row?.company_id ?? row?.id ?? i}
                          data={row}
                          onViewDetails={(company) => {
                            window.location.href = `/search?q=${encodeURIComponent(company.company_name)}`;
                          }}
                        />
                      ))}
                    </div>
                    <div className="mt-3 text-xs text-gray-500">For a complete list and filters, use the Search page.</div>
                  </div>
                </LitPanel>
              </div>
            )}

            {/* Saved companies */}
            <LitPanel>
              <RecentCompanies companies={data.recent_companies} onNavigate={(url) => (window.location.href = url)} />
            </LitPanel>
          </>
        )}
      </div>
    </div>
  );
}
