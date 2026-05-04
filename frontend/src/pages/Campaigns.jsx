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
import { ConfirmDialog } from "@/features/outbound/components/ConfirmDialog";
import { STARTER_PLAYS } from "@/features/outbound/data/plays";
import { fontDisplay, fontBody } from "@/features/outbound/tokens";
import {
  archiveCampaign,
  unarchiveCampaign,
  pauseCampaign,
  resumeCampaign,
  deleteCampaign,
} from "@/features/outbound/api/campaignActions";

// /app/campaigns — Outbound Engine v2 list view.
// Reads via getCrmCampaigns (lit_campaigns). Compact density mirrors the
// company profile page — px-3 py-2 KPI strip, text-[9-10px] labels, thin
// slate-100 separators, no heavy shadows. Plays seed /app/campaigns/new.

const FILTERS = [
  { k: "all", label: "All" },
  { k: "active", label: "Active" },
  { k: "draft", label: "Drafts" },
  { k: "attention", label: "Needs attention" },
  { k: "paused", label: "Paused" },
  { k: "archived", label: "Archived" },
];

function filterCounts(campaigns) {
  let active = 0;
  let draft = 0;
  let paused = 0;
  let attention = 0;
  let archived = 0;
  for (const c of campaigns) {
    if (c.status === "active") active += 1;
    if (c.status === "draft") draft += 1;
    if (c.status === "paused") paused += 1;
    if (c.status === "archived") archived += 1;
    if (c.health === "attention") attention += 1;
  }
  return { all: campaigns.length, active, draft, paused, attention, archived };
}

function applyFilter(campaigns, filter) {
  if (filter === "all")
    return campaigns.filter((c) => c.status !== "archived");
  if (filter === "attention")
    return campaigns.filter((c) => c.health === "attention");
  return campaigns.filter((c) => c.status === filter);
}

function PageHeader({ onNewCampaign, onOpenAnalytics }) {
  return (
    <header className="mb-3 flex flex-wrap items-start justify-between gap-2">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-1.5">
          <h1
            className="text-[18px] font-bold leading-tight tracking-tight text-[#0F172A]"
            style={{ fontFamily: fontDisplay }}
          >
            Outbound Engine
          </h1>
          <span
            className="rounded-full border border-[#BFDBFE] bg-[#EFF6FF] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.04em] text-[#0A66C2]"
            style={{ fontFamily: fontDisplay }}
          >
            Email · LinkedIn · Calls
          </span>
        </div>
        <p
          className="mt-0.5 max-w-2xl text-[12px] text-slate-500"
          style={{ fontFamily: fontBody }}
        >
          Multi-channel sequences powered by signal data.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={onOpenAnalytics}
          className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-50"
          style={{ fontFamily: fontDisplay }}
        >
          <Grid className="h-2.5 w-2.5" />
          Analytics
        </button>
        <button
          type="button"
          onClick={onNewCampaign}
          className="inline-flex items-center gap-1 rounded-md bg-gradient-to-b from-[#3B82F6] to-[#2563EB] px-3 py-1 text-[11px] font-semibold text-white shadow-[0_1px_4px_rgba(59,130,246,0.3)] transition hover:brightness-110"
          style={{ fontFamily: fontDisplay }}
        >
          <Plus className="h-2.5 w-2.5" />
          New campaign
        </button>
      </div>
    </header>
  );
}

function SectionHead({ title, subtitle, right }) {
  return (
    <div className="mb-2 flex items-end justify-between gap-2">
      <div>
        <div
          className="text-[13px] font-bold tracking-tight text-[#0F172A]"
          style={{ fontFamily: fontDisplay }}
        >
          {title}
        </div>
        {subtitle ? (
          <div
            className="mt-0.5 text-[11px] text-slate-500"
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
    <div className="space-y-4">
      <div className="h-16 animate-pulse rounded-lg bg-slate-100" />
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-32 animate-pulse rounded-lg bg-slate-100" />
        ))}
      </div>
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-16 animate-pulse rounded-lg bg-slate-100" />
        ))}
      </div>
    </div>
  );
}

