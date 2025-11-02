export function getGatewayBase(): string {
  const fromNext = typeof process !== "undefined" ? process.env?.NEXT_PUBLIC_API_BASE : undefined;
  // @ts-ignore vite/runtime env
  const fromVite = typeof import.meta !== "undefined" ? (import.meta as any)?.env?.NEXT_PUBLIC_API_BASE : undefined;
  const base = (fromNext || fromVite || "").toString().trim();
  if (!base) {
    throw new Error("Missing NEXT_PUBLIC_API_BASE at runtime");
  }
  return base.replace(/\/+$/, "");
}
