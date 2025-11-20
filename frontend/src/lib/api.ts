import { getGatewayBase } from "@/lib/env";
import {
  CompanyLite,
  ShipmentLite,
  CommandCenterRecord,
} from "@/types/importyeti";
import { normalizeIYCompany, normalizeIYShipment } from "@/lib/normalize";
// Always call via Vercel proxy from the browser to avoid CORS
export const API_BASE = "/api/lit";

const SEARCH_GATEWAY_BASE = API_BASE;
const IY_API_BASE = API_BASE;

export type FilterOptions = {
  origins: string[];
  destinations: string[];
  modes: string[];
  hs: string[];
};

export type CompanyHit = {
  company_id: string;
  company_name: string;
  shipments_12m: number;
  last_activity: string;
  top_routes: string[];
  top_carriers: string[];
};

// ImportYeti shipper search types
export type IyShipperHit = {
  key: string;
  title: string;
  countryCode?: string;
  type?: string;
  address?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  totalShipments?: number;
  mostRecentShipment?: string;
  topSuppliers?: string[];
  website?: string;
  phone?: string;
  domain?: string;
};

export type IySearchMeta = {
  q: string;
  page: number;
  pageSize: number;
  total: number;
  creditsRemaining?: number;
  requestCost?: number;
};

export type IySearchResponse = {
  total: number;
  results: IyShipperHit[];
  meta: IySearchMeta;
};

export type IyRouteTopRoute = {
  route: string;
  shipments: number;
  teu?: number | null;
};

export type IyRouteKpis = {
  topRouteLast12m: string | null;
  mostRecentRoute: string | null;
  sampleSize: number;
  shipmentsLast12m: number;
  teuLast12m: number;
  topRoutesLast12m: IyRouteTopRoute[];
  contact?: IyCompanyContact;
};

export interface IyBolDetail {
  bol_number: string;
  company_name: string;
  company_country_code?: string | null;
  company_main_phone_number?: string | null;
  company_website?: string | null;
  company_contact_info?: {
    emails?: string[];
    phone_numbers?: string[];
  };
  notify_party_contact_info?: {
    emails?: string[];
    phone_numbers?: string[];
  };
}

export interface IyCompanyContact {
  phone?: string;
  email?: string;
  website?: string;
  domain?: string;
}

export type IyShipmentTypeBreakdown = {
  fcl_shipments?: number;
  lcl_shipments?: number;
};

export type IyMonthlyShipment = {
  month: string;
  shipments: number;
  teu?: number;
  fcl_shipments?: number;
  lcl_shipments?: number;
};

export type IyTopLane = {
  origin_port?: string;
  origin_country_code?: string;
  dest_port?: string;
  dest_country_code?: string;
  shipments_12m?: number;
  teu_12m?: number;
};

export type IyCompanyStats = {
  ok: boolean;
  companySlug?: string;
  range?: string;
  shipmentTypeBreakdown?: IyShipmentTypeBreakdown;
  monthlyShipments?: IyMonthlyShipment[];
  topLanes?: IyTopLane[];
  routes?: Array<{
    origin_country_code?: string;
    dest_country_code?: string;
    shipments_12m?: number;
    teu_12m?: number;
  }>;
};

export type SearchResponse<T> = {
  ok: boolean;
  total: number;
  rows: T[];
  results?: T[];
};

export type CompanySearchInput = Partial<{
  q: string;
  origin: string[];
  dest: string[];
  hs: string[];
  mode: string[];
  limit: number;
  offset: number;
}>;

const BASE = "";

export async function getCampaigns(base = API_BASE) {
  const root = (base || "").replace(/\/$/, "");
  try {
    const r = await fetch(`${root}/public/campaigns`, {
      method: "GET",
      headers: { accept: "application/json" },
    });
    if (!r.ok) throw new Error(`bad status ${r.status}`);
    return await r.json();
  } catch (error) {
    console.warn("[api] getCampaigns falling back to mock", error);
    return [];
  }
}

export type SearchPayload = {
  q: string | null;
  origin?: string[];
  dest?: string[];
  hs?: string[];
  limit?: number;
  offset?: number;
};

function normalizeQ(q: unknown) {
  return (q ?? "").toString().trim();
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const pathname = (() => {
      try {
        return new URL(url).pathname;
      } catch {
        return url;
      }
    })();
    throw new Error(`${pathname} ${res.status}: ${text || res.statusText}`);
  }
  return res.json() as Promise<T>;
}

export async function searchCompaniesProxy(payload: SearchPayload) {
  const body = {
    q: payload.q ?? null,
    origin: Array.isArray(payload.origin) ? payload.origin : [],
    dest: Array.isArray(payload.dest) ? payload.dest : [],
    hs: Array.isArray(payload.hs) ? payload.hs : [],
    limit: Number(payload.limit ?? 12),
    offset: Number(payload.offset ?? 0),
  } as const;
  const r = await fetch(`${SEARCH_GATEWAY_BASE}/public/searchCompanies`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      q: body.q,
      origin: null,
      dest: null,
      hs: null,
      limit: body.limit,
      offset: body.offset,
    }),
  });
  if (!r.ok) throw new Error(`searchCompanies ${r.status}`);
  return r.json();
}

