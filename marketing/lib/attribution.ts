/**
 * First-party attribution capture for the marketing site.
 *
 * Why this exists:
 *   Lead-magnet forms used to read utm + referrer from the CURRENT URL at
 *   submit time. That loses attribution as soon as the visitor navigates
 *   (land on /freight-leads?utm_source=linkedin-ads → browse to /customers
 *   → submit there → utm is gone). This module captures utm + referrer +
 *   click-ids on FIRST landing and persists them in a first-party cookie
 *   (+ sessionStorage mirror) so any later form submit can read the full
 *   attribution history.
 *
 * Two snapshots are kept:
 *   - lit_first_touch — the earliest tagged landing in the 90-day window.
 *                       Once set, NEVER overwritten until the cookie
 *                       expires (90d) or the user clears storage.
 *   - lit_last_touch  — the most recent tagged landing. Overwritten every
 *                       time a new URL with at least one utm/click-id is
 *                       visited.
 *
 * "Tagged" means at least one of utm_source/medium/campaign/term/content,
 * gclid, fbclid, or li_fat_id is present. A bare /customers page-load
 * does NOT clobber the last-touch — that would silently delete the
 * attribution we just captured from /freight-leads?utm_source=...
 *
 * Cookie attributes: SameSite=Lax, Secure (in https), Max-Age=90d, Path=/.
 * Not HttpOnly — JS must read it for the form to attach attribution.
 *
 * Coordinates with marketing/lib/events.ts (Agent 1) via these
 * sessionStorage keys:
 *   - lit.utm       JSON of UtmProps (last-touch utm_* fields)
 *   - lit.referrer  string (last-touch off-site referrer)
 * track() in events.ts reads these on every fire.
 */

export type Attribution = {
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmTerm?: string;
  utmContent?: string;
  gclid?: string;
  fbclid?: string;
  liFatId?: string;
  referrer?: string;
  landingPage?: string;
  capturedAt: string; // ISO
};

const FIRST_COOKIE = "lit_first_touch";
const LAST_COOKIE = "lit_last_touch";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 90; // 90 days

// sessionStorage keys shared with marketing/lib/events.ts (Agent 1).
const SS_UTM = "lit.utm";
const SS_REFERRER = "lit.referrer";

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function readCookie(name: string): string | null {
  if (!isBrowser()) return null;
  try {
    const prefix = name + "=";
    const parts = document.cookie.split(";");
    for (const raw of parts) {
      const c = raw.trim();
      if (c.startsWith(prefix)) {
        return decodeURIComponent(c.slice(prefix.length));
      }
    }
  } catch {
    /* ignore */
  }
  return null;
}

function writeCookie(name: string, value: string): void {
  if (!isBrowser()) return;
  try {
    const secure =
      typeof window.location !== "undefined" &&
      window.location.protocol === "https:"
        ? "; Secure"
        : "";
    document.cookie =
      `${name}=${encodeURIComponent(value)}` +
      `; Max-Age=${MAX_AGE_SECONDS}` +
      `; Path=/` +
      `; SameSite=Lax` +
      secure;
  } catch {
    /* ignore */
  }
}

function parseAttribution(raw: string | null): Attribution | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && typeof parsed.capturedAt === "string") {
      return parsed as Attribution;
    }
  } catch {
    /* ignore malformed cookie */
  }
  return null;
}

function trimOrUndef(value: string | null | undefined): string | undefined {
  if (typeof value !== "string") return undefined;
  const t = value.trim();
  if (!t) return undefined;
  return t.length > 500 ? t.slice(0, 500) : t;
}

/**
 * Read attribution candidates from the current URL + document.referrer.
 * Returns `null` if NOTHING attributable was found (no utm, no click-id,
 * no off-site referrer). Otherwise returns a complete Attribution object
 * with capturedAt set to now.
 */
