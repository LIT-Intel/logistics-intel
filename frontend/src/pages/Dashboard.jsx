import React, { useEffect, useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/auth/AuthProvider";
import {
  Building2, Mail, FileText, Search,
  Package, Zap, Users2,
  ArrowRight, TrendingUp,
  Send, Clock, PlusCircle, AlertCircle,
  ExternalLink, SlidersHorizontal,
} from "lucide-react";
import { getSavedCompanies, getCrmCampaigns } from "@/lib/api";
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

const ACTIVITY_ICON_MAP = {
  "trending-up":  TrendingUp,
  "send":         Send,
  "plus-circle":  PlusCircle,
  "alert-circle": AlertCircle,
  "file-text":    FileText,
  "ship":         Package,
};

const ACTIVITY_COLORS = {
  company_saved:    "#6366F1",
  contact_added:    "#F59E0B",
  campaign_sent:    "#22C55E",
  rfp_generated:    "#8B5CF6",
  opportunity:      "#3B82F6",
};

function companyInitialColor(name = "") {
  const palette = ["#3B82F6","#6366F1","#10B981","#F59E0B","#EF4444","#8B5CF6","#06B6D4","#EC4899"];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return palette[Math.abs(hash) % palette.length];
}

function formatCompactNumber(n) {
  if (!n || isNaN(n)) return "—";
  const num = Number(n);
  if (num >= 1_000_000) return "$" + (num / 1_000_000).toFixed(1) + "M";
  if (num >= 1_000) return num.toLocaleString();
  return String(num);
}

// Deterministic lane-key normalizer. Unifies arrow variants (→, ->, >,
// stand-alone "to"), trims whitespace around each leg, uppercases, and
// rejoins with a canonical separator so equal lanes compare equal
// regardless of which arrow style upstream returned. Not fuzzy — only
// collapses known separator variants.
// Examples:
//   "China → USA"   → "CHINA > USA"
//   "china -> usa"  → "CHINA > USA"
//   "China to USA"  → "CHINA > USA"
function normalizeLaneKey(lane) {
  if (!lane || typeof lane !== "string") return "";
  return lane
    .replace(/→|->|>|\bto\b/gi, ">")
    .split(">")
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" > ")
    .toUpperCase();
}

// ─── Sub-components ──────────────────────────────────────────────────────────

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

function TH({ children }) {
  return (
    <th
      className="text-left pb-2 pt-1 px-1.5 border-b border-slate-100"
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
      className={"py-2.5 px-1.5 align-middle " + className}
      style={
        mono
          ? { fontFamily: "'JetBrains Mono', monospace", fontSize: 13, fontWeight: 600, color: "#1d4ed8" }
          : { fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: "#374151" }
      }
    >
      {children}
    </td>
  );
}

