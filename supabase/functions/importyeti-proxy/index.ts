import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

const IY_BASE_URL = "https://data.importyeti.com/v1.0";
const IY_API_KEY = (Deno.env.get("IY_API_KEY") || "").trim();
const SNAPSHOT_TTL_DAYS = 30;

type MonthlyPoint = {
  month: string;
  fclShipments: number;
  lclShipments: number;
};

type TopRoute = {
  route: string;
  shipments: number;
  teu: number | null;
  fclShipments: number | null;
  lclShipments: number | null;
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body = await req.json();
    const { action, company_id, companyKey, q, page, pageSize } = body;

    if (action === "search") {
      return handleSearchAction(q, page, pageSize);
    }

    const requestedCompanyId = company_id || companyKey;

    if (!requestedCompanyId) {
      return jsonResponse(
        { error: "company_id is required" },
        400,
      );
    }

    if (action === "companyBols") {
      return handleCompanyBolsAction(supabase, requestedCompanyId);
    }

    if (
      action === "company" ||
      action === "companyProfile" ||
      action === "companySnapshot"
    ) {
      return handleCompanyProfileAction(supabase, requestedCompanyId);
    }

    return jsonResponse(
      { error: `Unknown action: ${action}` },
      400,
    );
  } catch (error: any) {
    console.error("❌ Fatal error:", error);
    return jsonResponse(
      { error: error.message || "Internal server error" },
      500,
    );
  }
});

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

async function handleCompanyProfileAction(supabase: any, companyId: string) {
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("📦 COMPANY PROFILE REQUEST:", companyId);

  const normalizedCompanyKey = normalizeCompanyKey(companyId);
  console.log("  Normalized slug:", normalizedCompanyKey);

  const { data: existingSnapshot, error: fetchError } = await supabase
    .from("lit_importyeti_company_snapshot")
    .select("*")
    .eq("company_id", normalizedCompanyKey)
    .maybeSingle();

  if (fetchError) {
    console.error("❌ Snapshot fetch error:", fetchError);
  }

  const now = new Date();
  const snapshotAge = existingSnapshot
    ? (now.getTime() - new Date(existingSnapshot.updated_at).getTime()) /
      (1000 * 60 * 60 * 24)
    : Infinity;

  console.log("📅 Snapshot age:", snapshotAge.toFixed(1), "days");

  if (existingSnapshot && snapshotAge < SNAPSHOT_TTL_DAYS) {
    console.log("✅ Using cached snapshot");
    const cachedProfile = buildCompanyProfileFromSnapshot(
      existingSnapshot.parsed_summary,
      existingSnapshot.raw_payload,
      normalizedCompanyKey,
    );

    return jsonResponse({
      ok: true,
      source: "cache",
      snapshot: existingSnapshot.parsed_summary,
      companyProfile: cachedProfile,
      raw: existingSnapshot.raw_payload,
      cached_at: existingSnapshot.updated_at,
    });
  }

  console.log("🌐 Fetching from ImportYeti");
  const iyUrl = `${IY_BASE_URL}/company/${normalizedCompanyKey}`;

  console.log("  URL:", iyUrl);
  console.log("  Auth: IYApiKey");

  const iyResponse = await fetch(iyUrl, {
    method: "GET",
    headers: {
      IYApiKey: IY_API_KEY,
      Accept: "application/json",
    },
  });

  if (!iyResponse.ok) {
    const errorText = await iyResponse.text();
    console.error("❌ ImportYeti error:", iyResponse.status, errorText);
    return jsonResponse(
      {
        error: "ImportYeti API error",
        status: iyResponse.status,
        details: errorText,
      },
      iyResponse.status,
    );
  }

  const rawPayload = await iyResponse.json();
  console.log("✅ ImportYeti response received");

  const parsedSummary = parseCompanySnapshot(rawPayload, normalizedCompanyKey);
  const companyProfile = buildCompanyProfileFromSnapshot(
    parsedSummary,
    rawPayload,
    normalizedCompanyKey,
  );

  console.log("📊 Parsed profile:", {
    shipmentsLast12m: companyProfile.routeKpis?.shipmentsLast12m,
    teuLast12m: companyProfile.routeKpis?.teuLast12m,
    estSpendUsd12m: companyProfile.routeKpis?.estSpendUsd12m,
    timeSeriesPoints: companyProfile.timeSeries?.length,
    topRoutes: companyProfile.routeKpis?.topRoutesLast12m?.length,
  });

  const { error: upsertError } = await supabase
    .from("lit_importyeti_company_snapshot")
    .upsert({
      company_id: normalizedCompanyKey,
      raw_payload: rawPayload,
      parsed_summary: parsedSummary,
      updated_at: now.toISOString(),
    });

  if (upsertError) {
    console.error("❌ Snapshot save error:", upsertError);
  } else {
    console.log("✅ Snapshot saved");
  }

  const { error: indexError } = await supabase
    .from("lit_company_index")
    .upsert({
      company_id: normalizedCompanyKey,
      company_name: companyProfile.title || normalizedCompanyKey,
      country: companyProfile.countryCode || null,
      city: companyProfile.address || null,
      last_shipment_date: companyProfile.lastShipmentDate || null,
      total_shipments: companyProfile.totalShipments || 0,
      total_teu: companyProfile.routeKpis?.teuLast12m || 0,
      updated_at: now.toISOString(),
    });

  if (indexError) {
    console.error("❌ Index update error:", indexError);
  } else {
    console.log("✅ Search index updated");
  }

  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  return jsonResponse({
    ok: true,
    source: "importyeti",
    snapshot: parsedSummary,
    companyProfile,
    raw: rawPayload,
    fetched_at: now.toISOString(),
  });
}

