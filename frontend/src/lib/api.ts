import { getGatewayBase } from "@/lib/env";
import {
  CompanyLite,
  ShipmentLite,
  CommandCenterRecord,
} from "@/types/importyeti";
import {
  ImportYetiRawPayload,
  CompanySnapshotResponse,
} from "@/types/importyeti-raw";
import { normalizeIYCompany, normalizeIYShipment } from "@/lib/normalize";
import { supabase } from "@/lib/supabase";

// Supabase Edge Functions configuration
const SUPABASE_URL = typeof import.meta !== "undefined"
  ? (import.meta as any).env?.VITE_SUPABASE_URL
  : "";

/**
 * Get authentication headers for Supabase Edge Functions
 * CRITICAL: Always use this for Edge Function calls
 */
async function getAuthHeaders() {
  const { data: { session }, error } = await supabase.auth.getSession();

  if (error || !session?.access_token) {
    throw new Error("No active Supabase session");
  }

  return {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${session.access_token}`,
  };
}
import {
  isDevMode,
  devGetSavedCompanies,
  devSaveCompany,
  devGetCompanyDetail,
  devSearchCompanies,
  devGetCompanyProfile,
  devGetCompanyBols,
  devSearchShippers,
  devEnrichContacts,
  devGetContacts,
  devGetCampaigns,
  devCreateCampaign,
  devAddCompanyToCampaign,
  devGetRfpContext,
  devGenerateRfp,
  devGetFilterOptions,
} from "@/lib/apiDev";

export function getCommandCenterAvailableYears(
  profile: IyCompanyProfile | null | undefined,
): number[] {
  if (!profile) return [];

  const years = new Set<number>();

  if (Array.isArray(profile.timeSeries)) {
    for (const point of profile.timeSeries) {
      const year = Number(point?.year);
      if (Number.isFinite(year) && year > 0) {
        years.add(year);
      }
    }
  }

  if (Array.isArray(profile.recentBols)) {
    for (const bol of profile.recentBols) {
      const rawDate =
        (bol as any)?.bill_of_lading_date ||
        (bol as any)?.bill_of_lading_date_formatted ||
        bol?.date ||
        (bol as any)?.arrival_date ||
        bol?.raw?.bill_of_lading_date ||
        bol?.raw?.arrival_date ||
        null;

      if (!rawDate) continue;

      const parsed = new Date(rawDate);
      if (!Number.isNaN(parsed.getTime())) {
        years.add(parsed.getFullYear());
      }
    }
  }

  return Array.from(years).sort((a, b) => b - a);
}

function monthName(monthIndex: number): string {
  return new Date(2000, monthIndex, 1).toLocaleString("en-US", { month: "short" });
}


function getBolDate(bol?: IyRecentBol | null): Date | null {
  const rawDate =
    bol?.date ||
    bol?.dateObj ||
    (bol?.raw as any)?.bill_of_lading_date ||
    (bol?.raw as any)?.bill_of_lading_date_formatted ||
    (bol?.raw as any)?.arrival_date ||
    null;

  if (!rawDate) return null;
  const parsed = rawDate instanceof Date ? rawDate : new Date(rawDate);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getEntrySpend(bol?: IyRecentBol | null): number {
  const raw = bol?.raw as any;
  return (
    coerceNumber(bol?.shippingCost) ??
    coerceNumber(raw?.shippingCost) ??
    coerceNumber(raw?.shipping_cost) ??
    coerceNumber(raw?.estimated_shipping_cost) ??
    coerceNumber(raw?.estSpendUsd) ??
    0
  );
}

function getEntryCarrier(bol?: IyRecentBol | null): string | null {
  const raw = bol?.raw as any;
  const value =
    raw?.carrier ||
    raw?.carrier_name ||
    raw?.shipping_line ||
    raw?.vessel_operator ||
    raw?.steamship_line ||
    null;
  if (typeof value !== "string") return null;
  const cleaned = value.trim();
  if (!cleaned || ["null", "undefined", "unknown", "n/a", "na"].includes(cleaned.toLowerCase())) {
    return null;
  }
  return cleaned;
}

function getEntryProduct(bol?: IyRecentBol | null): string | null {
  const raw = bol?.raw as any;
  const value =
    raw?.product_description ||
    raw?.Product_Description ||
    raw?.product_name ||
    raw?.description ||
    raw?.commodity ||
    null;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function getEntryHsCode(bol?: IyRecentBol | null): string | null {
  const raw = bol?.raw as any;
  const value =
    raw?.hs_code ||
    raw?.hsCode ||
    raw?.HS_Code ||
    raw?.product_hs_code ||
    null;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}



function resolveApiBase() {
  const read = (value: unknown) =>
    typeof value === "string" && value.trim().length ? value.trim() : null;

  let candidate: string | null = null;

  try {
    // Prefer Vite/Next public envs at build/runtime
    if (typeof import.meta !== "undefined") {
      const metaEnv = (import.meta as any)?.env;
      candidate = read(metaEnv?.VITE_API_BASE) ?? read(metaEnv?.NEXT_PUBLIC_API_BASE);
    }
  } catch {
    // ignore import.meta access issues
  }

  if (!candidate && typeof process !== "undefined" && process.env) {
    candidate = read(process.env.NEXT_PUBLIC_API_BASE) ?? read((process.env as any).VITE_API_BASE);
  }

  if (!candidate && typeof window !== "undefined" && (window as any).__API_BASE__) {
    candidate = read((window as any).__API_BASE__);
  }

  return candidate || "/api/lit";
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
  shipments_12m: number | null;
  last_activity?: string | null;
  top_routes?: string[] | null;
  top_carriers?: string[] | null;
  domain?: string | null;
  country_code?: string | null;
  address?: string | null;
  most_recent_shipment?: string | null;
  aliases_count?: number | null;
  addresses_count?: number | null;
  top_suppliers?: string[] | null;
  top_customers?: string[] | null;
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
  latestYearShipments?: number | null;
  latestYearTeu?: number | null;
  currentYearShipments?: number | null;
  currentYearTeu?: number | null;
  topContainerLength?: string | null;
  fclShipments12m?: number | null;
  lclShipments12m?: number | null;
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
};

export interface IyRouteKpis {
  shipmentsLast12m: number | null;
  teuLast12m: number | null;
  estSpendUsd12m: number | null;
  topRouteLast12m: string | null;
  mostRecentRoute: string | null;
  sampleSize: number | null;
  topRoutesLast12m: IyRouteTopRoute[];
}

export interface IyTimeSeriesPoint {
  month: string;
  year: number | null;
  shipments: number | null;
  fclShipments: number | null;
  lclShipments: number | null;
  teu: number | null;
  estSpendUsd: number | null;
  lastShipmentDate: string | null;
}

export interface IyRecentBol {
  bolNumber: string | null;
  date: string | null;
  dateObj: Date | null;
  teu: number | null;
  containersCount: number | null;
  lcl: boolean | null;
  shippingCost: number | null;
  supplier: string | null;
  supplierCountry: string | null;
  company: string | null;
  companyCountry: string | null;
  origin: string | null;
  destination: string | null;
  route: string | null;
  raw: Record<string, any>;
}

export type IyCompanyContainers = {
  fclShipments12m: number | null;
  lclShipments12m: number | null;
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
  country?: string | null;
  lastShipmentDate: string | null;
  estSpendUsd12m: number | null;
  estSpendCoveragePct?: number | null;
  estSpendUsd?: number | null;
  totalShipments: number | null;
  totalShipmentsAllTime?: number | null;
  totalTeuAllTime?: number | null;
  latestYearShipments?: number | null;
  latestYearTeu?: number | null;
  currentYearShipments?: number | null;
  currentYearTeu?: number | null;
  topContainerLength?: string | null;
  topContainerCount?: number | null;
  topContainerShipments?: number | null;
  topContainerTeu?: number | null;
  routeKpis: IyRouteKpis | null;
  timeSeries: IyTimeSeriesPoint[];
  recentBols: IyRecentBol[];
  containers: IyCompanyContainers | null;
  topSuppliers?: string[] | null;
  monthly_shipments?: Array<Record<string, any>> | null;
  monthly_volumes?: Record<string, any> | null;
  recent_bols?: Array<Record<string, any>> | null;
  monthly_totals?: Array<Record<string, any>> | null;
  yearly_totals?: Array<Record<string, any>> | null;
  container_lengths_breakdown?: Array<Record<string, any>> | null;
  time_series?: Record<string, any>;
  containers_load?: Array<Record<string, any>>;
  top_routes?: Array<Record<string, any>>;
  most_recent_route?: Record<string, any> | null;
  suppliers_sample?: string[];
  fcl_shipments_all_time?: number | null;
  lcl_shipments_all_time?: number | null;
  fcl_shipments_perc?: number | null;
  lcl_shipments_perc?: number | null;
  // Freightos benchmark rate for company's active lane
  freightosRate?: {
    code: string;
    lane: string;
    ratePerTeu: number;
    currency?: string;
    mode?: string;
    equipment?: string;
  } | null;
  // Monthly activity series for charts and trend analysis
  monthlyActivity?: Array<{
    date: string;
    month: string;
    year: number;
    shipments: number;
    teu: number;
    fcl: number;
    lcl: number;
  }> | null;
  // 12-month TEU volume (convenience field, may duplicate latestYearTeu)
  teu12m?: number | null;
  // Top 3-5 routes for quick reference
  topRoutes?: Array<{
    route: string;
    shipments: number;
    teu: number;
    percentage: number;
  }> | null;
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
  if (isDevMode()) {
    return devGetCampaigns();
  }

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
  if (isDevMode()) {
    return devGetFilterOptions();
  }

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

// Gateway base (env override â default)
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

export function normalizeCompanyIdToSlug(input: string): string {
  if (!input) return "";
  const trimmed = input.trim();
  const stripped = trimmed.startsWith(IY_COMPANY_KEY_PREFIX)
    ? trimmed.slice(IY_COMPANY_KEY_PREFIX.length)
    : trimmed;
  const lowercased = stripped.toLowerCase();
  const replaced = lowercased.replace(/[\s_.]+/g, "-");
  const cleaned = replaced.replace(/[^a-z0-9-]/g, "");
  const collapsed = cleaned.replace(/-{2,}/g, "-");
  const trimmed_edges = collapsed.replace(/^-+|-+$/g, "");
  return trimmed_edges || "unknown";
}

export function ensureCompanyKey(value: string) {
  const slug = normalizeCompanyIdToSlug(value);
  return slug.startsWith(IY_COMPANY_KEY_PREFIX)
    ? slug
    : `${IY_COMPANY_KEY_PREFIX}${slug}`;
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

function normalizeMonthLabel(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}$/.test(trimmed)) return trimmed;
  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) {
    return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}`;
  }
  return null;
}

