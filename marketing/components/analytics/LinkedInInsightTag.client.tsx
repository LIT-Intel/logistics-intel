"use client";

/**
 * LinkedIn Insight Tag — conditional on NEXT_PUBLIC_LINKEDIN_PARTNER_ID.
 *
 * LinkedIn is the primary paid channel for B2B reach (freight forwarders,
 * brokers, NVOCCs, 3PLs). Insight Tag fires page-views automatically and
 * exposes window.lintrk('track', { conversion_id }) for client-side
 * conversion events when we want them (server-side via the Conversions
 * API is preferred for high-fidelity events — handled separately).
 *
 * No partner id env → no script renders → zero network impact and no
 * client-side error.
 *
 * Loaded with strategy="afterInteractive" so it never blocks first paint.
 * LinkedIn recommends placement just before </body>; the equivalent here
 * is the layout body, after page content.
 */

import Script from "next/script";

export default function LinkedInInsightTag() {
  const partnerId = process.env.NEXT_PUBLIC_LINKEDIN_PARTNER_ID;
  if (!partnerId) return null;

  // Only allow digits — the value gets interpolated into an inline script.
  if (!/^\d+$/.test(partnerId)) return null;

  return (
    <>
      <Script id="linkedin-insight" strategy="afterInteractive">
        {`_linkedin_partner_id = "${partnerId}";
window._linkedin_data_partner_ids = window._linkedin_data_partner_ids || [];
window._linkedin_data_partner_ids.push(_linkedin_partner_id);
(function(l){if (!l){window.lintrk = function(a,b){window.lintrk.q.push([a,b])};window.lintrk.q=[]}
var s = document.getElementsByTagName("script")[0];
var b = document.createElement("script");
b.type = "text/javascript";b.async = true;
b.src = "https://snap.licdn.com/li.lms-analytics/insight.min.js";
s.parentNode.insertBefore(b, s);})(window.lintrk);`}
      </Script>
      <noscript>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          height="1"
          width="1"
          style={{ display: "none" }}
          alt=""
          src={`https://px.ads.linkedin.com/collect/?pid=${partnerId}&fmt=gif`}
        />
      </noscript>
    </>
  );
}
