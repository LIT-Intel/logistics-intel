export type { SearchFilters, SearchCompaniesResponse, SearchCompanyRow } from '@/lib/api/search';
// Always call via Vercel proxy from the browser to avoid CORS
export const API_BASE = '/api/lit';

export type SearchPayload = {
  q: string | null;
  origin?: string[];
  dest?: string[];
  hs?: string[];
  limit?: number;
  offset?: number;
};

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
import { auth } from '@/auth/firebaseClient';

// Gateway base (env override → default)
const GW = '/api/lit';

function resolveSearchUnifiedBase() {
  let env = '';
  try {
    env = typeof process !== 'undefined' && process.env ? String(process.env.NEXT_PUBLIC_SEARCH_UNIFIED_URL ?? '') : '';
  } catch {
    env = '';
  }
  const client = typeof window !== 'undefined' ? String((window as any).__SEARCH_UNIFIED__ ?? '') : '';
  const base = (env || client || '').trim();
  return base ? base.replace(/\/$/, '') : '';
}

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

const GATEWAY_BASE_DEFAULT = 'https://lit-gw-2e68g4k3.uc.gateway.dev';

export async function searchCompanies(
  input: {
    q?: string | null;
    origin?: string | null;
    destination?: string | null;
    hs?: string | null;
    mode?: 'air' | 'ocean' | null;
    origin_city?: string | null;
    dest_city?: string | null;
    dest_state?: string | null;
    dest_postal?: string | null;
    dest_port?: string | null;
    page?: number;
    pageSize?: number;
    limit?: number;
    offset?: number;
  },
  signal?: AbortSignal
) {
  const limit = Math.max(1, Math.min(100, Number(input?.pageSize ?? input?.limit ?? 30)));
  const offsetSource = input?.offset ?? (input?.page != null ? Number(input.page) * limit : 0);
  const offset = Math.max(0, Number(offsetSource ?? 0));
  const qNorm = (input?.q ?? '').trim();

  const payload: Record<string, any> = { ...input };
  delete payload.page;
  delete payload.pageSize;
  payload.q = qNorm;
  payload.limit = limit;
  payload.offset = offset;

  for (const key of Object.keys(payload)) {
    const value = payload[key];
    if (value === undefined || value === null) {
      delete payload[key];
      continue;
    }
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) {
        delete payload[key];
        continue;
      }
      payload[key] = trimmed;
    }
  }

  const body = JSON.stringify(payload);
  const directBase = resolveSearchUnifiedBase();
  const directUrl = directBase ? `${directBase}/public/searchCompanies` : null;

  const request = (url: string, includeCredentials: boolean) =>
    fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
      signal,
      credentials: includeCredentials ? 'include' : 'same-origin',
    });

  let res: Response;
  if (directUrl) {
    res = await request(directUrl, true);
    if (!res.ok) {
      res = await request('/api/lit/public/searchCompanies', false);
    }
  } else {
    res = await request('/api/lit/public/searchCompanies', false);
  }

  if (!res.ok) throw new Error(`Search failed: ${res.status}`);
  const data = await res.json().catch(() => ({}));
  const items = Array.isArray(data?.items)
    ? data.items
    : Array.isArray(data?.rows)
      ? data.rows
      : Array.isArray(data?.results)
        ? data.results
        : [];
  const total = typeof data?.total === 'number'
    ? data.total
    : (data?.meta?.total ?? data?.count ?? items.length);
  return { items, total } as { items: any[]; total: number };
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
  // Try Vercel proxy first; if 404 or non-JSON, fall back to Gateway (GET then POST)
  const proxyUrl = `/api/lit/public/getFilterOptions`;
  try {
    const r = await fetch(proxyUrl, { method: 'GET', headers: { 'accept': 'application/json' }, signal });
    const ct = r.headers.get('content-type') || '';
    if (!r.ok || !ct.includes('application/json')) throw new Error(String(r.status));
    return await r.json();
  } catch {
    // Gateway fallback
    const u = `${GATEWAY_BASE_DEFAULT}/public/getFilterOptions`;
    let g = await fetch(u, { method: 'GET', headers: { 'accept': 'application/json' }, signal });
    let ct = g.headers.get('content-type') || '';
    if (!g.ok || !ct.includes('application/json')) {
      // Some upstreams expose it as POST; try that
      g = await fetch(u, { method: 'POST', headers: { 'content-type': 'application/json', 'accept': 'application/json' }, body: JSON.stringify({}), signal });
    }
    if (!g.ok) { const t = await g.text().catch(()=> ''); throw new Error(`getFilterOptions failed: ${g.status} ${t}`); }
    return await g.json();
  }
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
    const u = `${GATEWAY_BASE_DEFAULT}/public/getCompanyKpis?${qp.toString()}`;
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
type CompanyLanesParams = {
  company_id?: string | null;
  company?: string | null;
  month?: string;
  origin?: string;
  dest?: string;
  limit?: number;
  offset?: number;
};

