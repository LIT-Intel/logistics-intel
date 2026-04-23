import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

const SNAPSHOT_TABLE = "lit_importyeti_company_snapshot";
const INDEX_TABLE = "lit_company_index";
const SNAPSHOT_TTL_DAYS = 30;

type KeySource =
  | "IYApiKey"
  | "IY_DMA_API_KEY"
  | "IY_API_KEY"
  | "IMPORTYETI_API_KEY";

type EnvConfig = {
  apiKey: string;
  apiKeySource: KeySource | null;
  searchUrl: string;
  dmaBaseUrl: string;
  warnings: string[];
  isValid: boolean;
};

type SnapshotRecord = {
  company_id: string;
  raw_payload: any;
  parsed_summary: any;
  updated_at: string;
};

type MonthlyPoint = {
  month: string;
  fclShipments: number;
  lclShipments: number;
  shipments?: number;
  teu?: number;
  weight?: number;
};

type TopRoute = {
  route: string;
  shipments: number;
  teu: number | null;
  fclShipments: number | null;
  lclShipments: number | null;
};

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function normalizeCompanyKeyToSlug(input: string): string {
  if (!input) return "";
  const trimmed = input.trim();
  const stripped = trimmed.startsWith("company/")
    ? trimmed.slice("company/".length)
    : trimmed;
  const lowercased = stripped.toLowerCase();
  const replaced = lowercased.replace(/[\s_.]+/g, "-");
  const cleaned = replaced.replace(/[^a-z0-9-]/g, "");
  const collapsed = cleaned.replace(/-{2,}/g, "-");
  const trimmedEdges = collapsed.replace(/^-+|-+$/g, "");
  return trimmedEdges || "unknown";
}

function normalizeCompanyKey(key: string): string {
  if (!key) return "";
  return normalizeCompanyKeyToSlug(key);
}

function normalizeString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function normalizeNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const cleaned = value.replace(/,/g, "").trim();
    if (!cleaned) return null;
    const parsed = Number(cleaned);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function parseImportYetiDate(value: unknown): Date | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const trimmed = value.trim();

  const slashDate = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (slashDate) {
    const [, first, second, year] = slashDate;
    const a = Number(first);
    const b = Number(second);
    const y = Number(year);

    if (a >= 1 && a <= 12 && b >= 1 && b <= 31) {
      const d = new Date(Date.UTC(y, a - 1, b));
      return Number.isNaN(d.getTime()) ? null : d;
    }

    if (b >= 1 && b <= 12 && a >= 1 && a <= 31) {
      const d = new Date(Date.UTC(y, b - 1, a));
      return Number.isNaN(d.getTime()) ? null : d;
    }

    return null;
  }

  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function normalizeDateForPg(value: string | null | undefined): string | null {
  if (!value) return null;
  const parsed = parseImportYetiDate(value);
  return parsed ? parsed.toISOString().slice(0, 10) : null;
}

function formatMonthKey(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function estimateBolTeu(bol: any): number {
  return (
    normalizeNumber(bol?.TEU) ??
    normalizeNumber(bol?.teu) ??
    normalizeNumber(bol?.total_teu) ??
    normalizeNumber(bol?.container_teu) ??
    normalizeNumber(bol?.containers_count) ??
    normalizeNumber(bol?.container_count) ??
    0
  );
}

function estimateBolSpendUsd(bol: any): number {
  return (
    normalizeNumber(bol?.shipping_cost) ??
    normalizeNumber(bol?.shipping_rate_usd) ??
    normalizeNumber(bol?.rate_usd) ??
    normalizeNumber(bol?.amount_usd) ??
    0
  );
}

function buildRouteLabel(bol: any): string | null {
  const maybeString = (value: any): string | null => normalizeString(value);

  const preformatted = maybeString(bol?.shipping_route);
  if (preformatted && /→|->|—|-/u.test(preformatted)) {
    return preformatted;
  }

  const origin =
    maybeString(bol?.origin_port) ??
    maybeString(bol?.supplier_address_loc) ??
    maybeString(bol?.supplier_address_location) ??
    maybeString(bol?.origin) ??
    maybeString(bol?.origin_city) ??
    maybeString(bol?.origin_state) ??
    maybeString(bol?.origin_country) ??
    maybeString(bol?.origin_country_code) ??
    maybeString(bol?.origin_port_name) ??
    maybeString(bol?.origin_port_location) ??
    maybeString(bol?.Country) ??
    maybeString(bol?.country_code) ??
    maybeString(bol?.shipper_address_loc) ??
    maybeString(bol?.origin?.label) ??
    maybeString(bol?.origin?.city) ??
    maybeString(bol?.origin?.state) ??
    maybeString(bol?.origin?.country);

  const dest =
    maybeString(bol?.destination_port) ??
    maybeString(bol?.company_address_loc) ??
    maybeString(bol?.company_address_country) ??
    maybeString(bol?.destination) ??
    maybeString(bol?.destination_city) ??
    maybeString(bol?.destination_state) ??
    maybeString(bol?.destination_country) ??
    maybeString(bol?.destination_country_code) ??
    maybeString(bol?.destination_port_name) ??
    maybeString(bol?.destination_port_location) ??
    maybeString(bol?.entry_port) ??
    maybeString(bol?.Consignee_Address) ??
    maybeString(bol?.consignee_address_loc) ??
    maybeString(bol?.destination?.label) ??
    maybeString(bol?.destination?.city) ??
    maybeString(bol?.destination?.state) ??
    maybeString(bol?.destination?.country);

  if (origin && dest) return `${origin} → ${dest}`;
  if (origin) return origin;
  if (dest) return dest;
  return null;
}

function inferProfileTitle(snapshot: any, raw: any, companySlug: string): string {
  return (
    normalizeString(snapshot?.company_name) ??
    normalizeString(snapshot?.title) ??
    normalizeString(raw?.title) ??
    normalizeString(raw?.name) ??
    normalizeString(raw?.company_name) ??
    normalizeString(raw?.company_basename) ??
    companySlug
  );
}

function inferProfileWebsite(snapshot: any, raw: any): string | null {
  return (
    normalizeString(snapshot?.website) ??
    normalizeString(raw?.website) ??
    normalizeString(raw?.company_website) ??
    null
  );
}

function inferProfileDomain(snapshot: any, raw: any): string | null {
  const website = inferProfileWebsite(snapshot, raw);
  if (!website) return null;
  try {
    const parsed = new URL(
      website.startsWith("http") ? website : `https://${website}`,
    );
    return parsed.hostname.replace(/^www\./i, "");
  } catch {
    return normalizeString(website);
  }
}

function buildEnvConfig(): EnvConfig {
  const warnings: string[] = [];

  const candidates: Array<{ name: KeySource; value: string | undefined }> = [
    { name: "IYApiKey", value: Deno.env.get("IYApiKey")?.trim() },
    { name: "IY_DMA_API_KEY", value: Deno.env.get("IY_DMA_API_KEY")?.trim() },
    { name: "IY_API_KEY", value: Deno.env.get("IY_API_KEY")?.trim() },
    { name: "IMPORTYETI_API_KEY", value: Deno.env.get("IMPORTYETI_API_KEY")?.trim() },
  ];

  let apiKey = "";
  let apiKeySource: KeySource | null = null;

  for (const candidate of candidates) {
    if (candidate.value) {
      apiKey = candidate.value;
      apiKeySource = candidate.name;
      break;
    }
  }

  let dmaBaseUrl =
    Deno.env.get("IY_DMA_BASE_URL")?.trim() ||
    "https://data.importyeti.com/v1.0";

  const originalBase = dmaBaseUrl;
  dmaBaseUrl = dmaBaseUrl
    .replace(/\/company\/searches\/?$/, "")
    .replace(/\/searches\/?$/, "");

  if (originalBase !== dmaBaseUrl) {
    warnings.push(
      `[Env] Corrected IY_DMA_BASE_URL from "${originalBase}" to "${dmaBaseUrl}"`,
    );
  }

  const searchUrl =
    Deno.env.get("IY_DMA_SEARCH_URL")?.trim() ||
    `${dmaBaseUrl}/company/search`;

  return {
    apiKey,
    apiKeySource,
    searchUrl,
    dmaBaseUrl,
    warnings,
    isValid: Boolean(apiKey),
  };
}

async function fetchImportYetiJson(url: string, apiKey: string) {
  const response = await fetch(url, {
    method: "GET",
    headers: {
      IYApiKey: apiKey,
      Accept: "application/json",
    },
  });

  const text = await response.text();

  if (!response.ok) {
    throw new Error(`ImportYeti API error ${response.status}: ${text}`);
  }

  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return {};
  }
}

