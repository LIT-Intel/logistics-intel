const DEFAULT_BASE = "https://logistics-intel-gateway-2e68g4k3.uc.gateway.dev";

function readImportMetaBase(): string | null {
  try {
    const meta: any = typeof import.meta !== "undefined" ? (import.meta as any) : null;
    const env = meta?.env;
    if (env) {
      return env.VITE_API_BASE ?? env.NEXT_PUBLIC_API_BASE ?? null;
    }
  } catch {
    // ignore: import.meta may not be available in some environments
  }
  return null;
}

export function getGatewayBase(): string {
  const envBase = (typeof process !== "undefined" && process.env?.NEXT_PUBLIC_API_BASE) || null;
  const viteBase = readImportMetaBase();

  const base = (envBase || viteBase || DEFAULT_BASE).toString().trim();
  return base.replace(/\/+$/, "");
}

export function getApiBase(): string {
  return getGatewayBase();
}
