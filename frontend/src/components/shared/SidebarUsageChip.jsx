import React from "react";
import { Link } from "react-router-dom";
import { PLAN_LIMITS } from "@/lib/planLimits";
import { useUsageSummary } from "@/hooks/useUsageSummary";
import { PulseIcon } from "@/components/shared/AppIcons";

/**
 * Live usage chip rendered in sidebar / mobile-menu footers. Three modes:
 *   - "open"      → 3-line card with plan badge, days-left chip,
 *                   hottest meter (label + used/limit + thin progress bar).
 *   - "collapsed" → compact circle with plan initial, ring colored by
 *                   the hottest meter's burn percentage.
 *   - "mobile"    → wider variant of "open" suited to the mobile menu
 *                   footer (full-width, slightly taller).
 *
 * Click anywhere routes to the Billing surface in Settings so users
 * can act on what they see. Pulse Coach styling so it slots into any
 * dark-chrome surface without competing with it.
 */
export default function SidebarUsageChip({ variant = "open", onNavigate }) {
  const { plan, periodEnd, rows, loading } = useUsageSummary();
  const planConfig = PLAN_LIMITS[plan];
  const planLabel = planConfig?.label || "Free Trial";
  const planInitial = (planLabel[0] || "F").toUpperCase();

  const now = new Date();
  const end = periodEnd ? new Date(periodEnd) : null;
  const daysLeft = end
    ? Math.max(0, Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))
    : null;

  const hottest = (() => {
    const limited = rows.filter((r) => r.limit != null && r.limit > 0);
    if (!limited.length) return null;
    return limited
      .map((r) => ({ ...r, pct: Math.min(100, Math.round((r.used / r.limit) * 100)) }))
      .sort((a, b) => b.pct - a.pct)[0];
  })();

  const burnColor =
    hottest == null
      ? "#475569"
      : hottest.pct >= 90
      ? "#F97316"
      : hottest.pct >= 70
      ? "#FACC15"
      : "#00F0FF";

  if (variant === "collapsed") {
    return (
      <Link
        to="/app/settings?tab=billing"
        onClick={onNavigate}
        className="block rounded-2xl border border-white/10 px-3 py-3 transition hover:border-white/20"
        style={{
          background: "rgba(0,240,255,0.05)",
          boxShadow: "inset 0 -1px 0 rgba(0,240,255,0.18)",
        }}
      >
        <div className="flex flex-col items-center gap-1.5">
          <div
            className="flex h-9 w-9 items-center justify-center rounded-full"
            style={{
              background: "#0F172A",
              color: "#00F0FF",
              boxShadow: hottest ? `0 0 0 2px ${burnColor}40` : undefined,
              border: `2px solid ${burnColor}`,
            }}
          >
            <span
              className="text-[12px] font-bold"
              style={{ fontFamily: "Space Grotesk,sans-serif" }}
            >
              {planInitial}
            </span>
          </div>
          {hottest && (
            <span
              className="text-[9px] font-bold tabular-nums"
              style={{ color: burnColor, fontFamily: "ui-monospace,monospace" }}
            >
              {hottest.pct}%
            </span>
          )}
        </div>
      </Link>
    );
  }

  return (
    <Link
      to="/app/settings?tab=billing"
      onClick={onNavigate}
      className="block rounded-2xl border border-white/10 px-3 py-3 transition hover:border-white/20"
      style={{
        background: "rgba(0,240,255,0.05)",
        boxShadow: "inset 0 -1px 0 rgba(0,240,255,0.18)",
      }}
    >
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span
              className="font-display inline-flex items-center rounded border px-1.5 py-px text-[9px] font-bold uppercase tracking-[0.06em]"
              style={{
                color: "#00F0FF",
                borderColor: "rgba(0,240,255,0.35)",
                background: "rgba(0,240,255,0.08)",
                fontFamily: "ui-monospace,monospace",
              }}
            >
              {planLabel}
            </span>
            {daysLeft != null && (
              <span
                className="text-[10.5px] text-slate-300"
                style={{ fontFamily: "DM Sans,sans-serif" }}
              >
                {daysLeft}d left
              </span>
            )}
          </div>
          <PulseIcon className="h-3.5 w-3.5 shrink-0" style={{ color: "#00F0FF" }} />
        </div>
        <div className="min-w-0">
          <div
            className="truncate text-[11.5px] font-semibold text-white"
            style={{ fontFamily: "Space Grotesk,sans-serif" }}
          >
            {hottest ? hottest.label : loading ? "Loading usage…" : "Manage plan"}
          </div>
          {hottest && (
            <div
              className="mt-1 flex items-center gap-1.5"
              style={{ fontFamily: "ui-monospace,monospace" }}
            >
              <span className="text-[10.5px] tabular-nums text-slate-300">
                {hottest.used.toLocaleString()} / {hottest.limit?.toLocaleString()}
              </span>
              <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/5">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${Math.max(2, hottest.pct)}%`,
                    background: burnColor,
                  }}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}
