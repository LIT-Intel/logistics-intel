// Dashboard — Workspace Overview (CEO overhaul 2026-08-13).
//
//   1. Hero / breadcrumb / welcome / actions
//   2. Workspace KPI row — Admin-deck treatment: colored icon chips,
//      bold numbers, subtle context tails. One row on xl, 2-up phones.
//   3. Workspace trade lanes hero — interactive LaneMap (light variant,
//      origin-region lane colors, volume-weighted lines, selected-lane
//      focus). Full-width now that the big Coach panel is gone; the
//      floating Pulse Coach pill (mounted by AppLayout) is the single
//      coach surface and hovers over the map.
//   4. Hot Accounts ("What Matters Now" table)
//   5. Recent Enrichments (inline Add-to-Campaign action)
//
// Removed per CEO: the large dark "PULSE COACH" panel (duplicate of the
// floating coach), the "Arriving this week" card, and the "Recent
// Changes" activity card (overbloated).
//
// Data scoping (the "Evan bug"): every KPI + the saved-accounts table
// now reads WORKSPACE-wide via frontend/src/api/workspace.ts —
// RLS-scoped saved companies (own + org when saved sharing is on) and
// the get_workspace_kpis RPC. Org members see org numbers; solo users
// see exactly what they saw before.
import { useEffect, useMemo, useState } from "react";
import {
  Bookmark,
  Mail,
  Search,
  Send,
  Ship,
  Sparkles,
  Users,
} from "lucide-react";

import AppLayout from "@/layout/lit/AppLayout.jsx";
import { useAuth } from "@/auth/AuthProvider";
import { useEntitlements } from "@/hooks/useEntitlements";
import { useAdminScope } from "@/hooks/useAdminScope";
import { getCampaignsFromSupabase } from "@/lib/supabase";
import {
  getWorkspaceKpis,
  getWorkspaceSavedCompanies,
} from "@/api/workspace";


import ActivityCard from "@/components/dashboard/sections/ActivityCard";
import WorkspaceLanesGlobe from "@/features/coach/WorkspaceLanesGlobe";
import RecentEnrichmentsCard from "@/components/dashboard/sections/RecentEnrichmentsCard";

// ── KPI row — AdminCommandDeck idiom (colored icon chip + bold number).
const KPI_TONES = {
  blue: "bg-blue-50 text-blue-600",
  cyan: "bg-cyan-50 text-cyan-600",
  emerald: "bg-emerald-50 text-emerald-600",
  violet: "bg-violet-50 text-violet-600",
  amber: "bg-amber-50 text-amber-600",
  rose: "bg-rose-50 text-rose-600",
  slate: "bg-slate-100 text-slate-500",
};

function KpiChip({ label, value, hint, icon: Icon, tone = "blue" }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-3 py-2.5 shadow-sm">
      <span
        className={[
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
          KPI_TONES[tone] || KPI_TONES.blue,
        ].join(" ")}
      >
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <div className="font-mono truncate text-[18px] font-bold leading-none tracking-tight text-slate-900">
          {value}
        </div>
        <div className="font-display mt-1 truncate text-[9.5px] font-semibold uppercase tracking-[0.07em] text-slate-400">
          {label}
        </div>
        {hint ? (
          <div className="font-body mt-0.5 truncate text-[10px] text-slate-400">
            {hint}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default function LITDashboard() {
  const { user, fullName } = useAuth();
  const { entitlements } = useEntitlements();
  const { scope: adminScope } = useAdminScope();
  const orgId = entitlements?.org_id || null;

  const [savedCompaniesLive, setSavedCompaniesLive] = useState([]);
  const [campaignsLive, setCampaignsLive] = useState([]);
  const [workspaceKpis, setWorkspaceKpis] = useState(null);
  const [dashboardLoading, setDashboardLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function loadDashboardData() {
      try {
        const [savedRes, campaignsRes, kpisRes] = await Promise.all([
          getWorkspaceSavedCompanies().catch((err) => {
            console.error("getWorkspaceSavedCompanies failed:", err);
            return null;
          }),
          getCampaignsFromSupabase({ orgId, adminScope }).catch((err) => {
            console.error("getCampaignsFromSupabase failed:", err);
            return [];
          }),
          user?.id
            ? getWorkspaceKpis().catch((err) => {
                console.error("getWorkspaceKpis failed:", err);
                return null;
              })
            : Promise.resolve(null),
        ]);

        if (cancelled) return;

        setSavedCompaniesLive(Array.isArray(savedRes?.rows) ? savedRes.rows : []);
        setCampaignsLive(Array.isArray(campaignsRes) ? campaignsRes : []);
        setWorkspaceKpis(kpisRes);
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
  }, [user?.id, orgId, adminScope]);

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

  const savedContactsTotal = Number(workspaceKpis?.contacts) || 0;
  const verifiedContacts = Number(workspaceKpis?.verified_emails) || 0;
  const pulseBriefsMtd = Number(workspaceKpis?.pulse_briefs_mtd) || 0;
  const outreachSentMtd = Number(workspaceKpis?.outreach_sent_mtd) || 0;

  const kpiCells = useMemo(
    () => [
      {
        label: "Saved accounts",
        value: realSavedCompanies.length.toLocaleString(),
        icon: Bookmark,
        tone: "blue",
      },
      {
        label: "Active campaigns",
        value: activeCampaigns.toLocaleString(),
        hint: draftCampaigns > 0 ? `${draftCampaigns} in draft` : null,
        icon: Send,
        tone: "violet",
      },
      {
        label: "Contacts discovered",
        value: savedContactsTotal.toLocaleString(),
        hint:
          savedContactsTotal > 0
            ? `${verifiedContacts.toLocaleString()} verified`
            : null,
        icon: Users,
        tone: "cyan",
      },
      {
        label: "Pulse briefs MTD",
        value: pulseBriefsMtd.toLocaleString(),
        icon: Sparkles,
        tone: "amber",
      },
      {
        label: "Outreach sent MTD",
        value: outreachSentMtd > 0 ? outreachSentMtd.toLocaleString() : "—",
        icon: Mail,
        tone: "emerald",
      },
      {
        label: "Shipments 12m",
        value: totalShipments > 0 ? formatNum(totalShipments) : "—",
        icon: Ship,
        tone: "rose",
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

          {/* KPI row — colored icon chips, one row on xl, 2-up phones. */}
          <div className="grid grid-cols-2 gap-2 border-t border-slate-100 bg-[#FAFBFC] px-4 py-3 sm:grid-cols-3 md:px-6 xl:grid-cols-6">
            {kpiCells.map((cell) => (
              <KpiChip key={cell.label} {...cell} />
            ))}
          </div>
        </div>

        {/* ── Body ────────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto flex max-w-[1600px] flex-col gap-4 p-3 md:p-6">
            {/* Workspace trade lanes — full-width interactive map hero.
                The floating Pulse Coach pill (AppLayout) hovers over it
                as the single coach surface. */}
            <WorkspaceLanesGlobe />

            {/* Hot Accounts */}
            <ActivityCard rows={whatMattersRows} loading={dashboardLoading} />

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