async function handleCompanyBolsAction(supabase: any, company_id: string) {
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("📋 COMPANY BOLS REQUEST:", company_id);

  const normalizedCompanyKey = normalizeCompanyKey(company_id);
  console.log("  Normalized slug:", normalizedCompanyKey);

  const { data: snapshot, error } = await supabase
    .from("lit_importyeti_company_snapshot")
    .select("*")
    .eq("company_id", normalizedCompanyKey)
    .maybeSingle();

  if (error) {
    console.error("❌ Snapshot fetch error:", error);
    return jsonResponse({ ok: false, error: "Failed to fetch snapshot" }, 500);
  }

  if (!snapshot) {
    console.log("⚠️ No snapshot found - fetching fresh data");
    const iyUrl = `${IY_BASE_URL}/company/${normalizedCompanyKey}`;
    const iyResponse = await fetch(iyUrl, {
      method: "GET",
      headers: {
        IYApiKey: IY_API_KEY,
        Accept: "application/json",
      },
    });

    if (!iyResponse.ok) {
      return jsonResponse({ ok: false, error: "Company not found" }, 404);
    }

    const rawPayload = await iyResponse.json();
    const data = rawPayload.data || rawPayload;
    const rows = Array.isArray(data.recent_bols) ? data.recent_bols : [];

    console.log("✅ BOLs fetched:", rows.length);
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    return jsonResponse({
      ok: true,
      rows,
      total: rows.length,
    });
  }

  const rawPayload = snapshot.raw_payload || {};
  const data = rawPayload.data || rawPayload;
  const rows = Array.isArray(data.recent_bols) ? data.recent_bols : [];

  console.log("✅ BOLs from cache:", rows.length);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  return jsonResponse({
    ok: true,
    rows,
    total: rows.length,
    cached_at: snapshot.updated_at,
  });
}

