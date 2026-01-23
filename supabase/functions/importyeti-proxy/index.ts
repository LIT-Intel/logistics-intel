// supabase/functions/importyeti-proxy/index.ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const IY_BASE_URL = "https://data.importyeti.com/v1.0";
const IY_API_KEY = Deno.env.get("IY_API_KEY") || "";
const SNAPSHOT_TTL_DAYS = Number(Deno.env.get("SNAPSHOT_TTL_DAYS") || "30");

// ---- Helpers --------------------------------------------------------------

function json(data: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", ...headers },
  });
}

function isRecord(v: unknown): v is Record<string, any> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function normalizeSlug(input: string) {
  // accepts:
  // - "company/national-vision"
  // - "/company/national-vision"
  // - "national-vision"
  let s = (input || "").trim();
  s = s.replace(/^https?:\/\/[^/]+/i, "");
  s = s.replace(/^\/+/, "");
  s = s.replace(/^company\//i, "");
  s = s.replace(/^\/?company\//i, "");
  return s.trim();
}

function toNumber(v: any): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const cleaned = v.replace(/[^0-9.\-]/g, "");
    if (!cleaned) return null;
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function parseLane(laneOrRoute: string | null | undefined) {
  const s = (laneOrRoute || "").trim();
  if (!s) return { origin: "Unknown", destination: "Unknown", lane: "Unknown → Unknown" };

  // supports "A → B" and "A -> B"
  const arrow = s.includes("→") ? "→" : (s.includes("->") ? "->" : null);
  if (!arrow) return { origin: "Unknown", destination: "Unknown", lane: s };

  const parts = s.split(arrow).map((p) => p.trim()).filter(Boolean);
  const origin = parts[0] || "Unknown";
  const destination = parts[1] || "Unknown";
  return { origin, destination, lane: `${origin} → ${destination}` };
}

function monthKey(d: Date) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function buildLast12MonthKeys(now = new Date()) {
  const keys: string[] = [];
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  for (let i = 0; i < 12; i++) {
    const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - i, 1));
    keys.push(monthKey(x));
  }
  return keys; // newest -> oldest
}

function unwrapImportYeti(raw: any) {
  // Some responses come wrapped as { data: {...}, requestCost,... } or { data: {...} }
  if (isRecord(raw) && isRecord(raw.data)) return raw.data;
  return raw;
}

// ---- ImportYeti fetch -----------------------------------------------------

async function iyFetch(path: string, init?: RequestInit) {
  if (!IY_API_KEY) {
    throw new Error("Missing IY_API_KEY env var");
  }

  const url = `${IY_BASE_URL}${path}`;

  // Send multiple header variants to avoid silent auth schema mismatch
  const headers = new Headers(init?.headers || {});
  headers.set("Accept", "application/json");
  headers.set("Content-Type", "application/json");
  headers.set("Authorization", `Bearer ${IY_API_KEY}`);
  headers.set("x-api-key", IY_API_KEY);
  headers.set("apikey", IY_API_KEY);

  const res = await fetch(url, { ...init, headers });

  // Try to parse JSON either way so we can surface exact error message
  let payload: any = null;
  const text = await res.text();
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = { rawText: text };
  }

  if (!res.ok) {
    const msg =
      (payload && payload.message) ||
      (payload && payload.error) ||
      `ImportYeti request failed (${res.status})`;
    const err: any = new Error(`ImportYeti error ${res.status}: ${msg}`);
    err.status = res.status;
    err.payload = payload;
    throw err;
  }

  return payload;
}

// ---- Normalization (THE important part) ----------------------------------

