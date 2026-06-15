// iy-powerquery-sync — IY-3
//
// Admin-triggered sync that pulls from ImportYeti's PowerQuery endpoints
// (US export BOLs, MX import/export declarations, MX customs brokers,
// companies/suppliers aggregates) and upserts into LIT's data warehouse
// (lit_us_export_bols, lit_mx_import_declarations, lit_mx_export_declarations,
// lit_customs_brokers).
//
// Why a separate function from importyeti-proxy:
//   - importyeti-proxy is the per-user lookup path: JWT-gated, quota-counted,
//     fetches /company/{slug} for the saved-company drawer.
//   - iy-powerquery-sync is an OPERATOR path: admin-only, bulk paginates,
//     credit-floor protected. Different cost profile, different auth boundary.
//
// CRITICAL FAIL-FAST: ImportYeti's PowerQuery endpoints are gated behind a
// higher-tier plan. If the first API call returns 401/403, we abort BEFORE
// burning credits or hitting rate limits, and return a clear error so the
// operator knows to contact IY sales rather than retry.
//
// Cost protection: each call's response carries `requestCost` and
// `creditsRemaining`. We log both and abort if creditsRemaining drops below a
// configurable floor (default 100) so the user-flow snapshot pool isn't
// drained by a bulk backfill.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";
import { corsHeaders, handlePreflight, json, requireUser } from "../_shared/auth.ts";
import { createLogger, requestId } from "../_shared/logger.ts";

const DEFAULT_BASE = "https://data.importyeti.com/v1.0";
const DEFAULT_CREDIT_FLOOR = 100;
const DEFAULT_PAGE_SIZE = 100;
const DEFAULT_MAX_PAGES = 50; // hard cap so a single invocation can't burn the wallet

type SyncSource =
  | "mx-import"
  | "mx-export"
  | "us-export"
  | "mx-brokers"
  | "us-companies"
  // Companies aggregates (Gap 2)
  | "us-import-companies"
  | "us-export-companies"
  | "mx-import-companies"
  | "mx-export-companies"
  // Suppliers aggregates (Gap 3)
  | "us-import-suppliers"
  | "mx-import-suppliers"
  | "mx-export-suppliers";

interface SyncRequest {
  source: SyncSource;
  company_name?: string;
  since?: string; // ISO date
  credit_floor?: number;
  max_pages?: number;
  page_size?: number;
}

interface IYPageMeta {
  requestCost?: number;
  creditsRemaining?: number;
  page?: number;
  totalPages?: number;
  total?: number;
}

interface SyncSummary {
  source: SyncSource;
  rows_fetched: number;
  rows_upserted: number;
  pages_fetched: number;
  credits_burned: number;
  credits_remaining: number | null;
  errors: string[];
  aborted_reason?: string;
}

const log = createLogger("iy-powerquery-sync");