function getCurrentYear(): number {
  return new Date().getFullYear();
}

function buildYearMetricsFromSnapshot(entry: any) {
  const monthlyTotals = Array.isArray(entry?.monthly_totals) ? entry.monthly_totals : [];
  const yearlyTotals = Array.isArray(entry?.yearly_totals) ? entry.yearly_totals : [];
  const currentYear = getCurrentYear();

  let latestYear: number | null = null;
  let latestYearShipments: number | null = null;
  let latestYearTeu: number | null = null;
  let currentYearShipments: number | null = null;
  let currentYearTeu: number | null = null;

  if (yearlyTotals.length > 0) {
    const sorted = [...yearlyTotals]
      .map((row: any) => ({
        year: coerceNumber(row?.year),
        shipments: coerceNumber(row?.shipments) ?? 0,
        teu: coerceNumber(row?.teu) ?? 0,
      }))
      .filter((row) => row.year != null)
      .sort((a, b) => Number(b.year) - Number(a.year));

    if (sorted.length > 0) {
      latestYear = sorted[0].year;
      latestYearShipments = sorted[0].shipments;
      latestYearTeu = sorted[0].teu;
    }

    const currentRow = sorted.find((row) => Number(row.year) === currentYear);
    if (currentRow) {
      currentYearShipments = currentRow.shipments;
      currentYearTeu = currentRow.teu;
    }
  }

  if (monthlyTotals.length > 0) {
    const byYear = new Map<number, { shipments: number; teu: number }>();
    for (const row of monthlyTotals) {
      const year = coerceNumber((row as any)?.year);
      if (year == null) continue;
      const current = byYear.get(year) || { shipments: 0, teu: 0 };
      current.shipments += coerceNumber((row as any)?.shipments) ?? 0;
      current.teu += coerceNumber((row as any)?.teu) ?? 0;
      byYear.set(year, current);
    }

    const years = [...byYear.keys()].sort((a, b) => b - a);
    if (years.length > 0) {
      latestYear = years[0];
      latestYearShipments = byYear.get(years[0])?.shipments ?? latestYearShipments;
      latestYearTeu = byYear.get(years[0])?.teu ?? latestYearTeu;
    }
    if (byYear.has(currentYear)) {
      currentYearShipments = byYear.get(currentYear)?.shipments ?? currentYearShipments;
      currentYearTeu = byYear.get(currentYear)?.teu ?? currentYearTeu;
    }
  }

  return {
    latestYear,
    latestYearShipments,
    latestYearTeu,
    currentYearShipments,
    currentYearTeu,
  };
}

function estimateSpendFromBenchmark(params: {
  shipmentsLast12m?: number | null;
  teuLast12m?: number | null;
  routeKpis?: any;
  profileData?: any;
}): number | null {
  const teu =
    coerceNumber(params.teuLast12m) ??
    coerceNumber(params.routeKpis?.teuLast12m) ??
    coerceNumber(params.profileData?.teu_last_12m) ??
    null;

  const shipments =
    coerceNumber(params.shipmentsLast12m) ??
    coerceNumber(params.routeKpis?.shipmentsLast12m) ??
    coerceNumber(params.profileData?.shipments_last_12m) ??
    null;

  if (teu != null && teu > 0) {
    const benchmarkUsdPerTeu = 3100;
    return Math.round(teu * benchmarkUsdPerTeu);
  }

  if (shipments != null && shipments > 0) {
    const benchmarkUsdPerShipment = 1850;
    return Math.round(shipments * benchmarkUsdPerShipment);
  }

  return null;
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
    normalizeNumber(entry?.shipments_last_12m) ??
    normalizeNumber(entry?.shipments) ??
    null;

  const totalShipments =
    normalizeNumber(entry?.totalShipments) ??
    normalizeNumber(entry?.shipments_total) ??
    normalizeNumber(entry?.total_shipments_all_time) ??
    normalizeNumber(entry?.total_shipments) ??
    shipmentsLast12m;

  const teusLast12m =
    normalizeNumber(entry?.teusLast12m) ??
    normalizeNumber(entry?.teuLast12m) ??
    normalizeNumber(entry?.teu_last_12m) ??
    normalizeNumber(entry?.total_teus) ??
    normalizeNumber(entry?.teu_12m) ??
    null;

  const routeKpis = entry?.routeKpis ?? entry?.route_kpis ?? null;

  const spendCoveragePct =
    normalizeNumber(entry?.estSpendCoveragePct) ??
    normalizeNumber(entry?.est_spend_coverage_pct) ??
    normalizeNumber(entry?.spend_coverage_pct) ??
    null;

  const rawSpend =
    normalizeNumber(entry?.estSpendLast12m) ??
    normalizeNumber(entry?.estimated_spend_12m) ??
    normalizeNumber(entry?.est_spend_12m) ??
    normalizeNumber(entry?.estSpendUsd12m) ??
    normalizeNumber(routeKpis?.estSpendUsd12m) ??
    null;

  const benchmarkSpend = estimateSpendFromBenchmark({
    shipmentsLast12m,
    teuLast12m: teusLast12m,
    routeKpis,
    profileData: entry,
  });

  const estSpendLast12m =
    rawSpend != null && rawSpend > 0 && (spendCoveragePct == null || spendCoveragePct >= 60)
      ? rawSpend
      : benchmarkSpend;

  const primaryRouteSummary =
    normalizeString(entry?.primaryRouteSummary) ??
    normalizeString(entry?.top_route_12m) ??
    normalizeString(entry?.topRouteLast12m) ??
    normalizeString(routeKpis?.topRouteLast12m) ??
    null;

  const lastShipmentDate =
    normalizeString(entry?.lastShipmentDate) ??
    normalizeString(entry?.mostRecentShipment) ??
    normalizeString(entry?.last_activity) ??
    normalizeString(entry?.last_shipment_date) ??
    null;

  const mostRecentShipment =
    normalizeString(entry?.mostRecentShipment) ??
    normalizeString(entry?.lastShipmentDate) ??
    normalizeString(entry?.last_activity) ??
    normalizeString(entry?.last_shipment_date) ??
    null;

  const primaryRoute =
    normalizeString(entry?.primaryRoute) ??
    normalizeString(entry?.primary_route) ??
    primaryRouteSummary;

  const companyKey = companyId || fallbackKey;
  const yearMetrics = buildYearMetricsFromSnapshot(entry);

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
    latestYearShipments: yearMetrics.latestYearShipments,
    latestYearTeu: yearMetrics.latestYearTeu,
    currentYearShipments: yearMetrics.currentYearShipments,
    currentYearTeu: yearMetrics.currentYearTeu,
    topContainerLength:
      normalizeString(entry?.top_container_length) ??
      normalizeString(entry?.topContainerLength) ??
      null,
    fclShipments12m:
      normalizeNumber(entry?.fcl_count_12m) ??
      normalizeNumber(entry?.fcl_count) ??
      normalizeNumber(entry?.fclShipments12m) ??
      null,
    lclShipments12m:
      normalizeNumber(entry?.lcl_count_12m) ??
      normalizeNumber(entry?.lcl_count) ??
      normalizeNumber(entry?.lclShipments12m) ??
      null,
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
  // Edge function returns { ok: true, rows: [...] }
  if (Array.isArray(raw?.rows)) return raw.rows;
  // ImportYeti API returns { data: [...] }
  if (Array.isArray(raw?.data)) return raw.data;
  // Fallback to other common shapes
  if (Array.isArray(raw?.results)) return raw.results;
  if (Array.isArray(raw?.items)) return raw.items;
  // Direct array
  if (Array.isArray(raw)) return raw;
  return [];
}

function buildIySearchMeta(
  rawMeta: any,
  fallback: { q: string; page: number; pageSize: number },
): IySearchMeta {
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
) {
  // Handle edge function response shape: { ok: true, rows: [...], page, pageSize, total }
  const items = resolveIySearchArray(raw);
  const rows = items.map(normalizeIyShipperHit);

  // Resolve total from various possible locations
  const totalCandidate =
    raw?.total ?? raw?.meta?.total ?? raw?.data?.total ?? rows.length;
  const total = Number.isFinite(Number(totalCandidate))
    ? Number(totalCandidate)
    : rows.length;

  // Build metadata
  const meta = buildIySearchMeta(raw?.meta ?? {}, fallback);

  return {
    ok: Boolean(raw?.ok ?? true),
    results: rows,
    total,
    meta,
  };
}
  
