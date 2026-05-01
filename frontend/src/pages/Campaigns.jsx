import React, { useCallback, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  Filter,
  Grid,
  Plus,
  RefreshCw,
  Send,
} from "lucide-react";
import { useCampaigns } from "@/features/outbound/hooks/useCampaigns";
import { PulseBar } from "@/features/outbound/components/PulseBar";
import { PlayCard } from "@/features/outbound/components/PlayCard";
import { CampaignRow } from "@/features/outbound/components/CampaignRow";
import { CoachCard } from "@/features/outbound/components/CoachCard";
import { STARTER_PLAYS } from "@/features/outbound/data/plays";
import { fontDisplay, fontBody } from "@/features/outbound/tokens";

// /app/campaigns — Outbound Engine v2 list view.
// Backend wiring is unchanged: getCrmCampaigns() (lit_campaigns) drives the
// campaign list. PulseBar renders honest "pending" placeholders until an
// outreach aggregation endpoint exists. Plays are a static starter catalog
// — selecting one navigates to /app/campaigns/new with ?play=:id.

const FILTERS = [
  { k: "all", label: "All" },
  { k: "active", label: "Active" },
  { k: "draft", label: "Drafts" },
  { k: "attention", label: "Needs attention" },
  { k: "paused", label: "Paused" },
];

function filterCounts(campaigns) {
  let active = 0;
  let draft = 0;
  let paused = 0;
  let attention = 0;
  for (const c of campaigns) {
    if (c.status === "active") active += 1;
    if (c.status === "draft") draft += 1;
    if (c.status === "paused") paused += 1;
    if (c.health === "attention") attention += 1;
  }
  return { all: campaigns.length, active, draft, paused, attention };
}

function applyFilter(campaigns, filter) {
  if (filter === "all") return campaigns;
  if (filter === "attention")
    return campaigns.filter((c) => c.health === "attention");
  return campaigns.filter((c) => c.status === filter);
}

function PageHeader({ onNewCampaign, onOpenAnalytics }) {
  return (
    <header className="mb-5 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h1
            className="text-[22px] font-bold tracking-tight text-[#0F172A]"
            style={{ fontFamily: fontDisplay }}
          >
            Outbound Engine
          </h1>
          <span
            className="rounded-full border border-[#BFDBFE] bg-[#EFF6FF] px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.04em] text-[#0A66C2]"
            style={{ fontFamily: fontDisplay }}
          >
            Email · LinkedIn · Calls
          </span>
        </div>
        <p
          className="mt-1.5 max-w-2xl text-[13px] text-slate-500"
          style={{ fontFamily: fontBody }}
        >
          Multi-channel sequences powered by signal data — built for freight revenue teams.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onOpenAnalytics}
          className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
          style={{ fontFamily: fontDisplay }}
        >
          <Grid className="h-3 w-3" />
          Analytics
        </button>
        <button
          type="button"
          onClick={onNewCampaign}
          className="inline-flex items-center gap-1.5 rounded-md bg-gradient-to-b from-[#3B82F6] to-[#2563EB] px-3.5 py-1.5 text-xs font-semibold text-white shadow-[0_1px_4px_rgba(59,130,246,0.3)] transition hover:brightness-110"
          style={{ fontFamily: fontDisplay }}
        >
          <Plus className="h-3 w-3" />
          New campaign
        </button>
      </div>
    </header>
  );
}

function SectionHead({ title, subtitle, right }) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3">
      <div>
        <div
          className="text-base font-bold tracking-tight text-[#0F172A]"
          style={{ fontFamily: fontDisplay }}
        >
          {title}
        </div>
        {subtitle ? (
          <div
            className="mt-0.5 text-xs text-slate-500"
            style={{ fontFamily: fontBody }}
          >
            {subtitle}
          </div>
        ) : null}
      </div>
      {right}
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-5">
      <div className="h-24 animate-pulse rounded-2xl bg-slate-100" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-44 animate-pulse rounded-xl bg-slate-100" />
        ))}
      </div>
      <div className="space-y-2.5">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-xl bg-slate-100" />
        ))}
      </div>
    </div>
  );
}

function ErrorCard({ message, onRetry }) {
  return (
    <div className="rounded-2xl border border-rose-200 bg-rose-50/60 p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-rose-100 text-rose-600 ring-1 ring-rose-200">
          <AlertTriangle className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h3
            className="text-sm font-bold text-[#0F172A]"
            style={{ fontFamily: fontDisplay }}
          >
            Couldn't load your campaigns
          </h3>
          <p
            className="mt-1 text-xs text-slate-600"
            style={{ fontFamily: fontBody }}
          >
            {message || "Something went wrong fetching campaigns."}
          </p>
          <button
            type="button"
            onClick={onRetry}
            className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
            style={{ fontFamily: fontDisplay }}
          >
            <RefreshCw className="h-3 w-3" />
            Try again
          </button>
        </div>
      </div>
    </div>
  );
}

