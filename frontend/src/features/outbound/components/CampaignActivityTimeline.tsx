/**
 * CampaignActivityTimeline — chronological feed of every tracked event
 * for a campaign. Mounted below the KPI hero in CampaignBuilder so the
 * operator can audit the full stream without flipping through KPI tiles
 * one at a time.
 *
 * Event types rendered:
 *   sent        →  📤 outbound to <recipient>
 *   delivered   →  ✅ delivered (Resend confirmed)
 *   opened      →  👁 opened by <recipient>
 *   clicked     →  🔗 clicked <link>
 *   replied / status=replied  →  ↩️ replied — shows snippet inline
 *   bounced     →  ❌ bounced
 *   meeting_booked / rescheduled / cancelled  →  📅 with Cal.com link
 *   consent_missing / suppressed  →  ⛔ skipped (reason)
 *
 * Unknown event types fall through to a generic gray row so nothing is
 * silently dropped. Collapsed by default to ~10 rows; "Show all" expands.
 */
import { useMemo, useState } from "react";
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleSlash,
  Eye,
  Link as LinkIcon,
  Mail,
  RefreshCw,
  Send,
  XOctagon,
  Calendar,
  CornerUpLeft,
} from "lucide-react";
import {
  type CampaignActivityEvent,
  useCampaignActivityTimeline,
} from "../hooks/useCampaignActivityTimeline";

interface Props {
  campaignId: string | null;
  /** Initial visible row count before "Show all" expands. */
  initialRows?: number;
}

interface EventVisual {
  icon: typeof Mail;
  iconBg: string;
  iconText: string;
  label: string;
}

function visualForEvent(event: CampaignActivityEvent): EventVisual {
  const et = event.event_type;
  // status='replied' on a 'sent' row should display as replied —
  // reply-receiver UPDATEs the send row instead of inserting fresh.
  if (et === "replied" || event.status === "replied") {
    return { icon: CornerUpLeft, iconBg: "bg-emerald-100", iconText: "text-emerald-700", label: "Reply" };
  }
  switch (et) {
    case "sent":
      return { icon: Send, iconBg: "bg-blue-100", iconText: "text-blue-700", label: "Sent" };
    case "delivered":
      return { icon: CheckCircle2, iconBg: "bg-blue-100", iconText: "text-blue-700", label: "Delivered" };
    case "opened":
      return { icon: Eye, iconBg: "bg-indigo-100", iconText: "text-indigo-700", label: "Opened" };
    case "clicked":
      return { icon: LinkIcon, iconBg: "bg-indigo-100", iconText: "text-indigo-700", label: "Clicked" };
    case "bounced":
      return { icon: XOctagon, iconBg: "bg-rose-100", iconText: "text-rose-700", label: "Bounced" };
    case "meeting_booked":
      return { icon: Calendar, iconBg: "bg-emerald-100", iconText: "text-emerald-700", label: "Meeting booked" };
    case "meeting_rescheduled":
      return { icon: RefreshCw, iconBg: "bg-amber-100", iconText: "text-amber-700", label: "Meeting rescheduled" };
    case "meeting_cancelled":
      return { icon: XOctagon, iconBg: "bg-slate-100", iconText: "text-slate-600", label: "Meeting cancelled" };
    case "consent_missing":
    case "suppressed":
      return { icon: CircleSlash, iconBg: "bg-slate-100", iconText: "text-slate-600", label: "Skipped" };
    default:
      return { icon: Mail, iconBg: "bg-slate-100", iconText: "text-slate-600", label: et };
  }
}

function fmtTime(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  } catch {
    return iso;
  }
}

/** Reads metadata fields the timeline cares about without dragging
 *  the whole jsonb into the row body. */
