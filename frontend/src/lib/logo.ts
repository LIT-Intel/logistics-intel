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

const LOGO_DEV_TOKEN =
  readEnv("VITE_LOGO_DEV_TOKEN") ??
  readEnv("NEXT_PUBLIC_LOGO_DEV_TOKEN") ??
  readEnv("LOGO_DEV_TOKEN") ??
  "";

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

function buildLogoDevUrl(domain: string): string {
  const params = new URLSearchParams();
  params.set("size", "160");
  if (LOGO_DEV_TOKEN) params.set("token", LOGO_DEV_TOKEN);
  return `${LOGO_DEV_BASE}/${domain}?${params.toString()}`;
}

/**
 * Returns an ordered list of logo URLs to try for a given domain/website/email.
 * Callers should iterate through these on <img> onError before falling back to
 * an initials avatar. Services are tried in this order:
 *   1. logo.dev — highest fidelity when VITE_LOGO_DEV_TOKEN is configured
 *   2. Clearbit — free, no token
 *   3. Unavatar — aggregates multiple providers
 *   4. DuckDuckGo ip3 — favicon fallback
 */
export function getLogoCandidates(source?: string | null): string[] {
  const domain = extractDomain(source);
  if (!domain) return [];

  const candidates: string[] = [];
  if (LOGO_DEV_TOKEN) candidates.push(buildLogoDevUrl(domain));
  candidates.push(`https://logo.clearbit.com/${domain}`);
  candidates.push(`https://unavatar.io/${domain}?fallback=false`);
  candidates.push(`https://icons.duckduckgo.com/ip3/${domain}.ico`);
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
