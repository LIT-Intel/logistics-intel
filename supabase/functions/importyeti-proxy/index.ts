import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SNAPSHOT_TABLE = "lit_importyeti_company_snapshot";
const SNAPSHOT_TTL_DAYS = 30;

interface EnvConfig {
  searchUrl: string;
  companyUrl: (slug: string) => string;
  apiKey: string;
  isValid: boolean;
  warnings: string[];
}

function getEnvConfig(): EnvConfig {
  const warnings: string[] = [];

  // Try DMA scheme first (preferred)
  // Support both exact name and base URL variants
  const dmaSearchUrl = Deno.env.get("IY_DMA_SEARCH_URL");
  const dmaBaseUrl = Deno.env.get("IY_DMA_BASE_URL");
  const dmaKey = Deno.env.get("IY_DMA_API_KEY");

  const dmaUrl = dmaSearchUrl || (dmaBaseUrl ? `${dmaBaseUrl}/company/search` : null);

  if (dmaUrl && dmaKey) {
    return {
      searchUrl: dmaUrl,
      companyUrl: (slug) => {
        const bolsUrl = Deno.env.get("IY_DMA_COMPANY_BOLS_URL");
        if (bolsUrl) return bolsUrl.replace("{company}", slug);
        // Derive from base: /company/search -> /company/<slug>
        const base = dmaBaseUrl || dmaSearchUrl?.replace("/company/search", "");
        return base ? `${base}/company/${slug}` : "";
      },
      apiKey: dmaKey,
      isValid: true,
      warnings,
    };
  }

  // Fall back to legacy scheme
  const legacyBase = Deno.env.get("IY_BASE_URL") ||
    "https://data.importyeti.com/v1.0";
  const legacyKey = Deno.env.get("IY_API_KEY");

  if (legacyKey) {
    if (!dmaUrl && !dmaKey) {
      warnings.push("[Env] Using fallback legacy scheme (IY_API_KEY + IY_BASE_URL)");
    }
    return {
      searchUrl: `${legacyBase}/company/search`,
      companyUrl: (slug) => `${legacyBase}/company/${slug}`,
      apiKey: legacyKey,
      isValid: true,
      warnings,
    };
  }

  // No valid config
  return {
    searchUrl: "",
    companyUrl: () => "",
    apiKey: "",
    isValid: false,
    warnings: ["[Env] No valid ImportYeti configuration found"],
  };
}

async function iyFetch(
  url: string,
  apiKey: string,
  method = "GET",
  body?: string,
) {
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
      ...(body && { "Content-Type": "application/json" }),
    },
    ...(body && { body }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`ImportYeti error ${res.status}: ${text}`);
  }

  return res.json();
}

async function getCachedSnapshot(
  supabase: any,
  companyId: string,
): Promise<any | null> {
  try {
    const { data, error } = await supabase
      .from(SNAPSHOT_TABLE)
      .select("raw_payload, parsed_summary, updated_at")
      .eq("company_id", companyId)
      .maybeSingle();

    if (error) {
      console.log(`[Cache] Query error for ${companyId}: ${error.message}`);
      return null;
    }

    if (!data) {
      console.log(`[Cache] No snapshot for ${companyId}`);
      return null;
    }

    // Check TTL
    const updatedAt = new Date(data.updated_at);
    const ageMs = Date.now() - updatedAt.getTime();
    const ageDays = ageMs / (1000 * 60 * 60 * 24);

    if (ageDays > SNAPSHOT_TTL_DAYS) {
      console.log(
        `[Cache] Snapshot for ${companyId} expired (${ageDays.toFixed(1)} days old)`,
      );
      return null;
    }

    console.log(
      `[Cache] HIT for ${companyId} (${ageDays.toFixed(1)} days old)`,
    );
    return { raw_payload: data.raw_payload, parsed_summary: data.parsed_summary };
  } catch (err: any) {
    console.log(`[Cache] Exception: ${err.message}`);
    return null;
  }
}

async function storeCachedSnapshot(
  supabase: any,
  companyId: string,
  rawPayload: any,
  parsedSummary: any,
): Promise<void> {
  try {
    await supabase.from(SNAPSHOT_TABLE).upsert(
      {
        company_id: companyId,
        raw_payload: rawPayload,
        parsed_summary: parsedSummary,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "company_id" },
    );
    console.log(`[Cache] Stored snapshot for ${companyId}`);
  } catch (err: any) {
    console.log(`[Cache] Store failed: ${err.message}`);
  }
}

