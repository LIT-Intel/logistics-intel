import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { createHash } from "node:crypto";

export const config = {
  verify_jwt: true,
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const IY_BASE_URL = Deno.env.get("IY_DMA_BASE_URL") || "https://data.importyeti.com/v1.0";
const IY_API_KEY = Deno.env.get("IY_DMA_API_KEY") || "";

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

  // CRITICAL: Log auth header to verify JWT delivery
  const authHeader = req.headers.get("authorization");
  console.log("AUTH HEADER RECEIVED:", authHeader);

  const startTime = Date.now();

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", "")
    );

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const url = new URL(req.url);
    const pathParts = url.pathname.split("/").filter(Boolean);
    const endpoint = pathParts[pathParts.length - 1] || "";

    let requestData: ImportYetiRequest;
    if (req.method === "POST") {
      const body = await req.json();
      requestData = { endpoint, method: "POST", body };
    } else {
      const params: Record<string, any> = {};
      url.searchParams.forEach((value, key) => {
        params[key] = value;
      });
      requestData = { endpoint, method: "GET", params };
    }

    const cacheKey = generateCacheKey(endpoint, requestData.params || requestData.body || {});

    const cached = await getFromCache(supabase, cacheKey);
    if (cached) {
      await logApiRequest(supabase, user.id, endpoint, true, Date.now() - startTime, 200);
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
        user.id,
        endpoint,
        rateLimitConfig.max,
        rateLimitConfig.window
      );
      if (!allowed) {
        await logApiRequest(supabase, user.id, endpoint, false, Date.now() - startTime, 429);
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
    switch (endpoint) {
      case "searchShippers":
        response = await handleSearchShippers(requestData.body || {});
        break;
      case "companyBols":
        response = await handleCompanyBols(requestData.body || {});
        break;
      case "companyProfile":
        response = await handleCompanyProfile(requestData.params || {});
        break;
      case "companyStats":
        response = await handleCompanyStats(requestData.params || {});
        break;
      default:
        throw new Error(`Unknown endpoint: ${endpoint}`);
    }

    await cacheCompanyData(supabase, response, requestData.body || requestData.params || {});

    const ttl = CACHE_TTL[endpoint as keyof typeof CACHE_TTL] || 3600;
    await saveToCache(supabase, cacheKey, endpoint, requestData.params || requestData.body || {}, response, ttl);

    await logApiRequest(supabase, user.id, endpoint, false, Date.now() - startTime, 200);

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
    throw new Error("IY_DMA_API_KEY not configured");
  }

  const url = `${IY_BASE_URL}${path}`;
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

  return json as T;
}

async function handleSearchShippers(body: any) {
  const q = body.q || body.query || "";
  const page = typeof body.page === "number" ? body.page : 1;
  const pageSize = typeof body.pageSize === "number" ? body.pageSize : body.limit || 25;

  const trimmed = q.trim();
  if (!trimmed) {
    return {
      ok: true,
      rows: [],
      total: 0,
      meta: { q: trimmed, page, pageSize },
      data: { rows: [], total: 0 },
    };
  }

  const searchPath = `/company/search?q=${encodeURIComponent(trimmed)}`;
  const resp = await iyGet<{ data?: any[] }>(searchPath);
  const allRows = Array.isArray(resp.data) ? resp.data : [];

  const start = (page - 1) * pageSize;
  const end = start + pageSize;
  const rawRows = allRows.slice(start, end);
  const total = allRows.length;

  const normalizedRows = rawRows.map((row: any, index: number) => {
    const fallbackTitle = row?.title ?? row?.name ?? row?.company_name ?? `Company ${index + 1}`;
    const normalizedTitle = typeof fallbackTitle === "string" ? fallbackTitle : `Company ${index + 1}`;

    const slugFromTitle = (() => {
      const base = normalizedTitle.toLowerCase().trim();
      if (!base) return `company-${index + 1}`;
      return base.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    })();

    const key = row?.key ?? row?.slug ?? row?.company_slug ?? row?.company_id ??
      (slugFromTitle ? `company/${slugFromTitle}` : `company-${index + 1}`);

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

async function handleCompanyBols(body: any) {
  const companyId = (body.company_id ?? body.company ?? "").toString().trim();
  if (!companyId) {
    throw new Error("company_id is required");
  }

  const startDate = typeof body.start_date === "string" ? body.start_date : "";
  const endDate = typeof body.end_date === "string" ? body.end_date : "";
  const limitRaw = typeof body.limit === "number" ? body.limit : 25;
  const offsetRaw = typeof body.offset === "number" ? body.offset : 0;

  const pageSize = Math.max(1, Math.min(50, limitRaw));
  const offset = Math.max(0, offsetRaw);

  const qs = new URLSearchParams();
  if (startDate) qs.set("start_date", startDate);
  if (endDate) qs.set("end_date", endDate);
  qs.set("page_size", String(pageSize));
  qs.set("offset", String(offset));

  const listResp = await iyGet<{ data: string[] }>(
    `/company/${encodeURIComponent(companyId)}/bols?${qs.toString()}`
  );

  const bolNumbers = Array.isArray(listResp.data) ? listResp.data : [];
  const maxDetail = Math.min(bolNumbers.length, pageSize);
  const toFetch = bolNumbers.slice(0, maxDetail);

  const detailRows: any[] = [];
  const concurrency = 5;

  for (let i = 0; i < toFetch.length; i += concurrency) {
    const chunk = toFetch.slice(i, i + concurrency);
    const results = await Promise.allSettled(
      chunk.map((num) => iyGet<any>(`/bol/${encodeURIComponent(num)}`))
    );

    for (const r of results) {
      if (r.status !== "fulfilled") continue;
      const b = r.value?.data ?? r.value;

      const arrival = b?.arrival_date ?? null;
      const addr = b?.company_address_geocode?.address_components ?? {};
      const city = addr.city ?? null;
      const state = addr.state ?? null;
      const zip = addr.zip ?? null;
      const country = addr.country ?? null;

      const destParts = [city, state, zip, country].filter(Boolean);
      const destination = destParts.length > 0 ? destParts.join(", ") : b?.company_address ?? null;
      const origin = b?.exit_port || b?.place_of_receipt || b?.entry_port || null;
      const teu = b?.teu != null && !Number.isNaN(Number(b.teu)) ? Number(b.teu) : undefined;

      detailRows.push({
        bol_number: b?.bol_number ?? null,
        shipped_on: arrival,
        origin,
        destination,
        origin_country: b?.supplier_country_code ?? null,
        dest_city: city,
        dest_state: state,
        dest_zip: zip,
        dest_country: country,
        teu,
        hs_code: b?.hs_code ?? null,
        carrier: b?.carrier_scac_code ?? null,
      });
    }
  }

  detailRows.sort((a, b) => {
    const da = a.shipped_on ? Date.parse(a.shipped_on) : 0;
    const db = b.shipped_on ? Date.parse(b.shipped_on) : 0;
    return db - da;
  });

  return {
    ok: true,
    total: detailRows.length,
    rows: detailRows,
    data: { total: detailRows.length, rows: detailRows },
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
