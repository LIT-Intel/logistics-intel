// CampaignAnalyticsPage — workspace-level analytics overview for outbound.
//
// Source-of-truth: lit_outreach_history (engagement events) joined with
// lit_campaigns (definition) and lit_campaign_contacts (recipient state).
// Recipient.status is dispatcher-state-only and is not used for engagement
// counts — events drive the funnel.
//
// Sections:
//   1. KPI strip — Sent / Open rate / Click rate / Reply rate / Bounce rate
//      + secondary chips (Recipients, Active campaigns, Replies, Last activity).
//   2. Time-range filter (7d / 30d / MTD / All).
//   3. Recent activity feed — latest 10 events of any engagement type.
//   4. Per-campaign table with rates + click-through into a per-campaign
//      drill-down (expandable row) showing per-step funnel + recent events.

import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  BarChart3,
  ChevronDown,
  ChevronRight,
  Mail,
  MailOpen,
  MessageSquare,
  MousePointer,
  Reply,
  Send,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/auth/AuthProvider";

function pct(num, denom) {
  if (!denom) return 0;
  return Math.round((num / denom) * 1000) / 10;
}

const RANGE_OPTIONS = [
  { id: "7d", label: "Last 7 days", ms: 7 * 24 * 60 * 60 * 1000 },
  { id: "30d", label: "Last 30 days", ms: 30 * 24 * 60 * 60 * 1000 },
  { id: "mtd", label: "This month", ms: null },
  { id: "all", label: "All time", ms: null },
];

function rangeStartIso(rangeId) {
  if (rangeId === "all") return null;
  if (rangeId === "mtd") {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1).toISOString();
  }
  const opt = RANGE_OPTIONS.find((r) => r.id === rangeId);
  if (!opt?.ms) return null;
  return new Date(Date.now() - opt.ms).toISOString();
}

