// Backwards-compatible base for legacy helper functions that expect /public
import { auth } from '@/auth/firebaseClient';
const BASE = (() => {
  const envAny = (import.meta as any)?.env || {};
  const base = envAny.VITE_API_BASE || envAny.VITE_PROXY_BASE || "/api/public";
  if (base.endsWith("/public")) return base;
  if (base.endsWith("/public/")) return base.slice(0, -1);
  if (base === "/api/public") return base;
  return base.replace(/\/$/, "") + "/public";
})();

// New generic API client per spec (expects BASE_ORIGIN without /public)
const BASE_ORIGIN: string = (() => {
  const raw = (import.meta as any).env?.VITE_API_BASE || "";
  if (!raw) return BASE.replace(/\/public$/, "");
  return raw.replace(/\/public\/?$/, "");
})();

async function j<T>(p: Promise<Response>): Promise<T> {
  const r = await p;
  if (!r.ok) {
    const text = await r.text().catch(() => String(r.status));
    throw new Error(text || String(r.status));
  }
  return r.json() as Promise<T>;
}

export const api = {
  async get<T>(path: string, init?: RequestInit) {
    const url = `${BASE_ORIGIN}${path}`;
    const token = await auth?.currentUser?.getIdToken?.().catch(() => null);
    const headers = {
      'accept': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers || {}),
    } as Record<string, string>;
    return j<T>(fetch(url, { ...(init || {}), headers, credentials: 'omit', cache: 'no-store' }));
  },
  async post<T>(path: string, body: unknown, init?: RequestInit) {
    const url = `${BASE_ORIGIN}${path}`;
    const token = await auth?.currentUser?.getIdToken?.().catch(() => null);
    const headers = {
      'content-type': 'application/json',
      'accept': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers || {}),
    } as Record<string, string>;
    return j<T>(fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body ?? {}),
      credentials: 'omit',
      cache: 'no-store',
      ...init,
    }));
  },
};

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

// Public API base (robust across Vite/Next)
const API_BASE: string = ((import.meta as any)?.env?.VITE_API_BASE || process.env.NEXT_PUBLIC_API_BASE || '').replace(/\/$/, '');

// New: searchCompanies params (array-based payload)
export type SearchCompaniesParams = {
  q?: string | null;
  mode?: 'AIR' | 'OCEAN' | '' | null;
  origin?: string[];   // ISO2
  dest?: string[];     // ISO2
  hs?: string[];       // array of strings (digit-only recommended)
  limit?: number;
  offset?: number;
};

export async function searchCompanies(params: SearchCompaniesParams) {
  const safeArray = (v?: string[]) => (Array.isArray(v) ? v : []);
  const limit = Math.min(params?.limit ?? 50, 50);
  const offset = params?.offset ?? 0;
  const body = {
    q: params?.q ?? null,
    mode: params?.mode ?? null,
    origin: safeArray(params?.origin),
    dest: safeArray(params?.dest),
    hs: safeArray(params?.hs),
    limit,
    offset,
  } as const;

  let res: Response;
  try {
    res = await fetch(`${API_BASE}/public/searchCompanies`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (e) {
    throw new Error(`network_error:${String(e)}`);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`bad_status:${res.status}:${text.substring(0, 300)}`);
  }

  const json: any = await res.json().catch(() => ({}));
  const total = Number(json?.total ?? 0);
  const items = Array.isArray(json?.items) ? json.items : [];
  return { total, items } as { total: number; items: CompanySearchItem[] };
}

export type SearchCompaniesBody = {
  q?: string;
  mode?: 'air'|'ocean';
  hs?: string[];
  origin?: string[];
  dest?: string[];
  carrier?: string[];
  startDate?: string; // YYYY-MM-DD
  endDate?: string;   // YYYY-MM-DD
  limit: number;
  offset: number;
  company_id?: string;       // accepted for summary lookup
  company_ids?: string[];    // accepted for summary lookup
};

export async function postSearchCompanies(body: SearchCompaniesBody, signal?: AbortSignal): Promise<{ total: number; items: CompanySearchItem[] }> {
  return api.post<{ total: number; items: CompanySearchItem[] }>(
    '/public/searchCompanies',
    body,
    { signal }
  );
}

export async function getCompanyShipments(params: { company_id: string; limit?: number; offset?: number }, signal?: AbortSignal): Promise<{ rows: ShipmentRow[]; total?: number }> {
  const { company_id, limit = 50, offset = 0 } = params;
  const searchParams = new URLSearchParams({ company_id, limit: String(limit), offset: String(offset) });
  return api.get<{ rows: ShipmentRow[]; total?: number }>(`/public/getCompanyShipments?${searchParams.toString()}`, { signal });
}

export async function getFilterOptions(_input: object = {}, signal?: AbortSignal) {
  return api.get('/public/getFilterOptions', { signal });
}

export type SearchCompaniesInput = { q?: string; mode?: "all"|"ocean"|"air"; filters?: Record<string, any>; dateRange?: { from?: string; to?: string }; pagination?: { limit?: number; offset?: number } };

// Removed legacy searchCompanies helper that posted to /search (no longer used)

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

// ------------------------ CRM / Enrich / Recall / Campaigns ------------------------

export async function saveCompanyToCrm(payload: { company_id: string; company_name: string; notes?: string|null; source?: string }) {
  // Primary endpoint per gateway spec
  try {
    const j = await api.post(`/crm/saveCompany`, { ...payload, source: payload.source ?? 'search' });
    return j as any;
    // If 404/405, fall through to company.create
  } catch (_) {}

  // Fallback to company.create (parity path)
  const createRes = await fetch(`${API_BASE}/crm/company.create`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'accept': 'application/json' },
    body: JSON.stringify({ name: payload.company_name })
  });
  if (!createRes.ok) {
    const t = await createRes.text().catch(() => '');
    throw new Error(`company.create ${createRes.status}:${t.slice(0,200)}`);
  }
  const j = await createRes.json().catch(() => ({} as any));
  return { status: 'created', crm_company_id: j?.company_id || j?.id || payload.company_id };
}

