import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const IY_BASE_URL = "https://data.importyeti.com/v1.0";
const IY_API_KEY = Deno.env.get("IY_API_KEY") || "";
const SNAPSHOT_TTL_DAYS = 30;

type Json = Record<string, unknown>;

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function daysAgoIso(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

function normalizeSlug(value: string) {
  return String(value || "")
    .trim()
    .replace(/^company\//i, "")
    .replace(/^\/company\//i, "")
    .replace(/\s+/g, "-")
    .toLowerCase();
}

function coerceNumber(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const cleaned = v.replace(/[$,]/g, "").trim();
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/**
 * FACT: Your frontend expects:
 * - timeSeries[] entries with { month, fclShipments, lclShipments }
 * - routeKpis.topRoutesLast12m[] entries with { route, shipments }
 *
 * Your ImportYeti payloads sometimes use:
 * - timeSeries[] entries with { month, fcl, lcl }
 * - routes[] entries with { lane, shipments, origin, destination }
 *
 * So we normalize all of that here.
 */
function normalizeCompanyData(input: any, companyKey: string) {
  const data = input?.data ?? input ?? {};
  const companyId = normalizeSlug(data.company_id ?? data.companyId ?? companyKey);
  const key = String(data.key ?? data.company_key ?? `company/${companyId}`);

  // --- Route KPIs ---
  const routeKpisIn = data.routeKpis ?? {};
  const teuLast12m =
    coerceNumber(routeKpisIn.teuLast12m) ??
    coerceNumber(data.teuLast12m) ??
    coerceNumber(data.teu_12m) ??
    coerceNumber(data.total_teu);

  const shipmentsLast12m =
    coerceNumber(routeKpisIn.shipmentsLast12m) ??
    coerceNumber(data.shipmentsLast12m) ??
    coerceNumber(data.shipments_12m) ??
    coerceNumber(data.total_shipments);

  const estSpendUsd12m =
    coerceNumber(routeKpisIn.estSpendUsd12m) ??
    coerceNumber(routeKpisIn.est_spend_usd) ??
    coerceNumber(routeKpisIn.estSpend) ??
    coerceNumber(data.estSpendUsd12m) ??
    coerceNumber(data.est_spend_usd) ??
    coerceNumber(data.estimated_spend_12m) ??
    coerceNumber(data.total_shipping_cost);

  const topRoutesRaw =
    routeKpisIn.topRoutesLast12m ??
    data.topRoutesLast12m ??
    data.top_routes ??
    data.top_ports ??
    [];

  const topRoutesLast12m = Array.isArray(topRoutesRaw)
    ? topRoutesRaw
        .map((r: any) => {
          const route =
            (typeof r?.route === "string" && r.route) ||
            (typeof r?.lane === "string" && r.lane) ||
            [r?.origin, r?.destination]
              .filter((x: unknown) => typeof x === "string" && x.length)
              .join(" → ");

          const shipments =
            coerceNumber(r?.shipments) ??
            coerceNumber(r?.count) ??
            coerceNumber(r?.total_shipments);

          if (!route && shipments == null) return null;
          return {
            route: route || "Unknown → Unknown",
            shipments: shipments ?? null,
            origin: typeof r?.origin === "string" ? r.origin : null,
            destination: typeof r?.destination === "string" ? r.destination : null,
          };
        })
        .filter(Boolean)
    : [];

  // --- Containers (FCL/LCL 12m) ---
  // frontend normalization can read containers_load[] where load_type is FCL/LCL and shipments is numeric
  const containersLoad: any[] = [];
  const containersIn = data.containers ?? data.containers_load ?? null;

  // If ImportYeti gave { containers: { fclShipments12m, lclShipments12m } }
  const fcl12m =
    coerceNumber(data?.containers?.fclShipments12m) ??
    coerceNumber(data?.containers?.fclShipments) ??
    null;

  const lcl12m =
    coerceNumber(data?.containers?.lclShipments12m) ??
    coerceNumber(data?.containers?.lclShipments) ??
    null;

  // If ImportYeti gave containers_load already, keep it
  if (Array.isArray(containersIn)) {
    for (const entry of containersIn) {
      if (!entry || typeof entry !== "object") continue;
      const lt = String((entry as any).load_type ?? (entry as any).loadType ?? "").toUpperCase();
      const shipments = coerceNumber((entry as any).shipments);
      if ((lt === "FCL" || lt === "LCL") && shipments != null) {
        containersLoad.push({ load_type: lt, shipments });
      }
    }
  }

  // If containers_load missing, synthesize it from containers.fcl/lcl 12m
  if (!containersLoad.length && (fcl12m != null || lcl12m != null)) {
    containersLoad.push({ load_type: "FCL", shipments: fcl12m ?? 0 });
    containersLoad.push({ load_type: "LCL", shipments: lcl12m ?? 0 });
  }

  // --- Time Series (Monthly Activity) ---
  // normalize timeSeries to { month, fclShipments, lclShipments }
  const tsIn = Array.isArray(data.timeSeries) ? data.timeSeries : [];
  const timeSeries = tsIn
    .map((row: any) => {
      const month = String(row?.month ?? "");
      if (!month) return null;

      // Support BOTH shapes:
      // { fclShipments, lclShipments }  OR  { fcl, lcl }
      const fclShipments = coerceNumber(row?.fclShipments) ?? coerceNumber(row?.fcl) ?? 0;
      const lclShipments = coerceNumber(row?.lclShipments) ?? coerceNumber(row?.lcl) ?? 0;

      return { month, fclShipments, lclShipments };
    })
    .filter(Boolean)
    .slice(-12);

  const out = {
    key,
    company_id: companyId,
    company_key: key,
    title: data.title ?? data.name ?? data.company_name ?? null,
    name: data.name ?? data.title ?? data.company_name ?? null,
    company_name: data.company_name ?? data.title ?? data.name ?? null,
    website: data.website ?? null,
    domain: data.domain ?? null,
    phone: data.phone ?? data.phone_number ?? data.phoneNumber ?? null,
    address: data.address ?? data.company_address ?? null,
    city: data.city ?? null,
    country: data.country ?? null,
    country_code: data.country_code ?? data.countryCode ?? null,

    routeKpis: {
      teuLast12m: teuLast12m ?? null,
      shipmentsLast12m: shipmentsLast12m ?? null,
      estSpendUsd12m: estSpendUsd12m ?? null,
      topRoutesLast12m,
    },

    containers_load: containersLoad,
    timeSeries,
    lastShipmentDate: data.lastShipmentDate ?? data.last_shipment_date ?? null,
  };

  return out;
}

async function iyFetch(path: string) {
  const url = `${IY_BASE_URL}${path}`;
  const res = await fetch(url, {
    headers: {
      // keep this aligned with what your current proxy already uses (Apikey is in your CORS allow list)
      apikey: IY_API_KEY,
      Apikey: IY_API_KEY,
      "Content-Type": "application/json",
    },
  });

  const text = await res.text();
  let parsed: any = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = { raw: text };
  }

  if (!res.ok) {
    throw new Error(`ImportYeti error ${res.status}: ${JSON.stringify(parsed)?.slice(0, 500)}`);
  }

  return parsed;
}

async function handleSearch(q: string, page: number, pageSize: number) {
  if (!q || !q.trim()) return json({ ok: true, data: [] });

  // NOTE: keep this path aligned with ImportYeti DMA search endpoint
  const payload = await iyFetch(`/company/search?q=${encodeURIComponent(q)}&page=${page}&pageSize=${pageSize}`);
  return json({ ok: true, ...payload });
}

async function handleSnapshot(supabase: any, company_id: string) {
  const slug = normalizeSlug(company_id);
  const companyKey = `company/${slug}`;

  // cache lookup
  const { data: cached, error: cacheErr } = await supabase
    .from("lit_importyeti_company_snapshot")
    .select("*")
    .eq("company_id", slug)
    .maybeSingle();

  if (cacheErr) {
    // don’t fail hard, just continue to fetch
    console.error("cache read error", cacheErr);
  }

  const updatedAt = cached?.updated_at ? new Date(cached.updated_at as string) : null;
  const isFresh =
    updatedAt && updatedAt.getTime() > new Date(daysAgoIso(SNAPSHOT_TTL_DAYS)).getTime();

  if (cached && isFresh) {
    return json({
      ok: true,
      source: "cache",
      hasSnapshot: true,
      hasRaw: Boolean(cached.raw_payload),
      raw: cached.raw_payload ?? null,
      parsedSummary: cached.parsed_summary ?? null,
    });
  }

  // fetch company profile
  const rawProfile = await iyFetch(`/company/${encodeURIComponent(slug)}`);
  const normalized = normalizeCompanyData(rawProfile, companyKey);

  // store snapshot (raw + parsed summary)
  const parsedSummary = {
    company_key: normalized.company_key,
    company_name: normalized.company_name ?? normalized.title ?? normalized.name,
    website: normalized.website ?? null,
    country: normalized.country ?? normalized.country_code ?? null,
    total_teu: normalized.routeKpis?.teuLast12m ?? null,
    total_shipments: normalized.routeKpis?.shipmentsLast12m ?? null,
    fcl_count:
      (Array.isArray(normalized.containers_load)
        ? normalized.containers_load.find((x: any) => x.load_type === "FCL")?.shipments
        : null) ?? null,
    lcl_count:
      (Array.isArray(normalized.containers_load)
        ? normalized.containers_load.find((x: any) => x.load_type === "LCL")?.shipments
        : null) ?? null,
    est_spend: normalized.routeKpis?.estSpendUsd12m ?? null,
    top_routes: normalized.routeKpis?.topRoutesLast12m ?? [],
    monthly_volumes: normalized.timeSeries ?? [],
    last_shipment_date: normalized.lastShipmentDate ?? null,
  };

  const rawToStore = {
    // IMPORTANT: keep the raw payload the frontend reads under `.data`
    ...rawProfile,
    data: normalized,
  };

  const { error: upsertErr } = await supabase
    .from("lit_importyeti_company_snapshot")
    .upsert(
      {
        company_id: slug,
        raw_payload: rawToStore,
        parsed_summary: parsedSummary,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "company_id" },
    );

  if (upsertErr) {
    console.error("snapshot upsert error", upsertErr);
  }

  return json({
    ok: true,
    source: "api",
    hasSnapshot: true,
    hasRaw: true,
    raw: rawToStore,
    parsedSummary,
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  try {
    if (!IY_API_KEY) return json({ error: "Missing IY_API_KEY" }, 500);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = await req.json().catch(() => ({}));
    const { action, company_id, q, page = 1, pageSize = 25 } = body ?? {};

    if (action === "search") {
      return await handleSearch(String(q ?? ""), Number(page ?? 1), Number(pageSize ?? 25));
    }

    // default: snapshot
    if (!company_id) return json({ error: "company_id required" }, 400);
    return await handleSnapshot(supabase, String(company_id));
  } catch (err: any) {
    console.error("importyeti-proxy error", err);
    return json({ error: String(err?.message ?? err) }, 500);
  }
});