export async function iyCompanyBols(
  params: {
    company_id: string;
    limit?: number;
    offset?: number;
    start_date?: string;
    end_date?: string;
  },
  signal?: AbortSignal,
) {
  const companySlug = normalizeCompanyIdToSlug(params.company_id);
  if (!companySlug) {
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

  const body: any = {
    action: "companyBols",
    company_id: companySlug,
    limit,
    offset,
  };

  if (params.start_date) {
    body.start_date = params.start_date;
  }
  if (params.end_date) {
    body.end_date = params.end_date;
  }

  const { data: responseData, error } = await supabase.functions.invoke(
    "importyeti-proxy",
    {
      body,
    }
  );

  if (error) {
    console.error("ImportYeti companyBols error:", error);
    throw new Error(`companyBols failed: ${error.message || "Unknown error"}`);
  }

  const parsed = responseData;
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

export interface CompanySnapshot {
  company_id: string;
  company_name: string;
  country?: string;
  city?: string;
  website?: string;
  total_shipments: number;
  total_teu: number;
  est_spend: number;
  fcl_count: number;
  lcl_count: number;
  last_shipment_date: string | null;
  trend: 'up' | 'flat' | 'down';
  top_ports: Array<{ port: string; count: number }>;
  monthly_volumes: Record<string, { fcl: number; lcl: number }>;
  shipments_last_12m: number;
}

export async function fetchCompanySnapshot(
  companyKey: string,
  signal?: AbortSignal
): Promise<CompanySnapshotResponse | null> {
  const companySlug = normalizeCompanyIdToSlug(companyKey);
  if (!companySlug) {
    console.error("[fetchCompanySnapshot] Invalid company key:", companyKey);
    return null;
  }

  console.log("[fetchCompanySnapshot] Fetching snapshot for:", companySlug);

  try {
    const { data: responseData, error } = await supabase.functions.invoke(
      "importyeti-proxy",
      {
        body: {
          action: "company",
          company_id: companySlug,
        },
      }
    );

    if (error) {
      console.error("[fetchCompanySnapshot] Error:", error);
      throw new Error(`Snapshot fetch failed: ${error.message || "Unknown error"}`);
    }

    console.log("[fetchCompanySnapshot] Response:", {
      ok: responseData?.ok,
      source: responseData?.source,
      hasSnapshot: !!responseData?.snapshot,
      hasRaw: !!responseData?.raw
    });

    if (!responseData || !responseData.ok || !responseData.snapshot) {
      console.warn("[fetchCompanySnapshot] No snapshot data");
      return null;
    }

    console.log("ââââââââââ RAW PAYLOAD INSPECTION ââââââââââ");
    console.log("[RAW PAYLOAD] Full structure:", responseData.raw);
    console.log("[RAW PAYLOAD] Top-level keys:", Object.keys(responseData.raw || {}));

    if (responseData.raw?.data) {
      console.log("[RAW PAYLOAD] Data keys:", Object.keys(responseData.raw.data));
      console.log("[RAW PAYLOAD] Total shipments:", responseData.raw.data.total_shipments);
      console.log("[RAW PAYLOAD] Recent BOLs count:", responseData.raw.data.recent_bols?.length);
      console.log("[RAW PAYLOAD] Sample BOL:", responseData.raw.data.recent_bols?.[0]);
      console.log("[RAW PAYLOAD] AVG TEU per month:", responseData.raw.data.avg_teu_per_month);
      console.log("[RAW PAYLOAD] Total shipping cost:", responseData.raw.data.total_shipping_cost);
      console.log("[RAW PAYLOAD] Company info:", {
        name: responseData.raw.data.name,
        title: responseData.raw.data.title,
        website: responseData.raw.data.website,
        phone: responseData.raw.data.phone,
        country: responseData.raw.data.country,
        address: responseData.raw.data.address_plain
      });
    } else {
      console.log("[RAW PAYLOAD] Direct keys (no nested data):", Object.keys(responseData.raw || {}));
    }
    console.log("ââââââââââââââââââââââââââââââââââââââââââ");

    return {
      ok: responseData.ok,
      source: responseData.source,
      snapshot: responseData.snapshot,
      raw: responseData.raw
    };
  } catch (error) {
    console.error("[fetchCompanySnapshot] Fatal error:", error);
    return null;
  }
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
      `/api/importyeti/companyStats?${search.toString()}`,
      {
        method: "POST",
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
    fclShipments12m: coerceNumber(fcl?.shipments) ?? coerceNumber(fcl?.shipments_12m),
    lclShipments12m: coerceNumber(lcl?.shipments) ?? coerceNumber(lcl?.shipments_12m),
  };
}
  
function normalizeTimeSeries(raw: any): IyTimeSeriesPoint[] {
  const normalizeMonthLabel = (value: unknown): string | null => {
    if (typeof value !== "string" || !value.trim()) return null;
    const trimmed = value.trim();
    if (/^\d{4}-\d{2}$/.test(trimmed)) return trimmed;
    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) {
      return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}`;
    }
    return null;
  };

  const toPoint = (monthKey: string, value: any): IyTimeSeriesPoint => {
    const fcl =
      coerceNumber(value?.fcl_shipments) ??
      coerceNumber(value?.fclShipments) ??
      coerceNumber(value?.fcl_count) ??
      coerceNumber(value?.fcl) ??
      null;
    const lcl =
      coerceNumber(value?.lcl_shipments) ??
      coerceNumber(value?.lclShipments) ??
      coerceNumber(value?.lcl_count) ??
      coerceNumber(value?.lcl) ??
      null;
    const shipments =
      coerceNumber(value?.shipments) ??
      coerceNumber(value?.total_shipments) ??
      ((fcl != null || lcl != null) ? ((fcl ?? 0) + (lcl ?? 0)) : null);

    return {
      month: monthKey,
      year: coerceNumber(monthKey.slice(0, 4)),
      shipments,
      fclShipments: fcl,
      lclShipments: lcl,
      teu:
        coerceNumber(value?.teu) ??
        coerceNumber(value?.TEU) ??
        coerceNumber(value?.total_teu) ??
        null,
      estSpendUsd:
        coerceNumber(value?.est_spend_usd) ??
        coerceNumber(value?.estSpendUsd) ??
        coerceNumber(value?.shipping_cost) ??
        coerceNumber(value?.est_spend) ??
        null,
      lastShipmentDate:
        typeof value?.last_shipment_date === "string"
          ? value.last_shipment_date
          : typeof value?.lastShipmentDate === "string"
            ? value.lastShipmentDate
            : null,
    };
  };

  const monthlyShipments = Array.isArray(raw?.monthly_shipments) ? raw.monthly_shipments : null;
  if (monthlyShipments && monthlyShipments.length > 0) {
    return monthlyShipments
      .map((entry: any) => {
        const monthKey = normalizeMonthLabel(entry?.month ?? entry?.period ?? entry?.date);
        if (!monthKey) return null;
        return toPoint(monthKey, entry);
      })
      .filter((value): value is IyTimeSeriesPoint => Boolean(value))
      .sort((a, b) => a.month.localeCompare(b.month));
  }

  const monthlyVolumes = raw?.monthly_volumes;
  if (monthlyVolumes && typeof monthlyVolumes === "object" && !Array.isArray(monthlyVolumes)) {
    return Object.entries(monthlyVolumes)
      .map(([key, value]) => {
        const monthKey = normalizeMonthLabel(key);
        if (!monthKey || !value || typeof value !== "object") return null;
        return toPoint(monthKey, value);
      })
      .filter((value): value is IyTimeSeriesPoint => Boolean(value))
      .sort((a, b) => a.month.localeCompare(b.month));
  }

  if (raw?.time_series && typeof raw.time_series === "object" && !Array.isArray(raw.time_series)) {
    return Object.entries(raw.time_series)
      .map(([key, value]) => {
        const monthKey = normalizeMonthLabel(key);
        if (!monthKey || !value || typeof value !== "object") return null;
        return toPoint(monthKey, value);
      })
      .filter((value): value is IyTimeSeriesPoint => Boolean(value))
      .sort((a, b) => a.month.localeCompare(b.month));
  }

  const timeSeriesArray = Array.isArray(raw?.timeSeries)
    ? raw.timeSeries
    : Array.isArray(raw?.time_series)
      ? raw.time_series
      : [];

  return timeSeriesArray
    .map((entry: any) => {
      const monthKey = normalizeMonthLabel(entry?.month ?? entry?.period ?? entry?.date ?? entry?.label);
      if (!monthKey) return null;
      return toPoint(monthKey, entry);
    })
    .filter((value): value is IyTimeSeriesPoint => Boolean(value))
    .sort((a, b) => a.month.localeCompare(b.month));
}

function parseBolDateValue(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const ddmmyyyy = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (ddmmyyyy) {
    const [, dd, mm, yyyy] = ddmmyyyy;
    const parsed = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function normalizeRecentBols(raw: any): IyRecentBol[] {
  const source = Array.isArray(raw?.recent_bols)
    ? raw.recent_bols
    : Array.isArray(raw?.recentBols)
      ? raw.recentBols
      : [];

  return source
    .map((entry: any) => {
      const dateRaw =
        typeof entry?.date_formatted === "string"
          ? entry.date_formatted
          : typeof entry?.date === "string"
            ? entry.date
            : typeof entry?.arrival_date === "string"
              ? entry.arrival_date
              : null;
      const dateObj = parseBolDateValue(dateRaw);
      const origin =
        routeValueToText(entry?.origin) ??
        routeValueToText(entry?.origin_port) ??
        routeValueToText(entry?.shipper_country) ??
        routeValueToText(entry?.supplier_country) ??
        routeValueToText(entry?.origin_country) ??
        null;
      const destination =
        routeValueToText(entry?.destination) ??
        routeValueToText(entry?.destination_port) ??
        routeValueToText(entry?.company_country) ??
        routeValueToText(entry?.destination_country) ??
        null;
      const route =
        buildRouteLabel({
          route: entry?.route,
          origin,
          destination,
          origin_country: origin,
          destination_country: destination,
        }) ?? null;
      return {
        bolNumber:
          typeof entry?.bol_number === "string"
            ? entry.bol_number
            : typeof entry?.bol === "string"
              ? entry.bol
              : null,
        date: dateRaw,
        dateObj,
        teu:
          coerceNumber(entry?.TEU) ??
          coerceNumber(entry?.teu) ??
          coerceNumber(entry?.total_teu) ??
          null,
        containersCount:
          coerceNumber(entry?.containers_count) ??
          coerceNumber(entry?.container_count) ??
          null,
        lcl:
          typeof entry?.lcl === "boolean"
            ? entry.lcl
            : typeof entry?.lcl === "string"
              ? entry.lcl.toLowerCase() === "true"
              : null,
        shippingCost:
          coerceNumber(entry?.shipping_cost) ??
          coerceNumber(entry?.est_spend_usd) ??
          null,
        supplier:
          routeValueToText(entry?.supplier) ??
          routeValueToText(entry?.supplier_name) ??
          null,
        supplierCountry:
          routeValueToText(entry?.supplier_country) ??
          routeValueToText(entry?.shipper_country) ??
          null,
        company:
          routeValueToText(entry?.company) ??
          routeValueToText(entry?.company_name) ??
          null,
        companyCountry:
          routeValueToText(entry?.company_country) ??
          routeValueToText(entry?.destination_country) ??
          null,
        origin,
        destination,
        route,
        raw: entry && typeof entry === "object" ? entry : {},
      };
    })
    .filter((entry: IyRecentBol) => Boolean(entry.date || entry.route || entry.bolNumber));
}

function routeValueToText(value: any): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (trimmed.toLowerCase() === "unknown") return null;
    return trimmed;
  }

  if (!value || typeof value !== "object") return null;

  const nestedDirect =
    routeValueToText(value?.label) ??
    routeValueToText(value?.name) ??
    routeValueToText(value?.value) ??
    routeValueToText(value?.display) ??
    routeValueToText(value?.location) ??
    routeValueToText(value?.city_name) ??
    routeValueToText(value?.port_name) ??
    routeValueToText(value?.port) ??
    routeValueToText(value?.city) ??
    routeValueToText(value?.state) ??
    routeValueToText(value?.province) ??
    routeValueToText(value?.country) ??
    routeValueToText(value?.country_name) ??
    routeValueToText(value?.countryCode) ??
    routeValueToText(value?.country_code);

  if (nestedDirect) return nestedDirect;

  const parts = [
    routeValueToText(value?.city ?? value?.origin_city ?? value?.destination_city),
    routeValueToText(value?.state ?? value?.origin_state ?? value?.destination_state),
    routeValueToText(value?.country ?? value?.country_name ?? value?.origin_country ?? value?.destination_country),
  ].filter((part, index, arr): part is string => Boolean(part) && arr.indexOf(part) === index);

  return parts.length ? parts.join(", ") : null;
}

function buildRouteSide(entry: any, side: "origin" | "destination"): string | null {
  const alt = side === "origin" ? "dest" : "origin";

  const direct =
    routeValueToText(entry?.[side]) ??
    routeValueToText(entry?.[`${side}_label`]) ??
    routeValueToText(entry?.[`${side}Label`]) ??
    routeValueToText(entry?.[`${side}_name`]) ??
    routeValueToText(entry?.[`${side}Name`]) ??
    routeValueToText(entry?.[`${side}_location`]) ??
    routeValueToText(entry?.[`${side}Location`]) ??
    routeValueToText(entry?.[`${side}_address`]) ??
    routeValueToText(entry?.[`${side}Address`]) ??
    routeValueToText(entry?.[`${side}_port`]) ??
    routeValueToText(entry?.[`${side}Port`]) ??
    routeValueToText(entry?.[`${side}_port_name`]) ??
    routeValueToText(entry?.[`${side}PortName`]) ??
    routeValueToText(entry?.[`${side}_city`]) ??
    routeValueToText(entry?.[`${side}City`]) ??
    routeValueToText(entry?.[`${side}_state`]) ??
    routeValueToText(entry?.[`${side}State`]) ??
    routeValueToText(entry?.[`${side}_province`]) ??
    routeValueToText(entry?.[`${side}Province`]) ??
    routeValueToText(entry?.[`${side}_country`]) ??
    routeValueToText(entry?.[`${side}Country`]) ??
    routeValueToText(entry?.[`${side}_country_name`]) ??
    routeValueToText(entry?.[`${side}CountryName`]) ??
    routeValueToText(entry?.[`${side}_country_code`]) ??
    routeValueToText(entry?.[`${side}CountryCode`]);

  if (direct) return direct;

  const city =
    routeValueToText(entry?.[`${side}_city`]) ??
    routeValueToText(entry?.[`${side}City`]);
  const state =
    routeValueToText(entry?.[`${side}_state`]) ??
    routeValueToText(entry?.[`${side}State`]) ??
    routeValueToText(entry?.[`${side}_province`]) ??
    routeValueToText(entry?.[`${side}Province`]);
  const country =
    routeValueToText(entry?.[`${side}_country`]) ??
    routeValueToText(entry?.[`${side}Country`]) ??
    routeValueToText(entry?.[`${side}_country_name`]) ??
    routeValueToText(entry?.[`${side}CountryName`]) ??
    routeValueToText(entry?.[`${side}_country_code`]) ??
    routeValueToText(entry?.[`${side}CountryCode`]);

  const parts = [city, state, country].filter(
    (part, index, arr): part is string => Boolean(part) && arr.indexOf(part) === index,
  );

  if (parts.length) return parts.join(", ");

  return (
    routeValueToText(entry?.[`${alt}_to_${side}`]) ??
    routeValueToText(entry?.[`${side}_from_${alt}`]) ??
    null
  );
}

function buildRouteLabel(entry: any): string | null {
  const explicitRoute =
    routeValueToText(entry?.route) ??
    routeValueToText(entry?.lane) ??
    routeValueToText(entry?.routeLabel) ??
    routeValueToText(entry?.route_label);

  if (explicitRoute && explicitRoute.includes("â")) return explicitRoute;

  const origin = buildRouteSide(entry, "origin");
  const destination = buildRouteSide(entry, "destination");

  if (origin && destination) return `${origin} â ${destination}`;
  if (explicitRoute) return explicitRoute;
  return null;
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
      const route = buildRouteLabel(entry);
      const shipments =
        coerceNumber(
          entry?.shipments ??
            entry?.total_shipments ??
            entry?.shipments_12m ??
            entry?.shipments12m ??
            entry?.count,
        ) ?? null;
      if (!route && shipments == null) return null;
      return {
        route: route || "Unknown â Unknown",
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
    const rawTopRoutes = Array.isArray(raw.routeKpis.topRoutesLast12m)
      ? raw.routeKpis.topRoutesLast12m
      : [];

    const normalizedTopRoutes = normalizeTopRoutes({
      routeKpis: { topRoutesLast12m: rawTopRoutes },
    });

    const topRoute =
      normalizedTopRoutes[0]?.route ??
      raw.routeKpis.topRouteLast12m ??
      null;

    const mostRecentRoute =
      raw.routeKpis.mostRecentRoute ??
      topRoute ??
      null;

    return {
      shipmentsLast12m: coerceNumber(
        raw.routeKpis.shipmentsLast12m ??
          raw.routeKpis.shipments_last_12m ??
          raw.shipments_last_12m ??
          raw.shipments_12m,
      ) ?? null,
      teuLast12m: coerceNumber(
        raw.routeKpis.teuLast12m ??
          raw.routeKpis.teu_last_12m ??
          raw.teu_12m ??
          raw.teu12m,
      ) ?? null,
      estSpendUsd12m:
        coerceNumber(
          raw.routeKpis.estSpendUsd12m ??
            raw.routeKpis.est_spend_usd ??
            raw.routeKpis.estSpend ??
            raw.est_spend_usd ??
            raw.estimated_spend_12m,
        ) ?? null,
      topRouteLast12m: topRoute,
      mostRecentRoute,
      sampleSize: coerceNumber(raw.routeKpis.sampleSize) ?? null,
      topRoutesLast12m: normalizedTopRoutes,
    };
  }

  const topRoutes = normalizeTopRoutes(raw);
  if (
    !topRoutes.length &&
    !raw?.total_shipments &&
    !raw?.shipments_12m &&
    !raw?.shipments_last_12m &&
    !raw?.teu_12m
  ) {
    return null;
  }

  return {
    shipmentsLast12m: coerceNumber(
      raw.shipments_12m ?? raw.shipments_last_12m ?? raw.total_shipments
    ) ?? null,
    teuLast12m: coerceNumber(
      raw.teu_12m ?? raw.teu12m ?? raw.total_teu
    ) ?? null,
    estSpendUsd12m:
      coerceNumber(
        raw.estSpendUsd12m ??
          raw.est_spend_usd ??
          raw.estimated_spend_12m ??
          raw.est_spend,
      ) ?? null,
    topRouteLast12m: topRoutes[0]?.route ?? null,
    mostRecentRoute:
      raw?.most_recent_route?.route ??
      raw?.most_recent_route?.label ??
      topRoutes[0]?.route ??
      null,
    sampleSize: coerceNumber(raw.sample_size ?? raw.sampleSize) ?? null,
    topRoutesLast12m: topRoutes,
  };
}

function normalizeCompanyProfile(
  rawProfile: any,
  companyKey: string,
): IyCompanyProfile {
  const profileData = rawProfile?.data ?? rawProfile ?? {};
  const companyId = ensureCompanyKey(
    profileData.company_id ?? profileData.companyKey ?? companyKey,
  );
  const profileKey = ensureCompanyKey(profileData.key ?? companyId);

  const routeKpis = normalizeRouteKpis(profileData);
  const timeSeries = normalizeTimeSeries(profileData);
  const recentBols = normalizeRecentBols(profileData);
  const containers = normalizeContainers(profileData);
  const topSuppliers = normalizeTopSuppliers(profileData);
  const yearMetrics = buildYearMetricsFromSnapshot(profileData);

  const websiteValue = typeof profileData.website === "string" ? profileData.website : null;
  const domainValue =
    profileData.domain ??
    (websiteValue
      ? (() => {
          try {
            const parsed = new URL(
              websiteValue.startsWith("http") ? websiteValue : `https://${websiteValue}`,
            );
            return parsed.hostname.replace(/^www\./i, "");
          } catch {
            return null;
          }
        })()
      : null);

  const phoneCandidate =
    profileData.phoneNumber ??
    profileData.phone ??
    profileData.phone_number ??
    profileData.company_phone ??
    null;

  const spendCoveragePct =
    coerceNumber(
      profileData.est_spend_coverage_pct ??
      profileData.spend_coverage_pct ??
      profileData.coverage_pct
    ) ?? null;

  const rawSpend12m =
    coerceNumber(
      profileData.est_spend_usd_12m ??
      profileData.est_spend_12m ??
      profileData.est_spend_usd ??
      profileData.estimated_spend_12m ??
      profileData.spend_12m
    ) ?? null;

  const benchmarkSpend12m = estimateSpendFromBenchmark({
    shipmentsLast12m:
      coerceNumber(profileData.shipments_last_12m) ??
      coerceNumber(profileData.shipments_12m) ??
      routeKpis?.shipmentsLast12m ??
      null,
    teuLast12m:
      coerceNumber(profileData.teu_last_12m) ??
      coerceNumber(profileData.teu_12m) ??
      routeKpis?.teuLast12m ??
      null,
    routeKpis,
    profileData,
  });

  const finalSpend12m =
    rawSpend12m != null && rawSpend12m > 0 && (spendCoveragePct == null || spendCoveragePct >= 60)
      ? rawSpend12m
      : benchmarkSpend12m;

  return {
    key: profileKey,
    companyId,
    name:
      typeof profileData.name === "string"
        ? profileData.name
        : typeof profileData.title === "string"
          ? profileData.title
          : profileKey,
    title:
      typeof profileData.title === "string"
        ? profileData.title
        : typeof profileData.name === "string"
          ? profileData.name
          : profileKey,
    domain: domainValue,
    website: websiteValue,
    phoneNumber: typeof phoneCandidate === "string" ? phoneCandidate : null,
    phone:
      typeof phoneCandidate === "string"
        ? phoneCandidate
        : profileData.phone ??
            profileData.phone_number ??
            profileData.company_phone ??
            null,
    address: profileData.address ?? profileData.company_address ?? null,
    countryCode:
      profileData.country_code ??
      profileData.countryCode ??
      profileData.country ??
      null,
    country:
      profileData.country ??
      null,
    lastShipmentDate:
      profileData.last_shipment_date ??
      profileData.lastShipment ??
      profileData.lastShipmentDate ??
      null,
    estSpendUsd12m: finalSpend12m,
    estSpendCoveragePct: spendCoveragePct,
    estSpendUsd:
      coerceNumber(
        profileData.total_shipping_cost_all_time ??
          profileData.est_spend_usd ??
          profileData.est_spend ??
          profileData.totalShippingCost,
      ) ?? null,
    totalShipments:
      coerceNumber(profileData.shipments_last_12m ?? profileData.shipments_12m ?? profileData.total_shipments) ?? null,
    totalShipmentsAllTime:
      coerceNumber(profileData.total_shipments_all_time ?? profileData.total_shipments) ?? null,
    totalTeuAllTime:
      coerceNumber(profileData.total_teu_all_time ?? profileData.total_teu) ?? null,
    latestYearShipments: yearMetrics.latestYearShipments,
    latestYearTeu: yearMetrics.latestYearTeu,
    currentYearShipments: yearMetrics.currentYearShipments,
    currentYearTeu: yearMetrics.currentYearTeu,
    topContainerLength:
      profileData.top_container_length ??
      profileData.topContainerLength ??
      null,
    topContainerCount:
      coerceNumber(profileData.top_container_count ?? profileData.topContainerCount) ?? null,
    topContainerShipments:
      coerceNumber(profileData.top_container_shipments ?? profileData.topContainerShipments) ?? null,
    topContainerTeu:
      coerceNumber(profileData.top_container_teu ?? profileData.topContainerTeu) ?? null,
    routeKpis,
    timeSeries,
    recentBols,
    containers,
    topSuppliers,
    monthly_shipments: Array.isArray(profileData.monthly_shipments) ? profileData.monthly_shipments : undefined,
    time_series: profileData.time_series,
    monthly_volumes: profileData.monthly_volumes,
    recent_bols: Array.isArray(profileData.recent_bols) ? profileData.recent_bols : undefined,
    monthly_totals: Array.isArray(profileData.monthly_totals) ? profileData.monthly_totals : undefined,
    yearly_totals: Array.isArray(profileData.yearly_totals) ? profileData.yearly_totals : undefined,
    container_lengths_breakdown: Array.isArray(profileData.container_lengths_breakdown) ? profileData.container_lengths_breakdown : undefined,
    containers_load: profileData.containers_load,
    top_routes: profileData.top_routes,
    most_recent_route: profileData.most_recent_route,
    suppliers_sample: profileData.suppliers_sample,
    fcl_shipments_all_time: coerceNumber(profileData.fcl_shipments_all_time),
    lcl_shipments_all_time: coerceNumber(profileData.lcl_shipments_all_time),
    fcl_shipments_perc: coerceNumber(profileData.fcl_shipments_perc),
    lcl_shipments_perc: coerceNumber(profileData.lcl_shipments_perc),
  };
}
/**
 * Phase 2.1: Public export for normalizing ImportYeti snapshot data into IyCompanyProfile.
 * Accepts raw snapshot data and ensures all KPI fields are properly populated.
 * Returns normalized profile with routeKpis, timeSeries, containers, and all other fields.
 */
