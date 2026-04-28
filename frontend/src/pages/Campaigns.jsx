import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, ArrowRight, RefreshCw, Send } from "lucide-react";
import { api } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import { listEmailAccounts, getPrimaryEmailAccount } from "@/lib/api";
import CampaignCard from "@/components/campaigns/CampaignCard";
import CampaignStatsRibbon from "@/components/campaigns/CampaignStatsRibbon";
import CampaignReadinessCard from "@/components/campaigns/CampaignReadinessCard";
import CampaignEmptyState from "@/components/campaigns/CampaignEmptyState";

// ---------------------------------------------------------------------------
// Phase B rewrite — Outbound Engine list / overview page.
//
//   * Real data only: `api.getCrmCampaigns()` for campaigns, Phase A helpers
//     for inbox readiness, supabase.from('lit_saved_companies') for the
//     "Add companies" step count.
//   * No hardcoded metrics. No stub sequence builder. No fake templates.
//     No manual `campaign_email_id` test box.
//   * Internal `AccessFallback` / `canAccessFeature` check removed — route
//     `RequirePlan` already gates this page per App.jsx. Keeping the check
//     here would double-gate and was the source of the enterprise
//     misread before the Tier-1 plan fix.
//   * New Campaign CTA navigates to `/app/campaigns/new` (unchanged route).
//   * Builder / Templates / Analytics tabs removed — those belonged to the
//     builder (Phase C) and detail page (Phase D). Keeping them here was
//     confusing the UX.
// ---------------------------------------------------------------------------

const asArray = (data) => {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.rows)) return data.rows;
  if (Array.isArray(data?.data)) return data.data;
  return [];
};

function extractRecipientCount(campaign) {
  const m = campaign?.metrics && typeof campaign.metrics === "object" ? campaign.metrics : {};
  const candidates = [
    m.recipients,
    m.recipient_count,
    m.contacts,
    m.contact_count,
    campaign?.recipient_count,
    campaign?.contact_count,
  ];
  for (const value of candidates) {
    const num = Number(value);
    if (Number.isFinite(num) && num >= 0) return num;
  }
  return null;
}

function PageHeader({ onNewCampaign, onOpenBilling }) {
  return (
    <header className="mb-6 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-indigo-600">
          Engage · Outbound
        </p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-900">
          Outbound Engine
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-500">
          Reach shippers with sequenced outreach across email and LinkedIn.
          Pull target companies from Command Center, build a step-by-step
          sequence, and launch when your inbox is connected.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onOpenBilling}
          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
        >
          View usage
        </button>
        <button
          type="button"
          onClick={onNewCampaign}
          className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:from-blue-700 hover:to-indigo-700"
        >
          <Send className="h-4 w-4" />
          New campaign
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </header>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      <div className="h-24 animate-pulse rounded-3xl bg-slate-100" />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-28 animate-pulse rounded-2xl bg-slate-100" />
        ))}
      </div>
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-32 animate-pulse rounded-2xl bg-slate-100" />
        ))}
      </div>
    </div>
  );
}

function ErrorCard({ message, onRetry }) {
  return (
    <div className="rounded-3xl border border-rose-200 bg-rose-50/60 p-6 shadow-sm">
      <div className="flex items-start gap-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-rose-100 text-rose-600 ring-1 ring-rose-200">
          <AlertTriangle className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold text-slate-900">
            Couldn&rsquo;t load your campaigns
          </h3>
          <p className="mt-1 text-sm text-slate-600">
            {message || "Something went wrong fetching campaigns from the server."}
          </p>
          <button
            type="button"
            onClick={onRetry}
            className="mt-4 inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            <RefreshCw className="h-4 w-4" />
            Try again
          </button>
        </div>
      </div>
    </div>
  );
}