function normalizeSearchResults(rawPayload: any): any[] {
  if (Array.isArray(rawPayload?.results)) return rawPayload.results;
  if (Array.isArray(rawPayload?.data)) return rawPayload.data;
  if (Array.isArray(rawPayload?.rows)) return rawPayload.rows;
  if (Array.isArray(rawPayload?.companies)) return rawPayload.companies;
  if (Array.isArray(rawPayload?.items)) return rawPayload.items;
  if (Array.isArray(rawPayload)) return rawPayload;
  return [];
}

function normalizeSearchHit(result: any) {
  const rawCompanyId = normalizeString(result?.company_id);
  const rawKey = normalizeString(result?.key);
  const title =
    normalizeString(result?.title) ??
    normalizeString(result?.name) ??
    normalizeString(result?.company_name) ??
    "Unknown Company";

  const normalizedCompanyId = rawCompanyId
    ? normalizeCompanyKey(rawCompanyId)
    : normalizeCompanyKey(title);

  let key = rawKey;
  if (!key && rawCompanyId) {
    key = rawCompanyId.startsWith("company/")
      ? rawCompanyId
      : `company/${normalizeCompanyKey(rawCompanyId)}`;
  }
  if (!key) {
    key = `company/${normalizedCompanyId}`;
  }

  const address =
    normalizeString(result?.address) ??
    normalizeString(result?.address_plain) ??
    normalizeString(result?.city) ??
    "";

  const countryCode =
    normalizeString(result?.countryCode) ??
    normalizeString(result?.country_code) ??
    normalizeString(result?.country) ??
    "US";

  return {
    key,
    title,
    name: title,
    company_name: title,
    company_id: normalizedCompanyId,
    address,
    city: normalizeString(result?.city) ?? null,
    state: normalizeString(result?.state) ?? null,
    country: normalizeString(result?.country) ?? "United States",
    countryCode,
    website: normalizeString(result?.website) ?? normalizeString(result?.company_website) ?? null,
    domain: normalizeString(result?.domain) ?? null,
    totalShipments:
      normalizeNumber(result?.totalShipments) ??
      normalizeNumber(result?.total_shipments) ??
      normalizeNumber(result?.shipments_12m) ??
      0,
    totalTEU:
      normalizeNumber(result?.totalTEU) ??
      normalizeNumber(result?.total_teu) ??
      normalizeNumber(result?.latest_year_teu) ??
      null,
    mostRecentShipment:
      normalizeString(result?.mostRecentShipment) ??
      normalizeString(result?.last_shipment_date) ??
      normalizeString(result?.lastShipmentDate) ??
      null,
    latest_year: normalizeNumber(result?.latest_year),
    latest_year_shipments: normalizeNumber(result?.latest_year_shipments),
    latest_year_teu: normalizeNumber(result?.latest_year_teu),
    top_container_length: normalizeString(result?.top_container_length),
    top_container_count: normalizeNumber(result?.top_container_count),
    fcl_shipments_perc: normalizeNumber(result?.fcl_shipments_perc),
    lcl_shipments_perc: normalizeNumber(result?.lcl_shipments_perc),
    topSuppliers: Array.isArray(result?.topSuppliers)
      ? result.topSuppliers
      : Array.isArray(result?.top_suppliers)
        ? result.top_suppliers
        : [],
  };
}