export async function getCompanyShipmentsProxy(params: {
  company_id?: string;
  company_name?: string;
  origin?: string[];
  dest?: string[];
  hs?: string[];
  limit?: number;
  offset?: number;
}) {
  const qp = new URLSearchParams();
  if (params.company_id) qp.set("company_id", params.company_id);
  if (params.company_name) qp.set("company_name", params.company_name);
  if (params.origin?.length) qp.set("origin", params.origin.join(","));
  if (params.dest?.length) qp.set("dest", params.dest.join(","));
  if (params.hs?.length) qp.set("hs", params.hs.join(","));
  qp.set("limit", String(params.limit ?? 20));
  qp.set("offset", String(params.offset ?? 0));
  const r = await fetch(
    `${API_BASE}/public/getCompanyShipments?${qp.toString()}`,
  );
  if (!r.ok) throw new Error(`getCompanyShipments ${r.status}`);
  return r.json();
}

export async function getFilterOptions(
  signal?: AbortSignal,
): Promise<FilterOptions> {
  return getFilterOptionsOnce(async (innerSignal) => {
    const res = await fetch(`${API_BASE}/public/getFilterOptions`, {
      method: "GET",
      headers: { accept: "application/json" },
      signal: innerSignal ?? signal,
    });
    if (!res.ok) {
      throw new Error(`filters ${res.status}`);
    }
    const data = await res.json().catch(() => ({}));
    const normalize = (value: unknown): string[] =>
      Array.isArray(value)
        ? value.filter((item): item is string => typeof item === "string")
        : [];
    const normalizedModes = normalize(data?.modes).map((mode) =>
      mode.toLowerCase(),
    );
    return {
      origins: normalize(data?.origins),
      destinations: normalize(data?.destinations),
      modes: normalizedModes,
      hs: normalize(data?.hs),
    };
  }, signal);
}

// Back-compat names expected by some pages
export const searchCompaniesProxyCompat = searchCompaniesProxy;
export const getCompanyShipmentsProxyCompat = getCompanyShipmentsProxy;

// Gateway base (env override → default)
const GW = "/api/lit";

async function j<T>(p: Promise<Response>): Promise<T> {
  const r = await p;
  if (!r.ok) {
    const text = await r.text().catch(() => String(r.status));
    throw new Error(text || String(r.status));
  }
  return r.json() as Promise<T>;
}

// Widgets compatibility endpoints
export async function calcTariff(input: {
  hsCode?: string;
  origin?: string;
  destination?: string;
  valueUsd?: number;
}) {
  const res = await fetch(`${GW}/widgets/tariff/calc`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(input || {}),
  });
  if (!res.ok) throw new Error(`calcTariff ${res.status}`);
  return res.json();
}

export async function generateQuote(input: {
  companyId?: string | number;
  lanes: Array<{ origin: string; destination: string; mode: string }>;
  notes?: string;
}) {
  const res = await fetch(`${GW}/widgets/quote/generate`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(input || {}),
  });
  if (!res.ok) throw new Error(`generateQuote ${res.status}`);
  return res.json();
}

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
  mode: "ocean" | "air";
  origin: string;
  destination: string;
  carrier: string | null;
  value_usd: string | number | null;
  weight_kg: string | number | null;
};

// Company item + KPI extractor tolerant to snake/camel
export type CompanyItem = {
  company_id: string | null;
  company_name: string;
  shipments_12m?: number;
  shipments12m?: number;
  shipments?: number;
  last_activity?: string | null;
  lastActivity?: string | null;
  lastShipmentDate?: string | null;
  origins_top?: string[];
  originsTop?: string[];
  dests_top?: string[];
  destsTop?: string[];
  carriers_top?: string[];
  carriersTop?: string[];
};

export function kpiFrom(item: CompanyItem) {
  const shipments12m = Number(
    item.shipments12m ?? item.shipments_12m ?? item.shipments ?? 0,
  );
  const rawLast: any =
    (item as any).lastActivity ??
    (item as any).last_activity ??
    (item as any).lastShipmentDate;
  const lastActivity =
    rawLast && typeof rawLast === "object" && "value" in rawLast
      ? (rawLast.value ?? null)
      : (rawLast ?? null);
  const originsTop = item.originsTop ?? item.origins_top ?? [];
  const destsTop = item.destsTop ?? item.dests_top ?? [];
  const carriersTop = item.carriersTop ?? item.carriers_top ?? [];
  return { shipments12m, lastActivity, originsTop, destsTop, carriersTop };
}

// Legacy-compatible wrapper that accepts arrays or CSV
export async function postSearchCompanies(payload: any) {
  const res = await fetch(`${SEARCH_GATEWAY_BASE}/public/searchCompanies`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      q: payload?.q ?? null,
      origin: payload?.origin ?? null,
      dest: payload?.dest ?? null,
      hs: payload?.hs ?? null,
      limit: payload?.limit ?? 20,
      offset: payload?.offset ?? 0,
    }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`postSearchCompanies failed: ${res.status} ${t}`);
  }
  return res.json(); // { items, total }
}

