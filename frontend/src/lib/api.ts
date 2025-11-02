import { getGatewayBase } from '@/lib/env';
export type { SearchFilters, SearchCompaniesResponse, SearchCompanyRow } from '@/lib/api/search';
// Always call via Vercel proxy from the browser to avoid CORS
export const API_BASE = '/api/lit';

export type SearchCompaniesParams = {
  q?: string | null;
  mode?: 'air' | 'ocean';
  hs?: string | string[] | null;
  origin?: string[] | null;
  dest?: string[] | null;
  carrier?: string[] | null;
  startDate?: string;
  endDate?: string;
  limit?: number;
  offset?: number;
};

export type SearchPayload = {
  q: string | null;
  origin?: string[];
  dest?: string[];
  hs?: string[];
  limit?: number;
  offset?: number;
};

function normalizeQ(q: unknown) {
  return (q ?? '').toString().trim();
}

async function fetchJson(url: string, init?: RequestInit) {
  const res = await fetch(url, init);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const pathname = (() => {
      try {
        return new URL(url).pathname;
      } catch {
        return url;
      }
    })();
    throw new Error(`${pathname} ${res.status}: ${text || res.statusText}`);
  }
  return res.json();
}

export async function searchCompaniesProxy(payload: SearchPayload){
  const body = {
    q: payload.q ?? null,
    origin: Array.isArray(payload.origin) ? payload.origin : [],
    dest: Array.isArray(payload.dest) ? payload.dest : [],
    hs: Array.isArray(payload.hs) ? payload.hs : [],
    limit: Number(payload.limit ?? 12),
    offset: Number(payload.offset ?? 0)
  } as const;
  const r = await fetch(`${API_BASE}/api/searchCompanies`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`searchCompanies ${r.status}`);
  return r.json();
}

export async function getCompanyShipmentsProxy(params: {company_id?: string; company_name?: string; origin?: string[]; dest?: string[]; hs?: string[]; limit?: number; offset?: number;}){
  const qp = new URLSearchParams();
  if(params.company_id) qp.set('company_id', params.company_id);
  if(params.company_name) qp.set('company_name', params.company_name);
  if(params.origin?.length) qp.set('origin', params.origin.join(','));
  if(params.dest?.length) qp.set('dest', params.dest.join(','));
  if(params.hs?.length) qp.set('hs', params.hs.join(','));
  qp.set('limit', String(params.limit ?? 20));
  qp.set('offset', String(params.offset ?? 0));
  const r = await fetch(`${API_BASE}/public/getCompanyShipments?${qp.toString()}`);
  if (!r.ok) throw new Error(`getCompanyShipments ${r.status}`);
  return r.json();
}

// Back-compat names expected by some pages
export const searchCompaniesProxyCompat = searchCompaniesProxy;
export const getCompanyShipmentsProxyCompat = getCompanyShipmentsProxy;

// Gateway base (env override → default)
const GW = '/api/lit';

async function j<T>(p: Promise<Response>): Promise<T> {
  const r = await p;
  if (!r.ok) {
    const text = await r.text().catch(() => String(r.status));
    throw new Error(text || String(r.status));
  }
  return r.json() as Promise<T>;
}

// Widgets compatibility endpoints
export async function calcTariff(input: { hsCode?: string; origin?: string; destination?: string; valueUsd?: number }) {
  const res = await fetch(`${GW}/widgets/tariff/calc`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'accept': 'application/json' }, body: JSON.stringify(input || {}),
  });
  if (!res.ok) throw new Error(`calcTariff ${res.status}`);
  return res.json();
}

export async function generateQuote(input: { companyId?: string|number; lanes: Array<{ origin: string; destination: string; mode: string }>; notes?: string }) {
  const res = await fetch(`${GW}/widgets/quote/generate`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'accept': 'application/json' }, body: JSON.stringify(input || {}),
  });
  if (!res.ok) throw new Error(`generateQuote ${res.status}`);
  return res.json();
}

// Typed helpers for unified search and shipments
export type CompanySearchItem = {
  company_id: string | null;
  company_name: string;
  shipments: number;
  lastShipmentDate: string | null;
  modes?: string[];
  hsTop?: Array<{ v: string; c: number }>;
  originsTop?: Array<{ v: string; c: number }>;
  destsTop?: Array<{ v: string; c: number }>;
  carriersTop?: Array<{ v: string; c: number }>;
};

