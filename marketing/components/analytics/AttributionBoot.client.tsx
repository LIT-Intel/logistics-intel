"use client";

/**
 * AttributionBoot — fires once per page-load on the client to:
 *   1. mint/read the stable anonymous_id (lit_anon_id cookie + localStorage)
 *      so the id exists before any signup and follows the visitor into
 *      app.logisticintel.com for session stitching; and
 *   2. capture utm + referrer + click-ids from the landing URL into the
 *      first-party `lit_first_touch` / `lit_last_touch` cookies (and mirror
 *      them to sessionStorage for marketing/lib/events.ts).
 *
 * Renders nothing. See marketing/lib/anonId.ts + marketing/lib/attribution.ts.
 */

import { useEffect } from "react";
import { writeAttributionFromUrl } from "@/lib/attribution";
import { getAnonId } from "@/lib/anonId";

export default function AttributionBoot() {
  useEffect(() => {
    try {
      // Mint the anonymous id on first load so it's present before signup.
      getAnonId();
    } catch {
      /* swallow — identity must never crash a page render */
    }
    try {
      writeAttributionFromUrl();
    } catch {
      /* swallow — attribution must never crash a page render */
    }
  }, []);
  return null;
}
