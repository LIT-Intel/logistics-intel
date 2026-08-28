import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Attribution capture at the edge.
 *
 * Two jobs, both scoped to `.logisticintel.com` so the app at
 * app.logisticintel.com can read them at signup:
 *
 *   1. First-touch (`lit_attrib`, write-once): how a visitor FIRST arrived
 *      — UTMs, external referrer, and the full landing path+query. Never
 *      overwritten; the channel that first earned the visit keeps credit.
 *      This is the thin legacy cookie signup falls back to.
 *
 *   2. Last-touch (`lit_last_touch`, refreshed): the MOST RECENT tagged
 *      landing, written in the SAME rich camelCase shape as
 *      marketing/lib/attribution.ts so the client capture and the edge
 *      capture agree. Refreshed on every request that carries a utm /
 *      click-id / off-site referrer; a bare untagged page-load does NOT
 *      clobber it (that would silently delete real attribution).
 *
 * Search/campaign attribution from model-assistant referral sources is not
 * retained in public URLs or cookies. Those requests are redirected to the
 * same clean canonical path before attribution capture runs.
 *
 * Not httpOnly on purpose (the app reads from document.cookie); no secrets.
 * 90-day lifetime.
 */

const FIRST_COOKIE = "lit_attrib";
const LAST_COOKIE = "lit_last_touch";
const MAX_AGE_SECONDS = 90 * 24 * 3600;
const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"] as const;

const NON_PUBLIC_REFERRAL_SOURCES = new Set([
  "chatgpt",
  "chatgpt.com",
  "openai",
  "openai.com",
  "claude",
  "claude.ai",
  "anthropic",
  "anthropic.com",
  "gemini",
  "gemini.google.com",
  "copilot",
  "copilot.microsoft.com",
  "perplexity",
  "perplexity.ai",
  "llm",
]);

function normalizedHostOrSource(value: string): string {
  return value.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/$/, "");
}

function isNonPublicReferralSource(value: string | null | undefined): boolean {
  if (!value) return false;
  const normalized = normalizedHostOrSource(value);
  return NON_PUBLIC_REFERRAL_SOURCES.has(normalized);
}

function offsiteReferrerHost(referrer: string): string | null {
  try {
    const refHost = referrer ? new URL(referrer).hostname : "";
    if (
      refHost &&
      !refHost.endsWith("logisticintel.com") &&
      !isNonPublicReferralSource(refHost)
    ) {
      return refHost.slice(0, 120);
    }
  } catch {
    /* malformed referer header — ignore */
  }
  return null;
}

export function middleware(req: NextRequest) {
  const url = req.nextUrl;

  // Keep model-assistant attribution out of indexable URLs and persisted
  // attribution. Preserve unrelated query parameters, but remove the full UTM
  // bundle when its source is a non-public referral source.
  if (isNonPublicReferralSource(url.searchParams.get("utm_source"))) {
    const cleanUrl = url.clone();
    for (const key of UTM_KEYS) cleanUrl.searchParams.delete(key);
    return NextResponse.redirect(cleanUrl, 308);
  }

  const res = NextResponse.next();
  const host = req.headers.get("host") || "";
  const isProdHost = host.endsWith("logisticintel.com");
  const domainOpt = isProdHost ? { domain: ".logisticintel.com" as const } : {};
  // Full landing = path + query (not just pathname) so the utm-tagged URL
  // that started the visit is preserved verbatim.
  const landing = (url.pathname + (url.search || "")).slice(0, 300);
  const referrerHost = offsiteReferrerHost(req.headers.get("referer") || "");

  // Collect present UTMs once (used by both cookies).
  const utm: Record<string, string> = {};
  for (const key of UTM_KEYS) {
    const v = url.searchParams.get(key);
    if (v) utm[key] = v.slice(0, 120);
  }
  const gclid = url.searchParams.get("gclid");
  const fbclid = url.searchParams.get("fbclid");
  const liFatId = url.searchParams.get("li_fat_id");

  // ── First-touch: write once. ──────────────────────────────────────────
  if (!req.cookies.get(FIRST_COOKIE)) {
    const attrib: Record<string, string> = { ...utm };
    if (referrerHost) attrib.referrer = referrerHost;
    // A truly direct visit is still worth stamping: "landing" beats an
    // empty Source column.
    attrib.landing = landing;
    attrib.ts = new Date().toISOString();
    res.cookies.set(FIRST_COOKIE, encodeURIComponent(JSON.stringify(attrib)), {
      maxAge: MAX_AGE_SECONDS,
      path: "/",
      sameSite: "lax",
      secure: true,
      httpOnly: false,
      ...domainOpt,
    });
  }

  // ── Last-touch: refresh on every TAGGED landing (rich camelCase shape,
  // matching marketing/lib/attribution.ts). Untagged loads are skipped so
  // they don't clobber the attribution we just captured. ─────────────────
  const isTagged = Object.keys(utm).length > 0 || !!gclid || !!fbclid || !!liFatId || !!referrerHost;
  if (isTagged) {
    const last: Record<string, string> = {};
    if (utm.utm_source) last.utmSource = utm.utm_source;
    if (utm.utm_medium) last.utmMedium = utm.utm_medium;
    if (utm.utm_campaign) last.utmCampaign = utm.utm_campaign;
    if (utm.utm_term) last.utmTerm = utm.utm_term;
    if (utm.utm_content) last.utmContent = utm.utm_content;
    if (gclid) last.gclid = gclid.slice(0, 200);
    if (fbclid) last.fbclid = fbclid.slice(0, 200);
    if (liFatId) last.liFatId = liFatId.slice(0, 200);
    if (referrerHost) last.referrer = referrerHost;
    last.landingPage = landing;
    last.capturedAt = new Date().toISOString();
    res.cookies.set(LAST_COOKIE, encodeURIComponent(JSON.stringify(last)), {
      maxAge: MAX_AGE_SECONDS,
      path: "/",
      sameSite: "lax",
      secure: true,
      httpOnly: false,
      ...domainOpt,
    });
  }

  return res;
}

export const config = {
  // Pages only — skip API routes, Next internals, and static assets so the
  // cookie's "landing" field is always a real page.
  matcher: ["/((?!api/|_next/|favicon.ico|robots.txt|sitemap|.*\\.(?:png|jpg|jpeg|svg|ico|webp|js|css|txt|xml)$).*)"],
};
