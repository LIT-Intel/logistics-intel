import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

const IY_BASE_URL = "https://data.importyeti.com/v1.0";
const IY_API_KEY = Deno.env.get("IY_API_KEY") || "";
const SNAPSHOT_TTL_DAYS = 30;

type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json }
  | Json[];

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceRole) {
      return json(
        { ok: false, error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" },
        500
      );
    }

    if (!IY_API_KEY) {
      return json({ ok: false, error: "Missing IY_API_KEY env var" }, 500);
    }

    const supabase = createClient(supabaseUrl, serviceRole);

    const body = await req.json().catch(() => ({}));
    const { action, company_id, q, page = 1, pageSize = 25 } = body || {};

    // ---- SEARCH ----
    if (action === "search") {
      return await handleSearchAction(q, page, pageSize);
    }

    if (!company_id || typeof company_id !== "string") {
      return json({ ok: false, error: "company_id is required" }, 400);
    }

    const slug = normalizeCompanyKey(company_id);

    // ---- LOAD CACHE ----
    const { data: cached, error: cacheErr } = await supabase
      .from("lit_importyeti_company_snapshot")
      .select("company_id, raw_payload, parsed_summary, updated_at")
      .eq("company_id", slug)
      .maybeSingle();

    if (cacheErr) {
      console.error("❌ Snapshot cache fetch error:", cacheErr);
    }

    const now = new Date();
    const ageDays = cached?.updated_at
      ? (now.getTime() - new Date(cached.updated_at).getTime()) / (1000 * 60 * 60 * 24)
      : Infinity;

    const cacheHasRaw = !!cached?.raw_payload;
    const cacheHasParsed = !!cached?.parsed_summary;

    // IMPORTANT: cache is only valid if it has BOTH raw + parsed, and is fresh.
    if (cached && cacheHasRaw && cacheHasParsed && ageDays < SNAPSHOT_TTL_DAYS) {
      return json({
        ok: true,
        source: "cache",
        snapshot: cached.parsed_summary,
        raw: cached.raw_payload,
        cached_at: cached.updated_at,
      });
    }

    // If cache exists but raw_payload missing, we must refetch to repair.
    if (cached && (!cacheHasRaw || !cacheHasParsed)) {
      console.log("⚠️ Cache row exists but missing raw/parsed. Refetching to repair:", {
        slug,
        cacheHasRaw,
        cacheHasParsed,
      });
    } else {
      console.log("🌐 No valid cache. Fetching from ImportYeti:", slug);
    }

    // ---- FETCH FROM IMPORTYETI ----
    const iyUrl = `${IY_BASE_URL}/company/${slug}`;
    const iyResp = await fetch(iyUrl, {
      method: "GET",
      headers: {
        IYApiKey: IY_API_KEY,
        Accept: "application/json",
      },
    });

    if (!iyResp.ok) {
      const details = await iyResp.text().catch(() => "");
      console.error("❌ ImportYeti error:", iyResp.status, details);
      return json(
        { ok: false, error: "ImportYeti API error", status: iyResp.status, details },
        iyResp.status
      );
    }

    const rawPayload = await iyResp.json();

    // Build UI-ready normalized summary (this is what the popup card needs)
    const parsedSummary = buildNormalizedCompanyProfile(rawPayload, slug);

    // ---- UPSERT SNAPSHOT ----
    const upsert = await supabase.from("lit_importyeti_company_snapshot").upsert({
      company_id: slug,
      raw_payload: rawPayload,
      parsed_summary: parsedSummary,
      updated_at: now.toISOString(),
    });

    if (upsert.error) {
      console.error("❌ Snapshot upsert error:", upsert.error);
      // We still return the live data so UI works even if DB write fails.
    }

    // Optional: keep your existing lightweight index table updated
    await supabase.from("lit_company_index").upsert({
      company_id: slug,
      company_name: parsedSummary.company_name || slug,
      country: parsedSummary.country || null,
      city: parsedSummary.city || null,
      last_shipment_date: parsedSummary.lastShipmentDate || null,
      total_shipments: parsedSummary.routeKpis?.shipmentsLast12m ?? 0,
      total_teu: parsedSummary.routeKpis?.teuLast12m ?? 0,
      updated_at: now.toISOString(),
    }).catch((e: any) => console.error("❌ Index upsert failed:", e));

    return json({
      ok: true,
      source: "importyeti",
      snapshot: parsedSummary,
      raw: rawPayload,
      fetched_at: now.toISOString(),
    });
  } catch (e: any) {
    console.error("❌ Fatal error:", e);
    return json({ ok: false, error: e?.message || "Internal server error" }, 500);
  }
});

