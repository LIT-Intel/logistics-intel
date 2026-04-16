import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/auth/AuthProvider";
import { Building2, Mail, FileText, Search, ExternalLink, Users2 } from "lucide-react";
import { getSavedCompanies, getCrmCampaigns } from "@/lib/api";
import { getLitCampaigns } from "@/lib/litCampaigns";
import { supabase } from "@/lib/supabase";
import DashboardHeader from "@/components/dashboard/DashboardHeader";
import EnhancedKpiCard from "@/components/dashboard/EnhancedKpiCard";
import ActivityFeed from "@/components/dashboard/ActivityFeed";
import InsightsPanel from "@/components/dashboard/InsightsPanel";
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
  const [activities, setActivities] = useState([]);
  const [searchCount, setSearchCount] = useState(0);

  useDashboardShortcuts();

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      setLoading(true);
      try {
        const [companiesRes, campaignsRes, rfpsRes, activitiesRes, searchRes] = await Promise.allSettled([
          getSavedCompanies(),
          getLitCampaigns().catch(() => getCrmCampaigns()),
          supabase.from('lit_rfps').select('id').eq('status', 'active'),
          supabase.from('lit_activity_events').select('*').order('created_at', { ascending: false }).limit(10),
          supabase.from('search_queries').select('id', { count: 'exact', head: true }).eq('user_id', user?.id),
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
          if (rfpsRes.status === 'fulfilled') {
            setRfpCount(rfpsRes.value?.data?.length || 0);
          }
          if (searchRes.status === 'fulfilled') {
            setSearchCount(searchRes.value?.count || 0);
          }
          if (activitiesRes.status === 'fulfilled') {
            const rawActivities = activitiesRes.value?.data || [];
            if (rawActivities.length > 0) {
              const formattedActivities = rawActivities.map(act => ({
                id: act.id,
                type: act.event_type === 'company_saved' ? 'company_saved' :
                      act.event_type === 'contact_enriched' ? 'contact_added' :
                      act.event_type === 'campaign_created' ? 'campaign_sent' :
                      act.event_type === 'rfp_generated' ? 'rfp_generated' : 'opportunity',
                title: act.event_type === 'company_saved' ? 'Company Saved' :
                       act.event_type === 'contact_enriched' ? 'Contact Added' :
                       act.event_type === 'campaign_created' ? 'Campaign Created' :
                       act.event_type === 'rfp_generated' ? 'RFP Generated' : 'Activity',
                description: act.metadata?.description || act.event_type,
                timestamp: new Date(act.created_at),
                link: act.event_type === 'company_saved' ? '/app/command-center' :
                      act.event_type === 'contact_enriched' ? '/app/command-center' :
                      act.event_type === 'campaign_created' ? '/app/campaigns' :
                      act.event_type === 'rfp_generated' ? '/app/rfp-studio' : '/app/dashboard',
              }));
              setActivities(formattedActivities);
            }
          }
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

  const displayName =
    user?.user_metadata?.full_name ||
    user?.user_metadata?.name ||
    user?.email?.split('@')[0];

  return (
    <>
      <div className="px-4 sm:px-6 py-6 space-y-6">
        <DashboardHeader userName={displayName} />

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
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
            icon={Users2}
            label="Saved Contacts"
            value={contacts?.length || 0}
            trend={contacts && contacts.length > 0 ? `${contacts.length} total` : undefined}
            href="/app/search"
            subtitle={contacts && contacts.length > 0 ? `${contacts.length} enriched contacts` : "Save contacts from search"}
            delay={0.2}
          />
          <EnhancedKpiCard
            icon={Search}
            label="Searches Used"
            value={searchCount}
            trend={searchCount > 0 ? `${searchCount} total` : undefined}
            href="/app/search"
            subtitle="All-time searches"
            delay={0.3}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <PerformanceChart />
            <InsightsPanel
              totalCompanies={savedCompanies.length}
              emailsSent={campaigns.reduce((sum, c) => sum + (c?.emails_sent || 0), 0)}
              rfpsGenerated={rfpCount}
            />
          </div>

          <div className="space-y-6">
            <ActivityFeed activities={activities} />

            {savedCompanies.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.4 }}
                className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden"
              >
                <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-slate-900">Recently Saved</h2>
                  <Link to="/app/command-center" className="text-sm text-blue-600 hover:text-blue-700 font-medium">
                    View all →
                  </Link>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-100">
                        <th className="text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-400">Company</th>
                        <th className="text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-400 hidden sm:table-cell">Location</th>
                        <th className="text-right px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-400 hidden md:table-cell">Shipments</th>
                        <th className="text-right px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-400">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {savedCompanies.slice(0, 8).map((saved, i) => {
                        const company = saved?.company || saved?.company_data || {};
                        const name = company?.name || saved?.company_name || 'Unknown Company';
                        const location = [company?.city, company?.state, company?.country_code].filter(Boolean).join(', ') || '—';
                        const shipments = company?.shipments_12m ? Number(company.shipments_12m).toLocaleString() : '—';
                        const website = company?.website || company?.domain;
                        const companyId = saved?.company_id || saved?.id;
                        return (
                          <tr key={companyId || i} className="hover:bg-slate-50 transition-colors">
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2.5">
                                <div className="w-7 h-7 rounded-md bg-gradient-to-br from-blue-50 to-blue-100 flex items-center justify-center text-blue-600 flex-shrink-0">
                                  <Building2 className="w-3.5 h-3.5" />
                                </div>
                                <span className="font-medium text-slate-900 truncate max-w-[140px]">{name}</span>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-slate-500 hidden sm:table-cell">{location}</td>
                            <td className="px-4 py-3 text-right text-slate-500 hidden md:table-cell">{shipments}</td>
                            <td className="px-4 py-3 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <Link
                                  to={`/app/command-center?company=${encodeURIComponent(companyId || '')}`}
                                  className="text-xs font-medium text-blue-600 hover:text-blue-800 whitespace-nowrap"
                                >
                                  View
                                </Link>
                                {website && (
                                  <a
                                    href={website.startsWith('http') ? website : `https://${website}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-slate-400 hover:text-slate-600"
                                  >
                                    <ExternalLink className="w-3.5 h-3.5" />
                                  </a>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
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