export async function fetchCompanyLanes(
  companyOrParams: string | CompanyLanesParams,
  overrides?: { month?: string; origin?: string; dest?: string; limit?: number; offset?: number }
) {
  const payload: CompanyLanesParams = typeof companyOrParams === 'string'
    ? { company_id: companyOrParams, ...overrides }
    : { ...companyOrParams, ...overrides };

  const companyIdRaw = payload.company_id ?? null;
  const companyNameRaw = payload.company ?? null;
  const companyId = companyIdRaw != null ? String(companyIdRaw).trim() : '';
  const companyName = companyNameRaw != null ? String(companyNameRaw).trim() : '';

  if (!companyId && !companyName) {
    return { rows: [] as any[] };
  }

  const bodyObj: Record<string, any> = {
    ...(companyId ? { company_id: companyId } : {}),
    ...(companyName ? { company: companyName, name_norm: companyName } : {}),
    origin: payload.origin,
    dest: payload.dest,
    month: payload.month,
    limit: payload.limit ?? 10,
    offset: payload.offset ?? 0,
  };

  for (const key of Object.keys(bodyObj)) {
    const value = bodyObj[key];
    if (value === undefined || value === null) {
      delete bodyObj[key];
    } else if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed && key !== 'company_id') {
        delete bodyObj[key];
      } else {
        bodyObj[key] = trimmed;
      }
    }
  }

  const body = JSON.stringify(bodyObj);
  const directBase = resolveSearchUnifiedBase();
  const directUrl = directBase ? `${directBase}/public/companyLanes` : null;

  const request = (url: string, includeCredentials: boolean) =>
    fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
      credentials: includeCredentials ? 'include' : 'same-origin',
    });

  let res: Response;
  if (directUrl) {
    res = await request(directUrl, true);
    if (!res.ok) {
      res = await request('/api/lit/public/companyLanes', false);
    }
  } else {
    res = await request('/api/lit/public/companyLanes', false);
  }

  if (!res.ok) throw new Error(`companyLanes ${res.status}`);
  return res.json();
}

type CompanyShipmentsParams = {
  company_id?: string | null;
  company?: string | null;
  name_norm?: string | null;
  mode?: 'air' | 'ocean';
  origin?: string | null;
  dest?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  limit?: number;
  offset?: number;
};

export async function fetchCompanyShipments(
  companyOrParams: string | CompanyShipmentsParams,
  overrides?: { mode?: 'air' | 'ocean'; origin?: string; dest?: string; startDate?: string; endDate?: string; limit?: number; offset?: number }
) {
  const payload: CompanyShipmentsParams = typeof companyOrParams === 'string'
    ? { company_id: companyOrParams, ...overrides }
    : { ...companyOrParams, ...overrides };

  const companyIdRaw = payload.company_id ?? null;
  const companyNameRaw = payload.company ?? payload.name_norm ?? null;
  const companyId = companyIdRaw != null ? String(companyIdRaw).trim() : '';
  const companyName = companyNameRaw != null ? String(companyNameRaw).trim() : '';

  if (!companyId && !companyName) {
    return { rows: [] as any[] };
  }

  const bodyObj: Record<string, any> = {
    ...(companyId ? { company_id: companyId } : {}),
    ...(companyName ? { company: companyName, name_norm: companyName } : {}),
    mode: payload.mode,
    origin: payload.origin,
    dest: payload.dest,
    startDate: payload.startDate,
    endDate: payload.endDate,
    limit: payload.limit ?? 25,
    offset: payload.offset ?? 0,
  };

  for (const key of Object.keys(bodyObj)) {
    const value = bodyObj[key];
    if (value === undefined || value === null) {
      delete bodyObj[key];
    } else if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed && key !== 'company_id') {
        delete bodyObj[key];
      } else {
        bodyObj[key] = trimmed;
      }
    }
  }

  const body = JSON.stringify(bodyObj);
  const directBase = resolveSearchUnifiedBase();
  const directUrl = directBase ? `${directBase}/public/companyShipments` : null;

  const request = (url: string, includeCredentials: boolean) =>
    fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
      credentials: includeCredentials ? 'include' : 'same-origin',
    });

  let res: Response;
  if (directUrl) {
    res = await request(directUrl, true);
    if (!res.ok) {
      res = await request('/api/lit/public/companyShipments', false);
    }
  } else {
    res = await request('/api/lit/public/companyShipments', false);
  }

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
