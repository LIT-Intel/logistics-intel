/**
 * Compatibility exports so existing pages/components build.
 * For Vite: read import.meta.env.VITE_API_BASE. Fallback to Gateway host.
 */
const VITE_BASE = (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_API_BASE) || null;
const NEXT_BASE = (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_API_BASE) || null;
const BASE = VITE_BASE || NEXT_BASE || 'https://lit-gw-2e68g4k3.uc.gateway.dev';

export type SearchCompaniesBody = {
  q: string | null;
  origin?: string[];
  dest?: string[];
  hs?: string[];
  limit?: number;
  offset?: number;
};

export async function searchCompanies(body: SearchCompaniesBody) {
  const res = await fetch(`${BASE}/public/searchCompanies`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      q: body.q ?? null,
      origin: body.origin ?? [],
      dest: body.dest ?? [],
      hs: body.hs ?? [],
      limit: body.limit ?? 20,
      offset: body.offset ?? 0
    })
  });
  if (!res.ok) throw new Error(`searchCompanies ${res.status}`);
  return res.json();
}

export async function getCompanyShipments(companyId: string, limit = 10, offset = 0) {
  const url = new URL(`${BASE}/public/getCompanyShipments`, 'http://localhost');
  url.searchParams.set('company_id', companyId);
  url.searchParams.set('limit', String(limit));
  url.searchParams.set('offset', String(offset));
  const res = await fetch(url.toString().replace('http://localhost','')); // keep path+query only
  if (!res.ok) throw new Error(`getCompanyShipments ${res.status}`);
  return res.json();
}

/** Legacy alias */
export const postSearchCompanies = searchCompanies;

/** Minimal getFilterOptions; safe fallback if endpoint not present */
export async function getFilterOptions(): Promise<{ origins: string[]; destinations: string[]; hs: string[]; }> {
  try {
    const res = await fetch(`${BASE}/public/getFilterOptions`, { method: 'GET' });
    if (res.ok) return res.json();
  } catch {}
  return { origins: [], destinations: [], hs: [] };
}

/** Placeholders (wire later) */
export async function calcTariff(_: any): Promise<any> {
  throw new Error('calcTariff not wired yet');
}
export async function generateQuote(_: any): Promise<any> {
  throw new Error('generateQuote not wired yet');
}

/** Generic helper some components import */
export const api = {
  async get(path: string) {
    const res = await fetch(`${BASE}${path}`, { method: 'GET' });
    if (!res.ok) throw new Error(`GET ${path} -> ${res.status}`);
    return res.json();
  },
  async post(path: string, body: any) {
    const res = await fetch(`${BASE}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body ?? {})
    });
    if (!res.ok) throw new Error(`POST ${path} -> ${res.status}`);
    return res.json();
  }
};
