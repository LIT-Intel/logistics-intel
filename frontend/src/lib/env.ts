// Cross-runtime resolver with a safe production default (no trailing slash).
const DEFAULT_BASE = "https://logistics-intel-gateway-2e68g4k3.uc.gateway.dev";

// Returns the API base URL, trimming any trailing slash.
// Works in Node (build) and browser (Vite/Next) without throwing.
export function getGatewayBase(): string {
  // Prefer explicit envs during build/server
  const nodeVar =
    process.env.NEXT_PUBLIC_API_BASE ||
    process.env.API_BASE ||
    process.env.VITE_API_BASE;

  if (nodeVar && nodeVar.trim()) {
    return nodeVar.replace(/\/+$/, "");
  }

  // Browser-time fallbacks (guard import.meta and window)
  const viteVar =
    (typeof import !== "undefined" &&
      // @ts-ignore optional at runtime
      (import.meta as any)?.env?.VITE_API_BASE) || null;

  if (viteVar && String(viteVar).trim()) {
    return String(viteVar).replace(/\/+$/, "");
  }

  // Last resort: baked-in gateway
  return DEFAULT_BASE;
}

// Back-compat exports used elsewhere
export const API_BASE = getGatewayBase();
export function getApiBase() {
  return getGatewayBase();
}
