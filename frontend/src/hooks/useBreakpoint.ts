// useBreakpoint — shared responsive hook for chart components. Returns
// { isMobile, isTablet } based on Tailwind's default breakpoints
// (sm = 640px, md = 768px). Use this when a chart needs to vary props
// like `barSize`, `interval`, or label truncation length based on the
// viewport — purely visual responsiveness, no layout restructuring.
//
// Hydration-safe: defaults to desktop (false/false) on first render so
// SSR markup matches the client's initial hydration pass, then flips
// once mounted + matchMedia is available.

import { useEffect, useState } from "react";

export type Breakpoint = {
  /** < 640px (Tailwind `sm` lower bound). */
  isMobile: boolean;
  /** ≥ 640px AND < 768px (Tailwind `sm` to `md` range). */
  isTablet: boolean;
};

const MOBILE_QUERY = "(max-width: 639px)";
const TABLET_QUERY = "(min-width: 640px) and (max-width: 767px)";

export function useBreakpoint(): Breakpoint {
  const [bp, setBp] = useState<Breakpoint>({ isMobile: false, isTablet: false });

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mobileMq = window.matchMedia(MOBILE_QUERY);
    const tabletMq = window.matchMedia(TABLET_QUERY);
    const update = () =>
      setBp({ isMobile: mobileMq.matches, isTablet: tabletMq.matches });
    update();
    // Modern browsers: addEventListener. Safari < 14 fallback uses addListener.
    if (mobileMq.addEventListener) {
      mobileMq.addEventListener("change", update);
      tabletMq.addEventListener("change", update);
      return () => {
        mobileMq.removeEventListener("change", update);
        tabletMq.removeEventListener("change", update);
      };
    }
    mobileMq.addListener(update);
    tabletMq.addListener(update);
    return () => {
      mobileMq.removeListener(update);
      tabletMq.removeListener(update);
    };
  }, []);

  return bp;
}

export default useBreakpoint;
