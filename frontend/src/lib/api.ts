// src/lib/api.ts

// --- Types for search ---
export type SearchFilters = {
  q?: string;
  origin?: string[];
  dest?: string[];
  hs?: string[];
  limit?: number;
  offset?: number;
};

export type SearchCompanyRow = {
  company_id: string;
  name: string;
  kpis: {
    shipments_12m: number;
    // BE may return a string or { value: string } for DATE
    last_activity: string | { value: string };
  };
};

export type SearchCompaniesResponse = {
  meta: { total: number; page: number; page_size: number };
  rows: SearchCompanyRow[];
};

// --- Gateway base ---
const GW =
  (import.meta as any).env?.VITE_LIT_GATEWAY_BASE ||
  (globalThis as any)?.process?.env?.NEXT_PUBLIC_LIT_GATEWAY_BASE ||
  "https://logistics-intel-gateway-2e68g4k3.uc.gateway.dev";

// --- helpers ---
function toCsv(a?: string[]): string {
  return Array.isArray(a) && a.length > 0 ? a.join(",") : "";
}
function buildSearchPayload(f: SearchFilters) {
  const limit = Math.max(1, Math.min(50, Number(f.limit ?? 24)));
  const offset = Math.max(0, Number(f.offset ?? 0));
  return {
    q: (f.q ?? "").trim(),
    origin: toCsv(f.origin),
    dest: toCsv(f.dest),
    hs: toCsv(f.hs),
    limit,
    offset,
  };
}

// --- API surface used by pages/components ---

/** GET filter options for Search panel */
export async function getFilterOptions(): Promise<any> {
  const r = await fetch(`${GW}/public/getFilterOptions`, { method: "GET" });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(`getFilterOptions failed: ${r.status} ${t}`);
  }
  return r.json();
}

/** POST searchCompanies (CSV payload for arrays) */
export async function searchCompanies(filters: SearchFilters): Promise<SearchCompaniesResponse> {
  const body = JSON.stringify(buildSearchPayload(filters));
  const r = await fetch(`${GW}/public/searchCompanies`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(`searchCompanies failed: ${r.status} ${t}`);
  }
  return (await r.json()) as SearchCompaniesResponse;
}

/** Backward compatibility alias some components still import */
export const postSearchCompanies = searchCompanies;

/** Company shipments for drawer (non-breaking shape; BE may return empty) */
export async function getCompanyShipments(
  company_id: string,
  limit = 25,
  offset = 0
): Promise<any> {
  const q = new URLSearchParams({ company_id, limit: String(limit), offset: String(offset) });
  const r = await fetch(`${GW}/public/getCompanyShipments?${q.toString()}`, { method: "GET" });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(`getCompanyShipments failed: ${r.status} ${t}`);
  }
  return r.json();
}

/** Placeholder: enrich endpoint wiring (adjust when BE route is ready) */
export async function enrichCompany(_company_id: string): Promise<{ ok: boolean }> {
  // Implement actual POST to your CRM/enrichment service when available.
  // Export exists so builds don’t fail on missing symbol.
  return { ok: true };
}

// Named facade used elsewhere (kept minimal for tree-shaking)
export const api = {
  searchCompanies,
  getFilterOptions,
  getCompanyShipments,
  enrichCompany,
};