function EmptyCampaigns({ onNewCampaign }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center shadow-sm">
      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-[#EFF6FF] text-[#3B82F6] ring-1 ring-[#BFDBFE]">
        <Send className="h-6 w-6" />
      </div>
      <div
        className="text-base font-bold text-[#0F172A]"
        style={{ fontFamily: fontDisplay }}
      >
        No campaigns yet
      </div>
      <p
        className="mx-auto mt-1.5 max-w-md text-sm text-slate-500"
        style={{ fontFamily: fontBody }}
      >
        Pick a starter play above or build a sequence from scratch. Save as draft until your inbox is connected.
      </p>
      <button
        type="button"
        onClick={onNewCampaign}
        className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-gradient-to-b from-[#3B82F6] to-[#2563EB] px-4 py-2 text-xs font-semibold text-white shadow-[0_1px_4px_rgba(59,130,246,0.3)]"
        style={{ fontFamily: fontDisplay }}
      >
        <Plus className="h-3 w-3" />
        New campaign
        <ArrowRight className="h-3 w-3" />
      </button>
    </div>
  );
}

export default function CampaignsPage() {
  const navigate = useNavigate();
  const { campaigns, loading, error, refresh } = useCampaigns();
  const [filter, setFilter] = useState("all");

  const handleNewCampaign = useCallback(
    (playId) => {
      const url = playId
        ? `/app/campaigns/new?play=${encodeURIComponent(playId)}`
        : "/app/campaigns/new";
      navigate(url);
    },
    [navigate],
  );

  const handleOpenAnalytics = useCallback(() => {
    navigate("/app/diagnostic");
  }, [navigate]);

  const handleOpenCampaign = useCallback(
    () => {
      // Detail route for a single campaign hasn't shipped yet (Phase D in
      // the original roadmap). Until it does, clicking a row routes to the
      // builder so the user can edit the draft / sequence.
      navigate(`/app/campaigns/new`);
    },
    [navigate],
  );

  const counts = useMemo(() => filterCounts(campaigns), [campaigns]);
  const visible = useMemo(
    () => applyFilter(campaigns, filter),
    [campaigns, filter],
  );

  return (
    <div className="min-h-full bg-[#F8FAFC]">
      <div className="mx-auto max-w-[1200px] px-4 py-5 md:px-6 md:py-6">
        <PageHeader
          onNewCampaign={() => handleNewCampaign(null)}
          onOpenAnalytics={handleOpenAnalytics}
        />

        {loading ? (
          <LoadingSkeleton />
        ) : error ? (
          <ErrorCard message={error} onRetry={refresh} />
        ) : (
          <div className="space-y-6">
            <PulseBar campaigns={campaigns} />

            <section>
              <SectionHead
                title="Start from a play"
                subtitle="Pre-built, persona-targeted sequences. Pick one to seed a new campaign."
              />
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {STARTER_PLAYS.map((p) => (
                  <PlayCard
                    key={p.id}
                    play={p}
                    onUse={() => handleNewCampaign(p.id)}
                  />
                ))}
              </div>
            </section>

            <section>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap gap-1.5">
                  {FILTERS.map((f) => {
                    const isActive = filter === f.k;
                    const count = counts[f.k] ?? 0;
                    return (
                      <button
                        key={f.k}
                        type="button"
                        onClick={() => setFilter(f.k)}
                        className="rounded-full px-3 py-1 text-xs font-semibold transition"
                        style={{
                          background: isActive ? "#0F172A" : "#FFFFFF",
                          color: isActive ? "#fff" : "#64748b",
                          border: `1px solid ${isActive ? "#0F172A" : "#E5E7EB"}`,
                          fontFamily: fontDisplay,
                        }}
                      >
                        {f.label} · {count}
                      </button>
                    );
                  })}
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    disabled
                    title="Filter by owner — coming soon"
                    className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-400"
                    style={{ fontFamily: fontDisplay }}
                  >
                    <Filter className="h-2.5 w-2.5" />
                    Owner: All
                  </button>
                </div>
              </div>

              {campaigns.length === 0 ? (
                <EmptyCampaigns onNewCampaign={() => handleNewCampaign(null)} />
              ) : visible.length === 0 ? (
                <div
                  className="rounded-xl border border-dashed border-slate-200 bg-white px-5 py-8 text-center text-sm text-slate-500"
                  style={{ fontFamily: fontBody }}
                >
                  No campaigns match this filter.
                </div>
              ) : (
                <div className="flex flex-col gap-2.5">
                  {visible.map((c) => (
                    <CampaignRow
                      key={c.id || c.name}
                      campaign={c}
                      onOpen={handleOpenCampaign}
                    />
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
      </div>

      <CoachCard
        campaigns={campaigns}
        onCta={(cta) => {
          if (cta === "Browse plays") {
            window.scrollTo({ top: 0, behavior: "smooth" });
          } else if (cta === "Review drafts") {
            setFilter("draft");
          } else if (cta === "Connect inbox") {
            navigate("/app/settings");
          }
        }}
      />
    </div>
  );
}
