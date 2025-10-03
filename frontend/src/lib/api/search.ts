import { apiBase } from "../apiBase";

export type CompanyRow = {
  company_id: string;
  company_name: string;
  shipments_12m?: number | null;
  last_activity?: string | null;
  top_routes?: Array<{ origin_country: string; dest_country: string; cnt: number }>;
  top_carriers?: Array<{ carrier: string; cnt: number }>;
  tags?: string[];
};

export type SearchFilters = {
  q?: string | null;
  origin?: string[] | null;
  dest?: string[] | null;
  hs?: string[] | null;
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

function csvOrNull(v?: string[] | null) {
  if (!v || v.length === 0) return null;
  const trimmed = v.map(s => s.trim()).filter(Boolean);
  return trimmed.length ? trimmed.join(',') : null;
}

function normalizePayload(f: SearchFilters) {
  const limit = Math.max(1, Math.min(50, Number(f.limit ?? 24)));
  const offset = Math.max(0, Number(f.offset ?? 0));
  const body: Record<string, any> = {};
  const q = typeof f.q === 'string' ? f.q.trim() : null;
  body.q = q && q.length ? q : null;
  const originCSV = csvOrNull(f.origin ?? null);
  const destCSV = csvOrNull(f.dest ?? null);
  const hsCSV = csvOrNull(f.hs ?? null);
  if (originCSV) body.origin = originCSV;
  if (destCSV) body.dest = destCSV;
  if (hsCSV) body.hs = hsCSV;
  body.limit = limit;
  body.offset = offset;
  return body;
}

export async function searchCompanies(filters: SearchFilters): Promise<SearchCompaniesResponse> {
  const payload = normalizePayload(filters);
  const res = await fetch(`${apiBase()}/public/searchCompanies`, {
    method: "POST",
    headers: { "content-type": "application/json", "accept": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Search failed: ${res.status} ${text}`);
  }
  const data = await res.json();
  const rows: CompanyRow[] = Array.isArray(data) ? data : (data?.rows ?? data?.items ?? []);
  const filtered = rows.filter(r => !!r?.company_id && !!r?.company_name);
  return { meta: { total: filtered.length, page: 1, page_size: filtered.length }, rows: filtered } as SearchCompaniesResponse;
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
  const res = await fetch(`${apiBase()}/public/getCompanyShipments?${params.toString()}`, { headers: { 'accept': 'application/json' } });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`getCompanyShipments failed: ${res.status} ${text}`);
  }
  const data = await res.json();
  return Array.isArray(data) ? data : (data?.rows ?? data?.items ?? []);
}
