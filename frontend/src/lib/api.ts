import { getGatewayBase } from '@/lib/env';

export type SearchCompaniesParams = {
  q?: string | null;
  mode?: 'air' | 'ocean';
  hs?: string | string[];
  origin?: string[];
  dest?: string[];
  carrier?: string[];
  startDate?: string;
  endDate?: string;
  limit?: number;
  offset?: number;
};

const BASE = getGatewayBase();

async function fetchOk<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`searchCompanies failed ${res.status}${text ? ` — ${text}` : ''}`);
  }
  return res.json() as Promise<T>;
}

export async function getFilterOptions(signal?: AbortSignal) {
  return fetchOk<{ modes?: string[]; origins?: string[]; dests?: string[] }>(
    `${BASE}/public/getFilterOptions`,
    { method: 'GET', signal }
  );
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

  const body: Record<string, any> = {
    q: (q ?? '').toString().trim(),
    limit: Math.max(1, Math.min(50, Number(limit))),
    offset: Math.max(0, Number(offset)),
  };

  if (mode) body.mode = mode;
  if (hs) body.hs = Array.isArray(hs) ? hs : hs.split(',').map(s => s.trim()).filter(Boolean);
  if (origin?.length) body.origin = origin;
  if (dest?.length) body.dest = dest;
  if (carrier?.length) body.carrier = carrier;
  if (startDate) body.startDate = startDate;
  if (endDate) body.endDate = endDate;

  return fetchOk<{
    meta: { total: number; page: number; page_size: number };
    rows: Array<{
      company_id: string;
      company_name: string;
      shipments_12m: number | null;
      last_activity: string | null;
      top_routes?: Array<{ route?: string; origin_country?: string; dest_country?: string }>;
      top_carriers?: Array<{ carrier?: string }>;
    }>;
  }>(`${BASE}/public/searchCompanies`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
}
