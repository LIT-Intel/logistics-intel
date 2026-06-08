/**
 * LaunchButton — encapsulates Launch CTA styling, disabled-state
 * tooltip, and the pre-launch "you haven't tested" nudge.
 *
 * Brand-blue primary CTA when enabled. Disabled state degrades to
 * neutral slate with cursor-not-allowed + the disabledReason in the
 * title attribute. Pre-launch nudge renders as an amber chip above
 * the button while hasTestSendOccurred=false; disappears once a
 * test send has been logged in this session.
 */
import { Rocket } from "lucide-react";

interface Props {
  onLaunch: () => void;
  canLaunch: boolean;
  launching?: boolean;
  disabledReason?: string;
  hasTestSendOccurred: boolean;
}

export function LaunchButton({
  onLaunch,
  canLaunch,
  launching = false,
  disabledReason,
  hasTestSendOccurred,
}: Props) {
  const disabled = !canLaunch || launching;
  const title = disabled
    ? (disabledReason ?? "Launch unavailable")
    : "Queue recipients and start sending.";

  return (
    <div className="relative flex flex-col items-end gap-1">
      {!hasTestSendOccurred && canLaunch && !launching && (
        <div className="absolute -top-7 right-0 z-10 inline-flex items-center gap-1 whitespace-nowrap rounded-md bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800 shadow-sm">
          <span aria-hidden>⚠️</span>
          You haven't tested this email yet
        </div>
      )}
      <button
        type="button"
        onClick={() => { if (!disabled) onLaunch(); }}
        disabled={disabled}
        title={title}
        className={
          disabled
            ? "inline-flex items-center gap-1 rounded-md bg-slate-200 px-3 py-1 text-[11px] font-semibold text-slate-500 shadow-sm cursor-not-allowed"
            : "inline-flex items-center gap-1 rounded-md bg-brand-blue-600 hover:bg-brand-blue-700 px-3 py-1 text-[11px] font-semibold text-white shadow-sm transition"
        }
      >
        <Rocket className="h-2.5 w-2.5" />
        {launching ? "Launching…" : "Launch"}
      </button>
    </div>
  );
}
