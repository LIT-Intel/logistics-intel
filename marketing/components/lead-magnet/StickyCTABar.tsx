"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { useLeadMagnetForm } from "./useLeadMagnetForm";
import styles from "./lead-magnet.module.css";

type Props = {
  /** Element whose visibility controls the bar — typically the hero form
   *  wrapper. When this element is in view, the bar stays hidden. */
  heroFormRef?: RefObject<HTMLElement>;
};

/**
 * Top-fixed CTA bar. Hidden until the hero scrolls past, then slides in
 * with a cyan-accented dark backdrop. Inline email capture shares the
 * /api/leads/resend handler with the hero + exit-intent forms.
 */
export function StickyCTABar({ heroFormRef }: Props) {
  const [visible, setVisible] = useState(false);
  const fallbackSentinel = useRef<HTMLDivElement | null>(null);
  const { onSubmit, submitting } = useLeadMagnetForm({ source: "sticky-bar" });

  useEffect(() => {
    const target = heroFormRef?.current ?? fallbackSentinel.current;
    if (!target) return;
    const io = new IntersectionObserver(
      ([entry]) => setVisible(!entry.isIntersecting),
      { threshold: 0, rootMargin: "0px 0px -40% 0px" },
    );
    io.observe(target);
    return () => io.disconnect();
  }, [heroFormRef]);

  return (
    <>
      {/* Fallback sentinel — used if no heroFormRef is provided. Sits 480px
       *  down the page; once scrolled past, the bar appears. */}
      {!heroFormRef && (
        <div
          ref={fallbackSentinel}
          aria-hidden
          className="pointer-events-none absolute left-0 right-0 top-[480px] h-px"
        />
      )}

      <div
        role="region"
        aria-label="Quick signup"
        aria-hidden={!visible}
        className={`${styles.stickyBar} ${visible ? styles.stickyBarVisible : ""} fixed inset-x-0 top-0 z-[60]`}
      >
        <div className="mx-auto flex max-w-content items-center gap-4 px-4 py-2.5 sm:px-6">
          <p className="hidden text-[13px] font-medium text-white/90 sm:block">
            Start free — <span className="text-brand-cyan">10 searches + 10 verified contacts.</span>{" "}
            <span className="text-white/60">No credit card.</span>
          </p>

          <form
            onSubmit={onSubmit}
            className="ml-auto flex w-full items-center gap-2 sm:w-auto"
          >
            <input type="hidden" name="source" value="sticky-bar" />
            <label htmlFor="lit-sticky-email" className="sr-only">
              Work email
            </label>
            <input
              id="lit-sticky-email"
              type="email"
              name="email"
              required
              autoComplete="email"
              placeholder="you@company.com"
              className="h-9 min-w-0 flex-1 rounded-md border border-white/10 bg-white/5 px-3 text-[13px] text-white placeholder:text-white/40 focus:border-brand-cyan focus:outline-none focus:ring-1 focus:ring-brand-cyan sm:w-64"
            />
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex h-9 shrink-0 items-center justify-center rounded-md bg-brand-cyan px-3 text-[13px] font-semibold text-dark-0 transition hover:bg-brand-cyan-dim disabled:opacity-60"
            >
              {submitting ? "…" : "Start free"}
            </button>
          </form>
        </div>
      </div>
    </>
  );
}
