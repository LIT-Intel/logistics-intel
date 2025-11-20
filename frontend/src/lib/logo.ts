const IMPORT_META_ENV = typeof import.meta !== "undefined" ? ((import.meta as any)?.env ?? {}) : {};
const PROCESS_ENV = typeof process !== "undefined" ? process.env ?? {} : {};

const FALLBACK_LOGO_BASE = "https://img.logo.dev";

function readEnv(key: string): string | undefined {
  return IMPORT_META_ENV[key] ?? PROCESS_ENV[key] ?? undefined;
}

const LOGO_DEV_BASE = (readEnv("VITE_LOGO_DEV_BASE") ??
  readEnv("NEXT_PUBLIC_LOGO_DEV_BASE") ??
  readEnv("LOGO_DEV_BASE") ??
  FALLBACK_LOGO_BASE).replace(/\/+$/, "");

const LOGO_DEV_TOKEN =
  readEnv("VITE_LOGO_DEV_TOKEN") ??
  readEnv("NEXT_PUBLIC_LOGO_DEV_TOKEN") ??
  readEnv("LOGO_DEV_TOKEN") ??
  "";

export function extractDomain(value?: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  if (/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(trimmed)) {
    return trimmed.replace(/^https?:\/\//i, "").replace(/^www\./i, "").toLowerCase();
  }

  try {
    const url = new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`);
    const host = url.hostname.replace(/^www\./i, "").toLowerCase();
    return host || null;
  } catch {
    return null;
  }
}

export function getCompanyLogoUrl(source?: string | null): string | null {
  const domain = extractDomain(source ?? undefined);
  if (!domain) return null;

  const params = new URLSearchParams();
  params.set("size", "160");
  if (LOGO_DEV_TOKEN) {
    params.set("token", LOGO_DEV_TOKEN);
  }

  const query = params.toString();
  return `${LOGO_DEV_BASE}/${domain}${query ? `?${query}` : ""}`;
}