export function normalizeIyCompanyProfile(
  rawSnapshot: any,
  companyKey?: string,
): IyCompanyProfile {
  const snapshot = rawSnapshot?.snapshot ?? rawSnapshot;
  const companyId = ensureCompanyKey(
    snapshot?.company_id ??
      snapshot?.companyId ??
      snapshot?.key ??
      companyKey ??
      "unknown"
  );

  const totalShipmentsAllTime =
    snapshot?.containers_count ??
    snapshot?.total_shipments ??
    snapshot?.totalShipments ??
    0;

  const shipmentsLast12m =
    snapshot?.shipments_last_12m ??
    snapshot?.shipments_12m ??
    snapshot?.shipments12m ??
    0;

  const totalTeuAllTime =
    snapshot?.total_teu ??
    snapshot?.teu_total ??
    snapshot?.teuAllTime ??
    0;

  const teuLast12m =
    snapshot?.teu_12m ??
    snapshot?.teuLast12m ??
    totalTeuAllTime;

  const estSpendUsd12m =
    snapshot?.est_spend ??
    snapshot?.est_spend_usd ??
    snapshot?.estimated_spend_12m ??
    0;

  const mergedData = {
    ...snapshot,
    monthly_shipments: Array.isArray(snapshot?.monthly_shipments) ? snapshot.monthly_shipments : undefined,
    monthly_volumes: snapshot?.monthly_volumes,
    recent_bols: Array.isArray(snapshot?.recent_bols) ? snapshot.recent_bols : undefined,
    time_series: snapshot?.time_series ?? snapshot?.monthly_volumes,
    containers_load:
      snapshot?.containers_load ??
      ((snapshot?.fcl_count !== undefined || snapshot?.lcl_count !== undefined)
        ? [
            { load_type: "FCL", shipments: snapshot.fcl_count ?? 0 },
            { load_type: "LCL", shipments: snapshot.lcl_count ?? 0 },
          ]
        : undefined),
    company_id: companyId,
    key: companyId,

    // Preserve ALL-TIME totals for summary/header cards
    total_shipments: totalShipmentsAllTime,
    containers_count: totalShipmentsAllTime,
    total_teu: totalTeuAllTime,

    // Keep 12m KPI values separate
    shipments_12m: shipmentsLast12m,
    shipments_last_12m: shipmentsLast12m,
    teu_12m: teuLast12m,
    est_spend_usd: estSpendUsd12m,
    est_spend_usd_12m: estSpendUsd12m,
    est_spend_coverage_pct:
      snapshot?.est_spend_coverage_pct ??
      snapshot?.spend_coverage_pct ??
      null,
    last_shipment_date: snapshot?.last_shipment_date,

    routeKpis: snapshot?.routeKpis ?? snapshot?.route_kpis_12m ?? {
      shipmentsLast12m,
      teuLast12m,
      estSpendUsd12m,
      topRouteLast12m:
        snapshot?.route_kpis?.topRouteLast12m ??
        snapshot?.route_kpis?.top_route_last_12m ??
        snapshot?.top_routes?.[0]?.route ??
        null,
      mostRecentRoute:
        snapshot?.route_kpis?.mostRecentRoute ??
        snapshot?.most_recent_route?.route ??
        null,
      sampleSize:
        snapshot?.route_kpis?.sampleSize ??
        snapshot?.recent_bols?.length ??
        null,
      topRoutesLast12m:
        snapshot?.route_kpis?.topRoutesLast12m ??
        snapshot?.top_routes ??
        [],
    },
  };

  return normalizeCompanyProfile(mergedData, companyId);
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
  const normalizedSlug = normalizeCompanyIdToSlug(companyKey);
  if (!normalizedSlug) {
    throw new Error("getIyCompanyProfile: company key is required");
  }

  if (isDevMode()) {
    return devGetCompanyProfile(normalizedSlug);
  }

  let data: any = null;
  let error: any = null;

  const primaryCall = await supabase.functions.invoke(
    "importyeti-proxy",
    {
      body: {
        action: "companyProfile",
        company_id: normalizedSlug,
      },
    }
  );

  data = primaryCall.data;
  error = primaryCall.error;

  if (error || !data?.companyProfile) {
    const fallbackCall = await supabase.functions.invoke(
      "importyeti-proxy",
      {
        body: {
          action: "company",
          company_id: normalizedSlug,
        },
      }
    );

    data = fallbackCall.data;
    error = fallbackCall.error;
  }

  if (error) {
    console.error("ImportYeti companyProfile error:", error);
    throw new Error(`getIyCompanyProfile failed: ${error.message || "Unknown error"}`);
  }

  if (!data || !data.companyProfile) {
    throw new Error("getIyCompanyProfile returned no profile");
  }

  const companyProfile = normalizeCompanyProfile(data.companyProfile, normalizedSlug);

  return {
    companyProfile,
    enrichment: data?.enrichment ?? null,
  };
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

  if (isDevMode()) {
    return devSearchShippers({ q, page, pageSize });
  }

  const fromIndex = await supabase
    .from("lit_company_search_results")
    .select("*", { count: "exact" })
    .ilike("company_name", `%${q}%`)
    .range((page - 1) * pageSize, page * pageSize - 1);

  if (fromIndex.error) {
    console.error("Supabase search error:", fromIndex.error);
    throw new Error(`Search failed: ${fromIndex.error.message || "Unknown error"}`);
  }

  const rows = Array.isArray(fromIndex.data) ? fromIndex.data : [];
  const total = fromIndex.count || rows.length;

  const results: IyShipperHit[] = rows.map((row: any) => {
    const slug = String(row.company_id || "").trim();
    const key = ensureCompanyKey(slug);

    return {
      key,
      companyId: key,
      companyKey: key,
      name: row.company_name || "Unknown company",
      title: row.company_name || "Unknown company",
      normalizedName: row.company_name || null,
      domain: row.website || null,
      website: row.website
        ? `https://${String(row.website).replace(/^https?:\/\//i, "")}`
        : null,
      phone: null,
      address: row.city || null,
      city: row.city || null,
      state: null,
      postalCode: null,
      country: row.country || null,
      countryCode: row.country_code || null,
      totalShipments: coerceNumber(row.total_shipments),
      shipmentsLast12m: coerceNumber(row.latest_year_shipments),
      teusLast12m: coerceNumber(row.latest_year_teu),
      estSpendLast12m: null,
      primaryRouteSummary: null,
      primaryRoute: null,
      lastShipmentDate: row.last_shipment_date || null,
      mostRecentShipment: row.last_shipment_date || null,
      latestYearShipments: coerceNumber(row.latest_year_shipments),
      latestYearTeu: coerceNumber(row.latest_year_teu),
      currentYearShipments: coerceNumber(row.latest_year_shipments),
      currentYearTeu: coerceNumber(row.latest_year_teu),
      topContainerLength: row.top_container_length || null,
      fclShipments12m: coerceNumber(row.fcl_shipments),
      lclShipments12m: coerceNumber(row.lcl_shipments),
      topSuppliers: null,
    };
  });

  return {
    ok: true,
    results,
    total,
    meta: {
      q,
      page,
      pageSize,
    },
  };
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
  if (origin && destination) return `${origin} â ${destination}`;
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
      estSpendUsd12m: null,
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
    estSpendUsd12m: null,
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
    const firstBol = result.shipments[0];
    if (firstBol?.bol) {
      try {
        await getIyBolDetail(firstBol.bol, signal);
      } catch (lookupError) {
        console.warn(
          "getIyRouteKpisForCompany contact lookup failed",
          lookupError,
        );
      }
    }
    return kpis;
  } catch (error) {
    console.error("getIyRouteKpisForCompany", error);
    return null;
  }
}

