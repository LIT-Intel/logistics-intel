// Backwards-compatible base for legacy helper functions that expect /public
import { auth } from '@/auth/firebaseClient';
export type {
  SearchFilters,
  SearchCompaniesResponse,
  SearchCompanyRow,
} from "@/lib/api/search";

const GW =
  (import.meta as any).env?.VITE_LIT_GATEWAY_BASE ||
  (globalThis as any).process?.env?.NEXT_PUBLIC_LIT_GATEWAY_BASE ||
  "https://logistics-intel-gateway-2e68g4k3.uc.gateway.dev";

// Legacy compatibility
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
  const res = await fetch(`${GW}/public/getFilterOptions`, { method: "GET", headers: { "content-type": "application/json" } });
  if (!res.ok) throw new Error(`getFilterOptions failed: ${res.status} ${await res.text().catch(()=> "")}`);
  return await res.json();
}

export async function getCompanyShipments(opts: { company_id: string; limit?: number; offset?: number; }) {
  const limit = Math.max(1, Math.min(100, Number(opts.limit ?? 20)));
  const offset = Math.max(0, Number(opts.offset ?? 0));
  const qs = new URLSearchParams({ company_id: opts.company_id, limit: String(limit), offset: String(offset) });
  const res = await fetch(`${GW}/public/getCompanyShipments?${qs.toString()}`, { method: "GET" });
  if (!res.ok) throw new Error(`getCompanyShipments failed: ${res.status} ${await res.text().catch(()=> "")}`);
  return await res.json();
}

export async function enrichCompany(body: { company_id: string }) {
  const res = await fetch(`${GW}/crm/enrichCompany`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`enrichCompany failed: ${res.status} ${await res.text().catch(()=> "")}`);
  return await res.json();
}

export async function recallCompany(body: { company_id: string; questions?: string[] }) {
  const res = await fetch(`${GW}/ai/recall`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`recallCompany failed: ${res.status} ${await res.text().catch(()=> "")}`);
  return await res.json();
}

export async function saveCampaign(body: Record<string, any>) {
  const res = await fetch(`${GW}/crm/campaigns`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`saveCampaign failed: ${res.status} ${await res.text().catch(()=> "")}`);
  return await res.json();
}

export async function saveCompanyToCrm(payload: { company_id: string; company_name: string; notes?: string | null; source?: string; }) {
  const res = await fetch(`${GW}/crm/saveCompany`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...payload, source: payload.source ?? "search" }) });
  if (!res.ok) throw new Error(`saveCompanyToCrm failed: ${res.status} ${await res.text().catch(()=> "")}`);
  return await res.json();
}

export async function createCompany(body: { name: string; domain?: string; street?: string; city?: string; state?: string; postal?: string; country?: string; }) {
  const res = await fetch(`${GW}/crm/company.create`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body || {}) });
  if (!res.ok) throw new Error(`company.create failed: ${res.status} ${(await res.text().catch(()=> "")).slice(0,200)}`);
  return await res.json();
}

export async function getEmailThreads(company_id: string) {
  const u = `${GW}/crm/email.threads?company_id=${encodeURIComponent(company_id)}`;
  const res = await fetch(u, { headers: { "accept": "application/json" } });
  if (!res.ok) throw new Error(`email.threads ${res.status}`);
  return await res.json();
}

export async function getCalendarEvents(company_id: string) {
  const u = `${GW}/crm/calendar.events?company_id=${encodeURIComponent(company_id)}`;
  const res = await fetch(u, { headers: { "accept": "application/json" } });
  if (!res.ok) throw new Error(`calendar.events ${res.status}`);
  return await res.json();
}

export async function createAlert(p: { company_id: string; type: string; message: string }) {
  const res = await fetch(`${GW}/crm/alert.create`, { method: "POST", headers: { "content-type": "application/json", "accept": "application/json" }, body: JSON.stringify(p) });
  if (!res.ok) throw new Error(`alert.create ${res.status}`);
  return await res.json();
}

// Derive simple display KPIs (used by CompanySearchCard.jsx)
export function kpiFrom(input: any): { shipments12m: number; lastActivity: string | null; topRoute?: string; topCarrier?: string; } {
  if (!input) return { shipments12m: 0, lastActivity: null };
  const shipments12m = Number(input.shipments_12m ?? input.shipments ?? 0) || 0;
  const lastActivity = typeof input.last_activity === "string" ? input.last_activity : (input.lastShipmentDate || null);
  const topRoute = (Array.isArray(input.top_routes) && input.top_routes.length)
    ? input.top_routes[0]
    : (Array.isArray(input.originsTop) && Array.isArray(input.destsTop) ? `${input.originsTop[0]?.v || ""} → ${input.destsTop[0]?.v || ""}`.trim() : undefined);
  const topCarrier = Array.isArray(input.top_carriers) ? input.top_carriers[0] : (Array.isArray(input.carriersTop) ? input.carriersTop[0]?.v : undefined);
  return { shipments12m, lastActivity, topRoute, topCarrier };
}

// Consolidated API object for callers using api.*
export const api = {
  searchCompanies: _searchCompanies,
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

// Also export the new search by name for TSX pages that import it directly
export { _searchCompanies as searchCompanies };
