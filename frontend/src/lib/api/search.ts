import { apiBase } from "../apiBase";

export type SearchFilters = {
  q?: string | null;
  origin?: string[] | string | null;
  dest?: string[] | string | null;
  hs?: string[] | string | null;
  limit?: number;
  offset?: number;
};

export type SearchCompanyRow = {
  company_id: string;
  name: string;
  kpis: {
    shipments_12m: number;
    last_activity: string | { value: string };
  };
};

export type SearchCompaniesResponse = {
  meta: { total: number; page: number; page_size: number };
  rows: SearchCompanyRow[];
};

function toCsvOrNull(a?: string[] | string | null): string | null {
  if (Array.isArray(a)) return a.length > 0 ? a.join(",") : null;
  if (typeof a === 'string') {
    const v = a.trim();
    return v.length ? v : null;
  }
  return null;
}

function normalizePayload(f: SearchFilters) {
  const limit = Math.max(1, Math.min(50, Number(f.limit ?? 24)));
  const offset = Math.max(0, Number(f.offset ?? 0));
  return {
    q: typeof f.q === 'string' && f.q.trim().length ? f.q.trim() : null,
    origin: toCsvOrNull(f.origin),
    dest: toCsvOrNull(f.dest),
    hs: toCsvOrNull(f.hs),
    limit,
    offset,
  };
}

export async function searchCompanies(filters: SearchFilters): Promise<SearchCompaniesResponse> {
  const payload = normalizePayload(filters);
  const res = await fetch(`${apiBase()}/public/searchCompanies`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Search failed: ${res.status} ${text}`);
  }
  return (await res.json()) as SearchCompaniesResponse;
}

export type GetCompanyShipmentsInput = {
  company_id?: string | null;
  company_name?: string | null;
  origin?: string | null;
  dest?: string | null;
  hs?: string | null;
  limit?: number;
  offset?: number;
};

export async function getCompanyShipments(input: GetCompanyShipmentsInput) {
  const params = new URLSearchParams();
  if (input.company_id) params.set('company_id', input.company_id);
  else if (input.company_name) params.set('company_name', input.company_name);
  if (input.origin) params.set('origin', input.origin);
  if (input.dest) params.set('dest', input.dest);
  if (input.hs) params.set('hs', input.hs);
  if (typeof input.limit === 'number') params.set('limit', String(input.limit));
  if (typeof input.offset === 'number') params.set('offset', String(input.offset));
  const res = await fetch(`${apiBase()}/public/getCompanyShipments?${params.toString()}`);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`getCompanyShipments failed: ${res.status} ${text}`);
  }
  return res.json();
}
