import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { createHash } from "node:crypto";

export const config = {
  verify_jwt: false,
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const IY_BASE_URL = Deno.env.get("IY_DMA_BASE_URL") || "https://data.importyeti.com/v1.0";
const IY_API_KEY = Deno.env.get("IY_API_KEY") || "";

console.log("🔑 API KEY CHECK:");
console.log("  IY_API_KEY present:", !!IY_API_KEY);
console.log("  IY_API_KEY length:", IY_API_KEY?.length || 0);
console.log("  First 10 chars:", IY_API_KEY?.substring(0, 10) || "MISSING");

const RATE_LIMITS = {
  searchShippers: { max: 50, window: 60 },
  companyBols: { max: 30, window: 60 },
  companyProfile: { max: 100, window: 60 },
  companyStats: { max: 100, window: 60 },
};

const CACHE_TTL = {
  searchShippers: 3600,
  companyBols: 1800,
  companyProfile: 86400,
  companyStats: 21600,
};

interface ImportYetiRequest {
  endpoint: string;
  method?: string;
  params?: Record<string, any>;
  body?: Record<string, any>;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const authHeader = req.headers.get("authorization");
  console.log("AUTH HEADER RECEIVED:", authHeader);

  const startTime = Date.now();

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Allow requests without auth for now (JWT verification is disabled)
    let user: any = null;

    if (authHeader) {
      try {
        const { data, error: authError } = await supabase.auth.getUser(
          authHeader.replace("Bearer ", "")
        );
        if (data?.user) {
          user = data.user;
        }
      } catch (err) {
        console.log("Auth check failed, continuing without user:", err);
      }
    }

    // Create anonymous user ID for logging if no auth
    const userId = user?.id || "anonymous";

    const body = await req.json();
    const { action, ...payload } = body;

    console.log("ACTION:", action);

    if (!action) {
      return new Response(
        JSON.stringify({ error: "Missing action parameter" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const endpoint = action;
    const requestData: ImportYetiRequest = { endpoint, method: "POST", body: payload };

    const cacheKey = generateCacheKey(endpoint, payload);

    const cached = await getFromCache(supabase, cacheKey);
    if (cached) {
      await logApiRequest(supabase, userId, endpoint, true, Date.now() - startTime, 200);
      return new Response(
        JSON.stringify({ ...cached, _cached: true }),
        {
          status: 200,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
            "X-Cache": "HIT",
          },
        }
      );
    }

    const rateLimitConfig = RATE_LIMITS[endpoint as keyof typeof RATE_LIMITS];
    if (rateLimitConfig) {
      const allowed = await checkRateLimit(
        supabase,
        userId,
        endpoint,
        rateLimitConfig.max,
        rateLimitConfig.window
      );
      if (!allowed) {
        await logApiRequest(supabase, userId, endpoint, false, Date.now() - startTime, 429);
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded", retryAfter: rateLimitConfig.window }),
          {
            status: 429,
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
              "Retry-After": String(rateLimitConfig.window),
            },
          }
        );
      }
    }

    let response;
    switch (action) {
      case "searchShippers":
        response = await handleSearchShippers(payload);
        break;
      case "companyBols":
        response = await handleCompanyBols(payload);
        break;
      case "companyProfile":
        response = await handleCompanyProfile(payload);
        break;
      case "companyStats":
        response = await handleCompanyStats(payload);
        break;
      default:
        return new Response(
          JSON.stringify({ error: `Invalid action: ${action}` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }

    await cacheCompanyData(supabase, response, payload);

    const ttl = CACHE_TTL[endpoint as keyof typeof CACHE_TTL] || 3600;
    await saveToCache(supabase, cacheKey, endpoint, payload, response, ttl);

    await logApiRequest(supabase, userId, endpoint, false, Date.now() - startTime, 200);

    return new Response(
      JSON.stringify({ ...response, _cached: false }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
          "X-Cache": "MISS",
        },
      }
    );
  } catch (error: any) {
    console.error("ImportYeti proxy error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      {
        status: error.status || 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

function generateCacheKey(endpoint: string, params: Record<string, any>): string {
  const sorted = Object.keys(params)
    .sort()
    .reduce((acc, key) => ({ ...acc, [key]: params[key] }), {});
  const hash = createHash("sha256")
    .update(`${endpoint}:${JSON.stringify(sorted)}`)
    .digest("hex");
  return hash;
}

async function getFromCache(supabase: any, cacheKey: string): Promise<any | null> {
  const { data, error } = await supabase
    .rpc("get_cache", { p_cache_key: cacheKey });

  if (error || !data) return null;
  return data;
}

async function saveToCache(
  supabase: any,
  cacheKey: string,
  endpoint: string,
  params: Record<string, any>,
  response: any,
  ttl: number
): Promise<void> {
  const paramsHash = createHash("sha256").update(JSON.stringify(params)).digest("hex");
  const expiresAt = new Date(Date.now() + ttl * 1000).toISOString();

  await supabase
    .from("lit_importyeti_cache")
    .upsert({
      cache_key: cacheKey,
      endpoint,
      params_hash: paramsHash,
      request_params: params,
      response_data: response,
      expires_at: expiresAt,
      status_code: 200,
    });
}

async function checkRateLimit(
  supabase: any,
  userId: string,
  endpoint: string,
  maxRequests: number,
  windowMinutes: number
): Promise<boolean> {
  const { data, error } = await supabase
    .rpc("check_rate_limit", {
      p_user_id: userId,
      p_endpoint: endpoint,
      p_max_requests: maxRequests,
      p_window_minutes: windowMinutes,
    });

  if (error) {
    console.error("Rate limit check error:", error);
    return true;
  }

  return data === true;
}

async function logApiRequest(
  supabase: any,
  userId: string,
  endpoint: string,
  cacheHit: boolean,
  responseTimeMs: number,
  statusCode: number
): Promise<void> {
  await supabase
    .from("lit_api_logs")
    .insert({
      user_id: userId,
      endpoint,
      method: "POST",
      cache_hit: cacheHit,
      response_time_ms: responseTimeMs,
      status_code: statusCode,
    });
}

async function iyGet<T>(path: string): Promise<T> {
  if (!IY_API_KEY) {
    throw new Error("IY_API_KEY not configured");
  }

  const url = `${IY_BASE_URL}${path}`;

  console.log("🌐 ImportYeti Request:");
  console.log("  URL:", url);
  console.log("  Method: GET");
  console.log("  Has API Key:", !!IY_API_KEY);
  console.log("  API Key length:", IY_API_KEY?.length || 0);

  const resp = await fetch(url, {
    method: "GET",
    headers: {
      accept: "application/json",
      IYApiKey: IY_API_KEY,
    },
  });

  const text = await resp.text();
  let json: any = {};

  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = { raw: text };
    }
  }

  if (!resp.ok) {
    const message = json?.message || text || resp.statusText;
    console.error("❌ ImportYeti API Error:");
    console.error("  Status:", resp.status);
    console.error("  URL:", url);
    console.error("  Response:", JSON.stringify(json).substring(0, 200));
    console.error("  Has API Key:", !!IY_API_KEY);
    throw new Error(`ImportYeti ${resp.status}: ${message}`);
  }

  console.log("✅ ImportYeti Response:", resp.status);

  return json as T;
}

async function handleSearchShippers(body: any) {
  const q = body.q || body.query || "";
  const page = typeof body.page === "number" ? body.page : 1;
  const pageSize = typeof body.pageSize === "number" ? body.pageSize : body.limit || 50;

  const trimmed = q.trim();

  console.log("═══════════════════════════════════════");
  console.log("🔵 [SEARCH] Company Search Request");
  console.log("  Query:", trimmed);
  console.log("  Page:", page);
  console.log("  Page Size:", pageSize);

  if (!trimmed || typeof trimmed !== "string") {
    console.log("  ⚠️ Empty query - returning empty results");
    return {
      ok: true,
      rows: [],
      total: 0,
      meta: { q: trimmed, page, pageSize },
      data: { rows: [], total: 0 },
    };
  }

  if (!IY_API_KEY) {
    throw new Error("IY_API_KEY not configured");
  }

  const offset = (page - 1) * pageSize;
  const url =
    `${IY_BASE_URL}/company/search` +
    `?page_size=${pageSize}` +
    `&offset=${offset}` +
    `&name=${encodeURIComponent(trimmed)}`;

  console.log("  Request URL:", url);
  console.log("  Method: GET");

  const resp = await fetch(url, {
    method: "GET",
    headers: {
      accept: "application/json",
      IYApiKey: IY_API_KEY,
    },
  });

  const text = await resp.text();
  let json: any = {};

  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = { raw: text };
    }
  }

  if (!resp.ok) {
    const message = json?.message || text || resp.statusText;
    throw new Error(`ImportYeti ${resp.status}: ${message}`);
  }

  const allRows = Array.isArray(json.data) ? json.data : [];
  const total = json.total ?? allRows.length;

  console.log("✅ [SEARCH] Company Search Complete");
  console.log("  Total Results:", total);
  console.log("  Rows Returned:", allRows.length);

  const normalizedRows = allRows.map((row: any, index: number) => {
    const fallbackTitle = row?.title ?? row?.name ?? row?.company_name ?? `Company ${index + 1}`;
    const normalizedTitle = typeof fallbackTitle === "string" ? fallbackTitle : `Company ${index + 1}`;

    const slugFromTitle = (() => {
      const base = normalizedTitle.toLowerCase().trim();
      if (!base) return `company-${index + 1}`;
      return base.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    })();

    const key = row?.key ?? row?.slug ?? row?.company_slug ?? row?.company_id ??
      (slugFromTitle ? `company/${slugFromTitle}` : `company-${index + 1}`);

    if (index === 0) {
      console.log("  First Company Key:", key);
    }

    const rawWebsite = row?.website ?? row?.company_website ?? row?.url ?? row?.company_url ?? null;
    const website = typeof rawWebsite === "string" && rawWebsite.trim().length ? rawWebsite.trim() : null;

    const rawPhone = row?.phone ?? row?.company_phone ?? row?.phone_number ?? row?.company_phone_number ?? null;
    const phone = typeof rawPhone === "string" && rawPhone.trim().length ? rawPhone.trim() : null;

    let domain = row?.domain ?? row?.company_domain ?? row?.website_domain ?? null;
    if (!domain && website) {
      try {
        const parsed = new URL(website.startsWith("http") ? website : `https://${website}`);
        domain = parsed.hostname;
      } catch {}
    }

    const derivedAddress = [
      row?.address_line1,
      row?.city ?? row?.company_city,
      row?.state ?? row?.company_state,
      row?.postal_code ?? row?.zip ?? row?.company_zip,
      row?.country ?? row?.company_country,
    ].filter((part) => typeof part === "string" && part.trim().length).join(", ");

    const address = row?.address ?? row?.full_address ?? row?.company_address ?? (derivedAddress || null);

    const totalShipments = row?.totalShipments ?? row?.total_shipments ?? row?.shipments_12m ??
      row?.shipmentsLast12m ?? row?.shipments_last_12m ?? null;

    const mostRecentShipment = row?.mostRecentShipment ?? row?.last_shipment_date ??
      row?.most_recent_shipment ?? row?.lastShipmentDate ?? null;

    const topSuppliers = Array.isArray(row?.topSuppliers) ? row.topSuppliers :
      Array.isArray(row?.top_suppliers) ? row.top_suppliers : null;

    return {
      title: normalizedTitle,
      countryCode: row?.countryCode ?? row?.country_code ?? row?.company_country_code ?? null,
      type: row?.type ?? row?.company_type ?? null,
      address,
      totalShipments,
      mostRecentShipment,
      topSuppliers,
      key,
      website,
      phone,
      domain,
    };
  });

  return {
    ok: true,
    rows: normalizedRows,
    total,
    meta: { q: trimmed, page, pageSize },
    data: { rows: normalizedRows, total },
  };
}

function toImportYetiDate(input: string | Date): string {
  let date: Date;

  if (input instanceof Date) {
    date = input;
  } else if (typeof input === 'string') {
    // Handle ISO format YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(input)) {
      date = new Date(input + 'T00:00:00Z');
    } else if (/^\d{2}\/\d{2}\/\d{4}$/.test(input)) {
      // Already in MM/DD/YYYY format
      return input;
    } else {
      date = new Date(input);
    }
  } else {
    return "";
  }

  if (isNaN(date.getTime())) {
    return "";
  }

  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const yyyy = date.getFullYear();

  return `${mm}/${dd}/${yyyy}`;
}

async function handleCompanyBols(body: any) {
  const rawCompanyId = (body.company_id ?? body.company ?? "").toString().trim();
  if (!rawCompanyId) {
    throw new Error("company_id is required");
  }

  // Use company key VERBATIM - do NOT strip "company/" prefix
  // ImportYeti expects: /company/company/target-stores-division-of-target-c/bols
  const companyKey = rawCompanyId;

  // Convert dates to ImportYeti format (MM/DD/YYYY)
  const rawStartDate = typeof body.start_date === "string" ? body.start_date : "01/01/2019";
  const rawEndDate = typeof body.end_date === "string" ? body.end_date : "";

  const startDate = toImportYetiDate(rawStartDate || "2019-01-01");
  const endDate = toImportYetiDate(rawEndDate || new Date());

  const limitRaw = typeof body.limit === "number" ? body.limit : 50;
  const offsetRaw = typeof body.offset === "number" ? body.offset : 0;

  const pageSize = Math.max(1, Math.min(100, limitRaw));
  const offset = Math.max(0, offsetRaw);

  console.log("═══════════════════════════════════════");
  console.log("🔵 [BOLS] Starting BOL Index Request");
  console.log("  Raw Input:", rawCompanyId);
  console.log("  Company Key (verbatim):", companyKey);
  console.log("  Date Range (MM/DD/YYYY):", startDate, "to", endDate);
  console.log("  Pagination:", { pageSize, offset });

  const qs = new URLSearchParams();
  if (startDate) qs.set("start_date", startDate);
  if (endDate) qs.set("end_date", endDate);
  qs.set("page_size", String(pageSize));
  qs.set("offset", String(offset));

  const bolListPath = `/company/${companyKey}/bols?${qs.toString()}`;
  console.log("  Full URL:", `${IY_BASE_URL}${bolListPath}`);

  const listResp = await iyGet<{ data: string[] }>(bolListPath);

  const bolNumbers = Array.isArray(listResp.data) ? listResp.data : [];
  console.log("✅ [BOLS] BOL Index Retrieved");
  console.log("  Total BOLs:", bolNumbers.length);
  console.log("  Sample BOLs:", bolNumbers.slice(0, 3));

  const maxDetail = Math.min(bolNumbers.length, 50);
  const toFetch = bolNumbers.slice(0, maxDetail);

  console.log("═══════════════════════════════════════");
  console.log("🔵 [BOL] Fetching Individual BOL Payloads");
  console.log("  Total to Fetch:", toFetch.length);

  const detailRows: any[] = [];
  const fullBolPayloads: any[] = [];
  const concurrency = 5;

  for (let i = 0; i < toFetch.length; i += concurrency) {
    const chunk = toFetch.slice(i, i + concurrency);
    const results = await Promise.allSettled(
      chunk.map((num) => {
        const path = `/bol/${encodeURIComponent(num)}`;
        return iyGet<any>(path);
      })
    );

    for (let j = 0; j < results.length; j++) {
      const r = results[j];
      if (r.status !== "fulfilled") {
        console.log(`  ⚠️ BOL ${chunk[j]} fetch failed`);
        continue;
      }

      const bolPayload = r.value?.data ?? r.value;
      fullBolPayloads.push(bolPayload);

      console.log(`  ✓ BOL ${chunk[j]} fetched - Keys:`, Object.keys(bolPayload).join(", "));

      const arrival = bolPayload?.arrival_date ?? null;
      const addr = bolPayload?.company_address_geocode?.address_components ?? {};
      const city = addr.city ?? null;
      const state = addr.state ?? null;
      const zip = addr.zip ?? null;
      const country = addr.country ?? null;

      const destParts = [city, state, zip, country].filter(Boolean);
      const destination = destParts.length > 0 ? destParts.join(", ") : bolPayload?.company_address ?? null;
      const origin = bolPayload?.exit_port || bolPayload?.place_of_receipt || bolPayload?.entry_port || null;

      let teu: number | undefined = undefined;
      const teuCandidates = [
        bolPayload?.teu,
        bolPayload?.TEU,
        bolPayload?.container_teu,
        Array.isArray(bolPayload?.containers) && bolPayload.containers.length > 0 ? bolPayload.containers[0]?.teu : null,
      ];

      for (const candidate of teuCandidates) {
        if (candidate != null && !Number.isNaN(Number(candidate))) {
          teu = Number(candidate);
          break;
        }
      }

      detailRows.push({
        bol_number: bolPayload?.bol_number ?? null,
        shipped_on: arrival,
        origin,
        destination,
        origin_country: bolPayload?.supplier_country_code ?? null,
        dest_city: city,
        dest_state: state,
        dest_zip: zip,
        dest_country: country,
        teu,
        hs_code: bolPayload?.hs_code ?? null,
        carrier: bolPayload?.carrier_scac_code ?? null,
        weight: bolPayload?.weight ?? null,
        containers: bolPayload?.containers ?? [],
        full_payload: bolPayload,
      });
    }
  }

  detailRows.sort((a, b) => {
    const da = a.shipped_on ? Date.parse(a.shipped_on) : 0;
    const db = b.shipped_on ? Date.parse(b.shipped_on) : 0;
    return db - da;
  });

  console.log("✅ [BOL] BOL Payloads Complete");
  console.log("  Total Detailed BOLs:", detailRows.length);

  console.log("═══════════════════════════════════════");
  console.log("🔵 [KPI] Computing Aggregations");

  const kpis = computeKPIs(detailRows);

  console.log("✅ [KPI] Aggregation Complete");
  console.log("  Total Shipments:", kpis.totalShipments);
  console.log("  Total TEU:", kpis.totalTeu);
  console.log("  12M Shipments:", kpis.shipments12m);
  console.log("  Trend:", kpis.trend);
  console.log("═══════════════════════════════════════");

  const result = {
    ok: true,
    total: detailRows.length,
    rows: detailRows,
    kpis,
    data: {
      total: detailRows.length,
      rows: detailRows,
      kpis,
    },
  };

  return result;
}

function computeKPIs(rows: any[]) {
  const now = new Date();
  const twelveMonthsAgo = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());

  const last12Months = rows.filter(r => {
    if (!r.shipped_on) return false;
    const shipDate = new Date(r.shipped_on);
    return shipDate >= twelveMonthsAgo && shipDate <= now;
  });

  const totalTeu = rows.reduce((sum, r) => sum + (r.teu || 0), 0);

  const originPorts: Record<string, number> = {};
  const destPorts: Record<string, number> = {};

  rows.forEach(r => {
    if (r.origin) {
      originPorts[r.origin] = (originPorts[r.origin] || 0) + 1;
    }
    if (r.destination) {
      destPorts[r.destination] = (destPorts[r.destination] || 0) + 1;
    }
  });

  const topOriginPorts = Object.entries(originPorts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([port]) => port);

  const topDestPorts = Object.entries(destPorts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([port]) => port);

  const monthlyData: Record<string, { fcl: number; lcl: number; total: number }> = {};

  last12Months.forEach(r => {
    if (!r.shipped_on) return;
    const date = new Date(r.shipped_on);
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

    if (!monthlyData[monthKey]) {
      monthlyData[monthKey] = { fcl: 0, lcl: 0, total: 0 };
    }

    monthlyData[monthKey].total += 1;

    if (r.teu && r.teu >= 1) {
      monthlyData[monthKey].fcl += 1;
    } else {
      monthlyData[monthKey].lcl += 1;
    }
  });

  const volumeSeries = Object.entries(monthlyData)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([month, data]) => ({
      month,
      fcl: data.fcl,
      lcl: data.lcl,
      total: data.total,
    }));

  let trend: 'up' | 'flat' | 'down' = 'flat';
  if (volumeSeries.length >= 3) {
    const recent = volumeSeries.slice(-3).reduce((sum, v) => sum + v.total, 0);
    const previous = volumeSeries.slice(-6, -3).reduce((sum, v) => sum + v.total, 0);

    if (recent > previous * 1.1) trend = 'up';
    else if (recent < previous * 0.9) trend = 'down';
  }

  const lastShipmentDate = rows.length > 0 && rows[0].shipped_on ? rows[0].shipped_on : null;

  return {
    totalShipments: rows.length,
    shipments12m: last12Months.length,
    totalTeu,
    trend,
    topOriginPorts,
    topDestPorts,
    volumeSeries,
    lastShipmentDate,
    fclCount: rows.filter(r => r.teu && r.teu >= 1).length,
    lclCount: rows.filter(r => !r.teu || r.teu < 1).length,
  };
}

