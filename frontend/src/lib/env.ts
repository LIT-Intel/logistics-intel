const PROXY_BASE = "/api/lit";

function readEnvBase(): string {
  try {
    const metaEnv = typeof import.meta !== "undefined" ? ((import.meta as any)?.env ?? {}) : {};
    const processEnv =
      typeof process !== "undefined" && process.env
        ? process.env
        : {};
    const candidate =
      metaEnv.API_GATEWAY_BASE ??
      metaEnv.VITE_API_BASE ??
      metaEnv.NEXT_PUBLIC_API_BASE ??
      processEnv.API_GATEWAY_BASE ??
      processEnv.VITE_API_BASE ??
      processEnv.NEXT_PUBLIC_API_BASE ??
      "";
    if (typeof candidate !== "string") return "";
    const trimmed = candidate.trim();
    return trimmed ? trimmed.replace(/\/+$/, "") : "";
  } catch {
    return "";
  }
}

export function getGatewayBase(): string {
  const envBase = readEnvBase();
  if (typeof window === "undefined" && envBase) {
    return envBase;
  }
  if (envBase.startsWith("/")) {
    return envBase || PROXY_BASE;
  }
  return PROXY_BASE;
}

export const API_PROXY_BASE = PROXY_BASE;