function mapLocalIndexRow(row: any) {
  const companyId = normalizeCompanyKey(
    row?.company_id || row?.source_company_key || row?.company_name || "unknown",
  );

  return {
    key: `company/${companyId}`,
    title: row?.company_name || row?.name || companyId,
    name: row?.company_name || row?.name || companyId,
    company_name: row?.company_name || row?.name || companyId,
    company_id: companyId,
    address: row?.city || row?.address || "",
    city: row?.city || null,
    state: row?.state || null,
    country: row?.country || "United States",
    countryCode: row?.country_code || row?.country || "US",
    website: row?.website || null,
    domain: row?.domain || null,
    totalShipments:
      normalizeNumber(row?.total_shipments) ??
      normalizeNumber(row?.shipments_12m) ??
      0,
    totalTEU:
      normalizeNumber(row?.total_teu) ??
      normalizeNumber(row?.teu_12m) ??
      null,
    mostRecentShipment:
      normalizeString(row?.last_shipment_date) ??
      normalizeString(row?.most_recent_shipment_date) ??
      null,
    latest_year: normalizeNumber(row?.latest_year),
    latest_year_shipments: normalizeNumber(row?.latest_year_shipments),
    latest_year_teu: normalizeNumber(row?.latest_year_teu),
    top_container_length: normalizeString(row?.top_container_length),
    top_container_count: normalizeNumber(row?.top_container_count),
    fcl_shipments_perc: normalizeNumber(row?.fcl_shipments_perc),
    lcl_shipments_perc: normalizeNumber(row?.lcl_shipments_perc),
    topSuppliers: Array.isArray(row?.top_suppliers) ? row.top_suppliers : [],
  };
}

async function safeMaybeSingleSnapshot(
  supabase: any,
  companySlug: string,
): Promise<{ data: SnapshotRecord | null; errorMessage: string | null }> {
  try {
    const result = await supabase
      .from(SNAPSHOT_TABLE)
      .select("*")
      .eq("company_id", companySlug)
      .maybeSingle();

    const data = result?.data ?? null;
    const errorMessage = result?.error?.message ?? null;

    return { data, errorMessage };
  } catch (error: any) {
    return {
      data: null,
      errorMessage: error?.message || "Snapshot lookup failed",
    };
  }
}

async function safeUpsertSnapshot(
  supabase: any,
  payload: Record<string, unknown>,
): Promise<string | null> {
  try {
    const result = await supabase.from(SNAPSHOT_TABLE).upsert(payload);
    return result?.error?.message ?? null;
  } catch (error: any) {
    return error?.message || "Snapshot upsert failed";
  }
}

async function safeUpsertIndex(
  supabase: any,
  payload: Record<string, unknown>,
): Promise<string | null> {
  try {
    const result = await supabase.from(INDEX_TABLE).upsert(payload);
    return result?.error?.message ?? null;
  } catch (error: any) {
    return error?.message || "Index upsert failed";
  }
}

async function getCachedSnapshot(supabase: any, companySlug: string) {
  const result = await safeMaybeSingleSnapshot(supabase, companySlug);

  if (result.errorMessage) {
    console.error("❌ Snapshot fetch error:", result.errorMessage);
  }

  if (!result.data) return null;

  const ageDays =
    (Date.now() - new Date(result.data.updated_at).getTime()) /
    (1000 * 60 * 60 * 24);

  return {
    data: result.data,
    ageDays,
  };
}

async function fetchCompanyBolsUpstream(
  companySlug: string,
  env: EnvConfig,
  limit = 250,
  offset = 0,
) {
  const cleanSlug = normalizeCompanyKey(companySlug);

  const url = new URL(`${env.dmaBaseUrl}/company/${cleanSlug}/bols`);
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("offset", String(offset));

  const finalUrl = url.toString();
  console.log("  BOLS URL:", finalUrl);

  const payload = await fetchImportYetiJson(finalUrl, env.apiKey);
  const rows = Array.isArray(payload?.rows)
    ? payload.rows
    : Array.isArray(payload?.results)
      ? payload.results
      : Array.isArray(payload?.data)
        ? payload.data
        : Array.isArray(payload)
          ? payload
          : [];

  return {
    raw: payload,
    rows,
  };
}

async function fetchCompanyByIdUpstream(
  companySlug: string,
  env: EnvConfig,
) {
  const cleanSlug = normalizeCompanyKey(companySlug);
  const url = `${env.dmaBaseUrl}/company/${encodeURIComponent(cleanSlug)}`;

  console.log("  COMPANY URL:", url);

  const payload = await fetchImportYetiJson(url, env.apiKey);
  const data = payload?.data ?? payload ?? {};

  return {
    raw: payload,
    data,
  };
}

function getLast12MonthKeys(): Set<string> {
  const now = new Date();
  const keys = new Set<string>();

  for (let i = 0; i < 12; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    keys.add(formatMonthKey(d));
  }

  return keys;
}

function parseTimeSeriesToMonthlyVolumes(timeSeriesRaw: any) {
  const monthlyMap = new Map<
    string,
    { fcl: number; lcl: number; shipments: number; teu: number; weight: number }
  >();

  if (!timeSeriesRaw || typeof timeSeriesRaw !== "object") {
    return monthlyMap;
  }

  if (Array.isArray(timeSeriesRaw)) {
    for (const row of timeSeriesRaw) {
      const rawMonth =
        row?.month ??
        row?.date ??
        row?.period ??
        row?.label;

      const d = parseImportYetiDate(rawMonth);
      if (!d) continue;

      const monthKey = formatMonthKey(d);

      const shipments =
        normalizeNumber(row?.shipments) ??
        normalizeNumber(row?.total_shipments) ??
        normalizeNumber(row?.count) ??
        0;

      const teu =
        normalizeNumber(row?.teu) ??
        normalizeNumber(row?.total_teu) ??
        0;

      const weight =
        normalizeNumber(row?.weight) ??
        normalizeNumber(row?.total_weight) ??
        0;

      const fcl =
        normalizeNumber(row?.fcl_count) ??
        normalizeNumber(row?.fclShipments) ??
        shipments;

      const lcl =
        normalizeNumber(row?.lcl_count) ??
        normalizeNumber(row?.lclShipments) ??
        0;

      monthlyMap.set(monthKey, {
        fcl,
        lcl,
        shipments,
        teu,
        weight,
      });
    }

    return monthlyMap;
  }

  for (const [rawKey, rawValue] of Object.entries(timeSeriesRaw)) {
    const d = parseImportYetiDate(rawKey);
    if (!d) continue;

    const monthKey = formatMonthKey(d);
    const shipments = normalizeNumber((rawValue as any)?.shipments) ?? 0;
    const teu = normalizeNumber((rawValue as any)?.teu) ?? 0;
    const weight = normalizeNumber((rawValue as any)?.weight) ?? 0;

    monthlyMap.set(monthKey, {
      fcl: shipments,
      lcl: 0,
      shipments,
      teu,
      weight,
    });
  }

  return monthlyMap;
}

