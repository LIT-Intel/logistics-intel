import { getGatewayBase } from "@/lib/env";
import {
  CompanyLite,
  ShipmentLite,
  CommandCenterRecord,
} from "@/types/importyeti";
import { normalizeIYCompany, normalizeIYShipment } from "@/lib/normalize";

function resolveApiBase() {
  const read = (value: unknown) =>
    typeof value === "string" && value.trim().length ? value.trim() : null;

  try {
    // Prefer Vite/Next public envs at build/runtime
    if (typeof import.meta !== "undefined") {
      const metaEnv = (import.meta as any)?.env;
      const viteBase = read(metaEnv?.VITE_API_BASE);
      if (viteBase) return viteBase;
      const nextPublicBase = read(metaEnv?.NEXT_PUBLIC_API_BASE);
      if (nextPublicBase) return nextPublicBase;
    }
  } catch {
    // ignore import.meta access issues
  }

  if (typeof process !== "undefined" && process.env) {
    const nodeEnvBase = read(process.env.NEXT_PUBLIC_API_BASE);
    if (nodeEnvBase) return nodeEnvBase;
    const legacyEnvBase = read((process.env as any).VITE_API_BASE);
    if (legacyEnvBase) return legacyEnvBase;
  }

  if (typeof window !== "undefined" && (window as any).__API_BASE__) {
    const windowBase = read((window as any).__API_BASE__);
    if (windowBase) return windowBase;
  }

  return "/api/lit";
}

// Always call via Vercel proxy from the browser to avoid CORS
export const API_BASE = resolveApiBase();

const SEARCH_GATEWAY_BASE = API_BASE;
const IY_API_BASE = API_BASE;

export function coerceNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const cleaned = value.replace(/,/g, "").trim();
    if (!cleaned) return null;
    const parsed = Number(cleaned);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

export function toNumberOrNull(input: unknown): number | null {
  if (input == null) return null;
  const n = typeof input === "number" ? input : Number(input);
  return Number.isFinite(n) ? n : null;
}

// Frontend API key for calling the API Gateway
const LIT_GATEWAY_KEY =
  (typeof import.meta !== "undefined" &&
    ((import.meta as any).env?.VITE_LIT_GATEWAY_KEY ||
      (import.meta as any).env?.NEXT_PUBLIC_LIT_GATEWAY_KEY)) ||
  (typeof window !== "undefined" &&
    (window as any).__LIT_GATEWAY_KEY__) ||
  "";

if (typeof window !== "undefined" && !LIT_GATEWAY_KEY) {
  const FLAG = "__LIT_GATEWAY_KEY_MISSING_LOGGED__";
  if (!(window as any)[FLAG]) {
    (window as any)[FLAG] = true;
    console.warn(
      "[LIT] Gateway key is not configured. Set VITE_LIT_GATEWAY_KEY or NEXT_PUBLIC_LIT_GATEWAY_KEY so /crm/saveCompany calls are authenticated.",
    );
  }
}