function normalizeCompanyHit(entry: any): CompanyHit {
  const ensureArray = (value: unknown): string[] =>
    Array.isArray(value)
      ? value
          .map((item) => {
            if (typeof item === "string") return item;
            if (item && typeof item === "object") {
              if ("route" in item && typeof (item as any).route === "string")
                return (item as any).route as string;
              if ("value" in item && typeof (item as any).value === "string")
                return (item as any).value as string;
              if (
                "carrier" in item &&
                typeof (item as any).carrier === "string"
              )
                return (item as any).carrier as string;
            }
            return null;
          })
          .filter(
            (item): item is string =>
              typeof item === "string" && item.length > 0,
          )
      : [];

  const companyId = (entry as any)?.company_id ?? (entry as any)?.id ?? "";
  const companyName =
    (entry as any)?.company_name ??
    (entry as any)?.name ??
    (entry as any)?.company ??
    "";
  const shipments12m =
    (entry as any)?.shipments_12m ??
    (entry as any)?.shipments ??
    (entry as any)?.kpis?.shipments_12m ??
    0;
  const lastActivity =
    (entry as any)?.last_activity ??
    (entry as any)?.lastActivity ??
    (entry as any)?.kpis?.last_activity ??
    "";

  return {
    company_id:
      typeof companyId === "string" ? companyId : String(companyId ?? ""),
    company_name:
      typeof companyName === "string" && companyName.trim() ? companyName : "—",
    shipments_12m: Number.isFinite(Number(shipments12m))
      ? Number(shipments12m)
      : 0,
    last_activity: typeof lastActivity === "string" ? lastActivity : "",
    top_routes: ensureArray((entry as any)?.top_routes),
    top_carriers: ensureArray((entry as any)?.top_carriers),
  };
}

export async function searchCompanies(
  input: CompanySearchInput = {},
  signal?: AbortSignal,
): Promise<SearchResponse<CompanyHit>> {
  const limitCandidate = Number(input.limit);
  const offsetCandidate = Number(input.offset);
  const limit = Math.max(
    1,
    Math.min(100, Number.isFinite(limitCandidate) ? limitCandidate : 25),
  );
  const offset = Math.max(
    0,
    Number.isFinite(offsetCandidate) ? offsetCandidate : 0,
  );

  const payload = {
    q: typeof input.q === "string" ? input.q.trim() : "",
    origin: Array.isArray(input.origin) ? input.origin : [],
    dest: Array.isArray(input.dest) ? input.dest : [],
    hs: Array.isArray(input.hs) ? input.hs : [],
    mode: Array.isArray(input.mode) ? input.mode : [],
    limit,
    offset,
  };

  const response = await fetch(`${API_BASE}/public/searchCompanies`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
    signal,
  });

  if (!response.ok) {
    throw new Error(`search ${response.status}`);
  }

  const data = await response.json().catch(() => ({}));
  const rawRows = Array.isArray((data as any)?.rows)
    ? (data as any).rows
    : Array.isArray((data as any)?.results)
      ? (data as any).results
      : [];

  const rows = rawRows.map(normalizeCompanyHit);
  const total =
    typeof (data as any)?.total === "number"
      ? (data as any).total
      : rows.length;

  return {
    ok: Boolean((data as any)?.ok ?? true),
    rows,
    results: rows,
    total,
  };
}

async function postIyJson<T>(path: string, body: any): Promise<T> {
  const resp = await fetch(`${IY_API_BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  const json = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw { status: resp.status, ...json };
  }
  return json as T;
}

export type IySearchRow = {
  company_id: string | null;
  name: string | null;
  role: string | null;
  country: string | null;
  address: string | null;
  website: string | null;
  phone: string | null;
  total_shipments: number | null;
  most_recent_shipment: string | null;
  aliases_count: number | null;
  addresses_count: number | null;
  top_suppliers?: string[] | null;
  top_customers?: string[] | null;
};

const IY_COMPANY_KEY_PREFIX = "company/";

function ensureCompanyKey(value: string) {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return "";
  return trimmed.startsWith(IY_COMPANY_KEY_PREFIX)
    ? trimmed
    : `${IY_COMPANY_KEY_PREFIX}${trimmed}`;
}

function deriveDomainCandidate(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;

  if (/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(trimmed)) {
    return trimmed
      .replace(/^https?:\/\//i, "")
      .replace(/^www\./i, "")
      .toLowerCase();
  }

  try {
    const url = new URL(
      trimmed.startsWith("http") ? trimmed : `https://${trimmed}`,
    );
    const host = url.hostname.replace(/^www\./i, "").toLowerCase();
    return host || undefined;
  } catch {
    return undefined;
  }
}

function normalizeIyShipperHit(entry: any): IyShipperHit {
  const rawKey =
    entry?.key ?? entry?.company_id ?? entry?.slug ?? entry?.id ?? null;
  const fallbackTitle =
    (typeof entry?.title === "string" && entry.title.trim()) ||
    (typeof entry?.name === "string" && entry.name.trim()) ||
    "shipper";
  const normalizedKey =
    typeof rawKey === "string" && rawKey.trim()
      ? rawKey.trim()
      : ensureCompanyKey(
          fallbackTitle
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "") || "shipper",
        );

  const normalizeString = (value: unknown) =>
    typeof value === "string" && value.trim().length ? value.trim() : undefined;

  const toNumberOrUndefined = (value: unknown) => {
    const num = Number(value);
    return Number.isFinite(num) ? num : undefined;
  };

  const supplierSource = Array.isArray(entry?.topSuppliers)
    ? entry.topSuppliers
    : Array.isArray(entry?.top_suppliers)
      ? entry.top_suppliers
      : [];
  const topSuppliers = supplierSource
    .map((item: unknown) =>
      typeof item === "string" ? item.trim() : undefined,
    )
    .filter((item): item is string => Boolean(item && item.length));

  const website =
    normalizeString(entry?.company_website) ?? normalizeString(entry?.website);
  const phone =
    normalizeString(entry?.company_main_phone_number) ??
    normalizeString(entry?.phone);
  const domain =
    normalizeString(entry?.domain) ??
    deriveDomainCandidate(entry?.company_website) ??
    deriveDomainCandidate(entry?.website) ??
    undefined;

  return {
    key: normalizedKey,
    title:
      normalizeString(entry?.title) ??
      normalizeString(entry?.name) ??
      fallbackTitle,
    countryCode:
      normalizeString(entry?.countryCode) ??
      normalizeString(entry?.country_code) ??
      normalizeString(entry?.country),
    type: normalizeString(entry?.type),
    address: normalizeString(entry?.address),
    city: normalizeString(entry?.city),
    state: normalizeString(entry?.state),
    postalCode: normalizeString(entry?.postal_code),
    country: normalizeString(entry?.country),
    totalShipments:
      toNumberOrUndefined(entry?.totalShipments) ??
      toNumberOrUndefined(entry?.shipments) ??
      toNumberOrUndefined(entry?.shipments_12m),
    mostRecentShipment:
      normalizeString(entry?.mostRecentShipment) ??
      normalizeString(entry?.last_activity) ??
      normalizeString(entry?.recentShipment),
    topSuppliers,
    website,
    phone,
    domain,
  };
}

