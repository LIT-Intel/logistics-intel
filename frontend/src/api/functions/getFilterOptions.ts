import { getGatewayBase } from '@/lib/env';

// Deprecated shim: prefer `@/lib/api` getFilterOptions
export async function getFilterOptions() {
  const base = getGatewayBase();
  const resp = await fetch(`${base}/public/getFilterOptions`, {
    headers: { 'accept': 'application/json' }
  });
  if (!resp.ok) throw new Error(`getFilterOptions HTTP ${resp.status}`);
  return resp.json();
}
