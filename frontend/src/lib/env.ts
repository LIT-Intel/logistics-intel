// Cross-runtime API base resolver (Next.js + Vite) with a safe default.
const DEFAULT_BASE = 'https://logistics-intel-gateway-2e68g4k3.uc.gateway.dev';

export function getGatewayBase(): string {
  // Next.js public env
  const fromNext =
    (typeof process !== 'undefined' && (process.env as any)?.NEXT_PUBLIC_API_BASE) || '';
  // Vite public env
  const fromVite =
    (typeof import.meta !== 'undefined' && (import.meta as any)?.env?.NEXT_PUBLIC_API_BASE) || '';

  const base = (fromNext || fromVite || DEFAULT_BASE).toString().trim();
  return base.replace(/\/+$/, ''); // strip trailing slash
}
