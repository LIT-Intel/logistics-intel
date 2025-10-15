// Deprecated shim: prefer `@/lib/api` getFilterOptions
export async function getFilterOptions() {
  const base = import.meta.env.VITE_API_BASE ?? "https://lit-caller-gw-2e68g4k3.uc.gateway.dev";
  const resp = await fetch(`${base}/public/getFilterOptions`, {
    headers: { 'accept': 'application/json' }
  });
  if (!resp.ok) throw new Error(`getFilterOptions HTTP ${resp.status}`);
  return resp.json();
}
