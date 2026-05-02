import React from "react";
import { Sparkles, ArrowRight, X } from "lucide-react";
import { Link } from "react-router-dom";

/**
 * Premium quota-warning card. Replaces the plain amber "Refresh
 * limit reached" banner with a Pulse-Coach-styled surface so the
 * monthly refresh cycle and upgrade options feel like a coaching
 * moment instead of a system error. Mirrors the floating Pulse
 * Coach card's visual language: slate-900→slate-800 gradient,
 * cyan accent, white/10 gloss border.
 *
 * Props:
 *   plan          string | null  — plan code ("free_trial", "growth", "pro", ...)
 *   feature       string | null  — feature key ("company_profile_view")
 *   used          number | null  — credits consumed this period
 *   limit         number | null  — plan cap (null when unlimited / admin)
 *   reset_at      string | null  — ISO timestamp when the bucket resets
 *   upgrade_url   string         — billing route
 *   onDismiss     () => void
 */
const FEATURE_LABEL = {
  company_profile_view: "Pulse Intel refresh",
  pulse_ai_report: "Pulse AI brief",
  company_search: "Search",
  saved_company: "Saved company",
};

// Recommendation copy per current plan. Trial users get the strongest
// nudge; paid users see a softer "consider upgrading" message.
const RECOMMENDATION = {
  free_trial: {
    pitch: "Your usage signals serious workflow — the Growth plan unlocks 100 refreshes per month and never pauses your trade intel.",
    cta: "View plans",
  },
  starter: {
    pitch: "You're maxing out the Starter cap. Growth scales refreshes 5× without changing the rest of your toolkit.",
    cta: "Compare Starter vs Growth",
  },
  growth: {
    pitch: "Growth is your sweet spot but you're using it heavily. Pro removes the cap entirely and adds priority refresh.",
    cta: "Upgrade to Pro",
  },
};

function formatResetDate(iso) {
  if (!iso) return "next billing cycle";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "next billing cycle";
    return d.toLocaleDateString("en-US", { month: "long", day: "numeric" });
  } catch {
    return "next billing cycle";
  }
}

export default function PulseCoachQuotaCard({
  plan,
  feature,
  used,
  limit,
  reset_at,
  upgrade_url,
  onDismiss,
}) {
  const featureLabel = FEATURE_LABEL[feature] || "Pulse Intel refresh";
  const planLabel = plan ? plan.replace(/_/g, " ") : "your plan";
  const resetLabel = formatResetDate(reset_at);
  const rec = RECOMMENDATION[plan] || RECOMMENDATION.free_trial;

  return (
    <div
      className="relative shrink-0 overflow-hidden border-b border-slate-200/60 px-4 py-3 sm:px-6"
      style={{
        background: "linear-gradient(160deg,#0F172A 0%,#1E293B 100%)",
        boxShadow: "inset 0 -1px 0 rgba(0,240,255,0.18)",
      }}
    >
      {/* radial glow accent — same trick as the floating Pulse Coach card */}
      <span
        aria-hidden
        className="pointer-events-none absolute -top-12 -right-10 h-40 w-40 rounded-full opacity-50"
        style={{
          background:
            "radial-gradient(circle, rgba(0,240,255,0.28), transparent 70%)",
        }}
      />

      <div className="relative flex flex-wrap items-start gap-3">
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border"
          style={{
            background: "rgba(0,240,255,0.10)",
            borderColor: "rgba(255,255,255,0.10)",
          }}
        >
          <Sparkles className="h-4 w-4" style={{ color: "#00F0FF" }} />
        </div>

        <div className="min-w-0 flex-1">
          <div className="font-display flex items-center gap-2 text-[12.5px] font-bold tracking-wide text-white">
            Pulse Coach
            <span
              className="font-mono inline-flex items-center rounded border px-1.5 py-px text-[9px] font-bold uppercase tracking-[0.06em]"
              style={{
                color: "#00F0FF",
                borderColor: "rgba(0,240,255,0.35)",
                background: "rgba(0,240,255,0.08)",
              }}
            >
              {planLabel}
            </span>
          </div>

          <div className="font-body mt-1 text-[12.5px] leading-snug text-slate-200">
            You've used your {featureLabel} allowance for this billing cycle
            {limit != null && used != null ? (
              <>
                {" "}
                <span className="font-mono text-white">
                  ({used} / {limit})
                </span>
              </>
            ) : null}
            . Trade intel auto-refreshes monthly — your next window opens{" "}
            <span className="font-display font-semibold text-white">
              {resetLabel}
            </span>
            . Cached intel for every saved company is still available.
          </div>

          <div className="font-body mt-2 text-[12px] leading-snug text-slate-300">
            {rec.pitch}
          </div>

          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <Link
              to={upgrade_url || "/app/billing"}
              className="font-display group/btn relative inline-flex h-8 items-center gap-1.5 overflow-hidden rounded-lg border border-white/10 px-3 text-[11.5px] font-semibold text-white shadow-[0_4px_14px_rgba(15,23,42,0.35)] transition hover:shadow-[0_8px_22px_rgba(15,23,42,0.45)]"
              style={{
                background: "linear-gradient(180deg,#0F172A 0%,#0B1220 100%)",
              }}
            >
              {rec.cta}
              <ArrowRight className="h-3 w-3" style={{ color: "#00F0FF" }} />
            </Link>

            {onDismiss ? (
              <button
                type="button"
                onClick={onDismiss}
                className="font-display inline-flex h-8 items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 text-[11.5px] font-semibold text-slate-300 transition hover:bg-white/10"
              >
                Dismiss
                <X className="h-3 w-3" />
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
