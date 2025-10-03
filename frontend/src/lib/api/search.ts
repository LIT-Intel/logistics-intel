export type SearchFilters = {
  q?: string;
  origin?: string[]; // ISO2 upper-case: ["CN","US"]
  dest?: string[];
  hs?: string[];
  limit?: number;
  offset?: number;
};

export type SearchCompanyRow = {
  company_id: string;
  name: string;
  kpis: {
    shipments_12m: number;
    last_activity: string | { value: string };
  };
};

export type SearchCompaniesResponse = {
  meta: { total: number; page: number; page_size: number };
  rows: SearchCompanyRow[];
};

const GW =
  process.env.NEXT_PUBLIC_LIT_GATEWAY_BASE ??
  "https://logistics-intel-gateway-2e68g4k3.uc.gateway.dev";

function toCsv(a?: string[]): string {
  return Array.isArray(a) && a.length > 0 ? a.join(",") : "";
}

function clamp(n: unknown, min: number, max: number, dflt: number) {
  const v = Number(n);
  if (Number.isFinite(v)) return Math.min(max, Math.max(min, v));
  return dflt;
}

function buildPayload(f: SearchFilters) {
  const limit = clamp(f.limit, 1, 50, 24);
  const offset = clamp(f.offset, 0, Number.MAX_SAFE_INTEGER, 0);
  return {
    q: (f.q ?? "").trim(),
    origin: toCsv(f.origin),
    dest: toCsv(f.dest),
    hs: toCsv(f.hs),
    limit,
    offset,
  };
}

export async function searchCompanies(filters: SearchFilters): Promise<SearchCompaniesResponse> {
  const payload = buildPayload(filters);
  const res = await fetch(`${GW}/public/searchCompanies`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Search failed: ${res.status} ${text}`);
  }
  return (await res.json()) as SearchCompaniesResponse;
}