function resolveIySearchArray(raw: any): any[] {
  if (Array.isArray(raw?.results)) return raw.results;
  if (Array.isArray(raw?.rows)) return raw.rows;
  if (Array.isArray(raw?.items)) return raw.items;
  if (Array.isArray(raw)) return raw;
  return [];
}

function buildIySearchMeta(
  rawMeta: any,
  fallback: { q: string; page: number; pageSize: number; total: number },
): IySearchMeta {
  const toNumber = (value: unknown, defaultValue: number) => {
    const num = Number(value);
    return Number.isFinite(num) ? num : defaultValue;
  };
  return {
    q: typeof rawMeta?.q === "string" ? rawMeta.q : fallback.q,
    page: toNumber(rawMeta?.page, fallback.page),
    pageSize: toNumber(rawMeta?.pageSize, fallback.pageSize),
    total: toNumber(rawMeta?.total, fallback.total),
    creditsRemaining:
      typeof rawMeta?.creditsRemaining === "number"
        ? rawMeta.creditsRemaining
        : undefined,
    requestCost:
      typeof rawMeta?.requestCost === "number"
        ? rawMeta.requestCost
        : undefined,
  };
}

function coerceIySearchResponse(
  raw: any,
  fallback: { q: string; page: number; pageSize: number },
): IySearchResponse {
  const items = resolveIySearchArray(raw);
  const totalCandidate = raw?.total ?? raw?.meta?.total ?? items.length;
  const total = Number.isFinite(Number(totalCandidate))
    ? Number(totalCandidate)
    : items.length;
  const meta = buildIySearchMeta(raw?.meta ?? {}, { ...fallback, total });

  return {
    total,
    results: items.map(normalizeIyShipperHit),
    meta,
  };
}

export async function iySearch(q: string, limit = 10, offset = 0) {
  const pageSize = Math.max(1, Number.isFinite(limit) ? Number(limit) : 10);
  const computedOffset = Math.max(
    0,
    Number.isFinite(offset) ? Number(offset) : 0,
  );
  const page = Math.floor(computedOffset / pageSize) + 1;
  const payload = await searchShippers({ q, page, pageSize });
  return {
    ok: true,
    rows: payload.results,
    meta: payload.meta,
    total: payload.total,
  };
}

export async function iySearchShippers(
  body: { q: string; limit?: number; offset?: number },
  signal?: AbortSignal,
) {
  const q = typeof body.q === "string" ? body.q.trim() : "";
  const limitCandidate = Number(body.limit);
  const offsetCandidate = Number(body.offset);
  const limit = Math.max(
    1,
    Math.min(100, Number.isFinite(limitCandidate) ? limitCandidate : 25),
  );
  const offset = Math.max(
    0,
    Number.isFinite(offsetCandidate) ? offsetCandidate : 0,
  );

  return fetchJson<any>(`${API_BASE}/public/iy/searchShippers`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ q, limit, offset }),
    signal,
  });
}

export async function iyCompanyBols(
  params: { company_id: string; limit?: number; offset?: number },
  signal?: AbortSignal,
): Promise<{ ok: boolean; data: any; rows: any[]; total: number }> {
  const companyId = ensureCompanyKey(params.company_id);
  if (!companyId) {
    throw new Error("iyCompanyBols requires company_id");
  }
  const search = new URLSearchParams({ company_id: companyId });
  if (params.limit != null) search.set("limit", String(params.limit));
  if (params.offset != null) search.set("offset", String(params.offset));

  const response = await fetch(
    `${API_BASE}/public/iy/companyBols?${search.toString()}`,
    {
      method: "GET",
      headers: { accept: "application/json" },
      signal,
    },
  );

  const text = await response.text().catch(() => "");
  let parsed: unknown = {};
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }

  if (!response.ok) {
    const errorPayload =
      typeof parsed === "object" && parsed !== null ? parsed : {};
    throw { status: response.status, ...errorPayload };
  }

  const data = typeof parsed === "object" && parsed !== null ? parsed : {};
  const rows = Array.isArray((data as any)?.rows)
    ? (data as any).rows
    : Array.isArray(parsed)
      ? (parsed as any[])
      : [];
  const total =
    typeof (data as any)?.total === "number"
      ? (data as any).total
      : rows.length;

  return { ok: Boolean((data as any)?.ok ?? true), data, rows, total };
}

export async function iyCompanyStats(
  params: { company: string; range?: string },
  signal?: AbortSignal,
): Promise<IyCompanyStats | null> {
  const company = (params.company ?? "").trim();
  if (!company) return null;
  const search = new URLSearchParams({ company });
  if (params.range) search.set("range", params.range);
  try {
    return await fetchJson<IyCompanyStats>(
      `${API_BASE}/public/iy/companyStats?${search.toString()}`,
      {
        method: "GET",
        headers: { accept: "application/json" },
        signal,
      },
    );
  } catch (error) {
    console.warn("iyCompanyStats failed", error);
    return null;
  }
}

