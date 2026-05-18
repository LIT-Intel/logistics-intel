import type { ReactNode } from "react";
import styles from "./lead-magnet.module.css";

type Props = {
  /** Text shown inside the fake browser URL bar. */
  urlBarText: string;
  /** Optional pill in the upper-right corner — e.g. "LIVE", "CBP · WEEKLY". */
  pulseLabel?: string;
  children?: ReactNode;
};

/**
 * Dark "browser chrome" frame used to host product mockups inside the
 * hero. Renders the three macOS-style window dots, a faux URL bar, and
 * an optional pulsing label pill. Body content fills the slot below.
 */
export function LiveProductPreview({ urlBarText, pulseLabel, children }: Props) {
  return (
    <div className="relative w-full max-w-[640px] overflow-hidden rounded-2xl border border-white/10 bg-dark-2 shadow-2xl shadow-black/40 ring-1 ring-brand-cyan/10">
      {/* Chrome */}
      <div className="flex items-center gap-3 border-b border-white/10 bg-dark-1 px-4 py-2.5">
        <div className="flex items-center gap-1.5" aria-hidden>
          <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f56]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#ffbd2e]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#27c93f]" />
        </div>
        <div className="ml-2 flex h-6 flex-1 items-center rounded-md border border-white/10 bg-white/[0.04] px-3 text-[11px] text-white/55">
          <span className="font-mono">{urlBarText}</span>
        </div>
        {pulseLabel && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-brand-cyan/40 bg-brand-cyan/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-brand-cyan">
            <span className={`${styles.livePulse} inline-block h-1.5 w-1.5 rounded-full bg-brand-cyan`} aria-hidden />
            {pulseLabel}
          </span>
        )}
      </div>

      {/* Body */}
      <div className="bg-dark-0 p-4 sm:p-5">{children}</div>
    </div>
  );
}
