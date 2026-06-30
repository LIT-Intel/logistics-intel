"use client";

import { useEffect } from "react";

declare global {
  interface Window {
    Cal?: any;
  }
}

const CAL_NAMESPACE = "15min";
const CAL_LINK = "logisticintel/15min";

export function CalInlineEmbed() {
  useEffect(() => {
    (function (C: Window, A: string, L: string) {
      const p = function (a: any, ar: IArguments | any[]) {
        a.q.push(ar);
      };
      const d = C.document;
      C.Cal =
        C.Cal ||
        function () {
          const cal = C.Cal;
          const ar = arguments;
          if (!cal.loaded) {
            cal.ns = {};
            cal.q = cal.q || [];
            d.head.appendChild(d.createElement("script")).src = A;
            cal.loaded = true;
          }
          if (ar[0] === L) {
            const api = function () {
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
    })(window, "https://app.cal.com/embed/embed.js", "init");

    window.Cal?.("init", CAL_NAMESPACE, { origin: "https://app.cal.com" });
    window.Cal!.config = window.Cal!.config || {};
    window.Cal!.config.forwardQueryParams = true;
    window.Cal?.ns?.[CAL_NAMESPACE]?.("inline", {
      elementOrSelector: "#my-cal-inline-15min",
      config: { layout: "month_view", useSlotsViewOnSmallScreen: "true" },
      calLink: CAL_LINK,
    });
    window.Cal?.ns?.[CAL_NAMESPACE]?.("ui", {
      hideEventTypeDetails: false,
      layout: "month_view",
    });
  }, []);

  return (
    <div
      id="my-cal-inline-15min"
      aria-label="Schedule a 15-minute Pulse Explorer demo"
      style={{ width: "100%", minHeight: 720, height: "100%", overflow: "auto" }}
    />
  );
}
