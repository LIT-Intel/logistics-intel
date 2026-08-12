// company-history-ingest — P0-L deep shipment-history ingestion worker.
//
// ImportYeti DMA reality (probed 2026-08-12):
//   GET /company/{slug}/bols?offset=N   → { data: [bolId, ...] }  — 10 IDs per
//       page, `limit` is IGNORED upstream, offset works. requestCost = 1.0
//       credit per page.
//   GET /bol/{bolId}                    → { data: {...full BOL detail...} }
//       requestCost = 0.1 credit. Carries arrival_date (MM/DD/YYYY), HS code,
//       TEU, weight, containers, entry/exit ports, geocoded company address
//       (city/state/zip), supplier country/city, carrier SCAC, shipping_cost.
//
// Flow per run: pick a saved company → page BOL IDs → for IDs we already hold
// in lit_unified_shipments just flip them to ingest_source='history' (free) →
// fetch detail ONLY for unknown IDs (0.1 credit each, cached 7d) → upsert →
// rebuild lit_company_lane_months via lit_rebuild_company_lane_months().
//
// Cost containment (sacred — see CLAUDE.md):
//   - lit_importyeti_cache: ID pages (`bolsids:{slug}:{offset}`) and BOL
//     details (`boldetail:{bolId}`) cached 7 days. Cache hits are free and do
//     not consume budget.
//   - Per-company cap: max_pages_per_company_per_window ID pages per rolling
//     window (default 20 pages = 200 BOLs / 30 days ≈ ≤40 credits worst case).
//   - Global daily budget: daily_page_budget ID pages/day across all companies
//     (default 12 ≈ ≤24 credits/day worst case) in lit_history_ingest_budget.
//   - All caps live in lit_internal_meta['company_history_ingest_config'] so
//     the owner tunes without a deploy. request_cost (credits) is accumulated
//     per company in lit_company_history_ingest.last_request_cost.
//
// Auth: pg_cron via X-Internal-Cron (LIT_CRON_SECRET) OR server-to-server via
// Authorization: Bearer <SERVICE_ROLE_KEY>. Deployed with verify_jwt=false.
//
// Body (all optional): { company_id?: string, max_pages?: number, probe_path?: string }
//   - company_id: ingest this specific slug (must still be a saved company —
//     deep ingestion is saved-only, never search results).
//   - max_pages: override max_pages_per_run for this invocation (still capped
//     by the per-company window cap and the daily budget).
//   - probe_path: owner/admin diagnostic — fetch a raw DMA path and return it.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { verifyCronAuth } from "../_shared/cron_auth.ts";
import { buildUnifiedShipmentRow } from "../_shared/materialize_bols.ts";

const CONFIG_META_KEY = "company_history_ingest_config";
const PAGE_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // mirror BOLS_CACHE_TTL_MS in importyeti-proxy
const WALL_CLOCK_BUDGET_MS = 100_000; // stay well inside the edge runtime limit
const IDS_PER_PAGE = 10; // fixed upstream — /bols ignores `limit`

type IngestConfig = {
  enabled: boolean;
  max_pages_per_company_per_window: number;
  window_days: number;
  daily_page_budget: number;
  max_pages_per_run: number;
  refresh_stale_days: number;
};

const DEFAULT_CONFIG: IngestConfig = {
  enabled: true,
  max_pages_per_company_per_window: 20,
  window_days: 30,
  daily_page_budget: 12,
  max_pages_per_run: 3,
  refresh_stale_days: 30,
};

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function getIyEnv(): { apiKey: string; baseUrl: string } | null {
  const apiKey =
    Deno.env.get("IYApiKey")?.trim() ||
    Deno.env.get("IY_DMA_API_KEY")?.trim() ||
    Deno.env.get("IY_API_KEY")?.trim() ||
    Deno.env.get("IMPORTYETI_API_KEY")?.trim() ||
    "";
  if (!apiKey) return null;
  const baseUrl = (
    Deno.env.get("IY_DMA_BASE_URL")?.trim() || "https://data.importyeti.com/v1.0"
  )
    .replace(/\/company\/searches\/?$/, "")
    .replace(/\/searches\/?$/, "")
    .replace(/\/+$/, "");
  return { apiKey, baseUrl };
}