export async function enrichCompany(payload: { company_id: string }) {
  return api.post(`/crm/enrich`, payload);
}

export async function recallCompany(payload: { company_id: string; questions?: string[] }) {
  const vendor = (process.env.NEXT_PUBLIC_AI_VENDOR || (import.meta as any)?.env?.VITE_AI_VENDOR || 'gemini');
  const res = await fetch(`${API_BASE}/ai/recall`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'accept': 'application/json', 'x-ai-vendor': String(vendor) },
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`recall ${res.status}:${t.slice(0,200)}`);
  }
  return res.json();
}

export async function saveCampaign(payload: { name: string; company_ids: string[]; channel: 'email'|'linkedin'; persona?: string; template_id?: string; }) {
  const res = await fetch(`${API_BASE}/crm/campaigns`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'accept': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`saveCampaign ${res.status}:${t.slice(0,200)}`);
  }
  return res.json();
}

// Company create/get (manual create parity)
export async function createCompany(body: { name: string; domain?: string; street?: string; city?: string; state?: string; postal?: string; country?: string }) {
  const res = await fetch(`${API_BASE}/crm/company.create`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'accept': 'application/json' },
    body: JSON.stringify(body || {})
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`company.create ${res.status}:${t.slice(0,200)}`);
  }
  return res.json();
}

export async function getCompany(company_id: string) {
  const url = `${API_BASE}/crm/company.get?company_id=${encodeURIComponent(company_id)}`;
  const res = await fetch(url, { headers: { 'accept': 'application/json' } });
  if (!res.ok) throw new Error(`company.get ${res.status}`);
  return res.json();
}

export async function enrichContacts(company_id: string) {
  return api.post(`/crm/contacts.enrich`, { company_id });
}

export async function listContacts(company_id: string, dept?: string) {
  const u = new URL(`${API_BASE}/crm/contacts.list`);
  u.searchParams.set('company_id', company_id);
  if (dept) u.searchParams.set('dept', dept);
  const res = await fetch(u.toString(), { headers: { 'accept': 'application/json' } });
  if (!res.ok) throw new Error(`contacts.list ${res.status}`);
  return res.json();
}

export async function getEmailThreads(company_id: string) {
  const url = `${API_BASE}/crm/email.threads?company_id=${encodeURIComponent(company_id)}`;
  const res = await fetch(url, { headers: { 'accept': 'application/json' } });
  if (!res.ok) throw new Error(`email.threads ${res.status}`);
  return res.json();
}

export async function getCalendarEvents(company_id: string) {
  const url = `${API_BASE}/crm/calendar.events?company_id=${encodeURIComponent(company_id)}`;
  const res = await fetch(url, { headers: { 'accept': 'application/json' } });
  if (!res.ok) throw new Error(`calendar.events ${res.status}`);
  return res.json();
}

export async function createTask(p: { company_id: string; title: string; due_date?: string; notes?: string }) {
  const res = await fetch(`${API_BASE}/crm/task.create`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'accept': 'application/json' },
    body: JSON.stringify(p)
  });
  if (!res.ok) throw new Error(`task.create ${res.status}`);
  return res.json();
}

export async function createAlert(p: { company_id: string; type: string; message: string }) {
  const res = await fetch(`${API_BASE}/crm/alert.create`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'accept': 'application/json' },
    body: JSON.stringify(p)
  });
  if (!res.ok) throw new Error(`alert.create ${res.status}`);
  return res.json();
}

