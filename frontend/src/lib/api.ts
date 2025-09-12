export const API_BASE = import.meta.env.VITE_API_BASE ?? "https://lit-caller-gw-2e68g4k3.uc.gateway.dev";

export async function getFilterOptions(signal?: AbortSignal) {
  const res = await fetch(`${API_BASE}/public/getFilterOptions`, { signal, headers:{ "accept":"application/json" }});
  if (!res.ok) throw new Error(`getFilterOptions ${res.status}`);
  return res.json();
}

export type SearchCompaniesBody = { q?: string; mode?: "air"|"ocean"; hs?: string[]; origin?: string[]; dest?: string[]; carrier?: string[]; startDate?: string; endDate?: string; limit?: number; offset?: number; };

export async function searchCompanies(body: SearchCompaniesBody, signal?: AbortSignal) {
  const res = await fetch(`${API_BASE}/public/searchCompanies`, {
    method:"POST",
    headers:{ "content-type":"application/json", "accept":"application/json" },
    body: JSON.stringify(body),
    signal
  });
  if (!res.ok) throw new Error(`searchCompanies ${res.status}`);
  return res.json();
}