function ErrorCard({ message, onRetry }) {
  return (
    <div className="rounded-lg border border-rose-200 bg-rose-50/60 p-4">
      <div className="flex items-start gap-2.5">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-rose-100 text-rose-600 ring-1 ring-rose-200">
          <AlertTriangle className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <h3
            className="text-[13px] font-bold text-[#0F172A]"
            style={{ fontFamily: fontDisplay }}
          >
            Couldn't load your campaigns
          </h3>
          <p
            className="mt-0.5 text-[11px] text-slate-600"
            style={{ fontFamily: fontBody }}
          >
            {message || "Something went wrong fetching campaigns."}
          </p>
          <button
            type="button"
            onClick={onRetry}
            className="mt-2 inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-50"
            style={{ fontFamily: fontDisplay }}
          >
            <RefreshCw className="h-2.5 w-2.5" />
            Try again
          </button>
        </div>
      </div>
    </div>
  );
}

function EmptyCampaigns({ onNewCampaign }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 bg-white px-5 py-8 text-center">
      <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-[#EFF6FF] text-[#3B82F6] ring-1 ring-[#BFDBFE]">
        <Send className="h-5 w-5" />
      </div>
      <div
        className="text-[14px] font-bold text-[#0F172A]"
        style={{ fontFamily: fontDisplay }}
      >
        No campaigns yet
      </div>
      <p
        className="mx-auto mt-1 max-w-md text-[12px] text-slate-500"
        style={{ fontFamily: fontBody }}
      >
        Pick a starter play above or build a sequence from scratch.
      </p>
      <button
        type="button"
        onClick={onNewCampaign}
        className="mt-3 inline-flex items-center gap-1 rounded-md bg-gradient-to-b from-[#3B82F6] to-[#2563EB] px-3 py-1.5 text-[11px] font-semibold text-white shadow-[0_1px_4px_rgba(59,130,246,0.3)]"
        style={{ fontFamily: fontDisplay }}
      >
        <Plus className="h-2.5 w-2.5" />
        New campaign
        <ArrowRight className="h-2.5 w-2.5" />
      </button>
    </div>
  );
}