export const getIyRouteKpis = getIyRouteKpisForCompany;

export async function getSavedCompanyDetail(
  companyKey: string,
  signal?: AbortSignal,
): Promise<{ profile: IyCompanyProfile; routeKpis: IyRouteKpis | null }> {
  const normalizedKey = ensureCompanyKey(companyKey);
  if (!normalizedKey) {
    throw new Error("getSavedCompanyDetail requires a valid company key");
  }

  const [profileResult, routeKpis] = await Promise.all([
    getIyCompanyProfile({ companyKey: normalizedKey }),
    getIyRouteKpisForCompany({ companyKey: normalizedKey }, signal),
  ]);

  return {
    profile: profileResult.companyProfile,
    routeKpis,
  };
}


function deriveYearRouteHints(points: IyTimeSeriesPoint[]): {
  topRouteLast12m: string | null;
  mostRecentRoute: string | null;
} {
  return {
    topRouteLast12m: null,
    mostRecentRoute: null,
  };
}

export function buildYearScopedProfile(
  profile: IyCompanyProfile | null,
  year: number,
): IyCompanyProfile | null {
  if (!profile) return null;
  const scopedSeries = Array.isArray(profile.timeSeries)
    ? profile.timeSeries.filter((point) => Number(point?.year) === Number(year))
    : [];

  if (!scopedSeries.length) {
    return {
      ...profile,
      routeKpis: {
        shipmentsLast12m: 0,
        teuLast12m: 0,
        estSpendUsd12m: 0,
        topRouteLast12m: profile.routeKpis?.topRouteLast12m ?? null,
        mostRecentRoute: profile.routeKpis?.mostRecentRoute ?? null,
        sampleSize: 0,
        topRoutesLast12m: [],
      },
      containers: {
        fclShipments12m: 0,
        lclShipments12m: 0,
      },
      estSpendUsd12m: 0,
      totalShipments: 0,
      timeSeries: [],
    };
  }

  const shipments = scopedSeries.reduce((sum, point) => sum + (Number(point?.shipments) || 0), 0);
  const teu = scopedSeries.reduce((sum, point) => sum + (Number(point?.teu) || 0), 0);
  const estSpend = scopedSeries.reduce((sum, point) => sum + (Number(point?.estSpendUsd) || 0), 0);
  const fcl = scopedSeries.reduce((sum, point) => sum + (Number(point?.fclShipments) || 0), 0);
  const lcl = scopedSeries.reduce((sum, point) => sum + (Number(point?.lclShipments) || 0), 0);
  const mostRecentPoint = [...scopedSeries]
    .filter((point) => point?.lastShipmentDate)
    .sort((a, b) => String(b.lastShipmentDate).localeCompare(String(a.lastShipmentDate)))[0] ?? null;
  const routeHints = deriveYearRouteHints(scopedSeries);

  return {
    ...profile,
    estSpendUsd12m: estSpend,
    totalShipments: shipments,
    lastShipmentDate: mostRecentPoint?.lastShipmentDate ?? profile.lastShipmentDate ?? null,
    routeKpis: {
      shipmentsLast12m: shipments,
      teuLast12m: teu,
      estSpendUsd12m: estSpend,
      topRouteLast12m: routeHints.topRouteLast12m ?? profile.routeKpis?.topRouteLast12m ?? null,
      mostRecentRoute: routeHints.mostRecentRoute ?? profile.routeKpis?.mostRecentRoute ?? null,
      sampleSize: shipments,
      topRoutesLast12m: profile.routeKpis?.topRoutesLast12m ?? [],
    },
    containers: {
      fclShipments12m: fcl,
      lclShipments12m: lcl,
    },
    timeSeries: scopedSeries,
  };
}


