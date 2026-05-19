/**
 * LinkedIn analytics fetcher for the admin marketing-analytics page.
 *
 * The browser can't talk to Windsor.ai's MCP (Claude-side only) and we
 * don't want the Windsor key shipped to the client either. So this hits a
 * server-side proxy in the marketing Next.js app, which authenticates the
 * caller via Supabase JWT + is_admin_caller() and proxies to Windsor's
 * REST API. See marketing/app/api/admin/linkedin-analytics/route.ts.
 */

import { supabase } from "@/lib/supabase";

const DEFAULT_BASE = "https://logisticintel.com";
const API_BASE =
  (import.meta as any)?.env?.VITE_MARKETING_API_BASE_URL?.toString().trim() ||
  DEFAULT_BASE;

export type LinkedInAdsSummary = {
  spend: number;
  impressions: number;
  clicks: number;
  leads: number;
  ctr: number;
  cpc: number;
  top_campaigns: Array<{
    campaign: string;
    spend: number;
    impressions: number;
    clicks: number;
    leads: number;
    ctr: number;
    cpc: number;
  }>;
};

export type LinkedInOrganicSummary = {
  followers: number;
  followers_delta: number;
  post_impressions: number;
  engagements: number;
  engagement_rate: number;
  top_posts: Array<{
    post_id: string;
    title: string;
    impressions: number;
    engagements: number;
    engagement_rate: number;
  }>;
};

export type LinkedInAnalyticsResponse = {
  ok: true;
  days: number;
  generated_at: string;
  ads: LinkedInAdsSummary;
  organic: LinkedInOrganicSummary;
  partial_failures?: string[];
};

/**
 * `null` means "Windsor isn't configured yet" (HTTP 503) — render the
 * not-configured empty state. Any other failure throws.
 */
export async function fetchLinkedInAnalytics(
  days: number = 30,
): Promise<LinkedInAnalyticsResponse | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const accessToken = session?.access_token;
  if (!accessToken) {
    throw new Error("Not signed in.");
  }

  const url = `${API_BASE.replace(/\/$/, "")}/api/admin/linkedin-analytics?days=${days}`;
  const res = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });

  if (res.status === 503) {
    // Windsor key not set yet — UI shows a friendly "not configured" panel.
    return null;
  }
  if (!res.ok) {
    let detail = "";
    try {
      const body = await res.json();
      detail =
        typeof body?.error === "string"
          ? body.error
          : typeof body?.message === "string"
            ? body.message
            : "";
    } catch {
      // ignore
    }
    throw new Error(
      `LinkedIn analytics request failed (${res.status})${detail ? `: ${detail}` : ""}.`,
    );
  }
  return (await res.json()) as LinkedInAnalyticsResponse;
}

/**
 * Count rows in lit_leads whose first or last touch utm_source mentions
 * "linkedin". Used as the attribution callout under the LinkedIn cards.
 */
export async function fetchLinkedInLeadCount(days: number = 30): Promise<number> {
  const sinceIso = new Date(Date.now() - days * 86_400_000).toISOString();
  // We use two OR'd ILIKE filters on jsonb keys. Supabase PostgREST exposes
  // ->> as the json-text accessor and `ilike` translates to ILIKE.
  const { data, error } = await supabase
    .from("lit_leads")
    .select("id", { count: "exact" })
    .gte("created_at", sinceIso)
    .or(
      "first_touch->>utm_source.ilike.%linkedin%,last_touch->>utm_source.ilike.%linkedin%",
    );
  if (error) {
    // Don't blow up the whole panel — surface zero and log.
    console.warn("[linkedin-analytics] lit_leads attribution query failed", error);
    return 0;
  }
  return Array.isArray(data) ? data.length : 0;
}
