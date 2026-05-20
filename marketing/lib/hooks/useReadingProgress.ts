"use client";

import { useEffect, useState } from "react";

/**
 * Reading progress hook — returns a 0–100 number tracking how far the
 * viewport has scrolled through the document (or a specific element if
 * `targetRef` is provided). rAF-throttled so we don't thrash on every
 * scroll event. Respects `prefers-reduced-motion` by jumping straight
 * to a final value (no animation).
 */
export function useReadingProgress(
  targetRef?: React.RefObject<HTMLElement>,
): number {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (typeof window === "undefined") return;

    let rafId = 0;
    let queued = false;

    const reduce = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    const compute = () => {
      queued = false;
      const target = targetRef?.current;
      if (target) {
        const rect = target.getBoundingClientRect();
        const total = target.offsetHeight - window.innerHeight;
        if (total <= 0) {
          setProgress(rect.bottom < 0 ? 100 : 0);
          return;
        }
        const scrolled = Math.min(Math.max(-rect.top, 0), total);
        setProgress(Math.round((scrolled / total) * 100));
      } else {
        const doc = document.documentElement;
        const total = doc.scrollHeight - window.innerHeight;
        if (total <= 0) {
          setProgress(100);
          return;
        }
        setProgress(Math.round((window.scrollY / total) * 100));
      }
    };

    const onScroll = () => {
      if (reduce) {
        compute();
        return;
      }
      if (queued) return;
      queued = true;
      rafId = requestAnimationFrame(compute);
    };

    compute();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [targetRef]);

  return progress;
}
