"use client";

import { useEffect, useState } from "react";

/**
 * Scrollspy hook — observes a list of element IDs and returns the ID of
 * the section currently considered "active." Uses IntersectionObserver
 * with the ZoomInfo-style `rootMargin: '-15% 0px -55% 0px'` so the
 * active band sits roughly in the upper-middle of the viewport.
 *
 * Fallback: when no observed section is intersecting (top of page,
 * bottom of page, between sections), picks the section closest to —
 * but above — the viewport center. This avoids the dead zone where
 * `[]intersecting` would leave the TOC blank.
 */
export function useScrollSpy(ids: string[]): string | null {
  const [active, setActive] = useState<string | null>(ids[0] ?? null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!ids.length) return;

    const elements = ids
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => Boolean(el));
    if (!elements.length) return;

    const visible = new Map<string, IntersectionObserverEntry>();

    const pickActive = () => {
      // Prefer intersecting candidates ordered by document position
      const intersecting = Array.from(visible.values()).filter(
        (e) => e.isIntersecting,
      );
      if (intersecting.length > 0) {
        intersecting.sort(
          (a, b) =>
            a.target.getBoundingClientRect().top -
            b.target.getBoundingClientRect().top,
        );
        const id = (intersecting[0].target as HTMLElement).id;
        if (id) setActive(id);
        return;
      }
      // Fallback — closest section above the viewport center
      const center = window.innerHeight * 0.4;
      let best: { id: string; dist: number } | null = null;
      for (const el of elements) {
        const top = el.getBoundingClientRect().top;
        if (top <= center) {
          const dist = center - top;
          if (!best || dist < best.dist) best = { id: el.id, dist };
        }
      }
      if (best) setActive(best.id);
    };

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => visible.set((e.target as HTMLElement).id, e));
        pickActive();
      },
      {
        rootMargin: "-15% 0px -55% 0px",
        threshold: [0, 0.5, 1],
      },
    );

    elements.forEach((el) => observer.observe(el));
    // Prime the initial state once.
    pickActive();

    return () => observer.disconnect();
    // ids.join() — re-run when the list of section IDs actually changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids.join("|")]);

  return active;
}