Deno.serve(async (req: Request) => {
  const pre = handlePreflight(req);
  if (pre) return pre;

  const rid = requestId();
  const reqLog = log.child({ request_id: rid });

  if (req.method !== "POST") {
    return json({ ok: false, error: "method_not_allowed" }, 405);
  }

  // Auth: JWT + platform_admin. This is an operator path.
  const auth = await requireUser(req);
  if (auth instanceof Response) return auth;

  const { data: adminRow } = await auth.admin
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", auth.user.id)
    .maybeSingle();
  if (!adminRow) {
    reqLog.warn("non_admin_attempt", { user_id: auth.user.id });
    return json({ ok: false, error: "platform_admin_required" }, 403);
  }

  // Parse body
  let body: SyncRequest;
  try {
    body = (await req.json()) as SyncRequest;
  } catch {
    return json({ ok: false, error: "invalid_json" }, 400);
  }
  if (!body?.source) {
    return json({ ok: false, error: "missing_source" }, 400);
  }

  const apiKey = Deno.env.get("IMPORTYETI_API_KEY");
  if (!apiKey) {
    reqLog.error("missing_api_key");
    return json({ ok: false, error: "server_missing_importyeti_key" }, 500);
  }
  const apiBase = (Deno.env.get("IMPORTYETI_API_BASE") || DEFAULT_BASE).replace(/\/+$/, "");

  const creditFloor = Math.max(0, body.credit_floor ?? DEFAULT_CREDIT_FLOOR);
  const maxPages = Math.min(Math.max(1, body.max_pages ?? DEFAULT_MAX_PAGES), 200);
  const pageSize = Math.min(Math.max(10, body.page_size ?? DEFAULT_PAGE_SIZE), 500);

  reqLog.info("sync_started", {
    user_id: auth.user.id,
    source: body.source,
    company_name: body.company_name ?? null,
    since: body.since ?? null,
    credit_floor: creditFloor,
    max_pages: maxPages,
    page_size: pageSize,
  });

  try {
    const summary = await runSync({
      admin: auth.admin,
      apiKey,
      apiBase,
      body,
      creditFloor,
      maxPages,
      pageSize,
      log: reqLog,
    });
    // Cache creditsRemaining for the admin gauge (Gap 5). Best-effort —
    // we don't fail the sync if the kv write hiccups.
    if (typeof summary.credits_remaining === "number") {
      try {
        await auth.admin
          .from("lit_internal_meta")
          .upsert(
            {
              meta_key: "importyeti_credits_remaining",
              meta_value: { credits_remaining: summary.credits_remaining },
              updated_at: new Date().toISOString(),
            },
            { onConflict: "meta_key" },
          );
      } catch (metaErr) {
        reqLog.warn("credits_meta_write_failed", {
          err: metaErr instanceof Error ? metaErr.message : String(metaErr),
        });
      }
    }
    reqLog.info("sync_completed", { ...summary });
    return json({ ok: true, ...summary });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Sentinel: PowerQuery tier-gate. Return clean operator-facing error.
    if (msg.startsWith("PQ_ACCESS_DENIED")) {
      reqLog.error("powerquery_access_denied", { err: msg, source: body.source });
      return json(
        {
          ok: false,
          error: "powerquery_access_denied",
          message:
            "PowerQuery access not enabled on this ImportYeti tier — contact sales (sales@importyeti.com). No credits burned.",
          source: body.source,
        },
        403,
      );
    }
    reqLog.error("sync_failed", { err: msg, source: body.source });
    return json({ ok: false, error: "sync_failed", message: msg }, 500);
  }
});

// ---------------------------------------------------------------------------
// Sync orchestrator
// ---------------------------------------------------------------------------

async function runSync(args: {
  admin: SupabaseClient;
  apiKey: string;
  apiBase: string;
  body: SyncRequest;
  creditFloor: number;
  maxPages: number;
  pageSize: number;
  log: ReturnType<typeof createLogger>;
}): Promise<SyncSummary> {
  const { admin, apiKey, apiBase, body, creditFloor, maxPages, pageSize, log } = args;

  const summary: SyncSummary = {
    source: body.source,
    rows_fetched: 0,
    rows_upserted: 0,
    pages_fetched: 0,
    credits_burned: 0,
    credits_remaining: null,
    errors: [],
  };

  const endpoint = resolveEndpoint(body.source);

  let page = 1;
  while (page <= maxPages) {
    const url = buildPageUrl(apiBase, endpoint, {
      page,
      pageSize,
      companyName: body.company_name,
      since: body.since,
    });

    const { rows, meta, status } = await fetchPage(url, apiKey);

    // FAIL-FAST: tier-gate. On the very first call, a 401/403 means PowerQuery
    // is not enabled on this account. Abort before pagination.
    if (status === 401 || status === 403) {
      throw new Error(
        `PQ_ACCESS_DENIED: HTTP ${status} on ${endpoint} (first-page tier check)`,
      );
    }
    if (status >= 400) {
      summary.errors.push(`HTTP ${status} on page ${page}`);
      log.error("iy_http_error", { status, page, url });
      break;
    }

    summary.pages_fetched += 1;
    summary.rows_fetched += rows.length;
    if (typeof meta.requestCost === "number") {
      summary.credits_burned += meta.requestCost;
    }
    if (typeof meta.creditsRemaining === "number") {
      summary.credits_remaining = meta.creditsRemaining;
    }

    // Credit-floor abort: don't drain the user-flow pool.
    if (
      typeof meta.creditsRemaining === "number" &&
      meta.creditsRemaining < creditFloor
    ) {
      summary.aborted_reason = `credits_remaining=${meta.creditsRemaining} dropped below floor=${creditFloor}`;
      log.warn("credit_floor_hit", {
        credits_remaining: meta.creditsRemaining,
        floor: creditFloor,
        pages_fetched: summary.pages_fetched,
      });
      // Upsert what we got before bailing.
      const upserted = await upsertRows(admin, body.source, rows);
      summary.rows_upserted += upserted;
      break;
    }

    if (rows.length > 0) {
      const upserted = await upsertRows(admin, body.source, rows);
      summary.rows_upserted += upserted;
    }

    log.info("page_fetched", {
      page,
      rows: rows.length,
      request_cost: meta.requestCost ?? null,
      credits_remaining: meta.creditsRemaining ?? null,
      total_pages: meta.totalPages ?? null,
    });

    // Pagination termination
    if (rows.length === 0) break;
    if (typeof meta.totalPages === "number" && page >= meta.totalPages) break;
    if (rows.length < pageSize) break;

    page += 1;
  }

  return summary;
}