export type ShipmentRow = {
  shipped_on: string;
  mode: 'ocean'|'air';
  origin: string;
  destination: string;
  carrier: string | null;
  value_usd: string | number | null;
  weight_kg: string | number | null;
};

// Company item + KPI extractor tolerant to snake/camel
export type CompanyItem = {
  company_id: string | null;
  company_name: string;
  shipments_12m?: number; shipments12m?: number; shipments?: number;
  last_activity?: string | null; lastActivity?: string | null; lastShipmentDate?: string | null;
  origins_top?: string[]; originsTop?: string[];
  dests_top?: string[];   destsTop?: string[];
  carriers_top?: string[]; carriersTop?: string[];
};

export function kpiFrom(item: CompanyItem) {
  const shipments12m = Number(
    item.shipments12m ?? item.shipments_12m ?? item.shipments ?? 0
  );
  const rawLast: any = (item as any).lastActivity ?? (item as any).last_activity ?? (item as any).lastShipmentDate;
  const lastActivity = (rawLast && typeof rawLast === 'object' && 'value' in rawLast)
    ? (rawLast.value ?? null)
    : (rawLast ?? null);
  const originsTop   = item.originsTop   ?? item.origins_top   ?? [];
  const destsTop     = item.destsTop     ?? item.dests_top     ?? [];
  const carriersTop  = item.carriersTop  ?? item.carriers_top  ?? [];
  return { shipments12m, lastActivity, originsTop, destsTop, carriersTop };
}

// Legacy-compatible wrapper that accepts arrays or CSV
export async function postSearchCompanies(payload: any) {
  const res = await fetch(`/api/lit/public/searchCompanies`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload || {})
  });
  if (!res.ok) { const t = await res.text().catch(()=> ''); throw new Error(`postSearchCompanies failed: ${res.status} ${t}`); }
  return res.json(); // { items, total }
}

export async function searchCompanies(params: SearchCompaniesParams = {}, signal?: AbortSignal) {
  const {
    q,
    mode,
    hs,
    origin,
    dest,
    carrier,
    startDate,
    endDate,
    limit = 20,
    offset = 0,
  } = params;

  const BASE = getGatewayBase();

  const body: Record<string, any> = {
    q: normalizeQ(q),
    limit: Math.max(1, Math.min(50, Number(limit))),
    offset: Math.max(0, Number(offset)),
  };
  if (mode) body.mode = mode;
  if (typeof hs === 'string') {
    const trimmed = hs.trim();
    if (trimmed) body.hs = trimmed;
  } else if (Array.isArray(hs) && hs.length) {
    body.hs = hs;
  }
  if (Array.isArray(origin) && origin.length) body.origin = origin;
  if (Array.isArray(dest) && dest.length) body.dest = dest;
  if (Array.isArray(carrier) && carrier.length) body.carrier = carrier;
  if (startDate) body.startDate = startDate;
  if (endDate) body.endDate = endDate;

  return fetchJson(`${BASE}/public/searchCompanies`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  }) as Promise<{
    meta: { total: number; page: number; page_size: number };
    rows: Array<{
      company_id: string;
      company_name: string;
      shipments_12m: number | null;
      last_activity: string | null;
      top_routes?: Array<{ route?: string; origin_country?: string; dest_country?: string }>;
      top_carriers?: Array<{ carrier?: string }>;
    }>;
  }>;
}

export function buildSearchParams(raw: Record<string, any>) {
  const cleaned: Record<string, any> = {};
  for (const [key, value] of Object.entries(raw || {})) {
    if (value === undefined || value === null) continue;
    if (typeof value === 'string' && value.trim() === '') continue;
    cleaned[key] = value;
  }
  return cleaned;
}

export type SearchCompaniesBody = {
  q: string | null;
  origin?: string[];
  dest?: string[];
  hs?: string[];
  limit?: number;
  offset?: number;
};

export async function getCompanyShipments(params: { company_id: string; limit?: number; offset?: number }) {
  const { company_id } = params;
  const limit = Math.max(1, Math.min(100, Number(params.limit ?? 20)));
  const offset = Math.max(0, Number(params.offset ?? 0));
  const qs = new URLSearchParams({ company_id, limit: String(limit), offset: String(offset) });
  const res = await fetch(`${GW}/public/getCompanyShipments?${qs.toString()}`, { method: 'GET' });
  if (!res.ok) { const t = await res.text().catch(()=> ''); throw new Error(`getCompanyShipments failed: ${res.status} ${t}`); }
  return res.json();
}

