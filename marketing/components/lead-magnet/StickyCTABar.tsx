"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { useLeadMagnetForm } from "./useLeadMagnetForm";
import styles from "./lead-magnet.module.css";

type Props = {
  /** Element whose visibility controls the bar — typically the hero form
   *  wrapper. When this element is in view, the bar stays hidden. */
  heroFormRef?: RefObject<HTMLElement>;
  /** Same as heroFormRef but takes a CSS selector — for Server Components
   *  that can't pass refs. Resolved with document.querySelector at mount.
   *  Prefer this over the fallback sentinel which is position-based and
   *  can show the bar on initial load if viewport height < sentinel top. */
  heroFormSelector?: string;
  /** Optional: when this element scrolls INTO the viewport (e.g. the
   *  section right after the middle band — footer or final CTA), the
   *  sticky bar slides away. Used on the homepage to bound the sticky to
   *  the hero → end-of-problem-section range. Money pages omit this and
   *  the bar stays visible all the way to the exit-intent. */
  hideOnVisibleRef?: RefObject<HTMLElement>;
  /** Same as hideOnVisibleRef but takes a CSS selector — convenient when
   *  the page is a Server Component and can't pass refs across the
   *  boundary. The selector is resolved with document.querySelector at
   *  mount. Falls through to hideOnVisibleRef if both are passed. */
  hideOnVisibleSelector?: string;
  /** Optional `source` override for the form submit. Defaults to
   *  "sticky-bar" for backwards compat across the money pages. */
  source?: string;
};

/**
 * Top-fixed CTA bar. Hidden until the hero scrolls past, then slides in
 * with a cyan-accented dark backdrop. Inline email capture shares the
 * /api/leads/resend handler with the hero + exit-intent forms.
 *
 * Optional `hideOnVisibleRef` bounds the visible range — pass a ref to
 * the section that should make the bar disappear when reached. The
 * homepage uses this so the bar glides alongside the user from the end
 * of the hero through the end of the problem section, then steps aside.
 */
export function StickyCTABar({
  heroFormRef,
  heroFormSelector,
  hideOnVisibleRef,
  hideOnVisibleSelector,
  source = "sticky-bar",
}: Props) {
  const [pastHero, setPastHero] = useState(false);
  const [endReached, setEndReached] = useState(false);
  const fallbackSentinel = useRef<HTMLDivElement | null>(null);
  const { onSubmit, submitting } = useLeadMagnetForm({ source });

  useEffect(() => {
    const target =
      heroFormRef?.current ??
      (heroFormSelector
        ? (document.querySelector(heroFormSelector) as HTMLElement | null)
        : null) ??
      fallbackSentinel.current;
    if (!target) return;
    const io = new IntersectionObserver(
      ([entry]) => setPastHero(!entry.isIntersecting),
      { threshold: 0, rootMargin: "0px" },
    );
    io.observe(target);
    return () => io.disconnect();
  }, [heroFormRef, heroFormSelector]);

  useEffect(() => {
    const end =
      hideOnVisibleRef?.current ??
      (hideOnVisibleSelector
        ? (document.querySelector(hideOnVisibleSelector) as HTMLElement | null)
        : null);
    if (!end) return;
    const io = new IntersectionObserver(
      ([entry]) => setEndReached(entry.isIntersecting),
      { threshold: 0, rootMargin: "-20% 0px 0px 0px" },
    );
    io.observe(end);
    return () => io.disconnect();
  }, [hideOnVisibleRef, hideOnVisibleSelector]);

  const visible = pastHero && !endReached;

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
              className="h-9 min-w-0 flex-1 appearance-none rounded-md border border-white/20 bg-slate-900/60 px-3 text-base text-white placeholder:text-white/55 focus:border-brand-cyan focus:bg-slate-900/80 focus:outline-none focus:ring-1 focus:ring-brand-cyan sm:w-64 sm:text-[13px]"
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
