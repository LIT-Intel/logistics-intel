// Phase B.16 — Dashboard overhaul.
//
// Dashboard refresh strategy:
// - Saved companies refresh weekly via a future scheduled Edge Function
//   (e.g., refresh-saved-snapshots running on a Supabase cron). Out of scope
//   for this phase.
// - Search results are NOT auto-refreshed — refreshing every searched
//   company would burn ImportYeti credits without value.
// - Manual refresh remains available on the Company profile page via the
//   "Refresh Intel" button in the hero action zone.
// - Activity-delta fields (activity_30d_current / activity_30d_previous on
//   lit_saved_companies.kpis) are populated by the same future cron.
//   Until that lands, the Activity column renders "Pending refresh".
//
// Layout (top → bottom):
//   1. Welcome header + 4 high-level KPI cards (real Supabase counts).
//   2. Trade Lane Intelligence row (3 cols on lg+):
//        - Top Active Trade Lanes list (1/4)
//        - Compact globe (2/4)
//        - AI Trade Insights card (1/4) — TEMPLATED from real aggregates,
//          NOT an LLM call.
//   3. What Matters Now table — saved companies only, scoped to user
//      via listSavedCompanies() (Supabase RLS).
//
// Logos: reuses the CompanyAvatar + getCompanyLogoUrl cascade
// (logo.dev → Clearbit → Unavatar → gradient initials) — same pattern
// as Search and Command Center. No new logo system.
//
// Honest data only: no synthetic activity %, no fabricated company
// facts, no invented news. Empty states surface honestly.