function detailFor(event: CampaignActivityEvent): string | null {
  const md = event.metadata ?? {};
  // Reply snippet (added by reply-receiver v17 / resend-inbound-webhook v17)
  const snippet = typeof (md as any).reply_snippet === "string" ? (md as any).reply_snippet : null;
  if (snippet) return snippet;
  // Click URL
  const url = typeof (md as any).original_url === "string" ? (md as any).original_url : null;
  if (url && event.event_type === "clicked") return url;
  // Meeting URL
  const meetingUrl = typeof (md as any).cal_meeting_url === "string" ? (md as any).cal_meeting_url : null;
  if (meetingUrl) return meetingUrl;
  // Skip reason
  const reason = typeof (md as any).reason === "string" ? (md as any).reason : null;
  if (reason) return reason;
  return null;
}

function TimelineRow({ event }: { event: CampaignActivityEvent }) {
  const v = visualForEvent(event);
  const Icon = v.icon;
  const detail = detailFor(event);
  const isReply = event.event_type === "replied" || event.status === "replied";
  return (
    <li className="flex items-start gap-3 border-b border-slate-100 px-4 py-2.5 last:border-b-0">
      <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${v.iconBg}`}>
        <Icon className={`h-3.5 w-3.5 ${v.iconText}`} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 text-[12.5px] text-slate-900">
          <span className="font-semibold">{v.label}</span>
          {event.recipient_email ? (
            <span className="font-mono text-[11.5px] text-slate-600">{event.recipient_email}</span>
          ) : null}
          {event.subject && !isReply ? (
            <span className="truncate text-[11.5px] text-slate-500">· {event.subject}</span>
          ) : null}
        </div>
        {detail ? (
          <div
            className={
              isReply
                ? "mt-1.5 rounded-md border border-emerald-200 bg-emerald-50/60 px-2.5 py-1.5 text-[12px] italic text-emerald-900"
                : "mt-0.5 truncate text-[11px] text-slate-500"
            }
            title={detail}
          >
            {isReply ? <>“{detail}”</> : detail}
          </div>
        ) : null}
      </div>
      <span className="shrink-0 whitespace-nowrap text-[10.5px] tabular-nums text-slate-400">
        {fmtTime(event.occurred_at)}
      </span>
    </li>
  );
}

export function CampaignActivityTimeline({ campaignId, initialRows = 10 }: Props) {
  const { data, isLoading, error } = useCampaignActivityTimeline(campaignId);
  const [expanded, setExpanded] = useState(false);

  const visible = useMemo(() => {
    if (!data) return [];
    if (expanded) return data;
    return data.slice(0, initialRows);
  }, [data, expanded, initialRows]);

  if (!campaignId) return null;

  return (
    <section className="mt-4 rounded-xl border border-slate-200 bg-white shadow-sm">
      <header className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
        <div className="flex items-baseline gap-2">
          <h3 className="text-[13px] font-bold text-slate-900">Activity timeline</h3>
          <span className="text-[11px] text-slate-500">
            {isLoading
              ? "Loading…"
              : error
                ? "Failed to load"
                : `${data?.length ?? 0} event${(data?.length ?? 0) === 1 ? "" : "s"}`}
          </span>
        </div>
        {data && data.length > initialRows ? (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
          >
            {expanded ? (
              <>
                <ChevronDown className="h-3 w-3" /> Collapse
              </>
            ) : (
              <>
                <ChevronRight className="h-3 w-3" /> Show all {data.length}
              </>
            )}
          </button>
        ) : null}
      </header>
      {isLoading ? (
        <div className="px-4 py-6 text-center text-[12px] text-slate-500">Loading activity…</div>
      ) : error ? (
        <div className="px-4 py-6 text-center text-[12px] text-rose-700">
          Failed to load activity. Try refreshing.
        </div>
      ) : !data || data.length === 0 ? (
        <div className="px-4 py-6 text-center text-[12px] text-slate-500">
          No tracked events yet. Sends, opens, clicks, replies, meetings, and skips appear here.
        </div>
      ) : (
        <ul>
          {visible.map((event) => (
            <TimelineRow key={event.event_id} event={event} />
          ))}
        </ul>
      )}
    </section>
  );
}