// New helpers per patch: getCompanyDetails, getCompanyShipments (unified signature)
export async function getCompanyDetails(params: { company_id?: string; fallback_name?: string }) {
  const q = new URLSearchParams();
  if (params.company_id) q.set('company_id', params.company_id);
  const url = `/api/lit/public/getCompanyDetails?${q.toString()}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`getCompanyDetails ${r.status}`);
  return r.json();
}

export async function getCompanyShipmentsUnified(params: { company_id?: string; company_name?: string; origin?: string; dest?: string; hs?: string; limit?: number; offset?: number }) {
  const q = new URLSearchParams();
  if (params.company_id) q.set('company_id', params.company_id);
  if (params.company_name) q.set('company_name', params.company_name);
  if (params.origin) q.set('origin', params.origin);
  if (params.dest) q.set('dest', params.dest);
  if (params.hs) q.set('hs', params.hs);
  q.set('limit', String(params.limit ?? 50));
  q.set('offset', String(params.offset ?? 0));
  const url = `/api/lit/public/getCompanyShipments?${q.toString()}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`getCompanyShipments ${r.status}`);
  const data = await r.json();
  return { rows: Array.isArray((data as any)?.rows) ? (data as any).rows : [], total: Number((data as any)?.meta?.total ?? (data as any)?.total ?? 0) };
}

export async function getFilterOptions(signal?: AbortSignal) {
  const BASE = getGatewayBase();
  return fetchJson(`${BASE}/public/getFilterOptions`, { signal }) as Promise<{
    origin_countries: string[];
    dest_countries: string[];
    modes: string[];
    hs_top?: string[];
  }>;
}

// Fast KPI endpoint (proxy-first, fallback to Gateway)
export async function getCompanyKpis(params: { company_id?: string; company_name?: string }, signal?: AbortSignal) {
  const qp = new URLSearchParams();
  if (params.company_id) qp.set('company_id', params.company_id);
  if (!params.company_id && params.company_name) qp.set('company_name', params.company_name);
  const url = `/api/lit/public/getCompanyKpis?${qp.toString()}`;
  try {
    const r = await fetch(url, { method: 'GET', headers: { accept: 'application/json' }, signal });
    const ct = r.headers.get('content-type') || '';
    if (!r.ok || !ct.includes('application/json')) throw new Error(String(r.status));
    return await r.json();
  } catch {
    // Fallback to Gateway
    const base = getGatewayBase();
    const u = `${base}/public/getCompanyKpis?${qp.toString()}`;
    const g = await fetch(u, { method: 'GET', headers: { accept: 'application/json' }, signal });
    if (!g.ok) return null;
    return await g.json().catch(() => null);
  }
}

// Saved companies list (for future UI)
export async function getSavedCompanies(signal?: AbortSignal) {
  const url = `/api/lit/crm/savedCompanies`;
  const r = await fetch(url, { headers: { accept: 'application/json' }, signal });
  if (!r.ok) return { rows: [] };
  return r.json();
}

// --- Filters singleton cache with 10m TTL ---
let _filtersCache: { data: any; expires: number } | null = null;
let _filtersInflight: Promise<any> | null = null;

function readFiltersLocal(): { data: any; expires: number } | null {
  try {
    if (typeof window === 'undefined') return null;
    const raw = window.localStorage.getItem('lit.filters');
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (!obj?.data || !obj?.expires) return null;
    if (Date.now() > obj.expires) return null;
    return obj;
  } catch { return null; }
}

function writeFiltersLocal(data: any) {
  try {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem('lit.filters', JSON.stringify({ data, expires: Date.now() + 10 * 60 * 1000 }));
  } catch {}
}

export async function getFilterOptionsOnce(fetcher: (signal?: AbortSignal) => Promise<any>, signal?: AbortSignal) {
  if (_filtersCache && Date.now() < _filtersCache.expires) return _filtersCache.data;
  const local = readFiltersLocal();
  if (local) { _filtersCache = local; return local.data; }
  if (_filtersInflight) return _filtersInflight;
  _filtersInflight = (async () => {
    const data = await fetcher(signal);
    _filtersCache = { data, expires: Date.now() + 10 * 60 * 1000 };
    writeFiltersLocal(data);
    _filtersInflight = null;
    return data;
  })();
  return _filtersInflight;
}

