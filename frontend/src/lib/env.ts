// Resolves API base across Node (Vercel) + Vite (browser)
export function getGatewayBase(): string {
  const envBase =
    (typeof process !== "undefined" && process.env?.NEXT_PUBLIC_API_BASE) || null;

  let viteBase: string | null = null;
  if (typeof window !== "undefined" && typeof (import.meta as any) !== "undefined") {
    viteBase = (import.meta as any)?.env?.VITE_API_BASE ?? null;
  }

  // Hard default: current Gateway
  const DEFAULT_BASE = "https://logistics-intel-gateway-2e68g4k3.uc.gateway.dev";
  return envBase || viteBase || DEFAULT_BASE;
}