export async function searchShippers(
  params: { q: string; page?: number; pageSize?: number },
  signal?: AbortSignal,
): Promise<IySearchResponse> {
  const q = typeof params.q === "string" ? params.q.trim() : "";
  const page = Math.max(
    1,
    Number.isFinite(Number(params.page)) ? Number(params.page) : 1,
  );
  const pageSize = Math.max(
    1,
    Math.min(
      100,
      Number.isFinite(Number(params.pageSize)) ? Number(params.pageSize) : 25,
    ),
  );

  if (!q) {
    const meta: IySearchMeta = { q, page, pageSize, total: 0 };
    return { total: 0, results: [], meta };
  }

  const raw = await iySearchShippers(
    { q, limit: pageSize, offset: (page - 1) * pageSize },
    signal,
  );
  return coerceIySearchResponse(raw, { q, page, pageSize });
}

function mapIyRowsToShipments(rows: any[]): ShipmentLite[] {
  return rows.map((row) => {
    const normalized = normalizeIYShipment(row);
    return {
      ...normalized,
      origin_port: row?.origin_port ?? row?.origin ?? row?.Origin_Port ?? null,
      destination_port:
        row?.destination_port ??
        row?.destination ??
        row?.Destination_Port ??
        null,
      origin_country_code:
        row?.origin_country_code ??
        row?.origin_country ??
        row?.Origin_Country_Code ??
        null,
      dest_country_code:
        row?.dest_country_code ??
        row?.dest_country ??
        row?.Destination_Country_Code ??
        null,
      mode: row?.mode ?? row?.transport_mode ?? row?.Mode ?? null,
    };
  });
}

export function deriveContactFromBol(bol: IyBolDetail): IyCompanyContact {
  const phone =
    bol.company_main_phone_number ??
    bol.company_contact_info?.phone_numbers?.[0] ??
    bol.notify_party_contact_info?.phone_numbers?.[0];
  const email =
    bol.company_contact_info?.emails?.[0] ??
    bol.notify_party_contact_info?.emails?.[0];

  let website = bol.company_website ?? undefined;
  if (website) {
    website = website.trim();
    if (!website) {
      website = undefined;
    }
  }
  if (!website && email && email.includes("@")) {
    const [, domainPart] = email.split("@");
    if (domainPart) {
      website = `https://${domainPart.toLowerCase()}`;
    }
  }

  let domain: string | undefined;
  const domainSource = website ?? email;
  if (domainSource) {
    try {
      if (domainSource.includes("@")) {
        const [, host] = domainSource.split("@");
        if (host) {
          domain = host.toLowerCase();
        }
      } else {
        const url = /^https?:\/\//i.test(domainSource)
          ? domainSource
          : `https://${domainSource}`;
        const next = new URL(url).hostname.replace(/^www\./i, "");
        domain = next || undefined;
      }
    } catch {
      // ignore parse errors
    }
  }

  return {
    phone: phone ?? undefined,
    email: email ?? undefined,
    website,
    domain,
  };
}

export type IyCompanyBolsResult = {
  shipments: ShipmentLite[];
  total: number;
  ok: boolean;
  error?: unknown;
};

export async function iyFetchCompanyBols(
  params: { companyKey: string; limit: number; offset: number },
  signal?: AbortSignal,
): Promise<IyCompanyBolsResult> {
  try {
    const payload = await iyCompanyBols(
      {
        company_id: params.companyKey,
        limit: params.limit,
        offset: params.offset,
      },
      signal,
    );
    const shipments = Array.isArray(payload?.rows)
      ? mapIyRowsToShipments(payload.rows)
      : [];
    const total =
      typeof payload?.total === "number" ? payload.total : shipments.length;
    const ok = Boolean((payload as any)?.ok ?? true);
    return { shipments, total, ok };
  } catch (error) {
    console.error("iyFetchCompanyBols", error);
    return { shipments: [], total: 0, ok: false, error };
  }
}

export async function getIyBolDetail(
  bolNumber: string,
  signal?: AbortSignal,
): Promise<IyBolDetail | null> {
  if (!bolNumber) return null;
  const search = encodeURIComponent(bolNumber);
  const res = await fetchJson<{ ok: boolean; bol?: IyBolDetail }>(
    `${API_BASE}/public/iy/bol?number=${search}`,
    {
      method: "GET",
      headers: { accept: "application/json" },
      signal,
    },
  );

  if (!res || !res.bol) {
    return null;
  }

  return res.bol;
}

function buildRouteFromShipment(row: ShipmentLite): string | null {
  const origin =
    row.origin_port || row.origin_country_code || row.shipper_name || null;
  const destination =
    row.destination_port || row.dest_country_code || row.consignee_name || null;
  if (origin && destination) return `${origin} → ${destination}`;
  if (origin) return origin;
  if (destination) return destination;
  return null;
}

