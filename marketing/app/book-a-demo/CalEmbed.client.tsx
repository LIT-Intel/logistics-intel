"use client";

import { useEffect, useRef } from "react";

/**
 * Cal.com inline embed. Uses Cal's official embed.js loader (no npm dep)
 * so the bundle stays small. The script attaches a global `Cal()` and we
 * mount the inline widget into the ref'd div on first paint.
 *
 * Reference: https://cal.com/docs/core-features/embed/embed-inline
 */

declare global {
  interface Window {
    Cal: any;
  }
}

export default function CalEmbed({ calLink }: { calLink: string }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const nsRef = useRef<string>(`demo-${Math.random().toString(36).slice(2, 8)}`);

  useEffect(() => {
    if (!ref.current) return;
    const ns = nsRef.current;
    const w = window as any;

    // Standard Cal embed bootstrap. Mirrors Cal's "Embed → Inline" snippet
    // (Apr 2026 build): defines a Cal() function that lazy-loads embed.js,
    // queues calls until the script attaches, then replays them.
    /* eslint-disable @typescript-eslint/no-explicit-any */
    (function (C: any, A: string, L: string) {
      const p = function (a: any, ar: any) {
        a.q.push(ar);
      };
      const d = C.document;
      C.Cal =
        C.Cal ||
        function () {
          const cal = C.Cal;
          // eslint-disable-next-line prefer-rest-params
          const ar: any = arguments;
          if (!cal.loaded) {
            cal.ns = {};
            cal.q = cal.q || [];
            const head = d.head ?? d.getElementsByTagName("head")[0];
            const el = d.createElement("script");
            el.src = A;
            head.appendChild(el);
            cal.loaded = true;
          }
          if (ar[0] === L) {
            const api: any = function () {
              // eslint-disable-next-line prefer-rest-params
              p(api, arguments);
            };
            const namespace = ar[1];
            api.q = api.q || [];
            if (typeof namespace === "string") {
              cal.ns[namespace] = cal.ns[namespace] || api;
              p(cal.ns[namespace], ar);
              p(cal, ["initNamespace", namespace]);
            } else {
              p(cal, ar);
            }
            return;
          }
          p(cal, ar);
        };
    })(w, "https://app.cal.com/embed/embed.js", "init");
    /* eslint-enable @typescript-eslint/no-explicit-any */

    w.Cal("init", ns, { origin: "https://cal.com" });
    w.Cal.ns[ns]("inline", {
      elementOrSelector: ref.current,
      config: { layout: "month_view" },
      calLink,
    });
    w.Cal.ns[ns]("ui", {
      hideEventTypeDetails: false,
      layout: "month_view",
      styles: { branding: { brandColor: "#2563eb" } },
    });
  }, [calLink]);

  return <div ref={ref} className="min-h-[560px] w-full" />;
}