async function handleCompanyProfile(params: any) {
  const company = (params.company_id ?? params.company ?? "").toString().trim();
  if (!company) {
    throw new Error("company_id or company is required");
  }

  const slug = company.startsWith("company/") ? company.slice("company/".length) : company;
  const path = `/company/${encodeURIComponent(slug)}`;
  const resp = await iyGet<any>(path);

  return resp;
}

async function handleCompanyStats(params: any) {
  const company = (params.company ?? "").toString().trim();
  const range = (params.range ?? "").toString().trim();

  if (!company) {
    throw new Error("company is required");
  }

  const slug = company.startsWith("company/") ? company.slice("company/".length) : company;
  const search = new URLSearchParams();
  if (range) search.set("range", range);

  const path = `/company/${encodeURIComponent(slug)}/stats${
    search.toString() ? `?${search.toString()}` : ""
  }`;

  const data = await iyGet<any>(path);
  return data;
}

async function cacheCompanyData(supabase: any, response: any, requestData: any): Promise<void> {
  try {
    if (response.rows && Array.isArray(response.rows)) {
      for (const company of response.rows) {
        if (company.key) {
          await supabase
            .from("lit_companies")
            .upsert({
              source: "importyeti",
              source_company_key: company.key,
              name: company.title || company.name || "Unknown",
              domain: company.domain,
              website: company.website,
              phone: company.phone,
              country_code: company.countryCode,
              address_line1: company.address,
              shipments_12m: company.totalShipments || 0,
              most_recent_shipment_date: company.mostRecentShipment,
              raw_last_search: company,
              updated_at: new Date().toISOString(),
            }, { onConflict: "source,source_company_key" });
        }
      }
    } else if (response.data && typeof response.data === "object") {
      const companyData = response.data;
      const companyKey = requestData.company_id || requestData.company || companyData.key;

      if (companyKey) {
        await supabase
          .from("lit_companies")
          .upsert({
            source: "importyeti",
            source_company_key: companyKey,
            name: companyData.name || companyData.title || "Unknown",
            domain: companyData.domain,
            website: companyData.website,
            phone: companyData.phone,
            country_code: companyData.country_code,
            address_line1: companyData.address,
            raw_profile: companyData,
            updated_at: new Date().toISOString(),
          }, { onConflict: "source,source_company_key" });
      }
    }
  } catch (error) {
    console.error("Error caching company data:", error);
  }
}
