import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const IY_BASE_URL = "https://data.importyeti.com/v1.0";
const IY_API_KEY = Deno.env.get("IY_API_KEY") || Deno.env.get("IY_DMA_API_KEY") || "";
const SNAPSHOT_TTL_DAYS = 30;

type AnyObj = Record<string, any>;

function json(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
  });
}

function normalizeSlug(input: string) {
  if (!input) return "";
  let s = input.trim();
  s = s.replace(/^company\//, "");
  s = s.replace(/^\/company\//, "");
  return s.toLowerCase();
}

function parseMMDDYYYY(s?: string | null): Date | null {
  if (!s || typeof s !== "string") return null;
  // expects "10/12/2025"
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const mm = Number(m[1]);
  const dd = Number(m[2]);
  const yyyy = Number(m[3]);
  const d = new Date(Date.UTC(yyyy, mm - 1, dd));
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function isoDateOnly(d: Date) {
  return d.toISOString().slice(0, 10);
}

function monthKey(d: Date) {
  return d.toISOString().slice(0, 7); // YYYY-MM
}

function safeNumber(x: any, fallback = 0) {
  const n = typeof x === "string" ? Number(x) : x;
  return Number.isFinite(n) ? n : fallback;
}

async function iyFetch(method: "GET" | "POST", path: string, params?: Record<string, any>, body?: any) {
  if (!IY_API_KEY) {
    throw new Error("Missing ImportYeti API key env var (IY_API_KEY or IY_DMA_API_KEY).");
  }

  const url = new URL(IY_BASE_URL + path);

  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined || v === null) continue;
      url.searchParams.set(k, String(v));
    }
  }

  // We send x-api-key (common) and also apikey for compatibility.
  // We do NOT forward the Supabase user JWT to ImportYeti.
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-api-key": IY_API_KEY,
    "apikey": IY_API_KEY,
  };

  const res = await fetch(url.toString(), {
    method,
    headers,
    body: method === "POST" ? JSON.stringify(body ?? {}) : undefined,
  });

  const text = await res.text();
  let parsed: any = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = { raw: text };
  }

  if (!res.ok) {
    const msg = parsed?.message || parsed?.error || res.statusText || "ImportYeti request failed";
    throw new Error(`ImportYeti error ${res.status}: ${msg}`);
  }

  return parsed;
}

function buildTopRoutesFromBols(bols: AnyObj[], limit = 10) {
  // route is often null in raw payload, so we derive from supplier + consignee location
  const counts = new Map<string, number>();

  for (const b of bols) {
    const origin =
      b?.supplier_address_loc ||
      b?.supplier_address_location ||
      b?.supplier_address_loc_country ||
      b?.supplier_address_country ||
      "Unknown";

    const dest =
      b?.company_address_location ||
      b?.company_address_loc ||
      b?.company_address_country ||
      b?.company_address_loc_country ||
      "Unknown";

    const route = `${origin} → ${dest}`;
    counts.set(route, (counts.get(route) || 0) + 1);
  }

  const arr = Array.from(counts.entries())
    .map(([route, shipments]) => ({ route, shipments }))
    .sort((a, b) => b.shipments - a.shipments)
    .slice(0, limit);

  return arr;
}

function buildMonthlyFromBols(bols: AnyObj[]) {
  const byMonth = new Map<string, { fcl: number; lcl: number }>();

  for (const b of bols) {
    const d = parseMMDDYYYY(b?.date_formatted);
    if (!d) continue;

    const mk = monthKey(d);

    // factual fallback: if containers_count >= 1 => FCL-like movement
    // if containers_count is 0 or missing => treat as LCL/other
    const containersCount = safeNumber(b?.containers_count, 0);
    const isFcl = containersCount >= 1;

    const cur = byMonth.get(mk) || { fcl: 0, lcl: 0 };
    if (isFcl) cur.fcl += 1;
    else cur.lcl += 1;
    byMonth.set(mk, cur);
  }

  const months = Array.from(byMonth.keys()).sort();
  return months.map((m) => ({
    month: m,
    fclShipments: byMonth.get(m)!.fcl,
    lclShipments: byMonth.get(m)!.lcl,
    total: byMonth.get(m)!.fcl + byMonth.get(m)!.lcl,
  }));
}