import { useEffect, useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/auth/AuthProvider";
import {
  Building2,
  Mail,
  Search,
  Users2,
  ArrowRight,
  TrendingUp,
  Sparkles,
  Package,
  ShieldCheck,
} from "lucide-react";
import { listSavedCompanies, getCrmCampaigns } from "@/lib/api";
import { getLitCampaigns } from "@/lib/litCampaigns";
import { supabase } from "@/lib/supabase";
import DashboardHeader from "@/components/dashboard/DashboardHeader";
import EnhancedKpiCard from "@/components/dashboard/EnhancedKpiCard";
import { DashboardLoadingSkeleton } from "@/components/dashboard/LoadingSkeletons";
import { useDashboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import QuickActionsButton from "@/components/dashboard/QuickActionsButton";
import { motion } from "framer-motion";
import GlobeCanvas from "@/components/GlobeCanvas";
import { laneStringToGlobeLane } from "@/lib/laneGlobe";
import { CompanyAvatar } from "@/components/CompanyAvatar";
import { getCompanyLogoUrl } from "@/lib/logo";
import { formatSafeShipmentDate } from "@/lib/dateUtils";

// ─── Card primitives ─────────────────────────────────────────────────────────

function CardShell({ children, className = "", style = {} }) {
  return (
    <div
      className={"bg-white border border-slate-200 rounded-[14px] " + className}
      style={{ boxShadow: "0 8px 30px rgba(15,23,42,0.06)", ...style }}
    >
      {children}
    </div>
  );
}

function CardHeader({ title, subtitle, right }) {
  return (
    <div className="flex items-start justify-between px-[18px] pt-4 pb-3 border-b border-slate-100">
      <div>
        <div
          className="text-sm font-bold text-slate-900"
          style={{ fontFamily: "'Space Grotesk', sans-serif" }}
        >
          {title}
        </div>
        {subtitle && (
          <div
            className="text-[11px] text-slate-400 mt-0.5"
            style={{ fontFamily: "'DM Sans', sans-serif" }}
          >
            {subtitle}
          </div>
        )}
      </div>
      {right}
    </div>
  );
}

function TH({ children, className = "" }) {
  return (
    <th
      className={"text-left pb-2 pt-1 px-3 border-b border-slate-100 " + className}
      style={{
        fontSize: 9,
        fontWeight: 700,
        letterSpacing: "0.09em",
        textTransform: "uppercase",
        color: "#94A3B8",
        fontFamily: "'Space Grotesk', sans-serif",
      }}
    >
      {children}
    </th>
  );
}

function TD({ children, mono = false, className = "" }) {
  return (
    <td
      className={"py-2.5 px-3 align-middle " + className}
      style={
        mono
          ? {
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 13,
              fontWeight: 600,
              color: "#1d4ed8",
            }
          : {
              fontFamily: "'DM Sans', sans-serif",
              fontSize: 13,
              color: "#374151",
            }
      }
    >
      {children}
    </td>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

// Phase B.16 — Activity-delta display rule. `current_30d` and
// `previous_30d` come from `lit_saved_companies.kpis.activity_30d_current`
// and `activity_30d_previous`. Until a scheduled refresh job populates
// those columns we render "Pending refresh" — never a synthetic +0%.
function activitySignal(currentRaw, previousRaw) {
  const current = currentRaw == null ? null : Number(currentRaw);
  const previous = previousRaw == null ? null : Number(previousRaw);
  if (current == null || previous == null || !Number.isFinite(current) || !Number.isFinite(previous)) {
    return { tone: "muted", label: "Pending refresh" };
  }
  if (previous === 0 && current > 0) {
    return { tone: "up", label: "New activity" };
  }
  if (previous === 0 && current === 0) {
    return { tone: "muted", label: "Flat" };
  }
  if (current > previous) {
    const pct = Math.round(((current - previous) / Math.max(1, previous)) * 100);
    return { tone: "up", label: `↑ +${pct}%` };
  }
  if (current < previous) {
    const pct = Math.round(((previous - current) / Math.max(1, previous)) * 100);
    return { tone: "down", label: `↓ ${pct}%` };
  }
  return { tone: "muted", label: "Flat" };
}

function activityTonePill(tone) {
  if (tone === "up") {
    return "bg-emerald-50 text-emerald-700 border-emerald-200";
  }
  if (tone === "down") {
    return "bg-rose-50 text-rose-700 border-rose-200";
  }
  return "bg-slate-50 text-slate-500 border-slate-200";
}

// Aggregate top-route_12m strings from saved companies into a lane list.
function aggregateLanes(savedCompanies) {
  const laneMap = new Map();
  for (const saved of savedCompanies) {
    const co = saved?.company || saved?.company_data || {};
    const topRoute =
      co?.kpis?.top_route_12m ||
      co?.top_route_12m ||
      co?.kpis?.recent_route ||
      co?.recent_route ||
      null;
    if (!topRoute || typeof topRoute !== "string") continue;

    const shipments =
      Number(co?.kpis?.shipments_12m || co?.shipments_12m || 0) || 0;
    const teu = Number(co?.kpis?.teu_12m || co?.teu_12m || 0) || 0;

    const existing = laneMap.get(topRoute) || {
      id: topRoute,
      shipments: 0,
      teu: 0,
      companies: [],
    };
    existing.shipments += shipments;
    existing.teu += teu;
    existing.companies.push(co);
    laneMap.set(topRoute, existing);
  }

  return [...laneMap.values()]
    .map((entry) => {
      const [from, to] = entry.id.split(/→|->|>/).map((s) => s.trim());
      return {
        ...entry,
        from: from || entry.id,
        to: to || "—",
      };
    })
    .sort((a, b) => b.companies.length - a.companies.length || b.shipments - a.shipments)
    .slice(0, 5);
}

// Phase B.16 — TEMPLATED, deterministic AI Trade Insights. We never call
// an external service; every line below is grounded in the real saved-
// company aggregate. If a clause's data isn't supportable, we omit it.
function buildTradeInsights(savedCompanies, lanes) {
  const total = savedCompanies.length;
  if (!total) {
    return [
      {
        id: "empty",
        text: "Save companies to unlock trade insights.",
        Icon: Sparkles,
        tone: "muted",
      },
    ];
  }

  const insights = [];

  // Lane concentration insight — only when there are at least 2 lanes
  // with companies.
  if (lanes.length >= 2) {
    const top1 = lanes[0];
    const top2 = lanes[1];
    insights.push({
      id: "lane-spread",
      text: `Activity is concentrated across ${top1.id} (${top1.companies.length} ${
        top1.companies.length === 1 ? "account" : "accounts"
      }) and ${top2.id} (${top2.companies.length} ${
        top2.companies.length === 1 ? "account" : "accounts"
      }) among your saved book.`,
      Icon: TrendingUp,
      tone: "up",
    });
  } else if (lanes.length === 1) {
    const top1 = lanes[0];
    insights.push({
      id: "lane-single",
      text: `Your saved book flows primarily over ${top1.id} (${top1.companies.length} ${
        top1.companies.length === 1 ? "account" : "accounts"
      }).`,
      Icon: TrendingUp,
      tone: "up",
    });
  }

  // No-contact insight — count companies with 0 verified contacts.
  // We don't have phantomContacts here; we fall back to "no kpis.contacts_loaded"
  // when the snapshot lacks it.
  const noContact = savedCompanies.filter((s) => {
    const loaded = Number(s?.company?.kpis?.contacts_loaded || 0);
    return !Number.isFinite(loaded) || loaded === 0;
  }).length;
  if (noContact > 0) {
    insights.push({
      id: "no-contacts",
      text: `${noContact} of your saved ${
        noContact === 1 ? "account has" : "accounts have"
      } no verified contacts yet — prospect-ready outreach pending.`,
      Icon: Users2,
      tone: "muted",
    });
  }

  // Recent-shipper insight — companies whose latest shipment is within 30 days.
  const now = Date.now();
  const recent = savedCompanies.filter((s) => {
    const last = s?.company?.kpis?.last_activity;
    if (!last) return false;
    const t = new Date(last).getTime();
    if (!Number.isFinite(t)) return false;
    return now - t <= 30 * 24 * 60 * 60 * 1000;
  }).length;
  if (recent > 0) {
    insights.push({
      id: "recent-active",
      text: `${recent} ${
        recent === 1 ? "account" : "accounts"
      } shipped in the last 30 days — prioritize for outreach.`,
      Icon: Package,
      tone: "up",
    });
  }

  // Fallback when no other clause fired.
  if (!insights.length) {
    insights.push({
      id: "saved-baseline",
      text: `${total} saved ${
        total === 1 ? "account" : "accounts"
      } — refresh snapshots to surface lane and activity intel.`,
      Icon: Sparkles,
      tone: "muted",
    });
  }

  return insights.slice(0, 3);
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function TopActiveLanesPanel({ lanes }) {
  if (!lanes.length) {
    return (
      <CardShell>
        <CardHeader
          title="Top Active Trade Lanes"
          subtitle="Aggregated across your saved accounts"
        />
        <div className="px-5 py-7 text-center">
          <Package className="h-7 w-7 text-slate-300 mx-auto mb-2" />
          <p
            className="text-sm font-medium text-slate-500"
            style={{ fontFamily: "'Space Grotesk', sans-serif" }}
          >
            No lanes yet
          </p>
          <p
            className="text-xs text-slate-400 mt-1"
            style={{ fontFamily: "'DM Sans', sans-serif" }}
          >
            Save your first company to see trade lane intelligence.
          </p>
        </div>
      </CardShell>
    );
  }
  return (
    <CardShell>
      <CardHeader
        title="Top Active Trade Lanes"
        subtitle={`Top ${lanes.length} aggregated lane${lanes.length === 1 ? "" : "s"}`}
      />
      <div className="px-2 py-1">
        {lanes.map((lane) => (
          <div
            key={lane.id}
            className="px-3 py-2.5 border-b border-slate-50 last:border-b-0"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 min-w-0">
                <span
                  className="text-[12px] font-semibold text-slate-700 truncate"
                  style={{ fontFamily: "'JetBrains Mono', monospace" }}
                >
                  {lane.from}
                </span>
                <ArrowRight className="h-2.5 w-2.5 text-slate-300 flex-shrink-0" />
                <span
                  className="text-[12px] font-semibold text-slate-700 truncate"
                  style={{ fontFamily: "'JetBrains Mono', monospace" }}
                >
                  {lane.to}
                </span>
              </div>
              <span
                className="rounded-full border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-slate-500 ml-2 flex-shrink-0"
                style={{ fontFamily: "'Space Grotesk', sans-serif" }}
              >
                {lane.companies.length} {lane.companies.length === 1 ? "co" : "cos"}
              </span>
            </div>
            <div
              className="text-[10px] text-slate-400 mt-0.5"
              style={{ fontFamily: "'JetBrains Mono', monospace" }}
            >
              {lane.shipments > 0 ? lane.shipments.toLocaleString() : "—"} ships
              {" · "}
              {lane.teu > 0 ? Math.round(lane.teu).toLocaleString() : "—"} TEU
            </div>
          </div>
        ))}
      </div>
    </CardShell>
  );
}

function GlobePanel({ lanes }) {
  // `laneStringToGlobeLane` returns null when coordinates can't be
  // resolved — we filter those out so the globe never tries to render
  // a half-defined lane.
  const globeLanes = useMemo(
    () =>
      lanes
        .map((lane) => laneStringToGlobeLane(lane.id))
        .filter((entry) => entry !== null),
    [lanes],
  );

  return (
    <CardShell
      style={{
        background:
          "radial-gradient(circle at 50% 40%, rgba(99,102,241,0.10) 0%, rgba(6,182,212,0.06) 45%, rgba(255,255,255,0) 75%), linear-gradient(180deg, #FFFFFF 0%, #F8FAFC 100%)",
        boxShadow: "0 12px 34px -20px rgba(15, 23, 42, 0.22)",
      }}
    >
      <CardHeader
        title="Global Trade Map"
        subtitle="Lanes from your saved accounts"
      />
      <div className="flex flex-col items-center justify-center px-4 py-6">
        {globeLanes.length === 0 ? (
          <div className="py-6 text-center">
            <Package className="h-8 w-8 text-slate-300 mx-auto mb-2" />
            <p
              className="text-sm font-medium text-slate-500"
              style={{ fontFamily: "'Space Grotesk', sans-serif" }}
            >
              No lane coordinates yet
            </p>
            <p
              className="text-xs text-slate-400 mt-1"
              style={{ fontFamily: "'DM Sans', sans-serif" }}
            >
              Save more companies to surface lane intel on the globe.
            </p>
          </div>
        ) : (
          <>
            <GlobeCanvas lanes={globeLanes} size={220} />
            <div
              className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-indigo-100 bg-white/80 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-indigo-600 backdrop-blur"
              style={{ fontFamily: "'Space Grotesk', sans-serif" }}
            >
              <span className="h-1 w-1 rounded-full bg-indigo-500" />
              Live route map
            </div>
          </>
        )}
      </div>
    </CardShell>
  );
}

function AiTradeInsightsPanel({ insights }) {
  return (
    <CardShell>
      <CardHeader
        title="AI Trade Insights"
        subtitle="Templated from your saved-account aggregates"
        right={
          <span
            className="inline-flex items-center gap-1 rounded-full border border-indigo-100 bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold text-indigo-700"
            style={{ fontFamily: "'Space Grotesk', sans-serif" }}
          >
            <Sparkles className="h-2.5 w-2.5" />
            Insights
          </span>
        }
      />
      <div className="px-3 py-2">
        {insights.map((ins) => {
          const Icon = ins.Icon || Sparkles;
          const tone =
            ins.tone === "up"
              ? "#10B981"
              : ins.tone === "down"
                ? "#EF4444"
                : "#6366F1";
          return (
            <div
              key={ins.id}
              className="flex gap-2.5 py-2.5 border-b border-slate-50 last:border-b-0"
            >
              <div
                className="w-6 h-6 rounded-[7px] flex items-center justify-center flex-shrink-0 mt-0.5"
                style={{
                  background: tone + "15",
                  border: `1px solid ${tone}25`,
                }}
              >
                <Icon className="w-3 h-3" style={{ color: tone }} />
              </div>
              <p
                className="flex-1 text-[12px] text-slate-700 leading-snug"
                style={{ fontFamily: "'DM Sans', sans-serif" }}
              >
                {ins.text}
              </p>
            </div>
          );
        })}
      </div>
    </CardShell>
  );
}

function WhatMattersNow({ savedCompanies }) {
  if (!savedCompanies.length) {
    return (
      <CardShell>
        <CardHeader
          title="What Matters Now"
          subtitle="Top saved accounts to act on this week"
        />
        <div className="px-6 py-10 text-center">
          <ShieldCheck className="w-8 h-8 text-slate-300 mx-auto mb-2" />
          <p
            className="text-sm font-medium text-slate-500"
            style={{ fontFamily: "'Space Grotesk', sans-serif" }}
          >
            No saved companies yet
          </p>
          <p
            className="text-xs text-slate-400 mt-1"
            style={{ fontFamily: "'DM Sans', sans-serif" }}
          >
            Open Search to find your first prospect.
          </p>
          <Link
            to="/app/search"
            className="inline-flex items-center gap-1.5 mt-3 text-xs font-semibold text-blue-600 hover:text-blue-800"
            style={{ fontFamily: "'Space Grotesk', sans-serif" }}
          >
            Open Search <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
      </CardShell>
    );
  }

  // Sort by most recent activity descending — most-actionable accounts at top.
  const ranked = [...savedCompanies].sort((a, b) => {
    const at = new Date(a?.company?.kpis?.last_activity || 0).getTime() || 0;
    const bt = new Date(b?.company?.kpis?.last_activity || 0).getTime() || 0;
    return bt - at;
  });

  return (
    <CardShell>
      <CardHeader
        title="What Matters Now"
        subtitle="Saved accounts ranked by latest activity"
        right={
          <Link
            to="/app/command-center"
            className="text-[11px] font-semibold text-blue-600 hover:text-blue-800"
            style={{ fontFamily: "'Space Grotesk', sans-serif" }}
          >
            Open Command Center →
          </Link>
        }
      />
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr>
              <TH>Company</TH>
              <TH>Shipments (12M)</TH>
              <TH>Last shipment</TH>
              <TH>Top lane</TH>
              <TH>Activity signal</TH>
              <TH>Action</TH>
            </tr>
          </thead>
          <tbody>
            {ranked.slice(0, 8).map((saved, i) => {
              const co = saved?.company || saved?.company_data || {};
              const kpis = co?.kpis || {};
              const name = co?.name || "Unknown";
              const domain = co?.domain || co?.website || null;
              const companyId = co?.company_id || co?.id || null;
              const shipments = kpis.shipments_12m || co?.shipments_12m || 0;
              // Phase B.16 — capFutureDate via formatSafeShipmentDate so a
              // midnight-UTC stamp doesn't render as tomorrow.
              const lastShipmentLabel = formatSafeShipmentDate(
                kpis.last_activity ||
                  co?.most_recent_shipment_date ||
                  co?.last_shipment_date ||
                  null,
                "—",
              );
              const topLane =
                kpis.top_route_12m || kpis.recent_route || co?.top_route_12m || "—";
              const sig = activitySignal(
                kpis.activity_30d_current,
                kpis.activity_30d_previous,
              );
              return (
                <tr
                  key={companyId || i}
                  className="border-b border-slate-50 hover:bg-slate-50 transition-colors"
                >
                  <TD>
                    <div className="flex items-center gap-2.5 min-w-0">
                      <CompanyAvatar
                        name={name}
                        logoUrl={getCompanyLogoUrl(domain) || undefined}
                        domain={domain || undefined}
                        size="sm"
                      />
                      <span
                        className="font-semibold text-slate-900 text-[13px] truncate max-w-[160px]"
                        style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                      >
                        {name}
                      </span>
                    </div>
                  </TD>
                  <TD mono>
                    {shipments ? Number(shipments).toLocaleString() : "—"}
                  </TD>
                  <TD>
                    <span className="text-[12px] text-slate-500">
                      {lastShipmentLabel}
                    </span>
                  </TD>
                  <TD>
                    <span
                      className="text-[12px] text-slate-500 truncate max-w-[180px] block"
                      style={{ fontFamily: "'JetBrains Mono', monospace" }}
                    >
                      {topLane || "—"}
                    </span>
                  </TD>
                  <TD>
                    <span
                      className={
                        "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold " +
                        activityTonePill(sig.tone)
                      }
                      style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                    >
                      {sig.label}
                    </span>
                  </TD>
                  <TD>
                    <div className="flex items-center gap-1.5">
                      <Link
                        to={
                          companyId
                            ? `/app/command-center?company=${encodeURIComponent(
                                String(companyId),
                              )}`
                            : "/app/command-center"
                        }
                        className="text-[11px] font-semibold bg-blue-50 text-blue-600 border border-blue-200 rounded-md px-2.5 py-1 hover:bg-blue-100 transition-colors"
                        style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                      >
                        View profile
                      </Link>
                      <Link
                        to="/app/campaigns"
                        className="text-[11px] font-semibold text-white rounded-md px-2.5 py-1 transition-colors"
                        style={{
                          background:
                            "linear-gradient(180deg,#3B82F6,#2563EB)",
                          fontFamily: "'Space Grotesk', sans-serif",
                        }}
                      >
                        Add to campaign
                      </Link>
                    </div>
                  </TD>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </CardShell>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function Dashboard() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [savedCompanies, setSavedCompanies] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [searchCount, setSearchCount] = useState(0);
  const [contactsCount, setContactsCount] = useState(0);

  useDashboardShortcuts();

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      setLoading(true);
      try {
        const now = new Date();
        const monthStart = new Date(
          now.getFullYear(),
          now.getMonth(),
          1,
        ).toISOString();

        // Resolve org id (best-effort) for the saved-contacts KPI count.
        // listSavedCompanies is RLS-scoped to the user automatically.
        const orgId =
          user?.user_metadata?.organization_id ||
          user?.user_metadata?.org_id ||
          user?.app_metadata?.organization_id ||
          user?.app_metadata?.org_id ||
          null;

        const buildContactsCountQuery = () => {
          let q = supabase
            .from("lit_contacts")
            .select("id", { count: "exact", head: true });
          if (orgId) q = q.eq("organization_id", orgId);
          return q;
        };

        // Phase B.16 — listSavedCompanies is the canonical scoped read
        // for saved companies. It hits Supabase via RLS so only the
        // logged-in user's rows return. listSavedCompanies returns a
        // CommandCenterRecord[]; the existing dashboard expected
        // { rows: [...] } so we wrap consistently.
        const [
          companiesRes,
          campaignsRes,
          searchRes,
          contactsCountRes,
        ] = await Promise.allSettled([
          listSavedCompanies(),
          getLitCampaigns().catch(() => getCrmCampaigns()),
          supabase
            .from("lit_activity_events")
            .select("id", { count: "exact", head: true })
            .eq("user_id", user?.id)
            .eq("event_type", "search")
            .gte("created_at", monthStart),
          buildContactsCountQuery(),
        ]);

        if (!mounted) return;

        if (companiesRes.status === "fulfilled") {
          const records = Array.isArray(companiesRes.value)
            ? companiesRes.value
            : Array.isArray(companiesRes.value?.rows)
              ? companiesRes.value.rows
              : [];
          setSavedCompanies(records);
        }
        if (campaignsRes.status === "fulfilled") {
          const rows = Array.isArray(campaignsRes.value?.rows)
            ? campaignsRes.value.rows
            : Array.isArray(campaignsRes.value)
              ? campaignsRes.value
              : [];
          setCampaigns(rows);
        }
        if (searchRes.status === "fulfilled") {
          setSearchCount(searchRes.value?.count || 0);
        }
        if (
          contactsCountRes.status === "fulfilled" &&
          !contactsCountRes.value?.error
        ) {
          setContactsCount(contactsCountRes.value?.count || 0);
        } else if (orgId) {
          // Org-scoped count failed (likely because `organization_id`
          // is not a column on `lit_contacts` yet). Retry unscoped so
          // the KPI tile reflects real data, not zero.
          try {
            const fallback = await supabase
              .from("lit_contacts")
              .select("id", { count: "exact", head: true });
            if (mounted && !fallback.error) {
              setContactsCount(fallback.count || 0);
            }
          } catch {
            /* silent — empty count is honest when the table is unreachable */
          }
        }
      } catch (err) {
        console.error("Dashboard load error:", err);
      } finally {
        if (mounted) setLoading(false);
      }
    };
    load();
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Phase B.16 — Rules of Hooks: ALL useMemo / useState / useEffect
  // hooks MUST run BEFORE the `if (loading) return ...` early exit
  // below, otherwise React reports error #300 ("Rendered more hooks
  // than during the previous render") on the load → loaded transition.
  // The Phase B.13.1 fix on Company.jsx hit the same trap; we apply
  // the same pattern here.
  const lanes = useMemo(
    () => aggregateLanes(savedCompanies),
    [savedCompanies],
  );

  const insights = useMemo(
    () => buildTradeInsights(savedCompanies, lanes),
    [savedCompanies, lanes],
  );

  if (loading) {
    return <DashboardLoadingSkeleton />;
  }

  const activeCampaigns = campaigns.filter(
    (c) => c?.status === "active" || c?.status === "live",
  ).length;

  const displayName =
    user?.user_metadata?.full_name ||
    user?.user_metadata?.name ||
    user?.email?.split("@")[0];

  const hasSaved = savedCompanies.length > 0;

  // Phase B.16 — KPI cards. New users (0 saved) see "0" with a helper
  // pointing to where they can act, NOT a fabricated value.
  const KPI_CARDS = [
    {
      icon: Building2,
      label: "Saved Companies",
      value: savedCompanies.length,
      sub: hasSaved
        ? "In Command Center"
        : "Save companies to start populating your dashboard.",
      iconColor: "#3B82F6",
      href: "/app/command-center",
      live: hasSaved,
      delay: 0,
    },
    {
      icon: Mail,
      label: "Active Campaigns",
      value: activeCampaigns,
      sub: campaigns.length > 0 ? `${campaigns.length} total` : "No campaigns yet",
      iconColor: "#10B981",
      href: "/app/campaigns",
      delay: 0.05,
    },
    {
      icon: Users2,
      label: "Saved Contacts",
      value: contactsCount,
      sub:
        contactsCount > 0
          ? "Verified decision makers"
          : "Enrich a company to save contacts.",
      iconColor: "#F59E0B",
      href: "/app/command-center",
      delay: 0.1,
    },
    {
      icon: Search,
      label: "Searches Used",
      value: searchCount,
      sub: "This month",
      iconColor: "#8B5CF6",
      href: "/app/search",
      delay: 0.15,
    },
  ];

  return (
    <>
      <div
        className="px-4 sm:px-6 py-5 space-y-5 md:space-y-6"
        style={{
          background:
            "radial-gradient(circle at 8% -8%, rgba(99,102,241,0.08) 0%, rgba(99,102,241,0) 28%), radial-gradient(circle at 100% 0%, rgba(6,182,212,0.08) 0%, rgba(6,182,212,0) 32%), #F8FAFC",
          minHeight: "100%",
        }}
      >
        <DashboardHeader userName={displayName} />

        {/* KPI row — 4 high-level KPIs. Real Supabase counts; no mocks. */}
        <div
          className="rounded-2xl border border-slate-200 p-3 md:p-4"
          style={{
            background:
              "linear-gradient(180deg, rgba(255,255,255,0.9) 0%, rgba(248,250,252,0.9) 100%)",
            boxShadow: "0 10px 30px -22px rgba(15, 23, 42, 0.24)",
          }}
        >
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {KPI_CARDS.map((card) => (
              <EnhancedKpiCard key={card.label} {...card} />
            ))}
          </div>
        </div>

        {/* Phase B.16 — Trade Lane Intelligence row. 3-column on lg+,
            stacked on mobile. Left 1/4: Top Active Trade Lanes list.
            Center 2/4: compact globe. Right 1/4: AI Trade Insights. */}
        {hasSaved ? (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: 0.1 }}
            className="grid grid-cols-1 lg:grid-cols-4 gap-4 items-start"
          >
            <div className="lg:col-span-1">
              <TopActiveLanesPanel lanes={lanes} />
            </div>
            <div className="lg:col-span-2">
              <GlobePanel lanes={lanes} />
            </div>
            <div className="lg:col-span-1">
              <AiTradeInsightsPanel insights={insights} />
            </div>
          </motion.div>
        ) : (
          <CardShell>
            <CardHeader
              title="Trade Lane Intelligence"
              subtitle="Aggregated lanes, globe, and templated insights"
            />
            <div className="px-6 py-10 text-center">
              <Package className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <p
                className="text-sm font-medium text-slate-500"
                style={{ fontFamily: "'Space Grotesk', sans-serif" }}
              >
                Save your first company to see trade lane intelligence.
              </p>
              <Link
                to="/app/search"
                className="inline-flex items-center gap-1.5 mt-3 text-xs font-semibold text-blue-600 hover:text-blue-800"
                style={{ fontFamily: "'Space Grotesk', sans-serif" }}
              >
                Open Search <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
          </CardShell>
        )}

        {/* Phase B.16 — What Matters Now: saved companies only, scoped
            to the logged-in user via listSavedCompanies (RLS). */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.2 }}
        >
          <WhatMattersNow savedCompanies={savedCompanies} />
        </motion.div>
      </div>

      <QuickActionsButton />
    </>
  );
}