async function loadConfig(sb: any): Promise<IngestConfig> {
  try {
    const { data } = await sb
      .from("lit_internal_meta")
      .select("meta_value")
      .eq("meta_key", CONFIG_META_KEY)
      .maybeSingle();
    return { ...DEFAULT_CONFIG, ...(data?.meta_value ?? {}) };
  } catch {
    return DEFAULT_CONFIG;
  }
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

async function getBudgetUsed(sb: any): Promise<number> {
  const { data } = await sb
    .from("lit_history_ingest_budget")
    .select("pages_used")
    .eq("day", todayUtc())
    .maybeSingle();
  return data?.pages_used ?? 0;
}

async function addBudgetUsed(sb: any, pages: number): Promise<void> {
  if (pages <= 0) return;
  const used = await getBudgetUsed(sb);
  await sb.from("lit_history_ingest_budget").upsert(
    { day: todayUtc(), pages_used: used + pages, updated_at: new Date().toISOString() },
    { onConflict: "day" },
  );
}

function extractRequestCost(payload: any): number {
  const c = payload?.requestCost ?? payload?.request_cost ?? payload?.cost ?? null;
  const n = typeof c === "string" ? Number(c) : c;
  return typeof n === "number" && Number.isFinite(n) ? n : 0;
}

async function cacheGet(sb: any, key: string): Promise<any | null> {
  try {
    const { data: hit } = await sb
      .from("lit_importyeti_cache")
      .select("response_data, expires_at, hit_count")
      .eq("cache_key", key)
      .maybeSingle();
    if (
      hit?.response_data &&
      hit.expires_at &&
      new Date(hit.expires_at).getTime() > Date.now()
    ) {
      await sb
        .from("lit_importyeti_cache")
        .update({ hit_count: (hit.hit_count ?? 0) + 1, last_hit_at: new Date().toISOString() })
        .eq("cache_key", key);
      return hit.response_data;
    }
  } catch (e: any) {
    console.warn("[company-history-ingest] cache read failed:", e?.message || e);
  }
  return null;
}

async function cachePut(sb: any, key: string, endpoint: string, params: any, payload: any): Promise<void> {
  try {
    await sb.from("lit_importyeti_cache").upsert(
      {
        cache_key: key,
        endpoint,
        params_hash: key,
        request_params: params,
        response_data: payload,
        status_code: 200,
        created_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + PAGE_CACHE_TTL_MS).toISOString(),
      },
      { onConflict: "cache_key" },
    );
  } catch (e: any) {
    console.warn("[company-history-ingest] cache write failed:", e?.message || e);
  }
}

async function iyGet(iy: { apiKey: string; baseUrl: string }, path: string): Promise<any> {
  const resp = await fetch(`${iy.baseUrl}${path}`, {
    method: "GET",
    headers: { IYApiKey: iy.apiKey, Accept: "application/json" },
  });
  const text = await resp.text();
  if (!resp.ok) {
    throw new Error(`ImportYeti ${resp.status} on ${path}: ${text.slice(0, 300)}`);
  }
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return {};
  }
}

// ── /company/{slug}/bols ID page (cache-first) ──────────────────────────────
async function fetchIdPage(
  sb: any,
  slug: string,
  offset: number,
  iy: { apiKey: string; baseUrl: string },
): Promise<{ ids: string[]; fromCache: boolean; credits: number }> {
  const key = `bolsids:${slug}:${offset}`;
  const cached = await cacheGet(sb, key);
  if (cached) {
    const ids = Array.isArray(cached?.data) ? cached.data.filter((x: any) => typeof x === "string") : [];
    return { ids, fromCache: true, credits: 0 };
  }
  const payload = await iyGet(iy, `/company/${slug}/bols?offset=${offset}`);
  await cachePut(sb, key, "company/bols", { company_id: slug, offset }, payload);
  const ids = Array.isArray(payload?.data) ? payload.data.filter((x: any) => typeof x === "string") : [];
  return { ids, fromCache: false, credits: extractRequestCost(payload) || 1 };
}

// ── /bol/{id} detail (cache-first) ──────────────────────────────────────────
async function fetchBolDetail(
  sb: any,
  bolId: string,
  iy: { apiKey: string; baseUrl: string },
): Promise<{ detail: any | null; fromCache: boolean; credits: number }> {
  const key = `boldetail:${bolId}`;
  const cached = await cacheGet(sb, key);
  if (cached) {
    return { detail: cached?.data ?? cached, fromCache: true, credits: 0 };
  }
  const payload = await iyGet(iy, `/bol/${encodeURIComponent(bolId)}`);
  await cachePut(sb, key, "bol/detail", { bol_id: bolId }, payload);
  return {
    detail: payload?.data ?? null,
    fromCache: false,
    credits: extractRequestCost(payload) || 0.1,
  };
}