function withGatewayKey(url: string): string {
  if (!LIT_GATEWAY_KEY) return url;
  if (url.includes("key=")) return url;
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}key=${encodeURIComponent(LIT_GATEWAY_KEY)}`;
}

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

export interface IyShipperHit {
  key: string;
  companyId: string;
  name: string;
  title: string;
  companyKey?: string | null;
  normalizedName?: string | null;
  domain?: string | null;
  website?: string | null;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  country?: string | null;
  countryCode?: string | null;
  totalShipments?: number | null;
  shipmentsLast12m?: number | null;
  teusLast12m?: number | null;
  estSpendLast12m?: number | null;
  mostRecentShipment?: string | null;
  primaryRouteSummary?: string | null;
  primaryRoute?: string | null;
  lastShipmentDate?: string | null;
  topSuppliers?: string[] | null;
}

export type IySearchMeta = {
  q: string;
  page: number;
  pageSize: number;
  creditsRemaining?: number;
  requestCost?: number;
};

export interface IySearchResponse {
  ok: boolean;
  results: IyShipperHit[];
  total: number;
  meta?: IySearchMeta;
}

export type IyRouteTopRoute = {
  route: string;
  shipments: number | null;
  teu?: number | null;
  fclShipments?: number | null;
  lclShipments?: number | null;
  estSpendUsd?: number | null;
};

export interface IyRouteKpis {
  shipmentsLast12m: number | null;
  teuLast12m: number | null;
  estSpendUsd12m: number | null;
  topRouteLast12m: string | null;
  mostRecentRoute: string | null;
  sampleSize: number | null;
  topRoutesLast12m: IyRouteTopRoute[];
  recentTopRoutes?: IyRouteTopRoute[];
  monthlySeries?: IyMonthlySeriesPoint[];
  estSpendUsd?: number | null;
  contact?: IyCompanyContact;
}

export interface IyTimeSeriesPoint {
  month: string;
  fclShipments: number | null;
  lclShipments: number | null;
}

export interface IyMonthlySeriesPoint extends IyTimeSeriesPoint {
  monthLabel: string;
  shipmentsFcl: number;
  shipmentsLcl: number;
  totalShipments: number;
  teu: number;
}

export type IyCompanyContainers = {
  fclShipments12m: number | null;
  lclShipments12m: number | null;
};

export type IyCompanyProfileRoute = {
  label: string | null;
  origin: string | null;
  destination: string | null;
  shipments: number | null;
  teu: number | null;
  lastShipmentDate: string | null;
};

export interface IyCompanyProfile {
  key: string;
  companyId: string;
  name: string;
  title: string;
  domain: string | null;
  website: string | null;
  phoneNumber: string | null;
  phone: string | null;
  address: string | null;
  countryCode: string | null;
  lastShipmentDate: string | null;
  estSpendUsd12m: number | null;
  totalShipments: number | null;
  routeKpis: IyRouteKpis | null;
  timeSeries: IyTimeSeriesPoint[];
  containers: IyCompanyContainers | null;
  country?: string | null;
  topRoutes?: IyCompanyProfileRoute[] | null;
  mostRecentRoute?: IyCompanyProfileRoute | null;
  suppliersSample?: string[] | null;
  containersLoad?: Array<Record<string, any>>;
  rawWebsite?: string | null;
  topSuppliers?: string[] | null;
  // Legacy/raw passthrough fields for compatibility with older UI
  time_series?: Record<string, any>;
  containers_load?: Array<Record<string, any>>;
  top_routes?: Array<Record<string, any>>;
  most_recent_route?: Record<string, any> | null;
  suppliers_sample?: string[];
}

export function getFclShipments12m(
  profile?: IyCompanyProfile | null,
): number | null {
  if (!profile) return null;
  const direct =
    (profile as any).fclShipments12m ?? (profile as any).fcl_shipments_12m;
  const fromContainers = profile.containers
    ? (profile.containers.fclShipments12m ??
        (profile.containers as any).fcl_shipments_12m ??
        (profile.containers as any).fcl ??
        null)
    : null;
  const candidate = direct ?? fromContainers;
  return coerceNumber(candidate);
}

export function getLclShipments12m(
  profile?: IyCompanyProfile | null,
): number | null {
  if (!profile) return null;
  const direct =
    (profile as any).lclShipments12m ?? (profile as any).lcl_shipments_12m;
  const fromContainers = profile.containers
    ? (profile.containers.lclShipments12m ??
        (profile.containers as any).lcl_shipments_12m ??
        (profile.containers as any).lcl ??
        null)
    : null;
  const candidate = direct ?? fromContainers;
  return coerceNumber(candidate);
}

export interface IyBolDetail {
  bol_number: string;
  company_name: string;
  company_country_code?: string | null;
  company_main_phone_number?: string | null;
  company_website?: string | null;
  arrival_date?: string | null;
  entry_port?: string | null;
  exit_port?: string | null;
  origin_port?: string | null;
  destination_port?: string | null;
  total_teu?: number | null;
  container_teu?: number | null;
  container_count?: number | null;
  company_teu_3m?: number | null;
  company_teu_6m?: number | null;
  company_teu_12m?: number | null;
  company_contact_info?: {
    emails?: string[];
    phone_numbers?: string[];
  };
  notify_party_contact_info?: {
    emails?: string[];
    phone_numbers?: string[];
  };
  shipping_rate?: {
    route?: string | null;
    origin_port?: string | null;
    destination_port?: string | null;
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

export function extractCompanySlug(key: string): string {
  if (!key) return "";
  return key.replace(/^company\//i, "");
}

function inferDomainFromSlug(
  companyKeyOrSlug: string | null | undefined,
): string | null {
  if (!companyKeyOrSlug) return null;
  const raw = companyKeyOrSlug.toString().trim().toLowerCase();
  if (!raw) return null;
  const withoutPrefix = raw.replace(/^company\//, "");
  const core = withoutPrefix.split(/[^a-z0-9]+/)[0];
  if (!core) return null;
  return `${core}.com`;
}

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
          .map((item: unknown) => {
            if (typeof item === "string") return item;

            if (item && typeof item === "object") {
              if ("route" in item && typeof (item as any).route === "string") {
                return (item as any).route as string;
              }

              if ("value" in item && typeof (item as any).value === "string") {
                return (item as any).value as string;
              }

              if (
                "carrier" in item &&
                typeof (item as any).carrier === "string"
              ) {
                return (item as any).carrier as string;
              }
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
  const domain =
    (entry as any)?.domain ??
    (entry as any)?.website ??
    deriveDomainCandidate((entry as any)?.website) ??
    null;

  const countryCode =
    (entry as any)?.country_code ??
    (entry as any)?.countryCode ??
    (entry as any)?.origin_country_code ??
    null;

  const address =
    (entry as any)?.address ??
    (entry as any)?.full_address ??
    (entry as any)?.location ??
    null;

  const shipments12m =
    (entry as any)?.shipments_12m ??
    (entry as any)?.shipmentsLast12Months ??
    (entry as any)?.shipments ??
    null;

  const mostRecentShipment =
    (entry as any)?.most_recent_shipment ??
    (entry as any)?.lastShipmentDate ??
    null;

  const aliasesCount =
    typeof (entry as any)?.aliases_count === "number"
      ? (entry as any).aliases_count
      : null;

  const addressesCount =
    typeof (entry as any)?.addresses_count === "number"
      ? (entry as any).addresses_count
      : null;

  const topSuppliers = ensureArray(
    (entry as any)?.top_suppliers ?? (entry as any)?.suppliers,
  );
  const topCustomers = ensureArray(
    (entry as any)?.top_customers ?? (entry as any)?.customers,
  );

  return {
    company_id: companyId,
    company_name: companyName,
    domain,
    country_code: countryCode,
    address,
    shipments_12m: shipments12m,
    most_recent_shipment: mostRecentShipment,
    aliases_count: aliasesCount,
    addresses_count: addressesCount,
    top_suppliers: topSuppliers.length ? topSuppliers : null,
    top_customers: topCustomers.length ? topCustomers : null,
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

export function ensureCompanyKey(value: string) {
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
  const normalizeString = (value: unknown): string | null => {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    return trimmed.length ? trimmed : null;
  };
  const normalizeNumber = (value: unknown): number | null => {
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
  };

  const fallbackName =
    normalizeString(entry?.name) ??
    normalizeString(entry?.title) ??
    normalizeString(entry?.company_name) ??
    "ImportYeti shipper";

  const fallbackKey = ensureCompanyKey(
    (fallbackName || "shipper")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "shipper",
  );

  const idCandidates = [
    entry?.companyId,
    entry?.company_id,
    entry?.key,
    entry?.id,
    entry?.slug,
  ];
  let companyId = fallbackKey;
  for (const candidate of idCandidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      companyId = ensureCompanyKey(candidate);
      break;
    }
  }

  const normalizedName =
    normalizeString(entry?.normalizedName) ??
    normalizeString(entry?.normalized_name) ??
    null;

  const website =
    normalizeString(entry?.website) ??
    normalizeString(entry?.company_website) ??
    null;
  const domain =
    normalizeString(entry?.domain) ??
    deriveDomainCandidate(website ?? undefined) ??
    deriveDomainCandidate(entry?.company_website) ??
    null;
  const phone =
    normalizeString(entry?.phone) ??
    normalizeString(entry?.phoneNumber) ??
    normalizeString(entry?.company_main_phone_number) ??
    null;

  const addressParts = [
    normalizeString(entry?.address),
    normalizeString(entry?.address_line_1),
    normalizeString(entry?.address_line_2),
  ].filter((part): part is string => Boolean(part));
  const address = addressParts.length ? addressParts.join(", ") : null;

  const city = normalizeString(entry?.city);
  const state =
    normalizeString(entry?.state) ?? normalizeString(entry?.province) ?? null;
  const postalCode =
    normalizeString(entry?.postalCode) ??
    normalizeString(entry?.postal_code) ??
    null;
  const country =
    normalizeString(entry?.country) ??
    normalizeString(entry?.country_name) ??
    null;
  const countryCode =
    normalizeString(entry?.countryCode) ??
    normalizeString(entry?.country_code) ??
    null;

  const shipmentsLast12m =
    normalizeNumber(entry?.shipmentsLast12m) ??
    normalizeNumber(entry?.shipments_12m) ??
    normalizeNumber(entry?.shipments12m) ??
    normalizeNumber(entry?.shipments) ??
    null;
  const totalShipments =
    normalizeNumber(entry?.totalShipments) ??
    normalizeNumber(entry?.shipments_total) ??
    shipmentsLast12m;
  const teusLast12m =
    normalizeNumber(entry?.teusLast12m) ??
    normalizeNumber(entry?.teuLast12m) ??
    normalizeNumber(entry?.total_teus) ??
    normalizeNumber(entry?.teu_12m) ??
    null;
  const estSpendLast12m =
    normalizeNumber(entry?.estSpendLast12m) ??
    normalizeNumber(entry?.estimated_spend_12m) ??
    null;

  const primaryRouteSummary =
    normalizeString(entry?.primaryRouteSummary) ??
    normalizeString(entry?.top_route_12m) ??
    normalizeString(entry?.topRouteLast12m) ??
    null;
  const lastShipmentDate =
    normalizeString(entry?.lastShipmentDate) ??
    normalizeString(entry?.mostRecentShipment) ??
    normalizeString(entry?.last_activity) ??
    null;
  const mostRecentShipment =
    normalizeString(entry?.mostRecentShipment) ??
    normalizeString(entry?.lastShipmentDate) ??
    normalizeString(entry?.last_activity) ??
    null;
  const primaryRoute =
    normalizeString(entry?.primaryRoute) ??
    normalizeString(entry?.primary_route) ??
    primaryRouteSummary;

  const companyKey = companyId || fallbackKey;

  return {
    key: companyId,
    companyId,
    name: fallbackName ?? "ImportYeti shipper",
    title:
      normalizeString(entry?.title) ??
      normalizeString(entry?.name) ??
      fallbackName ??
      "ImportYeti shipper",
    normalizedName,
    domain,
    website,
    phone,
    address,
    city,
    state,
    postalCode,
    country,
    countryCode,
    totalShipments,
    shipmentsLast12m,
    teusLast12m,
    estSpendLast12m,
    primaryRouteSummary,
    primaryRoute: primaryRoute ?? null,
    lastShipmentDate,
    mostRecentShipment,
    topSuppliers:
      Array.isArray(entry?.topSuppliers) || Array.isArray(entry?.top_suppliers)
        ? (entry?.topSuppliers ?? entry?.top_suppliers)?.filter(
            (item: unknown): item is string =>
              typeof item === "string" && item.trim().length,
          ) ?? null
        : null,
    companyKey,
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
  fallback: { q: string; page: number; pageSize: number },
): IyShipperSearchMeta {
  const toNumber = (value: unknown, defaultValue: number) => {
    const num = Number(value);
    return Number.isFinite(num) ? num : defaultValue;
  };
  return {
    q: typeof rawMeta?.q === "string" ? rawMeta.q : fallback.q,
    page: toNumber(rawMeta?.page, fallback.page),
    pageSize: toNumber(rawMeta?.pageSize, fallback.pageSize),
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
  const rows = items.map(normalizeIyShipperHit);
  const totalCandidate =
    raw?.total ?? raw?.meta?.total ?? raw?.data?.total ?? rows.length;
  const total = Number.isFinite(Number(totalCandidate))
    ? Number(totalCandidate)
    : rows.length;
  const meta = buildIySearchMeta(raw?.meta ?? {}, fallback);

  return {
    ok: Boolean(raw?.ok ?? true),
    results: rows,
    total,
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
    ok: payload.ok,
    rows: payload.results,
    meta: payload.meta,
    total: payload.total,
  };
}

async function postIySearchShippers(
  body: { q: string; page: number; pageSize: number },
  signal?: AbortSignal,
) {
  return fetchJson<any>(withGatewayKey(`${API_BASE}/public/iy/searchShippers`), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
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

  const limit =
    typeof params.limit === "number" && Number.isFinite(params.limit)
      ? params.limit
      : 100;
  const offset =
    typeof params.offset === "number" && Number.isFinite(params.offset)
      ? params.offset
      : 0;

  const response = await fetch(
    withGatewayKey(`${API_BASE}/public/iy/companyBols`),
    {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        company_id: companyId,
        limit,
        offset,
      }),
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

function normalizeTopSuppliers(raw: any): string[] | null {
  const candidates = raw?.suppliers_sample ?? raw?.top_suppliers;
  if (!Array.isArray(candidates)) return null;
  const values = candidates
    .map((entry: any) => {
      if (typeof entry === "string") return entry.trim();
      if (entry && typeof entry === "object") {
        const name =
          entry.name ??
          entry.supplier_name ??
          entry.company ??
          entry.title ??
          "";
        return typeof name === "string" ? name.trim() : "";
      }
      return "";
    })
    .filter((value: string) => Boolean(value));
  return values.length ? values : null;
}

function normalizeContainers(raw: any): IyCompanyContainers | null {
  const loads = Array.isArray(raw?.containers_load)
    ? raw.containers_load
    : Array.isArray(raw?.containersLoad)
      ? raw.containersLoad
      : null;
  if (!loads) return null;
  const fcl = loads.find(
    (entry: any) =>
      typeof entry?.load_type === "string" && entry.load_type.toUpperCase() === "FCL",
  );
  const lcl = loads.find(
    (entry: any) =>
      typeof entry?.load_type === "string" && entry.load_type.toUpperCase() === "LCL",
  );
  return {
    fclShipments12m: coerceNumber(fcl?.shipments),
    lclShipments12m: coerceNumber(lcl?.shipments),
  };
}

function normalizeTimeSeries(raw: any): IyTimeSeriesPoint[] {
  if (raw?.timeSeries && Array.isArray(raw.timeSeries)) {
    return raw.timeSeries.map((entry: any) => ({
      month: String(entry?.month ?? ""),
      fclShipments: coerceNumber(entry?.fclShipments) ?? 0,
      lclShipments: coerceNumber(entry?.lclShipments) ?? 0,
    }));
  }

  if (raw?.time_series && typeof raw.time_series === "object") {
    const entries = Object.entries(raw.time_series)
      .map(([key, value]) => {
        if (!value || typeof value !== "object") return null;
        const fcl =
          coerceNumber((value as any).fcl_shipments) ??
          coerceNumber((value as any).shipments_fcl) ??
          coerceNumber((value as any).fcl) ??
          0;
        const lcl =
          coerceNumber((value as any).lcl_shipments) ??
          coerceNumber((value as any).shipments_lcl) ??
          coerceNumber((value as any).lcl) ??
          0;
        const parsed = new Date(key);
        const monthLabel = Number.isNaN(parsed.getTime())
          ? key
          : `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}`;
        return {
          month: monthLabel,
          fclShipments: fcl ?? 0,
          lclShipments: lcl ?? 0,
          ts: Number.isNaN(parsed.getTime()) ? Date.now() : parsed.getTime(),
        };
      })
      .filter((entry): entry is { month: string; fclShipments: number; lclShipments: number; ts: number } => Boolean(entry))
      .sort((a, b) => a.ts - b.ts)
      .map(({ month, fclShipments, lclShipments }) => ({
        month,
        fclShipments,
        lclShipments,
      }));
    return entries.slice(-12);
  }

  return [];
}

function normalizeTopRoutes(raw: any): IyRouteTopRoute[] {
  const source =
    raw?.routeKpis?.topRoutesLast12m ??
    raw?.top_routes ??
    raw?.topRoutes ??
    raw?.top_lanes ??
    [];
  if (!Array.isArray(source)) return [];
  return source
    .map((entry: any) => {
      const route =
        entry?.route ??
        entry?.lane ??
        [entry?.origin, entry?.destination]
          .filter((value: unknown): value is string => typeof value === "string")
          .join(" → ") ??
        [
          entry?.origin_port ?? entry?.origin_country ?? entry?.origin_country_code,
          entry?.dest_port ?? entry?.destination_country ?? entry?.dest_country_code,
        ]
          .filter((value: unknown): value is string => typeof value === "string")
          .join(" → ");
      if (!route && !entry?.shipments) return null;
      const shipments =
        coerceNumber(
          entry?.shipments ??
            entry?.total_shipments ??
            entry?.shipments_12m ??
            entry?.shipments12m ??
            entry?.count,
        ) ?? null;
      return {
        route: route || "Route",
        shipments,
        teu: coerceNumber(entry?.teu ?? entry?.teu_12m) ?? null,
        fclShipments:
          coerceNumber(
            entry?.fclShipments ??
              entry?.fcl_shipments ??
              entry?.shipments_fcl ??
              entry?.fcl,
          ) ?? null,
        lclShipments:
          coerceNumber(
            entry?.lclShipments ??
              entry?.lcl_shipments ??
              entry?.shipments_lcl ??
              entry?.lcl,
          ) ?? null,
      };
    })
    .filter((value): value is IyRouteTopRoute => Boolean(value))
    .sort((a, b) => (b.shipments ?? 0) - (a.shipments ?? 0));
}

function normalizeRouteKpis(raw: any): IyRouteKpis | null {
  if (raw?.routeKpis && typeof raw.routeKpis === "object") {
    return {
      shipmentsLast12m: coerceNumber(raw.routeKpis.shipmentsLast12m) ?? null,
      teuLast12m: coerceNumber(raw.routeKpis.teuLast12m) ?? null,
      estSpendUsd12m:
        coerceNumber(
          raw.routeKpis.estSpendUsd12m ??
            raw.routeKpis.est_spend_usd ??
            raw.routeKpis.estSpend,
        ) ?? null,
      topRouteLast12m: raw.routeKpis.topRouteLast12m ?? null,
      mostRecentRoute: raw.routeKpis.mostRecentRoute ?? null,
      sampleSize: coerceNumber(raw.routeKpis.sampleSize) ?? null,
      topRoutesLast12m: Array.isArray(raw.routeKpis.topRoutesLast12m)
        ? (raw.routeKpis.topRoutesLast12m as IyRouteTopRoute[])
        : [],
      recentTopRoutes: Array.isArray(raw.routeKpis.recentTopRoutes)
        ? (raw.routeKpis.recentTopRoutes as IyRouteTopRoute[])
        : [],
    };
  }

  const topRoutes = normalizeTopRoutes(raw);
  if (
    !topRoutes.length &&
    !raw?.total_shipments &&
    !raw?.shipments_12m &&
    !raw?.teu_12m
  ) {
    return null;
  }
  return {
    shipmentsLast12m: coerceNumber(raw.total_shipments ?? raw.shipments_12m) ?? null,
    teuLast12m: coerceNumber(raw.teu_12m ?? raw.teu12m) ?? null,
    estSpendUsd12m:
      coerceNumber(
        raw.estSpendUsd12m ?? raw.est_spend_usd ?? raw.estimated_spend_12m,
      ) ?? null,
    topRouteLast12m: topRoutes[0]?.route ?? null,
    mostRecentRoute:
      raw?.most_recent_route?.route ??
      raw?.most_recent_route?.label ??
      topRoutes[0]?.route ??
      null,
    sampleSize: coerceNumber(raw.sample_size ?? raw.sampleSize) ?? null,
    topRoutesLast12m: topRoutes,
    recentTopRoutes: [],
  };
}

type RawTimeSeriesEntry = {
  shipments?: unknown;
  teu?: unknown;
};

type RawBol = {
  date_formatted?: string;
  Country?: string;
  country_code?: string;
  supplier_address_country?: string;
  supplier_address_country_code?: string;
  supplier_address_location?: string;
  supplier_address_loc?: string;
  company_address_country?: string;
  company_address_country_code?: string;
  company_address_loc?: string;
  TEU?: number | string;
};

function parseIyDate(value: string): Date | null {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (!trimmed) return null;
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(trimmed);
  if (!match) return null;
  const [, dd, mm, yyyy] = match;
  const date = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseBolDate(value: string | undefined): Date | null {
  if (!value) return null;
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value.trim());
  if (!match) return null;
  const [, dd, mm, yyyy] = match;
  const parsed = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function normalizeIyCompanyProfilePayload(
  rawPayload: unknown,
  opts?: { fallbackCompanyKey?: string },
): IyCompanyProfile {
  const isRecord = (value: unknown): value is Record<string, any> =>
    Boolean(value) && typeof value === "object";
  const readString = (value: unknown): string | null => {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    return trimmed.length ? trimmed : null;
  };

  const envelope = isRecord(rawPayload) ? (rawPayload as Record<string, any>) : {};
  const src = isRecord(envelope.data) ? (envelope.data as Record<string, any>) : envelope;

  const fallbackKeyOrName =
    readString(opts?.fallbackCompanyKey) ??
    readString(src.company_id) ??
    readString(src.companyKey) ??
    readString(src.companyId) ??
    readString(src.key) ??
    readString(src.slug) ??
    readString(src.company_name) ??
    readString(src.name) ??
    null;

  const companyId = ensureCompanyKey(fallbackKeyOrName ?? "unknown-company");
  const key = ensureCompanyKey(readString(src.key) ?? companyId);

  const title =
    readString(src.title) ??
    readString(src.name) ??
    readString(src.company_name) ??
    fallbackKeyOrName ??
    "Unknown company";
  const name = readString(src.name) ?? title;
  const website = readString(src.website);
  const domain =
    readString(src.domain) ??
    (website ? deriveDomainCandidate(website) ?? null : null);

  const phoneNumber =
    readString(src.phone_number) ??
    readString(src.phoneNumber) ??
    readString(src.phone) ??
    null;

  const address =
    readString(src.address_plain) ??
    readString(src.address) ??
    readString(src.company_address) ??
    null;

  const country =
    readString(src.country) ?? readString(src.country_name) ?? null;
  const countryCode =
    readString(src.country_code) ??
    readString(src.countryCode) ??
    readString(src.country_iso) ??
    null;

  const totalShipments =
    toNumberOrNull(
      src.total_shipments ?? src.shipments_12m ?? src.shipments12m,
    ) ?? null;

  const lastShipmentDate =
    (isRecord(src.date_range) && readString(src.date_range.end_date)) ??
    readString(src.last_shipment_date) ??
    readString(src.lastShipmentDate) ??
    readString(src.last_activity) ??
    null;

  const containersLoad = Array.isArray(src.containers_load)
    ? src.containers_load
    : [];

  const recentBols = Array.isArray((src as any).recent_bols)
    ? ((src as any).recent_bols as RawBol[])
    : [];

  const buildLaneLabels = (bol: RawBol) => {
    const originCity =
      readString(bol.supplier_address_location) ??
      readString(bol.supplier_address_loc) ??
      readString(bol.Country) ??
      null;
    const originCode =
      readString(bol.supplier_address_country_code) ??
      readString(bol.country_code) ??
      null;
    const destCountry =
      readString(bol.company_address_country) ??
      readString(src.company_address_country) ??
      readString(src.country) ??
      null;
    const destCode =
      readString(bol.company_address_country_code) ??
      readString(src.company_address_country_code) ??
      readString(src.country_code) ??
      null;

    const originLabel = [originCity, originCode]
      .filter((value): value is string => Boolean(value))
      .join(", ");
    const destLabel = [destCountry, destCode]
      .filter((value): value is string => Boolean(value))
      .join(", ");

    const label =
      originLabel && destLabel ? `${originLabel} → ${destLabel}` : null;

    return {
      originLabel: originLabel || null,
      destLabel: destLabel || null,
      label,
    };
  };

  const getShipmentsForLoad = (loadType: string): number | null => {
    const row = containersLoad.find(
      (entry: any) =>
        String(entry?.load_type ?? "")
          .toUpperCase()
          .trim() === loadType.toUpperCase(),
    );
    return row ? toNumberOrNull(row.shipments) : null;
  };

  const fclShipments12m = getShipmentsForLoad("FCL");
  const lclShipments12m = getShipmentsForLoad("LCL");

  const containers: IyCompanyContainers | null =
    fclShipments12m != null || lclShipments12m != null
      ? {
          fclShipments12m: fclShipments12m ?? null,
          lclShipments12m: lclShipments12m ?? null,
        }
      : null;

  const timeSeriesRaw = isRecord(src.time_series)
    ? (src.time_series as Record<string, RawTimeSeriesEntry>)
    : null;

  type SeriesPoint = { date: Date; shipments: number; teu: number };
  const allPoints: SeriesPoint[] = [];

  if (timeSeriesRaw) {
    for (const [label, value] of Object.entries(timeSeriesRaw)) {
      const parsedDate = parseIyDate(label);
      if (!parsedDate) continue;
      const shipments = toNumberOrNull((value as any)?.shipments) ?? 0;
      const teu = toNumberOrNull((value as any)?.teu) ?? 0;
      allPoints.push({ date: parsedDate, shipments, teu });
    }
  }

  allPoints.sort((a, b) => a.date.getTime() - b.date.getTime());

  let shipmentsLast12m: number | null = null;
  let teuLast12m: number | null = null;
  let monthlySeriesPoints: IyMonthlySeriesPoint[] | null = null;

  if (allPoints.length) {
    const lastDate = allPoints[allPoints.length - 1].date;
    const windowStart = new Date(lastDate);
    windowStart.setFullYear(windowStart.getFullYear() - 1);

    const inWindow = allPoints.filter(
      (point) => point.date > windowStart && point.date <= lastDate,
    );

    if (inWindow.length) {
      shipmentsLast12m = inWindow.reduce(
        (sum, point) => sum + point.shipments,
        0,
      );
      teuLast12m = inWindow.reduce((sum, point) => sum + point.teu, 0);

      const totalLoadShipments =
        (fclShipments12m ?? 0) + (lclShipments12m ?? 0);
      const fclShare =
        totalLoadShipments > 0
          ? (fclShipments12m ?? 0) / totalLoadShipments
          : 1;
      const lclShare = 1 - fclShare;

      monthlySeriesPoints = inWindow.map((point) => {
        const fcl = point.shipments * fclShare;
        const lcl = point.shipments * lclShare;
        const monthLabel = `${point.date.getFullYear()}-${String(
          point.date.getMonth() + 1,
        ).padStart(2, "0")}`;
        return {
          month: monthLabel,
          monthLabel,
          fclShipments: fcl,
          lclShipments: lcl,
          shipmentsFcl: fcl,
          shipmentsLcl: lcl,
          totalShipments: point.shipments,
          teu: point.teu,
        };
      });
    }
  }

  const sharedMonthlySeries: IyMonthlySeriesPoint[] =
    monthlySeriesPoints ?? [];

  type LanePoint = {
    date: Date;
    label: string;
    origin: string;
    destination: string;
    teu: number;
  };

  const lanePoints: LanePoint[] = [];

  for (const bol of recentBols) {
    const date = parseBolDate(bol?.date_formatted);
    if (!date) continue;
    const { originLabel, destLabel, label } = buildLaneLabels(bol);
    if (!label || !originLabel || !destLabel) continue;
    const teu = toNumberOrNull(bol.TEU) ?? 0;
    lanePoints.push({
      date,
      label,
      origin: originLabel,
      destination: destLabel,
      teu,
    });
  }

  let topLanes12m: IyCompanyProfileRoute[] = [];
  let recentLanes6m: IyCompanyProfileRoute[] = [];
  let mostRecentRouteLabel: string | null = null;

  if (lanePoints.length) {
    lanePoints.sort((a, b) => a.date.getTime() - b.date.getTime());
    const lastLaneDate = lanePoints[lanePoints.length - 1].date;

    const laneWindow = (months: number) => {
      const start = new Date(lastLaneDate);
      start.setMonth(start.getMonth() - months);
      return lanePoints.filter(
        (point) => point.date > start && point.date <= lastLaneDate,
      );
    };

    const aggregateLanes = (points: LanePoint[]): IyCompanyProfileRoute[] => {
      if (!points.length) return [];
      const map = new Map<
        string,
        {
          label: string;
          origin: string;
          destination: string;
          shipments: number;
          teu: number;
          lastDate: Date;
        }
      >();

      for (const point of points) {
        const existing = map.get(point.label);
        if (existing) {
          existing.shipments += 1;
          existing.teu += point.teu;
          if (point.date > existing.lastDate) {
            existing.lastDate = point.date;
          }
        } else {
          map.set(point.label, {
            label: point.label,
            origin: point.origin,
            destination: point.destination,
            shipments: 1,
            teu: point.teu,
            lastDate: point.date,
          });
        }
      }

      return Array.from(map.values())
        .sort((a, b) => b.shipments - a.shipments)
        .slice(0, 5)
        .map((lane) => {
          const shipmentLabel = lane.shipments.toLocaleString();
          return {
            label: `${lane.label} (${shipmentLabel} shipments)`,
            origin: lane.origin,
            destination: lane.destination,
            shipments: lane.shipments,
            teu: lane.teu,
            lastShipmentDate: lane.lastDate.toISOString(),
          } as IyCompanyProfileRoute;
        });
    };

    topLanes12m = aggregateLanes(laneWindow(12));
    recentLanes6m = aggregateLanes(laneWindow(6));

    const mostRecentPoint = lanePoints[lanePoints.length - 1];
    mostRecentRouteLabel = mostRecentPoint ? mostRecentPoint.label : null;
  }

  const totalShippingCost = toNumberOrNull(src.total_shipping_cost);
  let estSpendUsd12m: number | null = null;

  if (
    totalShippingCost != null &&
    teuLast12m != null &&
    teuLast12m > 0
  ) {
    const containersRaw = Array.isArray(src.containers) ? src.containers : [];
    const totalTeu = containersRaw.reduce((sum: number, row: any) => {
      const teu = toNumberOrNull(row?.teu) ?? 0;
      return sum + teu;
    }, 0);

    if (totalTeu > 0) {
      const costPerTeu = totalShippingCost / totalTeu;
      estSpendUsd12m = Math.round(costPerTeu * teuLast12m);
    }
  }

  let suppliersSample: string[] | null = null;
  if (Array.isArray(src.suppliers_table)) {
    suppliersSample = src.suppliers_table
      .map((row: any) =>
        readString(row?.supplier_name ?? row?.supplier ?? row?.name),
      )
      .filter((value): value is string => Boolean(value))
      .slice(0, 4);
    if (!suppliersSample.length) {
      suppliersSample = null;
    }
  }

  const topSuppliers =
    suppliersSample ?? normalizeTopSuppliers(src) ?? null;

  const mapProfileRouteToTopRoute = (
    lane: IyCompanyProfileRoute,
  ): IyRouteTopRoute => ({
    route: lane.label ?? "",
    shipments: lane.shipments ?? null,
    teu: lane.teu ?? null,
    estSpendUsd: null,
  });

  const topRoutesForKpis: IyRouteTopRoute[] = topLanes12m.map(
    mapProfileRouteToTopRoute,
  );
  const recentTopRoutesForKpis: IyRouteTopRoute[] = recentLanes6m.map(
    mapProfileRouteToTopRoute,
  );

  const routeKpis: IyRouteKpis = {
    shipmentsLast12m,
    teuLast12m,
    estSpendUsd12m,
    topRouteLast12m: topLanes12m[0]?.label ?? null,
    mostRecentRoute: mostRecentRouteLabel ?? null,
    sampleSize: shipmentsLast12m,
    topRoutesLast12m: topRoutesForKpis,
    recentTopRoutes: recentTopRoutesForKpis,
    monthlySeries: sharedMonthlySeries,
    estSpendUsd: estSpendUsd12m,
  };

  const rawTopRoutes = Array.isArray(src.top_routes) ? src.top_routes : [];
  const mostRecentRouteRaw = isRecord(src.most_recent_route)
    ? src.most_recent_route
    : null;

  const normalized: IyCompanyProfile = {
    key,
    companyId,
    name,
    title,
    domain,
    website,
    phoneNumber,
    phone: phoneNumber,
    address,
    countryCode,
    lastShipmentDate,
    estSpendUsd12m,
    totalShipments: totalShipments ?? shipmentsLast12m,
    routeKpis,
    timeSeries: sharedMonthlySeries as IyTimeSeriesPoint[],
    containers: containers ?? normalizeContainers(src),
    country,
    topRoutes: topLanes12m.length ? topLanes12m : null,
    mostRecentRoute: topLanes12m[0] ?? null,
    suppliersSample,
    containersLoad,
    rawWebsite: website,
    topSuppliers,
    time_series: src.time_series,
    containers_load: containersLoad,
    top_routes: rawTopRoutes,
    most_recent_route: mostRecentRouteRaw,
    suppliers_sample: suppliersSample ?? src.suppliers_sample ?? undefined,
  };

  return normalized;
}

function normalizeCompanyProfile(
  rawProfile: any,
  companyKey: string,
): IyCompanyProfile {
  return normalizeIyCompanyProfilePayload(rawProfile, {
    fallbackCompanyKey: companyKey,
  });
}

export async function getIyCompanyProfile({
  companyKey,
  query,
  userGoal,
}: {
  companyKey: string;
  query?: string;
  userGoal?: string;
}): Promise<{ companyProfile: IyCompanyProfile; enrichment: any | null }> {
  const normalizedKey = ensureCompanyKey(companyKey);
  if (!normalizedKey) {
    throw new Error("getIyCompanyProfile: company key is required");
  }

  const url = withGatewayKey(`${SEARCH_GATEWAY_BASE}/public/iy/companyProfile`);
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      companyKey: normalizedKey,
      query: query ?? null,
      user_goal:
        userGoal ??
        "Enrich company profile for LIT Command Center from Import activity",
    }),
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`getIyCompanyProfile ${resp.status}: ${text || resp.statusText}`);
  }

  const json = await resp.json();
  if (!json || !json.companyProfile) {
    throw new Error("getIyCompanyProfile returned no profile");
  }

  const companyProfile = normalizeCompanyProfile(json.companyProfile, normalizedKey);

  return {
    companyProfile,
    enrichment: json?.enrichment ?? null,
  };
}

export async function getIyCompanyBolDetails(
  companyKey: string,
  months = 12,
) {
  const normalizedKey = ensureCompanyKey(companyKey);
  const res = await fetch(
    withGatewayKey(`${SEARCH_GATEWAY_BASE}/public/iy/companyBolDetails`),
    {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        company_id: normalizedKey,
        months,
      }),
    },
  );

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error("getIyCompanyBolDetails failed", res.status, text);
    return { ok: false, rows: [], total: 0 };
  }

  const json = await res.json().catch(() => null);
  if (!json) {
    return { ok: false, rows: [], total: 0 };
  }

  return json;
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
    return {
      ok: true,
      results: [],
      total: 0,
      meta: { q, page, pageSize },
    };
  }

  const raw = await fetchJson<any>(
    withGatewayKey(`${API_BASE}/public/iy/searchShippers`),
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ q, page, pageSize }),
      signal,
    },
  );
  return coerceIySearchResponse(raw, { q, page, pageSize });
}

export const searchIyShippers = searchShippers;

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

export async function getIyBolDetails(
  bolNumbers: string[],
  options?: { limit?: number; concurrency?: number; signal?: AbortSignal },
): Promise<IyBolDetail[]> {
  if (!Array.isArray(bolNumbers) || bolNumbers.length === 0) {
    return [];
  }
  const limit = Math.max(
    1,
    Math.min(options?.limit ?? bolNumbers.length, bolNumbers.length),
  );
  const concurrency = Math.max(1, options?.concurrency ?? 5);
  const numbers = bolNumbers
    .filter(
      (value): value is string =>
        typeof value === "string" && value.trim().length > 0,
    )
    .slice(0, limit);
  const results: IyBolDetail[] = [];

  for (let i = 0; i < numbers.length; i += concurrency) {
    if (options?.signal?.aborted) break;
    const batch = numbers.slice(i, i + concurrency);
    const settled = await Promise.allSettled(
      batch.map((bolNum) => getIyBolDetail(bolNum, options?.signal)),
    );
    for (const outcome of settled) {
      if (options?.signal?.aborted) break;
      if (outcome.status === "fulfilled" && outcome.value) {
        results.push(outcome.value);
      }
    }
  }

  return results;
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
    recentTopRoutes: [],
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

export const getIyRouteKpis = getIyRouteKpisForCompany;

export async function listSavedCompanies(
  stage = "prospect",
): Promise<CommandCenterRecord[]> {
  const res = await fetch(
    withGatewayKey(
      `${SEARCH_GATEWAY_BASE}/crm/savedCompanies?stage=${encodeURIComponent(stage)}`,
    ),
    {
      method: "GET",
      headers: { accept: "application/json" },
    },
  );
  if (!res.ok) {
    throw new Error(`listSavedCompanies failed: ${res.status}`);
  }
  const data = await res.json().catch(() => []);
  if (Array.isArray(data)) {
    return data as CommandCenterRecord[];
  }
  if (Array.isArray((data as any)?.rows)) {
    return (data as any).rows as CommandCenterRecord[];
  }
  if (Array.isArray((data as any)?.data?.rows)) {
    return (data as any).data.rows as CommandCenterRecord[];
  }
  return [];
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

type SaveCompanyToCrmInput =
  | { company: Record<string, any> }
  | Record<string, any>;

// --- CRM / Command Center types -----------------------------

export type CrmSaveRequest = {
  company_id: string;
  stage: string;
  provider: string;
  payload: any;
};

export type CrmSaveResponse = {
  ok: boolean;
  message?: string;
  received?: CrmSaveRequest;
};

const CRM_BASE = API_BASE;

export async function saveCompanyToCrm(
  input: CrmSaveRequest,
): Promise<CrmSaveResponse> {
  const res = await fetch(
    withGatewayKey(`${SEARCH_GATEWAY_BASE}/crm/saveCompany`),
    {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify(input),
    },
  );

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error("saveCompanyToCrm failed", res.status, text);
    return { ok: false, message: text || `HTTP ${res.status}` };
  }

  const json = (await res.json().catch(() => null)) as any;
  return {
    ok: Boolean(json?.ok ?? true),
    message: json?.message ?? "",
    received: json?.received,
  };
}

export type CrmSavedCompany = {
  company_id: string;
  stage?: string;
  provider?: string;
  payload?: {
    name?: string;
    website?: string;
    domain?: string;
    phone?: string;
    country?: string;
    city?: string;
    state?: string;
    shipments_12m?: number;
    teus_12m?: number;
    [key: string]: any;
  };
  saved_at?: string;
};

export type CrmSavedCompaniesResponse = {
  ok: boolean;
  companies: CrmSavedCompany[];
};

export async function getSavedCompanies(
  stage?: string,
): Promise<CrmSavedCompany[]> {
  const url = new URL("/crm/savedCompanies", API_BASE);
  if (stage) url.searchParams.set("stage", stage);

  const resp = await fetch(url.toString(), {
    method: "GET",
    headers: {
      "content-type": "application/json",
    },
  });

  if (!resp.ok) {
    console.error("getSavedCompanies: HTTP", resp.status);
    return [];
  }

  let json: any;
  try {
    json = await resp.json();
  } catch (err) {
    console.error("getSavedCompanies: bad JSON", err);
    return [];
  }

  const raw = json?.companies ?? json?.records ?? json?.data ?? [];

  if (!Array.isArray(raw)) {
    console.error("getSavedCompanies: expected array, got", raw);
    return [];
  }

  return raw as CrmSavedCompany[];
}

export async function saveIyCompanyToCrm(opts: {
  shipper: IyShipperHit;
  profile: IyCompanyProfile | null;
  stage?: string;
  provider?: string;
  source?: string;
}) {
  const rawId =
    opts.shipper.key ??
    opts.shipper.companyId ??
    (opts.shipper as any)?.company_key ??
    "";
  const companyId = ensureCompanyKey(rawId);
  if (!companyId) {
    throw new Error("saveIyCompanyToCrm requires a valid company key");
  }

  const url = withGatewayKey(`${SEARCH_GATEWAY_BASE}/crm/saveCompany`);
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      company_id: companyId,
      stage: opts.stage ?? "prospect",
      provider: opts.provider ?? "iy-dma",
      payload: {
        source: opts.source ?? "importyeti",
        shipper: opts.shipper,
        profile: opts.profile,
      },
    }),
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    console.error("saveIyCompanyToCrm failed", resp.status, text);
    throw new Error(`saveIyCompanyToCrm ${resp.status}`);
  }

  return resp.json().catch(() => ({}));
}

export async function saveCompanyToCommandCenter(opts: {
  shipper: IyShipperHit;
  profile: IyCompanyProfile | null;
  stage?: string;
  source?: string;
}) {
  return saveIyCompanyToCrm(opts);
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