function parseSnapshot(raw: any): any {
  if (!raw) return null;

  const shipments = Array.isArray(raw.shipments) ? raw.shipments : [];
  const cutoffDate = new Date();
  cutoffDate.setMonth(cutoffDate.getMonth() - 12);

  const last12m = shipments.filter((s: any) => {
    const d = new Date(s.date_formatted || s.date);
    return d >= cutoffDate;
  });

  let totalTEU = 0;
  let fclCount = 0;
  let lclCount = 0;

  const monthlyMap: Record<string, { fcl: number; lcl: number }> = {};
  const routeMap: Record<string, number> = {};

  for (const s of last12m) {
    const teu = typeof s.containers_count === "number" ? s.containers_count : 0;
    totalTEU += teu;

    const isFCL = teu >= 1;
    if (isFCL) fclCount++;
    else lclCount++;

    const month = (s.date_formatted || "").substring(0, 7);
    if (month) {
      monthlyMap[month] ??= { fcl: 0, lcl: 0 };
      if (isFCL) monthlyMap[month].fcl++;
      else monthlyMap[month].lcl++;
    }

    const origin =
      s.supplier_address_loc || s.supplier_address_location || "Unknown";
    const dest =
      s.company_address_loc || s.company_address_location || "Unknown";
    const route = `${origin} → ${dest}`;
    routeMap[route] = (routeMap[route] || 0) + 1;
  }

  const timeSeries = Object.entries(monthlyMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, v]) => ({
      month,
      fclShipments: v.fcl,
      lclShipments: v.lcl,
    }));

  const topRoutes = Object.entries(routeMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([route, shipments]) => ({
      route,
      shipments,
    }));

  const lastShipmentDate =
    last12m.length > 0
      ? last12m[last12m.length - 1].date_formatted
      : null;

  return {
    key: raw.company_url || raw.company_basename,
    title: raw.company_name,
    country: raw.company_address_country,
    website: raw.website || null,
    companyId: raw.company_basename,

    routeKpis: {
      teuLast12m: Number(totalTEU.toFixed(1)),
      shipmentsLast12m: last12m.length,
      topRoutesLast12m: topRoutes,
      mostRecentRoute: topRoutes.length > 0 ? topRoutes[0].route : null,
    },

    containers: {
      fclShipments12m: fclCount,
      lclShipments12m: lclCount,
    },

    timeSeries,
    lastShipmentDate,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { action, q, page, pageSize, company_id } = body;

    const envConfig = getEnvConfig();
    if (!envConfig.isValid) {
      return new Response(
        JSON.stringify({
          error: "Missing ImportYeti env vars",
          missing: ["IY_DMA_SEARCH_URL/IY_BASE_URL", "IY_DMA_API_KEY/IY_API_KEY"],
        }),
        { status: 500, headers: corsHeaders }
      );
    }

    if (envConfig.warnings.length > 0) {
      console.warn("[ImportYeti] Warnings:", envConfig.warnings);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const supabase = supabaseUrl && supabaseKey
      ? createClient(supabaseUrl, supabaseKey)
      : null;

    if (action === "search") {
      const query = typeof q === "string" ? q.trim() : "";
      if (!query) {
        return new Response(
          JSON.stringify({ results: [], page: 1, pageSize: 25 }),
          { headers: corsHeaders }
        );
      }

      const searchUrl = `${envConfig.searchUrl}?q=${encodeURIComponent(query)}`;
      console.log(`[Search] Query: ${query}, URL: ${searchUrl}`);

      try {
        const results = await iyFetch(searchUrl, envConfig.apiKey);
        return new Response(
          JSON.stringify({
            results: results || [],
            page: page || 1,
            pageSize: pageSize || 25,
          }),
          { headers: corsHeaders }
        );
      } catch (err: any) {
        console.error(`[Search] Fetch failed: ${err.message}`);
        throw err;
      }
    }

    if (action === "companySnapshot" || action === "company") {
      const companySlug = company_id || body.companyKey;
      if (!companySlug) {
        throw new Error("Missing company_id or companyKey");
      }

      console.log(`[Snapshot] Loading for: ${companySlug}`);

      if (supabase) {
        const cached = await getCachedSnapshot(supabase, companySlug);
        if (cached?.parsed_summary?.routeKpis && cached.parsed_summary.timeSeries) {
          console.log(`[Snapshot] Cache HIT, returning parsed`);
          return new Response(
            JSON.stringify({
              ok: true,
              source: "cache",
              snapshot: cached.parsed_summary,
              raw: cached.raw_payload,
            }),
            { headers: corsHeaders }
          );
        }
      }

      const companyUrl = envConfig.companyUrl(companySlug);
      console.log(`[Snapshot] Fetching from: ${companyUrl}`);

      try {
        const raw = await iyFetch(companyUrl, envConfig.apiKey);
        const parsed = parseSnapshot(raw);

        if (supabase && parsed) {
          storeCachedSnapshot(supabase, companySlug, raw, parsed).catch((err) =>
            console.log(`[Snapshot] Cache store error: ${err.message}`)
          );
        }

        return new Response(
          JSON.stringify({
            ok: true,
            source: "fresh",
            snapshot: parsed,
            raw,
          }),
          { headers: corsHeaders }
        );
      } catch (err: any) {
        console.error(`[Snapshot] Fetch failed: ${err.message}`);
        throw err;
      }
    }

    return new Response(
      JSON.stringify({ error: `Unknown action: ${action}` }),
      { status: 400, headers: corsHeaders }
    );
  } catch (err: any) {
    console.error("[ImportYeti Proxy] Error:", err.message);
    return new Response(
      JSON.stringify({ error: err.message || "Internal server error" }),
      { status: 500, headers: corsHeaders }
    );
  }
});
