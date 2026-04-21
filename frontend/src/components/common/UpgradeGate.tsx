import React from "react";
import { useNavigate } from "react-router-dom";
import { Lock, ArrowRight, Zap } from "lucide-react";
import { normalizePlan, type PlanCode } from "@/lib/planLimits";

const PLAN_ORDER: PlanCode[] = ["free_trial", "starter", "growth", "enterprise"];

const PLAN_LABELS: Record<PlanCode, string> = {
  free_trial: "Free Trial",
  starter: "Starter",
  growth: "Growth",
  enterprise: "Enterprise",
};

interface UpgradeGateProps {
  /** Feature name shown in the lock screen headline */
  featureName: string;
  /** Brief description of what becomes available */
  description?: string;
  /** Minimum plan required to access this feature */
  requiredPlan?: PlanCode;
  /** Current user plan (raw, will be normalized) */
  currentPlan?: string | null;
  /** If true, render children instead of the gate (feature is accessible) */
  hasAccess?: boolean;
  children?: React.ReactNode;
}

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
    <div className="flex min-h-[60vh] items-center justify-center px-6 py-16">
      <div className="w-full max-w-md text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-50 ring-1 ring-indigo-100">
          <Lock className="h-7 w-7 text-indigo-500" />
        </div>

        <div className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700 ring-1 ring-amber-200">
          <Zap className="h-3 w-3" />
          Requires {PLAN_LABELS[requiredPlan]} or above
        </div>

        <h2 className="mt-4 text-2xl font-bold text-slate-900">{featureName}</h2>

        <p className="mt-3 text-sm leading-relaxed text-slate-500">
          {description ||
            `${featureName} is available on the ${PLAN_LABELS[requiredPlan]} plan and above. Upgrade to unlock this feature and access your full workflow.`}
        </p>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <button
            type="button"
            onClick={() => navigate("/app/billing")}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700"
          >
            Upgrade to {nextPlanLabel}
            <ArrowRight className="h-4 w-4" />
          </button>

          <button
            type="button"
            onClick={() => navigate(-1)}
            className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-6 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Go back
          </button>
        </div>

        <p className="mt-6 text-xs text-slate-400">
          Current plan: <span className="font-medium text-slate-600">{PLAN_LABELS[normalizedCurrent]}</span>
        </p>
      </div>
    </div>
  );
}

export default UpgradeGate;
