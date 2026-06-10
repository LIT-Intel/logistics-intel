/**
 * CampaignActivityTimeline — slide-over drawer showing the chronological
 * feed of every tracked event for a campaign. Mounted by CampaignBuilder
 * and toggled by the "Activity (N)" header button. Pattern mirrors
 * EngagementDrillIn.
 */
import { useEffect, useMemo } from "react";
import {
  CheckCircle2,
  CircleSlash,
  Eye,
  Link as LinkIcon,
  Mail,
  RefreshCw,
  Send,
  XOctagon,
  Calendar,
  CornerUpLeft,
  X,
} from "lucide-react";
import type { CampaignActivityEvent } from "../hooks/useCampaignActivityTimeline";

interface Props {
  open: boolean;
  onClose: () => void;
  events: CampaignActivityEvent[] | undefined;
  isLoading: boolean;
  error: unknown;
}

interface EventVisual {
  icon: typeof Mail;
  iconBg: string;
  iconText: string;
  label: string;
}

function visualForEvent(event: CampaignActivityEvent): EventVisual {
  const et = event.event_type;
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

function detailFor(event: CampaignActivityEvent): string | null {
  const md = event.metadata ?? {};
  const snippet = typeof (md as any).reply_snippet === "string" ? (md as any).reply_snippet : null;
  if (snippet) return snippet;
  const url = typeof (md as any).original_url === "string" ? (md as any).original_url : null;
  if (url && event.event_type === "clicked") return url;
  const meetingUrl = typeof (md as any).cal_meeting_url === "string" ? (md as any).cal_meeting_url : null;
  if (meetingUrl) return meetingUrl;
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

export function CampaignActivityTimeline({ open, onClose, events, isLoading, error }: Props) {
  // ESC-to-close
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Body scroll lock while open
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const list = useMemo(() => events ?? [], [events]);

  if (!open) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-slate-900/40"
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        role="dialog"
        aria-label="Campaign activity timeline"
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[480px] flex-col bg-white shadow-2xl"
      >
        <header className="flex shrink-0 items-center justify-between border-b border-slate-200 px-4 py-3">
          <div className="flex items-baseline gap-2">
            <h3 className="text-[14px] font-bold text-slate-900">Activity timeline</h3>
            <span className="text-[11px] text-slate-500">
              {isLoading
                ? "Loading…"
                : error
                  ? "Failed to load"
                  : `${list.length} event${list.length === 1 ? "" : "s"}`}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-700"
            aria-label="Close activity timeline"
          >
            <X className="h-4 w-4" />
          </button>
        </header>
        {isLoading ? (
          <div className="flex-1 px-4 py-6 text-center text-[12px] text-slate-500">Loading activity…</div>
        ) : error ? (
          <div className="flex-1 px-4 py-6 text-center text-[12px] text-rose-700">
            Failed to load activity. Try refreshing.
          </div>
        ) : list.length === 0 ? (
          <div className="flex-1 px-4 py-6 text-center text-[12px] text-slate-500">
            No tracked events yet. Sends, opens, clicks, replies, meetings, and skips appear here.
          </div>
        ) : (
          <ul className="flex-1 min-h-0 overflow-y-auto">
            {list.map((event) => (
              <TimelineRow key={event.event_id} event={event} />
            ))}
          </ul>
        )}
      </aside>
    </>
  );
}
