import React from "react";
import {
  Activity,
  Search,
  Send,
  PlusCircle,
  FileText,
  Briefcase,
  TrendingUp,
  Bookmark,
  Ship,
  AlertCircle,
} from "lucide-react";
import LitSectionCard from "@/components/ui/LitSectionCard";

/**
 * Phase 2 — Dashboard "Recent Changes" timeline card.
 *
 * Wired to the live `lit_activity_events` feed (already loaded by
 * LITDashboard from Supabase). Empty state when the user has no events.
 */
export default function TimelineCard({ events, loading }) {
  const items = Array.isArray(events)
    ? events.map(eventToItem).filter(Boolean)
    : [];
  const hasItems = items.length > 0;

  return (
    <LitSectionCard title="Recent Changes" sub="Intelligence signals & activity">
      {!hasItems ? (
        <div className="py-8 text-center">
          <p className="font-body text-[12px] text-slate-400">
            {loading ? "Loading recent activity…" : "No recent activity yet."}
          </p>
        </div>
      ) : (
        <div className="relative flex flex-col">
          <div
            className="absolute left-[13px] top-3 bottom-3 w-px"
            style={{ background: "#F1F5F9" }}
            aria-hidden
          />
          {items.map((item, i) => {
            const Icon = item.icon;
            return (
              <div
                key={`${item.text}-${i}`}
                className="relative z-10 flex items-start gap-2.5 py-1.5"
              >
                <div
                  className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-md bg-white"
                  style={{
                    border: `1.5px solid ${item.color}55`,
                    boxShadow: `0 0 0 3px ${item.color}10`,
                  }}
                >
                  <Icon className="h-2.5 w-2.5" style={{ color: item.color }} />
                </div>
                <div className="min-w-0 flex-1 pt-0.5">
                  <div className="font-body text-[12px] leading-snug text-slate-700">
                    {item.text}
                  </div>
                  <div className="font-mono mt-0.5 whitespace-nowrap text-[10px] text-slate-400">
                    {item.when}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </LitSectionCard>
  );
}

const ICON_BY_TYPE = {
  search: { icon: Search, color: "#3B82F6" },
  shipment: { icon: Ship, color: "#3B82F6" },
  campaign: { icon: Send, color: "#F59E0B" },
  campaign_created: { icon: Send, color: "#F59E0B" },
  campaign_launched: { icon: Send, color: "#F59E0B" },
  rfp: { icon: FileText, color: "#8B5CF6" },
  rfp_generated: { icon: FileText, color: "#8B5CF6" },
  enrich: { icon: TrendingUp, color: "#10B981" },
  contact_saved: { icon: PlusCircle, color: "#6366F1" },
  company_saved: { icon: Bookmark, color: "#6366F1" },
  crm_stage_change: { icon: Briefcase, color: "#3B82F6" },
  alert: { icon: AlertCircle, color: "#EF4444" },
  default: { icon: Activity, color: "#64748B" },
};

function eventToItem(event) {
  if (!event) return null;
  const type = String(event.event_type || "").toLowerCase();
  const tone =
    ICON_BY_TYPE[type] ||
    ICON_BY_TYPE[type.split("_")[0]] ||
    ICON_BY_TYPE.default;
  const meta = event.metadata || {};
  const subject = meta.company_name || meta.name || meta.query || meta.title;
  const text = subject
    ? `${humanize(type)} — ${subject}`
    : humanize(type);
  return {
    icon: tone.icon,
    color: tone.color,
    text,
    when: formatWhen(event.created_at),
  };
}

function humanize(snake) {
  if (!snake) return "Activity";
  return snake
    .replace(/[_-]+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatWhen(value) {
  if (!value) return "—";
  const t = new Date(value).getTime();
  if (!Number.isFinite(t)) return "—";
  const delta = Date.now() - t;
  if (delta < 0) return "—";
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (delta < hour) return `${Math.max(1, Math.round(delta / minute))}m ago`;
  if (delta < day) return `${Math.round(delta / hour)}h ago`;
  if (delta < 2 * day) return "Yesterday";
  if (delta < 7 * day) return `${Math.round(delta / day)} days ago`;
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}