const IMPORT_META_ENV = typeof import.meta !== "undefined" ? ((import.meta as any)?.env ?? {}) : {};
const PROCESS_ENV = typeof process !== "undefined" ? process.env ?? {} : {};

const FALLBACK_LOGO_BASE = "https://img.logo.dev";

function readEnv(key: string): string | undefined {
  return IMPORT_META_ENV[key] ?? PROCESS_ENV[key] ?? undefined;
}

const LOGO_DEV_BASE = (
  readEnv("VITE_LOGO_DEV_BASE") ??
  readEnv("NEXT_PUBLIC_LOGO_DEV_BASE") ??
  readEnv("LOGO_DEV_BASE") ??
  FALLBACK_LOGO_BASE
).replace(/\/+$/, "");

// Accept any of the historical env-var names so deployments don't break
// when the operator chose a different convention. logo.dev publishable
// keys are client-safe; marketing-side uses NEXT_PUBLIC_LOGO_DEV_KEY,
// the Vite app traditionally used VITE_LOGO_DEV_TOKEN.
// Publishable key fallback: this is the same client-safe key the marketing
// site already exposes in every img URL on logisticintel.com. logo.dev locks
// it to allowed origins (Referer-checked; app.logisticintel.com verified
// 200 on 2026-08-20), so hardcoding leaks nothing an attacker couldn't
// copy from the public homepage. Env vars still take precedence.
const LOGO_DEV_PUBLISHABLE_FALLBACK = "pk_FTj3iPbUS3SgUfJ7X1FXPQ";

const LOGO_DEV_ENV_TOKEN =
  readEnv("VITE_LOGO_DEV_TOKEN") ??
  readEnv("VITE_LOGO_DEV_KEY") ??
  readEnv("NEXT_PUBLIC_LOGO_DEV_TOKEN") ??
  readEnv("NEXT_PUBLIC_LOGO_DEV_KEY") ??
  readEnv("LOGO_DEV_TOKEN") ??
  readEnv("LOGO_DEV_KEY");

const LOGO_DEV_TOKEN = LOGO_DEV_ENV_TOKEN ?? LOGO_DEV_PUBLISHABLE_FALLBACK;

// logo.dev publishable keys are origin-locked (Referer-checked): a key returns
// 401 "restricted to specific domains" on any origin not in its allow-list
// (verified 2026-09-03 — pk_FTj3… 200s for app.logisticintel.com, 401s for
// *.vercel.app / no-referer). If the operator set VITE_LOGO_DEV_TOKEN to a key
// whose allow-list DOESN'T include the current deploy origin, it would 401 and
// (previously) shadow the known-good hardcoded key. So we try BOTH keys as
// separate candidates — whichever is allow-listed for the live origin wins.
const LOGO_DEV_TOKENS = Array.from(
  new Set([LOGO_DEV_ENV_TOKEN, LOGO_DEV_PUBLISHABLE_FALLBACK].filter(Boolean) as string[])
);

function cleanValue(value?: string | null): string {
  return String(value || "").trim();
}

export function extractDomain(value?: string | null): string | null {
  const trimmed = cleanValue(value);
  if (!trimmed) return null;

  const normalized = trimmed
    .replace(/^mailto:/i, "")
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .split("/")[0]
    .split("?")[0]
    .split("#")[0]
    .trim()
    .toLowerCase();

  if (/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(normalized)) {
    return normalized;
  }

  try {
    const url = new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`);
    const host = url.hostname.replace(/^www\./i, "").toLowerCase();
    return /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(host) ? host : null;
  } catch {
    return null;
  }
}

function buildLogoDevUrl(domain: string, token?: string): string {
  const params = new URLSearchParams();
  params.set("size", "160");
  // CRITICAL for the fallback cascade: without this, logo.dev returns a
  // generated monogram image at HTTP 200 for domains it has no real logo for,
  // so the <img> "loads" successfully and CompanyAvatar's onError chain NEVER
  // advances to Google favicons / Unavatar — the row shows a blank/generic mark
  // instead of a real logo. `fallback=404` makes logo.dev 404 on a miss so the
  // onError handler falls through to the next candidate. (2026-08-26)
  params.set("fallback", "404");
  if (token) params.set("token", token);
  return `${LOGO_DEV_BASE}/${domain}?${params.toString()}`;
}

/**
 * Returns an ordered list of logo URLs to try for a given domain/website/email.
 * Callers should iterate through these on <img> onError before falling back to
 * an initials avatar. Services are tried in this order:
 *   1. logo.dev — highest fidelity when VITE_LOGO_DEV_TOKEN is configured
 *   2. Clearbit — free, no token
 *   3. Unavatar — aggregates multiple providers
 *
 * Phase H P1 fix — DuckDuckGo's ip3 favicon endpoint was previously the
 * final candidate. It intentionally returns a monochrome (black / white)
 * favicon for many domains, which made logos look broken to users. We
 * now exhaust the candidate list after Unavatar; CompanyAvatar's
 * `exhausted` state kicks in next and renders the gradient-initials
 * block, which is the intended honest fallback.
 */
export function getLogoCandidates(source?: string | null): string[] {
  const domain = extractDomain(source);
  if (!domain) return [];

  const candidates: string[] = [];
  // Try each configured logo.dev key (env first, then hardcoded fallback) so a
  // key restricted to a different origin can't shadow one that IS allow-listed
  // for the live domain. See LOGO_DEV_TOKENS note above.
  for (const token of LOGO_DEV_TOKENS) candidates.push(buildLogoDevUrl(domain, token));
  // Clearbit's free logo API was shut down (connections now fail outright,
  // verified 2026-08-20) and img.logo.dev 401s without a token, so without
  // VITE_LOGO_DEV_TOKEN the old cascade burned two dead candidates before
  // reaching Unavatar — whose free tier rate-limits well below one Command
  // Center page of rows, which is why most logos rendered as initials.
  // Google's s2 favicon service is unmetered and colored, so it carries the
  // bulk load; Unavatar stays last for domains Google has no icon for.
  candidates.push(`https://www.google.com/s2/favicons?domain=${domain}&sz=128`);
  candidates.push(`https://unavatar.io/${domain}?fallback=false`);
  return candidates;
}

/**
 * Backwards-compatible single-URL accessor. Returns the first candidate from
 * {@link getLogoCandidates}. Prefer passing a `domain` prop to CompanyAvatar
 * and letting it walk the cascade on load errors.
 */
export function getCompanyLogoUrl(source?: string | null): string | null {
  const [first] = getLogoCandidates(source);
  return first ?? null;
}
