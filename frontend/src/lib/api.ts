import { searchCompanies as _searchCompanies } from "@/lib/api/search";
export type {
  SearchFilters,
  SearchCompaniesResponse,
  SearchCompanyRow,
} from "@/lib/api/search";

// Gateway base (env override → fallback to default)
const GW =
  (import.meta as any).env?.VITE_LIT_GATEWAY_BASE ||
  (globalThis as any).process?.env?.NEXT_PUBLIC_LIT_GATEWAY_BASE ||
  "https://logistics-intel-gateway-2e68g4k3.uc.gateway.dev";

// ---- Compatibility named exports ----
export async function postSearchCompanies(payload: any) {
  return _searchCompanies(payload);
}

export async function getFilterOptions(): Promise<{
  modes: string[];
  origins: string[];
  destinations: string[];
  date_min: string | null;
  date_max: string | null;
}> {
  const res = await fetch(`${GW}/public/getFilterOptions`, {
    method: "GET",
    headers: { "content-type": "application/json" },
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`getFilterOptions failed: ${res.status} ${txt}`);
  }
  return await res.json();
}

export async function getCompanyShipments(opts: {
  company_id: string;
  limit?: number;
  offset?: number;
}) {
  const limit = Math.max(1, Math.min(100, Number(opts.limit ?? 20)));
  const offset = Math.max(0, Number(opts.offset ?? 0));
  const qs = new URLSearchParams({
    company_id: opts.company_id,
    limit: String(limit),
    offset: String(offset),
  });
  const res = await fetch(`${GW}/public/getCompanyShipments?${qs.toString()}`, {
    method: "GET",
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`getCompanyShipments failed: ${res.status} ${txt}`);
  }
  return await res.json();
}

export async function enrichCompany(body: { company_id: string }) {
  const res = await fetch(`${GW}/crm/enrichCompany`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`enrichCompany failed: ${res.status} ${txt}`);
  }
  return await res.json();
}

export async function recallCompany(body: { company_id: string; questions?: string[] }) {
  const res = await fetch(`${GW}/ai/recall`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`recallCompany failed: ${res.status} ${txt}`);
  }
  return await res.json();
}

export async function saveCampaign(body: Record<string, any>) {
  const res = await fetch(`${GW}/crm/campaigns`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`saveCampaign failed: ${res.status} ${txt}`);
  }
  return await res.json();
}

export async function saveCompanyToCrm(payload: { company_id: string; company_name: string; notes?: string|null; source?: string }) {
  const res = await fetch(`${GW}/crm/saveCompany`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...payload, source: payload.source ?? "search" }),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`saveCompanyToCrm failed: ${res.status} ${txt}`);
  }
  return await res.json();
}

// New consolidated API object
export const api = {
  searchCompanies: _searchCompanies,
  getFilterOptions,
  getCompanyShipments,
  enrichCompany,
  recallCompany,
  saveCampaign,
  saveCompanyToCrm,
};

// Also export the new search by name for TSX pages that import it directly
export { _searchCompanies as searchCompanies };