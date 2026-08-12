import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * First-touch attribution capture.
 *
 * On a visitor's FIRST request (no `lit_attrib` cookie yet) we record how
 * they arrived — UTM parameters, external referrer, and landing path —
 * in a first-party cookie scoped to `.logisticintel.com`, so the app at
 * app.logisticintel.com can read it at signup and stamp it into the new
 * user's metadata. That's what powers the "Source" column in the admin
 * Users 360 view: every subscriber traces back to the LinkedIn post,
 * Google search, referral, or direct visit that started them.
 *
 * First-touch semantics: an existing cookie is never overwritten — the
 * channel that FIRST earned the visit gets the credit, even if the user
 * later returns via another. 90-day lifetime. Not httpOnly on purpose
 * (the app reads it from document.cookie); it holds no secrets.
 */

const COOKIE_NAME = "lit_attrib";
const MAX_AGE_SECONDS = 90 * 24 * 3600;
const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"] as const;

export function middleware(req: NextRequest) {
  const res = NextResponse.next();
  if (req.cookies.get(COOKIE_NAME)) return res;

  const url = req.nextUrl;
  const attrib: Record<string, string> = {};

  for (const key of UTM_KEYS) {
    const v = url.searchParams.get(key);
    if (v) attrib[key] = v.slice(0, 120);
  }

  const referrer = req.headers.get("referer") || "";
  try {
    const refHost = referrer ? new URL(referrer).hostname : "";
    if (refHost && !refHost.endsWith("logisticintel.com")) {
      attrib.referrer = refHost.slice(0, 120);
    }
  } catch {
    /* malformed referer header — ignore */
  }

  // A truly direct visit (no UTMs, no external referrer) is still worth
  // stamping: "direct" + landing page beats an empty Source column.
  attrib.landing = url.pathname.slice(0, 160);
  attrib.ts = new Date().toISOString();

  const host = req.headers.get("host") || "";
  res.cookies.set(COOKIE_NAME, encodeURIComponent(JSON.stringify(attrib)), {
    maxAge: MAX_AGE_SECONDS,
    path: "/",
    sameSite: "lax",
    secure: true,
    httpOnly: false,
    // Parent-domain scope so app.logisticintel.com sees it. On previews /
    // localhost, fall back to host-only (a domain mismatch would make the
    // browser drop the cookie entirely).
    ...(host.endsWith("logisticintel.com") ? { domain: ".logisticintel.com" } : {}),
  });
  return res;
}

export const config = {
  // Pages only — skip API routes, Next internals, and static assets so the
  // cookie's "landing" field is always a real page.
  matcher: ["/((?!api/|_next/|favicon.ico|robots.txt|sitemap|.*\\.(?:png|jpg|jpeg|svg|ico|webp|js|css|txt|xml)$).*)"],
};