function applyRecentBolsFclLclSplits(
  monthlyMap: Map<
    string,
    { fcl: number; lcl: number; shipments: number; teu: number; weight: number }
  >,
  recentBols: any[],
) {
  if (!Array.isArray(recentBols) || recentBols.length === 0) return;

  const splitByMonth = new Map<string, { fcl: number; lcl: number }>();

  for (const bol of recentBols) {
    const d = parseImportYetiDate(
      bol?.date_formatted ?? bol?.date ?? bol?.shipped_on ?? bol?.arrival_date,
    );
    if (!d) continue;

    const monthKey = formatMonthKey(d);
    const current = splitByMonth.get(monthKey) || { fcl: 0, lcl: 0 };

    if (bol?.lcl === true) current.lcl += 1;
    else current.fcl += 1;

    splitByMonth.set(monthKey, current);
  }

  for (const [monthKey, split] of splitByMonth.entries()) {
    const existing = monthlyMap.get(monthKey);
    if (!existing) {
      monthlyMap.set(monthKey, {
        fcl: split.fcl,
        lcl: split.lcl,
        shipments: split.fcl + split.lcl,
        teu: 0,
        weight: 0,
      });
      continue;
    }

    const totalSplit = split.fcl + split.lcl;
    if (totalSplit <= 0) continue;

    const sourceShipments = existing.shipments > 0 ? existing.shipments : totalSplit;
    const ratio = sourceShipments / totalSplit;

    existing.fcl = Math.round(split.fcl * ratio);
    existing.lcl = Math.max(0, sourceShipments - existing.fcl);
    monthlyMap.set(monthKey, existing);
  }
}

function buildTopRoutesFromRecentBols(recentBols: any[]): TopRoute[] {
  const routeStats = new Map<
    string,
    { shipments: number; teu: number; fcl: number; lcl: number }
  >();

  for (const bol of Array.isArray(recentBols) ? recentBols : []) {
    const route = buildRouteLabel(bol);
    if (!route) continue;

    const current = routeStats.get(route) || {
      shipments: 0,
      teu: 0,
      fcl: 0,
      lcl: 0,
    };

    current.shipments += 1;
    current.teu += estimateBolTeu(bol);
    if (bol?.lcl === true) current.lcl += 1;
    else current.fcl += 1;

    routeStats.set(route, current);
  }

  return Array.from(routeStats.entries())
    .sort((a, b) => b[1].shipments - a[1].shipments)
    .slice(0, 10)
    .map(([route, stats]) => ({
      route,
      shipments: stats.shipments,
      teu: stats.teu || null,
      fclShipments: stats.fcl || null,
      lclShipments: stats.lcl || null,
    }));
}

function pickTopSuppliers(raw: any): string[] {
  const rows = Array.isArray(raw?.suppliers_table) ? raw.suppliers_table : [];
  const values = rows
    .map((row: any) =>
      normalizeString(row?.supplier) ??
      normalizeString(row?.supplier_name) ??
      normalizeString(row?.shipper) ??
      normalizeString(row?.name),
    )
    .filter((value: string | null): value is string => Boolean(value));

  return Array.from(new Set(values)).slice(0, 10);
}

function pickPhone(raw: any): string | null {
  let fallbackPhone: string | null = null;

  if (
    Array.isArray(raw?.other_addresses_contact_info) &&
    raw.other_addresses_contact_info.length > 0
  ) {
    fallbackPhone = normalizeString(
      raw.other_addresses_contact_info[0]?.contact_info_data?.phone_numbers?.[0],
    );
  }

  return (
    normalizeString(raw?.phone_number) ??
    normalizeString(raw?.company_main_phone_number) ??
    normalizeString(raw?.phone) ??
    normalizeString(raw?.phone_number_main) ??
    fallbackPhone ??
    null
  );
}

