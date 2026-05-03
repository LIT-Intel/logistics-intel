import React from "react";
import { Sparkles, ArrowUpRight, Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useUsageSummary, type UsageRow } from "@/hooks/useUsageSummary";
import { PLAN_LIMITS } from "@/lib/planLimits";

/**
 * Account Snapshot strip — sits at the top of the Settings page so users
 * land on real signal (plan, days into cycle, usage burn) before they even
 * scroll into the form sections. Mirrors the Profile-page header KPI strip
 * pattern so Settings reads as part of the same intel-dashboard family,
 * not a stand-alone forms page.
 *
 * Visual language: slate-900→slate-800 gradient with a subtle cyan accent
 * — same vocabulary as the Pulse Coach quota card so premium gating cues
 * stay consistent across the app.
 */
export default function SettingsAccountSnapshot({
  seatsUsed,
  seatsLimit,
}: {
  seatsUsed?: number | null;
  seatsLimit?: number | null;
}) {
  const navigate = useNavigate();
  const { loading, plan, periodStart, periodEnd, rows } = useUsageSummary();
  const planConfig = PLAN_LIMITS[plan];
  const planLabel = planConfig.label;

  // Days remaining in the current calendar month (the bucket the hook
  // aggregates over) — gives the user a natural "X days left to use it
  // or lose it" anchor.
  const now = new Date();
  const end = new Date(periodEnd);
  const daysLeft = Math.max(
    0,
    Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)),
  );
  const cycleStart = new Date(periodStart);
  const cycleLabel = `${cycleStart.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${new Date(end.getTime() - 1).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;

  const seatsTile: UsageRow | null =
    seatsUsed != null
      ? {
          featureKey: "team_seats",
          label: "Team seats",
          used: seatsUsed,
          limit: seatsLimit ?? planConfig.includedSeats ?? null,
          pctUsed:
            seatsLimit != null && seatsLimit > 0
              ? Math.min(100, Math.round((seatsUsed / seatsLimit) * 100))
              : null,
        }
      : null;

  const tiles: UsageRow[] = seatsTile ? [seatsTile, ...rows] : rows;

  return (
    <div
      className="relative overflow-hidden rounded-xl border border-white/10 px-5 py-4 sm:px-6"
      style={{
        background: "linear-gradient(160deg,#0F172A 0%,#1E293B 100%)",
        boxShadow: "inset 0 -1px 0 rgba(0,240,255,0.18), 0 1px 3px rgba(15,23,42,0.06)",
      }}
    >
      {/* radial accent */}
      <span
        aria-hidden
        className="pointer-events-none absolute -top-16 -right-16 h-56 w-56 rounded-full opacity-40"
        style={{
          background: "radial-gradient(circle, rgba(0,240,255,0.28), transparent 70%)",
        }}
      />

      <div className="relative flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border"
            style={{
              background: "rgba(0,240,255,0.10)",
              borderColor: "rgba(255,255,255,0.10)",
            }}
          >
            <Sparkles className="h-4 w-4" style={{ color: "#00F0FF" }} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[12.5px] font-bold tracking-wide text-white"
                 style={{ fontFamily: "Space Grotesk,sans-serif" }}>
              Account Snapshot
              <span
                className="inline-flex items-center rounded border px-1.5 py-px text-[9px] font-bold uppercase tracking-[0.06em]"
                style={{
                  fontFamily: "ui-monospace,monospace",
                  color: "#00F0FF",
                  borderColor: "rgba(0,240,255,0.35)",
                  background: "rgba(0,240,255,0.08)",
                }}
              >
                {planLabel}
              </span>
            </div>
            <div className="mt-1 text-[11.5px] leading-snug text-slate-300"
                 style={{ fontFamily: "DM Sans,sans-serif" }}>
              Cycle {cycleLabel} · {daysLeft} {daysLeft === 1 ? "day" : "days"} left
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => navigate("/app/billing")}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-white/10 px-3 text-[11.5px] font-semibold text-white shadow-[0_4px_14px_rgba(15,23,42,0.35)] transition hover:shadow-[0_8px_22px_rgba(15,23,42,0.45)]"
          style={{
            fontFamily: "Space Grotesk,sans-serif",
            background: "linear-gradient(180deg,#0F172A 0%,#0B1220 100%)",
          }}
        >
          Manage plan
          <ArrowUpRight className="h-3 w-3" style={{ color: "#00F0FF" }} />
        </button>
      </div>

      <div className="relative mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {tiles.map((tile) => (
          <UsageTile key={tile.featureKey} tile={tile} loading={loading} />
        ))}
      </div>
    </div>
  );
}

function UsageTile({ tile, loading }: { tile: UsageRow; loading: boolean }) {
  const valueLabel =
    tile.limit == null
      ? `${tile.used.toLocaleString()} / ∞`
      : `${tile.used.toLocaleString()} / ${tile.limit.toLocaleString()}`;
  const barPct = tile.pctUsed ?? 0;
  const barColor =
    tile.pctUsed == null
      ? "#475569"
      : tile.pctUsed >= 90
        ? "#F97316"
        : tile.pctUsed >= 70
          ? "#FACC15"
          : "#00F0FF";

  return (
    <div
      className="rounded-lg border px-2.5 py-2"
      style={{
        background: "rgba(15,23,42,0.45)",
        borderColor: "rgba(255,255,255,0.06)",
      }}
    >
      <div
        className="text-[9px] font-bold uppercase tracking-[0.08em] text-slate-400"
        style={{ fontFamily: "Space Grotesk,sans-serif" }}
      >
        {tile.label}
      </div>
      <div
        className="mt-0.5 flex items-baseline gap-1 text-white"
        style={{ fontFamily: "ui-monospace,monospace" }}
      >
        {loading ? (
          <Loader2 className="h-3 w-3 animate-spin text-slate-400" />
        ) : (
          <span className="text-[14px] font-bold tabular-nums">{valueLabel}</span>
        )}
      </div>
      {tile.limit != null && (
        <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-white/5">
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${Math.max(2, barPct)}%`,
              background: barColor,
            }}
          />
        </div>
      )}
    </div>
  );
}
