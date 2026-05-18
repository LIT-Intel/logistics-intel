"use client";

import { useCallback, useState } from "react";

/**
 * Shared submit handler for every lead-magnet form on the site (sticky bar,
 * hero, exit-intent, hub final-CTA). POSTs JSON to /api/leads/resend then
 * redirects to /signup with the email prefilled. Failure path still
 * redirects so we never lose the lead — the email is captured client-side
 * and forwarded via the URL.
 *
 * Attribution captured on every submit:
 *   - utm_source / utm_medium / utm_campaign read from the current URL
 *     (the click-through URL, not the form action). Allows PPC/SEO/social
 *     attribution all the way through to the Resend Audience routing.
 *   - document.referrer for fallback channel inference when no utm tags.
 *   - Optional `role` (the page passes "forwarders" | "brokers" | etc.
 *     when the form is rendered on a role-specific landing page).
 */
export type LeadMagnetSubmitOpts = {
  source: string;
  offer?: string;
  /** Optional role hint when the form lives on a role-specific page. */
  role?: string;
  /** Optional override; defaults to /api/leads/resend */
  endpoint?: string;
};

function readAttribution(): {
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  referrer?: string;
} {
  if (typeof window === "undefined") return {};
  const out: ReturnType<typeof readAttribution> = {};
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
      const attribution = readAttribution();
      const params = new URLSearchParams({ email, source });
      if (offer) params.set("offer", offer);
      const redirect = `/signup?${params.toString()}`;

      try {
        await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email,
            source,
            ...(offer ? { offer } : {}),
            ...(role ? { role } : {}),
            ...attribution,
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