// Map a /bol/{id} detail payload onto the raw-BOL key shape that
// buildUnifiedShipmentRow (shared with the snapshot materializer) expects.
// NOTE: detail arrival_date is MM/DD/YYYY (verified: "07/17/2026") while
// recent_bols date_formatted is DD/MM/YYYY — convert to ISO here so the shared
// DD/MM parser is never given an MM/DD string.
function detailToRawBol(d: any): any | null {
  if (!d || typeof d !== "object") return null;
  const bolId = d.bol_number ?? d.display_bol_number ?? d.master_bol_number;
  if (!bolId) return null;

  const arrivalIso = parseMmDdYyyyToIso(d.arrival_date) ??
    parseYyyymmddToIso(d.estimated_arrival_date);

  // "MEDU - Msc Mediterranean Shipping Company" → scac + name
  let carrierCode: string | null = null;
  let carrierName: string | null = null;
  if (typeof d.carrier_scac_code === "string" && d.carrier_scac_code.trim()) {
    const parts = d.carrier_scac_code.split("-");
    carrierCode = parts[0]?.trim() || null;
    carrierName = parts.slice(1).join("-").trim() || null;
  }

  const companyGeo = d.company_address_geocode?.address_components ?? {};
  const supplierGeo = d.supplier_address_geocode?.address_components ?? {};

  return {
    house_bill_of_lading: d.bol_number ?? d.display_bol_number ?? null,
    Bill_of_Lading: d.display_bol_number ?? null,
    Master_Bill_of_Lading: d.master_bol_number ?? null,
    shipmentDate: arrivalIso, // ISO — bypasses the DD/MM parser correctly
    carrierCode,
    carrierName,
    Shipper_Name: d.supplier_name ?? d.supplier_basename ?? null,
    Consignee_Name: d.company_name ?? d.company_basename ?? null,
    Country: d.supplier_country ?? d.supplier_address_country ?? null,
    country_code: d.supplier_country_code ?? d.supplier_address_country_code ?? null,
    supplier_address_location: supplierGeo.city ?? d.place_of_receipt ?? null,
    company_address_country: d.company_country ?? null,
    company_address_country_code: d.company_country_code ?? null,
    company_address_location: companyGeo.city ?? null,
    Consignee_Address: d.company_address_geocode?.formatted_address ?? d.company_address ?? null,
    route: { origin: d.exit_port ?? null, destination: d.entry_port ?? null },
    HS_Code: d.hs_code ?? null,
    Product_Description: d.product_description_raw ?? d.product_description ?? null,
    containers_count: d.containers_count ?? null,
    TEU: d.teu ?? null,
    Weight_in_KG: d.weight ?? null,
    lcl: d.lcl === true,
    shipping_cost: d.shipping_cost ?? null,
    Quantity: d.quantity ?? null,
    Quantity_Unit: d.quantity_unit ?? null,
    Container_Type: Array.isArray(d.container_types) && d.container_types.length === 1
      ? d.container_types[0]?.type ?? null
      : null,
  };
}

function parseMmDdYyyyToIso(s: unknown): string | null {
  if (typeof s !== "string") return null;
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s.trim());
  if (!m) return null;
  const [, mm, dd, yyyy] = m;
  const mo = Number(mm);
  const da = Number(dd);
  if (mo < 1 || mo > 12 || da < 1 || da > 31) return null;
  return `${yyyy}-${mm}-${dd}T00:00:00Z`;
}

function parseYyyymmddToIso(s: unknown): string | null {
  if (typeof s !== "string") return null;
  const m = /^(\d{4})(\d{2})(\d{2})$/.exec(s.trim());
  if (!m) return null;
  return `${m[1]}-${m[2]}-${m[3]}T00:00:00Z`;
}

