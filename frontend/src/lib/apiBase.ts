export function apiBase() {
  return (
    (typeof process !== 'undefined' && (process as any)?.env?.NEXT_PUBLIC_API_BASE) ||
    (typeof process !== 'undefined' && (process as any)?.env?.VITE_LIT_GATEWAY_BASE) ||
    'https://logistics-intel-gateway-2e68g4k3.uc.gateway.dev'
  );
}