// -------------------------
// SEARCH HANDLER
// -------------------------
async function handleSearchAction(q: string, page: number = 1, pageSize: number = 25) {
  if (!q || typeof q !== "string" || q.trim().length === 0) {
    return json({ ok: false, error: "Query (q) must be non-empty" }, 400);
  }

  const validatedPage = Math.max(1, Number.isFinite(page) ? Number(page) : 1);
  const validatedPageSize = Math.max(
    1,
    Math.min(100, Number.isFinite(pageSize) ? Number(pageSize) : 25)
  );
  const offset = (validatedPage - 1) * validatedPageSize;

  const url = new URL(`${IY_BASE_URL}/company/search`);
  url.searchParams.set("name", q.trim());
  url.searchParams.set("page_size", String(validatedPageSize));
  url.searchParams.set("offset", String(offset));

  const iyResp = await fetch(url.toString(), {
    method: "GET",
    headers: { IYApiKey: IY_API_KEY, Accept: "application/json" },
  });

  if (!iyResp.ok) {
    const details = await iyResp.text().catch(() => "");
    return json(
      { ok: false, error: "ImportYeti API error", status: iyResp.status, details },
      iyResp.status
    );
  }

  const raw = await iyResp.json();

  const results = Array.isArray(raw?.results)
    ? raw.results
    : Array.isArray(raw?.data)
      ? raw.data
      : Array.isArray(raw)
        ? raw
        : [];

  const total = raw?.total ?? raw?.pagination?.total ?? results.length;

  return json({
    ok: true,
    results,
    page: validatedPage,
    pageSize: validatedPageSize,
    total,
  });
}

// -------------------------
// NORMALIZATION + PARSING
// -------------------------
function normalizeCompanyKey(input: string): string {
  if (!input) return "";
  const trimmed = input.trim();
  const stripped = trimmed.startsWith("company/") ? trimmed.slice("company/".length) : trimmed;
  const lower = stripped.toLowerCase();
  const replaced = lower.replace(/[\s_.]+/g, "-");
  const cleaned = replaced.replace(/[^a-z0-9-]/g, "");
  const collapsed = cleaned.replace(/-{2,}/g, "-");
  const trimmedEdges = collapsed.replace(/^-+|-+$/g, "");
  return trimmedEdges || "unknown";
}

