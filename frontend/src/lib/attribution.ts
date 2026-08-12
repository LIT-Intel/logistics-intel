/**
 * First-touch attribution — app side.
 *
 * The marketing site's middleware writes a `lit_attrib` cookie on
 * `.logisticintel.com` recording how a visitor first arrived (UTMs,
 * external referrer, landing page). Here we (a) read it so signup can
 * stamp it into user metadata, and (b) capture a fallback first-touch
 * for traffic that lands directly on app.logisticintel.com (email links,
 * ads pointed at /signup) without ever touching the marketing site.
 */

const COOKIE_NAME = "lit_attrib";
const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"] as const;

export type Attribution = Partial<Record<(typeof UTM_KEYS)[number], string>> & {
  referrer?: string;
  landing?: string;
  ts?: string;
};

export function readAttribution(): Attribution | null {
  try {
    const raw = document.cookie
      .split("; ")
      .find((c) => c.startsWith(`${COOKIE_NAME}=`))
      ?.slice(COOKIE_NAME.length + 1);
    if (!raw) return null;
    const parsed = JSON.parse(decodeURIComponent(raw));
    return parsed && typeof parsed === "object" ? (parsed as Attribution) : null;
  } catch {
    return null;
  }
}

/** Call once at app boot. No-op when a first-touch cookie already exists. */
export function captureAppAttribution(): void {
  try {
    if (readAttribution()) return;
    const params = new URLSearchParams(window.location.search);
    const attrib: Record<string, string> = {};
    for (const key of UTM_KEYS) {
      const v = params.get(key);
      if (v) attrib[key] = v.slice(0, 120);
    }
    const ref = document.referrer;
    if (ref) {
      const refHost = new URL(ref).hostname;
      if (refHost && !refHost.endsWith("logisticintel.com")) attrib.referrer = refHost.slice(0, 120);
    }
    attrib.landing = window.location.pathname.slice(0, 160);
    attrib.ts = new Date().toISOString();
    const domain = window.location.hostname.endsWith("logisticintel.com")
      ? ";domain=.logisticintel.com"
      : "";
    document.cookie = `${COOKIE_NAME}=${encodeURIComponent(JSON.stringify(attrib))};max-age=${90 * 24 * 3600};path=/;samesite=lax${domain}`;
  } catch {
    /* attribution is best-effort — never break the app over it */
  }
}
