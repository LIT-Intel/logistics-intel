// frontend/src/lib/api.ts
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

// ---- Compatibility named exports (legacy callers expect these) ----

// Old name used in some components; proxy to new search
export async function postSearchCompanies(payload: any) {
  return _searchCompanies(payload);
}

// Filters for the search UI
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

// Company shipments drawer
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

// Enrichment (thin wrapper; endpoint name may vary across envs)
export async function enrichCompany(body: { company_id: string }) {
  const res = await fetch(`${GW}/crm/enrichCompany`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  // tolerate 404/501 gracefully for envs without CRM service
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`enrichCompany failed: ${res.status} ${txt}`);
  }
  return await res.json();
}

// Campaign save (compat; adjust route when CRM endpoint is finalized)
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

// Save company to CRM (compat)
export async function saveCompanyToCrm(payload: {
  company_id: string;
  company_name: string;
  notes?: string | null;
  source?: string;
}) {
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

// Derive simple display KPIs from a company search row or summary
export function kpiFrom(input: any): {
  shipments12m: number;
  lastActivity: string | null;
  topRoute?: string;
  topCarrier?: string;
} {
  if (!input) return { shipments12m: 0, lastActivity: null };
  const shipments12m = Number(input.shipments_12m ?? input.shipments ?? 0) || 0;
  const lastActivity =
    typeof input.last_activity === "string"
      ? input.last_activity
      : input.lastShipmentDate || null;
  const topRoute =
    Array.isArray(input.top_routes) && input.top_routes.length
      ? input.top_routes[0]
      : Array.isArray(input.originsTop) && Array.isArray(input.destsTop)
      ? `${input.originsTop[0]?.v || ""} → ${input.destsTop[0]?.v || ""}`.trim()
      : undefined;
  const topCarrier = Array.isArray(input.top_carriers)
    ? input.top_carriers[0]
    : Array.isArray(input.carriersTop)
    ? input.carriersTop[0]?.v
    : undefined;
  return { shipments12m, lastActivity, topRoute, topCarrier };
}

// ---- New consolidated API object (current code uses this) ----
export const api = {
  searchCompanies: _searchCompanies,
  getFilterOptions,
  getCompanyShipments,
  enrichCompany,
  saveCampaign,
  saveCompanyToCrm,
  kpiFrom, // also available via named import
};

// Also export the new search by name for TSX pages that import it directly
export { _searchCompanies as searchCompanies };
