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