function buildSnapshotFromCompanyData(
  companySlug: string,
  raw: any,
) {
  const last12Keys = getLast12MonthKeys();

  const monthlyMap = parseTimeSeriesToMonthlyVolumes(raw?.time_series);
  applyRecentBolsFclLclSplits(monthlyMap, raw?.recent_bols);

  const orderedMonths = Array.from(monthlyMap.entries())
    .sort((a, b) => a[0].localeCompare(b[0]));

  let shipmentsLast12m = 0;
  let totalTeu12m = 0;
  let totalWeight12m = 0;
  let fclCount12m = 0;
  let lclCount12m = 0;

  for (const [month, value] of orderedMonths) {
    if (!last12Keys.has(month)) continue;

    shipmentsLast12m += value.shipments || 0;
    totalTeu12m += value.teu || 0;
    totalWeight12m += value.weight || 0;
    fclCount12m += value.fcl || 0;
    lclCount12m += value.lcl || 0;
  }

  if (fclCount12m === 0 && lclCount12m === 0) {
    const loadRows = Array.isArray(raw?.containers_load) ? raw.containers_load : [];
    const fclRow = loadRows.find((row: any) => String(row?.load_type).toUpperCase() === "FCL");
    const lclRow = loadRows.find((row: any) => String(row?.load_type).toUpperCase() === "LCL");

    const fclPctValue = normalizeNumber(fclRow?.shipments_perc);
    const lclPctValue = normalizeNumber(lclRow?.shipments_perc);

    const pctFcl = fclPctValue != null ? fclPctValue / 100 : null;
    const pctLcl = lclPctValue != null ? lclPctValue / 100 : null;

    if (shipmentsLast12m > 0 && pctFcl != null && pctLcl != null) {
      fclCount12m = Math.round(shipmentsLast12m * pctFcl);
      lclCount12m = Math.max(0, shipmentsLast12m - fclCount12m);
    }
  }

  const isUsableRouteLabel = (value: unknown): value is string =>
    typeof value === "string" && value.trim().length > 0 && value.trim() !== "Unknown → Unknown";

  let topRoutes: TopRoute[] = buildTopRoutesFromRecentBols(raw?.recent_bols);

  const needsFallback =
    topRoutes.length === 0 || topRoutes.every((entry) => !isUsableRouteLabel(entry?.route));

  if (needsFallback) {
    const aggregated: any[] = Array.isArray(raw?.route_kpis?.topRoutesLast12m)
      ? raw.route_kpis.topRoutesLast12m
      : Array.isArray(raw?.top_routes)
        ? raw.top_routes
        : Array.isArray(raw?.topRoutes)
          ? raw.topRoutes
          : [];
    const fallback: TopRoute[] = [];
    for (const entry of aggregated) {
      let route: string | null = normalizeString(entry?.route);
      if (!isUsableRouteLabel(route)) {
        route = buildRouteLabel(entry);
      }
      if (!isUsableRouteLabel(route)) continue;

      const shipments =
        normalizeNumber(entry?.shipments) ??
        normalizeNumber(entry?.count) ??
        normalizeNumber(entry?.shipments_12m) ??
        0;

      const teu =
        normalizeNumber(entry?.teu) ??
        normalizeNumber(entry?.total_teu) ??
        normalizeNumber(entry?.teu_12m) ??
        null;

      const fclShipments =
        normalizeNumber(entry?.fclShipments) ??
        normalizeNumber(entry?.fcl_count) ??
        normalizeNumber(entry?.fcl_shipments) ??
        null;

      const lclShipments =
        normalizeNumber(entry?.lclShipments) ??
        normalizeNumber(entry?.lcl_count) ??
        normalizeNumber(entry?.lcl_shipments) ??
        null;

      fallback.push({ route, shipments, teu, fclShipments, lclShipments });
    }
    if (fallback.length > 0) {
      topRoutes = fallback;
    }
  }

  topRoutes = topRoutes
    .filter((entry) => isUsableRouteLabel(entry?.route))
    .sort((a, b) => b.shipments - a.shipments)
    .slice(0, 10);

  const topSuppliers = pickTopSuppliers(raw);

  const lastShipmentDate =
    Array.isArray(raw?.recent_bols) && raw.recent_bols.length > 0
      ? (() => {
          const dates = raw.recent_bols
            .map((bol: any) =>
              parseImportYetiDate(
                bol?.date_formatted ?? bol?.date ?? bol?.arrival_date ?? bol?.shipped_on,
              ),
            )
            .filter((d: Date | null): d is Date => Boolean(d))
            .sort((a: Date, b: Date) => b.getTime() - a.getTime());

          return dates[0] ? dates[0].toISOString().slice(0, 10) : null;
        })()
      : (() => {
          const end = parseImportYetiDate(raw?.date_range?.end_date);
          return end ? end.toISOString().slice(0, 10) : null;
        })();

  const monthlyVolumes = Object.fromEntries(
    orderedMonths.map(([month, value]) => [
      month,
      {
        fcl: value.fcl,
        lcl: value.lcl,
        shipments: value.shipments,
        teu: value.teu,
        weight: value.weight,
      },
    ]),
  );

  return {
    company_id: companySlug,
    key: `company/${companySlug}`,
    company_name:
      normalizeString(raw?.title) ??
      normalizeString(raw?.name) ??
      companySlug,
    title:
      normalizeString(raw?.title) ??
      normalizeString(raw?.name) ??
      companySlug,
    name:
      normalizeString(raw?.title) ??
      normalizeString(raw?.name) ??
      companySlug,
    website: normalizeString(raw?.website),
    phone_number: pickPhone(raw),
    address:
      normalizeString(raw?.address) ??
      normalizeString(raw?.address_plain) ??
      null,
    country: normalizeString(raw?.country),
    country_code:
      normalizeString(raw?.country_code) ??
      null,
    total_shipments:
      normalizeNumber(raw?.total_shipments) ??
      shipmentsLast12m,
    shipments_last_12m: shipmentsLast12m,
    total_teu: Math.round(totalTeu12m * 100) / 100,
    total_weight_kg_12m: Math.round(totalWeight12m * 100) / 100,
    est_spend:
      Math.round((normalizeNumber(raw?.total_shipping_cost) ?? 0) * 100) / 100,
    fcl_count: fclCount12m,
    lcl_count: lclCount12m,
    last_shipment_date: lastShipmentDate,
    monthly_volumes: monthlyVolumes,
    top_routes: topRoutes,
    top_suppliers: topSuppliers,
    notify_parties: Array.isArray(raw?.notify_party_table)
      ? raw.notify_party_table
      : [],
    recent_bols: Array.isArray(raw?.recent_bols) ? raw.recent_bols : [],
    containers: Array.isArray(raw?.containers) ? raw.containers : [],
    containers_load: Array.isArray(raw?.containers_load) ? raw.containers_load : [],
    avg_teu_per_shipment: raw?.avg_teu_per_shipment ?? null,
    avg_teu_per_month: raw?.avg_teu_per_month ?? null,
    route_kpis: {
      shipmentsLast12m,
      teuLast12m: Math.round(totalTeu12m * 100) / 100,
      estSpendUsd12m:
        Math.round((normalizeNumber(raw?.total_shipping_cost) ?? 0) * 100) / 100,
      topRouteLast12m: topRoutes[0]?.route ?? null,
      mostRecentRoute:
        buildRouteLabel(
          Array.isArray(raw?.recent_bols) ? raw.recent_bols[0] : null,
        ) ??
        topRoutes[0]?.route ??
        null,
      sampleSize: Array.isArray(raw?.recent_bols) ? raw.recent_bols.length : 0,
      topRoutesLast12m: topRoutes,
    },
  };
}