// ---------------------------------------------------------------------------
// IY endpoint mapping
// ---------------------------------------------------------------------------

function resolveEndpoint(source: SyncSource): string {
  switch (source) {
    case "mx-import":
      return "/powerquery/mx-import/declarations";
    case "mx-export":
      return "/powerquery/mx-export/declarations";
    case "us-export":
      return "/powerquery/us-export/bols";
    case "mx-brokers":
      // Combined: caller can pass which side via `source` — we hit mx-import
      // brokers by default; an explicit second invocation handles mx-export.
      // Keeping single-source semantics so credit accounting stays clean.
      return "/powerquery/mx-import/brokers";
    case "us-companies":
      return "/powerquery/us-import/companies";
    // Companies aggregates (Gap 2) — richer endpoints per IY docs (carries
    // customs_offices / product_descriptions / incoterms / name_variations).
    case "us-import-companies":
      return "/powerquery/us-import/companies";
    case "us-export-companies":
      return "/powerquery/us-export/companies";
    case "mx-import-companies":
      return "/powerquery/mx-import/companies";
    case "mx-export-companies":
      return "/powerquery/mx-export/companies";
    // Suppliers aggregates (Gap 3) — per-buyer supplier rollup.
    case "us-import-suppliers":
      return "/powerquery/us-import/suppliers";
    case "mx-import-suppliers":
      return "/powerquery/mx-import/suppliers";
    case "mx-export-suppliers":
      return "/powerquery/mx-export/suppliers";
    default:
      throw new Error(`unknown_source:${source}`);
  }
}

function buildPageUrl(
  base: string,
  endpoint: string,
  opts: { page: number; pageSize: number; companyName?: string; since?: string },
): string {
  const u = new URL(base + endpoint);
  u.searchParams.set("page", String(opts.page));
  u.searchParams.set("page_size", String(opts.pageSize));
  if (opts.companyName) u.searchParams.set("company_name", opts.companyName);
  if (opts.since) u.searchParams.set("since", opts.since);
  return u.toString();
}

async function fetchPage(
  url: string,
  apiKey: string,
): Promise<{ rows: any[]; meta: IYPageMeta; status: number }> {
  const resp = await fetch(url, {
    method: "GET",
    headers: { IYApiKey: apiKey, Accept: "application/json" },
  });

  const status = resp.status;
  let payload: any = {};
  try {
    payload = await resp.json();
  } catch {
    // some IY endpoints return empty body on error
    payload = {};
  }

  const rows: any[] =
    (Array.isArray(payload?.data) && payload.data) ||
    (Array.isArray(payload?.results) && payload.results) ||
    (Array.isArray(payload?.rows) && payload.rows) ||
    (Array.isArray(payload) && payload) ||
    [];

  const meta: IYPageMeta = {
    requestCost:
      pickNum(payload?.requestCost) ??
      pickNum(payload?.request_cost) ??
      pickNum(payload?.meta?.requestCost) ??
      undefined,
    creditsRemaining:
      pickNum(payload?.creditsRemaining) ??
      pickNum(payload?.credits_remaining) ??
      pickNum(payload?.meta?.creditsRemaining) ??
      undefined,
    page: pickNum(payload?.page) ?? pickNum(payload?.meta?.page),
    totalPages:
      pickNum(payload?.totalPages) ??
      pickNum(payload?.total_pages) ??
      pickNum(payload?.meta?.totalPages),
    total: pickNum(payload?.total) ?? pickNum(payload?.meta?.total),
  };

  return { rows, meta, status };
}

