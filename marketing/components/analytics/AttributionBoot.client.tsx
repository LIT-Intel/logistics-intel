"use client";

/**
 * AttributionBoot — fires once per page-load on the client to capture
 * utm + referrer + click-ids from the landing URL into the first-party
 * `lit_first_touch` / `lit_last_touch` cookies (and mirror them to
 * sessionStorage for marketing/lib/events.ts).
 *
 * Renders nothing. See marketing/lib/attribution.ts for the full
 * capture/persistence logic.
 */

import { useEffect } from "react";
import { writeAttributionFromUrl } from "@/lib/attribution";

export default function AttributionBoot() {
  useEffect(() => {
    try {
      writeAttributionFromUrl();
    } catch {
      /* swallow — attribution must never crash a page render */
    }
  }, []);
  return null;
}
