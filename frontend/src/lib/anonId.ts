// Anonymous-visitor identity — app side.
//
// Mints (or reads) a stable `anonymous_id` (uuid) the first time a browser
// touches any LIT surface, and persists it in BOTH localStorage and a
// cookie named `lit_anon_id` scoped to `.logisticintel.com`. The shared
// cookie scope means a visitor who first lands on the marketing site
// (logisticintel.com) and later signs up on the app (app.logisticintel.com)
// carries the same id across the boundary — that's what lets the server
// stitch a pre-auth lead-magnet session to the authenticated user.
//
// Mirrors frontend/src/lib/affiliateRef.ts: localStorage is fast + rich but
// per-origin and dropped through OAuth redirects; the parent-domain cookie
// survives subdomain bounces. Both together give a durable id across the
// ~1-year window below.

const STORAGE_KEY = "lit.anonymous_id";
const COOKIE_NAME = "lit_anon_id";
const TTL_MS = 365 * 24 * 60 * 60 * 1000; // ~1 year

// Accept only canonical v4-ish uuids we minted; reject anything malformed
// so a poisoned cookie can't leak into stitching.
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function mintUuid(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch {
    /* fall through to manual */
  }
  // RFC-4122 v4 fallback for older browsers.
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

// Parent-domain scope so logisticintel.com and app.logisticintel.com share
// the id. On localhost / previews we leave Domain unset (host-only).
function cookieDomainAttr(): string {
  if (typeof window === "undefined") return "";
  const host = window.location.hostname;
  if (!host) return "";
  if (host === "logisticintel.com" || host.endsWith(".logisticintel.com")) {
    return "Domain=.logisticintel.com";
  }
  return "";
}

function writeCookie(name: string, value: string, maxAgeSeconds: number) {
  if (typeof document === "undefined") return;
  const secure = typeof window !== "undefined" && window.location.protocol === "https:";
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    "Path=/",
    `Max-Age=${maxAgeSeconds}`,
    "SameSite=Lax",
  ];
  const domain = cookieDomainAttr();
  if (domain) parts.push(domain);
  if (secure) parts.push("Secure");
  document.cookie = parts.join("; ");
}

/**
 * Return the stable anonymous id for this browser, minting + persisting one
 * on first call. Prefers an existing id from localStorage, then the shared
 * cookie; only mints when neither store holds a valid uuid. Every call
 * refreshes both stores (and the TTL). Returns "" on the server.
 */
export function getAnonId(): string {
  if (typeof window === "undefined") return "";
  let id: string | null = null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw && UUID_PATTERN.test(raw)) id = raw;
  } catch {
    // private mode / quota — cookie may still hold it
  }
  if (!id) {
    const fromCookie = readCookie(COOKIE_NAME);
    if (fromCookie && UUID_PATTERN.test(fromCookie)) id = fromCookie;
  }
  if (!id) id = mintUuid();

  try {
    window.localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // ignore — cookie still covers us
  }
  writeCookie(COOKIE_NAME, id, Math.floor(TTL_MS / 1000));
  return id;
}