function parseDMYToISO(dmy: string | null | undefined): string | null {
  if (!dmy || typeof dmy !== "string") return null;
  const parts = dmy.split("/");
  if (parts.length !== 3) return null;
  const [day, month, year] = parts;
  if (!day || !month || !year) return null;
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

function safeNumber(v: any): number {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? n : 0;
}

function buildNormalizedCompanyProfile(raw: any, slug: string) {
  const data = raw?.data ?? raw ?? {};
  const recentBols = Array.isArray(data?.recent_bols) ? data.recent_bols : [];

  // --- Last shipment date ---
  let lastShipmentDate: string | null =
    parseDMYToISO(data?.date_range?.end_date) ||
    parseDMYToISO(data?.most_recent_shipment_date) ||
    null;

  if (!lastShipmentDate && recentBols.length) {
    // derive from newest BOL date_formatted (DD/MM/YYYY)
    const dates = recentBols
      .map((b: any) => parseDMYToISO(b?.date_formatted))
      .filter(Boolean) as string[];
    dates.sort((a, b) => (a > b ? -1 : a < b ? 1 : 0));
    lastShipmentDate = dates[0] ?? null;
  }

  // --- TEU last 12m ---
  let teuLast12m = 0;
  // If API provides precomputed, use it
  teuLast12m =
    safeNumber(data?.routeKpis?.teuLast12m) ||
    safeNumber(data?.route_kpis?.teu_last_12m) ||
    0;

  // Fallback: avg_teu_per_month["12m"] * 12
  if (!teuLast12m) {
    const avg12m = safeNumber(data?.avg_teu_per_month?.["12m"]);
    if (avg12m) teuLast12m = Math.round(avg12m * 12 * 10) / 10;
  }

  // --- Estimated spend ---
  const estSpend = safeNumber(
    data?.total_shipping_cost ??
      data?.est_spend ??
      data?.routeKpis?.estSpend ??
      data?.route_kpis?.total_shipping_cost
  );

  // --- Containers / FCL / LCL last 12m ---
  let fclShipments12m =
    Math.trunc(safeNumber(data?.containers?.fclShipments12m)) ||
    Math.trunc(safeNumber(data?.containers?.fcl_shipments_12m)) ||
    0;

  let lclShipments12m =
    Math.trunc(safeNumber(data?.containers?.lclShipments12m)) ||
    Math.trunc(safeNumber(data?.containers?.lcl_shipments_12m)) ||
    0;

  // Fallback: compute from recent_bols
  if ((!fclShipments12m && !lclShipments12m) && recentBols.length) {
    const oneYearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
    for (const bol of recentBols) {
      const iso = parseDMYToISO(bol?.date_formatted);
      if (!iso) continue;
      const d = new Date(iso);
      if (Number.isNaN(d.getTime()) || d < oneYearAgo) continue;

      if (bol?.lcl === true) lclShipments12m += 1;
      else if (bol?.lcl === false) fclShipments12m += 1;
    }
  }

  // --- Shipments last 12m ---
  let shipmentsLast12m =
    Math.trunc(safeNumber(data?.routeKpis?.shipmentsLast12m)) ||
    Math.trunc(safeNumber(data?.route_kpis?.shipments_last_12m)) ||
    0;

  // Fallback: use computed containers or recent_bols length
  if (!shipmentsLast12m) {
    const computed = fclShipments12m + lclShipments12m;
    shipmentsLast12m = computed || recentBols.length || 0;
  }

  // --- Time series (monthly activity) ---
  let timeSeries: Array<{ month: string; fclShipments: number; lclShipments: number }> = [];

  // If provided by API in some form, normalize it
  const apiTimeSeries = Array.isArray(data?.timeSeries) ? data.timeSeries : null;
  if (apiTimeSeries) {
    timeSeries = apiTimeSeries
      .map((x: any) => ({
        month: String(x?.month ?? ""),
        fclShipments: Math.trunc(safeNumber(x?.fclShipments ?? x?.fcl ?? 0)),
        lclShipments: Math.trunc(safeNumber(x?.lclShipments ?? x?.lcl ?? 0)),
      }))
      .filter((x: any) => x.month);
  }

  // Fallback: build from recent_bols by month (YYYY-MM)
  if (!timeSeries.length && recentBols.length) {
    const buckets: Record<string, { fcl: number; lcl: number }> = {};
    for (const bol of recentBols) {
      const iso = parseDMYToISO(bol?.date_formatted);
      if (!iso) continue;
      const month = iso.slice(0, 7);
      if (!buckets[month]) buckets[month] = { fcl: 0, lcl: 0 };
      if (bol?.lcl === true) buckets[month].lcl += 1;
      else if (bol?.lcl === false) buckets[month].fcl += 1;
    }

    timeSeries = Object.entries(buckets)
      .sort((a, b) => (a[0] > b[0] ? 1 : -1))
      .slice(-12)
      .map(([month, v]) => ({
        month,
        fclShipments: v.fcl,
        lclShipments: v.lcl,
      }));
  }

  // --- Top routes last 12m ---
  let topRoutesLast12m: Array<{ route: string; shipments: number }> = [];

  const apiTopRoutes = data?.routeKpis?.topRoutesLast12m ?? data?.route_kpis?.top_routes_last_12m;
  if (Array.isArray(apiTopRoutes)) {
    topRoutesLast12m = apiTopRoutes
      .map((r: any) => {
        const route =
          r?.route ||
          r?.lane ||
          (r?.origin && r?.destination ? `${r.origin} → ${r.destination}` : "") ||
          "";
        const shipments = Math.trunc(safeNumber(r?.shipments ?? r?.count ?? 0));
        return route ? { route, shipments } : null;
      })
      .filter(Boolean) as any[];
  }

  // Fallback: build from recent_bols using origin/destination loc fields
  if (!topRoutesLast12m.length && recentBols.length) {
    const counts: Record<string, number> = {};
    for (const bol of recentBols) {
      const origin =
        bol?.supplier_address_loc ||
        bol?.supplier_address_location ||
        bol?.supplier_address_country ||
        "Unknown";

      const dest =
        bol?.company_address_loc ||
        bol?.company_address_location ||
        bol?.company_address_country ||
        bol?.company_address_country_code ||
        "Unknown";

      const route = `${String(origin || "Unknown")} → ${String(dest || "Unknown")}`;
      counts[route] = (counts[route] || 0) + 1;
    }

    topRoutesLast12m = Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([route, shipments]) => ({ route, shipments }));
  }

  return {
    company_id: slug,
    company_key: `company/${slug}`,
    company_name: data?.title || data?.name || slug,
    country: data?.country || null,
    city: data?.address_plain || data?.city || null,
    website: data?.website || null,

    routeKpis: {
      teuLast12m,
      shipmentsLast12m,
      topRoutesLast12m,
    },

    containers: {
      fclShipments12m,
      lclShipments12m,
    },

    timeSeries,
    lastShipmentDate,
    estSpend,
  };
}