export function computeIyRouteKpisFromShipments(
  rows: ShipmentLite[],
): IyRouteKpis {
  if (!Array.isArray(rows) || rows.length === 0) {
    return {
      topRouteLast12m: null,
      mostRecentRoute: null,
      sampleSize: 0,
      shipmentsLast12m: 0,
      teuLast12m: 0,
      topRoutesLast12m: [],
    };
  }
  const now = new Date();
  const cutoff = new Date(now);
  cutoff.setMonth(cutoff.getMonth() - 12);
  const cutoffTime = cutoff.getTime();

  const routeStats = new Map<string, { count: number; teu: number }>();
  let mostRecentRoute: string | null = null;
  let mostRecentTime = 0;
  let shipmentsLast12m = 0;
  let teuLast12m = 0;

  for (const row of rows) {
    const route = buildRouteFromShipment(row);
    const ts = row.date ? new Date(row.date).getTime() : NaN;
    if (!Number.isNaN(ts) && ts > mostRecentTime && route) {
      mostRecentTime = ts;
      mostRecentRoute = route;
    }
    if (!Number.isNaN(ts) && ts >= cutoffTime) {
      shipmentsLast12m += 1;
      const teuContribution = Number.isFinite(Number(row.teu))
        ? Number(row.teu)
        : 0;
      teuLast12m += teuContribution;
      if (route) {
        const current = routeStats.get(route) ?? { count: 0, teu: 0 };
        current.count += 1;
        current.teu += teuContribution;
        routeStats.set(route, current);
      }
    }
  }

  const topRoutes = Array.from(routeStats.entries())
    .sort((a, b) => b[1].count - a[1].count)
    .map(([route, stats]) => ({
      route,
      shipments: stats.count,
      teu: stats.teu || null,
    }));

  return {
    topRouteLast12m: topRoutes[0]?.route ?? null,
    mostRecentRoute,
    sampleSize: rows.length,
    shipmentsLast12m,
    teuLast12m,
    topRoutesLast12m: topRoutes,
  };
}

export async function getIyRouteKpisForCompany(
  params: { companyKey: string; limit?: number; offset?: number },
  signal?: AbortSignal,
): Promise<IyRouteKpis | null> {
  const companyKey = ensureCompanyKey(params.companyKey);
  if (!companyKey) {
    return null;
  }
  const limitCandidate = Number(params.limit);
  const offsetCandidate = Number(params.offset);
  const limit = Math.max(
    25,
    Math.min(500, Number.isFinite(limitCandidate) ? limitCandidate : 200),
  );
  const offset = Math.max(
    0,
    Number.isFinite(offsetCandidate) ? offsetCandidate : 0,
  );
  try {
    const result = await iyFetchCompanyBols(
      { companyKey, limit, offset },
      signal,
    );
    if (!result.ok || result.shipments.length === 0) {
      console.warn("getIyRouteKpisForCompany: no shipments available", {
        companyKey,
        ok: result.ok,
        total: result.total,
      });
      return null;
    }
    const kpis = computeIyRouteKpisFromShipments(result.shipments);
    let contact: IyCompanyContact | undefined;
    const firstBol = result.shipments[0];
    if (firstBol?.bol) {
      try {
        const detail = await getIyBolDetail(firstBol.bol, signal);
        if (detail) {
          contact = deriveContactFromBol(detail);
        }
      } catch (lookupError) {
        console.warn(
          "getIyRouteKpisForCompany contact lookup failed",
          lookupError,
        );
      }
    }
    return {
      ...kpis,
      contact,
    };
  } catch (error) {
    console.error("getIyRouteKpisForCompany", error);
    return null;
  }
}

export async function saveCompany(
  record: CommandCenterRecord,
): Promise<{ saved_id?: string }> {
  const res = await fetch(`${SEARCH_GATEWAY_BASE}/crm/saveCompany`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      company_id: record.company.company_id,
      stage: "prospect",
      provider: record.company.source,
      payload: record,
    }),
  });
  if (!res.ok) {
    throw new Error(`saveCompany failed: ${res.status}`);
  }
  return res.json();
}

export async function listSavedCompanies(): Promise<CommandCenterRecord[]> {
  const res = await fetch(
    `${SEARCH_GATEWAY_BASE}/crm/savedCompanies?stage=prospect`,
    {
      method: "GET",
      headers: { accept: "application/json" },
    },
  );
  if (!res.ok) {
    throw new Error(`listSavedCompanies failed: ${res.status}`);
  }
  const data = await res.json();
  return Array.isArray(data?.rows) ? data.rows : [];
}

export function buildSearchParams(raw: Record<string, any>) {
  const cleaned: Record<string, any> = {};
  for (const [key, value] of Object.entries(raw || {})) {
    if (value === undefined || value === null) continue;
    if (typeof value === "string" && value.trim() === "") continue;
    cleaned[key] = value;
  }
  return cleaned;
}

export async function getCompanyShipments(
  company_id: string,
  opts?: { limit?: number; offset?: number },
) {
  const limitCandidate = Number(opts?.limit);
  const offsetCandidate = Number(opts?.offset);
  const limit = Math.max(
    1,
    Math.min(100, Number.isFinite(limitCandidate) ? limitCandidate : 25),
  );
  const offset = Math.max(
    0,
    Number.isFinite(offsetCandidate) ? offsetCandidate : 0,
  );

  const params = new URLSearchParams({
    company_id,
    limit: String(limit),
    offset: String(offset),
  });

  const response = await fetch(
    `${API_BASE}/public/getCompanyShipments?${params.toString()}`,
  );
  if (!response.ok) {
    throw new Error(`shipments ${response.status}`);
  }
  return response.json();
}

