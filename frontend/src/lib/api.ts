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

export async function getFilterOptions(_input: object = {}, signal?: AbortSignal) {
  return api.get('/public/getFilterOptions', { signal });
}

export type SearchCompaniesInput = { q?: string; mode?: "all"|"ocean"|"air"; filters?: Record<string, any>; dateRange?: { from?: string; to?: string }; pagination?: { limit?: number; offset?: number } };

export async function searchCompanies(body: SearchCompaniesInput, signal?: AbortSignal) {
  // Map UI shape to unified /search API
  const limit = body.pagination?.limit ?? 10;
  const offset = body.pagination?.offset ?? 0;
  const payload = {
    q: body.q ?? "",
    mode: body.mode && body.mode !== "all" ? body.mode : undefined,
    hs: Array.isArray(body.filters?.hs) ? body.filters?.hs : undefined,
    origins: body.filters?.origin ? [body.filters.origin] : undefined,
    destinations: body.filters?.destination ? [body.filters.destination] : undefined,
    carriers: body.filters?.carrier ? [body.filters.carrier] : undefined,
    startDate: body.dateRange?.from || undefined,
    endDate: body.dateRange?.to || undefined,
    page: Math.floor((body.pagination?.offset ?? 0) / (body.pagination?.limit ?? limit)) + 1,
    page_size: limit,
    limit, // keep back-compat in case backend accepts limit/offset
    offset,
  } as const;
  return api.post('/search', payload, { signal });
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

