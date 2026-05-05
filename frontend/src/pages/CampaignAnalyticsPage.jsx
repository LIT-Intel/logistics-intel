// CampaignAnalyticsPage — workspace-level analytics overview for outbound.
//
// Reads from public.lit_campaign_contacts (the recipient roster). Each
// row carries one recipient's lifecycle through one campaign. Status
// values: pending, queued, sent, delivered, opened, clicked, replied,
// bounced, unsubscribed, failed, skipped, completed.
//
// Renders three sections:
//   1. Top-level metric cards (sent / opened / clicked / replied)
//   2. Per-status breakdown bar
//   3. Per-campaign table
//
// Empty state when there are no recipients yet — clearly tells the
// user to launch their first campaign instead of showing zeros.

import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  BarChart3,
  Mail,
  MailOpen,
  MousePointer,
  MessageSquare,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/auth/AuthProvider";

const STATUS_TONES = {
  pending: { bg: "#F1F5F9", fg: "#64748b", label: "Pending" },
  queued: { bg: "#DBEAFE", fg: "#1d4ed8", label: "Queued" },
  sent: { bg: "#DBEAFE", fg: "#1d4ed8", label: "Sent" },
  delivered: { bg: "#D1FAE5", fg: "#065f46", label: "Delivered" },
  opened: { bg: "#D1FAE5", fg: "#065f46", label: "Opened" },
  clicked: { bg: "#EDE9FE", fg: "#5b21b6", label: "Clicked" },
  replied: { bg: "#FEF3C7", fg: "#92400e", label: "Replied" },
  bounced: { bg: "#FECACA", fg: "#991b1b", label: "Bounced" },
  unsubscribed: { bg: "#FECACA", fg: "#991b1b", label: "Unsubscribed" },
  failed: { bg: "#FECACA", fg: "#991b1b", label: "Failed" },
  skipped: { bg: "#F1F5F9", fg: "#64748b", label: "Skipped" },
  completed: { bg: "#D1FAE5", fg: "#065f46", label: "Completed" },
};

const SENT_LIKE = new Set(["sent", "delivered", "opened", "clicked", "replied", "completed"]);

function pct(num, denom) {
  if (!denom) return 0;
  return Math.round((num / denom) * 1000) / 10;
}