export async function listSavedCompanies(
  stage = "prospect",
): Promise<CommandCenterRecord[]> {
  if (isDevMode()) {
    const result = await devGetSavedCompanies(stage);
    return result.rows.map((row: any) => ({
      company: {
        company_id: row.company_id,
        name: row.company_name,
        source: row.source,
        address: row.company_data?.address || null,
        country_code:
          row.company_data?.countryCode ||
          row.company_data?.country_code ||
          null,
        kpis: {
          shipments_12m:
            row.company_data?.shipmentsLast12m ||
            row.company_data?.shipments_12m ||
            row.company_data?.totalShipments ||
            0,
          teu_12m: row.company_data?.teuLast12m || row.company_data?.teu_12m || null,
          fcl_shipments_12m: row.company_data?.fclShipments12m || row.company_data?.fcl_shipments_12m || null,
          lcl_shipments_12m: row.company_data?.lclShipments12m || row.company_data?.lcl_shipments_12m || null,
          est_spend_12m: row.company_data?.estSpend12m || row.company_data?.est_spend_12m || null,
          top_route_12m: row.company_data?.topRoute12m || row.company_data?.top_route_12m || null,
          recent_route: row.company_data?.recentRoute || row.company_data?.recent_route || null,
          last_activity:
            row.company_data?.lastShipmentDate ||
            row.company_data?.most_recent_shipment_date ||
            row.company_data?.mostRecentShipment ||
            null,
        },
        extras: {
          top_suppliers: row.company_data?.topSuppliers || [],
        },
      },
      created_at: row.created_at,
    }));
  }

  const fallback = await getSavedCompanies();
  return Array.isArray(fallback?.rows) ? fallback.rows : [];
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
  try {
    const { data: user } = await supabase.auth.getUser();
    if (!user?.user) {
      return { rows: [] };
    }

    const { data, error } = await supabase
      .from('lit_saved_companies')
      .select(`
        *,
        lit_companies (
          id,
          source_company_key,
          name,
          domain,
          website,
          address_line1,
          city,
          state,
          country_code,
          shipments_12m,
          teu_12m,
          fcl_shipments_12m,
          lcl_shipments_12m,
          est_spend_12m,
          most_recent_shipment_date,
          top_route_12m,
          recent_route
        )
      `)
      .eq('user_id', user.user.id)
      .order('last_viewed_at', { ascending: false });

    if (error) {
      console.error('getSavedCompanies error:', error);
      return { rows: [] };
    }

    // DEBUG: Log the raw data structure
    if (data && data.length > 0) {
      console.log('[DEBUG] getSavedCompanies raw data sample:', {
        firstRow: data[0],
        companyData: data[0]?.lit_companies,
        shipments_12m: data[0]?.lit_companies?.shipments_12m,
        teu_12m: data[0]?.lit_companies?.teu_12m,
        est_spend_12m: data[0]?.lit_companies?.est_spend_12m,
      });
    }

    const rows = (data || []).map((item: any) => ({
      company: {
        company_id: item.lit_companies?.source_company_key || item.lit_companies?.id,
        name: item.lit_companies?.name || 'Unknown Company',
        domain: item.lit_companies?.domain,
        address: item.lit_companies?.address_line1 || `${item.lit_companies?.city || ''}, ${item.lit_companies?.state || ''}`.trim(),
        country_code: item.lit_companies?.country_code,
        kpis: {
          shipments_12m: item.lit_companies?.shipments_12m ?? 0,
          teu_12m: item.lit_companies?.teu_12m ?? null,
          fcl_shipments_12m: item.lit_companies?.fcl_shipments_12m ?? null,
          lcl_shipments_12m: item.lit_companies?.lcl_shipments_12m ?? null,
          est_spend_12m: item.lit_companies?.est_spend_12m ?? null,
          top_route_12m: item.lit_companies?.top_route_12m ?? null,
          recent_route: item.lit_companies?.recent_route ?? null,
          last_activity: item.lit_companies?.most_recent_shipment_date ?? null,
        },
      },
      shipments: [],
      saved_at: item.created_at,
      stage: item.stage,
    }));

    // DEBUG: Log mapped rows
    if (rows.length > 0) {
      console.log('[DEBUG] getSavedCompanies mapped first row:', rows[0]);
    }

    return { rows };
  } catch (error) {
    console.error('getSavedCompanies error:', error);
    return { rows: [] };
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

export async function saveCompanyToCrm(
  input: SaveCompanyToCrmInput,
): Promise<any> {
  const company =
    (input as { company?: Record<string, any> }).company ?? input ?? {};
  const rawId =
    (company as any)?.companyKey ||
    (company as any)?.key ||
    (company as any)?.company_id ||
    (company as any)?.companyId ||
    (company as any)?.id ||
    (company as any)?.name ||
    (company as any)?.company_name ||
    (company as any)?.title ||
    "";
  const companyId = ensureCompanyKey(rawId);
  if (!companyId) {
    console.warn("[LIT] saveCompanyToCrm called with invalid company payload:", {
      company,
      rawId,
    });
    throw new Error("saveCompanyToCrm requires a valid company id");
  }

  if (isDevMode()) {
    return devSaveCompany({
      company_id: companyId,
      company,
      stage: "prospect",
      provider: "importyeti",
    });
  }

  const res = await fetch(
    withGatewayKey(`${SEARCH_GATEWAY_BASE}/crm/saveCompany`),
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        company_id: companyId,
        stage: "prospect",
        provider: "importyeti",
        payload: company,
      }),
    },
  );

  if (!res.ok) {
    let errorBody: any = null;
    try {
      errorBody = await res.json();
    } catch {
      // swallow parse error
    }
    if (typeof window !== "undefined") {
      console.warn("[LIT] saveCompanyToCrm failed", {
        status: res.status,
        statusText: res.statusText,
        errorBody,
      });
    }
    throw new Error(`saveCompanyToCrm failed with status ${res.status}`);
  }

  return res.json();
}


