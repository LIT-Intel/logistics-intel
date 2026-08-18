export type UnipileConfig = {
  apiKey: string;
  baseUrl: string;
  webhookSecret?: string;
};

function cleanBaseUrl(value: string): string {
  const trimmed = value.trim();
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const cleaned = withProtocol.replace(/\/+$/, "").replace(/\/api\/v1$/i, "");
  const parsed = new URL(cleaned);
  if (parsed.protocol !== "https:" && parsed.hostname !== "localhost") {
    throw new Error("Unipile DSN must use HTTPS");
  }
  return parsed.toString().replace(/\/$/, "");
}

/**
 * Supports either a JSON secret
 * {"api_key":"...","dsn":"https://apiX.unipile.com:12345","webhook_secret":"..."}
 * or a raw API key plus UNIPILE_DSN.  No secret values are ever logged.
 */
export function getUnipileConfig(): UnipileConfig {
  const raw = Deno.env.get("Unipile_API") || Deno.env.get("UNIPILE_API") || "";
  let apiKey = "";
  let baseUrl = Deno.env.get("UNIPILE_DSN") || Deno.env.get("Unipile_DSN") || "";
  let webhookSecret = Deno.env.get("UNIPILE_WEBHOOK_SECRET") || "";

  if (raw.trim().startsWith("{")) {
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      apiKey = String(parsed.api_key || parsed.access_token || parsed.key || "");
      baseUrl = String(parsed.dsn || parsed.api_url || parsed.base_url || baseUrl);
      webhookSecret = String(parsed.webhook_secret || webhookSecret);
    } catch {
      throw new Error("Unipile_API is not valid JSON");
    }
  } else if (raw.includes("|")) {
    const [first, second] = raw.split("|", 2).map((v) => v.trim());
    if (/^https?:\/\//i.test(first)) {
      baseUrl = first;
      apiKey = second;
    } else {
      apiKey = first;
      baseUrl = second;
    }
  } else {
    apiKey = raw.trim();
  }

  if (!apiKey || !baseUrl) {
    throw new Error("Unipile is not configured: Unipile_API and DSN are required");
  }
  let normalizedBaseUrl = "";
  try {
    normalizedBaseUrl = cleanBaseUrl(baseUrl);
  } catch {
    throw new Error("Unipile DSN is invalid. Use the API URL shown in the Unipile dashboard, for example https://api1.unipile.com:12345");
  }
  return { apiKey, baseUrl: normalizedBaseUrl, webhookSecret: webhookSecret || undefined };
}

export async function unipileRequest<T = Record<string, unknown>>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const cfg = getUnipileConfig();
  const headers = new Headers(init.headers);
  headers.set("X-API-KEY", cfg.apiKey);
  headers.set("Accept", "application/json");
  if (init.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const response = await fetch(`${cfg.baseUrl}/api/v1${path}`, { ...init, headers });
  const raw = await response.text();
  let body: unknown = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = { message: raw }; }
  if (!response.ok) {
    const payload = body as Record<string, unknown> | null;
    const message = String(payload?.message || payload?.title || payload?.type || `Unipile HTTP ${response.status}`);
    const error = new Error(message) as Error & { status?: number; payload?: unknown };
    error.status = response.status;
    error.payload = body;
    throw error;
  }
  return body as T;
}

export function linkedinPublicIdentifier(url: string): string | null {
  const value = String(url || "").trim();
  if (!value) return null;
  const match = value.match(/linkedin\.com\/in\/([^/?#]+)/i);
  if (match?.[1]) return decodeURIComponent(match[1]);
  if (!value.includes("/") && !value.includes(".")) return value;
  return null;
}

export function unipileErrorCode(error: unknown): string {
  const status = Number((error as { status?: number })?.status || 0);
  if (status === 429) return "RATE_LIMITED";
  if (status === 401 || status === 403) return "ACCOUNT_RECONNECT_REQUIRED";
  if (status === 422) return "PROVIDER_REJECTED";
  return "UNIPILE_ERROR";
}
