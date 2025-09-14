const BASE = (import.meta.env as any).VITE_PROXY_BASE || "/api/public";

export async function getFilterOptions(input: object = {}, signal?: AbortSignal) {
  const res = await fetch(`${BASE}/getFilterOptions`, {
    method: "POST",
    headers: { "content-type":"application/json", "accept":"application/json" },
    body: JSON.stringify(input),
    signal
  });
  if (!res.ok) throw new Error(`getFilterOptions ${res.status}`);
  return res.json();
}

export type SearchCompaniesInput = { q?: string; mode?: "all"|"ocean"|"air"; pagination?: { limit?: number; offset?: number } };

export async function searchCompanies(body: SearchCompaniesInput, signal?: AbortSignal) {
  const res = await fetch(`${BASE}/searchCompanies`, {
    method:"POST",
    headers:{ "content-type":"application/json", "accept":"application/json" },
    body: JSON.stringify(body),
    signal
  });
  if (!res.ok) throw new Error(`searchCompanies ${res.status}`);
  return res.json();
}