function buildParsedSummary(companyId: string, rawData: AnyObj) {
  const key = rawData?.company_url ? rawData.company_url.replace(/^\//, "") : `company/${companyId}`;
  const title = rawData?.title || rawData?.name || rawData?.company_name || companyId;

  const country =
    rawData?.country ||
    rawData?.country_name ||
    rawData?.country_code ||
    rawData?.company_address_country ||
    null;

  const website = rawData?.website || rawData?.company_website || null;

  const containers = rawData?.containers || null;

  // Fact-based TEU mapping: the raw payload gives containers.teus directly (example: 251.2)
  const teuLast12m =
    containers && typeof containers === "object" && containers.teus != null
      ? safeNumber(containers.teus, 0)
      : 0;

  // Fact-based FCL/LCL mapping from raw payload:
  // containers.total and containers.other exist (example: total 2324, other 9 => FCL 2315, LCL 9)
  const totalShipmentsAll = containers?.total != null ? safeNumber(containers.total, 0) : 0;
  const otherShipments = containers?.other != null ? safeNumber(containers.other, 0) : 0;

  const fclShipments12m = totalShipmentsAll > 0 ? Math.max(totalShipmentsAll - otherShipments, 0) : 0;
  const lclShipments12m = totalShipmentsAll > 0 ? otherShipments : 0;

  // The raw payload often includes a recent BOL sample set (commonly 50 rows)
  const bols: AnyObj[] = Array.isArray(rawData?.bols) ? rawData.bols : [];
  const shipmentsLast12m =
    bols.length > 0 ? bols.length : (rawData?.bols_count != null ? safeNumber(rawData.bols_count, 0) : 0);

  // lastShipmentDate: use max of bols.date_formatted if available
  let lastShipmentDate: string | null = null;
  if (bols.length) {
    let maxD: Date | null = null;
    for (const b of bols) {
      const d = parseMMDDYYYY(b?.date_formatted);
      if (!d) continue;
      if (!maxD || d.getTime() > maxD.getTime()) maxD = d;
    }
    if (maxD) lastShipmentDate = isoDateOnly(maxD);
  }
  if (!lastShipmentDate && rawData?.most_recent_shipment) {
    const d = parseMMDDYYYY(rawData.most_recent_shipment);
    if (d) lastShipmentDate = isoDateOnly(d);
  }

  const topRoutesLast12m = bols.length ? buildTopRoutesFromBols(bols, 10) : [];

  // monthly activity: derive from bols so chart can render immediately
  const timeSeries = bols.length ? buildMonthlyFromBols(bols) : [];

  // Est spend: raw payload provides total_shipping_cost (example: 12906022.25)
  const estSpend = rawData?.total_shipping_cost != null ? safeNumber(rawData.total_shipping_cost, 0) : 0;

  return {
    key,
    title,
    country,
    website,
    companyId,
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

async function handleSearch(q: string, page: number, pageSize: number) {
  // ImportYeti spec: GET /company/search?q=...
  const res = await iyFetch("GET", "/company/search", { q, page, pageSize });
  return json({ ok: true, source: "api", data: res });
}

function isFresh(updatedAt: string | null) {
  if (!updatedAt) return false;
  const d = new Date(updatedAt);
  if (Number.isNaN(d.getTime())) return false;
  const ageMs = Date.now() - d.getTime();
  const ttlMs = SNAPSHOT_TTL_DAYS * 24 * 60 * 60 * 1000;
  return ageMs < ttlMs;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    let body: AnyObj = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    const action = body?.action;
    const q = body?.q;
    const page = body?.page ?? 1;
    const pageSize = body?.pageSize ?? 25;
    const company_id = body?.company_id;

    if (action === "search") {
      if (!q || typeof q !== "string") return json({ error: "q required" }, 400);
      return await handleSearch(q, page, pageSize);
    }

    if (!company_id || typeof company_id !== "string") {
      return json({ error: "company_id required" }, 400);
    }

    const slug = normalizeSlug(company_id);

    // 1) Try cache
    const { data: cached, error: cacheErr } = await supabase
      .from("lit_importyeti_company_snapshot")
      .select("company_id, raw_payload, parsed_summary, updated_at")
      .eq("company_id", slug)
      .maybeSingle();

    if (!cacheErr && cached?.parsed_summary && isFresh(cached.updated_at)) {
      return json({
        ok: true,
        source: "cache",
        hasSnapshot: true,
        hasRaw: !!cached.raw_payload,
        data: cached.parsed_summary,
      });
    }

    // 2) Fetch from ImportYeti
    const raw = await iyFetch("GET", `/company/${slug}`);
    const rawData = raw?.data ?? raw; // support either wrapped or direct

    const parsed = buildParsedSummary(slug, rawData);

    // 3) Upsert snapshot (no .catch chaining)
    const upsertPayload = {
      company_id: slug,
      raw_payload: { data: rawData },
      parsed_summary: parsed,
      updated_at: new Date().toISOString(),
    };

    const { error: upsertErr } = await supabase
      .from("lit_importyeti_company_snapshot")
      .upsert(upsertPayload, { onConflict: "company_id" });

    if (upsertErr) {
      // Still return parsed data so UI doesn’t require “open twice”
      return json({
        ok: true,
        source: "api",
        warning: "Snapshot upsert failed",
        upsertError: upsertErr.message,
        data: parsed,
      });
    }

    return json({
      ok: true,
      source: "api",
      hasSnapshot: true,
      hasRaw: true,
      data: parsed,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({ error: msg }, 500);
  }
});
