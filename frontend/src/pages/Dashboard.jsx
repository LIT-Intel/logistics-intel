import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/auth/AuthProvider";
import { Building2, Mail, FileText, Activity, ArrowRight } from "lucide-react";
import { getSavedCompanies, getCrmCampaigns } from "@/lib/api";

const KpiCard = ({ icon: Icon, label, value, trend, trendUp, href }) => (
  <Link
    to={href}
    className="block p-6 bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all"
  >
    <div className="flex items-center justify-between mb-3">
      <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-blue-50 to-blue-100 flex items-center justify-center text-blue-600">
        <Icon className="w-6 h-6" />
      </div>
      {trend && (
        <span className={`text-sm font-medium ${trendUp ? 'text-green-600' : 'text-slate-500'}`}>
          {trendUp ? '↑' : ''} {trend}
        </span>
      )}
    </div>
    <div className="text-3xl font-bold text-slate-900 mb-1">{value}</div>
    <div className="text-sm text-slate-600">{label}</div>
  </Link>
);

const EmptyState = ({ icon: Icon, title, description, actionLabel, actionHref }) => (
  <div className="flex flex-col items-center justify-center py-12 text-center">
    <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mb-4">
      <Icon className="w-8 h-8 text-slate-400" />
    </div>
    <h3 className="text-lg font-semibold text-slate-900 mb-2">{title}</h3>
    <p className="text-sm text-slate-600 mb-6 max-w-sm">{description}</p>
    {actionLabel && actionHref && (
      <Link
        to={actionHref}
        className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
      >
        {actionLabel}
        <ArrowRight className="w-4 h-4" />
      </Link>
    )}
  </div>
);

export default function Dashboard() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [savedCompanies, setSavedCompanies] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [rfpCount, setRfpCount] = useState(0);

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

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-32 bg-white rounded-xl border border-slate-200 animate-pulse" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="h-96 bg-white rounded-xl border border-slate-200 animate-pulse" />
          <div className="h-96 bg-white rounded-xl border border-slate-200 animate-pulse" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* KPI Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <KpiCard
            icon={Building2}
            label="Saved Companies"
            value={savedCompanies.length}
            trend="+12%"
            trendUp
            href="/app/command-center"
          />
          <KpiCard
            icon={Mail}
            label="Active Campaigns"
            value={campaigns.length}
            href="/app/campaigns"
          />
          <KpiCard
            icon={FileText}
            label="Open RFPs"
            value={rfpCount}
            href="/app/rfp-studio"
          />
          <KpiCard
            icon={Activity}
            label="Recent Activity"
            value={savedCompanies.length + campaigns.length}
            href="/app/dashboard"
          />
        </div>

        {/* Two Column Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Recently Saved Companies */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">Recently Saved Companies</h2>
              <Link to="/app/command-center" className="text-sm text-blue-600 hover:text-blue-700 font-medium">
                View all
              </Link>
            </div>
            <div className="p-6">
              {savedCompanies.length === 0 ? (
                <EmptyState
                  icon={Building2}
                  title="No companies saved yet"
                  description="Start with Search to discover and save companies to your Command Center."
                  actionLabel="Go to Search"
                  actionHref="/app/search"
                />
              ) : (
                <div className="space-y-3">
                  {savedCompanies.slice(0, 5).map((company, i) => (
                    <Link
                      key={company?.company?.company_id || i}
                      to={`/app/command-center?company=${encodeURIComponent(company?.company?.company_id || '')}`}
                      className="block p-4 rounded-lg border border-slate-200 hover:border-blue-300 hover:bg-blue-50/50 transition-colors"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-slate-900 truncate">
                            {company?.company?.name || 'Unknown Company'}
                          </div>
                          <div className="text-sm text-slate-600 mt-1">
                            {company?.company?.address || company?.company?.country_code || 'Location not available'}
                          </div>
                          {company?.company?.kpis?.shipments_12m && (
                            <div className="text-xs text-slate-500 mt-2">
                              {Number(company.company.kpis.shipments_12m).toLocaleString()} shipments (12m)
                            </div>
                          )}
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Active Campaigns */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">Active Campaigns</h2>
              <Link to="/app/campaigns" className="text-sm text-blue-600 hover:text-blue-700 font-medium">
                View all
              </Link>
            </div>
            <div className="p-6">
              {campaigns.length === 0 ? (
                <EmptyState
                  icon={Mail}
                  title="No campaigns yet"
                  description="Create your first outreach campaign to engage with saved companies."
                  actionLabel="Create Campaign"
                  actionHref="/app/campaigns"
                />
              ) : (
                <div className="space-y-3">
                  {campaigns.slice(0, 5).map((campaign, i) => (
                    <Link
                      key={campaign?.id || i}
                      to={`/app/campaigns?campaign=${campaign?.id}`}
                      className="block p-4 rounded-lg border border-slate-200 hover:border-blue-300 hover:bg-blue-50/50 transition-colors"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-slate-900 truncate">
                            {campaign?.name || campaign?.title || 'Untitled Campaign'}
                          </div>
                          <div className="flex items-center gap-3 mt-2 text-xs text-slate-600">
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">
                              {campaign?.status || 'Draft'}
                            </span>
                            {campaign?.company_count && (
                              <span>{campaign.company_count} companies</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
  );
}