function buildCompanyProfileFromSnapshot(
  snapshot: any,
  rawPayload: any,
  companySlug: string,
) {
  const raw = rawPayload?.data || rawPayload || {};
  const monthlyVolumes = snapshot?.monthly_volumes || {};

  const timeSeries: MonthlyPoint[] = Object.entries(monthlyVolumes)
    .map(([month, value]: [string, any]) => ({
      month,
      fclShipments: normalizeNumber(value?.fcl) ?? 0,
      lclShipments: normalizeNumber(value?.lcl) ?? 0,
      shipments: normalizeNumber(value?.shipments) ?? 0,
      teu: normalizeNumber(value?.teu) ?? 0,
      weight: normalizeNumber(value?.weight) ?? 0,
    }))
    .sort((a, b) => a.month.localeCompare(b.month));

  const routeKpis = {
    shipmentsLast12m:
      normalizeNumber(snapshot?.route_kpis?.shipmentsLast12m) ??
      normalizeNumber(snapshot?.shipments_last_12m) ??
      normalizeNumber(snapshot?.total_shipments) ??
      0,
    teuLast12m:
      normalizeNumber(snapshot?.route_kpis?.teuLast12m) ??
      normalizeNumber(snapshot?.total_teu) ??
      0,
    estSpendUsd12m:
      normalizeNumber(snapshot?.route_kpis?.estSpendUsd12m) ??
      normalizeNumber(snapshot?.est_spend) ??
      0,
    topRouteLast12m:
      normalizeString(snapshot?.route_kpis?.topRouteLast12m) ??
      normalizeString(snapshot?.top_routes?.[0]?.route) ??
      null,
    mostRecentRoute:
      normalizeString(snapshot?.route_kpis?.mostRecentRoute) ??
      normalizeString(snapshot?.top_routes?.[0]?.route) ??
      null,
    sampleSize:
      normalizeNumber(snapshot?.route_kpis?.sampleSize) ??
      normalizeNumber(snapshot?.shipments_last_12m) ??
      0,
    topRoutesLast12m: Array.isArray(snapshot?.route_kpis?.topRoutesLast12m)
      ? snapshot.route_kpis.topRoutesLast12m
      : Array.isArray(snapshot?.top_routes)
        ? snapshot.top_routes
        : [],
  };

  const containers = {
    fclShipments12m: normalizeNumber(snapshot?.fcl_count) ?? 0,
    lclShipments12m: normalizeNumber(snapshot?.lcl_count) ?? 0,
  };

  const title = inferProfileTitle(snapshot, raw, companySlug);
  const website = inferProfileWebsite(snapshot, raw);
  const domain = inferProfileDomain(snapshot, raw);

  return {
    key: `company/${companySlug}`,
    companyId: `company/${companySlug}`,
    name: title,
    title,
    domain,
    website,
    phoneNumber:
      normalizeString(snapshot?.phone_number) ??
      pickPhone(raw),
    phone:
      normalizeString(snapshot?.phone_number) ??
      pickPhone(raw),
    address:
      normalizeString(snapshot?.address) ??
      normalizeString(raw?.address) ??
      normalizeString(raw?.address_plain) ??
      null,
    countryCode:
      normalizeString(snapshot?.country_code) ??
      normalizeString(raw?.country_code) ??
      normalizeString(raw?.country) ??
      null,
    country:
      normalizeString(snapshot?.country) ??
      normalizeString(raw?.country) ??
      null,
    lastShipmentDate:
      normalizeString(snapshot?.last_shipment_date) ??
      null,
    estSpendUsd12m:
      normalizeNumber(snapshot?.est_spend) ??
      0,
    totalShipments:
      normalizeNumber(snapshot?.shipments_last_12m) ??
      normalizeNumber(snapshot?.total_shipments) ??
      0,
    routeKpis,
    timeSeries,
    containers,
    topSuppliers: Array.isArray(snapshot?.top_suppliers)
      ? snapshot.top_suppliers
      : [],
    time_series: monthlyVolumes,
    containers_load: Array.isArray(snapshot?.containers_load)
      ? snapshot.containers_load
      : [],
    containers_detail: Array.isArray(snapshot?.containers)
      ? snapshot.containers
      : [],
    top_routes: Array.isArray(snapshot?.top_routes) ? snapshot.top_routes : [],
    most_recent_route: routeKpis.mostRecentRoute
      ? { route: routeKpis.mostRecentRoute }
      : null,
    suppliers_sample: Array.isArray(snapshot?.top_suppliers)
      ? snapshot.top_suppliers
      : [],
    notify_party_table: Array.isArray(snapshot?.notify_parties)
      ? snapshot.notify_parties
      : [],
    recent_bols: Array.isArray(snapshot?.recent_bols)
      ? snapshot.recent_bols
      : [],
    avg_teu_per_shipment: snapshot?.avg_teu_per_shipment ?? null,
    avg_teu_per_month: snapshot?.avg_teu_per_month ?? null,
    totalShippingCost:
      normalizeNumber(raw?.total_shipping_cost) ??
      normalizeNumber(snapshot?.est_spend) ??
      0,
    rawOverview: {
      totalShipmentsAllTime:
        normalizeNumber(raw?.total_shipments) ??
        normalizeNumber(snapshot?.total_shipments) ??
        0,
      carriersPerCountry: raw?.carriers_per_country ?? {},
      dateRange: raw?.date_range ?? null,
      alsoKnownNames: Array.isArray(raw?.also_known_names) ? raw.also_known_names : [],
      hsCodes: raw?.hs_codes ?? [],
    },
  };
}