async function handleSearchAction(
  q: string,
  page: number = 1,
  pageSize: number = 25,
) {
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("🔍 SEARCH REQUEST:", { q, page, pageSize });

  if (!q || typeof q !== "string" || q.trim().length === 0) {
    return jsonResponse(
      { ok: false, error: "Query (q) is required and must be non-empty" },
      400,
    );
  }

  if (!IY_API_KEY) {
    console.error("❌ IY_API_KEY not configured");
    return jsonResponse(
      { ok: false, error: "ImportYeti API key not configured" },
      500,
    );
  }

  try {
    const validatedPage = Math.max(1, Number.isFinite(page) ? Number(page) : 1);
    const validatedPageSize = Math.max(
      1,
      Math.min(100, Number.isFinite(pageSize) ? Number(pageSize) : 25),
    );
    const offset = (validatedPage - 1) * validatedPageSize;

    const url = new URL(`${IY_BASE_URL}/company/search`);
    url.searchParams.set("name", q.trim());
    url.searchParams.set("page_size", String(validatedPageSize));
    url.searchParams.set("offset", String(offset));

    const iyUrl = url.toString();

    console.log("  METHOD: GET");
    console.log("  URL:", iyUrl);
    console.log("  Auth: IYApiKey");

    const iyResponse = await fetch(iyUrl, {
      method: "GET",
      headers: {
        IYApiKey: IY_API_KEY,
        Accept: "application/json",
      },
    });

    if (!iyResponse.ok) {
      const errorText = await iyResponse.text();
      console.error("❌ ImportYeti error:", iyResponse.status, errorText);
      return jsonResponse(
        {
          ok: false,
          error: "ImportYeti API error",
          status: iyResponse.status,
          details: errorText,
        },
        iyResponse.status,
      );
    }

    const rawPayload = await iyResponse.json();
    console.log("✅ ImportYeti response received");

    const results = Array.isArray(rawPayload?.results)
      ? rawPayload.results
      : Array.isArray(rawPayload?.data)
      ? rawPayload.data
      : Array.isArray(rawPayload)
      ? rawPayload
      : [];

    const total =
      rawPayload?.total ?? rawPayload?.pagination?.total ?? results.length;

    console.log("📊 Search result:", {
      results_count: results.length,
      total,
      page: validatedPage,
      pageSize: validatedPageSize,
    });

    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    return jsonResponse({
      ok: true,
      results,
      page: validatedPage,
      pageSize: validatedPageSize,
      total,
    });
  } catch (error: any) {
    console.error("❌ Search handler error:", error);
    return jsonResponse(
      { ok: false, error: error.message || "Search failed" },
      500,
    );
  }
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

function parseImportYetiDate(value: unknown): Date | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const trimmed = value.trim();

  const ddmmyyyy = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (ddmmyyyy) {
    const [, day, month, year] = ddmmyyyy;
    const d = new Date(`${year}-${month}-${day}T00:00:00Z`);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatMonthKey(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
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

function estimateBolTeu(bol: any): number {
  const explicit =
    normalizeNumber(bol?.total_teu) ??
    normalizeNumber(bol?.container_teu) ??
    normalizeNumber(bol?.teu) ??
    normalizeNumber(bol?.containers_count);

  if (explicit != null) return explicit;

  if (bol?.lcl === true) return 0;
  if (bol?.lcl === false) return 1;

  return 0;
}

function buildRouteLabel(bol: any): string | null {
  const origin =
    normalizeString(bol?.origin_port) ??
    normalizeString(bol?.supplier_address_loc) ??
    normalizeString(bol?.supplier_address_location) ??
    normalizeString(bol?.place_of_receipt);

  const dest =
    normalizeString(bol?.destination_port) ??
    normalizeString(bol?.Consignee_Address) ??
    normalizeString(bol?.company_address_loc) ??
    normalizeString(bol?.company_address_location);

  if (origin && dest) return `${origin} → ${dest}`;
  if (origin) return origin;
  if (dest) return dest;
  return null;
}

function buildLast12MonthsSeries(): MonthlyPoint[] {
  const points: MonthlyPoint[] = [];
  const now = new Date();

  for (let i = 11; i >= 0; i--) {
    const d = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1),
    );
    points.push({
      month: formatMonthKey(d),
      fclShipments: 0,
      lclShipments: 0,
    });
  }

  return points;
}

function parseCompanySnapshot(raw: any, companyKey: string): any {
  const data = raw?.data || raw || {};
  const recentBols = Array.isArray(data.recent_bols) ? data.recent_bols : [];

  const last12Series = buildLast12MonthsSeries();
  const monthMap = new Map(last12Series.map((point) => [point.month, point]));

  const now = new Date();
  const oneYearAgo = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1),
  );

  let fclCount = 0;
  let lclCount = 0;
  let totalTeu12m = 0;
  let shipmentsLast12m = 0;
  let lastShipmentDate: string | null = null;
  let lastShipmentTs = -Infinity;

  const routeStats = new Map<
    string,
    { shipments: number; teu: number; fcl: number; lcl: number }
  >();
  const supplierSet = new Set<string>();

  for (const bol of recentBols) {
    const bolDate = parseImportYetiDate(
      bol?.date_formatted ?? bol?.arrival_date ?? bol?.date,
    );
    if (!bolDate) continue;

    const bolTs = bolDate.getTime();
    const monthKey = formatMonthKey(bolDate);
    const isLast12m = bolDate >= oneYearAgo;

    if (!isLast12m) continue;

    shipmentsLast12m += 1;

    if (bolTs > lastShipmentTs) {
      lastShipmentTs = bolTs;
      lastShipmentDate = bolDate.toISOString().slice(0, 10);
    }

    const teu = estimateBolTeu(bol);
    totalTeu12m += teu;

    const isLcl = bol?.lcl === true;
    if (isLcl) lclCount += 1;
    else fclCount += 1;

    const monthPoint = monthMap.get(monthKey);
    if (monthPoint) {
      if (isLcl) monthPoint.lclShipments += 1;
      else monthPoint.fclShipments += 1;
    }

    const route = buildRouteLabel(bol);
    if (route) {
      const current = routeStats.get(route) || {
        shipments: 0,
        teu: 0,
        fcl: 0,
        lcl: 0,
      };
      current.shipments += 1;
      current.teu += teu;
      if (isLcl) current.lcl += 1;
      else current.fcl += 1;
      routeStats.set(route, current);
    }

    const supplier =
      normalizeString(bol?.supplier_name) ??
      normalizeString(bol?.shipper_name) ??
      normalizeString(bol?.supplier_address_loc);

    if (supplier) {
      supplierSet.add(supplier);
    }
  }

  const topRoutes: TopRoute[] = Array.from(routeStats.entries())
    .sort((a, b) => b[1].shipments - a[1].shipments)
    .slice(0, 10)
    .map(([route, stats]) => ({
      route,
      shipments: stats.shipments,
      teu: stats.teu || null,
      fclShipments: stats.fcl || null,
      lclShipments: stats.lcl || null,
    }));

  const estSpend =
    normalizeNumber(data?.total_shipping_cost) ??
    normalizeNumber(data?.estimated_spend_12m) ??
    0;

  const title =
    normalizeString(data?.title) ??
    normalizeString(data?.name) ??
    companyKey;

  const website = normalizeString(data?.website);
  const address =
    normalizeString(data?.address_plain) ??
    normalizeString(data?.address) ??
    normalizeString(data?.city);

  const countryCode =
    normalizeString(data?.country_code) ??
    normalizeString(data?.countryCode) ??
    normalizeString(data?.country);

  return {
    company_id: companyKey,
    key: `company/${companyKey}`,
    company_name: title,
    title,
    name: title,
    website,
    address,
    country_code: countryCode,
    total_shipments: shipmentsLast12m,
    shipments_last_12m: shipmentsLast12m,
    total_teu: Math.round(totalTeu12m * 10) / 10,
    est_spend: estSpend,
    fcl_count: fclCount,
    lcl_count: lclCount,
    last_shipment_date: lastShipmentDate,
    monthly_volumes: Object.fromEntries(
      last12Series.map((point) => [
        point.month,
        { fcl: point.fclShipments, lcl: point.lclShipments },
      ]),
    ),
    top_routes: topRoutes,
    top_suppliers: Array.from(supplierSet).slice(0, 10),
    route_kpis: {
      shipmentsLast12m,
      teuLast12m: Math.round(totalTeu12m * 10) / 10,
      estSpendUsd12m: estSpend,
      topRouteLast12m: topRoutes[0]?.route ?? null,
      mostRecentRoute: topRoutes[0]?.route ?? null,
      sampleSize: shipmentsLast12m,
      topRoutesLast12m: topRoutes,
    },
  };
}

