// Cross-runtime resolver with a safe production default.
// This keeps the app working even if NEXT_PUBLIC_API_BASE isn't set.
const DEFAULT_BASE = " + ;

export function getGatewayBase(): string {
  // Next.js runtime
  const fromNext = typeof process !== "undefined" && process.env?.NEXT_PUBLIC_API_BASE;
  // Vite runtime
  // @ts-ignore
  const fromVite = typeof import.meta !== "undefined" && import.meta?.env?.NEXT_PUBLIC_API_BASE;
  const base = (fromNext || fromVite || DEFAULT_BASE).toString().trim();
  return base.replace(/\/+$/, "");
}