// Pick the next saved company that needs deep ingestion.
async function pickNextCompany(
  sb: any,
  cfg: IngestConfig,
): Promise<string | null> {
  const { data: saved, error } = await sb
    .from("lit_saved_companies")
    .select("source_company_key")
    .not("source_company_key", "is", null)
    .limit(1000);
  if (error) throw new Error(`saved_companies read failed: ${error.message}`);

  const slugs: string[] = Array.from(
    new Set(
      (saved || [])
        .map((r: any) => String(r.source_company_key || "").trim())
        .filter(Boolean),
    ),
  );
  if (slugs.length === 0) return null;

  const { data: states } = await sb
    .from("lit_company_history_ingest")
    .select("*")
    .in("company_id", slugs);
  const stateMap = new Map((states || []).map((s: any) => [s.company_id, s]));

  const now = Date.now();
  const staleMs = cfg.refresh_stale_days * 24 * 60 * 60 * 1000;
  const windowMs = cfg.window_days * 24 * 60 * 60 * 1000;

  const candidates = slugs.filter((slug) => {
    const st: any = stateMap.get(slug);
    if (!st) return true; // never ingested
    const lastAt = st.last_ingest_at ? new Date(st.last_ingest_at).getTime() : 0;
    if (st.complete && now - lastAt < staleMs) return false; // done & fresh
    const windowStart = st.window_started_at
      ? new Date(st.window_started_at).getTime()
      : 0;
    const windowExpired = now - windowStart >= windowMs;
    if (!windowExpired && st.pages_fetched_window >= cfg.max_pages_per_company_per_window) {
      return false; // per-company cap exhausted for this window
    }
    return true;
  });
  if (candidates.length === 0) return null;

  candidates.sort((a, b) => {
    const sa: any = stateMap.get(a);
    const sb2: any = stateMap.get(b);
    const ta = sa?.last_ingest_at ? new Date(sa.last_ingest_at).getTime() : 0;
    const tb = sb2?.last_ingest_at ? new Date(sb2.last_ingest_at).getTime() : 0;
    return ta - tb; // never-ingested (0) first, then oldest
  });
  return candidates[0];
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return json({ ok: false, error: "POST only" }, 405);
  }

  // Auth: cron header OR service-role bearer.
  const cron = verifyCronAuth(req);
  if (!cron.ok) {
    const bearer = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
    const srk = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    if (!srk || bearer !== srk) return cron.response;
  }

  const startedAt = Date.now();
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    return json({ ok: false, error: "supabase env missing" }, 500);
  }
  const sb = createClient(supabaseUrl, serviceKey);

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const cfg = await loadConfig(sb);
  if (!cfg.enabled) {
    return json({ ok: true, skipped: "ingest disabled via config" });
  }

  const iy = getIyEnv();
  if (!iy) {
    return json({ ok: false, error: "ImportYeti API key not configured" }, 500);
  }

  // Admin/owner probe: fetch an arbitrary DMA path (company/bol scope only) to
  // inspect endpoint capabilities without deploying. Cron/service auth only.
  // Costs real IY credits — use sparingly. Does NOT cache or ingest.
  if (typeof body.probe_path === "string") {
    const p = body.probe_path;
    if (!p.startsWith("/company") && !p.startsWith("/bol")) {
      return json({ ok: false, error: "probe_path must start with /company or /bol" }, 400);
    }
    const resp = await fetch(`${iy.baseUrl}${p}`, {
      headers: { IYApiKey: iy.apiKey, Accept: "application/json" },
    });
    const text = await resp.text();
    let parsed: any = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text.slice(0, 2000);
    }
    return json({ ok: resp.ok, probe: p, status: resp.status, payload: parsed });
  }

  // Global daily budget (unit: upstream ID pages; detail fetches ride along
  // and are bounded at 10 × 0.1 credit per page).
  const budgetUsed = await getBudgetUsed(sb);
  let budgetRemaining = cfg.daily_page_budget - budgetUsed;
  if (budgetRemaining <= 0) {
    return json({
      ok: true,
      skipped: "daily page budget exhausted",
      budget: { used: budgetUsed, cap: cfg.daily_page_budget },
    });
  }

  // Target company: explicit (must be saved) or next stale saved company.
  let slug: string | null = null;
  if (typeof body.company_id === "string" && body.company_id.trim()) {
    const requested = body.company_id.trim().replace(/^company\//, "");
    const { data: savedHit } = await sb
      .from("lit_saved_companies")
      .select("id")
      .eq("source_company_key", requested)
      .limit(1)
      .maybeSingle();
    if (!savedHit) {
      return json(
        { ok: false, error: `company '${requested}' is not a saved company — deep ingestion is saved-only`, code: "NOT_SAVED" },
        403,
      );
    }
    slug = requested;
  } else {
    slug = await pickNextCompany(sb, cfg);
    if (!slug) {
      return json({ ok: true, skipped: "no saved company needs ingestion" });
    }
  }

  // Load / normalize per-company state.
  const { data: stateRow } = await sb
    .from("lit_company_history_ingest")
    .select("*")
    .eq("company_id", slug)
    .maybeSingle();

  const now = Date.now();
  const windowMs = cfg.window_days * 24 * 60 * 60 * 1000;
  const staleMs = cfg.refresh_stale_days * 24 * 60 * 60 * 1000;

  let windowStartedAt = stateRow?.window_started_at
    ? new Date(stateRow.window_started_at).getTime()
    : 0;
  let pagesInWindow = stateRow?.pages_fetched_window ?? 0;
  if (now - windowStartedAt >= windowMs) {
    windowStartedAt = now;
    pagesInWindow = 0;
  }

  let lastOffset = stateRow?.last_offset ?? 0;
  let complete = Boolean(stateRow?.complete);
  const lastIngestAt = stateRow?.last_ingest_at
    ? new Date(stateRow.last_ingest_at).getTime()
    : 0;

  if (complete && now - lastIngestAt < staleMs) {
    return json({ ok: true, company_id: slug, skipped: "complete and fresh" });
  }
  if (complete) {
    // Stale refresh: re-pull from the top; upserts dedupe on (company_id, bol_number).
    lastOffset = 0;
    complete = false;
  }

  const companyPagesRemaining = Math.max(
    0,
    cfg.max_pages_per_company_per_window - pagesInWindow,
  );
  if (companyPagesRemaining === 0) {
    return json({
      ok: true,
      company_id: slug,
      skipped: "per-company window cap exhausted",
      pages_in_window: pagesInWindow,
    });
  }

  const maxPagesThisRun = Math.min(
    typeof body.max_pages === "number" && body.max_pages > 0
      ? Math.floor(body.max_pages)
      : cfg.max_pages_per_run,
    companyPagesRemaining,
    budgetRemaining,
  );

  let pagesFetched = 0;
  let pagesFromCache = 0;
  let billedPages = 0;
  let detailsFetched = 0;
  let detailsFromCache = 0;
  let bolsUpserted = 0;
  let bolsLinked = 0; // pre-existing rows flipped to ingest_source='history'
  let bolsSkipped = 0;
  let creditsSpent = 0;
  let lastError: string | null = null;

  try {
    while (pagesFetched < maxPagesThisRun) {
      if (Date.now() - startedAt > WALL_CLOCK_BUDGET_MS) break;

      const offset = lastOffset;
      const page = await fetchIdPage(sb, slug, offset, iy);
      pagesFetched++;
      if (page.fromCache) {
        pagesFromCache++;
      } else {
        billedPages++;
        pagesInWindow++;
        budgetRemaining--;
        creditsSpent += page.credits;
      }

      const sourcePage = Math.floor(offset / IDS_PER_PAGE);
      const ids = Array.from(new Set(page.ids));

      if (ids.length > 0) {
        // 1. IDs we already hold (as house/master/display BOL numbers) — flip
        //    to history so the snapshot sweep can never remove them. Free.
        const orFilter = `bol_number.in.(${ids.map((i) => `"${i}"`).join(",")}),master_bol.in.(${ids.map((i) => `"${i}"`).join(",")})`;
        const { data: existingRows } = await sb
          .from("lit_unified_shipments")
          .select("bol_number, master_bol")
          .eq("company_id", slug)
          .or(orFilter);
        const known = new Set<string>();
        for (const r of existingRows || []) {
          if (r.bol_number) known.add(r.bol_number);
          if (r.master_bol) known.add(r.master_bol);
        }
        const knownIds = ids.filter((i) => known.has(i));
        const unknownIds = ids.filter((i) => !known.has(i));

        if (knownIds.length > 0) {
          const knownOr = `bol_number.in.(${knownIds.map((i) => `"${i}"`).join(",")}),master_bol.in.(${knownIds.map((i) => `"${i}"`).join(",")})`;
          await sb
            .from("lit_unified_shipments")
            .update({ ingest_source: "history", source_page: sourcePage })
            .eq("company_id", slug)
            .or(knownOr);
          bolsLinked += knownIds.length;
        }

        // 2. Unknown IDs — fetch detail (0.1 credit each, cached), map, upsert.
        const rows: any[] = [];
        const seen = new Set<string>();
        for (const bolId of unknownIds) {
          if (Date.now() - startedAt > WALL_CLOCK_BUDGET_MS) break;
          try {
            const det = await fetchBolDetail(sb, bolId, iy);
            if (det.fromCache) detailsFromCache++;
            else {
              detailsFetched++;
              creditsSpent += det.credits;
            }
            const rawBol = detailToRawBol(det.detail);
            if (!rawBol) {
              bolsSkipped++;
              continue;
            }
            const row = buildUnifiedShipmentRow(slug, rawBol);
            if (!row || seen.has(row.bol_number)) {
              if (!row) bolsSkipped++;
              continue;
            }
            seen.add(row.bol_number);
            // Keep the FULL upstream detail as raw_payload (not the mapped
            // intermediate) and never touch tracking_* on conflict.
            row.raw_payload = det.detail;
            delete row.tracking_status;
            delete row.tracking_eta;
            delete row.tracking_arrival_actual;
            delete row.tracking_last_event_code;
            delete row.tracking_last_event_at;
            delete row.tracking_refreshed_at;
            row.ingest_source = "history";
            row.source_page = sourcePage;
            rows.push(row);
          } catch (detailErr: any) {
            console.warn(`[company-history-ingest] detail failed for ${bolId}:`, detailErr?.message || detailErr);
            bolsSkipped++;
          }
        }

        if (rows.length > 0) {
          const { error: upsertErr } = await sb
            .from("lit_unified_shipments")
            .upsert(rows, { onConflict: "company_id,bol_number" });
          if (upsertErr) {
            throw new Error(`upsert failed at offset ${offset}: ${upsertErr.message}`);
          }
          bolsUpserted += rows.length;
        }
      }

      lastOffset = offset + IDS_PER_PAGE;
      if (page.ids.length < IDS_PER_PAGE) {
        complete = true;
        break;
      }
      if (budgetRemaining <= 0) break;
    }
  } catch (e: any) {
    lastError = e?.message || String(e);
    console.error(`[company-history-ingest] ${slug}:`, lastError);
  }

  // Persist budget + state (even on partial failure so progress isn't lost).
  await addBudgetUsed(sb, billedPages);
  await sb.from("lit_company_history_ingest").upsert(
    {
      company_id: slug,
      window_started_at: new Date(windowStartedAt || now).toISOString(),
      pages_fetched_window: pagesInWindow,
      last_offset: lastOffset,
      total_bols_ingested: (stateRow?.total_bols_ingested ?? 0) + bolsUpserted,
      complete,
      last_ingest_at: new Date().toISOString(),
      last_error: lastError,
      last_request_cost:
        Math.round(((stateRow?.last_request_cost ?? 0) + creditsSpent) * 100) / 100,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "company_id" },
  );

  // Rebuild the lane × month rollup from ALL of this company's BOL rows.
  let laneRows: number | null = null;
  try {
    const { data: rebuilt, error: rpcErr } = await sb.rpc(
      "lit_rebuild_company_lane_months",
      { p_company_id: slug },
    );
    if (rpcErr) throw new Error(rpcErr.message);
    laneRows = typeof rebuilt === "number" ? rebuilt : null;
  } catch (e: any) {
    console.error(`[company-history-ingest] rollup rebuild failed for ${slug}:`, e?.message || e);
  }

  const summary = {
    ok: lastError === null,
    company_id: slug,
    pages_fetched: pagesFetched,
    pages_from_cache: pagesFromCache,
    billed_pages: billedPages,
    details_fetched: detailsFetched,
    details_from_cache: detailsFromCache,
    bols_upserted: bolsUpserted,
    bols_linked_existing: bolsLinked,
    bols_skipped: bolsSkipped,
    complete,
    next_offset: complete ? null : lastOffset,
    lane_month_rows: laneRows,
    credits_spent: Math.round(creditsSpent * 100) / 100,
    budget: {
      used_today: budgetUsed + billedPages,
      cap: cfg.daily_page_budget,
    },
    error: lastError,
  };
  console.log("[company-history-ingest] summary:", JSON.stringify(summary));
  return json(summary, lastError === null ? 200 : 500);
});
