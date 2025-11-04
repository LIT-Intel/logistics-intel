export function getApiBase() {
  const raw =
    (typeof window !== 'undefined' && (window as any).__API_BASE__) ||
    (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_API_BASE) ||
    (typeof import.meta !== 'undefined' && (import.meta as any)?.env?.VITE_API_BASE) ||
    'https://logistics-intel-gateway-2e68g4k3.uc.gateway.dev';

  return String(raw).replace(/\/+$/, '');
}

export const API_BASE = getApiBase();
export const getGatewayBase = getApiBase;
