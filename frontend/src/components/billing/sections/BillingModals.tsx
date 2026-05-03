// Billing-page modals — Pulse Coach styled to match the Profile-page
// premium quota cards and Settings upgrade nudges.
//
// 1. ProrationConfirmModal — opens BEFORE we send the user to Stripe
//    Checkout. Shows "today's charge $X (prorated)" + "then $Y/mo from
//    [date]". Server-side preview comes from upcoming-invoice. Cuts
//    abandonment from users surprised by the prorated number that
//    Stripe Checkout shows after they've already committed mentally.
//
// 2. CancellationModal — two-step in-app cancellation. Step 1: pick a
//    reason (radio chips) + optional feedback. Step 2: confirmation
//    that access continues until the period end. No refund pathway —
//    that requires Stripe portal because chargeback rules vary.

import { useEffect, useState } from "react";
import {
  X,
  ArrowRight,
  Sparkles,
  Loader2,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import {
  previewUpcomingInvoice,
  cancelStripeSubscription,
} from "@/api/functions";
import type { PlanCode, BillingInterval } from "@/lib/planLimits";
import { getPlanConfig } from "@/lib/planLimits";

// ─── ProrationConfirmModal ─────────────────────────────────────────────
type Preview = {
  prorated: boolean;
  todayLabel: string;
  recurringLabel: string;
  recurringInterval: "month" | "year";
  nextChargeDate: string | null;
} | null;

export function ProrationConfirmModal({
  open,
  planCode,
  interval,
  onClose,
  onConfirm,
}: {
  open: boolean;
  planCode: PlanCode | null;
  interval: BillingInterval;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<Preview>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !planCode || planCode === "free_trial" || planCode === "enterprise") {
      setPreview(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    setPreview(null);
    (async () => {
      try {
        const result: any = await previewUpcomingInvoice({
          plan_code: planCode,
          interval: interval === "yearly" ? "year" : "month",
        });
        if (cancelled) return;
        if (result?.ok) {
          setPreview({
            prorated: Boolean(result.prorated),
            todayLabel: result.todayLabel,
            recurringLabel: result.recurringLabel,
            recurringInterval: result.recurringInterval,
            nextChargeDate: result.nextChargeDate,
          });
          setLoading(false);
        } else {
          // Server returned a structured error — fall through to
          // checkout. The user will see Stripe's hosted breakdown of
          // the actual charge there; better than blocking on a
          // preview that we can't compute.
          onConfirm();
        }
      } catch (e: any) {
        if (cancelled) return;
        // The upcoming-invoice fn may be unavailable (e.g. not yet
        // deployed in this environment) or may have legitimately
        // failed. Either way, don't trap the user in a "Couldn't
        // load preview" dead-end — bypass directly to checkout where
        // Stripe Hosted Checkout will show the real prorated charge
        // before the card is captured. The preview is a polish
        // feature, not a gate.
        console.warn("[BillingModals] preview unavailable, bypassing modal:", e?.message);
        onConfirm();
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, planCode, interval]);

  if (!open || !planCode) return null;
  const planLabel = getPlanConfig(planCode).label;

  return (
    <ModalShell onClose={onClose}>
      <div className="px-6 py-5">
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
            <div
              className="font-display flex items-center gap-2 text-[12.5px] font-bold tracking-wide text-white"
            >
              Pulse Coach
              <span
                className="inline-flex items-center rounded border px-1.5 py-px text-[9px] font-bold uppercase tracking-[0.06em]"
                style={{
                  color: "#00F0FF",
                  borderColor: "rgba(0,240,255,0.35)",
                  background: "rgba(0,240,255,0.08)",
                  fontFamily: "ui-monospace,monospace",
                }}
              >
                Confirm upgrade
              </span>
            </div>
            <h3 className="font-display mt-1.5 text-[15px] font-semibold text-white">
              Upgrade to {planLabel}
            </h3>
          </div>
        </div>

        {loading && (
          <div className="mt-5 flex items-center gap-2 text-[12.5px] text-slate-300">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Calculating today's charge…
          </div>
        )}

        {error && (
          <div
            className="mt-5 flex items-start gap-2 rounded-lg border px-3 py-2 text-[12px] text-rose-200"
            style={{
              background: "rgba(244,63,94,0.12)",
              borderColor: "rgba(244,63,94,0.35)",
            }}
          >
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {error}
          </div>
        )}

        {preview && (
          <div className="mt-5 grid grid-cols-2 gap-2.5">
            <PreviewTile
              label={preview.prorated ? "Today's prorated charge" : "Today's charge"}
              value={preview.todayLabel}
              accent
            />
            <PreviewTile
              label={`Then ${preview.recurringInterval === "year" ? "yearly" : "monthly"}`}
              value={preview.recurringLabel}
              sub={
                preview.nextChargeDate
                  ? `Starting ${preview.nextChargeDate}`
                  : "Recurring"
              }
            />
          </div>
        )}

        <div className="mt-6 flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="font-display inline-flex h-9 items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-4 text-[12px] font-semibold text-slate-200 transition hover:bg-white/10"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className="font-display inline-flex h-9 items-center gap-1.5 rounded-lg border border-white/10 px-4 text-[12px] font-semibold text-white shadow-[0_4px_14px_rgba(15,23,42,0.35)] transition hover:shadow-[0_8px_22px_rgba(15,23,42,0.45)] disabled:cursor-not-allowed disabled:opacity-60"
            style={{
              background: "linear-gradient(180deg,#0F172A 0%,#0B1220 100%)",
            }}
          >
            Continue to checkout
            <ArrowRight className="h-3 w-3" style={{ color: "#00F0FF" }} />
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

function PreviewTile({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
}) {
  return (
    <div
      className="rounded-lg border px-3 py-2.5"
      style={{
        background: "rgba(15,23,42,0.45)",
        borderColor: accent
          ? "rgba(0,240,255,0.35)"
          : "rgba(255,255,255,0.06)",
      }}
    >
      <div
        className="text-[9px] font-bold uppercase tracking-[0.08em] text-slate-400"
        style={{ fontFamily: "Space Grotesk,sans-serif" }}
      >
        {label}
      </div>
      <div
        className="mt-0.5 text-[18px] font-bold tabular-nums text-white"
        style={{ fontFamily: "ui-monospace,monospace" }}
      >
        {value}
      </div>
      {sub && (
        <div
          className="mt-0.5 text-[10.5px] text-slate-400"
          style={{ fontFamily: "DM Sans,sans-serif" }}
        >
          {sub}
        </div>
      )}
    </div>
  );
}

// ─── CancellationModal ─────────────────────────────────────────────────
const CANCEL_REASONS = [
  { id: "too_expensive", label: "Too expensive" },
  { id: "missing_features", label: "Missing features" },
  { id: "switching_provider", label: "Switching to another provider" },
  { id: "no_longer_needed", label: "No longer needed" },
  { id: "technical_issues", label: "Technical issues" },
  { id: "other", label: "Other" },
] as const;

export function CancellationModal({
  open,
  planLabel,
  periodEndDate,
  onClose,
  onCancelled,
}: {
  open: boolean;
  planLabel: string;
  periodEndDate: string | null;
  onClose: () => void;
  onCancelled: () => void;
}) {
  const [step, setStep] = useState<"reason" | "submitting" | "done">("reason");
  const [reason, setReason] = useState<string>("");
  const [feedback, setFeedback] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  // Reset whenever the modal opens
  useEffect(() => {
    if (open) {
      setStep("reason");
      setReason("");
      setFeedback("");
      setError(null);
    }
  }, [open]);

  if (!open) return null;

  async function handleConfirm() {
    setStep("submitting");
    setError(null);
    try {
      const result: any = await cancelStripeSubscription({
        action: "cancel",
        reason,
        feedback,
      });
      if (result?.ok) {
        setStep("done");
        // Brief pause so the user sees the confirmation, then notify parent
        setTimeout(() => {
          onCancelled();
        }, 1200);
      } else {
        setError(result?.error || "Couldn't cancel. Try again.");
        setStep("reason");
      }
    } catch (e: any) {
      setError(e?.message || "Couldn't cancel. Try again.");
      setStep("reason");
    }
  }

  return (
    <ModalShell onClose={step === "submitting" ? undefined : onClose}>
      <div className="px-6 py-5">
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
          <div className="min-w-0 flex-1">
            <div
              className="font-display flex items-center gap-2 text-[12.5px] font-bold tracking-wide text-white"
            >
              Pulse Coach
              <span
                className="inline-flex items-center rounded border px-1.5 py-px text-[9px] font-bold uppercase tracking-[0.06em]"
                style={{
                  color: "#00F0FF",
                  borderColor: "rgba(0,240,255,0.35)",
                  background: "rgba(0,240,255,0.08)",
                  fontFamily: "ui-monospace,monospace",
                }}
              >
                Cancel subscription
              </span>
            </div>
            <h3 className="font-display mt-1.5 text-[15px] font-semibold text-white">
              {step === "done"
                ? "Subscription cancelled"
                : `Cancel ${planLabel}`}
            </h3>
            {step !== "done" && (
              <p className="font-body mt-1 text-[12px] leading-snug text-slate-300">
                You'll keep access until {periodEndDate || "the end of your current period"}. No refund — your card won't be charged again.
              </p>
            )}
          </div>
        </div>

        {step === "reason" && (
          <>
            <div className="mt-5">
              <div
                className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-400"
                style={{ fontFamily: "Space Grotesk,sans-serif" }}
              >
                What's the main reason?
              </div>
              <div className="mt-2 grid grid-cols-2 gap-1.5">
                {CANCEL_REASONS.map((r) => {
                  const active = reason === r.id;
                  return (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => setReason(r.id)}
                      className={[
                        "font-display rounded-md border px-3 py-2 text-left text-[12px] font-semibold transition",
                        active
                          ? "border-cyan-400/60 bg-cyan-400/10 text-white"
                          : "border-white/10 bg-white/5 text-slate-200 hover:bg-white/10",
                      ].join(" ")}
                    >
                      {r.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mt-4">
              <div
                className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-400"
                style={{ fontFamily: "Space Grotesk,sans-serif" }}
              >
                Anything else? (optional)
              </div>
              <textarea
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                rows={3}
                placeholder="What could we have done differently?"
                className="mt-2 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[12px] text-white outline-none placeholder:text-slate-500 focus:border-cyan-400/60"
                style={{ fontFamily: "DM Sans,sans-serif" }}
                maxLength={500}
              />
            </div>

            {error && (
              <div
                className="mt-4 flex items-start gap-2 rounded-lg border px-3 py-2 text-[12px] text-rose-200"
                style={{
                  background: "rgba(244,63,94,0.12)",
                  borderColor: "rgba(244,63,94,0.35)",
                }}
              >
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {error}
              </div>
            )}

            <div className="mt-6 flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="font-display inline-flex h-9 items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-4 text-[12px] font-semibold text-slate-200 transition hover:bg-white/10"
              >
                Keep my subscription
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={!reason}
                className="font-display inline-flex h-9 items-center gap-1.5 rounded-lg border px-4 text-[12px] font-semibold text-rose-100 shadow-[0_4px_14px_rgba(244,63,94,0.18)] transition hover:shadow-[0_8px_22px_rgba(244,63,94,0.25)] disabled:cursor-not-allowed disabled:opacity-50"
                style={{
                  background: "linear-gradient(180deg,#7F1D1D 0%,#5B1717 100%)",
                  borderColor: "rgba(244,63,94,0.35)",
                }}
              >
                Cancel subscription
                <ArrowRight className="h-3 w-3" />
              </button>
            </div>
          </>
        )}

        {step === "submitting" && (
          <div className="mt-6 flex items-center gap-2 text-[12.5px] text-slate-300">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Cancelling…
          </div>
        )}

        {step === "done" && (
          <div className="mt-5 flex items-start gap-2 rounded-lg border border-emerald-400/30 bg-emerald-400/10 px-3 py-2 text-[12.5px] text-emerald-100">
            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Cancelled. You'll keep access until {periodEndDate || "the end of your current period"}.
          </div>
        )}
      </div>
    </ModalShell>
  );
}

// ─── ModalShell ────────────────────────────────────────────────────────
function ModalShell({
  onClose,
  children,
}: {
  onClose?: () => void;
  children: React.ReactNode;
}) {
  // Lock body scroll while open
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // Esc to dismiss when onClose provided
  useEffect(() => {
    if (!onClose) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center px-4"
      style={{ background: "rgba(2,6,23,0.65)" }}
      onClick={onClose ? () => onClose() : undefined}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-md overflow-hidden rounded-xl border border-white/10 shadow-[0_24px_60px_rgba(2,6,23,0.55)]"
        style={{
          background: "linear-gradient(160deg,#0F172A 0%,#1E293B 100%)",
        }}
      >
        <span
          aria-hidden
          className="pointer-events-none absolute -top-12 -right-10 h-40 w-40 rounded-full opacity-50"
          style={{
            background:
              "radial-gradient(circle, rgba(0,240,255,0.28), transparent 70%)",
          }}
        />
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="absolute right-3 top-3 z-10 inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-400 transition hover:bg-white/5 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        )}
        <div className="relative">{children}</div>
      </div>
    </div>
  );
}