function SavedContacts({ contacts }) {
  if (!contacts.length) {
    return (
      <CardShell>
        <CardHeader
          title="Saved Contacts"
          subtitle="Enriched contacts from your saved companies"
          right={<span className="lit-live-pill"><span className="lit-live-dot" />Live</span>}
        />
        <div className="px-6 py-10 text-center">
          <Users2 className="w-8 h-8 text-slate-300 mx-auto mb-2" />
          <p className="text-sm font-medium text-slate-500" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            No enriched contacts yet
          </p>
          <p className="text-xs text-slate-400 mt-1" style={{ fontFamily: "'DM Sans', sans-serif" }}>
            Open a company in Command Center and enrich their contacts
          </p>
          <Link
            to="/app/command-center"
            className="inline-flex items-center gap-1.5 mt-3 text-xs font-semibold text-blue-600 hover:text-blue-800"
            style={{ fontFamily: "'Space Grotesk', sans-serif" }}
          >
            Go to Command Center <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
      </CardShell>
    );
  }

  return (
    <CardShell>
      <CardHeader
        title="Saved Contacts"
        subtitle="Enriched contacts from your saved companies"
        right={<span className="lit-live-pill"><span className="lit-live-dot" />Live</span>}
      />
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr>
              <TH>Name</TH>
              <TH>Title</TH>
              <TH>Company</TH>
              <TH>Action</TH>
            </tr>
          </thead>
          <tbody>
            {contacts.slice(0, 8).map((contact, i) => {
              const name = contact?.full_name || "Unknown";
              const title = contact?.title || "—";
              const company = contact?.company_name || "—";
              const initColor = companyInitialColor(name);

              return (
                <tr
                  key={contact?.id || i}
                  className="border-b border-slate-50 hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  <TD>
                    <div className="flex items-center gap-2">
                      <div
                        className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0"
                        style={{ background: initColor }}
                      >
                        {name[0]}
                      </div>
                      <span className="font-semibold text-slate-900 text-[13px] truncate max-w-[140px]"
                        style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                        {name}
                      </span>
                    </div>
                  </TD>
                  <TD>
                    <span className="text-xs text-slate-500 truncate max-w-[130px] block">{title}</span>
                  </TD>
                  <TD>
                    <span className="text-xs text-slate-500 truncate max-w-[120px] block">{company}</span>
                  </TD>
                  <TD>
                    <Link
                      to="/app/command-center"
                      className="text-[11px] font-semibold bg-blue-50 text-blue-600 border border-blue-200 rounded-md px-2.5 py-1 hover:bg-blue-100 transition-colors"
                      style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                    >
                      View
                    </Link>
                  </TD>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {contacts.length > 8 && (
        <div className="px-4 py-2.5 border-t border-slate-100">
          <Link
            to="/app/command-center"
            className="text-xs font-semibold text-blue-600 hover:text-blue-800"
            style={{ fontFamily: "'Space Grotesk', sans-serif" }}
          >
            View all {contacts.length} contacts →
          </Link>
        </div>
      )}
    </CardShell>
  );
}

function HighOpportunityPanel({ savedCompanies, campaigns, selectedLane, onClearLane }) {
  // Derive "not yet engaged" from saved companies that have no associated campaign
  const engagedNames = new Set(
    campaigns.map(c => (c?.company_name || c?.name || "").toLowerCase()).filter(Boolean)
  );
  const notEngaged = savedCompanies.filter(s => {
    const name = (s?.company?.name || s?.company_name || "").toLowerCase();
    return name && !engagedNames.has(name);
  });

  // Lane filter — when a lane is selected in TradeLanesPanel, only show
  // companies whose top_route_12m (primary) or recent_route (fallback)
  // matches. Both sides are passed through normalizeLaneKey so arrow-style
  // variants ("China → USA" / "china -> usa" / "China to USA") resolve to
  // the same canonical key before comparison. Deterministic, not fuzzy.
  // Zero-risk for callers: when selectedLane is null, filter is a
  // pass-through.
  const selectedLaneKey = normalizeLaneKey(selectedLane);
  const filtered = selectedLaneKey
    ? notEngaged.filter((s) => {
        const co = s?.company || s?.company_data || {};
        const lane = co?.kpis?.top_route_12m || co?.kpis?.recent_route || null;
        return normalizeLaneKey(lane) === selectedLaneKey;
      })
    : notEngaged;

  return (
    <CardShell>
      <CardHeader
        title="High-Opportunity Companies"
        subtitle="High volume · Recent activity · Not yet engaged"
        right={
          <button
            className="inline-flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-md px-2.5 py-1 text-[11px] font-semibold text-slate-500 hover:bg-slate-100 transition-colors"
            style={{ fontFamily: "'Space Grotesk', sans-serif" }}
          >
            <SlidersHorizontal className="w-3 h-3" /> Filter
          </button>
        }
      />
      {selectedLane && (
        <div
          className="flex items-center justify-between gap-3 border-b border-blue-100 bg-blue-50/60 px-4 py-2"
          style={{ fontFamily: "'Space Grotesk', sans-serif" }}
        >
          <span className="text-[11px] font-semibold text-blue-700">
            Filtered to {selectedLane}
            {filtered.length > 0 ? ` · ${filtered.length} ${filtered.length === 1 ? "match" : "matches"}` : " · no matches"}
          </span>
          <button
            type="button"
            onClick={onClearLane}
            className="text-[11px] font-semibold text-slate-500 hover:text-slate-700"
          >
            Clear
          </button>
        </div>
      )}
      {filtered.length === 0 ? (
        <div className="px-6 py-8 text-center">
          <Zap className="w-7 h-7 text-slate-300 mx-auto mb-2" />
          <p className="text-sm font-medium text-slate-500" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            All saved companies are engaged
          </p>
          <p className="text-xs text-slate-400 mt-1" style={{ fontFamily: "'DM Sans', sans-serif" }}>
            Discover more shippers to build your pipeline
          </p>
          <Link
            to="/app/search"
            className="inline-flex items-center gap-1.5 mt-3 text-xs font-semibold text-blue-600 hover:text-blue-800"
            style={{ fontFamily: "'Space Grotesk', sans-serif" }}
          >
            Discover Companies <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <TH>Company</TH>
                <TH>Shipments</TH>
                <TH>TEU</TH>
                <TH>Action</TH>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, 5).map((saved, i) => {
                const co = saved?.company || saved?.company_data || {};
                const name = co?.name || saved?.company_name || "Unknown";
                const shipments = co?.shipments_12m;
                const teu = co?.teu_12m;
                const companyId = saved?.company_id || saved?.id;
                const initColor = companyInitialColor(name);

                return (
                  <tr
                    key={companyId || i}
                    className="border-b border-slate-50 hover:bg-slate-50 transition-colors cursor-pointer"
                  >
                    <TD>
                      <div className="flex items-center gap-2">
                        <div
                          className="w-6 h-6 rounded-[6px] flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0"
                          style={{ background: initColor }}
                        >
                          {name[0]}
                        </div>
                        <span className="font-semibold text-slate-900 text-[13px] truncate max-w-[150px]"
                          style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                          {name}
                        </span>
                      </div>
                    </TD>
                    <TD mono>{shipments ? Number(shipments).toLocaleString() : "—"}</TD>
                    <TD mono>{teu ? Number(teu).toLocaleString() : "—"}</TD>
                    <TD>
                      <div className="flex items-center gap-1.5">
                        <Link
                          to={`/app/command-center?company=${encodeURIComponent(companyId || "")}`}
                          className="text-[11px] font-semibold bg-blue-50 text-blue-600 border border-blue-200 rounded-md px-2.5 py-1 hover:bg-blue-100 transition-colors"
                          style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                        >
                          View
                        </Link>
                        <Link
                          to="/app/campaigns"
                          className="text-[11px] font-semibold text-white rounded-md px-2.5 py-1 transition-colors"
                          style={{
                            background: "linear-gradient(180deg,#3B82F6,#2563EB)",
                            fontFamily: "'Space Grotesk', sans-serif",
                          }}
                        >
                          + Campaign
                        </Link>
                      </div>
                    </TD>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </CardShell>
  );
}

function TradeLanesPanel({ lanes, selectedLane, onSelect }) {
  // `lanes` is aggregated from real saved-company snapshots. Each entry:
  //   { id: "China → USA", from, to, shipments, teu, companies: [...] }
  // `selectedLane` is the lane id (the same lane string).
  // Globe lanes are derived once; laneStringToGlobeLane returns null when
  // coordinates can't be resolved — those rows still render in the list.
  const globeLanes = useMemo(
    () =>
      lanes
        .map((lane) => laneStringToGlobeLane(lane.id))
        .filter((entry) => entry !== null),
    [lanes],
  );

  const selected = selectedLane
    ? lanes.find((lane) => lane.id === selectedLane) || null
    : null;

  return (
    <CardShell
      style={{
        padding: 0,
        overflow: "hidden",
        background:
          "linear-gradient(180deg, #FFFFFF 0%, #F8FAFC 55%, #EEF2FF 100%)",
        boxShadow: "0 12px 34px -20px rgba(15, 23, 42, 0.22)",
      }}
    >
      <div
        className="px-5 pt-4 pb-3 border-b border-slate-100"
        style={{ background: "linear-gradient(180deg, #FFFFFF 0%, #F8FAFC 100%)" }}
      >
        <div
          className="text-[10px] font-semibold uppercase tracking-[0.22em] text-indigo-500"
          style={{ fontFamily: "'Space Grotesk', sans-serif" }}
        >
          Trade Lane Intelligence
        </div>
        <div className="mt-1 flex items-center justify-between gap-3">
          <div
            className="text-[15px] font-bold tracking-tight text-slate-950"
            style={{ fontFamily: "'Space Grotesk', sans-serif" }}
          >
            Top Active Trade Lanes
          </div>
          {lanes.length > 0 ? (
            <span
              className="inline-flex items-center gap-1 rounded-full border border-indigo-100 bg-white px-2 py-0.5 text-[10px] font-semibold text-indigo-700"
              style={{ fontFamily: "'Space Grotesk', sans-serif" }}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-indigo-500" />
              {lanes.length} active
            </span>
          ) : null}
        </div>
        <div
          className="mt-1 text-[11px] text-slate-500"
          style={{ fontFamily: "'DM Sans', sans-serif" }}
        >
          {lanes.length > 0
            ? `Real route intelligence derived from ${lanes.length} saved-company ${lanes.length === 1 ? "lane" : "lanes"}`
            : "Save companies in Command Center to surface their top trade lanes"}
        </div>
      </div>

      {lanes.length === 0 ? (
        <div className="px-4 py-10 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-50 ring-1 ring-slate-200">
            <Package className="h-5 w-5 text-slate-300" />
          </div>
          <p
            className="text-sm font-medium text-slate-500"
            style={{ fontFamily: "'Space Grotesk', sans-serif" }}
          >
            No route intelligence yet
          </p>
          <p
            className="mt-1 text-xs text-slate-400"
            style={{ fontFamily: "'DM Sans', sans-serif" }}
          >
            Save a shipper from Discover to surface its primary lane here.
          </p>
          <Link
            to="/app/search"
            className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-800"
            style={{ fontFamily: "'Space Grotesk', sans-serif" }}
          >
            Discover Companies <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      ) : (
        <div className="flex flex-col lg:flex-row">
          <div
            className="relative flex flex-shrink-0 flex-col items-center justify-center border-b border-slate-100 p-5 lg:w-[272px] lg:border-b-0 lg:border-r"
            style={{
              background:
                "radial-gradient(circle at 50% 35%, rgba(99,102,241,0.12) 0%, rgba(6,182,212,0.08) 45%, rgba(255,255,255,0) 75%), linear-gradient(180deg, #FFFFFF 0%, #F8FAFC 100%)",
            }}
          >
            {/* Cosmetic glow ring — zero behavior change. */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  "radial-gradient(circle at 50% 40%, rgba(59,130,246,0.18) 0%, rgba(59,130,246,0) 55%)",
              }}
            />
            <div className="relative z-10">
              <GlobeCanvas lanes={globeLanes} selectedLane={selectedLane} size={220} />
            </div>
            <div
              className="relative z-10 mt-3 inline-flex items-center gap-1.5 rounded-full border border-indigo-100 bg-white/80 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-indigo-600 backdrop-blur"
              style={{ fontFamily: "'Space Grotesk', sans-serif" }}
            >
              <span className="h-1 w-1 rounded-full bg-indigo-500" />
              Live route map
            </div>
          </div>

          <div className="max-h-[320px] flex-1 overflow-y-auto">
            {lanes.map((lane) => {
              const isSelected = selectedLane === lane.id;
              return (
                <div
                  key={lane.id}
                  onClick={() => onSelect(isSelected ? null : lane.id)}
                  className="cursor-pointer border-b border-slate-100 px-3.5 py-2.5 transition-colors"
                  style={{
                    background: isSelected ? "#EFF6FF" : "transparent",
                    borderLeft: isSelected ? "2px solid #3B82F6" : "2px solid transparent",
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected) e.currentTarget.style.background = "#F8FAFC";
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected) e.currentTarget.style.background = "transparent";
                  }}
                >
                  <div className="mb-0.5 flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span
                        className="text-[11px] font-semibold"
                        style={{
                          fontFamily: "'JetBrains Mono', monospace",
                          color: isSelected ? "#1d4ed8" : "#374151",
                        }}
                      >
                        {lane.from}
                      </span>
                      <ArrowRight className="h-2.5 w-2.5 text-slate-300" />
                      <span
                        className="text-[11px] font-semibold"
                        style={{
                          fontFamily: "'JetBrains Mono', monospace",
                          color: isSelected ? "#1d4ed8" : "#374151",
                        }}
                      >
                        {lane.to}
                      </span>
                    </div>
                    <span
                      className="rounded-full border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-slate-500"
                      style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                    >
                      {lane.companies.length} {lane.companies.length === 1 ? "co" : "cos"}
                    </span>
                  </div>
                  <div className="flex gap-3">
                    <span
                      className="text-[10px] text-slate-400"
                      style={{ fontFamily: "'JetBrains Mono', monospace" }}
                    >
                      {lane.shipments > 0 ? lane.shipments.toLocaleString() : "—"} ships
                    </span>
                    <span
                      className="text-[10px] text-slate-400"
                      style={{ fontFamily: "'JetBrains Mono', monospace" }}
                    >
                      {lane.teu > 0 ? Math.round(lane.teu).toLocaleString() : "—"} TEU
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {selected && (
        <div
          className="flex flex-col gap-2 border-t border-blue-200 px-4 py-2.5"
          style={{ background: "#EFF6FF" }}
        >
          <div className="flex items-center gap-4">
            <span
              className="text-[12px] font-semibold text-blue-700"
              style={{ fontFamily: "'Space Grotesk', sans-serif" }}
            >
              {selected.from} → {selected.to}
            </span>
            <div className="ml-auto flex gap-3">
              <span
                className="text-[11px] text-slate-500"
                style={{ fontFamily: "'DM Sans', sans-serif" }}
              >
                Ships:{" "}
                <strong
                  className="text-blue-700"
                  style={{ fontFamily: "'JetBrains Mono', monospace" }}
                >
                  {selected.shipments > 0 ? selected.shipments.toLocaleString() : "—"}
                </strong>
              </span>
              <span
                className="text-[11px] text-slate-500"
                style={{ fontFamily: "'DM Sans', sans-serif" }}
              >
                TEU:{" "}
                <strong
                  className="text-blue-700"
                  style={{ fontFamily: "'JetBrains Mono', monospace" }}
                >
                  {selected.teu > 0 ? Math.round(selected.teu).toLocaleString() : "—"}
                </strong>
              </span>
            </div>
          </div>
          {selected.companies.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {selected.companies.slice(0, 3).map((co, i) => {
                const name = co?.name || co?.company_name || "Unknown";
                return (
                  <span
                    key={`${name}-${i}`}
                    className="inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-blue-700"
                    style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                  >
                    <span
                      className="inline-block h-1.5 w-1.5 rounded-full"
                      style={{ background: companyInitialColor(name) }}
                    />
                    {name}
                  </span>
                );
              })}
              {selected.companies.length > 3 && (
                <span
                  className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-semibold text-blue-700"
                  style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                >
                  +{selected.companies.length - 3} more
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </CardShell>
  );
}

function RecentChanges({ activities }) {
  const timelineItems = activities.length > 0 ? activities.map(act => ({
    id: act.id,
    text: act.description,
    time: act.timestamp instanceof Date
      ? formatRelativeTime(act.timestamp)
      : String(act.timestamp || ""),
    color: ACTIVITY_COLORS[act.type] || "#3B82F6",
    Icon: ACTIVITY_ICON_MAP[act.type] || Clock,
  })) : [
    { id: "1", text: "Atlas Global increased shipments +32%", time: "2h ago",    color: "#22C55E", Icon: TrendingUp  },
    { id: "2", text: "Pacific Freight — last shipment: Today", time: "5h ago",   color: "#3B82F6", Icon: Package     },
    { id: "3", text: "Q2 Outreach campaign launched — 580 sent", time: "2d ago", color: "#F59E0B", Icon: Send        },
    { id: "4", text: "RFP sent to Pacific Freight Co. — $240K", time: "4d ago",  color: "#8B5CF6", Icon: FileText    },
  ];

  return (
    <CardShell>
      <CardHeader title="Recent Changes" subtitle="Intelligence signals and activity updates" />
      <div className="px-3 py-1">
        {timelineItems.slice(0, 6).map((item, i) => {
          const Icon = item.Icon;
          return (
            <div
              key={item.id}
              className="flex gap-2.5 py-2.5"
              style={{ borderBottom: i < timelineItems.length - 1 ? "1px solid #F8FAFC" : "none" }}
            >
              <div
                className="w-6 h-6 rounded-[7px] flex items-center justify-center flex-shrink-0 mt-0.5"
                style={{
                  background: item.color + "15",
                  border: `1px solid ${item.color}25`,
                }}
              >
                <Icon className="w-3 h-3" style={{ color: item.color }} />
              </div>
              <div className="flex-1 min-w-0">
                <div
                  className="text-[12px] text-slate-700 leading-snug"
                  style={{ fontFamily: "'DM Sans', sans-serif" }}
                >
                  {item.text}
                </div>
              </div>
              <span
                className="text-[10px] text-slate-300 whitespace-nowrap mt-0.5 flex-shrink-0"
                style={{ fontFamily: "'Space Grotesk', sans-serif" }}
              >
                {item.time}
              </span>
            </div>
          );
        })}
      </div>
    </CardShell>
  );
}

function formatRelativeTime(date) {
  const secs = Math.floor((Date.now() - date.getTime()) / 1000);
  if (secs < 60) return "just now";
  if (secs < 3600) return Math.floor(secs / 60) + "m ago";
  if (secs < 86400) return Math.floor(secs / 3600) + "h ago";
  return Math.floor(secs / 86400) + "d ago";
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [savedCompanies, setSavedCompanies] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [activities, setActivities] = useState([]);
  const [searchCount, setSearchCount] = useState(0);
  const [contacts, setContacts] = useState([]);
  // Saved-contacts KPI count. Kept separate from the `contacts` preview list
  // because that list is limit-8 for the SavedContacts panel — we need a true
  // `count: exact` for the KPI tile.
  const [contactsCount, setContactsCount] = useState(0);
  const [selectedLane, setSelectedLane] = useState(null);

  useDashboardShortcuts();

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      setLoading(true);
      try {
        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

        // Resolve organisation id for per-org KPI scoping. Read from auth
        // metadata first (no extra fetch). If the user object carries no
        // organisation reference we'll fall back to an UNSCOPED count below
        // — this is the temporary fallback the Phase-C plan approved.
        const orgId =
          user?.user_metadata?.organization_id ||
          user?.user_metadata?.org_id ||
          user?.app_metadata?.organization_id ||
          user?.app_metadata?.org_id ||
          null;

        // Build the contacts-count query. We attempt org-scoped first when
        // we have an id and fall through to unscoped if the scoped call
        // errors (likely because `organization_id` isn't on `lit_contacts`
        // in this environment). Either way: real counts, never mocked.
        // TEMP FALLBACK — proper per-org scoping requires a schema add on
        // `lit_contacts.organization_id` + backfill. Tracked as a Phase-C
        // backend ticket.
        const buildContactsCountQuery = () => {
          let q = supabase
            .from("lit_contacts")
            .select("id", { count: "exact", head: true });
          if (orgId) q = q.eq("organization_id", orgId);
          return q;
        };

        const [
          companiesRes,
          campaignsRes,
          activitiesRes,
          searchRes,
          contactsRes,
          contactsCountRes,
        ] = await Promise.allSettled([
          getSavedCompanies(),
          getLitCampaigns().catch(() => getCrmCampaigns()),
          supabase.from('lit_activity_events').select('*').order('created_at', { ascending: false }).limit(10),
          supabase.from('lit_activity_events').select('id', { count: 'exact', head: true }).eq('user_id', user?.id).eq('event_type', 'search').gte('created_at', monthStart),
          supabase.from('lit_contacts').select('id, full_name, title, company_name').order('created_at', { ascending: false }).limit(8),
          buildContactsCountQuery(),
        ]);

        if (mounted) {
          if (companiesRes.status === "fulfilled") {
            const rows = Array.isArray(companiesRes.value?.rows) ? companiesRes.value.rows : [];
            setSavedCompanies(rows);
          }
          if (campaignsRes.status === "fulfilled") {
            const rows = Array.isArray(campaignsRes.value?.rows) ? campaignsRes.value.rows :
                         Array.isArray(campaignsRes.value) ? campaignsRes.value : [];
            setCampaigns(rows);
          }
          if (searchRes.status === "fulfilled") {
            setSearchCount(searchRes.value?.count || 0);
          }
          if (contactsRes.status === 'fulfilled') {
            setContacts(contactsRes.value?.data || []);
          }
          if (contactsCountRes.status === "fulfilled" && !contactsCountRes.value?.error) {
            setContactsCount(contactsCountRes.value?.count || 0);
          } else if (orgId) {
            // Org-scoped count failed (likely because `organization_id` is
            // not a column on `lit_contacts` yet). Retry unscoped so the
            // KPI tile still reflects real data, not zero.
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
          if (activitiesRes.status === 'fulfilled') {
            const rawActivities = activitiesRes.value?.data || [];
            if (rawActivities.length > 0) {
              const formattedActivities = rawActivities.map(act => ({
                id: act.id,
                type: act.event_type === "company_saved"    ? "company_saved"  :
                      act.event_type === "contact_enriched" ? "contact_added"  :
                      act.event_type === "campaign_created" ? "campaign_sent"  :
                      act.event_type === "rfp_generated"    ? "rfp_generated"  : "opportunity",
                title: act.event_type,
                description: act.metadata?.description || act.event_type,
                timestamp: new Date(act.created_at),
                link: act.event_type === "company_saved"    ? "/app/command-center" :
                      act.event_type === "contact_enriched" ? "/app/command-center" :
                      act.event_type === "campaign_created" ? "/app/campaigns"      :
                      act.event_type === "rfp_generated"    ? "/app/rfp-studio"     : "/app/dashboard",
              }));
              setActivities(formattedActivities);
            }
          }
        }
      } catch (err) {
        console.error("Dashboard load error:", err);
      } finally {
        if (mounted) setLoading(false);
      }
    };
    load();
    return () => { mounted = false; };
  }, []);

  if (loading) {
    return <DashboardLoadingSkeleton />;
  }

  const activeCampaigns = campaigns.filter(c => c?.status === "active" || c?.status === "live").length;

  const displayName =
    user?.user_metadata?.full_name ||
    user?.user_metadata?.name ||
    user?.email?.split("@")[0];

  // Real lane aggregation from saved-company snapshots. Uses
  // top_route_12m as the primary lane, falling back to recent_route.
  // Lane ids are the full lane string (e.g. "China → USA") so they
  // round-trip through `laneStringToGlobeLane` for the globe canvas and
  // through `HighOpportunityPanel`'s filter predicate.
  const tradeLanes = useMemo(() => {
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

      const shipments = Number(co?.kpis?.shipments_12m || co?.shipments_12m || 0) || 0;
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
      .sort((a, b) => b.shipments - a.shipments || b.teu - a.teu)
      .slice(0, 6);
  }, [savedCompanies]);

  const KPI_CARDS = [
    {
      icon: Building2,
      label: "Saved Companies",
      value: savedCompanies.length || "—",
      sub: "In Command Center",
      iconColor: "#3B82F6",
      href: "/app/command-center",
      live: true,
      delay: 0,
    },
    {
      icon: Users2,
      label: "Saved Contacts",
      value: contactsCount > 0 ? contactsCount.toLocaleString() : "—",
      sub: contactsCount > 0 ? "Verified decision makers" : "Enrich a company to save contacts",
      iconColor: "#F59E0B",
      href: "/app/command-center",
      delay: 0.05,
    },
    {
      icon: Search,
      label: "Searches Used",
      value: searchCount > 0 ? searchCount.toLocaleString() : "—",
      sub: "This month",
      iconColor: "#8B5CF6",
      href: "/app/search",
      delay: 0.1,
    },
    {
      icon: Mail,
      label: "Active Campaigns",
      value: activeCampaigns,
      sub: campaigns.length > 0 ? `${campaigns.length} total` : "No campaigns yet",
      iconColor: "#10B981",
      href: "/app/campaigns",
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

        {/* KPI row — 4 approved KPIs (Saved Companies, Saved Contacts,
            Searches Used, Active Campaigns). All counts are from real
            Supabase queries; no mocks. Phase G — wrapped in a soft-gradient
            shell so the strip reads as a single premium band instead of
            four detached tiles on a flat background. */}
        <div
          className="rounded-2xl border border-slate-200 p-3 md:p-4"
          style={{
            background:
              "linear-gradient(180deg, rgba(255,255,255,0.9) 0%, rgba(248,250,252,0.9) 100%)",
            boxShadow: "0 10px 30px -22px rgba(15, 23, 42, 0.24)",
          }}
        >
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {KPI_CARDS.map(card => (
              <EnhancedKpiCard key={card.label} {...card} />
            ))}
          </div>
        </div>

        {/* Main 2-column grid */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-4 items-start">
          {/* Left column */}
          <div className="flex flex-col gap-4">
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: 0.25 }}
            >
              <SavedContacts contacts={contacts} />
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: 0.35 }}
            >
              <HighOpportunityPanel
                savedCompanies={savedCompanies}
                campaigns={campaigns}
                selectedLane={selectedLane}
                onClearLane={() => setSelectedLane(null)}
              />
            </motion.div>
          </div>

          {/* Right column */}
          <div className="flex flex-col gap-4">
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: 0.3 }}
            >
              <TradeLanesPanel
                lanes={tradeLanes}
                selectedLane={selectedLane}
                onSelect={setSelectedLane}
              />
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: 0.4 }}
            >
              <RecentChanges activities={activities} />
            </motion.div>
          </div>
        </div>
      </div>

      <QuickActionsButton />
    </>
  );
}