async function saveCompanyDirectToSupabase(opts: {
  shipper: IyShipperHit;
  profile: IyCompanyProfile | null;
  stage?: string;
  provider?: string;
  source?: string;
}) {
  const { data: authData, error: authError } = await supabase.auth.getUser();
  const user = authData?.user;

  if (authError || !user?.id) {
    throw new Error("Authentication required to save company");
  }

  const rawId =
    opts.shipper.key ??
    opts.shipper.companyId ??
    (opts.shipper as any)?.company_key ??
    (opts.shipper as any)?.source_company_key ??
    "";

  const companyKey = ensureCompanyKey(rawId);
  if (!companyKey) {
    throw new Error("saveCompanyDirectToSupabase requires a valid company key");
  }

  const fclShipments = getFclShipments12m(opts.profile);
  const lclShipments = getLclShipments12m(opts.profile);
  const estSpend =
    opts.profile?.routeKpis?.estSpendUsd12m ??
    opts.profile?.estSpendUsd12m ??
    null;
  const topRoute = opts.profile?.routeKpis?.topRouteLast12m ?? null;
  const recentRoute = opts.profile?.routeKpis?.mostRecentRoute ?? null;

  const companyRow = {
    source: opts.source ?? "importyeti",
    source_company_key: companyKey,
    name: opts.shipper.title || opts.shipper.name || "Unknown",
    domain: opts.profile?.domain ?? opts.shipper.domain ?? null,
    website: opts.profile?.website ?? opts.shipper.website ?? null,
    address_line1: opts.profile?.address ?? opts.shipper.address ?? null,
    city: opts.shipper.city ?? null,
    state: opts.shipper.state ?? null,
    country_code: opts.profile?.countryCode ?? opts.shipper.countryCode ?? null,
    shipments_12m:
      opts.profile?.routeKpis?.shipmentsLast12m ??
      opts.shipper.shipmentsLast12m ??
      opts.shipper.totalShipments ??
      0,
    teu_12m:
      opts.profile?.routeKpis?.teuLast12m ??
      opts.shipper.teusLast12m ??
      null,
    fcl_shipments_12m: fclShipments,
    lcl_shipments_12m: lclShipments,
    most_recent_shipment_date:
      opts.profile?.lastShipmentDate ??
      opts.shipper.lastShipmentDate ??
      opts.shipper.mostRecentShipment ??
      null,
    top_route_12m: topRoute,
    recent_route: recentRoute,
  };

  const { data: upsertedCompany, error: companyError } = await supabase
    .from("lit_companies")
    .upsert(companyRow, {
      onConflict: "source_company_key",
    })
    .select("id, source_company_key, name")
    .single();

  if (companyError || !upsertedCompany?.id) {
    console.error("saveCompanyDirectToSupabase company upsert error:", companyError);
    throw new Error(companyError?.message || "Failed to upsert lit_companies");
  }

  const { data: existingSave, error: existingError } = await supabase
    .from("lit_saved_companies")
    .select("id")
    .eq("user_id", user.id)
    .eq("company_id", upsertedCompany.id)
    .maybeSingle();

  if (existingError) {
    console.error("saveCompanyDirectToSupabase existing save lookup error:", existingError);
    throw new Error(existingError.message || "Failed to inspect saved company state");
  }

  const savePayload = {
    user_id: user.id,
    company_id: upsertedCompany.id,
    stage: opts.stage ?? "prospect",
    status: "active",
    last_viewed_at: new Date().toISOString(),
    last_activity_at: new Date().toISOString(),
  };

  let savedRow: any = null;
  if (existingSave?.id) {
    const { data, error } = await supabase
      .from("lit_saved_companies")
      .update({
        stage: savePayload.stage,
        status: savePayload.status,
        last_viewed_at: savePayload.last_viewed_at,
        last_activity_at: savePayload.last_activity_at,
      })
      .eq("id", existingSave.id)
      .select("id, company_id, stage")
      .single();

    if (error) {
      console.error("saveCompanyDirectToSupabase saved update error:", error);
      throw new Error(error.message || "Failed to update saved company");
    }
    savedRow = data;
  } else {
    const { data, error } = await supabase
      .from("lit_saved_companies")
      .insert(savePayload)
      .select("id, company_id, stage")
      .single();

    if (error) {
      console.error("saveCompanyDirectToSupabase saved insert error:", error);
      throw new Error(error.message || "Failed to insert saved company");
    }
    savedRow = data;
  }

  return {
    success: true,
    company: upsertedCompany,
    saved: savedRow,
  };
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
    (opts.shipper as any)?.source_company_key ??
    "";
  const companyKey = ensureCompanyKey(rawId);
  if (!companyKey) {
    throw new Error("saveIyCompanyToCrm requires a valid company key");
  }

  if (isDevMode()) {
    return devSaveCompany({
      company_id: companyKey,
      company: opts.shipper,
      stage: opts.stage ?? "prospect",
      provider: opts.provider ?? "importyeti",
    });
  }

  return saveCompanyDirectToSupabase(opts);
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

export async function getCrmCompanyDetail(company_id: string, signal?: AbortSignal) {
  const url = withGatewayKey(`${API_BASE}/crm/companies/${encodeURIComponent(company_id)}`);
  const res = await fetch(url, {
    method: "GET",
    headers: { accept: "application/json" },
    signal,
  });
  if (!res.ok) {
    throw new Error(`getCrmCompanyDetail ${res.status}`);
  }
  return res.json();
}

export async function getCrmCampaigns(signal?: AbortSignal) {
  const url = withGatewayKey(`${API_BASE}/crm/campaigns`);
  const res = await fetch(url, {
    method: "GET",
    headers: { accept: "application/json" },
    signal,
  });
  if (!res.ok) {
    throw new Error(`getCrmCampaigns ${res.status}`);
  }
  return res.json();
}

export async function createCrmCampaign(body: {
  name: string;
  sequence: any;
  settings: any;
}, signal?: AbortSignal) {
  const url = withGatewayKey(`${API_BASE}/crm/campaigns`);
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) {
    throw new Error(`createCrmCampaign ${res.status}`);
  }
  return res.json();
}

export async function getCrmCampaignDetail(campaign_id: number, signal?: AbortSignal) {
  const url = withGatewayKey(`${API_BASE}/crm/campaigns/${campaign_id}`);
  const res = await fetch(url, {
    method: "GET",
    headers: { accept: "application/json" },
    signal,
  });
  if (!res.ok) {
    throw new Error(`getCrmCampaignDetail ${res.status}`);
  }
  return res.json();
}

export async function addCompanyToCampaign(params: {
  campaign_id: number;
  company_id: string;
  contact_ids?: string[];
}, signal?: AbortSignal) {
  const url = withGatewayKey(`${API_BASE}/crm/campaigns/${params.campaign_id}/addCompany`);
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      company_id: params.company_id,
      contact_ids: params.contact_ids || [],
    }),
    signal,
  });
  if (!res.ok) {
    throw new Error(`addCompanyToCampaign ${res.status}`);
  }
  return res.json();
}

export async function enrichCrmCompanyContacts(company_id: string, signal?: AbortSignal) {
  const url = withGatewayKey(`${API_BASE}/crm/companies/${encodeURIComponent(company_id)}/enrichContacts`);
  const res = await fetch(url, {
    method: "POST",
    headers: { accept: "application/json" },
    signal,
  });
  if (!res.ok) {
    throw new Error(`enrichCrmCompanyContacts ${res.status}`);
  }
  return res.json();
}

export async function getRfpCompanyContext(company_id: string, signal?: AbortSignal) {
  const url = withGatewayKey(`${API_BASE}/rfp/company/${encodeURIComponent(company_id)}/context`);
  const res = await fetch(url, {
    method: "GET",
    headers: { accept: "application/json" },
    signal,
  });
  if (!res.ok) {
    throw new Error(`getRfpCompanyContext ${res.status}`);
  }
  return res.json();
}

export async function generateRfp(body: {
  company_id: string;
  lanes: any[];
  owner?: string;
  template?: string;
}, signal?: AbortSignal) {
  const url = withGatewayKey(`${API_BASE}/rfp/generate`);
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) {
    throw new Error(`generateRfp ${res.status}`);
  }
  return res.json();
}

export async function createRfpWorkspace(body: {
  company_id: string;
  name: string;
  lanes: any[];
}, signal?: AbortSignal) {
  const url = withGatewayKey(`${API_BASE}/rfp/workspace`);
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) {
    throw new Error(`createRfpWorkspace ${res.status}`);
  }
  return res.json();
}



