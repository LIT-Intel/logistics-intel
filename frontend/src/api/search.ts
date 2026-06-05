/**
 * Search domain — leads search + filter discovery.
 *
 * Routes through Supabase edge functions (`searchLeads`) and the gateway
 * proxy (`searchCompanies_index`, `getFilterOptions_index`, `searchShipments`).
 * The gateway calls keep their existing `httpCall` wrappers — they're not
 * Supabase edge functions and don't share the JWT-via-anon-key gateway model.
 */
import { invokeEdge } from "./_client";

export interface PulseSearchResult {
  id: string;
  name: string;
  domain: string;
  city: string;
  country: string;
  industry: string;
  employee_count: string | number;
  annual_revenue: string | number;
  contacts: unknown[];
  source: string;
}

export interface SearchLeadsRequest {
  q?: string;
  mode?: "AIR" | "OCEAN" | "all";
  hs?: string[];
  limit?: number;
  offset?: number;
  filters?: Record<string, unknown>;
}

export interface SearchLeadsResponse {
  ok: boolean;
  status?: number;
  error?: string | null;
  data: {
    results: PulseSearchResult[];
    total: number;
    [k: string]: unknown;
  };
}

function normalizeLeadResults(raw: unknown): PulseSearchResult[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item: any, index) => ({
    id: item?.id ?? item?.company_id ?? item?.domain ?? item?.name ?? `pulse-${index}`,
    name: item?.name ?? item?.company_name ?? item?.title ?? "Unknown Company",
    domain: item?.domain ?? item?.website ?? item?.company_domain ?? "",
    city: item?.city ?? item?.hq_city ?? item?.location_city ?? "",
    country: item?.country ?? item?.hq_country ?? item?.location_country ?? "",
    industry: item?.industry ?? item?.industry_name ?? "",
    employee_count: item?.employee_count ?? item?.employees ?? item?.employeeCount ?? "",
    annual_revenue: item?.annual_revenue ?? item?.revenue ?? "",
    contacts: Array.isArray(item?.contacts) ? item.contacts : [],
    source: item?.source ?? "pulse",
  }));
}

/**
 * Search leads via the `searchLeads` edge function. Returns normalized result
 * rows regardless of which response shape the function returns.
 */
export async function searchLeads(
  req: SearchLeadsRequest = {},
): Promise<SearchLeadsResponse> {
  const raw = await invokeEdge<any>("searchLeads", req);
  const data = raw?.data ?? raw ?? {};
  const rawResults =
    data?.results ?? data?.data?.results ?? data?.items ?? raw?.results ?? [];
  return {
    ok: raw?.ok ?? data?.ok ?? true,
    status: raw?.status ?? 200,
    error: raw?.error ?? data?.error ?? null,
    data: {
      ...data,
      results: normalizeLeadResults(rawResults),
      total: data?.total ?? normalizeLeadResults(rawResults).length,
    },
  };
}
