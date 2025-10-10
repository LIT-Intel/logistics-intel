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
  const lastActivity = (item.lastActivity ?? item.last_activity ?? item.lastShipmentDate) || null;
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

export async function searchCompanies(
  input: {
    q?: string | null;
    origin?: string | null;
    destination?: string | null;
    hs?: string | null;
    mode?: 'air' | 'ocean' | null;
    page?: number;
    pageSize?: number;
  },
  signal?: AbortSignal
) {
  // TEMP: prefer direct Gateway if configured; fallback to proxy
  const directBase = (typeof window !== 'undefined' && (window as any).__LIT_BASE__)
    || (typeof import_meta !== 'undefined' && (import_meta as any)?.env?.VITE_API_BASE)
    || (typeof process !== 'undefined' && (process as any)?.env?.NEXT_PUBLIC_API_BASE)
    || '';
  const url = String(directBase || '').trim()
    ? `${String(directBase).replace(/\/$/, '')}/public/searchCompanies`
    : '/api/lit/public/searchCompanies';
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input ?? {}),
    signal,
  });
  if (!res.ok) throw new Error(`Search failed: ${res.status}`);
  return res.json() as Promise<{ items: any[]; total: number }>;
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

export async function getFilterOptions(signal?: AbortSignal) {
  const res = await fetch(`/api/lit/public/getFilterOptions`, { method: 'GET', headers: { 'accept': 'application/json' }, signal });
  if (!res.ok) { const t = await res.text().catch(()=> ''); throw new Error(`getFilterOptions failed: ${res.status} ${t}`); }
  return res.json();
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
  const id = row.company_id?.trim()
    ? row.company_id
    : `name:${row.company_name.toLowerCase()}`;
  const qs = new URLSearchParams({
    company_id: id,
    limit: String(limit),
    offset: String(offset),
  }).toString();
  return `/api/lit/public/getCompanyShipments?${qs}`;
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

// The exported searchCompanies above already points to the proxy-backed implementation
