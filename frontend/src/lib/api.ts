const BASE = (import.meta.env as any).VITE_PROXY_BASE || "/api/public";

export async function getFilterOptions(input: any = {}, signal?: AbortSignal) {
  const res = await fetch(`${BASE}/getFilterOptions`, {
    method: "POST",
    headers: { "content-type":"application/json", "accept":"application/json" },
    body: JSON.stringify(input),
    signal
  });
  if (!res.ok) throw new Error(`getFilterOptions ${res.status}`);
  return res.json();
}

export type SearchCompaniesBody = { q?: string; mode?: "air"|"ocean"; hs?: string[]; origin?: string[]; dest?: string[]; carrier?: string[]; startDate?: string; endDate?: string; limit?: number; offset?: number; };

export async function searchCompanies(body: SearchCompaniesBody, signal?: AbortSignal) {
  const res = await fetch(`${BASE}/searchCompanies`, {
    method:"POST",
    headers:{ "content-type":"application/json", "accept":"application/json" },
    body: JSON.stringify(body),
    signal
  });
  if (!res.ok) throw new Error(`searchCompanies ${res.status}`);
  return res.json();
}

