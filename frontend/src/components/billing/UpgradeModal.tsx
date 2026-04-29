// Shared LIMIT_EXCEEDED / PLAN_REQUIRED upgrade modal.
//
// Renders when any feature surface returns a structured 403/limit-exceeded
// response. Consistent copy across the app: "You've used all your free
// trial credits. Upgrade to continue." + a single Upgrade button that
// goes to /app/billing.
//
// Two ways to use it:
// 1. Page-level: render <UpgradeModal limit={state} onClose={...} />
//    where `state` is a LimitExceeded object (or null when hidden).
// 2. App-level: wrap the app in <UpgradeModalProvider> and call
//    showUpgradeModal(limit) from anywhere via useUpgradeModal().

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { Lock, Sparkles, X } from "lucide-react";
import { FEATURE_LABELS, type FeatureKey, type LimitExceeded } from "@/lib/usage";

interface UpgradeModalProps {
  limit: LimitExceeded | null;
  onClose: () => void;
  upgradeHref?: string;
}

export function UpgradeModal({ limit, onClose, upgradeHref }: UpgradeModalProps) {
  if (!limit) return null;

  const featureKey = limit.feature as FeatureKey;
  const labels = FEATURE_LABELS[featureKey] ?? {
    singular: limit.feature,
    plural: limit.feature,
    verb: "use this feature",
  };
  const href = upgradeHref ?? limit.upgrade_url ?? "/app/billing";
  const planName = limit.plan ? capitalize(limit.plan.replace(/_/g, " ")) : "your plan";
  const limitCount = limit.limit;
  const usedCount = limit.used;
  const overLimit = usedCount >= limitCount;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="upgrade-modal-title"
      onClick={(e) => {
        // click outside closes
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 pt-6 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
              <Lock className="h-5 w-5" />
            </div>
            <div>
              <h2 id="upgrade-modal-title" className="text-base font-semibold text-slate-900">
                {limitCount === 0
                  ? `${capitalize(labels.singular)} not included in ${planName}`
                  : "You've reached your plan limit"}
              </h2>
              <p className="text-xs text-slate-500">{planName}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 px-6 py-5 text-sm leading-6 text-slate-700">
          {limitCount === 0 ? (
            <p>
              {capitalize(labels.plural)} are a premium feature. Upgrade your plan
              to {labels.verb}.
            </p>
          ) : (
            <p>
              You've used <strong>{usedCount}</strong> of <strong>{limitCount}</strong>{" "}
              {labels.plural} on the {planName} plan.{" "}
              {overLimit
                ? "Further use is blocked until you upgrade."
                : "Upgrading unlocks higher limits and premium features."}
            </p>
          )}

          {limit.reset_at && limitCount > 0 && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
              Your monthly count resets on{" "}
              <strong>
                {new Date(limit.reset_at).toLocaleDateString("en-US", {
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })}
              </strong>
              .
            </div>
          )}

          <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-3">
            <div className="flex items-center gap-2 text-indigo-700">
              <Sparkles className="h-4 w-4" />
              <span className="text-xs font-semibold uppercase tracking-wide">Upgrade benefits</span>
            </div>
            <ul className="mt-2 space-y-1 text-xs text-indigo-900">
              <li>• Higher monthly limits and unlimited tiers</li>
              <li>• Premium features (Pulse, exports, campaigns)</li>
              <li>• Priority support</li>
            </ul>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-6 py-4">
          <button
            onClick={onClose}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            Not now
          </button>
          <a
            href={href}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700"
          >
            View plans
          </a>
        </div>
      </div>
    </div>
  );
}

function capitalize(s: string) {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ───────────────────── App-level provider ─────────────────────
// Optional: drop <UpgradeModalProvider> at the app root and call
// useUpgradeModal().show(limit) from any component to surface the modal
// without prop drilling.

interface UpgradeModalContextValue {
  show: (limit: LimitExceeded) => void;
  hide: () => void;
  current: LimitExceeded | null;
}

const UpgradeModalContext = createContext<UpgradeModalContextValue | null>(null);

export function UpgradeModalProvider({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState<LimitExceeded | null>(null);

  const show = useCallback((limit: LimitExceeded) => {
    setCurrent(limit);
  }, []);
  const hide = useCallback(() => setCurrent(null), []);

  const value = useMemo(() => ({ show, hide, current }), [show, hide, current]);

  return (
    <UpgradeModalContext.Provider value={value}>
      {children}
      <UpgradeModal limit={current} onClose={hide} />
    </UpgradeModalContext.Provider>
  );
}

export function useUpgradeModal(): UpgradeModalContextValue {
  const ctx = useContext(UpgradeModalContext);
  if (!ctx) {
    // Soft-fall: works even if provider isn't mounted; consumer can
    // render <UpgradeModal limit={...} onClose={...} /> directly.
    return {
      show: () => {
        if (typeof window !== "undefined") {
          window.alert(
            "Upgrade required. Visit /app/billing to view plans.",
          );
        }
      },
      hide: () => {},
      current: null,
    };
  }
  return ctx;
}