// New helpers per patch: getCompanyDetails, getCompanyShipments (unified signature)
export async function getCompanyDetails(params: {
  company_id?: string;
  fallback_name?: string;
}) {
  const q = new URLSearchParams();
  if (params.company_id) q.set("company_id", params.company_id);
  const url = `/api/lit/public/getCompanyDetails?${q.toString()}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`getCompanyDetails ${r.status}`);
  return r.json();
}

export async function getCompanyShipmentsUnified(params: {
  company_id?: string;
  company_name?: string;
  origin?: string;
  dest?: string;
  hs?: string;
  limit?: number;
  offset?: number;
}) {
  const q = new URLSearchParams();
  if (params.company_id) q.set("company_id", params.company_id);
  if (params.company_name) q.set("company_name", params.company_name);
  if (params.origin) q.set("origin", params.origin);
  if (params.dest) q.set("dest", params.dest);
  if (params.hs) q.set("hs", params.hs);
  q.set("limit", String(params.limit ?? 50));
  q.set("offset", String(params.offset ?? 0));
  const url = `/api/lit/public/getCompanyShipments?${q.toString()}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`getCompanyShipments ${r.status}`);
  const data = await r.json();
  return {
    rows: Array.isArray((data as any)?.rows) ? (data as any).rows : [],
    total: Number((data as any)?.meta?.total ?? (data as any)?.total ?? 0),
  };
}

// Fast KPI endpoint (proxy-first, fallback to Gateway)
export async function getCompanyKpis(
  params: { company_id?: string; company_name?: string },
  signal?: AbortSignal,
) {
  const qp = new URLSearchParams();
  if (params.company_id) qp.set("company_id", params.company_id);
  if (!params.company_id && params.company_name)
    qp.set("company_name", params.company_name);
  const url = `/api/lit/public/getCompanyKpis?${qp.toString()}`;
  try {
    const r = await fetch(url, {
      method: "GET",
      headers: { accept: "application/json" },
      signal,
    });
    const ct = r.headers.get("content-type") || "";
    if (!r.ok || !ct.includes("application/json"))
      throw new Error(String(r.status));
    return await r.json();
  } catch {
    // Fallback to Gateway
    const base = getGatewayBase();
    const u = `${base}/public/getCompanyKpis?${qp.toString()}`;
    const g = await fetch(u, {
      method: "GET",
      headers: { accept: "application/json" },
      signal,
    });
    if (!g.ok) return null;
    return await g.json().catch(() => null);
  }
}

// Saved companies list (for future UI)
export async function getSavedCompanies(signal?: AbortSignal) {
  const url = `/api/lit/crm/savedCompanies`;
  const r = await fetch(url, {
    headers: { accept: "application/json" },
    signal,
  });
  if (!r.ok) return { rows: [] };
  return r.json();
}

// --- Filters singleton cache with 10m TTL ---
let _filtersCache: { data: any; expires: number } | null = null;
let _filtersInflight: Promise<any> | null = null;

function readFiltersLocal(): { data: any; expires: number } | null {
  try {
    if (typeof window === "undefined") return null;
    const raw = window.localStorage.getItem("lit.filters");
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (!obj?.data || !obj?.expires) return null;
    if (Date.now() > obj.expires) return null;
    return obj;
  } catch {
    return null;
  }
}

function writeFiltersLocal(data: any) {
  try {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(
      "lit.filters",
      JSON.stringify({ data, expires: Date.now() + 10 * 60 * 1000 }),
    );
  } catch {}
}

export async function getFilterOptionsOnce(
  fetcher: (signal?: AbortSignal) => Promise<any>,
  signal?: AbortSignal,
) {
  if (_filtersCache && Date.now() < _filtersCache.expires)
    return _filtersCache.data;
  const local = readFiltersLocal();
  if (local) {
    _filtersCache = local;
    return local.data;
  }
  if (_filtersInflight) return _filtersInflight;
  _filtersInflight = (async () => {
    const data = await fetcher(signal);
    _filtersCache = { data, expires: Date.now() + 10 * 60 * 1000 };
    writeFiltersLocal(data);
    _filtersInflight = null;
    return data;
  })();
  return _filtersInflight;
}

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
  if (!res.ok)
    throw new Error(
      `saveCompanyToCrm failed: ${res.status} ${await res.text().catch(() => "")}`,
    );
  return await res.json();
}

export function buildCompanyShipmentsUrl(
  row: { company_id?: string; company_name: string },
  limit = 50,
  offset = 0,
) {
  const params = new URLSearchParams();
  if (row.company_id && row.company_id.trim()) {
    params.set("company_id", row.company_id.trim());
  } else {
    params.set("company_name", row.company_name);
  }
  params.set("limit", String(limit));
  params.set("offset", String(offset));
  return `/api/lit/public/getCompanyShipments?${params.toString()}`;
}

export function getCompanyKey(row: {
  company_id?: string;
  company_name: string;
}) {
  return row.company_id?.trim() || `name:${row.company_name.toLowerCase()}`;
}

export async function createCompany(body: {
  name: string;
  domain?: string;
  street?: string;
  city?: string;
  state?: string;
  postal?: string;
  country?: string;
}) {
  const res = await fetch(`${GW}/crm/company.create`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(body || {}),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`company.create ${res.status}:${t.slice(0, 200)}`);
  }
  return res.json();
}

export async function getCompany(company_id: string) {
  const url = `${GW}/crm/company.get?company_id=${encodeURIComponent(company_id)}`;
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`company.get ${res.status}`);
  return res.json();
}

export async function enrichCompany(payload: { company_id: string }) {
  const res = await fetch(`${GW}/crm/enrichCompany`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`enrichCompany failed: ${res.status} ${t}`);
  }
  return res.json();
}

