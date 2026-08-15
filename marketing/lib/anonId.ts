// Anonymous-visitor identity — marketing side.
//
// Mirror of frontend/src/lib/anonId.ts. Mints (or reads) a stable
// `anonymous_id` (uuid) on first landing and persists it in BOTH
// localStorage and a cookie named `lit_anon_id` scoped to
// `.logisticintel.com`, so the same id follows the visitor from the
// marketing apex into app.logisticintel.com at signup. The app reads the
// shared cookie and hands it to `stitch_lead_magnet_session` to attach the
// pre-auth lead-magnet session to the new user.
//
// Update both files together if the id scheme changes.

const STORAGE_KEY = "lit.anonymous_id";
const COOKIE_NAME = "lit_anon_id";
const TTL_MS = 365 * 24 * 60 * 60 * 1000; // ~1 year

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function mintUuid(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch {
    /* fall through to manual */
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function readCookie(name: string): string | null {
  if (!isBrowser()) return null;
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
  if (!isBrowser()) return "";
  const host = window.location.hostname;
  if (!host) return "";
  if (host === "logisticintel.com" || host.endsWith(".logisticintel.com")) {
    return "Domain=.logisticintel.com";
  }
  return "";
}

function writeCookie(name: string, value: string, maxAgeSeconds: number) {
  if (!isBrowser()) return;
  const secure = window.location.protocol === "https:";
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
 * on first call. Prefers localStorage, then the shared cookie; only mints
 * when neither holds a valid uuid. Refreshes both stores + TTL every call.
 * Returns "" on the server.
 */
export function getAnonId(): string {
  if (!isBrowser()) return "";
  let id: string | null = null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw && UUID_PATTERN.test(raw)) id = raw;
  } catch {
    /* private mode / quota */
  }
  if (!id) {
    const fromCookie = readCookie(COOKIE_NAME);
    if (fromCookie && UUID_PATTERN.test(fromCookie)) id = fromCookie;
  }
  if (!id) id = mintUuid();

  try {
    window.localStorage.setItem(STORAGE_KEY, id);
  } catch {
    /* ignore */
  }
  writeCookie(COOKIE_NAME, id, Math.floor(TTL_MS / 1000));
  return id;
}