export async function sendCampaignEmail(campaignEmailId: string) {
  if (!campaignEmailId || typeof campaignEmailId !== "string") {
    throw new Error("sendCampaignEmail requires a valid campaignEmailId");
  }

  if (!SUPABASE_URL) {
    throw new Error("VITE_SUPABASE_URL is not configured");
  }

  const response = await fetch(
    `${SUPABASE_URL}/functions/v1/send-campaign-email`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        campaign_email_id: campaignEmailId,
      }),
    },
  );

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      data?.error || data?.message || "Failed to send campaign email",
    );
  }

  return data;
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
  sendCampaignEmail,
  kpiFrom,
  getCrmCompanyDetail,
  getCrmCampaigns,
  createCrmCampaign,
  getCrmCampaignDetail,
  addCompanyToCampaign,
  enrichCrmCompanyContacts,
  getRfpCompanyContext,
  generateRfp,
  createRfpWorkspace,

  // Generic HTTP methods for hooks/components
  async get(path: string) {
    const url = withGatewayKey(`${API_BASE}${path}`);
    const res = await fetch(url, {
      method: 'GET',
      headers: { 'accept': 'application/json' }
    });
    if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`);
    return res.json();
  },

  async post(path: string, body?: any) {
    const url = withGatewayKey(`${API_BASE}${path}`);
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'accept': 'application/json'
      },
      body: body ? JSON.stringify(body) : undefined
    });
    if (!res.ok) throw new Error(`POST ${path} failed: ${res.status}`);
    return res.json();
  }
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

/**
 * Get company BOLs (shipments) from ImportYeti via Edge Function
 * Used in: Command Center â Shipments Tab
 */
export async function getCompanyBols(sourceCompanyKey: string, options?: {
  start_date?: string;
  end_date?: string;
  limit?: number;
  offset?: number;
}) {
  if (isDevMode()) {
    return devGetCompanyBols({ company_id: sourceCompanyKey, ...options });
  }

  const headers = await getAuthHeaders();

  const res = await fetch(
    `${SUPABASE_URL}/functions/v1/importyeti-proxy`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        action: "companyBols",
        company_id: sourceCompanyKey,
        start_date: options?.start_date,
        end_date: options?.end_date,
        limit: options?.limit || 25,
        offset: options?.offset || 0,
      }),
    }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`getCompanyBols failed: ${res.status} ${text}`);
  }

  return await res.json();
}

/**
 * Generate AI-powered company brief using Gemini
 * Used in: Command Center â Pre-Call Briefing
 */
export async function generateCompanyBrief(companyId: string) {
  const { data, error } = await supabase.functions.invoke("gemini-brief", {
    body: { company_id: companyId },
  });

  if (error) {
    console.error("generateCompanyBrief error:", error);
    throw new Error(`generateBrief failed: ${error.message || "Unknown error"}`);
  }

  return data;
}

/**
 * Search for contacts using Lusha enrichment
 * Used in: Command Center â Contacts Tab
 */
export async function searchContacts(filters: {
  company?: string;
  title?: string;
  department?: string;
  city?: string;
  state?: string;
}) {
  const { data, error } = await supabase.functions.invoke("lusha-contact-search", {
    body: filters,
  });

  if (error) {
    console.error("searchContacts error:", error);
    throw new Error(`searchContacts failed: ${error.message || "Unknown error"}`);
  }

  return data;
}
export function getOldestShipmentDate(profile?: IyCompanyProfile | null): string | null {
  const dates: Date[] = [];
  if (Array.isArray(profile?.recentBols)) {
    for (const bol of profile.recentBols) {
      const dt = getBolDate(bol);
      if (dt) dates.push(dt);
    }
  }
  if (Array.isArray(profile?.timeSeries)) {
    for (const point of profile.timeSeries) {
      if (typeof point?.month === "string" && /^\d{4}-\d{2}$/.test(point.month)) {
        const dt = new Date(`${point.month}-01T00:00:00.000Z`);
        if (!Number.isNaN(dt.getTime())) dates.push(dt);
      }
    }
  }
  if (!dates.length) return profile?.lastShipmentDate ?? null;
  dates.sort((a, b) => a.getTime() - b.getTime());
  return dates[0].toISOString();
}

export function buildCommandCenterDetailModel(
  profile: IyCompanyProfile | null,
  routeKpis?: IyRouteKpis | null,
  selectedYear?: number | null,
): CommandCenterDetailModel {
  const availableYears = getCommandCenterAvailableYears(profile);
  const fallbackYear =
    (typeof selectedYear === "number" && availableYears.includes(selectedYear) ? selectedYear : undefined) ??
    availableYears[0] ??
    null;

  const scopedSeries = Array.isArray(profile?.timeSeries)
    ? profile!.timeSeries.filter((point) => (fallbackYear ? Number(point?.year) === fallbackYear : true))
    : [];

  const scopedBols = Array.isArray(profile?.recentBols)
    ? profile!.recentBols.filter((bol) => {
        if (!fallbackYear) return true;
        const dt = getBolDate(bol);
        return dt ? dt.getFullYear() === fallbackYear : false;
      })
    : [];

  const monthMap = new Map<number, CommandCenterActivityPoint>();
  for (let i = 0; i < 12; i += 1) {
    monthMap.set(i, {
      month: monthName(i),
      monthIndex: i,
      fcl: 0,
      lcl: 0,
      shipments: 0,
      teu: 0,
      estSpendUsd: 0,
    });
  }

  if (scopedSeries.length) {
    scopedSeries.forEach((point) => {
      const monthIndex =
        typeof point?.month === "string" && /^\d{4}-\d{2}$/.test(point.month)
          ? Number(point.month.slice(5, 7)) - 1
          : -1;
      if (monthIndex < 0 || !monthMap.has(monthIndex)) return;
      const entry = monthMap.get(monthIndex)!;
      entry.fcl += coerceNumber(point?.fclShipments) ?? 0;
      entry.lcl += coerceNumber(point?.lclShipments) ?? 0;
      entry.shipments += coerceNumber(point?.shipments) ?? 0;
      entry.teu += coerceNumber(point?.teu) ?? 0;
      entry.estSpendUsd += coerceNumber(point?.estSpendUsd) ?? 0;
    });
  } else {
    scopedBols.forEach((bol) => {
      const dt = getBolDate(bol);
      if (!dt) return;
      const entry = monthMap.get(dt.getMonth());
      if (!entry) return;
      const teu = coerceNumber(bol?.teu) ?? 0;
      const spend = getEntrySpend(bol);
      entry.shipments += 1;
      entry.teu += teu;
      entry.estSpendUsd += spend;
      if (bol?.lcl === true) entry.lcl += 1;
      else entry.fcl += 1;
    });
  }

  const activitySeries = [...monthMap.values()];
  const shipments = activitySeries.reduce((sum, point) => sum + point.shipments, 0);
  const teu = activitySeries.reduce((sum, point) => sum + point.teu, 0);
  const marketSpendRaw = activitySeries.reduce((sum, point) => sum + point.estSpendUsd, 0);

  const laneMap = new Map<string, { count: number; teu: number; spend: number }>();
  const carrierMap = new Map<string, { count: number; teu: number; spend: number }>();
  const originMap = new Map<string, { count: number; teu: number; spend: number }>();
  const destinationMap = new Map<string, { count: number; teu: number; spend: number }>();
  const hsMap = new Map<string, { description: string; count: number }>();

  scopedBols.forEach((bol) => {
    const teuValue = coerceNumber(bol?.teu) ?? 0;
    const spend = getEntrySpend(bol);
    const lane = bol?.route || "Unknown route";
    const carrier = getEntryCarrier(bol);
    const origin = bol?.origin || "Unknown";
    const destination = bol?.destination || "Unknown";
    const product = getEntryProduct(bol);
    const hsCode = getEntryHsCode(bol);

    const laneRow = laneMap.get(lane) || { count: 0, teu: 0, spend: 0 };
    laneRow.count += 1;
    laneRow.teu += teuValue;
    laneRow.spend += spend;
    laneMap.set(lane, laneRow);

    if (carrier) {
      const row = carrierMap.get(carrier) || { count: 0, teu: 0, spend: 0 };
      row.count += 1;
      row.teu += teuValue;
      row.spend += spend;
      carrierMap.set(carrier, row);
    }

    const originRow = originMap.get(origin) || { count: 0, teu: 0, spend: 0 };
    originRow.count += 1;
    originRow.teu += teuValue;
    originRow.spend += spend;
    originMap.set(origin, originRow);

    const destRow = destinationMap.get(destination) || { count: 0, teu: 0, spend: 0 };
    destRow.count += 1;
    destRow.teu += teuValue;
    destRow.spend += spend;
    destinationMap.set(destination, destRow);

    if (hsCode || product) {
      const key = hsCode || product || "Unknown";
      const row = hsMap.get(key) || { description: product || "—", count: 0 };
      row.count += 1;
      if (!row.description && product) row.description = product;
      hsMap.set(key, row);
    }
  });

  const toAggregateRows = (map: Map<string, { count: number; teu: number; spend: number }>) =>
    [...map.entries()]
      .map(([label, stats]) => ({
        label,
        count: stats.count,
        teu: stats.teu || null,
        spend: stats.spend || null,
      }))
      .sort((a, b) => b.count - a.count);

  const tradeLanes = toAggregateRows(laneMap);
  const carriers = toAggregateRows(carrierMap);
  const locations = {
    origins: toAggregateRows(originMap).slice(0, 12),
    destinations: toAggregateRows(destinationMap).slice(0, 12),
  };

  const hsCodes = [...hsMap.entries()]
    .map(([hsCode, row]) => ({
      hsCode,
      description: row.description || "—",
      count: row.count,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 16);

  const products = hsCodes.map((row) => ({
    product: row.description,
    hsCode: row.hsCode,
    count: row.count,
  }));

  const shipmentLedger = scopedBols
    .sort((a, b) => {
      const at = getBolDate(a)?.getTime() ?? 0;
      const bt = getBolDate(b)?.getTime() ?? 0;
      return bt - at;
    })
    .slice(0, 50)
    .map((bol) => ({
      date: bol?.date ?? null,
      bolNumber: bol?.bolNumber ?? null,
      teu: bol?.teu ?? null,
      carrier: getEntryCarrier(bol),
      route: bol?.route ?? null,
      product: getEntryProduct(bol),
      hsCode: getEntryHsCode(bol),
    }));

  const monthlyPivot = activitySeries.map((point) => ({
    month: point.month,
    shipments: point.shipments,
    teu: point.teu || null,
    estSpendUsd: point.estSpendUsd || null,
  }));

  const latestShipmentDate =
    scopedBols
      .map((bol) => getBolDate(bol))
      .filter((value): value is Date => Boolean(value))
      .sort((a, b) => b.getTime() - a.getTime())[0]
      ?.toISOString() ??
    profile?.lastShipmentDate ??
    null;

  const oldestShipmentDate = getOldestShipmentDate(profile);
  const fclShipments =
    activitySeries.reduce((sum, point) => sum + point.fcl, 0) ||
    getFclShipments12m(profile) ||
    0;
  const lclShipments =
    activitySeries.reduce((sum, point) => sum + point.lcl, 0) ||
    getLclShipments12m(profile) ||
    0;

  const ratioBase = (fclShipments || 0) + (lclShipments || 0);
  const fclRatioPct = ratioBase > 0 ? (fclShipments / ratioBase) * 100 : null;
  const avgTeuPerShipment = shipments > 0 ? teu / shipments : null;
  const avgTeuPerMonth = shipments > 0 ? shipments / 12 : null;

  let statusLabel = "Active shipper";
  if ((shipments || 0) > 1000) statusLabel = "High volume shipper";
  else if (latestShipmentDate) {
    const daysSince =
      (Date.now() - new Date(latestShipmentDate).getTime()) / (1000 * 60 * 60 * 24);
    if (daysSince > 180) statusLabel = "Inactive";
  }
  const strongestMonth = Math.max(...activitySeries.map((point) => point.shipments), 0);
  if (shipments > 0 && strongestMonth / shipments > 0.35 && shipments < 1000) {
    statusLabel = "Seasonal";
  }

  const marketSpendUsd =
    marketSpendRaw ||
    coerceNumber(profile?.estSpendUsd12m) ||
    coerceNumber(routeKpis?.estSpendUsd12m) ||
    null;

  return {
    availableYears,
    selectedYear: fallbackYear,
    oldestShipmentDate,
    latestShipmentDate,
    marketSpendUsd,
    shipments: shipments || coerceNumber(routeKpis?.shipmentsLast12m) || coerceNumber(profile?.totalShipments) || null,
    teu: teu || coerceNumber(routeKpis?.teuLast12m) || null,
    fclShipments: fclShipments || null,
    lclShipments: lclShipments || null,
    fclRatioPct,
    avgTeuPerShipment,
    avgTeuPerMonth,
    statusLabel,
    activitySeries,
    tradeLanes: tradeLanes.length ? tradeLanes : (routeKpis?.topRoutesLast12m || []).map((route) => ({
      label: route.route,
      count: coerceNumber(route.shipments) || 0,
      teu: coerceNumber(route.teu),
      spend: null,
    })),
    carriers,
    locations,
    hsCodes,
    products,
    shipmentLedger,
    monthlyPivot,
  };
}
