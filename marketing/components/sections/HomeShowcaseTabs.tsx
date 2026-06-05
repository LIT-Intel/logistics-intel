"use client";

import {
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useId,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowRight } from "lucide-react";

/**
 * One product capability surfaced by the tabbed home showcase. Each tab
 * carries its own headline, supporting bullets, optional CTA and the
 * animated mock that renders in the right-hand stage.
 */
export type ShowcaseTab = {
  id: string;
  /** Short tab-button label, e.g. "Company Intel". */
  label: string;
  /** Small-caps eyebrow above the tab headline. */
  eyebrow: string;
  /** Tab headline — supports inline <em> for grad-text-cyan accent. */
  headline: ReactNode;
  /** 1-paragraph supporting copy under the headline. */
  description?: ReactNode;
  /** Three-to-four short proof bullets. */
  bullets: string[];
  ctaLabel?: string;
  ctaHref?: string;
  /** The animated product mock for the right-hand stage. */
  mock: ReactNode;
};

export type HomeShowcaseTabsProps = {
  /** Section eyebrow above the page-level headline. */
  eyebrow: string;
  /** Section headline. */
  headline: ReactNode;
  /** Optional section subhead. */
  intro?: ReactNode;
  /** Non-empty list of tabs. First entry is active on mount. */
  tabs: [ShowcaseTab, ...ShowcaseTab[]];
};

/**
 * Tabbed product-capability showcase used on the home page. Collapses what
 * was a 4-row alternating stack (~2,560px of phone scroll) into a single
 * tabbed shell with a pill row above and a swap-stage below. Crossfades
 * between tabs via framer-motion; arrow-key navigable; respects
 * prefers-reduced-motion.
 */
export function HomeShowcaseTabs({
  eyebrow,
  headline,
  intro,
  tabs,
}: HomeShowcaseTabsProps) {
  const [activeId, setActiveId] = useState<string>(tabs[0].id);
  const prefersReducedMotion = useReducedMotion();
  const baseId = useId();
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const activeIndex = tabs.findIndex((t) => t.id === activeId);
  const active = tabs[activeIndex] ?? tabs[0];

  const focusTab = useCallback(
    (id: string) => {
      setActiveId(id);
      // Defer to allow React to render the new tabindex before focus.
      requestAnimationFrame(() => {
        tabRefs.current[id]?.focus();
      });
    },
    [],
  );

  const handleKey = useCallback(
    (e: KeyboardEvent<HTMLButtonElement>) => {
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft" && e.key !== "Home" && e.key !== "End") {
        return;
      }
      e.preventDefault();
      const last = tabs.length - 1;
      let nextIndex = activeIndex;
      if (e.key === "ArrowRight") nextIndex = activeIndex === last ? 0 : activeIndex + 1;
      if (e.key === "ArrowLeft") nextIndex = activeIndex === 0 ? last : activeIndex - 1;
      if (e.key === "Home") nextIndex = 0;
      if (e.key === "End") nextIndex = last;
      focusTab(tabs[nextIndex].id);
    },
    [activeIndex, focusTab, tabs],
  );

  return (
    <section
      className="relative bg-section-tint py-20 sm:py-24"
      aria-labelledby={`${baseId}-section-heading`}
    >
      <div className="mx-auto max-w-container px-5 sm:px-8">
        <div className="mx-auto max-w-[760px] text-center">
          <span className="lit-pill">
            <span className="dot" aria-hidden />
            {eyebrow}
          </span>
          <h2
            id={`${baseId}-section-heading`}
            className="display-md mt-4 mx-auto max-w-prose"
          >
            {headline}
          </h2>
          {intro ? (
            <p className="lead mx-auto mt-3 max-w-[640px]">{intro}</p>
          ) : null}
        </div>

        {/* Tab bar — pill row. Horizontally scrollable on small screens,
            centered on desktop. */}
        <div
          role="tablist"
          aria-label="Product capabilities"
          className="mt-10 flex flex-nowrap items-center justify-start gap-2 overflow-x-auto pb-2 sm:flex-wrap sm:justify-center sm:overflow-visible sm:pb-0"
        >
          {tabs.map((t) => {
            const selected = t.id === activeId;
            return (
              <button
                key={t.id}
                ref={(el) => {
                  tabRefs.current[t.id] = el;
                }}
                role="tab"
                type="button"
                id={`${baseId}-tab-${t.id}`}
                aria-selected={selected}
                aria-controls={`${baseId}-panel-${t.id}`}
                tabIndex={selected ? 0 : -1}
                onClick={() => setActiveId(t.id)}
                onKeyDown={handleKey}
                className={[
                  "shrink-0 h-10 px-5 rounded-full text-[14px] font-medium font-display transition-all",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue/40 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent",
                  selected
                    ? "bg-ink-900 text-white shadow-md"
                    : "bg-white/60 text-ink-700 border border-ink-100 hover:bg-white",
                ].join(" ")}
              >
                {t.label}
              </button>
            );
          })}
        </div>

        {/* Stage — left content column + right mock column. Single
            tabpanel that swaps on activeId via AnimatePresence. */}
        <div className="mt-10">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={active.id}
              role="tabpanel"
              id={`${baseId}-panel-${active.id}`}
              aria-labelledby={`${baseId}-tab-${active.id}`}
              initial={prefersReducedMotion ? false : { opacity: 0, y: 8 }}
              animate={prefersReducedMotion ? undefined : { opacity: 1, y: 0 }}
              exit={prefersReducedMotion ? undefined : { opacity: 0, y: -8 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
              className="grid items-center gap-12 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-16 min-h-[640px] lg:min-h-[600px]"
            >
              <div>
                <div className="eyebrow">{active.eyebrow}</div>
                <h3 className="display-md mt-3">{active.headline}</h3>
                {active.description ? (
                  <p className="font-body mt-5 max-w-[480px] text-[17px] leading-[1.6] text-ink-500">
                    {active.description}
                  </p>
                ) : null}
                <ul className="font-body mt-6 space-y-2.5 text-[14.5px] leading-snug text-ink-700">
                  {active.bullets.map((b) => (
                    <li key={b} className="flex items-start gap-2.5">
                      <span
                        className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-blue"
                        aria-hidden
                      />
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
                {active.ctaLabel && active.ctaHref ? (
                  <div className="mt-7">
                    <Link
                      href={active.ctaHref}
                      className="font-display inline-flex items-center gap-1.5 text-[14px] font-semibold text-brand-blue hover:text-brand-blue-700"
                    >
                      {active.ctaLabel}
                      <ArrowRight className="h-4 w-4" aria-hidden />
                    </Link>
                  </div>
                ) : null}
              </div>
              <div
                className="min-h-[600px] overflow-hidden sm:min-h-[560px] lg:min-h-0"
                style={{ contain: "layout paint", maxWidth: "100%" }}
              >
                {active.mock}
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}