export async function recallCompany(payload: {
  company_id: string;
  questions?: string[];
}) {
  // Prefer POST; if 405, fallback to GET with query params
  const res = await fetch(`${GW}/ai/recall`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (res.status === 405) {
    const qs = new URLSearchParams({ company_id: payload.company_id });
    const g = await fetch(`${GW}/ai/recall?${qs.toString()}`, {
      method: "GET",
      headers: { accept: "application/json" },
    });
    if (!g.ok) {
      const t = await g.text().catch(() => "");
      throw new Error(`recallCompany failed: ${g.status} ${t}`);
    }
    return g.json();
  }
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`recallCompany failed: ${res.status} ${t}`);
  }
  return res.json();
}

export async function enrichContacts(company_id: string) {
  const res = await fetch(`${GW}/crm/contacts.enrich`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ company_id }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`contacts.enrich ${res.status} ${t}`);
  }
  return res.json();
}

export async function listContacts(company_id: string, dept?: string) {
  const u = new URL(`${GW}/crm/contacts.list`);
  u.searchParams.set("company_id", company_id);
  if (dept) u.searchParams.set("dept", dept);
  const res = await fetch(u.toString(), {
    headers: { accept: "application/json" },
  });
  if (!res.ok) throw new Error(`contacts.list ${res.status}`);
  return res.json();
}

export async function getEmailThreads(company_id: string) {
  const url = `${GW}/crm/email.threads?company_id=${encodeURIComponent(company_id)}`;
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`email.threads ${res.status}`);
  return await res.json();
}

export async function getCalendarEvents(company_id: string) {
  const url = `${GW}/crm/calendar.events?company_id=${encodeURIComponent(company_id)}`;
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`calendar.events ${res.status}`);
  return res.json();
}

export async function createTask(p: {
  company_id: string;
  title: string;
  due_date?: string;
  notes?: string;
}) {
  const res = await fetch(`${GW}/crm/task.create`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(p),
  });
  if (!res.ok) throw new Error(`task.create ${res.status}`);
  return res.json();
}

export async function createAlert(p: {
  company_id: string;
  type: string;
  message: string;
}) {
  const res = await fetch(`${GW}/crm/alert.create`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(p),
  });
  if (!res.ok) throw new Error(`alert.create ${res.status}`);
  return await res.json();
}

export async function saveCampaign(body: Record<string, any>) {
  const res = await fetch(`${GW}/crm/campaigns`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`saveCampaign failed: ${res.status} ${t.slice(0, 200)}`);
  }
  return res.json();
}

export const api = {
  searchCompanies,
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

export async function fetchCompanyLanes(params: {
  company: string;
  month?: string;
  origin?: string;
  dest?: string;
  limit?: number;
  offset?: number;
}) {
  const base =
    (typeof process !== "undefined" &&
      (process as any)?.env?.NEXT_PUBLIC_SEARCH_UNIFIED_URL) ||
    (typeof window !== "undefined" && (window as any).__SEARCH_UNIFIED__) ||
    "";
  const serviceBase = String(base || "").replace(/\/$/, "");
  const res = await fetch(`${serviceBase}/public/companyLanes`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "include",
    body: JSON.stringify(params),
  });
  if (!res.ok) throw new Error(`companyLanes ${res.status}`);
  return res.json();
}

export async function fetchCompanyShipments(params: {
  company: string;
  name_norm?: string;
  mode?: "air" | "ocean";
  origin?: string;
  dest?: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
  offset?: number;
}) {
  const base =
    (typeof process !== "undefined" &&
      (process as any)?.env?.NEXT_PUBLIC_SEARCH_UNIFIED_URL) ||
    (typeof window !== "undefined" && (window as any).__SEARCH_UNIFIED__) ||
    "";
  const serviceBase = String(base || "").replace(/\/$/, "");
  const res = await fetch(`${serviceBase}/public/companyShipments`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "include",
    body: JSON.stringify(params),
  });
  if (!res.ok) throw new Error(`companyShipments ${res.status}`);
  return res.json();
}

export async function getCompanyProfileLushia(q: {
  company_id?: string;
  domain?: string;
  company_name?: string;
}) {
  const params = new URLSearchParams();
  if (q.company_id) params.set("company_id", q.company_id);
  if (q.domain) params.set("domain", q.domain);
  if (q.company_name) params.set("company_name", q.company_name);
  const res = await fetch(
    `/api/lit/public/lushia/company?${params.toString()}`,
    { method: "GET" },
  );
  return res.ok
    ? res.json()
    : ({ error: await res.text(), status: res.status } as any);
}

export async function enrichCompanyLushia(body: {
  company_id?: string;
  domain?: string;
  company_name?: string;
}) {
  const res = await fetch(`/api/lit/public/lushia/enrichCompany`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body || {}),
  });
  return res.ok
    ? res.json()
    : ({ error: await res.text(), status: res.status } as any);
}

export async function listContactsLushia(
  who: { company_id?: string; domain?: string; company_name?: string },
  opts?: { dept?: string; limit?: number; offset?: number },
) {
  const params = new URLSearchParams();
  if (who.company_id) params.set("company_id", who.company_id);
  if (who.domain) params.set("domain", who.domain);
  if (who.company_name) params.set("company_name", who.company_name);
  if (opts?.dept) params.set("dept", opts.dept);
  if (opts?.limit != null) params.set("limit", String(opts.limit));
  if (opts?.offset != null) params.set("offset", String(opts.offset));
  const res = await fetch(
    `/api/lit/public/lushia/contacts?${params.toString()}`,
    { method: "GET" },
  );
  return res.ok
    ? res.json()
    : ({ error: await res.text(), status: res.status } as any);
}
