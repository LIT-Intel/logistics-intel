// Phase 2 — Dashboard rebuild against the approved design bundle at
// docs/design-specs/. Replaces the prior 2,242-line layout (Phases B.16
// through B.23) with the design's 5-section structure:
//
//   1. DashboardHero       — breadcrumb · welcome · contextual stats · actions · 6-cell KPI strip
//   2. GlobeCard           — globe (trade theme + flag pins) + ranked-lane list
//   3. StrategicBriefCard  — dark-gradient AI Trade Brief (templated, real-data only)
//   4. ActivityCard        — "What Matters Now" full-width table
//   5. OpportunityCard     — "High-Opportunity Companies" (empty state until signal model lands)
//   6. TimelineCard        — "Recent Changes" vertical timeline from lit_activity_events
//
// All mock fixtures (`companiesTable`, `activityFeed`, `monthlyTrendData`)
// are removed — every cell renders real saved-company data or an honest
// "—" / empty state. No fabricated metrics. No CDN-loaded charts.
import { useEffect, useMemo, useState } from "react";
import {
  Bell,
  Filter,
  Download,
  Search,
  Send,
} from "lucide-react";

import AppLayout from "@/layout/lit/AppLayout.jsx";
import { useAuth } from "@/auth/AuthProvider";
import { getSavedCompanies } from "@/lib/api";
import { getCampaignsFromSupabase, supabase } from "@/lib/supabase";
import { canonicalizeLanes } from "@/lib/laneGlobe";

import LitKpiStrip from "@/components/ui/LitKpiStrip";
import LitHeaderIconBtn from "@/components/ui/LitHeaderIconBtn";

import GlobeCard from "@/components/dashboard/sections/GlobeCard";
import StrategicBriefCard from "@/components/dashboard/sections/StrategicBriefCard";
import ActivityCard from "@/components/dashboard/sections/ActivityCard";
import OpportunityCard from "@/components/dashboard/sections/OpportunityCard";
import TimelineCard from "@/components/dashboard/sections/TimelineCard";