export async function saveCompanyToCrm(payload: { company_id: string; company_name: string; notes?: string | null; source?: string; }) {
  const res = await fetch(`${GW}/crm/saveCompany`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...payload, source: payload.source ?? "search" }) });
  if (!res.ok) throw new Error(`saveCompanyToCrm failed: ${res.status} ${await res.text().catch(()=> "")}`);
  return await res.json();
}

export function buildCompanyShipmentsUrl(
  row: { company_id?: string; company_name: string },
  limit = 50,
  offset = 0
) {
  const params = new URLSearchParams();
  if (row.company_id && row.company_id.trim()) {
    params.set('company_id', row.company_id.trim());
  } else {
    params.set('company_name', row.company_name);
  }
  params.set('limit', String(limit));
  params.set('offset', String(offset));
  return `/api/lit/public/getCompanyShipments?${params.toString()}`;
}

export function getCompanyKey(row: { company_id?: string; company_name: string }) {
  return row.company_id?.trim() || `name:${row.company_name.toLowerCase()}`;
}

export async function createCompany(body: { name: string; domain?: string; street?: string; city?: string; state?: string; postal?: string; country?: string }) {
  const res = await fetch(`${GW}/crm/company.create`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'accept': 'application/json' }, body: JSON.stringify(body || {})
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`company.create ${res.status}:${t.slice(0,200)}`);
  }
  return res.json();
}

export async function getCompany(company_id: string) {
  const url = `${GW}/crm/company.get?company_id=${encodeURIComponent(company_id)}`;
  const res = await fetch(url, { headers: { 'accept': 'application/json' } });
  if (!res.ok) throw new Error(`company.get ${res.status}`);
  return res.json();
}

export async function enrichCompany(payload: { company_id: string }) {
  const res = await fetch(`${GW}/crm/enrichCompany`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
  if (!res.ok) { const t = await res.text().catch(()=> ''); throw new Error(`enrichCompany failed: ${res.status} ${t}`); }
  return res.json();
}

export async function recallCompany(payload: { company_id: string; questions?: string[] }) {
  // Prefer POST; if 405, fallback to GET with query params
  const res = await fetch(`${GW}/ai/recall`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
  if (res.status === 405) {
    const qs = new URLSearchParams({ company_id: payload.company_id });
    const g = await fetch(`${GW}/ai/recall?${qs.toString()}`, { method: 'GET', headers: { 'accept': 'application/json' } });
    if (!g.ok) { const t = await g.text().catch(()=> ''); throw new Error(`recallCompany failed: ${g.status} ${t}`); }
    return g.json();
  }
  if (!res.ok) { const t = await res.text().catch(()=> ''); throw new Error(`recallCompany failed: ${res.status} ${t}`); }
  return res.json();
}

export async function enrichContacts(company_id: string) {
  const res = await fetch(`${GW}/crm/contacts.enrich`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'accept': 'application/json' },
    body: JSON.stringify({ company_id })
  });
  if (!res.ok) {
    const t = await res.text().catch(()=> '');
    throw new Error(`contacts.enrich ${res.status} ${t}`);
  }
  return res.json();
}

export async function listContacts(company_id: string, dept?: string) {
  const u = new URL(`${GW}/crm/contacts.list`);
  u.searchParams.set('company_id', company_id);
  if (dept) u.searchParams.set('dept', dept);
  const res = await fetch(u.toString(), { headers: { 'accept': 'application/json' } });
  if (!res.ok) throw new Error(`contacts.list ${res.status}`);
  return res.json();
}

export async function getEmailThreads(company_id: string) {
  const url = `${GW}/crm/email.threads?company_id=${encodeURIComponent(company_id)}`;
  const res = await fetch(url, { headers: { 'accept': 'application/json' } });
  if (!res.ok) throw new Error(`email.threads ${res.status}`);
  return await res.json();
}

export async function getCalendarEvents(company_id: string) {
  const url = `${GW}/crm/calendar.events?company_id=${encodeURIComponent(company_id)}`;
  const res = await fetch(url, { headers: { 'accept': 'application/json' } });
  if (!res.ok) throw new Error(`calendar.events ${res.status}`);
  return res.json();
}

export async function createTask(p: { company_id: string; title: string; due_date?: string; notes?: string }) {
  const res = await fetch(`${GW}/crm/task.create`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'accept': 'application/json' }, body: JSON.stringify(p)
  });
  if (!res.ok) throw new Error(`task.create ${res.status}`);
  return res.json();
}