function normalizeCompanySnapshot(companyId: string, rawApiResponse: any) {
  // rawApiResponse might include wrappers. Unwrap to the actual company object.
  const raw = unwrapImportYeti(rawApiResponse);

  const title =
    raw?.title ||
    raw?.company_name ||
    raw?.name ||
    raw?.companyName ||
    companyId;

  const key = raw?.key || raw?.company_key || `company/${companyId}`;
  const country = raw?.country || raw?.country_code || raw?.company_address_country || null;
  const website = raw?.website || raw?.domain || null;

  const routeKpisRaw = raw?.routeKpis || raw?.route_kpis || {};
  const containersRaw = raw?.containers || raw?.container_kpis || {};
  const timeSeriesRaw = raw?.timeSeries || raw?.time_series || [];

  const teuLast12m =
    toNumber(routeKpisRaw?.teuLast12m) ??
    toNumber(raw?.total_teu) ??
    toNumber(raw?.teu_last_12m) ??
    null;

  const shipmentsLast12m =
    toNumber(routeKpisRaw?.shipmentsLast12m) ??
    toNumber(raw?.shipments_last_12m) ??
    null;

  const fclShipments12m =
    toNumber(containersRaw?.fclShipments12m) ??
    toNumber(containersRaw?.fcl) ??
    null;

  const lclShipments12m =
    toNumber(containersRaw?.lclShipments12m) ??
    toNumber(containersRaw?.lcl) ??
    null;

  // Est spend: use API number if present; otherwise fallback to 0 (not guessing)
  const estSpend =
    toNumber(raw?.est_spend) ??
    toNumber(raw?.estimated_spend) ??
    toNumber(raw?.total_shipping_cost) ??
    toNumber(raw?.shipping_cost) ??
    toNumber(routeKpisRaw?.estSpend) ??
    0;

  // Normalize routes
  const routesRaw = routeKpisRaw?.topRoutesLast12m || raw?.top_routes || [];
  const topRoutesLast12m = Array.isArray(routesRaw)
    ? routesRaw.map((r: any) => {
        const shipments = toNumber(r?.shipments) ?? toNumber(r?.count) ?? 0;

        // Some payloads provide { origin, destination, lane }, others provide { route: "A → B" }
        const laneValue = r?.lane || r?.route || r?.shipping_lane || "";
        const parsed = parseLane(laneValue);

        const origin = (r?.origin || parsed.origin || "Unknown").toString();
        const destination = (r?.destination || parsed.destination || "Unknown").toString();
        const lane = (r?.lane || parsed.lane || `${origin} → ${destination}`).toString();

        return { origin, destination, lane, shipments };
      })
    : [];

  // Normalize timeseries into chart-friendly { month, fcl, lcl }
  const normalizedTimeSeriesRaw = Array.isArray(timeSeriesRaw)
    ? timeSeriesRaw
        .map((m: any) => {
          const month = (m?.month || m?.Month || "").toString();
          if (!month) return null;

          // handle both shapes:
          // - { month, fclShipments, lclShipments }
          // - { month, fcl, lcl }
          const fcl =
            toNumber(m?.fclShipments) ??
            toNumber(m?.fcl) ??
            toNumber(m?.FCL) ??
            0;

          const lcl =
            toNumber(m?.lclShipments) ??
            toNumber(m?.lcl) ??
            toNumber(m?.LCL) ??
            0;

          return { month, fcl, lcl, total: fcl + lcl };
        })
        .filter(Boolean)
    : [];

  // Fill last 12 months with zeros so chart has consistent domain
  const last12 = buildLast12MonthKeys();
  const byMonth = new Map<string, { month: string; fcl: number; lcl: number; total: number }>();
  for (const row of normalizedTimeSeriesRaw as any[]) byMonth.set(row.month, row);

  const timeSeries = last12
    .slice()
    .reverse() // oldest -> newest for chart
    .map((m) => byMonth.get(m) || { month: m, fcl: 0, lcl: 0, total: 0 });

  const lastShipmentDate =
    raw?.lastShipmentDate ||
    raw?.last_shipment_date ||
    raw?.mostRecentShipment ||
    null;

  // Average TEU (only if both are present and shipments > 0)
  const avgTeu =
    teuLast12m !== null && shipmentsLast12m !== null && shipmentsLast12m > 0
      ? Number((teuLast12m / shipmentsLast12m).toFixed(1))
      : null;

  // This is the stable internal model that UI should rely on
  const parsed_summary = {
    key: key?.toString(),
    title: title?.toString(),
    companyId,
    company_id: companyId, // include both
    country: country?.toString() || null,
    website: website?.toString() || null,

    // KPI convenience
    total_teu: teuLast12m ?? 0,
    total_shipments: shipmentsLast12m ?? 0,
    avg_teu: avgTeu ?? 0,
    est_spend: estSpend ?? 0,
    fcl_count: fclShipments12m ?? 0,
    lcl_count: lclShipments12m ?? 0,

    // Structured blocks
    routeKpis: {
      teuLast12m: teuLast12m ?? 0,
      shipmentsLast12m: shipmentsLast12m ?? 0,
      topRoutesLast12m,
    },
    containers: {
      fclShipments12m: fclShipments12m ?? 0,
      lclShipments12m: lclShipments12m ?? 0,
    },
    timeSeries, // [{month,fcl,lcl,total}]
    lastShipmentDate: lastShipmentDate ? String(lastShipmentDate) : null,
  };

  return parsed_summary;
}

