import { assert, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { renderDigestHtml } from "./digest_render.ts";

Deno.test("digest renders POD/final dest/arrival when present", () => {
  const html = renderDigestHtml({
    firstName: "Test",
    alerts: [{
      alert_type: "volume",
      severity: "warning",
      payload: {
        company_name: "Acme Inc",
        before: 30, after: 60, pct_delta: 1.0,
        pod: "USLGB", final_dest: "Chicago, IL",
        next_arrival_date: "2026-05-25T00:00:00Z",
        drayage_est_usd: 8400, drayage_est_low_usd: 6300, drayage_est_high_usd: 10500,
        drayage_container_count: 4,
      },
    }],
    unsubscribeToken: "x",
  });
  assertStringIncludes(html, "POD: USLGB");
  assertStringIncludes(html, "Final dest: Chicago, IL");
  assertStringIncludes(html, "Drayage opportunity:");
  assertStringIncludes(html, "$8,400");
});
