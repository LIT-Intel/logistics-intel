import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/auth/AuthProvider";
import {
  Building2, Mail, FileText, Search,
  Package, Layers, DollarSign, Zap,
  ArrowRight, TrendingUp, TrendingDown,
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

// Static trade lane data — in a later phase these will be driven by IyRouteKpis
const TRADE_LANES = [
  { id: "cn-us", from: "China",   to: "USA",    shipments: 42800, teu: "182K", trend: "+12%", up: true  },
  { id: "in-us", from: "India",   to: "USA",    shipments: 18400, teu: "76K",  trend: "+8%",  up: true  },
  { id: "de-us", from: "Germany", to: "USA",    shipments: 12200, teu: "48K",  trend: "+3%",  up: true  },
  { id: "jp-us", from: "Japan",   to: "USA",    shipments: 9800,  teu: "38K",  trend: "-2%",  up: false },
  { id: "kr-us", from: "S.Korea", to: "USA",    shipments: 8400,  teu: "31K",  trend: "+5%",  up: true  },
  { id: "vn-us", from: "Vietnam", to: "USA",    shipments: 6900,  teu: "26K",  trend: "+22%", up: true  },
];

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

function WhatMattersNow({ companies }) {
  if (!companies.length) {
    return (
      <CardShell>
        <CardHeader
          title="What Matters Now"
          subtitle="Active shipment activity across saved companies"
          right={<span className="lit-live-pill"><span className="lit-live-dot" />Live</span>}
        />
        <div className="px-6 py-10 text-center">
          <Building2 className="w-8 h-8 text-slate-300 mx-auto mb-2" />
          <p className="text-sm font-medium text-slate-500" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            No companies saved yet
          </p>
          <p className="text-xs text-slate-400 mt-1" style={{ fontFamily: "'DM Sans', sans-serif" }}>
            Discover shippers and add them to Command Center
          </p>
          <Link
            to="/app/search"
            className="inline-flex items-center gap-1.5 mt-3 text-xs font-semibold text-blue-600 hover:text-blue-800"
            style={{ fontFamily: "'Space Grotesk', sans-serif" }}
          >
            Discover Companies <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
      </CardShell>
    );
  }

  return (
    <CardShell>
      <CardHeader
        title="What Matters Now"
        subtitle="Active shipment activity across saved companies"
        right={<span className="lit-live-pill"><span className="lit-live-dot" />Live</span>}
      />
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr>
              <TH>Company</TH>
              <TH>Shipments 12m</TH>
              <TH>TEU 12m</TH>
              <TH>Country</TH>
              <TH>Action</TH>
            </tr>
          </thead>
          <tbody>
            {companies.slice(0, 8).map((saved, i) => {
              const co = saved?.company || saved?.company_data || {};
              const name = co?.name || saved?.company_name || "Unknown";
              const shipments = co?.shipments_12m;
              const teu = co?.teu_12m;
              const country = co?.country_code || co?.country || "—";
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
                      <span className="font-semibold text-slate-900 text-[13px] truncate max-w-[160px]"
                        style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                        {name}
                      </span>
                    </div>
                  </TD>
                  <TD mono>{shipments ? Number(shipments).toLocaleString() : "—"}</TD>
                  <TD mono>{teu ? Number(teu).toLocaleString() : "—"}</TD>
                  <TD>
                    <span className="text-xs text-slate-500">{country}</span>
                  </TD>
                  <TD>
                    <div className="flex items-center gap-1.5">
                      <Link
                        to={`/app/command-center?company=${encodeURIComponent(companyId || "")}`}
                        className="text-[11px] font-semibold bg-blue-50 text-blue-600 border border-blue-200 rounded-md px-2.5 py-1 hover:bg-blue-100 transition-colors"
                        style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                      >
                        View
                      </Link>
                    </div>
                  </TD>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {companies.length > 8 && (
        <div className="px-4 py-2.5 border-t border-slate-100">
          <Link
            to="/app/command-center"
            className="text-xs font-semibold text-blue-600 hover:text-blue-800"
            style={{ fontFamily: "'Space Grotesk', sans-serif" }}
          >
            View all {companies.length} companies →
          </Link>
        </div>
      )}
    </CardShell>
  );
}

function HighOpportunityPanel({ savedCompanies, campaigns }) {
  // Derive "not yet engaged" from saved companies that have no associated campaign
  const engagedNames = new Set(
    campaigns.map(c => (c?.company_name || c?.name || "").toLowerCase()).filter(Boolean)
  );
  const notEngaged = savedCompanies.filter(s => {
    const name = (s?.company?.name || s?.company_name || "").toLowerCase();
    return name && !engagedNames.has(name);
  });

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
      {notEngaged.length === 0 ? (
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
              {notEngaged.slice(0, 5).map((saved, i) => {
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

function TradeLanesPanel({ selectedLane, onSelect }) {
  return (
    <CardShell style={{ padding: 0, overflow: "hidden" }}>
      <div className="px-[18px] pt-4 pb-3 border-b border-slate-100">
        <div
          className="text-sm font-bold text-slate-900"
          style={{ fontFamily: "'Space Grotesk', sans-serif" }}
        >
          Top Active Trade Lanes
        </div>
        <div
          className="text-[11px] text-slate-400 mt-0.5"
          style={{ fontFamily: "'DM Sans', sans-serif" }}
        >
          Global freight route intelligence
        </div>
      </div>

      {/* Static globe placeholder — D3 globe enhancement can be layered on top in a future pass */}
      <div className="flex">
        <div className="w-[110px] flex-shrink-0 bg-slate-50 border-r border-slate-100 flex items-center justify-center p-3">
          <svg viewBox="0 0 100 100" width="90" height="90" className="opacity-70">
            <circle cx="50" cy="50" r="44" fill="#DBEAFE" stroke="#BFDBFE" strokeWidth="1.5" />
            {/* Graticule rings */}
            <ellipse cx="50" cy="50" rx="44" ry="20" fill="none" stroke="rgba(59,130,246,0.12)" strokeWidth="0.8" />
            <ellipse cx="50" cy="50" rx="44" ry="36" fill="none" stroke="rgba(59,130,246,0.08)" strokeWidth="0.8" />
            <line x1="50" y1="6" x2="50" y2="94" stroke="rgba(59,130,246,0.10)" strokeWidth="0.8" />
            <line x1="6" y1="50" x2="94" y2="50" stroke="rgba(59,130,246,0.10)" strokeWidth="0.8" />
            {/* Highlighted arc for selected lane (decorative) */}
            {selectedLane && (
              <path
                d="M 18 40 Q 50 10 82 45"
                fill="none"
                stroke="#3B82F6"
                strokeWidth="2.5"
                strokeDasharray="4 3"
                opacity="0.85"
              />
            )}
            {/* Dot markers */}
            <circle cx="72" cy="42" r="4" fill="#3B82F6" stroke="#fff" strokeWidth="1.5" />
            <circle cx="22" cy="44" r="4" fill="#3B82F6" stroke="#fff" strokeWidth="1.5" />
          </svg>
        </div>

        <div className="flex-1 overflow-y-auto max-h-[276px]">
          {TRADE_LANES.map(lane => {
            const isSelected = selectedLane === lane.id;
            return (
              <div
                key={lane.id}
                onClick={() => onSelect(isSelected ? null : lane.id)}
                className="px-3.5 py-2.5 border-b border-slate-100 cursor-pointer transition-colors"
                style={{
                  background: isSelected ? "#EFF6FF" : "transparent",
                  borderLeft: isSelected ? "2px solid #3B82F6" : "2px solid transparent",
                }}
                onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = "#F8FAFC"; }}
                onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = "transparent"; }}
              >
                <div className="flex items-center justify-between mb-0.5">
                  <div className="flex items-center gap-1.5">
                    <span
                      className="text-[11px] font-semibold"
                      style={{ fontFamily: "'JetBrains Mono', monospace", color: isSelected ? "#1d4ed8" : "#374151" }}
                    >
                      {lane.from}
                    </span>
                    <ArrowRight className="w-2.5 h-2.5 text-slate-300" />
                    <span
                      className="text-[11px] font-semibold"
                      style={{ fontFamily: "'JetBrains Mono', monospace", color: isSelected ? "#1d4ed8" : "#374151" }}
                    >
                      {lane.to}
                    </span>
                  </div>
                  <span
                    className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                    style={{
                      fontFamily: "'Space Grotesk', sans-serif",
                      color: lane.up ? "#15803d" : "#b91c1c",
                      background: lane.up ? "rgba(34,197,94,0.1)" : "rgba(239,68,68,0.1)",
                    }}
                  >
                    {lane.up ? "↑" : "↓"} {lane.trend}
                  </span>
                </div>
                <div className="flex gap-3">
                  <span
                    className="text-[10px] text-slate-400"
                    style={{ fontFamily: "'JetBrains Mono', monospace" }}
                  >
                    {lane.shipments.toLocaleString()} ships
                  </span>
                  <span
                    className="text-[10px] text-slate-400"
                    style={{ fontFamily: "'JetBrains Mono', monospace" }}
                  >
                    {lane.teu} TEU
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {selectedLane && (() => {
        const lane = TRADE_LANES.find(l => l.id === selectedLane);
        if (!lane) return null;
        return (
          <div
            className="px-4 py-2.5 border-t border-blue-200 flex items-center gap-4"
            style={{ background: "#EFF6FF" }}
          >
            <span
              className="text-[12px] font-semibold text-blue-700"
              style={{ fontFamily: "'Space Grotesk', sans-serif" }}
            >
              {lane.from} → {lane.to}
            </span>
            <div className="flex gap-3 ml-auto">
              <span className="text-[11px] text-slate-500" style={{ fontFamily: "'DM Sans', sans-serif" }}>
                Ships:{" "}
                <strong className="text-blue-700" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                  {lane.shipments.toLocaleString()}
                </strong>
              </span>
              <span className="text-[11px] text-slate-500" style={{ fontFamily: "'DM Sans', sans-serif" }}>
                TEU:{" "}
                <strong className="text-blue-700" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                  {lane.teu}
                </strong>
              </span>
              <span
                className="text-[11px] font-bold"
                style={{ color: lane.up ? "#15803d" : "#b91c1c" }}
              >
                {lane.up ? "↑" : "↓"} {lane.trend}
              </span>
            </div>
          </div>
        );
      })()}
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
  const [rfpCount, setRfpCount] = useState(0);
  const [activities, setActivities] = useState([]);
  const [searchCount, setSearchCount] = useState(0);
  const [selectedLane, setSelectedLane] = useState(null);

  useDashboardShortcuts();

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      setLoading(true);
      try {
        const [companiesRes, campaignsRes, rfpsRes, activitiesRes, searchRes] = await Promise.allSettled([
          getSavedCompanies(),
          getLitCampaigns().catch(() => getCrmCampaigns()),
          supabase.from("lit_rfps").select("id").eq("status", "active"),
          supabase.from("lit_activity_events").select("*").order("created_at", { ascending: false }).limit(10),
          supabase.from("search_queries").select("id", { count: "exact", head: true }).eq("user_id", user?.id),
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
          if (rfpsRes.status === "fulfilled") {
            setRfpCount(rfpsRes.value?.data?.length || 0);
          }
          if (searchRes.status === "fulfilled") {
            setSearchCount(searchRes.value?.count || 0);
          }
          if (activitiesRes.status === "fulfilled") {
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

  // KPI aggregates from real saved companies data
  const totalShipments = savedCompanies.reduce((sum, s) => {
    const n = Number(s?.company?.shipments_12m || s?.company_data?.shipments_12m || 0);
    return sum + (isNaN(n) ? 0 : n);
  }, 0);

  const totalTeu = savedCompanies.reduce((sum, s) => {
    const n = Number(s?.company?.teu_12m || s?.company_data?.teu_12m || 0);
    return sum + (isNaN(n) ? 0 : n);
  }, 0);

  const activeCampaigns = campaigns.filter(c => c?.status === "active" || c?.status === "live").length;

  const displayName =
    user?.user_metadata?.full_name ||
    user?.user_metadata?.name ||
    user?.email?.split("@")[0];

  const KPI_CARDS = [
    {
      icon: Building2,
      label: "Active Companies",
      value: savedCompanies.length || "—",
      sub: "In Command Center",
      iconColor: "#3B82F6",
      href: "/app/command-center",
      live: true,
      delay: 0,
    },
    {
      icon: Package,
      label: "Total Shipments 12m",
      value: totalShipments > 0 ? totalShipments.toLocaleString() : "—",
      sub: "All saved companies",
      iconColor: "#6366F1",
      href: "/app/command-center",
      delay: 0.05,
    },
    {
      icon: Layers,
      label: "Total TEU 12m",
      value: totalTeu > 0 ? totalTeu.toLocaleString() : "—",
      sub: "All saved companies",
      iconColor: "#10B981",
      href: "/app/command-center",
      delay: 0.1,
    },
    {
      icon: Mail,
      label: "Active Campaigns",
      value: activeCampaigns,
      sub: campaigns.length > 0 ? `${campaigns.length} total` : "No campaigns yet",
      iconColor: "#F59E0B",
      href: "/app/campaigns",
      delay: 0.15,
    },
    {
      icon: FileText,
      label: "Open RFPs",
      value: rfpCount,
      sub: rfpCount > 0 ? "Ready to send" : "Generate your first RFP",
      iconColor: "#8B5CF6",
      href: "/app/rfp-studio",
      delay: 0.2,
    },
  ];

  return (
    <>
      <div className="px-4 sm:px-6 py-5 space-y-5" style={{ background: "#F8FAFC", minHeight: "100%" }}>
        <DashboardHeader userName={displayName} />

        {/* KPI row */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {KPI_CARDS.map(card => (
            <EnhancedKpiCard key={card.label} {...card} />
          ))}
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
              <WhatMattersNow companies={savedCompanies} />
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: 0.35 }}
            >
              <HighOpportunityPanel savedCompanies={savedCompanies} campaigns={campaigns} />
            </motion.div>
          </div>

          {/* Right column */}
          <div className="flex flex-col gap-4">
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: 0.3 }}
            >
              <TradeLanesPanel selectedLane={selectedLane} onSelect={setSelectedLane} />
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