export default function CampaignsPage() {
  const navigate = useNavigate();
  const { campaigns, loading, error, refresh } = useCampaigns();
  const [filter, setFilter] = useState("all");
  const [pendingAction, setPendingAction] = useState(null); // { type, campaign }
  const [actionBusy, setActionBusy] = useState(false);
  const [toast, setToast] = useState(null);

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
    (campaign) => {
      // Row-click + Edit menu both route here. If we have a campaign id,
      // open the builder in edit mode so the existing data hydrates.
      const id = campaign?.id;
      const url = id
        ? `/app/campaigns/new?edit=${encodeURIComponent(id)}`
        : "/app/campaigns/new";
      navigate(url);
    },
    [navigate],
  );

  const flashToast = useCallback((message, tone = "success") => {
    setToast({ message, tone });
    window.setTimeout(() => setToast(null), 2200);
  }, []);

  const performAction = useCallback(
    async (type, campaign) => {
      setActionBusy(true);
      try {
        if (type === "archive") {
          await archiveCampaign(campaign.id);
          flashToast(`Archived "${campaign.name}".`);
        } else if (type === "unarchive") {
          await unarchiveCampaign(campaign.id);
          flashToast(`Restored "${campaign.name}" to draft.`);
        } else if (type === "pause") {
          await pauseCampaign(campaign.id);
          flashToast(`Paused "${campaign.name}".`);
        } else if (type === "resume") {
          await resumeCampaign(campaign.id);
          flashToast(`Resumed "${campaign.name}".`);
        } else if (type === "delete") {
          await deleteCampaign(campaign.id);
          flashToast(`Deleted "${campaign.name}".`, "danger");
        }
        await refresh();
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Action failed.";
        flashToast(msg, "danger");
      } finally {
        setActionBusy(false);
        setPendingAction(null);
      }
    },
    [refresh, flashToast],
  );

  const handleRowAction = useCallback(
    (action, campaign) => {
      if (action === "edit") {
        handleOpenCampaign(campaign);
        return;
      }
      // Destructive actions go through a confirm dialog.
      if (action === "delete" || action === "archive") {
        setPendingAction({ type: action, campaign });
        return;
      }
      // Pause/resume/unarchive are reversible — execute immediately.
      void performAction(action, campaign);
    },
    [handleOpenCampaign, performAction],
  );

  const counts = useMemo(() => filterCounts(campaigns), [campaigns]);
  const visible = useMemo(
    () => applyFilter(campaigns, filter),
    [campaigns, filter],
  );

  return (
    <div className="min-h-full bg-[#F8FAFC]">
      <div className="mx-auto w-full max-w-[1500px] px-3 py-3 md:px-5 md:py-4">
        <PageHeader
          onNewCampaign={() => handleNewCampaign(null)}
          onOpenAnalytics={handleOpenAnalytics}
        />

        {loading ? (
          <LoadingSkeleton />
        ) : error ? (
          <ErrorCard message={error} onRetry={refresh} />
        ) : (
          <div className="space-y-4">
            <PulseBar campaigns={campaigns} />

            <section>
              <SectionHead
                title="Start from a play"
                subtitle="Industry-aware sequences. Pick one to seed a new campaign."
              />
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
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
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap gap-1">
                  {FILTERS.map((f) => {
                    const isActive = filter === f.k;
                    const count = counts[f.k] ?? 0;
                    return (
                      <button
                        key={f.k}
                        type="button"
                        onClick={() => setFilter(f.k)}
                        className="rounded-full px-2.5 py-0.5 text-[10px] font-semibold transition"
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
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    disabled
                    title="Filter by owner — coming soon"
                    className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-400"
                    style={{ fontFamily: fontDisplay }}
                  >
                    <Filter className="h-2 w-2" />
                    Owner: All
                  </button>
                </div>
              </div>

              {campaigns.length === 0 ? (
                <EmptyCampaigns onNewCampaign={() => handleNewCampaign(null)} />
              ) : visible.length === 0 ? (
                <div
                  className="rounded-lg border border-dashed border-slate-200 bg-white px-4 py-6 text-center text-[12px] text-slate-500"
                  style={{ fontFamily: fontBody }}
                >
                  No campaigns match this filter.
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {visible.map((c) => (
                    <CampaignRow
                      key={c.id || c.name}
                      campaign={c}
                      onOpen={handleOpenCampaign}
                      onAction={handleRowAction}
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

      <ConfirmDialog
        open={pendingAction?.type === "delete"}
        title="Delete this campaign?"
        message={`"${pendingAction?.campaign?.name ?? ""}" will be permanently removed along with its sequence steps. Outreach history (sent emails) is preserved.`}
        confirmLabel="Delete"
        destructive
        busy={actionBusy}
        onCancel={() => setPendingAction(null)}
        onConfirm={() => performAction("delete", pendingAction.campaign)}
      />
      <ConfirmDialog
        open={pendingAction?.type === "archive"}
        title="Archive this campaign?"
        message={`"${pendingAction?.campaign?.name ?? ""}" will move to Archived. You can restore it from the actions menu.`}
        confirmLabel="Archive"
        busy={actionBusy}
        onCancel={() => setPendingAction(null)}
        onConfirm={() => performAction("archive", pendingAction.campaign)}
      />

      {toast ? (
        <div
          className="fixed bottom-5 right-5 z-50 rounded-md px-3.5 py-2 text-[12px] font-semibold text-white shadow-[0_8px_24px_rgba(15,23,42,0.3)]"
          style={{
            fontFamily: fontDisplay,
            background:
              toast.tone === "danger"
                ? "linear-gradient(180deg,#EF4444,#DC2626)"
                : "linear-gradient(180deg,#10B981,#059669)",
          }}
        >
          {toast.message}
        </div>
      ) : null}
    </div>
  );
}
