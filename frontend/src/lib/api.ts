// src/lib/api.ts
import * as Search from "@/lib/api/search";

const GW =
  (import.meta as any).env?.VITE_LIT_GATEWAY_BASE ||
  process.env.NEXT_PUBLIC_LIT_GATEWAY_BASE ||
  "https://logistics-intel-gateway-2e68g4k3.uc.gateway.dev";

// --- Named exports expected by existing components ---
export async function postSearchCompanies(filters: Parameters<typeof Search.searchCompanies>[0]) {
  return Search.searchCompanies(filters);
}

export async function getCompanyShipments(company_id: string, limit = 10, offset = 0) {
  const u = new URL(`${GW}/public/getCompanyShipments`);
  u.searchParams.set("company_id", company_id);
  u.searchParams.set("limit", String(limit));
  u.searchParams.set("offset", String(offset));
  const res = await fetch(u.toString(), { method: "GET" });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`getCompanyShipments failed: ${res.status} ${text}`);
  }
  return res.json();
}

// Minimal pass-through to existing CRM endpoint used in this app.
// (If your backend expects a different shape/route, this keeps the build green and still works with current logs.)
export async function enrichCompany(payload: any) {
  const res = await fetch(`${GW}/crm/saveCompany`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload ?? {}),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`enrichCompany failed: ${res.status} ${text}`);
  }
  return res.json();
}

// --- Aggregated API object used by new pages ---
export const api = {
  searchCompanies: Search.searchCompanies,
};

// Re-export types used across the app
export type {
  SearchFilters,
  SearchCompaniesResponse,
  SearchCompanyRow,
} from "@/lib/api/search";
