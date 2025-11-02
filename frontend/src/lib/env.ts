const DEFAULT_BASE = "https://logistics-intel-gateway-2e68g4k3.uc.gateway.dev";

export function getGatewayBase(): string {
  const fromNext = typeof process !== "undefined" && process.env?.NEXT_PUBLIC_API_BASE;
  // Vite exposes VITE_*; also check NEXT_PUBLIC_* in case it's defined
  // @ts-ignore Vite env typings
  const fromVitePrimary = typeof import.meta !== "undefined" && (import.meta as any)?.env?.VITE_API_BASE;
  // @ts-ignore Vite env typings
  const fromViteAlt = typeof import.meta !== "undefined" && (import.meta as any)?.env?.NEXT_PUBLIC_API_BASE;

  const base = (fromVitePrimary || fromViteAlt || fromNext || DEFAULT_BASE).toString().trim();
  return base.replace(/\/+$/, "");
}
