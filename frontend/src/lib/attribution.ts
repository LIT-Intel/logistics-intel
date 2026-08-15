/**
 * First-touch attribution — app side.
 *
 * The marketing site writes THREE attribution cookies on
 * `.logisticintel.com`:
 *   - lit_first_touch — rich first-touch snapshot (utm_source/medium/
 *     campaign/term/content + click-ids + off-site referrer + landingPage),
 *     written once, never overwritten (see marketing/lib/attribution.ts).
 *   - lit_last_touch  — same rich shape, refreshed on every tagged landing.
 *   - lit_attrib      — a thin legacy cookie ({utm_*?, referrer?, landing,
 *     ts}) written by the middleware for direct/untagged visits.
 *
 * Historically signup only read the THIN `lit_attrib` cookie, so the rich
 * utm_source the marketing site captured never reached user_metadata —
 * that's why utm_source was empty for ~all users. We now PREFER the rich
 * `lit_first_touch` for first-touch UTMs, fall back to `lit_attrib`, and
 * also read `lit_last_touch`. `readAttribution()` returns:
 *
 *   { first_touch, last_touch, attribution }
 *
 * where `attribution` is a flat legacy-compatible blob (utm_* + referrer +
 * landing + ts) so existing consumers keep working, and first_touch /
 * last_touch carry the full rich snapshots for new consumers.
 */

const LEGACY_COOKIE = "lit_attrib";
const FIRST_COOKIE = "lit_first_touch";
const LAST_COOKIE = "lit_last_touch";
const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"] as const;

// Rich snapshot shape written by marketing/lib/attribution.ts (camelCase).
export type RichTouch = {
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
  capturedAt?: string;
};

// Legacy flat shape (snake_case utm_*) — what user_metadata.attribution has
// always looked like; kept for back-compat with existing consumers.
export type Attribution = Partial<Record<(typeof UTM_KEYS)[number], string>> & {
  referrer?: string;
  landing?: string;
  ts?: string;
};

export type AttributionResult = {
  first_touch: RichTouch | null;
  last_touch: RichTouch | null;
  attribution: Attribution | null;
};

function readCookieRaw(name: string): string | null {
  try {
    const raw = document.cookie
      .split("; ")
      .find((c) => c.startsWith(`${name}=`))
      ?.slice(name.length + 1);
    if (!raw) return null;
    return decodeURIComponent(raw);
  } catch {
    return null;
  }
}

function parseJson<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as T) : null;
  } catch {
    return null;
  }
}

/** Flatten a rich camelCase touch into the legacy snake_case flat blob. */
function richToFlat(t: RichTouch | null): Attribution | null {
  if (!t) return null;
  const flat: Attribution = {};
  if (t.utmSource) flat.utm_source = t.utmSource;
  if (t.utmMedium) flat.utm_medium = t.utmMedium;
  if (t.utmCampaign) flat.utm_campaign = t.utmCampaign;
  if (t.utmTerm) flat.utm_term = t.utmTerm;
  if (t.utmContent) flat.utm_content = t.utmContent;
  if (t.referrer) flat.referrer = t.referrer;
  if (t.landingPage) flat.landing = t.landingPage;
  if (t.capturedAt) flat.ts = t.capturedAt;
  return Object.keys(flat).length > 0 ? flat : null;
}

/**
 * Read the full attribution picture for signup. Prefers the rich
 * `lit_first_touch` cookie for first-touch UTMs, falls back to the thin
 * `lit_attrib`, and also reads `lit_last_touch`. Returns null-safe shape:
 *   { first_touch, last_touch, attribution }
 * where `attribution` is the flat legacy blob (derived from first_touch,
 * else lit_attrib) for back-compat.
 */
export function readAttribution(): AttributionResult | null {
  if (typeof document === "undefined") return null;
  const first = parseJson<RichTouch>(readCookieRaw(FIRST_COOKIE));
  const last = parseJson<RichTouch>(readCookieRaw(LAST_COOKIE));
  const legacyFlat = parseJson<Attribution>(readCookieRaw(LEGACY_COOKIE));

  // Legacy flat compat: prefer the rich first-touch (flattened), else the
  // thin lit_attrib cookie so untagged/direct visitors still stamp a source.
  const flat = richToFlat(first) ?? legacyFlat ?? null;

  if (!first && !last && !flat) return null;
  return { first_touch: first, last_touch: last, attribution: flat };
}

/** Call once at app boot. No-op when a first-touch cookie already exists. */
export function captureAppAttribution(): void {
  try {
    // If the rich first-touch OR the legacy cookie is already present, the
    // marketing site (or a prior app visit) captured us — nothing to do.
    if (readCookieRaw(FIRST_COOKIE) || readCookieRaw(LEGACY_COOKIE)) return;
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
    document.cookie = `${LEGACY_COOKIE}=${encodeURIComponent(JSON.stringify(attrib))};max-age=${90 * 24 * 3600};path=/;samesite=lax${domain}`;
  } catch {
    /* attribution is best-effort — never break the app over it */
  }
}
