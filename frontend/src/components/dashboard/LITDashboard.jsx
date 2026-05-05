// Phase 3 — Dashboard rebuild against the Pulse Coach + Workspace Lanes
// pairing. Replaces the prior layout's GlobeCard + StrategicBriefCard
// hero with a paired surface: the AI Pulse Coach (LLM-driven nudges)
// drives lane-focus events into the Workspace Lanes Globe, and the
// globe drives lane-context back into the Coach. Same design language
// as the Company Profile (LitSectionCard, LitKpiStrip, LitFlag,
// font-display / font-body / font-mono).
//
// Sections:
//   1. Hero / breadcrumb / welcome / actions
//   2. Cross-page workspace KPI strip (6 cells)
//   3. Globe + Coach paired hero (2-column on lg, stacked on mobile)
//   4. Hot Accounts ("What Matters Now" table) + Activity timeline rail
//   5. Recent Enrichments (with inline Add-to-Campaign action)
//   6. Floating Pulse Coach widget for cross-page persistence
import { useEffect, useMemo, useState } from "react";
import { Bell, Download, Filter, Search, Send } from "lucide-react";

import AppLayout from "@/layout/lit/AppLayout.jsx";
import { useAuth } from "@/auth/AuthProvider";
import { getSavedCompanies } from "@/lib/api";
import { getCampaignsFromSupabase, supabase } from "@/lib/supabase";

import LitKpiStrip from "@/components/ui/LitKpiStrip";
import LitHeaderIconBtn from "@/components/ui/LitHeaderIconBtn";

import ActivityCard from "@/components/dashboard/sections/ActivityCard";
import TimelineCard from "@/components/dashboard/sections/TimelineCard";

import { PulseCoachInline } from "@/features/coach/PulseCoachWidget";
import WorkspaceLanesGlobe from "@/features/coach/WorkspaceLanesGlobe";
import RecentEnrichmentsCard from "@/components/dashboard/sections/RecentEnrichmentsCard";