function buildCompanyProfileFromSnapshot(
  snapshot: any,
  rawPayload: any,
  companyKey: string,
) {
  const raw = rawPayload?.data || rawPayload || {};
  const monthlyVolumes = snapshot?.monthly_volumes || {};

  const timeSeries: MonthlyPoint[] = Object.entries(monthlyVolumes)
    .map(([month, value]: [string, any]) => ({
      month,
      fclShipments: normalizeNumber(value?.fcl) ?? 0,
      lclShipments: normalizeNumber(value?.lcl) ?? 0,
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

  const website = normalizeString(raw?.website) ?? normalizeString(snapshot?.website);
  const rawDomain =
    website &&
    (() => {
      try {
        const parsed = new URL(
          website.startsWith("http") ? website : `https://${website}`,
        );
        return parsed.hostname.replace(/^www\./i, "");
      } catch {
        return null;
      }
    })();

  const title =
    normalizeString(raw?.title) ??
    normalizeString(raw?.name) ??
    normalizeString(snapshot?.title) ??
    normalizeString(snapshot?.company_name) ??
    companyKey;

  const normalizedCompanyKey = `company/${companyKey}`;

  return {
    key: normalizedCompanyKey,
    companyId: normalizedCompanyKey,
    name: title,
    title,
    domain: rawDomain,
    website,
    phoneNumber:
      normalizeString(raw?.phone) ??
      normalizeString(raw?.phone_number) ??
      null,
    phone:
      normalizeString(raw?.phone) ??
      normalizeString(raw?.phone_number) ??
      null,
    address:
      normalizeString(raw?.address_plain) ??
      normalizeString(raw?.address) ??
      normalizeString(snapshot?.address) ??
      null,
    countryCode:
      normalizeString(raw?.country_code) ??
      normalizeString(raw?.countryCode) ??
      normalizeString(raw?.country) ??
      normalizeString(snapshot?.country_code) ??
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
    containers_load: [
      {
        load_type: "FCL",
        shipments: containers.fclShipments12m,
      },
      {
        load_type: "LCL",
        shipments: containers.lclShipments12m,
      },
    ],
    top_routes: Array.isArray(snapshot?.top_routes) ? snapshot.top_routes : [],
    most_recent_route: routeKpis.mostRecentRoute
      ? { route: routeKpis.mostRecentRoute }
      : null,
    suppliers_sample: Array.isArray(snapshot?.top_suppliers)
      ? snapshot.top_suppliers
      : [],
  };
}