async function handleCompanyBolsAction(supabase: any, companyId: string, requestId: string) {
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("📋 COMPANY BOLS REQUEST:", { requestId, companyId });

  const env = buildEnvConfig();
  if (!env.isValid) {
    return jsonResponse({ ok: false, error: "ImportYeti API key not configured", code: "IY_API_KEY_MISSING" }, 500);
  }

  const normalizedCompanyKey = normalizeCompanyKey(companyId);
  console.log("  Normalized slug:", normalizedCompanyKey);

  try {
    const cached = await getCachedSnapshot(supabase, normalizedCompanyKey);

    if (
      cached?.data?.raw_payload?.data?.recent_bols &&
      Array.isArray(cached.data.raw_payload.data.recent_bols)
    ) {
      console.log(
        "✅ recent_bols from cached raw payload:",
        cached.data.raw_payload.data.recent_bols.length,
      );
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      return jsonResponse({
        ok: true,
        rows: cached.data.raw_payload.data.recent_bols,
        total: cached.data.raw_payload.data.recent_bols.length,
        cached_at: cached.data.updated_at,
      });
    }

    if (
      Array.isArray(cached?.data?.raw_payload?.recent_bols)
    ) {
      console.log(
        "✅ recent_bols from cached payload:",
        cached.data.raw_payload.recent_bols.length,
      );
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      return jsonResponse({
        ok: true,
        rows: cached.data.raw_payload.recent_bols,
        total: cached.data.raw_payload.recent_bols.length,
        cached_at: cached.data.updated_at,
      });
    }

    const upstream = await fetchCompanyBolsUpstream(normalizedCompanyKey, env);
    console.log("✅ BOL rows fetched:", upstream.rows.length);
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    return jsonResponse({
      ok: true,
      rows: upstream.rows,
      total: upstream.rows.length,
    });
  } catch (error: any) {
    console.error("❌ companyBols failed:", { requestId, error: error?.message || error });
    return jsonResponse(
      {
        ok: false,
        error: error?.message || "companyBols failed",
        code: "COMPANY_BOLS_FAILED",
      },
      500,
    );
  }
}

async function handleSearchAction(
  supabase: any,
  q: string,
  page: number = 1,
  pageSize: number = 25,
  requestId: string = crypto.randomUUID(),
) {
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("🔍 SEARCH REQUEST:", { requestId, q, page, pageSize });

  const env = buildEnvConfig();
  if (!env.isValid) {
    return jsonResponse(
      { ok: false, error: "ImportYeti API key not configured", code: "IY_API_KEY_MISSING" },
      500,
    );
  }

  if (!q || typeof q !== "string" || q.trim().length === 0) {
    return jsonResponse(
      { ok: false, error: "Query (q) is required and must be non-empty", code: "MISSING_QUERY" },
      400,
    );
  }

  const validatedPage = Math.max(1, Number.isFinite(page) ? Number(page) : 1);
  const validatedPageSize = Math.max(
    1,
    Math.min(25, Number.isFinite(pageSize) ? Number(pageSize) : 25),
  );
  const offset = (validatedPage - 1) * validatedPageSize;
  const searchTerm = q.trim();

  try {
    const url = new URL(env.searchUrl);
    url.searchParams.set("name", searchTerm);

    const iyUrl = url.toString();

    console.log("  METHOD: GET");
    console.log("  URL:", iyUrl);
    console.log("  Auth:", env.apiKeySource || "IY API key");

    const rawPayload = await fetchImportYetiJson(iyUrl, env.apiKey);
    const upstreamResults = normalizeSearchResults(rawPayload);
    const normalizedResults = upstreamResults.map(normalizeSearchHit);

    const total =
      normalizeNumber(rawPayload?.total) ??
      normalizeNumber(rawPayload?.pagination?.total) ??
      normalizeNumber(rawPayload?.count) ??
      normalizedResults.length;

    console.log("📊 Upstream search result:", {
      requestId,
      upstream_count: upstreamResults.length,
      normalized_count: normalizedResults.length,
      total,
      page: validatedPage,
      pageSize: validatedPageSize,
      sample_keys: normalizedResults.slice(0, 3).map((row: any) => row.key),
    });

    const pagedResults = normalizedResults.slice(offset, offset + validatedPageSize);

    for (const row of pagedResults.slice(0, 25)) {
      const companyId = normalizeCompanyKey(row.company_id || row.key || row.title);
      const indexError = await safeUpsertIndex(supabase, {
        company_id: companyId,
        company_name: row.title || row.name || companyId,
        country: row.countryCode || row.country || null,
        city: row.city || row.address || null,
        last_shipment_date: normalizeDateForPg(row.mostRecentShipment),
        total_shipments: row.totalShipments || 0,
        total_teu: row.totalTEU || 0,
        updated_at: new Date().toISOString(),
      });

      if (indexError) {
        console.error("❌ Search result index upsert error:", {
          requestId,
          company_id: companyId,
          error: indexError,
        });
      }
    }

    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    return jsonResponse({
      ok: true,
      source: "importyeti",
      results: pagedResults,
      page: validatedPage,
      pageSize: validatedPageSize,
      total,
    });
  } catch (error: any) {
    console.error("❌ Upstream search failed, falling back to local index:", {
      requestId,
      error: error?.message || error,
    });

    const likeQuery = `%${searchTerm}%`;

    const { data: localRows, error: localError } = await supabase
      .from(INDEX_TABLE)
      .select("*")
      .or(`company_name.ilike.${likeQuery},company_id.ilike.${likeQuery},city.ilike.${likeQuery}`)
      .order("total_shipments", { ascending: false })
      .range(offset, offset + validatedPageSize - 1);

    if (localError) {
      console.error("❌ Local index search failed:", {
        requestId,
        error: localError.message,
      });

      return jsonResponse(
        {
          ok: false,
          error: error?.message || "Search failed",
          code: "SEARCH_FAILED",
        },
        500,
      );
    }

    const mappedResults = (localRows || []).map(mapLocalIndexRow);

    const { count } = await supabase
      .from(INDEX_TABLE)
      .select("*", { count: "exact", head: true })
      .or(`company_name.ilike.${likeQuery},company_id.ilike.${likeQuery},city.ilike.${likeQuery}`);

    console.log("📊 Local fallback search result:", {
      requestId,
      results_count: mappedResults.length,
      total: count ?? mappedResults.length,
      page: validatedPage,
      pageSize: validatedPageSize,
    });

    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    return jsonResponse({
      ok: true,
      source: "local_index",
      results: mappedResults,
      page: validatedPage,
      pageSize: validatedPageSize,
      total: count ?? mappedResults.length,
    });
  }
}

