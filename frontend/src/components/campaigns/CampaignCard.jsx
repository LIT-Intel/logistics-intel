import React from "react";
import { Mail, Linkedin, MessageSquare, Phone, Clock, ArrowRight } from "lucide-react";

/**
 * Outbound campaign row — renders one campaign from real data only.
 * All metric fields come from `campaign.metrics` JSONB. When a metric
 * is missing, the card shows "—" rather than inventing a number.
 *
 * No hardcoded rates. No "Pause / Start" action yet (that ships in
 * Phase D detail page when backend dispatcher is wired). Card is
 * clickable as a whole once /app/campaigns/:id exists; today the
 * click opens the builder for editing if `onClick` is provided.
 */

const STATUS_META = {
  active: { label: "Active", bg: "bg-emerald-50", text: "text-emerald-700", dot: "bg-emerald-500", ring: "ring-emerald-100" },
  paused: { label: "Paused", bg: "bg-amber-50", text: "text-amber-700", dot: "bg-amber-500", ring: "ring-amber-100" },
  completed: { label: "Completed", bg: "bg-indigo-50", text: "text-indigo-700", dot: "bg-indigo-500", ring: "ring-indigo-100" },
  draft: { label: "Draft", bg: "bg-slate-100", text: "text-slate-700", dot: "bg-slate-400", ring: "ring-slate-200" },
};

const CHANNEL_META = {
  email: { label: "Email", Icon: Mail },
  linkedin: { label: "LinkedIn", Icon: Linkedin },
  sms: { label: "SMS", Icon: MessageSquare },
  call: { label: "Call", Icon: Phone },
};

function formatRelative(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const diffMs = Date.now() - d.getTime();
  const diffDays = Math.round(diffMs / 86400000);
  if (diffDays === 0) return "today";
  if (diffDays === 1) return "yesterday";
  if (diffDays > 1 && diffDays < 30) return `${diffDays}d ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatInt(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return Number(n).toLocaleString();
}

function formatPct(num, den) {
  if (!den || num === null || num === undefined) return "—";
  const pct = (Number(num) / Number(den)) * 100;
  if (!Number.isFinite(pct)) return "—";
  return `${pct.toFixed(0)}%`;
}

export default function CampaignCard({ campaign, onClick }) {
  const statusKey = String(campaign?.status || "draft").toLowerCase();
  const status = STATUS_META[statusKey] || STATUS_META.draft;

  const channelKey = String(campaign?.channel || "email").toLowerCase();
  const channel = CHANNEL_META[channelKey] || CHANNEL_META.email;
  const ChannelIcon = channel.Icon;

  const metrics = campaign?.metrics && typeof campaign.metrics === "object" ? campaign.metrics : {};
  const sent = metrics.sent ?? metrics.sent_count ?? null;
  const opens = metrics.opens ?? metrics.open_count ?? null;
  const replies = metrics.replies ?? metrics.reply_count ?? null;
  const recipients = metrics.recipients ?? metrics.recipient_count ?? null;

  const updatedAt = formatRelative(campaign?.updated_at || campaign?.created_at);

  return (
    <button
      type="button"
      onClick={onClick ? () => onClick(campaign) : undefined}
      disabled={!onClick}
      className="group w-full rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:border-indigo-200 hover:shadow-md disabled:cursor-default disabled:hover:border-slate-200 disabled:hover:shadow-sm"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${status.bg} ${status.text} ${status.ring}`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${status.dot}`} />
              {status.label}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[11px] font-medium text-slate-600">
              <ChannelIcon className="h-3 w-3" />
              {channel.label}
            </span>
            {updatedAt ? (
              <span className="inline-flex items-center gap-1 text-[11px] text-slate-400">
                <Clock className="h-3 w-3" />
                Updated {updatedAt}
              </span>
            ) : null}
          </div>
          <h4 className="mt-3 truncate text-base font-semibold text-slate-900">
            {campaign?.name || campaign?.title || "Untitled campaign"}
          </h4>
          {campaign?.description ? (
            <p className="mt-1 line-clamp-2 text-sm text-slate-500">
              {campaign.description}
            </p>
          ) : null}
        </div>
        {onClick ? (
          <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-slate-300 transition group-hover:text-indigo-500" />
        ) : null}
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 border-t border-slate-100 pt-4 sm:grid-cols-4">
        <Metric label="Recipients" value={formatInt(recipients)} />
        <Metric label="Sent" value={formatInt(sent)} />
        <Metric label="Open rate" value={formatPct(opens, sent)} sub={opens != null ? `${formatInt(opens)} opens` : null} />
        <Metric label="Reply rate" value={formatPct(replies, sent)} sub={replies != null ? `${formatInt(replies)} replies` : null} />
      </div>
    </button>
  );
}

function Metric({ label, value, sub }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
        {label}
      </div>
      <div
        className="mt-1 truncate text-lg font-semibold text-slate-900"
        style={{ fontFamily: "'JetBrains Mono', monospace" }}
      >
        {value}
      </div>
      {sub ? (
        <div className="mt-0.5 truncate text-[11px] text-slate-400">{sub}</div>
      ) : null}
    </div>
  );
}
