import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/auth/AuthProvider";
import { Building2, Mail, FileText, Activity } from "lucide-react";
import { getSavedCompanies, getCrmCampaigns } from "@/lib/api";
import DashboardHeader from "@/components/dashboard/DashboardHeader";
import EnhancedKpiCard from "@/components/dashboard/EnhancedKpiCard";
import ActivityFeed from "@/components/dashboard/ActivityFeed";
import InsightsPanel from "@/components/dashboard/InsightsPanel";
import GettingStartedChecklist from "@/components/dashboard/GettingStartedChecklist";
import PerformanceChart from "@/components/dashboard/PerformanceChart";
import QuickActionsButton from "@/components/dashboard/QuickActionsButton";
import { DashboardLoadingSkeleton } from "@/components/dashboard/LoadingSkeletons";
import { useDashboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { motion } from "framer-motion";

export default function Dashboard() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [savedCompanies, setSavedCompanies] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [rfpCount, setRfpCount] = useState(0);

  useDashboardShortcuts();

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      setLoading(true);
      try {
        const [companiesRes, campaignsRes] = await Promise.allSettled([
          getSavedCompanies(),
          getCrmCampaigns(),
        ]);

        if (mounted) {
          if (companiesRes.status === 'fulfilled') {
            const rows = Array.isArray(companiesRes.value?.rows) ? companiesRes.value.rows : [];
            setSavedCompanies(rows);
          }
          if (campaignsRes.status === 'fulfilled') {
            const rows = Array.isArray(campaignsRes.value?.rows) ? campaignsRes.value.rows :
                         Array.isArray(campaignsRes.value) ? campaignsRes.value : [];
            setCampaigns(rows);
          }

          try {
            const rfps = JSON.parse(localStorage.getItem('lit_rfps') || '[]');
            setRfpCount(Array.isArray(rfps) ? rfps.length : 0);
          } catch {}
        }
      } catch (err) {
        console.error('Dashboard load error:', err);
      } finally {
        if (mounted) setLoading(false);
      }
    };
    load();
    return () => { mounted = false; };
  }, []);

  const totalActivity = savedCompanies.length + campaigns.length + rfpCount;

  if (loading) {
    return <DashboardLoadingSkeleton />;
  }

  const activeCampaigns = campaigns.filter(c => c?.status === 'active' || c?.status === 'live').length;

  return (
    <>
      <div className="space-y-8">
        <DashboardHeader userName={user?.email || user?.displayName} />

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <EnhancedKpiCard
            icon={Building2}
            label="Saved Companies"
            value={savedCompanies.length}
            trend="+12%"
            trendUp
            href="/app/command-center"
            subtitle="vs last month"
            delay={0}
          />
          <EnhancedKpiCard
            icon={Mail}
            label="Active Campaigns"
            value={activeCampaigns}
            trend={campaigns.length > 0 ? `${campaigns.length} total` : undefined}
            href="/app/campaigns"
            subtitle={campaigns.length > 0 ? `${campaigns.length} total campaigns` : 'No campaigns yet'}
            delay={0.1}
          />
          <EnhancedKpiCard
            icon={FileText}
            label="Open RFPs"
            value={rfpCount}
            trend={rfpCount > 0 ? "+2 this week" : undefined}
            trendUp={rfpCount > 0}
            href="/app/rfp-studio"
            subtitle={rfpCount > 0 ? "Ready to send" : "Generate your first RFP"}
            delay={0.2}
          />
          <EnhancedKpiCard
            icon={Activity}
            label="Total Activity"
            value={totalActivity}
            trend="+8%"
            trendUp
            href="/app/dashboard"
            subtitle="All-time actions"
            delay={0.3}
          />
        </div>

        {savedCompanies.length < 5 && (
          <GettingStartedChecklist
            savedCompaniesCount={savedCompanies.length}
            campaignsCount={campaigns.length}
          />
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <PerformanceChart />
            <InsightsPanel />
          </div>

          <div className="space-y-6">
            <ActivityFeed />

            {savedCompanies.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.4 }}
                className="bg-white rounded-xl border border-slate-200 shadow-sm"
              >
                <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-slate-900">Saved Companies</h2>
                  <Link to="/app/command-center" className="text-sm text-blue-600 hover:text-blue-700 font-medium">
                    View all
                  </Link>
                </div>
                <div className="divide-y divide-slate-100">
                  {savedCompanies.slice(0, 5).map((company, i) => (
                    <Link
                      key={company?.company?.company_id || i}
                      to={`/app/command-center?company=${encodeURIComponent(company?.company?.company_id || '')}`}
                      className="flex items-start gap-4 p-4 hover:bg-slate-50 transition-colors group"
                    >
                      <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-50 to-blue-100 flex items-center justify-center text-blue-600 flex-shrink-0 group-hover:scale-110 transition-transform">
                        <Building2 className="w-5 h-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-slate-900 text-sm truncate">
                          {company?.company?.name || 'Unknown Company'}
                        </div>
                        <div className="text-xs text-slate-600 mt-0.5 truncate">
                          {company?.company?.address || company?.company?.country_code || 'Location not available'}
                        </div>
                        {company?.company?.kpis?.shipments_12m && (
                          <div className="text-xs text-slate-500 mt-1">
                            {Number(company.company.kpis.shipments_12m).toLocaleString()} shipments
                          </div>
                        )}
                      </div>
                    </Link>
                  ))}
                </div>
              </motion.div>
            )}
          </div>
        </div>
      </div>

      <QuickActionsButton />
    </>
  );
}