function readFromUrl(): Attribution | null {
  if (!isBrowser()) return null;
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(window.location.search);
  } catch {
    return null;
  }

  const utmSource = trimOrUndef(params.get("utm_source"));
  const utmMedium = trimOrUndef(params.get("utm_medium"));
  const utmCampaign = trimOrUndef(params.get("utm_campaign"));
  const utmTerm = trimOrUndef(params.get("utm_term"));
  const utmContent = trimOrUndef(params.get("utm_content"));
  const gclid = trimOrUndef(params.get("gclid"));
  const fbclid = trimOrUndef(params.get("fbclid"));
  const liFatId = trimOrUndef(params.get("li_fat_id"));

  let referrer: string | undefined;
  try {
    const ref = document.referrer || "";
    if (ref && !ref.startsWith(window.location.origin)) {
      referrer = trimOrUndef(ref);
    }
  } catch {
    /* ignore */
  }

  const hasAttribution = Boolean(
    utmSource ||
      utmMedium ||
      utmCampaign ||
      utmTerm ||
      utmContent ||
      gclid ||
      fbclid ||
      liFatId ||
      referrer,
  );
  if (!hasAttribution) return null;

  let landingPage: string | undefined;
  try {
    landingPage = trimOrUndef(
      window.location.pathname + (window.location.search || ""),
    );
  } catch {
    /* ignore */
  }

  return {
    utmSource,
    utmMedium,
    utmCampaign,
    utmTerm,
    utmContent,
    gclid,
    fbclid,
    liFatId,
    referrer,
    landingPage,
    capturedAt: new Date().toISOString(),
  };
}

function mirrorToSessionStorage(a: Attribution): void {
  if (!isBrowser()) return;
  try {
    const utm = {
      utm_source: a.utmSource,
      utm_medium: a.utmMedium,
      utm_campaign: a.utmCampaign,
      utm_term: a.utmTerm,
      utm_content: a.utmContent,
    };
    // Strip undefined for a clean JSON blob.
    const cleanUtm: Record<string, string> = {};
    for (const [k, v] of Object.entries(utm)) {
      if (typeof v === "string" && v) cleanUtm[k] = v;
    }
    if (Object.keys(cleanUtm).length > 0) {
      window.sessionStorage.setItem(SS_UTM, JSON.stringify(cleanUtm));
    }
    if (a.referrer) {
      window.sessionStorage.setItem(SS_REFERRER, a.referrer);
    }
  } catch {
    /* ignore quota / disabled storage */
  }
}

/**
 * Read URL → write first-touch (only if absent) + last-touch (always when
 * tagged) → mirror to sessionStorage. Idempotent: safe to call multiple
 * times on the same page-load.
 *
 * Returns the resulting { first, last } snapshot if any write happened,
 * or `null` when the URL had nothing attributable (and existing cookies
 * are left untouched).
 */
export function writeAttributionFromUrl(): {
  first: Attribution;
  last: Attribution;
} | null {
  if (!isBrowser()) return null;
  const fresh = readFromUrl();
  if (!fresh) return null;

  // First-touch — only write if no existing first-touch cookie.
  const existingFirst = parseAttribution(readCookie(FIRST_COOKIE));
  const first = existingFirst ?? fresh;
  if (!existingFirst) {
    writeCookie(FIRST_COOKIE, JSON.stringify(fresh));
  }

  // Last-touch — always overwrite when a fresh tagged landing is seen.
  writeCookie(LAST_COOKIE, JSON.stringify(fresh));

  mirrorToSessionStorage(fresh);

  return { first, last: fresh };
}

export function getFirstTouch(): Attribution | null {
  return parseAttribution(readCookie(FIRST_COOKIE));
}

export function getLastTouch(): Attribution | null {
  return parseAttribution(readCookie(LAST_COOKIE));
}

export function readAttribution(): {
  first: Attribution | null;
  last: Attribution | null;
} {
  return { first: getFirstTouch(), last: getLastTouch() };
}
