import { API_BASE } from '@/lib/api';

// Deprecated shim: prefer `@/lib/api` getFilterOptions
export async function getFilterOptions() {
  const resp = await fetch(`${API_BASE}/public/getFilterOptions`, {
    headers: { 'accept': 'application/json' }
  });
  if (!resp.ok) throw new Error(`getFilterOptions HTTP ${resp.status}`);
  return resp.json();
}
