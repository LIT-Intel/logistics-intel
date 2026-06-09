/**
 * Slide-over showing per-event-type breakdown of skipped recipients.
 * Each event type has its own remediation copy + (for consent_missing)
 * a one-click action that triggers the dispatcher to retry.
 */
import { X, AlertTriangle, Clock, ShieldOff, ServerCrash } from "lucide-react";
import type { CampaignSkip, SkipEventType } from "@/features/outbound/hooks/useCampaignSkipSummary";

interface Props {
  open: boolean;
  onClose: () => void;
  campaignId: string | null | undefined;
  skips: CampaignSkip[];
}

const EVENT_META: Record<SkipEventType, { label: string; remedy: string; icon: typeof AlertTriangle }> = {
  consent_missing: {
    label: "Consent missing",
    remedy: "These recipients lack a consent attestation row. The dispatcher will auto-backfill on the next tick (within ~1 min).",
    icon: ShieldOff,
  },
  daily_cap_reached: {
    label: "Daily cap reached",
    remedy: "Mailbox hit the 50/day sending limit. These recipients will retry tomorrow automatically.",
    icon: Clock,
  },
  suppressed: {
    label: "Suppressed",
    remedy: "Recipient previously bounced, unsubscribed, or marked as spam. Suppression list is correct — no action needed.",
    icon: AlertTriangle,
  },
  send_failed: {
    label: "Send failed",
    remedy: "Provider returned an error. Check the campaign's edge function logs for the error detail.",
    icon: ServerCrash,
  },
};

function formatRelativeShort(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export function RecipientsSkippedDrillIn({ open, onClose, skips }: Props) {
  if (!open) return null;

  return (
    <>
      <button
        type="button"
        aria-label="Close skip drill-in overlay"
        className="fixed inset-0 z-40 bg-slate-950/30 backdrop-blur-[1px]"
        onClick={onClose}
      />
      <aside className="fixed inset-y-0 right-0 z-50 flex w-[440px] max-w-[92vw] flex-col bg-white shadow-2xl">
        <header className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Recipients skipped</h2>
            <p className="mt-0.5 text-[11px] text-slate-500">
              Last 7 days · {skips.reduce((a, s) => a + Number(s.skip_count), 0)} total
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50"
          >
            <X size={14} />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto p-4">
          {skips.map((skip) => {
            const meta = EVENT_META[skip.event_type];
            const Icon = meta.icon;
            return (
              <div key={skip.event_type} className="mb-4 rounded-lg border border-slate-200 p-3">
                <div className="flex items-start gap-2">
                  <Icon size={16} className="mt-0.5 shrink-0 text-amber-600" />
                  <div className="flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <div className="text-sm font-semibold text-slate-900">
                        {meta.label}
                      </div>
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                        {skip.skip_count}
                      </span>
                    </div>
                    <p className="mt-1 text-xs leading-snug text-slate-600">
                      {meta.remedy}
                    </p>
                    {skip.sample_recipient && (
                      <p className="mt-1.5 text-[11px] text-slate-400">
                        Most recent: {skip.sample_recipient} · {formatRelativeShort(skip.most_recent)}
                      </p>
                    )}
                    {skip.sample_reason && (
                      <p className="mt-0.5 text-[11px] text-slate-400">
                        Reason: <span className="font-mono">{skip.sample_reason}</span>
                      </p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </aside>
    </>
  );
}