function fmtAbsolute(date) {
  return new Date(date).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function fmtAgo(date) {
  const ms = Date.now() - new Date(date).getTime();
  if (ms < 60_000) return "just now";
  const m = Math.floor(ms / 60_000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

const EVENT_LABEL = {
  sent: { label: "Sent", color: "#1d4ed8", bg: "#DBEAFE", Icon: Send },
  opened: { label: "Opened", color: "#15803d", bg: "#DCFCE7", Icon: MailOpen },
  clicked: { label: "Clicked", color: "#7c3aed", bg: "#EDE9FE", Icon: MousePointer },
  replied: { label: "Replied", color: "#b45309", bg: "#FEF3C7", Icon: Reply },
  bounced: { label: "Bounced", color: "#991b1b", bg: "#FECACA", Icon: AlertTriangle },
  send_failed: { label: "Failed", color: "#991b1b", bg: "#FECACA", Icon: AlertTriangle },
  suppressed: { label: "Suppressed", color: "#64748b", bg: "#F1F5F9", Icon: AlertTriangle },
};

export default function CampaignAnalyticsPage() {
  const navigate = useNavigate();
  const { orgId } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [recipients, setRecipients] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [events, setEvents] = useState([]);
  const [rangeId, setRangeId] = useState("30d");
  const [expanded, setExpanded] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!orgId) return;
      setLoading(true);
      setError(null);
      try {
        const { data: members, error: membersErr } = await supabase
          .from("org_members").select("user_id").eq("org_id", orgId);
        if (membersErr) throw membersErr;
        const orgUserIds = (members ?? []).map((m) => m.user_id).filter(Boolean);

        const recPromise = supabase
          .from("lit_campaign_contacts")
          .select("id,campaign_id,email,status,last_sent_at,next_send_at,first_name,last_name,display_name,company_id")
          .eq("org_id", orgId);
        const campPromise = orgUserIds.length
          ? supabase.from("lit_campaigns").select("id,name,status,created_at,user_id").in("user_id", orgUserIds).order("created_at", { ascending: false })
          : Promise.resolve({ data: [], error: null });
        const startIso = rangeStartIso(rangeId);
        let evtQuery = supabase
          .from("lit_outreach_history")
          .select("id,campaign_id,campaign_step_id,event_type,occurred_at,subject,metadata,error_message")
          .in("event_type", ["sent", "opened", "clicked", "replied", "bounced", "send_failed", "suppressed"]);
        if (orgUserIds.length) evtQuery = evtQuery.in("user_id", orgUserIds);
        if (startIso) evtQuery = evtQuery.gte("occurred_at", startIso);
        const eventsPromise = orgUserIds.length ? evtQuery.order("occurred_at", { ascending: false }).limit(2000) : Promise.resolve({ data: [], error: null });

        const [recRes, campRes, evtRes] = await Promise.all([recPromise, campPromise, eventsPromise]);
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
    return () => { cancelled = true; };
  }, [orgId, rangeId]);

  const totals = useMemo(() => {
    const counts = { sent: 0, opened: 0, clicked: 0, replied: 0, bounced: 0, send_failed: 0, suppressed: 0 };
    for (const e of events) if (e.event_type in counts) counts[e.event_type] += 1;
    return {
      sent: counts.sent,
      opened: counts.opened,
      clicked: counts.clicked,
      replied: counts.replied,
      bounced: counts.bounced,
      failed: counts.send_failed,
      suppressed: counts.suppressed,
      openRate: pct(counts.opened, counts.sent),
      clickRate: pct(counts.clicked, counts.sent),
      replyRate: pct(counts.replied, counts.sent),
      bounceRate: pct(counts.bounced, counts.sent),
      lastEventAt: events[0]?.occurred_at ?? null,
    };
  }, [events]);

  const perCampaign = useMemo(() => {
    const byId = new Map();
    for (const c of campaigns) {
      byId.set(c.id, {
        id: c.id, name: c.name, status: c.status, created_at: c.created_at,
        recipients: 0, sent: 0, opened: 0, clicked: 0, replied: 0, bounced: 0, failed: 0,
        lastEventAt: null, byStep: new Map(),
      });
    }
    for (const r of recipients) {
      const row = byId.get(r.campaign_id);
      if (row) row.recipients += 1;
    }
    for (const e of events) {
      const row = byId.get(e.campaign_id);
      if (!row) continue;
      const k = e.event_type;
      if (k === "sent") row.sent += 1;
      else if (k === "opened") row.opened += 1;
      else if (k === "clicked") row.clicked += 1;
      else if (k === "replied") row.replied += 1;
      else if (k === "bounced") row.bounced += 1;
      else if (k === "send_failed") row.failed += 1;
      if (!row.lastEventAt || new Date(e.occurred_at) > new Date(row.lastEventAt)) {
        row.lastEventAt = e.occurred_at;
      }
      if (e.campaign_step_id) {
        const step = row.byStep.get(e.campaign_step_id) ?? { sent: 0, opened: 0, clicked: 0, replied: 0 };
        if (k in step) step[k] += 1;
        row.byStep.set(e.campaign_step_id, step);
      }
    }
    return Array.from(byId.values()).sort((a, b) => {
      const ad = a.lastEventAt ? new Date(a.lastEventAt).getTime() : 0;
      const bd = b.lastEventAt ? new Date(b.lastEventAt).getTime() : 0;
      return bd - ad;
    });
  }, [campaigns, recipients, events]);

  const recentEvents = useMemo(() => events.slice(0, 12), [events]);
  const activeCampaigns = perCampaign.filter((c) => c.status === "active").length;
  const totalRecipients = recipients.length;

  const isEmpty = !loading && events.length === 0 && totalRecipients === 0;

  return (
    <div className="min-h-full bg-[#F8FAFC]">
      <div className="mx-auto w-full max-w-[1500px] px-3 py-4 md:px-5 md:py-6">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => navigate("/app/campaigns")}
            className="flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
            aria-label="Back to campaigns"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-[15px] font-bold text-[#0F172A]">
              <BarChart3 className="h-4 w-4 text-blue-600" />
              Campaign analytics
            </div>
            <div className="text-[11px] text-slate-500">
              Live from outreach history. {totals.lastEventAt ? `Last activity ${fmtAgo(totals.lastEventAt)}.` : "No activity yet in this range."}
            </div>
          </div>
          <div className="ml-auto flex items-center gap-1 rounded-md border border-slate-200 bg-white p-0.5">
            {RANGE_OPTIONS.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => setRangeId(r.id)}
                className={[
                  "rounded px-2 py-1 text-[11px] font-semibold",
                  rangeId === r.id ? "bg-blue-50 text-blue-700" : "text-slate-500 hover:text-slate-700",
                ].join(" ")}
              >
                {r.label}
              </button>
            ))}
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
        ) : isEmpty ? (
          <EmptyState onCreate={() => navigate("/app/campaigns/new")} />
        ) : (
          <>
            {/* KPI strip — primary */}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5">
              <KpiCard label="Sent" value={totals.sent.toLocaleString()} hint={`${totalRecipients} recipient${totalRecipients === 1 ? "" : "s"}`} Icon={Send} tone="#1d4ed8" />
              <KpiCard label="Open rate" value={`${totals.openRate}%`} hint={`${totals.opened} opens`} Icon={MailOpen} tone="#15803d" />
              <KpiCard label="Click rate" value={`${totals.clickRate}%`} hint={`${totals.clicked} clicks`} Icon={MousePointer} tone="#7c3aed" />
              <KpiCard label="Reply rate" value={`${totals.replyRate}%`} hint={`${totals.replied} replies`} Icon={Reply} tone="#b45309" />
              <KpiCard label="Bounce rate" value={`${totals.bounceRate}%`} hint={`${totals.bounced} bounces`} Icon={AlertTriangle} tone={totals.bounced > 0 ? "#991b1b" : "#64748b"} />
            </div>

            {/* Secondary chips */}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Chip>{activeCampaigns} active campaign{activeCampaigns === 1 ? "" : "s"}</Chip>
              <Chip>{perCampaign.length} total</Chip>
              {totals.failed > 0 ? <Chip tone="rose">{totals.failed} send failure{totals.failed === 1 ? "" : "s"}</Chip> : null}
              {totals.suppressed > 0 ? <Chip tone="slate">{totals.suppressed} suppressed</Chip> : null}
            </div>

            {/* Two-column lower: recent activity + per-campaign table */}
            <div className="mt-5 grid gap-4 lg:grid-cols-[280px_1fr]">
              <section className="rounded-xl border border-slate-200 bg-white">
                <div className="border-b border-slate-100 px-4 py-3">
                  <div className="text-[12px] font-bold uppercase tracking-wider text-slate-500">Recent activity</div>
                </div>
                <ul className="max-h-[420px] divide-y divide-slate-100 overflow-y-auto">
                  {recentEvents.length === 0 ? (
                    <li className="px-4 py-6 text-center text-[12px] text-slate-500">No engagement events in this range.</li>
                  ) : (
                    recentEvents.map((e) => {
                      const meta = EVENT_LABEL[e.event_type] || EVENT_LABEL.sent;
                      const Icon = meta.Icon;
                      const recipient = e.metadata?.recipient_email || e.metadata?.recipient_id?.slice(0, 8) || "—";
                      return (
                        <li key={e.id} className="flex items-start gap-2 px-3 py-2">
                          <span
                            className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded"
                            style={{ background: meta.bg, color: meta.color }}
                          >
                            <Icon className="h-3 w-3" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-baseline justify-between gap-2 text-[11.5px]">
                              <span className="truncate font-semibold text-[#0F172A]">{meta.label}</span>
                              <span className="shrink-0 text-[10px] text-slate-400">{fmtAgo(e.occurred_at)}</span>
                            </div>
                            <div className="truncate text-[11px] text-slate-500">{recipient}</div>
                            {e.subject ? <div className="truncate text-[10.5px] text-slate-400">{e.subject}</div> : null}
                          </div>
                        </li>
                      );
                    })
                  )}
                </ul>
              </section>

              <section className="rounded-xl border border-slate-200 bg-white">
                <div className="border-b border-slate-100 px-4 py-3">
                  <div className="text-[12px] font-bold uppercase tracking-wider text-slate-500">Per campaign</div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[720px] text-left text-[12px]">
                    <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500">
                      <tr>
                        <th className="px-3 py-2 font-semibold"></th>
                        <th className="px-3 py-2 font-semibold">Campaign</th>
                        <th className="px-3 py-2 font-semibold">Status</th>
                        <th className="px-2 py-2 text-right font-semibold">Recip</th>
                        <th className="px-2 py-2 text-right font-semibold">Sent</th>
                        <th className="px-2 py-2 text-right font-semibold">Open%</th>
                        <th className="px-2 py-2 text-right font-semibold">Click%</th>
                        <th className="px-2 py-2 text-right font-semibold">Reply%</th>
                        <th className="px-2 py-2 text-right font-semibold">Bounce%</th>
                        <th className="px-2 py-2 text-right font-semibold">Last</th>
                      </tr>
                    </thead>
                    <tbody>
                      {perCampaign.length === 0 ? (
                        <tr><td colSpan={10} className="px-4 py-6 text-center text-slate-500">No campaigns yet.</td></tr>
                      ) : perCampaign.map((c) => (
                        <React.Fragment key={c.id}>
                          <tr
                            className="cursor-pointer border-t border-slate-100 hover:bg-slate-50"
                            onClick={() => setExpanded(expanded === c.id ? null : c.id)}
                          >
                            <td className="px-3 py-2 align-top text-slate-400">
                              {expanded === c.id ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                            </td>
                            <td className="px-3 py-2 font-semibold text-[#0F172A]">{c.name}</td>
                            <td className="px-3 py-2 text-slate-600">{c.status}</td>
                            <td className="px-2 py-2 text-right tabular-nums text-slate-700">{c.recipients}</td>
                            <td className="px-2 py-2 text-right tabular-nums font-semibold text-blue-700">{c.sent}</td>
                            <td className="px-2 py-2 text-right tabular-nums text-emerald-700">{pct(c.opened, c.sent)}%</td>
                            <td className="px-2 py-2 text-right tabular-nums text-violet-700">{pct(c.clicked, c.sent)}%</td>
                            <td className="px-2 py-2 text-right tabular-nums text-amber-700">{pct(c.replied, c.sent)}%</td>
                            <td className="px-2 py-2 text-right tabular-nums text-rose-700">{pct(c.bounced, c.sent)}%</td>
                            <td className="px-2 py-2 text-right tabular-nums text-[10px] text-slate-500">
                              {c.lastEventAt ? fmtAgo(c.lastEventAt) : "—"}
                            </td>
                          </tr>
                          {expanded === c.id ? (
                            <tr className="bg-slate-50/60">
                              <td colSpan={10} className="px-4 py-3">
                                <CampaignDetail campaign={c} events={events.filter((e) => e.campaign_id === c.id)} navigate={navigate} />
                              </td>
                            </tr>
                          ) : null}
                        </React.Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function KpiCard({ label, value, hint, Icon, tone }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3.5">
      <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">
        <Icon className="h-3 w-3" style={{ color: tone }} />
        {label}
      </div>
      <div className="mt-1.5 text-[20px] font-bold leading-none" style={{ color: tone }}>{value}</div>
      <div className="mt-1 text-[10.5px] text-slate-500">{hint}</div>
    </div>
  );
}

function Chip({ children, tone = "slate" }) {
  const map = {
    slate: "border-slate-200 bg-slate-50 text-slate-700",
    rose: "border-rose-200 bg-rose-50 text-rose-700",
  };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10.5px] font-semibold ${map[tone] || map.slate}`}>
      {children}
    </span>
  );
}

function CampaignDetail({ campaign, events, navigate }) {
  const recent = events.slice(0, 8);
  const stepCounts = Array.from(campaign.byStep.entries());
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <div>
        <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">Per-step funnel</div>
        {stepCounts.length === 0 ? (
          <div className="text-[11px] text-slate-500">No engagement events yet.</div>
        ) : (
          <ul className="space-y-1">
            {stepCounts.map(([stepId, c], i) => (
              <li key={stepId} className="flex items-center justify-between gap-2 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-[11px]">
                <span className="font-mono text-[10px] text-slate-400">Step {i + 1}</span>
                <span className="ml-auto inline-flex gap-2 tabular-nums">
                  <span className="text-blue-700">{c.sent}s</span>
                  <span className="text-emerald-700">{c.opened}o</span>
                  <span className="text-violet-700">{c.clicked}c</span>
                  <span className="text-amber-700">{c.replied}r</span>
                </span>
              </li>
            ))}
          </ul>
        )}
        <button
          type="button"
          onClick={() => navigate(`/app/campaigns/new?edit=${encodeURIComponent(campaign.id)}`)}
          className="mt-2 inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[10.5px] font-semibold text-slate-700 hover:bg-slate-50"
        >
          Open campaign →
        </button>
      </div>
      <div>
        <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">Recent events</div>
        {recent.length === 0 ? (
          <div className="text-[11px] text-slate-500">No events.</div>
        ) : (
          <ul className="space-y-1">
            {recent.map((e) => {
              const meta = EVENT_LABEL[e.event_type] || EVENT_LABEL.sent;
              const Icon = meta.Icon;
              return (
                <li key={e.id} className="flex items-start gap-2 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-[11px]">
                  <span
                    className="mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded"
                    style={{ background: meta.bg, color: meta.color }}
                  >
                    <Icon className="h-2.5 w-2.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-semibold text-[#0F172A]">{meta.label}</span>
                      <span className="text-[9.5px] text-slate-400">{fmtAbsolute(e.occurred_at)}</span>
                    </div>
                    <div className="truncate text-[10.5px] text-slate-500">
                      {e.metadata?.recipient_email || e.metadata?.recipient_id?.slice(0, 8) || "—"}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
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
        Once a campaign launches and recipients are queued, this dashboard fills with live send, open, click, reply and bounce numbers from the outreach history log.
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