export async function createAlert(p: { company_id: string; type: string; message: string }) {
  const res = await fetch(`${GW}/crm/alert.create`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'accept': 'application/json' }, body: JSON.stringify(p)
  });
  if (!res.ok) throw new Error(`alert.create ${res.status}`);
  return await res.json();
}

export async function saveCampaign(body: Record<string, any>) {
  const res = await fetch(`${GW}/crm/campaigns`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`saveCampaign failed: ${res.status} ${(await res.text().catch(()=> '')).slice(0,200)}`);
  return res.json();
}

// Consolidated API object for callers using api.*
export const api = {
  searchCompanies,
  getFilterOptions,
  getCompanyShipments,
  enrichCompany,
  recallCompany,
  saveCampaign,
  saveCompanyToCrm,
  createCompany,
  getEmailThreads,
  getCalendarEvents,
  createAlert,
  kpiFrom,
};

// New API helpers for Company Lanes and Shipments drill-down via direct service
export async function fetchCompanyLanes(params: {
  company: string;
  month?: string;      // YYYY-MM-01
  origin?: string;
  dest?: string;
  limit?: number;
  offset?: number;
}) {
  const base = (typeof process !== 'undefined' && (process as any)?.env?.NEXT_PUBLIC_SEARCH_UNIFIED_URL)
    || (typeof window !== 'undefined' && (window as any).__SEARCH_UNIFIED__)
    || '';
  const serviceBase = String(base || '').replace(/\/$/, '');
  const res = await fetch(`${serviceBase}/public/companyLanes`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "include",
    body: JSON.stringify(params),
  });
  if (!res.ok) throw new Error(`companyLanes ${res.status}`);
  return res.json();
}

export async function fetchCompanyShipments(params: {
  company: string;
  name_norm?: string;
  mode?: "air"|"ocean";
  origin?: string;
  dest?: string;
  startDate?: string; // YYYY-MM-DD
  endDate?: string;   // YYYY-MM-DD
  limit?: number;
  offset?: number;
}) {
  const base = (typeof process !== 'undefined' && (process as any)?.env?.NEXT_PUBLIC_SEARCH_UNIFIED_URL)
    || (typeof window !== 'undefined' && (window as any).__SEARCH_UNIFIED__)
    || '';
  const serviceBase = String(base || '').replace(/\/$/, '');
  const res = await fetch(`${serviceBase}/public/companyShipments`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "include",
    body: JSON.stringify(params),
  });
  if (!res.ok) throw new Error(`companyShipments ${res.status}`);
  return res.json();
}

// The exported searchCompanies above already points to the proxy-backed implementation

// --- Lusha wrappers via Vercel proxy → Gateway → Cloud Run ---
export async function getCompanyProfileLushia(q: { company_id?: string; domain?: string; company_name?: string }) {
  const params = new URLSearchParams();
  if (q.company_id) params.set('company_id', q.company_id);
  if (q.domain) params.set('domain', q.domain);
  if (q.company_name) params.set('company_name', q.company_name);
  const res = await fetch(`/api/lit/public/lushia/company?${params.toString()}`, { method: 'GET' });
  return res.ok ? res.json() : { error: await res.text(), status: res.status } as any;
}

export async function enrichCompanyLushia(body: { company_id?: string; domain?: string; company_name?: string }) {
  const res = await fetch(`/api/lit/public/lushia/enrichCompany`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
  return res.ok ? res.json() : { error: await res.text(), status: res.status } as any;
}

export async function listContactsLushia(
  who: { company_id?: string; domain?: string; company_name?: string },
  opts?: { dept?: string; limit?: number; offset?: number }
) {
  const params = new URLSearchParams();
  if (who.company_id) params.set('company_id', who.company_id);
  if (who.domain) params.set('domain', who.domain);
  if (who.company_name) params.set('company_name', who.company_name);
  if (opts?.dept) params.set('dept', opts.dept);
  if (opts?.limit != null) params.set('limit', String(opts.limit));
  if (opts?.offset != null) params.set('offset', String(opts.offset));
  const res = await fetch(`/api/lit/public/lushia/contacts?${params.toString()}`, { method: 'GET' });
  return res.ok ? res.json() : { error: await res.text(), status: res.status } as any;
}