export default function CampaignAnalyticsPage() {
  const navigate = useNavigate();
  const { orgId } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [recipients, setRecipients] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [events, setEvents] = useState([]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!orgId) return;
      setLoading(true);
      setError(null);
      try {
        const { data: members, error: membersErr } = await supabase
          .from("org_members")
          .select("user_id")
          .eq("org_id", orgId);
        if (membersErr) throw membersErr;
        const orgUserIds = (members ?? [])
          .map((m) => m.user_id)
          .filter(Boolean);

        const recPromise = supabase
          .from("lit_campaign_contacts")
          .select("id,campaign_id,status")
          .eq("org_id", orgId);
        const campPromise = orgUserIds.length
          ? supabase
              .from("lit_campaigns")
              .select("id,name,status,created_at")
              .in("user_id", orgUserIds)
              .order("created_at", { ascending: false })
          : Promise.resolve({ data: [], error: null });
        // Pull every send / open / click / reply / bounce event for this
        // org's campaigns. Recipient roster status only captures the
        // CURRENT lifecycle phase; history captures every transition.
        const eventsPromise = orgUserIds.length
          ? supabase
              .from("lit_outreach_history")
              .select("campaign_id,event_type,occurred_at")
              .in("user_id", orgUserIds)
              .in("event_type", ["sent", "opened", "clicked", "replied", "bounced"])
          : Promise.resolve({ data: [], error: null });

        const [recRes, campRes, evtRes] = await Promise.all([
          recPromise,
          campPromise,
          eventsPromise,
        ]);
        if (cancelled) return;
        if (recRes.error) throw recRes.error;
        if (campRes.error) throw campRes.error;
        if (evtRes.error) throw evtRes.error;
        setRecipients(recRes.data ?? []);
        setCampaigns(campRes.data ?? []);
        setEvents(evtRes.data ?? []);
      } catch (e) {
        if (!cancelled) setError(e?.message || "Failed to load analytics");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  const eventCounts = useMemo(() => {
    const total = { sent: 0, opened: 0, clicked: 0, replied: 0, bounced: 0 };
    const perCampaign = new Map();
    for (const e of events) {
      const evt = e.event_type;
      if (evt in total) total[evt] += 1;
      if (e.campaign_id) {
        const bucket =
          perCampaign.get(e.campaign_id) ||
          { sent: 0, opened: 0, clicked: 0, replied: 0, bounced: 0 };
        if (evt in bucket) bucket[evt] += 1;
        perCampaign.set(e.campaign_id, bucket);
      }
    }
    return { total, perCampaign };
  }, [events]);

  const totals = useMemo(() => {
    const counts = {};
    for (const r of recipients) counts[r.status] = (counts[r.status] || 0) + 1;
    const total = recipients.length;
    // Events are the source of truth for sends + opens + clicks + replies.
    // Recipient status only carries the CURRENT phase, so a recipient who
    // got step 1 sent + step 2 sent + replied still shows status=replied,
    // hiding the two earlier sends. Counting events surfaces them all.
    const sent = eventCounts.total.sent;
    const opened = eventCounts.total.opened;
    const clicked = eventCounts.total.clicked;
    const replied = eventCounts.total.replied;
    const bounced = eventCounts.total.bounced;
    return {
      total,
      counts,
      sent,
      opened,
      clicked,
      replied,
      bounced,
      unsubscribed: counts.unsubscribed || 0,
      openRate: pct(opened, sent),
      clickRate: pct(clicked, sent),
      replyRate: pct(replied, sent),
      bounceRate: pct(bounced, sent),
    };
  }, [recipients, eventCounts]);

  const perCampaign = useMemo(() => {
    const byId = new Map();
    for (const c of campaigns) {
      byId.set(c.id, {
        id: c.id,
        name: c.name,
        status: c.status,
        created_at: c.created_at,
        total: 0,
        sent: 0,
        opened: 0,
        clicked: 0,
        replied: 0,
        bounced: 0,
      });
    }
    // Recipient roster gives us "Recipients" (total queued).
    for (const r of recipients) {
      const row = byId.get(r.campaign_id);
      if (row) row.total += 1;
    }
    // Sent / open / click / reply / bounce come from history events so the
    // table reflects every step delivered — not just the recipient's
    // current lifecycle phase.
    for (const [campaignId, bucket] of eventCounts.perCampaign) {
      const row = byId.get(campaignId);
      if (!row) continue;
      row.sent += bucket.sent;
      row.opened += bucket.opened;
      row.clicked += bucket.clicked;
      row.replied += bucket.replied;
      row.bounced += bucket.bounced;
    }
    return Array.from(byId.values());
  }, [campaigns, recipients, eventCounts]);

  return (
    <div className="min-h-full bg-[#F8FAFC]">
      <div className="mx-auto w-full max-w-[1500px] px-3 py-4 md:px-5 md:py-6">
        <div className="mb-4 flex items-center gap-2">
          <button
            type="button"
            onClick={() => navigate("/app/campaigns")}
            className="flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
            aria-label="Back to campaigns"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
          </button>
          <div>
            <div className="flex items-center gap-2 text-[15px] font-bold text-[#0F172A]">
              <BarChart3 className="h-4 w-4 text-blue-600" />
              Campaign analytics
            </div>
            <div className="text-[11px] text-slate-500">
              Live numbers from the recipient roster — opens, clicks, replies, bounces.
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center rounded-xl border border-slate-200 bg-white py-16">
            <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
          </div>
        ) : error ? (
          <div className="flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-[13px] text-rose-700">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <div className="font-semibold">Couldn't load analytics</div>
              <div className="mt-1 font-mono text-[11.5px]">{error}</div>
            </div>
          </div>
        ) : totals.total === 0 && events.length === 0 ? (
          <EmptyState onCreate={() => navigate("/app/campaigns/new")} />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <MetricCard
                label="Sent"
                value={totals.sent}
                hint={`${totals.total} recipient${totals.total === 1 ? "" : "s"} total`}
                Icon={Mail}
                tone="#1d4ed8"
              />
              <MetricCard
                label="Open rate"
                value={`${totals.openRate}%`}
                hint={`${totals.opened} opens`}
                Icon={MailOpen}
                tone="#15803d"
              />
              <MetricCard
                label="Click rate"
                value={`${totals.clickRate}%`}
                hint={`${totals.clicked} clicks`}
                Icon={MousePointer}
                tone="#7c3aed"
              />
              <MetricCard
                label="Reply rate"
                value={`${totals.replyRate}%`}
                hint={`${totals.replied} replies`}
                Icon={MessageSquare}
                tone="#b45309"
              />
            </div>

            <section className="mt-5 rounded-xl border border-slate-200 bg-white">
              <div className="border-b border-slate-100 px-4 py-3">
                <div className="text-[12px] font-bold uppercase tracking-wider text-slate-500">
                  Status breakdown
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5 px-4 py-3">
                {Object.entries(totals.counts)
                  .sort(([, a], [, b]) => b - a)
                  .map(([status, count]) => {
                    const tone = STATUS_TONES[status] || STATUS_TONES.pending;
                    return (
                      <span
                        key={status}
                        className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11.5px] font-semibold"
                        style={{ background: tone.bg, color: tone.fg }}
                      >
                        {tone.label}
                        <span className="opacity-70">·</span>
                        <span>{count}</span>
                      </span>
                    );
                  })}
              </div>
            </section>

            <section className="mt-5 rounded-xl border border-slate-200 bg-white">
              <div className="border-b border-slate-100 px-4 py-3">
                <div className="text-[12px] font-bold uppercase tracking-wider text-slate-500">
                  Per campaign
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-left text-[12.5px]">
                  <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500">
                    <tr>
                      <th className="px-4 py-2.5 font-semibold">Campaign</th>
                      <th className="px-3 py-2.5 font-semibold">Status</th>
                      <th className="px-3 py-2.5 text-right font-semibold">Recipients</th>
                      <th className="px-3 py-2.5 text-right font-semibold">Sent</th>
                      <th className="px-3 py-2.5 text-right font-semibold">Open</th>
                      <th className="px-3 py-2.5 text-right font-semibold">Click</th>
                      <th className="px-3 py-2.5 text-right font-semibold">Reply</th>
                      <th className="px-3 py-2.5 text-right font-semibold">Bounce</th>
                    </tr>
                  </thead>
                  <tbody>
                    {perCampaign.map((c) => (
                      <tr
                        key={c.id}
                        className="cursor-pointer border-t border-slate-100 hover:bg-slate-50"
                        onClick={() => navigate(`/app/campaigns/new?edit=${encodeURIComponent(c.id)}`)}
                      >
                        <td className="px-4 py-2.5 font-semibold text-[#0F172A]">{c.name}</td>
                        <td className="px-3 py-2.5 text-slate-600">{c.status}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">{c.total}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">{c.sent}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">{c.opened}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">{c.clicked}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">{c.replied}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">{c.bounced}</td>
                      </tr>
                    ))}
                    {perCampaign.length === 0 && (
                      <tr>
                        <td colSpan={8} className="px-4 py-6 text-center text-slate-500">
                          No campaigns yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}

function MetricCard({ label, value, hint, Icon, tone }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
        <Icon className="h-3.5 w-3.5" style={{ color: tone }} />
        {label}
      </div>
      <div className="mt-2 text-[22px] font-bold text-[#0F172A]" style={{ color: tone }}>
        {value}
      </div>
      <div className="mt-0.5 text-[11px] text-slate-500">{hint}</div>
    </div>
  );
}

function EmptyState({ onCreate }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-white px-6 py-12 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-50">
        <BarChart3 className="h-5 w-5 text-blue-600" />
      </div>
      <div className="mt-3 text-[14px] font-bold text-[#0F172A]">No campaign activity yet</div>
      <p className="mt-1 max-w-md text-[12.5px] text-slate-500">
        Once a campaign launches and recipients are queued, this dashboard fills with
        live send, open, click, reply and bounce numbers from the roster.
      </p>
      <button
        type="button"
        onClick={onCreate}
        className="mt-4 rounded-md bg-gradient-to-b from-[#3B82F6] to-[#2563EB] px-3.5 py-1.5 text-[12px] font-semibold text-white shadow-sm"
      >
        Create your first campaign
      </button>
    </div>
  );
}