async function handleCompanyProfileAction(supabase: any, companyId: string, requestId: string) {
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("📦 COMPANY PROFILE REQUEST:", { requestId, companyId });

  const env = buildEnvConfig();
  if (!env.isValid) {
    return jsonResponse(
      { ok: false, error: "ImportYeti API key not configured", code: "IY_API_KEY_MISSING" },
      500,
    );
  }

  const normalizedCompanyKey = normalizeCompanyKey(companyId);
  console.log("  Normalized slug:", normalizedCompanyKey);

  const cached = await getCachedSnapshot(supabase, normalizedCompanyKey);
  if (cached?.data && cached.ageDays < SNAPSHOT_TTL_DAYS) {
    console.log("✅ Using cached snapshot", { requestId });

    const cachedProfile = buildCompanyProfileFromSnapshot(
      cached.data.parsed_summary,
      cached.data.raw_payload,
      normalizedCompanyKey,
    );

    return jsonResponse({
      ok: true,
      source: "cache",
      snapshot: cached.data.parsed_summary,
      companyProfile: cachedProfile,
      raw: cached.data.raw_payload,
      cached_at: cached.data.updated_at,
    });
  }

  try {
    const upstream = await fetchCompanyByIdUpstream(normalizedCompanyKey, env);
    const rawCompanyData = upstream.data ?? {};

    const snapshot = buildSnapshotFromCompanyData(
      normalizedCompanyKey,
      rawCompanyData,
    );

    const companyProfile = buildCompanyProfileFromSnapshot(
      snapshot,
      upstream.raw,
      normalizedCompanyKey,
    );

    console.log("📊 Parsed profile:", {
      requestId,
      shipmentsLast12m: companyProfile.routeKpis?.shipmentsLast12m,
      teuLast12m: companyProfile.routeKpis?.teuLast12m,
      estSpendUsd12m: companyProfile.routeKpis?.estSpendUsd12m,
      timeSeriesPoints: companyProfile.timeSeries?.length,
      topRoutes: companyProfile.routeKpis?.topRoutesLast12m?.length,
      recentBols: companyProfile.recent_bols?.length ?? 0,
    });

    const now = new Date().toISOString();

    const snapshotError = await safeUpsertSnapshot(supabase, {
      company_id: normalizedCompanyKey,
      raw_payload: upstream.raw,
      parsed_summary: snapshot,
      updated_at: now,
    });

    if (snapshotError) {
      console.error("❌ Snapshot save error:", { requestId, error: snapshotError });
    } else {
      console.log("✅ Snapshot saved", {
        requestId,
        company_id: normalizedCompanyKey,
        idempotent_key: normalizedCompanyKey,
      });
    }

    const indexError = await safeUpsertIndex(supabase, {
      company_id: normalizedCompanyKey,
      company_name: snapshot.title || snapshot.company_name || normalizedCompanyKey,
      country: snapshot.country_code || snapshot.country || null,
      city: snapshot.address || null,
      last_shipment_date: normalizeDateForPg(snapshot.last_shipment_date),
      total_shipments: snapshot.shipments_last_12m || 0,
      total_teu: snapshot.route_kpis?.teuLast12m ?? snapshot.total_teu ?? null,
      updated_at: new Date().toISOString(),
    });

    if (indexError) {
      console.error("❌ Index update error:", { requestId, error: indexError });
    } else {
      console.log("✅ Search index updated", { requestId });
    }

    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    return jsonResponse({
      ok: true,
      source: "fresh",
      snapshot,
      companyProfile,
      raw: upstream.raw,
      fetched_at: now,
    });
  } catch (error: any) {
    console.error("❌ Company profile failed:", { requestId, error: error?.message || error });
    return jsonResponse(
      {
        ok: false,
        error: error?.message || "Company profile failed",
        code: "COMPANY_PROFILE_FAILED",
      },
      500,
    );
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const requestId = crypto.randomUUID();

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseKey) {
      return jsonResponse(
        { ok: false, error: "Supabase environment not configured", code: "SUPABASE_ENV_MISSING" },
        500,
      );
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return jsonResponse(
        { ok: false, error: "Missing authorization", code: "UNAUTHORIZED" },
        401,
      );
    }

    const token = authHeader.replace("Bearer ").trim();
    if (!token) {
      return jsonResponse(
        { ok: false, error: "Missing authorization", code: "UNAUTHORIZED" },
        401,
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    try {
      await supabase.auth.getUser(token);
    } catch (authError: any) {
      console.error("❌ Auth validation failed:", { requestId, error: authError?.message || authError });
      return jsonResponse(
        { ok: false, error: "Invalid authorization token", code: "UNAUTHORIZED" },
        401,
      );
    }

    let body: any = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    const { action, company_id, companyKey, q, page, pageSize } = body ?? {};
    const requestedCompanyId = company_id || companyKey;
    const resolvedAction = action ?? (requestedCompanyId ? "companyProfile" : undefined);

    console.log("➡️ importyeti-proxy request:", {
      requestId,
      method: req.method,
      action: resolvedAction,
      company_id: requestedCompanyId ?? null,
      q: typeof q === "string" ? q : null,
    });

    if (resolvedAction === "search") {
      return await handleSearchAction(supabase, q, page, pageSize, requestId);
    }

    if (!requestedCompanyId) {
      return jsonResponse(
        { ok: false, error: "company_id is required", code: "MISSING_COMPANY_ID" },
        400,
      );
    }

    if (resolvedAction === "companyBols") {
      return await handleCompanyBolsAction(supabase, requestedCompanyId, requestId);
    }

    if (
      resolvedAction === "company" ||
      resolvedAction === "companyProfile" ||
      resolvedAction === "companySnapshot"
    ) {
      return await handleCompanyProfileAction(supabase, requestedCompanyId, requestId);
    }

    return jsonResponse(
      { ok: false, error: `Unknown action: ${resolvedAction}`, code: "UNKNOWN_ACTION" },
      400,
    );
  } catch (error: any) {
    console.error("❌ Fatal error:", { requestId, error: error?.message || error });
    return jsonResponse(
      { ok: false, error: error?.message || "Internal server error", code: "INTERNAL_ERROR" },
      500,
    );
  }
});