export default function CampaignsPage() {
  const navigate = useNavigate();
  const [campaigns, setCampaigns] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const [savedCompaniesCount, setSavedCompaniesCount] = useState(0);
  const [primaryInboxEmail, setPrimaryInboxEmail] = useState(null);
  const [inboxStatusKnown, setInboxStatusKnown] = useState(false);

  const loadCampaigns = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const resp = await api.getCrmCampaigns();
      setCampaigns(asArray(resp));
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to load campaigns.";
      setError(msg);
      setCampaigns([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Secondary (non-blocking) loaders: saved-companies count + inbox status.
  // Failures here never block the page render — readiness card falls back
  // to honest "not connected yet" / "0 saved" states.
  const loadReadinessSignals = useCallback(async () => {
    try {
      const { count } = await supabase
        .from("lit_saved_companies")
        .select("id", { count: "exact", head: true });
      setSavedCompaniesCount(count ?? 0);
    } catch {
      setSavedCompaniesCount(0);
    }

    try {
      const primary = await getPrimaryEmailAccount();
      if (primary?.email) {
        setPrimaryInboxEmail(primary.email);
        setInboxStatusKnown(true);
      } else {
        // Fall back to full list; maybe a connected-but-not-primary row exists.
        const list = await listEmailAccounts();
        const connected = (list || []).find((a) => a.status === "connected");
        setPrimaryInboxEmail(connected?.email ?? null);
        setInboxStatusKnown(true);
      }
    } catch {
      // Phase A migration may not yet be applied on the target Supabase
      // project — the lit_email_accounts table returns "relation does not
      // exist". Surface an honest "not available yet" state instead of
      // crashing the page.
      setPrimaryInboxEmail(null);
      setInboxStatusKnown(false);
    }
  }, []);

  useEffect(() => {
    void loadCampaigns();
    void loadReadinessSignals();
  }, [loadCampaigns, loadReadinessSignals]);

  const summary = useMemo(() => {
    let active = 0;
    let draft = 0;
    let recipientsKnown = false;
    let recipientsTotal = 0;
    for (const c of campaigns) {
      const status = String(c?.status || "draft").toLowerCase();
      if (status === "active") active += 1;
      else if (status === "draft") draft += 1;
      const recipients = extractRecipientCount(c);
      if (recipients !== null) {
        recipientsKnown = true;
        recipientsTotal += recipients;
      }
    }
    return {
      total: campaigns.length,
      active,
      draft,
      recipientsKnown,
      recipientsTotal,
    };
  }, [campaigns]);

  const handleNewCampaign = useCallback(() => {
    navigate("/app/campaigns/new");
  }, [navigate]);

  const handleOpenCommandCenter = useCallback(() => {
    navigate("/app/command-center");
  }, [navigate]);

  const handleConnectInbox = useCallback(() => {
    // Outreach / inbox connection is managed from Settings today; Phase E
    // will replace this with a real Gmail OAuth flow.
    navigate("/app/settings");
  }, [navigate]);

  const handleOpenBilling = useCallback(() => {
    navigate("/app/billing");
  }, [navigate]);

  return (
    <div className="min-h-full bg-slate-100 p-4 md:p-6 xl:p-8">
      <div className="mx-auto max-w-[1200px]">
        <PageHeader
          onNewCampaign={handleNewCampaign}
          onOpenBilling={handleOpenBilling}
        />

        {isLoading ? (
          <LoadingSkeleton />
        ) : error ? (
          <ErrorCard message={error} onRetry={loadCampaigns} />
        ) : (
          <div className="space-y-6">
            <CampaignReadinessCard
              savedCompaniesCount={savedCompaniesCount}
              campaignsCount={summary.total}
              activeCampaignsCount={summary.active}
              primaryInboxEmail={primaryInboxEmail}
              inboxStatusKnown={inboxStatusKnown}
              onOpenCommandCenter={handleOpenCommandCenter}
              onNewCampaign={handleNewCampaign}
              onConnectInbox={handleConnectInbox}
            />

            <CampaignStatsRibbon
              totalCampaigns={summary.total}
              activeCampaigns={summary.active}
              draftCampaigns={summary.draft}
              totalRecipients={summary.recipientsTotal}
              recipientsKnown={summary.recipientsKnown}
            />

            {campaigns.length === 0 ? (
              <CampaignEmptyState onNewCampaign={handleNewCampaign} />
            ) : (
              <section>
                <div className="mb-3 flex items-end justify-between">
                  <h2 className="text-base font-semibold text-slate-900">
                    Your campaigns
                  </h2>
                  <span className="text-xs text-slate-400">
                    {campaigns.length} total
                  </span>
                </div>
                <div className="grid gap-3">
                  {campaigns.map((campaign) => (
                    <CampaignCard
                      key={campaign.id ?? campaign.name ?? Math.random()}
                      campaign={campaign}
                    />
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