function pickNum(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

function pickStr(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length ? t : null;
}

function pickDate(v: unknown): string | null {
  const s = pickStr(v);
  if (!s) return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Upserters per source
// ---------------------------------------------------------------------------

async function upsertRows(
  admin: SupabaseClient,
  source: SyncSource,
  rows: any[],
): Promise<number> {
  if (!rows.length) return 0;
  switch (source) {
    case "mx-import":
      return upsertMxImportDeclarations(admin, rows);
    case "mx-export":
      return upsertMxExportDeclarations(admin, rows);
    case "us-export":
      return upsertUsExportBols(admin, rows);
    case "mx-brokers":
      return upsertCustomsBrokers(admin, rows, "mx-import");
    case "us-companies":
      // Companies aggregate writes into lit_company_index (existing). For now
      // we just count rows; the proxy already owns company-row hydration.
      return rows.length;
    case "us-import-companies":
    case "us-export-companies":
    case "mx-import-companies":
    case "mx-export-companies":
      return upsertCompanyAggregates(admin, rows, source);
    case "us-import-suppliers":
    case "mx-import-suppliers":
    case "mx-export-suppliers":
      return upsertSupplierAggregates(admin, rows, source);
  }
}

// ---------------------------------------------------------------------------
// Companies aggregates (Gap 2)
// ---------------------------------------------------------------------------
async function upsertCompanyAggregates(
  admin: SupabaseClient,
  rows: any[],
  source: string,
): Promise<number> {
  const mapped = rows
    .map((r) => {
      const name = pickStr(r?.company_name ?? r?.name);
      if (!name) return null;
      return {
        source,
        company_name: name,
        company_address: pickStrArr(r?.company_address ?? r?.addresses),
        company_country_code: pickStr(r?.company_country_code ?? r?.country_code),
        company_country: pickStr(r?.company_country ?? r?.country),
        total_shipments: pickNum(r?.total_shipments ?? r?.shipments) ?? null,
        name_variations: pickStrArr(r?.name_variations ?? r?.aliases),
        customs_offices: pickStrArr(r?.customs_offices ?? r?.ports),
        product_descriptions: pickStrArr(r?.product_descriptions ?? r?.products),
        incoterms: pickStrArr(r?.incoterms),
        raw_payload: r,
        updated_at: new Date().toISOString(),
      };
    })
    .filter((x) => x !== null) as any[];
  if (!mapped.length) return 0;
  const { error, count } = await admin
    .from("lit_pq_company_aggregates")
    .upsert(mapped, { onConflict: "source,company_name", count: "exact" });
  if (error) throw new Error(`upsert_company_aggregates_failed: ${error.message}`);
  return count ?? mapped.length;
}

// ---------------------------------------------------------------------------
// Suppliers aggregates (Gap 3)
// ---------------------------------------------------------------------------
async function upsertSupplierAggregates(
  admin: SupabaseClient,
  rows: any[],
  source: string,
): Promise<number> {
  // Suppliers endpoint shape:
  //   { buyer_company_name, suppliers: [{ name, country, shipment_count, ... }] }
  // OR flattened rows where each row is one buyer/supplier pair. We support
  // both: if a row carries a `suppliers` array we expand it; otherwise we
  // treat the row as already-flattened.
  const flattened: any[] = [];
  for (const r of rows) {
    const buyer = pickStr(r?.buyer_company_name ?? r?.company_name ?? r?.buyer);
    if (!buyer) continue;
    if (Array.isArray(r?.suppliers)) {
      for (const s of r.suppliers) {
        flattened.push({ buyer, sup: s });
      }
    } else {
      flattened.push({ buyer, sup: r });
    }
  }
  const mapped = flattened
    .map(({ buyer, sup }) => {
      const supplierName = pickStr(sup?.supplier_name ?? sup?.name);
      if (!supplierName) return null;
      return {
        source,
        buyer_company_name: buyer,
        supplier_name: supplierName,
        supplier_country: pickStr(sup?.supplier_country ?? sup?.country),
        shipment_count: pickNum(sup?.shipment_count ?? sup?.count) ?? null,
        top_products: pickStrArr(sup?.top_products ?? sup?.product_descriptions),
        first_shipment_date: pickDate(sup?.first_shipment_date ?? sup?.first_shipment),
        last_shipment_date: pickDate(sup?.last_shipment_date ?? sup?.last_shipment),
        raw_payload: sup,
      };
    })
    .filter((x) => x !== null) as any[];
  if (!mapped.length) return 0;
  const { error, count } = await admin
    .from("lit_pq_supplier_aggregates")
    .upsert(mapped, {
      onConflict: "source,buyer_company_name,supplier_name",
      count: "exact",
    });
  if (error) throw new Error(`upsert_supplier_aggregates_failed: ${error.message}`);
  return count ?? mapped.length;
}

function pickStrArr(v: unknown): string[] | null {
  if (!Array.isArray(v)) return null;
  const out = v
    .map((x) => (typeof x === "string" ? x.trim() : null))
    .filter((x): x is string => Boolean(x && x.length));
  return out.length ? out : null;
}

async function upsertMxImportDeclarations(
  admin: SupabaseClient,
  rows: any[],
): Promise<number> {
  const mapped = rows
    .map((r) => {
      const decl_id =
        pickStr(r?.declaration_id) ??
        pickStr(r?.id) ??
        pickStr(r?.pedimento) ??
        null;
      if (!decl_id) return null;
      return {
        declaration_id: decl_id,
        declaration_date: pickDate(r?.declaration_date ?? r?.date),
        importer_name: pickStr(r?.importer_name ?? r?.importer),
        importer_rfc: pickStr(r?.importer_rfc ?? r?.rfc),
        supplier_name: pickStr(r?.supplier_name ?? r?.supplier),
        supplier_country: pickStr(r?.supplier_country),
        customs_broker_name: pickStr(r?.customs_broker_name ?? r?.broker_name),
        customs_broker_id: pickStr(r?.customs_broker_id ?? r?.broker_id),
        customs_office: pickStr(r?.customs_office ?? r?.aduana),
        transport_type: pickStr(r?.transport_type ?? r?.medio_transporte),
        hs_code: pickStr(r?.hs_code ?? r?.fraccion),
        product_description: pickStr(r?.product_description ?? r?.descripcion),
        value_usd: pickNum(r?.value_usd ?? r?.valor_usd) ?? null,
        weight_kg: pickNum(r?.weight_kg ?? r?.peso_kg) ?? null,
        origin_country: pickStr(r?.origin_country ?? r?.pais_origen),
        raw_payload: r,
        updated_at: new Date().toISOString(),
      };
    })
    .filter((x) => x !== null) as any[];
  if (!mapped.length) return 0;
  const { error, count } = await admin
    .from("lit_mx_import_declarations")
    .upsert(mapped, { onConflict: "declaration_id", count: "exact" });
  if (error) throw new Error(`upsert_mx_import_failed: ${error.message}`);
  return count ?? mapped.length;
}

async function upsertMxExportDeclarations(
  admin: SupabaseClient,
  rows: any[],
): Promise<number> {
  const mapped = rows
    .map((r) => {
      const decl_id =
        pickStr(r?.declaration_id) ??
        pickStr(r?.id) ??
        pickStr(r?.pedimento) ??
        null;
      if (!decl_id) return null;
      return {
        declaration_id: decl_id,
        declaration_date: pickDate(r?.declaration_date ?? r?.date),
        exporter_name: pickStr(r?.exporter_name ?? r?.exporter),
        exporter_rfc: pickStr(r?.exporter_rfc ?? r?.rfc),
        consignee_name: pickStr(r?.consignee_name ?? r?.consignee),
        consignee_country: pickStr(r?.consignee_country),
        customs_broker_name: pickStr(r?.customs_broker_name ?? r?.broker_name),
        customs_broker_id: pickStr(r?.customs_broker_id ?? r?.broker_id),
        customs_office: pickStr(r?.customs_office ?? r?.aduana),
        transport_type: pickStr(r?.transport_type ?? r?.medio_transporte),
        hs_code: pickStr(r?.hs_code ?? r?.fraccion),
        product_description: pickStr(r?.product_description ?? r?.descripcion),
        value_usd: pickNum(r?.value_usd ?? r?.valor_usd) ?? null,
        weight_kg: pickNum(r?.weight_kg ?? r?.peso_kg) ?? null,
        destination_country: pickStr(r?.destination_country ?? r?.pais_destino),
        raw_payload: r,
        updated_at: new Date().toISOString(),
      };
    })
    .filter((x) => x !== null) as any[];
  if (!mapped.length) return 0;
  const { error, count } = await admin
    .from("lit_mx_export_declarations")
    .upsert(mapped, { onConflict: "declaration_id", count: "exact" });
  if (error) throw new Error(`upsert_mx_export_failed: ${error.message}`);
  return count ?? mapped.length;
}

async function upsertUsExportBols(
  admin: SupabaseClient,
  rows: any[],
): Promise<number> {
  const mapped = rows
    .map((r) => {
      const bol = pickStr(r?.bol_number ?? r?.bill_of_lading ?? r?.bol);
      if (!bol) return null;
      return {
        bol_number: bol,
        shipper_name: pickStr(r?.shipper_name ?? r?.shipper),
        consignee_name: pickStr(r?.consignee_name ?? r?.consignee),
        consignee_country: pickStr(r?.consignee_country ?? r?.destination_country),
        carrier: pickStr(r?.carrier ?? r?.carrier_name),
        vessel: pickStr(r?.vessel ?? r?.vessel_name),
        origin_port: pickStr(r?.origin_port ?? r?.port_of_lading),
        destination_port: pickStr(r?.destination_port ?? r?.port_of_unlading),
        hs_code: pickStr(r?.hs_code),
        product_description: pickStr(r?.product_description ?? r?.description),
        teu: pickNum(r?.teu) ?? null,
        weight_kg: pickNum(r?.weight_kg ?? r?.weight) ?? null,
        shipment_date: pickDate(r?.shipment_date ?? r?.date_formatted ?? r?.date),
        raw_payload: r,
      };
    })
    .filter((x) => x !== null) as any[];
  if (!mapped.length) return 0;
  const { error, count } = await admin
    .from("lit_us_export_bols")
    .upsert(mapped, { onConflict: "bol_number", count: "exact" });
  if (error) throw new Error(`upsert_us_export_failed: ${error.message}`);
  return count ?? mapped.length;
}

async function upsertCustomsBrokers(
  admin: SupabaseClient,
  rows: any[],
  source: string,
): Promise<number> {
  const mapped = rows
    .map((r) => {
      const name = pickStr(r?.broker_name ?? r?.name);
      if (!name) return null;
      return {
        source,
        broker_name: name,
        broker_id: pickStr(r?.broker_id ?? r?.id) ?? "",
        declaration_count: pickNum(r?.declaration_count ?? r?.count) ?? 0,
        raw_payload: r,
        fetched_at: new Date().toISOString(),
      };
    })
    .filter((x) => x !== null) as any[];
  if (!mapped.length) return 0;
  const { error, count } = await admin
    .from("lit_customs_brokers")
    .upsert(mapped, {
      onConflict: "source,broker_id,broker_name",
      count: "exact",
    });
  if (error) throw new Error(`upsert_brokers_failed: ${error.message}`);
  return count ?? mapped.length;
}