export default function LITDashboard() {
  const { user, fullName } = useAuth();

  // ── Live data ──────────────────────────────────────────────────────────
  const [savedCompaniesLive, setSavedCompaniesLive] = useState([]);
  const [campaignsLive, setCampaignsLive] = useState([]);
  const [activityEvents, setActivityEvents] = useState([]);
  const [dashboardLoading, setDashboardLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function loadDashboardData() {
      try {
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
              .select("event_type, metadata, created_at")
              .eq("user_id", user.id)
              .order("created_at", { ascending: false })
              .limit(10),
          );
        } else {
          promises.push(Promise.resolve({ data: [], error: null }));
        }
        const [savedRes, campaignsRes, activityRes] = await Promise.all(promises);

        if (cancelled) return;

        setSavedCompaniesLive(Array.isArray(savedRes?.rows) ? savedRes.rows : []);
        setCampaignsLive(Array.isArray(campaignsRes) ? campaignsRes : []);
        if (activityRes && !activityRes.error) {
          setActivityEvents(activityRes.data || []);
        }
      } catch (error) {
        console.error("Dashboard load error:", error);
        if (!cancelled) {
          setSavedCompaniesLive([]);
          setCampaignsLive([]);
        }
      } finally {
        if (!cancelled) setDashboardLoading(false);
      }
    }
    loadDashboardData();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  // ── Aggregates (real data only) ────────────────────────────────────────
  const realSavedCompanies = savedCompaniesLive;

  // Aggregate `kpis.top_route_12m` across saved companies; sum
  // shipments_12m + teu_12m per lane. Empty array when no saved accounts —
  // the downstream sections render empty states honestly.
  const topAggregatedLanes = useMemo(() => {
    const map = new Map();
    for (const row of realSavedCompanies) {
      const kpis = row?.company?.kpis;
      const lane = kpis?.top_route_12m;
      if (!lane || typeof lane !== "string") continue;
      const ships = Number(kpis?.shipments_12m) || 0;
      const teu = Number(kpis?.teu_12m) || 0;
      const existing = map.get(lane) || {
        label: lane,
        count: 0,
        shipments: 0,
        teu: 0,
      };
      existing.count += 1;
      existing.shipments += ships;
      existing.teu += teu;
      map.set(lane, existing);
    }
    return Array.from(map.values()).sort(
      (a, b) =>
        b.shipments - a.shipments || b.teu - a.teu || b.count - a.count,
    );
  }, [realSavedCompanies]);

  // Canonicalize so duplicate / variant lane strings collapse to one row
  // (mirrors the CompanyDetailPanel pattern from Phase B.22). Each row
  // exposes `fromMeta`/`toMeta`/`coords`/`displayLabel`.
  const canonicalLanesDash = useMemo(() => {
    if (topAggregatedLanes.length === 0) return [];
    const { canonical } = canonicalizeLanes(
      topAggregatedLanes.slice(0, 8).map((l) => ({
        lane: l.label,
        shipments: Number(l.shipments) || 0,
        teu: Number(l.teu) || 0,
        spend: null,
      })),
    );
    return canonical;
  }, [topAggregatedLanes]);

  // GlobeLane[] for the canvas — derive from canonical rows directly so we
  // avoid the second-pass resolution failure mode from B.21.
  const globeLanes = useMemo(
    () =>
      canonicalLanesDash.slice(0, 6).map((l) => ({
        id: l.displayLabel,
        from: l.fromMeta.canonicalKey,
        to: l.toMeta.canonicalKey,
        coords: [l.fromMeta.coords, l.toMeta.coords],
        fromMeta: l.fromMeta,
        toMeta: l.toMeta,
        shipments: l.shipments,
      })),
    [canonicalLanesDash],
  );

  // ── Selected-lane state ────────────────────────────────────────────────
  const [selectedLaneId, setSelectedLaneId] = useState(null);
  useEffect(() => {
    if (!selectedLaneId) return;
    if (!canonicalLanesDash.some((l) => l.displayLabel === selectedLaneId)) {
      setSelectedLaneId(null);
    }
  }, [canonicalLanesDash, selectedLaneId]);

  function handleSelectLane(displayLabel) {
    setSelectedLaneId((prev) => (prev === displayLabel ? null : displayLabel));
  }

  // ── Responsive globe size (clamp 260–420px) ────────────────────────────
  const [globeSize, setGlobeSize] = useState(340);
  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    function update() {
      const w = window.innerWidth || 1280;
      setGlobeSize(Math.max(260, Math.min(420, Math.round(w * 0.28))));
    }
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  // ── Templated insights for the AI Trade Brief ─────────────────────────
  const tradeInsights = useMemo(() => {
    if (realSavedCompanies.length === 0) return [];
    const list = [];
    if (topAggregatedLanes.length >= 2) {
      const [a, b] = topAggregatedLanes;
      list.push(
        `Rising activity across ${a.label} and ${b.label} lanes among your saved accounts.`,
      );
    } else if (topAggregatedLanes.length === 1) {
      list.push(
        `${topAggregatedLanes[0].label} is the dominant lane in your saved set.`,
      );
    }
    const noContacts = realSavedCompanies.filter((r) => {
      const loaded = Number(r?.company?.kpis?.contacts_loaded || 0);
      const count = Number(r?.company?.kpis?.contacts_count || 0);
      return !(loaded > 0) && !(count > 0);
    }).length;
    if (noContacts > 0) {
      list.push(
        `${noContacts} of your saved ${
          noContacts === 1 ? "account has" : "accounts have"
        } no verified contacts yet — outreach pending enrichment.`,
      );
    }
    const recentActivity = realSavedCompanies.filter((r) => {
      const last = r?.company?.kpis?.last_activity;
      if (!last) return false;
      const t = new Date(last).getTime();
      if (!Number.isFinite(t)) return false;
      return Date.now() - t <= 30 * 24 * 60 * 60 * 1000;
    }).length;
    if (recentActivity > 0) {
      list.push(
        `${recentActivity} ${
          recentActivity === 1 ? "account" : "accounts"
        } shipped in the last 30 days — prioritize for outreach.`,
      );
    }
    return list;
  }, [realSavedCompanies, topAggregatedLanes]);

  // ── Saved companies ranked by recent activity ─────────────────────────
  const whatMattersRows = useMemo(() => {
    return [...realSavedCompanies]
      .sort((a, b) => {
        const at = new Date(a?.company?.kpis?.last_activity || 0).getTime() || 0;
        const bt = new Date(b?.company?.kpis?.last_activity || 0).getTime() || 0;
        return bt - at;
      })
      .slice(0, 8);
  }, [realSavedCompanies]);

  // ── KPI strip totals ───────────────────────────────────────────────────
  const totalShipments = useMemo(
    () =>
      realSavedCompanies.reduce(
        (sum, r) => sum + (Number(r?.company?.kpis?.shipments_12m) || 0),
        0,
      ),
    [realSavedCompanies],
  );
  const totalTeu = useMemo(
    () =>
      realSavedCompanies.reduce(
        (sum, r) => sum + (Number(r?.company?.kpis?.teu_12m) || 0),
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

  const kpiCells = useMemo(
    () => [
      {
        label: "SAVED COMPANIES",
        value: realSavedCompanies.length.toLocaleString(),
        trend: dashboardLoading ? null : null,
      },
      {
        label: "SHIPMENTS 12M",
        value: totalShipments > 0 ? totalShipments.toLocaleString() : "—",
      },
      {
        label: "TEU 12M",
        value: totalTeu > 0 ? formatTeu(totalTeu) : "—",
      },
      {
        // EST. SPEND requires a backend spend model; rather than synthesize
        // from TEU we surface "—" until the field lands on lit_saved_companies.
        label: "EST. SPEND",
        value: "—",
      },
      {
        label: "ACTIVE CAMPAIGNS",
        value: activeCampaigns.toLocaleString(),
        trend:
          campaignsLive.length > activeCampaigns
            ? `${campaignsLive.length - activeCampaigns} draft`
            : null,
      },
      {
        // NEW SIGNALS depends on a signal aggregator (Phase B.18 gap).
        label: "NEW SIGNALS",
        value: "—",
      },
    ],
    [
      realSavedCompanies.length,
      totalShipments,
      totalTeu,
      activeCampaigns,
      campaignsLive.length,
      dashboardLoading,
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
          {/* Breadcrumb / sync indicator */}
          <div className="flex items-center justify-between gap-3 px-6 pt-3">
            <div className="font-body flex items-center gap-1.5 text-[12px] text-slate-500">
              <span className="font-semibold text-slate-900">Dashboard</span>
              <span className="text-slate-300">/</span>
              <span>Trade Intelligence Overview</span>
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

          {/* Title row */}
          <div className="flex flex-wrap items-end gap-3.5 px-6 pb-3 pt-3.5">
            <div className="min-w-0 flex-1">
              <div className="font-display mb-1 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">
                Welcome back
              </div>
              <h1
                className="font-display m-0 truncate text-[24px] font-bold leading-tight tracking-tight text-slate-900"
                title={displayName}
              >
                {displayName}
              </h1>
              <div className="font-body mt-1 text-[12px] leading-relaxed text-slate-600">
                Real-time shipment intelligence across{" "}
                <strong className="font-mono font-semibold text-slate-900">
                  {realSavedCompanies.length.toLocaleString()}
                </strong>{" "}
                saved {realSavedCompanies.length === 1 ? "account" : "accounts"}
                {totalShipments > 0 && (
                  <>
                    {" · "}
                    <strong className="font-mono font-semibold text-slate-900">
                      {totalShipments.toLocaleString()}
                    </strong>{" "}
                    shipments tracked
                  </>
                )}
                {totalTeu > 0 && (
                  <>
                    {" · "}
                    <strong className="font-mono font-semibold text-slate-900">
                      {formatTeu(totalTeu)}
                    </strong>{" "}
                    TEU
                  </>
                )}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <LitHeaderIconBtn icon={<Bell className="h-3.5 w-3.5" />} label="Notifications" />
              <LitHeaderIconBtn icon={<Filter className="h-3.5 w-3.5" />} label="Filters" />
              <LitHeaderIconBtn icon={<Download className="h-3.5 w-3.5" />} label="Export" />
              <a
                href="/app/search"
                className="font-display inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border border-slate-200 bg-white px-3 py-1.5 text-[12px] font-semibold text-slate-900 hover:bg-slate-50"
              >
                <Search className="h-3 w-3" />
                Discover Companies
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

          {/* KPI strip */}
          <LitKpiStrip cells={kpiCells} />
        </div>

        {/* ── Body ────────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto flex max-w-[1600px] flex-col gap-4 p-4 md:p-6">
            {/* Hero row — Globe + Strategic Brief */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-stretch">
              <GlobeCard
                lanes={canonicalLanesDash}
                globeLanes={globeLanes}
                selectedLaneId={selectedLaneId}
                onSelectLane={handleSelectLane}
                globeSize={globeSize}
              />
              <StrategicBriefCard
                insights={tradeInsights}
                topLanes={topAggregatedLanes}
                savedAccountsCount={realSavedCompanies.length}
                loading={dashboardLoading}
              />
            </div>

            {/* What Matters Now */}
            <ActivityCard rows={whatMattersRows} loading={dashboardLoading} />

            {/* Two-column: Opportunities + Timeline */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
              <OpportunityCard rows={null} />
              <TimelineCard events={activityEvents} loading={dashboardLoading} />
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

function formatTeu(value) {
  const n = Number(value) || 0;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return Math.round(n).toLocaleString();
}