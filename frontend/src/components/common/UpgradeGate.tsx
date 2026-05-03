import React from "react";
import { useNavigate } from "react-router-dom";
import { Lock, ArrowRight, Sparkles } from "lucide-react";
import { normalizePlan, type PlanCode } from "@/lib/planLimits";

const PLAN_ORDER: PlanCode[] = ["free_trial", "starter", "growth", "scale", "enterprise"];

const PLAN_LABELS: Record<PlanCode, string> = {
  free_trial: "Free Trial",
  starter: "Starter",
  growth: "Growth",
  scale: "Scale",
  enterprise: "Enterprise",
};

interface UpgradeGateProps {
  /** Feature name shown in the headline */
  featureName: string;
  /** Brief description of what becomes available */
  description?: string;
  /** Minimum plan required to access this feature */
  requiredPlan?: PlanCode;
  /** Current user plan (raw, will be normalized) */
  currentPlan?: string | null;
  /** If true, render children instead of the gate (feature is accessible) */
  hasAccess?: boolean;
  /** The locked feature page itself — rendered behind a blur when locked
   *  so users see what they're missing instead of a stark white gate. */
  children?: React.ReactNode;
}

/**
 * Plan-gated feature wrapper. When the user lacks access, renders the
 * underlying page in the background (blurred + dimmed, non-interactive)
 * and lays a premium Pulse-Coach upgrade card on top. Same visual
 * vocabulary as the Profile-page quota cards, Settings Account Snapshot,
 * Billing modals, and sidebar usage chip — single canonical brand
 * surface across every locked / quota / upgrade prompt in the app.
 *
 * Replaces the previous full-page white gate that hid the feature
 * entirely; users now see real product behind the overlay so the value
 * of upgrading is concrete instead of abstract.
 */
export function UpgradeGate({
  featureName,
  description,
  requiredPlan = "growth",
  currentPlan,
  hasAccess = false,
  children,
}: UpgradeGateProps) {
  const navigate = useNavigate();

  if (hasAccess) return <>{children}</>;

  const normalizedCurrent = normalizePlan(currentPlan);
  const currentIdx = PLAN_ORDER.indexOf(normalizedCurrent);
  const requiredIdx = PLAN_ORDER.indexOf(requiredPlan);
  const nextPlan = PLAN_ORDER[Math.max(requiredIdx, currentIdx + 1)] ?? "growth";
  const nextPlanLabel = PLAN_LABELS[nextPlan];

  return (
    <div className="relative min-h-[60vh]">
      {/* Underlying feature page — fully readable. Pointer-events
          disabled so accidental clicks don't fire underneath the modal,
          but no blur / no dim — users see exactly what they're paying
          to unlock. */}
      <div aria-hidden className="pointer-events-none select-none">
        {children}
      </div>

      {/* Overlay scoped to the PAGE CONTENT AREA only (absolute inset-0
          inside the gate's `relative` container). Sidebar + header stay
          fully interactive — users can navigate away to Dashboard /
          Settings / Billing without dismissing anything. The modal card
          uses sticky positioning so it stays visible at the same screen
          spot as the user scrolls the locked page behind it. */}
      <div className="absolute inset-0 z-40 flex items-start justify-center px-4 pt-8 pb-16 sm:pt-12">
        {/* Subtle tint so the modal reads as floating on top, but light
            enough that the underlying page stays clearly visible. No
            backdrop-filter blur — explicit ask was for the page to
            remain readable. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{ background: "rgba(15,23,42,0.18)" }}
        />
        <div
          className="relative w-full max-w-md overflow-hidden rounded-2xl border border-white/10 shadow-[0_24px_60px_rgba(2,6,23,0.55)]"
          style={{
            position: "sticky",
            top: "10vh",
            background: "linear-gradient(160deg,#0F172A 0%,#1E293B 100%)",
            boxShadow:
              "inset 0 -1px 0 rgba(0,240,255,0.18), 0 24px 60px rgba(2,6,23,0.55)",
          }}
        >
          <span
            aria-hidden
            className="pointer-events-none absolute -top-16 -right-16 h-56 w-56 rounded-full opacity-50"
            style={{
              background:
                "radial-gradient(circle, rgba(0,240,255,0.28), transparent 70%)",
            }}
          />

          <div className="relative px-6 py-6">
            <div className="flex items-start gap-3">
              <div
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border"
                style={{
                  background: "rgba(0,240,255,0.10)",
                  borderColor: "rgba(255,255,255,0.10)",
                }}
              >
                <Sparkles className="h-5 w-5" style={{ color: "#00F0FF" }} />
              </div>

              <div className="min-w-0 flex-1">
                <div
                  className="font-display flex flex-wrap items-center gap-2 text-[12.5px] font-bold tracking-wide text-white"
                >
                  Pulse Coach
                  <span
                    className="inline-flex items-center gap-1 rounded border px-1.5 py-px text-[9px] font-bold uppercase tracking-[0.06em]"
                    style={{
                      color: "#00F0FF",
                      borderColor: "rgba(0,240,255,0.35)",
                      background: "rgba(0,240,255,0.08)",
                      fontFamily: "ui-monospace,monospace",
                    }}
                  >
                    <Lock className="h-2.5 w-2.5" />
                    {PLAN_LABELS[requiredPlan]} feature
                  </span>
                </div>

                <h2
                  className="font-display mt-2 text-[18px] font-bold leading-tight text-white"
                  style={{ letterSpacing: "-0.01em" }}
                >
                  {featureName}
                </h2>

                <p
                  className="font-body mt-2 text-[12.5px] leading-relaxed text-slate-300"
                >
                  {description ||
                    `${featureName} unlocks on the ${PLAN_LABELS[requiredPlan]} plan and above. You can preview the page behind this card — upgrade to unlock the workflow.`}
                </p>

                <div className="mt-5 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => navigate("/app/billing")}
                    className="font-display inline-flex h-9 items-center gap-1.5 rounded-lg border border-white/10 px-4 text-[12px] font-semibold text-white shadow-[0_4px_14px_rgba(15,23,42,0.35)] transition hover:shadow-[0_8px_22px_rgba(15,23,42,0.45)]"
                    style={{
                      background:
                        "linear-gradient(180deg,#0F172A 0%,#0B1220 100%)",
                    }}
                  >
                    Upgrade to {nextPlanLabel}
                    <ArrowRight
                      className="h-3 w-3"
                      style={{ color: "#00F0FF" }}
                    />
                  </button>

                  <button
                    type="button"
                    onClick={() => navigate(-1)}
                    className="font-display inline-flex h-9 items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-4 text-[12px] font-semibold text-slate-200 transition hover:bg-white/10"
                  >
                    Go back
                  </button>
                </div>

                <p
                  className="font-body mt-4 text-[10.5px] text-slate-400"
                >
                  Current plan:{" "}
                  <span
                    className="font-mono"
                    style={{ color: "#00F0FF" }}
                  >
                    {PLAN_LABELS[normalizedCurrent]}
                  </span>
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default UpgradeGate;
