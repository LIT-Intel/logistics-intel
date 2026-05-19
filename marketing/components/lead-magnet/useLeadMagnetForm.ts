"use client";

import { useCallback, useState } from "react";
import { track } from "@/lib/events";
import {
  readAttribution,
  type Attribution,
} from "@/lib/attribution";

/**
 * Shared submit handler for every lead-magnet form on the site (sticky bar,
 * hero, exit-intent, hub final-CTA). POSTs JSON to /api/leads/resend then
 * redirects to /signup with the email prefilled. Failure path still
 * redirects so we never lose the lead — the email is captured client-side
 * and forwarded via the URL.
 *
 * Attribution comes from `lib/attribution.ts` (cookie-backed), NOT the
 * current URL. That fixes the previous bug where landing on
 * /freight-leads?utm_source=linkedin-ads then submitting on /customers
 * lost the utm. We send BOTH snapshots:
 *
 *   - lastTouch utm/referrer is flattened into the legacy fields the API
 *     already supports (utmSource, utmMedium, utmCampaign, referrer) so
 *     the audience-routing in lib/resend-audiences.ts keeps working.
 *   - The full firstTouch + lastTouch objects are also sent as the
 *     `firstTouch` / `lastTouch` fields so the API can persist both
 *     attribution snapshots for downstream reporting.
 *
 * If no cookie attribution exists yet (e.g. brand-new tab, storage
 * blocked, AttributionBoot race), we fall back to reading utm + referrer
 * from the current URL so we never send an empty attribution payload.
 *
 * Optional `role` lets a role-specific page (forwarders / brokers / etc.)
 * tag every submission for downstream Resend audience routing.
 */
export type LeadMagnetSubmitOpts = {
  source: string;
  offer?: string;
  /** Optional role hint when the form lives on a role-specific page. */
  role?: string;
  /** Optional override; defaults to /api/leads/resend */
  endpoint?: string;
};

type FlatAttribution = {
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  referrer?: string;
};

function flatten(a: Attribution | null): FlatAttribution {
  if (!a) return {};
  const out: FlatAttribution = {};
  if (a.utmSource) out.utmSource = a.utmSource;
  if (a.utmMedium) out.utmMedium = a.utmMedium;
  if (a.utmCampaign) out.utmCampaign = a.utmCampaign;
  if (a.referrer) out.referrer = a.referrer;
  return out;
}

function readUrlFallback(): FlatAttribution {
  if (typeof window === "undefined") return {};
  const out: FlatAttribution = {};
  try {
    const params = new URLSearchParams(window.location.search);
    const utmSource = params.get("utm_source")?.trim();
    const utmMedium = params.get("utm_medium")?.trim();
    const utmCampaign = params.get("utm_campaign")?.trim();
    if (utmSource) out.utmSource = utmSource;
    if (utmMedium) out.utmMedium = utmMedium;
    if (utmCampaign) out.utmCampaign = utmCampaign;
  } catch {
    /* ignore malformed URLs */
  }
  try {
    const ref = document.referrer;
    if (ref && !ref.startsWith(window.location.origin)) {
      out.referrer = ref;
    }
  } catch {
    /* ignore */
  }
  return out;
}

export function useLeadMagnetForm(opts: LeadMagnetSubmitOpts) {
  const { source, offer, role, endpoint = "/api/leads/resend" } = opts;
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      setError(null);

      const form = e.currentTarget;
      const data = new FormData(form);
      const email = String(data.get("email") || "").trim();

      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        setError("Please enter a valid email.");
        return;
      }

      setSubmitting(true);

      const { first, last } = readAttribution();
      const flatLast = flatten(last);
      // Belt-and-suspenders: if cookie attribution missed (e.g. brand-new
      // tab, storage disabled, AttributionBoot race), fall back to URL.
      const flatAttribution: FlatAttribution =
        flatLast.utmSource ||
        flatLast.utmMedium ||
        flatLast.utmCampaign ||
        flatLast.referrer
          ? flatLast
          : readUrlFallback();

      const params = new URLSearchParams({ email, source });
      if (offer) params.set("offer", offer);
      const redirect = `/signup?${params.toString()}`;

      // Fire form_submit BEFORE the redirect — track() uses sendBeacon
      // when available so it survives the unload below.
      try {
        track("form_submit", {
          source,
          offer: offer ?? undefined,
          role: role ?? undefined,
          email,
        });
      } catch {
        /* analytics is best-effort */
      }

      try {
        await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email,
            source,
            ...(offer ? { offer } : {}),
            ...(role ? { role } : {}),
            ...flatAttribution,
            ...(first ? { firstTouch: first } : {}),
            ...(last ? { lastTouch: last } : {}),
          }),
          keepalive: true,
        });
      } catch {
        // swallow — we still redirect so the lead isn't lost
      } finally {
        window.location.assign(redirect);
      }
    },
    [endpoint, source, offer, role],
  );

  return { onSubmit, submitting, error };
}
