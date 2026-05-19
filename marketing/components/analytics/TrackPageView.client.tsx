"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { track } from "@/lib/events";

/**
 * Fires a `page_view` event on every App Router navigation. Mounted once
 * in the root layout so we don't need per-page wiring.
 *
 * Also fires `time_on_page_30s` and `scroll_depth_75` engagement events
 * once per pathname (not per session) — these are signal events for the
 * funnel dashboard, not raw counts.
 */
export default function TrackPageView() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const lastPathRef = useRef<string | null>(null);

  useEffect(() => {
    if (!pathname) return;
    const search = searchParams?.toString();
    const fullPath = search ? `${pathname}?${search}` : pathname;
    if (lastPathRef.current === fullPath) return;
    lastPathRef.current = fullPath;
    track("page_view", { path: fullPath });
  }, [pathname, searchParams]);

  // 30s engagement timer — resets on pathname change.
  useEffect(() => {
    if (!pathname) return;
    const t = window.setTimeout(() => {
      track("time_on_page_30s", { path: pathname });
    }, 30_000);
    return () => window.clearTimeout(t);
  }, [pathname]);

  // 75% scroll depth — resets on pathname change.
  useEffect(() => {
    if (!pathname) return;
    let fired = false;

    const onScroll = () => {
      if (fired) return;
      const doc = document.documentElement;
      const scrolled =
        (window.scrollY + window.innerHeight) /
        Math.max(doc.scrollHeight, 1);
      if (scrolled >= 0.75) {
        fired = true;
        track("scroll_depth_75", { path: pathname });
        window.removeEventListener("scroll", onScroll);
      }
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [pathname]);

  // Outbound click listener — once per mount.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const target = e.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest("a") as HTMLAnchorElement | null;
      if (!anchor || !anchor.href) return;
      try {
        const url = new URL(anchor.href, window.location.href);
        if (url.origin === window.location.origin) return;
        // Skip mailto/tel/etc. — only http(s) outbound.
        if (!/^https?:$/.test(url.protocol)) return;
        track("outbound_click", {
          href: url.href,
          label: (anchor.textContent || "").trim().slice(0, 96) || undefined,
        });
      } catch {
        /* ignore malformed URLs */
      }
    };
    document.addEventListener("click", onClick, { capture: true });
    return () => document.removeEventListener("click", onClick, { capture: true });
  }, []);

  return null;
}
