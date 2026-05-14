import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  buildParsedSummary,
  fetchAndUpsertSnapshot,
} from "../_shared/importyeti_fetch.ts";

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

function todayUtcMidnight(): Date {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

function isPastOrToday(d: Date | null | undefined): boolean {
  if (!d || Number.isNaN(d.getTime())) return false;
  return d.getTime() <= todayUtcMidnight().getTime();
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

    const mmddValid = a >= 1 && a <= 12 && b >= 1 && b <= 31;
    const ddmmValid = b >= 1 && b <= 12 && a >= 1 && a <= 31;

    const mmddCand = mmddValid ? new Date(Date.UTC(y, a - 1, b)) : null;
    const ddmmCand = ddmmValid ? new Date(Date.UTC(y, b - 1, a)) : null;

    const validMmdd = mmddCand && !Number.isNaN(mmddCand.getTime()) ? mmddCand : null;
    const validDdmm = ddmmCand && !Number.isNaN(ddmmCand.getTime()) ? ddmmCand : null;

    if (!validMmdd && !validDdmm) return null;
    if (validMmdd && !validDdmm) return validMmdd;
    if (!validMmdd && validDdmm) return validDdmm;

    // Both interpretations are valid calendar dates.
    // Prefer the one that is past-or-today; if both are past or both are
    // future, prefer DD/MM/YYYY — that's the format ImportYeti's payload
    // uses (verified against `date_range.end_date` matching real shipment
    // dates and against multi-year `time_series` keys collapsing into
    // YYYY-01 buckets when MM/DD was used). Fixes the bug where every
    // monthly bucket Feb–Dec landed in January because the day prefix is
    // always `01` for time_series keys.
    const mmddPast = isPastOrToday(validMmdd);
    const ddmmPast = isPastOrToday(validDdmm);

    if (mmddPast && !ddmmPast) return validMmdd;
    if (ddmmPast && !mmddPast) return validDdmm;
    return validDdmm;
  }

  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseImportYetiDateNoFuture(value: unknown): Date | null {
  const parsed = parseImportYetiDate(value);
  if (!parsed) return null;
  return isPastOrToday(parsed) ? parsed : null;
}

function normalizeDateForPg(value: string | null | undefined): string | null {
  if (!value) return null;
  const parsed = parseImportYetiDateNoFuture(value);
  return parsed ? parsed.toISOString().slice(0, 10) : null;
}

// formatMonthKey, estimateBolTeu, estimateBolSpendUsd, buildRouteLabel
// moved into supabase/functions/_shared/importyeti_fetch.ts — they're now
// only needed by the snapshot-build path, which lives in the shared module.

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

// getLast12MonthKeys, parseTimeSeriesToMonthlyVolumes,
// applyRecentBolsFclLclSplits, buildTopRoutesFromRecentBols,
// pickTopSuppliers, buildSnapshotFromCompanyData all moved into
// supabase/functions/_shared/importyeti_fetch.ts (exported as
// buildParsedSummary). The reparseAll admin path below imports
// buildParsedSummary directly from the shared module.

// pickPhone stays here — buildCompanyProfileFromSnapshot (below) still
// needs it when shaping the user-facing companyProfile response from a
// cached raw payload.
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
  // Bumped cap from 25 → 50 so a query like "automotive" returns a richer
  // lead surface for sales discovery. The IY upstream returns a larger
  // pool by default; we just slice down to validatedPageSize, so this
  // doesn't add any extra upstream load — only what we expose to the UI.
  const validatedPageSize = Math.max(
    1,
    Math.min(50, Number.isFinite(pageSize) ? Number(pageSize) : 25),
  );
  const offset = (validatedPage - 1) * validatedPageSize;
  const searchTerm = q.trim();

  try {
    const url = new URL(env.searchUrl);
    url.searchParams.set("name", searchTerm);
    // Tell the upstream how many rows we actually want. Without this,
    // ImportYeti's DMA search defaults to ~10 results, which capped the
    // UI at 10 even after we lifted the proxy cap to 50. We mirror the
    // same pattern the bols endpoint uses (limit + offset).
    url.searchParams.set("limit", String(validatedPageSize));
    if (offset > 0) {
      url.searchParams.set("offset", String(offset));
    }

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

async function handleCompanyProfileAction(
  supabase: any,
  companyId: string,
  requestId: string,
  userId: string | null,
  orgId: string | null,
  forceRefresh: boolean,
) {
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("📦 COMPANY PROFILE REQUEST:", { requestId, companyId, forceRefresh });

  const env = buildEnvConfig();
  if (!env.isValid) {
    return jsonResponse(
      { ok: false, error: "ImportYeti API key not configured", code: "IY_API_KEY_MISSING" },
      500,
    );
  }

  const normalizedCompanyKey = normalizeCompanyKey(companyId);
  console.log("  Normalized slug:", normalizedCompanyKey);

  // Cached views are free for everyone (no quota burn). Only an explicit
  // refresh OR a true cache miss triggers the paid upstream call.
  if (!forceRefresh) {
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
  }

  // Cache miss OR explicit refresh: gate before upstream. Maps to
  // `company_profile_view` feature key (free trial: 10/month).
  if (userId) {
    const { data: gateData, error: gateErr } = await supabase.rpc("check_usage_limit", {
      p_org_id: orgId,
      p_user_id: userId,
      p_feature_key: "company_profile_view",
      p_quantity: 1,
    });
    if (gateErr) {
      console.error("[importyeti-proxy] profile gate rpc failed", gateErr);
    } else if (gateData && gateData.ok === false) {
      return jsonResponse(gateData, 403);
    }
  }

  try {
    // Delegate upstream fetch + parsed-summary build + snapshot upsert to the
    // shared module so the cron refresher (pulse-refresh-tick) writes the
    // exact same shape into lit_importyeti_company_snapshot. The user-JWT
    // gate + quota check above stay in this proxy.
    const fetchResult = await fetchAndUpsertSnapshot(
      supabase,
      normalizedCompanyKey,
      {
        IMPORTYETI_API_KEY: env.apiKey,
        IMPORTYETI_API_BASE: env.dmaBaseUrl,
      },
    );

    if (fetchResult.httpStatus === 404 || !fetchResult.parsedSummary) {
      console.error("❌ Company profile upstream 404", {
        requestId,
        company_id: normalizedCompanyKey,
      });
      return jsonResponse(
        {
          ok: false,
          error: "Company not found upstream",
          code: "COMPANY_NOT_FOUND",
        },
        404,
      );
    }

    const snapshot = fetchResult.parsedSummary as any;
    const rawPayload = fetchResult.rawPayload ?? {};

    const companyProfile = buildCompanyProfileFromSnapshot(
      snapshot,
      rawPayload,
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

    console.log("✅ Snapshot saved (via _shared/importyeti_fetch)", {
      requestId,
      company_id: normalizedCompanyKey,
      idempotent_key: normalizedCompanyKey,
    });

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

    // Consume profile-view quota only on successful upstream fetch.
    // Cache hits returned earlier without consuming. Failures below
    // throw and skip this block.
    if (userId) {
      try {
        await supabase.rpc("consume_usage", {
          p_org_id: orgId,
          p_user_id: userId,
          p_feature_key: "company_profile_view",
          p_quantity: 1,
          p_metadata: { company_id: normalizedCompanyKey, forced: forceRefresh },
        });
      } catch (consumeErr) {
        console.error("[importyeti-proxy] profile consume_usage failed", consumeErr);
      }
    }

    return jsonResponse({
      ok: true,
      source: "fresh",
      snapshot,
      companyProfile,
      raw: rawPayload,
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

// Phase 4 hotfix — admin-gated backfill that re-parses every saved
// `lit_importyeti_company_snapshot.raw_payload` through the corrected
// `buildSnapshotFromCompanyData` and writes back `parsed_summary` plus
// `lit_companies` KPI columns. Zero upstream ImportYeti calls. Used to
// repair the universal MM/DD-vs-DD/MM bug that collapsed every monthly
// bucket Feb–Dec into January.
//
// Auth: super-admin email allowlist (mirrors admin-marketing-api). Body
// `{ action: "reparseAll", limit?: number, only_company_id?: string }`.
const REPARSE_ADMIN_EMAILS = new Set([
  "vraymond@sparkfusiondigital.com",
  "support@logisticintel.com",
]);

async function handleReparseAll(
  supabase: any,
  body: any,
  requestId: string,
  userId: string | null,
): Promise<Response> {
  // Verify caller is allowlisted super-admin.
  if (!userId) {
    return jsonResponse({ ok: false, error: "Unauthorized", code: "UNAUTHORIZED" }, 401);
  }
  let callerEmail: string | null = null;
  try {
    const { data: u } = await supabase.auth.admin.getUserById(userId);
    callerEmail = u?.user?.email ?? null;
  } catch (e) {
    console.warn("[reparseAll] auth.admin lookup failed", e);
  }
  if (!callerEmail || !REPARSE_ADMIN_EMAILS.has(callerEmail.toLowerCase())) {
    return jsonResponse(
      { ok: false, error: "Forbidden — admin only", code: "FORBIDDEN" },
      403,
    );
  }

  const onlyCompanyId =
    typeof body?.only_company_id === "string" && body.only_company_id.trim()
      ? normalizeCompanyKey(body.only_company_id)
      : null;
  const limit =
    typeof body?.limit === "number" && body.limit > 0 ? Math.min(body.limit, 5000) : 5000;

  console.log("🔧 reparseAll begin", { requestId, onlyCompanyId, limit });

  let query = supabase
    .from("lit_importyeti_company_snapshot")
    .select("company_id, raw_payload")
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (onlyCompanyId) query = query.eq("company_id", onlyCompanyId);

  const { data: rows, error: readErr } = await query;
  if (readErr) {
    console.error("[reparseAll] read failed", readErr);
    return jsonResponse(
      { ok: false, error: readErr.message, code: "READ_FAILED" },
      500,
    );
  }
  if (!Array.isArray(rows) || rows.length === 0) {
    return jsonResponse({ ok: true, processed: 0, updated: 0, errors: [] });
  }

  const errors: Array<{ company_id: string; error: string }> = [];
  let updated = 0;
  let companiesUpdated = 0;
  const sample: Array<{
    company_id: string;
    shipments_last_12m: number | null;
    teu_last_12m: number | null;
    monthly_buckets: number;
    last_shipment_date: string | null;
  }> = [];

  for (const row of rows as Array<{ company_id: string; raw_payload: any }>) {
    try {
      const rawData = row?.raw_payload?.data ?? row?.raw_payload ?? {};
      if (!rawData || typeof rawData !== "object") {
        errors.push({ company_id: row.company_id, error: "missing raw_payload.data" });
        continue;
      }

      const reparsed = buildParsedSummary(row.company_id, rawData) as any;
      const now = new Date().toISOString();

      const { error: snapErr } = await supabase
        .from("lit_importyeti_company_snapshot")
        .update({ parsed_summary: reparsed, updated_at: now })
        .eq("company_id", row.company_id);

      if (snapErr) {
        errors.push({ company_id: row.company_id, error: snapErr.message });
        continue;
      }
      updated++;
      if (sample.length < 10) {
        const monthlyBuckets =
          reparsed?.monthly_volumes && typeof reparsed.monthly_volumes === "object"
            ? Object.keys(reparsed.monthly_volumes).length
            : 0;
        sample.push({
          company_id: row.company_id,
          shipments_last_12m: reparsed?.shipments_last_12m ?? null,
          teu_last_12m: reparsed?.route_kpis?.teuLast12m ?? null,
          monthly_buckets: monthlyBuckets,
          last_shipment_date: reparsed?.last_shipment_date ?? null,
        });
      }

      // Propagate corrected KPIs into lit_companies so Command Center +
      // dashboard see them without users opening each profile.
      const slug = String(row.company_id);
      const candidates = Array.from(
        new Set([
          slug,
          `company/${slug}`,
          slug.replace(/^company\//, ""),
        ].filter(Boolean)),
      );
      const companyUpdate: Record<string, any> = {
        shipments_12m:
          reparsed?.route_kpis?.shipmentsLast12m ??
          reparsed?.shipments_last_12m ??
          null,
        teu_12m: reparsed?.route_kpis?.teuLast12m ?? reparsed?.total_teu ?? null,
        fcl_shipments_12m: reparsed?.fcl_count ?? null,
        lcl_shipments_12m: reparsed?.lcl_count ?? null,
        est_spend_12m:
          reparsed?.route_kpis?.estSpendUsd12m ?? reparsed?.est_spend ?? null,
        most_recent_shipment_date: normalizeDateForPg(
          reparsed?.last_shipment_date,
        ),
        top_route_12m: reparsed?.route_kpis?.topRouteLast12m ?? null,
        recent_route: reparsed?.route_kpis?.mostRecentRoute ?? null,
      };
      const cleaned = Object.fromEntries(
        Object.entries(companyUpdate).filter(
          ([, v]) => v !== null && v !== undefined,
        ),
      );
      if (Object.keys(cleaned).length > 0) {
        const { error: companyErr, count } = await supabase
          .from("lit_companies")
          .update(cleaned, { count: "exact" })
          .in("source_company_key", candidates);
        if (companyErr) {
          console.warn(
            "[reparseAll] lit_companies update failed",
            row.company_id,
            companyErr.message,
          );
        } else if ((count ?? 0) > 0) {
          companiesUpdated += count ?? 0;
        }
      }
    } catch (e: any) {
      errors.push({ company_id: row.company_id, error: String(e?.message ?? e) });
    }
  }

  console.log("🔧 reparseAll complete", {
    requestId,
    processed: rows.length,
    snapshots_updated: updated,
    companies_updated: companiesUpdated,
    errors: errors.length,
  });

  return jsonResponse({
    ok: true,
    processed: rows.length,
    snapshots_updated: updated,
    companies_updated: companiesUpdated,
    errors,
    sample,
  });
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

    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!token) {
      return jsonResponse(
        { ok: false, error: "Missing authorization", code: "UNAUTHORIZED" },
        401,
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    let userId: string | null = null;
    try {
      const { data: userData } = await supabase.auth.getUser(token);
      userId = userData?.user?.id ?? null;
    } catch (authError: any) {
      console.error("❌ Auth validation failed:", { requestId, error: authError?.message || authError });
      return jsonResponse(
        { ok: false, error: "Invalid authorization token", code: "UNAUTHORIZED" },
        401,
      );
    }
    if (!userId) {
      return jsonResponse(
        { ok: false, error: "Unauthorized", code: "UNAUTHORIZED" },
        401,
      );
    }

    let body: any = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    const { action, company_id, companyKey, q, page, pageSize, refresh } = body ?? {};
    const requestedCompanyId = company_id || companyKey;
    const resolvedAction = action ?? (requestedCompanyId ? "companyProfile" : undefined);
    // Explicit "Refresh Intel" passes refresh:true (or action:"refresh"),
    // which forces an upstream fetch and consumes company_profile_view
    // quota. Implicit page-load profile fetches use the cache and never
    // consume quota.
    const forceRefresh = Boolean(refresh) || resolvedAction === "refresh";

    console.log("➡️ importyeti-proxy request:", {
      requestId,
      method: req.method,
      action: resolvedAction,
      company_id: requestedCompanyId ?? null,
      q: typeof q === "string" ? q : null,
      refresh: forceRefresh,
    });

    // Resolve org_id once; used by both search and profile gates below.
    let orgIdForUsage: string | null = null;
    try {
      const { data: orgRow } = await supabase
        .from("org_members")
        .select("org_id")
        .eq("user_id", userId)
        .order("joined_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      orgIdForUsage = orgRow?.org_id ?? null;
    } catch { /* ignore */ }

    // ── Usage gate (search) ─────────────────────────────────────────────
    if (resolvedAction === "search") {
      const { data: gateData, error: gateError } = await supabase.rpc("check_usage_limit", {
        p_org_id: orgIdForUsage,
        p_user_id: userId,
        p_feature_key: "company_search",
        p_quantity: 1,
      });
      if (gateError) {
        console.error("[importyeti-proxy] gate rpc failed", gateError);
      } else if (gateData && gateData.ok === false) {
        return jsonResponse(gateData, 403);
      }
    }

    if (resolvedAction === "search") {
      const searchResp = await handleSearchAction(supabase, q, page, pageSize, requestId);
      // Consume only on a successful upstream call.
      if (searchResp.status >= 200 && searchResp.status < 300) {
        try {
          await supabase.rpc("consume_usage", {
            p_org_id: orgIdForUsage,
            p_user_id: userId,
            p_feature_key: "company_search",
            p_quantity: 1,
            p_metadata: { q: typeof q === "string" ? q : null, page: page ?? null },
          });
        } catch (consumeErr) {
          console.error("[importyeti-proxy] consume_usage failed", consumeErr);
        }
      }
      return searchResp;
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

    if (resolvedAction === "reparseAll" || resolvedAction === "reparse") {
      // Admin-gated backfill. Re-runs `buildSnapshotFromCompanyData`
      // against every existing snapshot's `raw_payload` and writes the
      // corrected `parsed_summary` back. Also propagates the corrected
      // KPI columns into `lit_companies` so Command Center / dashboard
      // see right numbers without each user clicking Refresh.
      // No upstream ImportYeti calls. No quota burn.
      return await handleReparseAll(supabase, body, requestId, userId);
    }

    if (
      resolvedAction === "company" ||
      resolvedAction === "companyProfile" ||
      resolvedAction === "companySnapshot" ||
      resolvedAction === "refresh"
    ) {
      return await handleCompanyProfileAction(
        supabase,
        requestedCompanyId,
        requestId,
        userId,
        orgIdForUsage,
        forceRefresh,
      );
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