// ---- Handlers -------------------------------------------------------------

async function handleSearch(q: string, page: number, pageSize: number) {
  // Try POST first (common for this API). If the API is GET, your response will show
  // a clear error and we can adjust, but POST is what your existing proxy structure implies.
  const payload = await iyFetch("/company/search", {
    method: "POST",
    body: JSON.stringify({ query: q, page, pageSize }),
  });

  return json(payload, 200);
}

async function handleSnapshot(
  supabase: any,
  company_id: string,
) {
  const slug = normalizeSlug(company_id);
  const companyKey = `company/${slug}`;

  // 1) check cache
  const { data: cached, error: cacheErr } = await supabase
    .from("lit_importyeti_company_snapshot")
    .select("company_id, raw_payload, parsed_summary, updated_at")
    .eq("company_id", slug)
    .maybeSingle();

  if (cacheErr) {
    // don’t fail the request just because cache read failed
    console.error("Cache read error:", cacheErr);
  }

  const now = new Date();
  const ttlMs = SNAPSHOT_TTL_DAYS * 24 * 60 * 60 * 1000;

  if (cached?.parsed_summary && cached?.updated_at) {
    const updatedAt = new Date(cached.updated_at);
    if (Number.isFinite(updatedAt.getTime()) && now.getTime() - updatedAt.getTime() < ttlMs) {
      return json({
        ok: true,
        source: "cache",
        hasSnapshot: true,
        hasRaw: !!cached.raw_payload,
        parsed_summary: cached.parsed_summary,
      });
    }
  }

  // 2) fetch fresh company snapshot from ImportYeti
  // This is the key endpoint for the popup card
  const rawApiResponse = await iyFetch(`/company/${encodeURIComponent(slug)}`, { method: "GET" });

  // 3) normalize deterministically (this is what fixes TEU, monthly, routes, totals)
  const parsed_summary = normalizeCompanySnapshot(slug, rawApiResponse);

  // 4) return immediately (prevents the “first open empty” feeling)
  // 5) then persist snapshot (but do not crash the request if persistence fails)
  const raw_payload_to_store = isRecord(rawApiResponse) ? rawApiResponse : { data: rawApiResponse };

  try {
    const { error: upsertErr } = await supabase
      .from("lit_importyeti_company_snapshot")
      .upsert(
        {
          company_id: slug,
          raw_payload: raw_payload_to_store,
          parsed_summary,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "company_id" },
      );

    if (upsertErr) {
      console.error("Snapshot upsert error:", upsertErr);
    }
  } catch (e) {
    console.error("Snapshot upsert exception:", e);
  }

  return json({
    ok: true,
    source: "fresh",
    hasSnapshot: true,
    parsed_summary,
  });
}

// ---- Main ---------------------------------------------------------------

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Allow JSON body only. If body is empty, fail fast.
    const body = await req.json().catch(() => ({}));
    const action = body?.action || "snapshot";
    const q = body?.q || body?.query || "";
    const company_id = body?.company_id || body?.companyId || "";
    const page = Number(body?.page || 1);
    const pageSize = Number(body?.pageSize || 25);

    if (action === "search") {
      if (!q || typeof q !== "string") return json({ error: "q required" }, 400);
      return await handleSearch(q, page, pageSize);
    }

    // default: snapshot
    if (!company_id || typeof company_id !== "string") {
      return json({ error: "company_id required" }, 400);
    }

    return await handleSnapshot(supabase, company_id);
  } catch (err: any) {
    console.error("importyeti-proxy error:", err?.message || err, err?.payload || "");
    return json(
      {
        ok: false,
        error: err?.message || "Unknown error",
        statusCode: err?.status || 500,
        // include upstream payload in error to debug 401/403 quickly
        upstream: err?.payload || null,
      },
      err?.status || 500,
    );
  }
});