// Provider + floating pill are mounted by AppLayout so Pulse Coach
// follows the user across pages. Here we only render the inline
// (large-format) version + the workspace lanes globe, which subscribe
// to the same provider state.
export default function LITDashboard() {
  const { user, fullName } = useAuth();

  const [savedCompaniesLive, setSavedCompaniesLive] = useState([]);
  const [campaignsLive, setCampaignsLive] = useState([]);
  const [activityEvents, setActivityEvents] = useState([]);
  const [pulseBriefsMtd, setPulseBriefsMtd] = useState(0);
  const [verifiedContacts, setVerifiedContacts] = useState(0);
  const [savedContactsTotal, setSavedContactsTotal] = useState(0);
  const [outreachSentMtd, setOutreachSentMtd] = useState(0);
  const [dashboardLoading, setDashboardLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function loadDashboardData() {
      try {
        const monthStartIso = (() => {
          const d = new Date();
          return new Date(
            Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1),
          ).toISOString();
        })();

        const promises = [
          getSavedCompanies().catch((err) => {
            console.error("getSavedCompanies failed:", err);
            return null;
          }),
          getCampaignsFromSupabase().catch((err) => {
            console.error("getCampaignsFromSupabase failed:", err);
            return [];
          }),
        ];
        if (user?.id) {
          promises.push(
            supabase
              .from("lit_activity_events")
              .select("id, event_type, company_id, metadata, created_at")
              .eq("user_id", user.id)
              .order("created_at", { ascending: false })
              .limit(15),
          );
          promises.push(
            supabase
              .from("lit_pulse_ai_reports")
              .select("id", { count: "exact", head: true })
              .eq("generated_by_user_id", user.id)
              .gte("created_at", monthStartIso),
          );
          promises.push(
            supabase
              .from("lit_contacts")
              .select("id, verified_by_provider, email_verified", {
                count: "exact",
              })
              .limit(0),
          );
          promises.push(
            supabase
              .from("lit_contacts")
              .select("id", { count: "exact", head: true })
              .or("verified_by_provider.eq.true,email_verified.eq.true"),
          );
          // Outreach Sent MTD reads from lit_outreach_history — that's
          // where the dispatcher writes one row per actual email delivery.
          // (lit_activity_events is generic activity, not send events.)
          promises.push(
            supabase
              .from("lit_outreach_history")
              .select("id", { count: "exact", head: true })
              .eq("user_id", user.id)
              .eq("event_type", "sent")
              .gte("occurred_at", monthStartIso),
          );
        } else {
          promises.push(Promise.resolve({ data: [], error: null }));
          promises.push(Promise.resolve({ count: 0 }));
          promises.push(Promise.resolve({ count: 0 }));
          promises.push(Promise.resolve({ count: 0 }));
          promises.push(Promise.resolve({ count: 0 }));
        }

        const [
          savedRes,
          campaignsRes,
          activityRes,
          pulseRes,
          totalContactsRes,
          verifiedRes,
          outreachRes,
        ] = await Promise.all(promises);

        if (cancelled) return;

        setSavedCompaniesLive(Array.isArray(savedRes?.rows) ? savedRes.rows : []);
        setCampaignsLive(Array.isArray(campaignsRes) ? campaignsRes : []);
        if (activityRes && !activityRes.error) {
          setActivityEvents(activityRes.data || []);
        }
        setPulseBriefsMtd(Number(pulseRes?.count) || 0);
        setSavedContactsTotal(Number(totalContactsRes?.count) || 0);
        setVerifiedContacts(Number(verifiedRes?.count) || 0);
        setOutreachSentMtd(Number(outreachRes?.count) || 0);
      } catch (err) {
        console.error("Dashboard load error:", err);
      } finally {
        if (!cancelled) setDashboardLoading(false);
      }
    }
    loadDashboardData();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const realSavedCompanies = useMemo(
    () => savedCompaniesLive.filter((r) => r?.company_id || r?.company?.id),
    [savedCompaniesLive],
  );

  const whatMattersRows = useMemo(() => {
    return [...realSavedCompanies]
      .sort((a, b) => {
        const at =
          new Date(a?.company?.kpis?.last_activity || 0).getTime() || 0;
        const bt =
          new Date(b?.company?.kpis?.last_activity || 0).getTime() || 0;
        return bt - at;
      })
      .slice(0, 8);
  }, [realSavedCompanies]);

  const totalShipments = useMemo(
    () =>
      realSavedCompanies.reduce(
        (sum, r) => sum + (Number(r?.company?.kpis?.shipments_12m) || 0),
        0,
      ),
    [realSavedCompanies],
  );

  const activeCampaigns = useMemo(
    () =>
      campaignsLive.filter((c) => {
        const status = String(c?.status || c?.state || "").toLowerCase();
        return status === "active" || status === "running" || status === "live";
      }).length,
    [campaignsLive],
  );

  const draftCampaigns = useMemo(
    () =>
      campaignsLive.filter((c) =>
        /draft/i.test(String(c?.status || c?.state || "")),
      ).length,
    [campaignsLive],
  );

  const kpiCells = useMemo(
    () => [
      {
        label: "SAVED ACCOUNTS",
        value: realSavedCompanies.length.toLocaleString(),
      },
      {
        label: "ACTIVE CAMPAIGNS",
        value: activeCampaigns.toLocaleString(),
        trend: draftCampaigns > 0 ? `${draftCampaigns} draft` : null,
      },
      {
        label: "VERIFIED CONTACTS",
        value: verifiedContacts.toLocaleString(),
        trend:
          savedContactsTotal > verifiedContacts
            ? `${savedContactsTotal.toLocaleString()} total`
            : null,
      },
      {
        label: "PULSE BRIEFS MTD",
        value: pulseBriefsMtd.toLocaleString(),
      },
      {
        label: "OUTREACH SENT MTD",
        value: outreachSentMtd > 0 ? outreachSentMtd.toLocaleString() : "—",
      },
      {
        label: "SHIPMENTS 12M",
        value: totalShipments > 0 ? formatNum(totalShipments) : "—",
      },
    ],
    [
      realSavedCompanies.length,
      activeCampaigns,
      draftCampaigns,
      verifiedContacts,
      savedContactsTotal,
      pulseBriefsMtd,
      outreachSentMtd,
      totalShipments,
    ],
  );

  const displayName =
    fullName ||
    user?.user_metadata?.full_name ||
    user?.user_metadata?.name ||
    user?.email?.split("@")[0] ||
    "there";

  return (
    <AppLayout>
      <div className="flex min-h-full flex-col bg-[#F8FAFC]">
        {/* ── Hero / header ───────────────────────────────────────────── */}
        <div className="shrink-0 border-b border-slate-200 bg-white">
          <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-3 md:px-6">
            <div className="font-body flex items-center gap-1.5 text-[12px] text-slate-500">
              <span className="font-semibold text-slate-900">Dashboard</span>
              <span className="text-slate-300">/</span>
              <span>Workspace Overview</span>
            </div>
            <div className="font-mono flex items-center gap-2 text-[11px] text-slate-400">
              <span className="inline-flex items-center gap-1">
                <span
                  className="h-1.5 w-1.5 rounded-full bg-green-500"
                  style={{ boxShadow: "0 0 5px rgba(34,197,94,0.55)" }}
                  aria-hidden
                />
                Live
              </span>
              <span className="text-slate-200">·</span>
              <span>{dashboardLoading ? "Syncing…" : "Live data"}</span>
            </div>
          </div>

          <div className="flex flex-wrap items-end gap-3 px-4 pb-3 pt-3.5 md:gap-3.5 md:px-6">
            <div className="min-w-0 flex-1">
              <div className="font-display mb-1 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">
                Welcome back
              </div>
              <h1
                className="font-display m-0 truncate text-[20px] font-bold leading-tight tracking-tight text-slate-900 md:text-[24px]"
                title={displayName}
              >
                {displayName}
              </h1>
              <div className="font-body mt-1 text-[12px] leading-relaxed text-slate-600">
                Workspace overview across{" "}
                <strong className="font-mono font-semibold text-slate-900">
                  {realSavedCompanies.length.toLocaleString()}
                </strong>{" "}
                saved {realSavedCompanies.length === 1 ? "account" : "accounts"}
                {activeCampaigns > 0 && (
                  <>
                    {" · "}
                    <strong className="font-mono font-semibold text-slate-900">
                      {activeCampaigns}
                    </strong>{" "}
                    active{" "}
                    {activeCampaigns === 1 ? "campaign" : "campaigns"}
                  </>
                )}
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-1.5">
              <LitHeaderIconBtn
                icon={<Bell className="h-3.5 w-3.5" />}
                label="Notifications"
              />
              <LitHeaderIconBtn
                icon={<Filter className="h-3.5 w-3.5" />}
                label="Filters"
              />
              <LitHeaderIconBtn
                icon={<Download className="h-3.5 w-3.5" />}
                label="Export"
              />
              <a
                href="/app/search"
                className="font-display inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border border-slate-200 bg-white px-3 py-1.5 text-[12px] font-semibold text-slate-900 hover:bg-slate-50"
              >
                <Search className="h-3 w-3" />
                Discover
              </a>
              <a
                href="/app/campaigns"
                className="font-display inline-flex items-center gap-1.5 whitespace-nowrap rounded-md bg-gradient-to-b from-blue-500 to-blue-600 px-3.5 py-1.5 text-[12px] font-semibold text-white shadow-[0_1px_3px_rgba(59,130,246,0.35),inset_0_1px_0_rgba(255,255,255,0.18)]"
              >
                <Send className="h-3 w-3" />
                New Campaign
              </a>
            </div>
          </div>

          <LitKpiStrip cells={kpiCells} />
        </div>

        {/* ── Body ────────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto flex max-w-[1600px] flex-col gap-4 p-3 md:p-6">
            {/* Globe + Coach paired hero */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)] lg:items-stretch">
              <WorkspaceLanesGlobe />
              <PulseCoachInline />
            </div>

            {/* Hot Accounts + Activity rail */}
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_360px] xl:items-start">
              <ActivityCard rows={whatMattersRows} loading={dashboardLoading} />
              <TimelineCard
                events={activityEvents}
                loading={dashboardLoading}
              />
            </div>

            {/* Recent enrichments — inline add-to-campaign */}
            <RecentEnrichmentsCard />
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

function formatNum(value) {
  const n = Number(value) || 0;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return Math.round(n).toLocaleString();
}
