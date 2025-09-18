const BASE = (() => {
  const base = (import.meta.env as any).VITE_API_BASE || (import.meta.env as any).VITE_PROXY_BASE || "/api/public";
  if (base.endsWith("/public")) return base;
  if (base.endsWith("/public/")) return base.slice(0, -1);
  if (base === "/api/public") return base;
  return base.replace(/\/$/, "") + "/public";
})();

export async function getFilterOptions(input: object = {}, signal?: AbortSignal) {
  const res = await fetch(`${BASE}/getFilterOptions`, {
    method: "GET",
    headers: { "content-type": "application/json", "accept": "application/json" },
    signal,
  });
  if (res.status === 422) {
    const err = await res.json().catch(() => ({ message: "Validation error" }));
    console.error("getFilterOptions validation error", err?.fieldErrors || err);
    throw new Error("Invalid filters request. Please adjust and retry.");
  }
  if (!res.ok) throw new Error(`getFilterOptions ${res.status}`);
  return res.json();
}

export type SearchCompaniesInput = { q?: string; mode?: "all"|"ocean"|"air"; filters?: Record<string, any>; dateRange?: { from?: string; to?: string }; pagination?: { limit?: number; offset?: number } };

export async function searchCompanies(body: SearchCompaniesInput, signal?: AbortSignal) {
  // Map UI shape to backend expected fields
  const limit = body.pagination?.limit ?? 10;
  const offset = body.pagination?.offset ?? 0;
  const payload = {
    q: body.q ?? "",
    mode: (body.mode && body.mode !== "all") ? body.mode : undefined,
    hs: Array.isArray(body.filters?.hs) ? body.filters?.hs : undefined,
    origin: Array.isArray(body.filters?.origin) ? body.filters?.origin : (body.filters?.origin ? [body.filters.origin] : undefined),
    dest: Array.isArray(body.filters?.destination) ? body.filters?.destination : (body.filters?.destination ? [body.filters.destination] : undefined),
    carrier: Array.isArray(body.filters?.carrier) ? body.filters?.carrier : (body.filters?.carrier ? [body.filters.carrier] : undefined),
    startDate: body.dateRange?.from ?? undefined,
    endDate: body.dateRange?.to ?? undefined,
    limit,
    offset,
  } as const;
  const res = await fetch(`${BASE}/searchCompanies`, {
    method: "POST",
    headers: { "content-type": "application/json", "accept": "application/json" },
    body: JSON.stringify(payload),
    signal,
  });
  if (res.status === 422 || res.status === 400) {
    const err = await res.json().catch(() => ({ message: "Validation error" }));
    console.error("searchCompanies validation error", err);
    throw new Error(err?.message || "Invalid search parameters");
  }
  if (!res.ok) throw new Error(`searchCompanies ${res.status}`);
  return res.json();
}

// Widgets
export async function calcTariff(input: { hsCode?: string; origin?: string; destination?: string; valueUsd?: number }, signal?: AbortSignal) {
  const res = await fetch(`${BASE}/widgets/tariff/calc`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'accept': 'application/json' },
    body: JSON.stringify(input || {}),
    signal,
  });
  if (!res.ok) throw new Error(`calcTariff ${res.status}`);
  return res.json();
}

export async function generateQuote(input: { companyId?: string|number; lanes: Array<{ origin: string; destination: string; mode: string }>; notes?: string }, signal?: AbortSignal) {
  const res = await fetch(`${BASE}/widgets/quote/generate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'accept': 'application/json' },
    body: JSON.stringify(input || {}),
    signal,
  });
  if (!res.ok) throw new Error(`generateQuote ${res.status}`);
  return res.json();
}

