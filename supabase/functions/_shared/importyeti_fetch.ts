// Shared ImportYeti fetch + snapshot upsert.
//
// Used by:
//   - importyeti-proxy (user-flow, JWT-gated, quota-counted)
//   - pulse-refresh-tick (cron, bypasses user quota — credits counted at org level)
//
// Returns the new snapshot AND the previous parsed_summary so the caller can
// run diff alerts without an extra DB roundtrip.
//
// The `buildParsedSummary` implementation here mirrors
// `buildSnapshotFromCompanyData` from `importyeti-proxy/index.ts` so both call
// sites (proxy user-flow and pulse-refresh-tick cron) write identical shapes
// into `lit_importyeti_company_snapshot.parsed_summary`.

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";
import {
  isProviderEnabled,
  recordProviderUsage,
  updateProviderBalance,
  type ProviderUsageEvent,
} from "./provider_ledger.ts";
import {
  PROVIDER_FLAGS,
  PROVIDERS,
  type ProviderOperation,
  type TriggerType,
} from "./provider_operations.ts";

export type EnvConfig = {
  IMPORTYETI_API_KEY: string;
  IMPORTYETI_API_BASE?: string;
};

/**
 * Metering context threaded into every gated ImportYeti fetch. Optional at the
 * type level so pre-existing callers keep compiling, but both real callers
 * (importyeti-proxy, pulse-refresh-tick) pass it so the call is gated + ledgered.
 */
export type MeterCtx = {
  operation: ProviderOperation | string;
  trigger_type: TriggerType | string;
  source: string;
  organization_id?: string | null;
  user_id?: string | null;
  company_id?: string | null;
  saved_company_id?: string | null;
  subscription_tier?: string | null;
  request_id?: string | null;
  /** Kill-switch flag to gate on. Defaults to IMPORTYETI_ENABLED. */
  flagKey?: string;
};

export type FetchResult = {
  httpStatus: number;
  parsedSummary: Record<string, unknown> | null;
  previousParsedSummary: Record<string, unknown> | null;
  rawPayload: Record<string, unknown> | null;
  /** Provider account balance from the upstream response, when reported. */
  creditsRemaining?: number | null;
};

const DEFAULT_BASE = "https://data.importyeti.com/v1.0";
const SNAPSHOT_TABLE = "lit_importyeti_company_snapshot";

/**
 * Extract the ImportYeti account balance from a response. IY reports it in the
 * JSON body (creditsRemaining / credits_remaining / meta.creditsRemaining —
 * mirrors iy-powerquery-sync's fetchPage) and, on some endpoints, in a header
 * (x-credits-remaining). Returns null when no balance is present.
 */
function extractCreditsRemaining(
  payload: Record<string, unknown> | null,
  resp: Response,
): number | null {
  const p: any = payload ?? {};
  const bodyVal =
    pickFiniteNumber(p?.creditsRemaining) ??
    pickFiniteNumber(p?.credits_remaining) ??
    pickFiniteNumber(p?.meta?.creditsRemaining) ??
    pickFiniteNumber(p?.meta?.credits_remaining) ??
    pickFiniteNumber(p?.data?.creditsRemaining) ??
    pickFiniteNumber(p?.data?.credits_remaining);
  if (bodyVal != null) return bodyVal;

  const headerVal =
    resp.headers.get("x-credits-remaining") ??
    resp.headers.get("x-credits-left") ??
    resp.headers.get("iy-credits-remaining");
  return pickFiniteNumber(headerVal);
}

function pickFiniteNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

/**
 * Fire a ledger row for one upstream ImportYeti fetch. credits_consumed is left
 * null so recordProviderUsage fills it from provider_pricing.credit_cost (we do
 * NOT derive per-call credits here). Balance is mirrored when reported. All
 * metering is best-effort — the helpers never throw — so it can NEVER change
 * this function's return/throw contract for callers.
 */
async function meterFetch(
  supabase: SupabaseClient,
  meterCtx: MeterCtx,
  status: ProviderUsageEvent["status"],
  cleanSlug: string,
  creditsRemaining: number | null,
): Promise<void> {
  await recordProviderUsage(supabase, {
    provider: PROVIDERS.IMPORTYETI,
    operation: meterCtx.operation,
    status,
    credits_consumed: null, // let the helper fill from provider_pricing
    cache_hit: false,
    trigger_type: meterCtx.trigger_type,
    source: meterCtx.source,
    organization_id: meterCtx.organization_id ?? null,
    user_id: meterCtx.user_id ?? null,
    company_id: meterCtx.company_id ?? null,
    saved_company_id: meterCtx.saved_company_id ?? null,
    subscription_tier: meterCtx.subscription_tier ?? null,
    request_id: meterCtx.request_id ?? null,
    metadata: { company_slug: cleanSlug },
  });
  await updateProviderBalance(supabase, PROVIDERS.IMPORTYETI, creditsRemaining);
}

export async function fetchAndUpsertSnapshot(
  supabase: SupabaseClient,
  companySlug: string,
  env: EnvConfig,
  meterCtx?: MeterCtx,
): Promise<FetchResult> {
  const cleanSlug = normalizeCompanyKey(companySlug);

  // 0. Kill-switch gate — checked BEFORE any upstream spend. Fail-open lives
  //    inside isProviderEnabled, so a flag-RPC bug won't block real traffic.
  if (meterCtx) {
    const flagKey = meterCtx.flagKey ?? PROVIDER_FLAGS.IMPORTYETI_ENABLED;
    const enabled = await isProviderEnabled(supabase, flagKey);
    if (!enabled) {
      const err = new Error(
        `importyeti provider disabled by flag ${flagKey}`,
      ) as Error & { code?: string };
      err.code = "PROVIDER_DISABLED";
      throw err;
    }
  }

  // 1. Pull current snapshot (the about-to-be-previous payload).
  const { data: prev } = await supabase
    .from(SNAPSHOT_TABLE)
    .select("parsed_summary")
    .eq("company_id", cleanSlug)
    .maybeSingle();

  const previousParsedSummary =
    (prev as { parsed_summary?: Record<string, unknown> } | null)
      ?.parsed_summary ?? null;

  // 2. Fetch upstream.
  const base = (env.IMPORTYETI_API_BASE || DEFAULT_BASE).replace(/\/+$/, "");
  const url = `${base}/company/${encodeURIComponent(cleanSlug)}`;
  const resp = await fetch(url, {
    method: "GET",
    headers: {
      IYApiKey: env.IMPORTYETI_API_KEY,
      Accept: "application/json",
    },
  });

  if (resp.status === 404) {
    // 404 still bills upstream — record it and mirror any balance in the body.
    let notFoundPayload: Record<string, unknown> | null = null;
    try {
      const t = await resp.text();
      notFoundPayload = t ? JSON.parse(t) : null;
    } catch {
      notFoundPayload = null;
    }
    const creditsRemaining = extractCreditsRemaining(notFoundPayload, resp);
    if (meterCtx) {
      await meterFetch(supabase, meterCtx, "not_found", cleanSlug, creditsRemaining);
    }
    return {
      httpStatus: 404,
      parsedSummary: null,
      previousParsedSummary,
      rawPayload: null,
      creditsRemaining,
    };
  }
  if (!resp.ok) {
    // Read the body so callers can distinguish "Not enough credits" (the
    // DMA's 403 when the account balance is exhausted — verified live
    // 2026-08-13: {"message":"Not enough credits","error":"Forbidden",
    // "statusCode":403}) from a real auth failure. Callers surface an
    // honest "provider credits exhausted" state instead of a generic 5xx.
    let bodyText = "";
    try {
      bodyText = await resp.text();
    } catch {
      /* body unreadable — fall through with status only */
    }
    const creditsExhausted =
      resp.status === 402 ||
      /not enough credits|insufficient credits/i.test(bodyText);

    // The exhausted (402/403) body may still carry the (near-zero) balance.
    let errPayload: Record<string, unknown> | null = null;
    try {
      errPayload = bodyText ? JSON.parse(bodyText) : null;
    } catch {
      errPayload = null;
    }
    const creditsRemaining = extractCreditsRemaining(errPayload, resp);
    if (meterCtx) {
      await meterFetch(
        supabase,
        meterCtx,
        creditsExhausted ? "credits_exhausted" : "error",
        cleanSlug,
        creditsRemaining,
      );
    }

    const err = new Error(
      creditsExhausted
        ? `importyeti_credits_exhausted (upstream ${resp.status})`
        : `importyeti_upstream_${resp.status}${bodyText ? `: ${bodyText.slice(0, 300)}` : ""}`,
    ) as Error & { code?: string; upstreamStatus?: number };
    err.code = creditsExhausted
      ? "PROVIDER_CREDITS_EXHAUSTED"
      : `IMPORTYETI_UPSTREAM_${resp.status}`;
    err.upstreamStatus = resp.status;
    throw err;
  }

  const text = await resp.text();
  let rawPayload: Record<string, unknown> = {};
  try {
    rawPayload = text ? JSON.parse(text) : {};
  } catch {
    rawPayload = {};
  }

  const creditsRemaining = extractCreditsRemaining(rawPayload, resp);
  const parsedSummary = buildParsedSummary(cleanSlug, rawPayload);

  // 3. Upsert with previous_parsed_summary preserved.
  const { error } = await supabase.from(SNAPSHOT_TABLE).upsert(
    {
      company_id: cleanSlug,
      raw_payload: rawPayload,
      parsed_summary: parsedSummary,
      previous_parsed_summary: previousParsedSummary,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "company_id" },
  );

  if (error) throw new Error(`snapshot_upsert_failed: ${error.message}`);

  // 4. Ledger the successful upstream call + mirror the live balance. Best-
  //    effort — meterFetch's helpers never throw, so a metering failure cannot
  //    change what this function returns to its callers.
  if (meterCtx) {
    await meterFetch(supabase, meterCtx, "success", cleanSlug, creditsRemaining);
  }

  return {
    httpStatus: 200,
    parsedSummary,
    previousParsedSummary,
    rawPayload,
    creditsRemaining,
  };
}

// ---------------------------------------------------------------------------
// parsed_summary builder — mirror of `buildSnapshotFromCompanyData` from
// importyeti-proxy/index.ts. Both call sites must produce the same shape.
// ---------------------------------------------------------------------------

type MonthlyVolume = {
  fcl: number;
  lcl: number;
  shipments: number;
  teu: number;
  weight: number;
};

type TopRoute = {
  route: string;
  shipments: number;
  teu: number | null;
  fclShipments: number | null;
  lclShipments: number | null;
};

export function buildParsedSummary(
  companySlug: string,
  rawPayload: Record<string, unknown>,
): Record<string, unknown> {
  // Mirror proxy: upstream sometimes wraps payload in `{ data: {...} }`.
  const raw: any =
    (rawPayload as any)?.data ??
    rawPayload ??
    {};

  const last12Keys = getLast12MonthKeys();

  const monthlyMap = parseTimeSeriesToMonthlyVolumes(raw?.time_series);
  applyRecentBolsFclLclSplits(monthlyMap, raw?.recent_bols);

  const orderedMonths = Array.from(monthlyMap.entries()).sort((a, b) =>
    a[0].localeCompare(b[0]),
  );

  let shipmentsLast12m = 0;
  let totalTeu12m = 0;
  let totalWeight12m = 0;
  let fclCount12m = 0;
  let lclCount12m = 0;

  for (const [month, value] of orderedMonths) {
    if (!last12Keys.has(month)) continue;
    shipmentsLast12m += value.shipments || 0;
    totalTeu12m += value.teu || 0;
    totalWeight12m += value.weight || 0;
    fclCount12m += value.fcl || 0;
    lclCount12m += value.lcl || 0;
  }

  if (fclCount12m === 0 && lclCount12m === 0) {
    const loadRows = Array.isArray(raw?.containers_load) ? raw.containers_load : [];
    const fclRow = loadRows.find(
      (row: any) => String(row?.load_type).toUpperCase() === "FCL",
    );
    const lclRow = loadRows.find(
      (row: any) => String(row?.load_type).toUpperCase() === "LCL",
    );

    const fclPctValue = normalizeNumber(fclRow?.shipments_perc);
    const lclPctValue = normalizeNumber(lclRow?.shipments_perc);

    const pctFcl = fclPctValue != null ? fclPctValue / 100 : null;
    const pctLcl = lclPctValue != null ? lclPctValue / 100 : null;

    if (shipmentsLast12m > 0 && pctFcl != null && pctLcl != null) {
      fclCount12m = Math.round(shipmentsLast12m * pctFcl);
      lclCount12m = Math.max(0, shipmentsLast12m - fclCount12m);
    }
  }

  const isUsableRouteLabel = (value: unknown): value is string =>
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.trim() !== "Unknown → Unknown";

  let topRoutes: TopRoute[] = buildTopRoutesFromRecentBols(raw?.recent_bols);

  const needsFallback =
    topRoutes.length === 0 ||
    topRoutes.every((entry) => !isUsableRouteLabel(entry?.route));

  if (needsFallback) {
    const aggregated: any[] = Array.isArray(raw?.route_kpis?.topRoutesLast12m)
      ? raw.route_kpis.topRoutesLast12m
      : Array.isArray(raw?.top_routes)
        ? raw.top_routes
        : Array.isArray(raw?.topRoutes)
          ? raw.topRoutes
          : [];
    const fallback: TopRoute[] = [];
    for (const entry of aggregated) {
      let route: string | null = normalizeString(entry?.route);
      if (!isUsableRouteLabel(route)) {
        route = buildRouteLabel(entry);
      }
      if (!isUsableRouteLabel(route)) continue;

      const shipments =
        normalizeNumber(entry?.shipments) ??
        normalizeNumber(entry?.count) ??
        normalizeNumber(entry?.shipments_12m) ??
        0;

      const teu =
        normalizeNumber(entry?.teu) ??
        normalizeNumber(entry?.total_teu) ??
        normalizeNumber(entry?.teu_12m) ??
        null;

      const fclShipments =
        normalizeNumber(entry?.fclShipments) ??
        normalizeNumber(entry?.fcl_count) ??
        normalizeNumber(entry?.fcl_shipments) ??
        null;

      const lclShipments =
        normalizeNumber(entry?.lclShipments) ??
        normalizeNumber(entry?.lcl_count) ??
        normalizeNumber(entry?.lcl_shipments) ??
        null;

      fallback.push({ route, shipments, teu, fclShipments, lclShipments });
    }
    if (fallback.length > 0) {
      topRoutes = fallback;
    }
  }

  topRoutes = topRoutes
    .filter((entry) => isUsableRouteLabel(entry?.route))
    .sort((a, b) => b.shipments - a.shipments);
  // No truncation — Trade Lanes tab renders the full list; Summary
  // widget shows top 12 and links to the full tab. Capping here
  // permanently destroys routes 11+ from the snapshot, breaking the
  // full-list view downstream.

  // Pick the largest credible TEU value so we never persist the single-digit
  // monthly-sum number when ImportYeti drops container detail.
  {
    const routeTeuSum = topRoutes.reduce(
      (sum, r) => sum + (Number(r?.teu) || 0),
      0,
    );
    const avgPerMonth12m = (() => {
      const obj = raw?.avg_teu_per_month;
      if (!obj || typeof obj !== "object") return 0;
      const v = Number((obj as any)["12m"] ?? (obj as any).twelve_m);
      return Number.isFinite(v) && v > 0 ? v * 12 : 0;
    })();
    const avgPerShipment12m = (() => {
      const obj = raw?.avg_teu_per_shipment;
      if (!obj || typeof obj !== "object" || !shipmentsLast12m) return 0;
      const v = Number((obj as any)["12m"] ?? (obj as any).twelve_m);
      return Number.isFinite(v) && v > 0 ? v * shipmentsLast12m : 0;
    })();
    const candidates = [
      totalTeu12m,
      routeTeuSum,
      avgPerMonth12m,
      avgPerShipment12m,
    ].filter((v) => Number.isFinite(v) && v > 0);
    if (candidates.length > 0) {
      totalTeu12m = Math.max(...candidates);
    }
  }

  const topSuppliers = pickTopSuppliers(raw);

  const lastShipmentDate =
    Array.isArray(raw?.recent_bols) && raw.recent_bols.length > 0
      ? (() => {
          const dates = raw.recent_bols
            .map((bol: any) =>
              parseImportYetiDateNoFuture(
                bol?.date_formatted ??
                  bol?.date ??
                  bol?.arrival_date ??
                  bol?.shipped_on,
              ),
            )
            .filter((d: Date | null): d is Date => Boolean(d))
            .sort((a: Date, b: Date) => b.getTime() - a.getTime());
          return dates[0] ? dates[0].toISOString().slice(0, 10) : null;
        })()
      : (() => {
          const end = parseImportYetiDateNoFuture(raw?.date_range?.end_date);
          return end ? end.toISOString().slice(0, 10) : null;
        })();

  const monthlyVolumes = Object.fromEntries(
    orderedMonths.map(([month, value]) => [
      month,
      {
        fcl: value.fcl,
        lcl: value.lcl,
        shipments: value.shipments,
        teu: value.teu,
        weight: value.weight,
      },
    ]),
  );

  return {
    company_id: companySlug,
    key: `company/${companySlug}`,
    company_name:
      normalizeString(raw?.title) ??
      normalizeString(raw?.name) ??
      companySlug,
    title:
      normalizeString(raw?.title) ??
      normalizeString(raw?.name) ??
      companySlug,
    name:
      normalizeString(raw?.title) ??
      normalizeString(raw?.name) ??
      companySlug,
    website: normalizeString(raw?.website),
    phone_number: pickPhone(raw),
    address:
      normalizeString(raw?.address) ??
      normalizeString(raw?.address_plain) ??
      null,
    country: normalizeString(raw?.country),
    country_code: normalizeString(raw?.country_code) ?? null,
    total_shipments:
      normalizeNumber(raw?.total_shipments) ?? shipmentsLast12m,
    shipments_last_12m: shipmentsLast12m,
    total_teu: Math.round(totalTeu12m * 100) / 100,
    total_weight_kg_12m: Math.round(totalWeight12m * 100) / 100,
    est_spend:
      Math.round((normalizeNumber(raw?.total_shipping_cost) ?? 0) * 100) / 100,
    fcl_count: fclCount12m,
    lcl_count: lclCount12m,
    last_shipment_date: lastShipmentDate,
    monthly_volumes: monthlyVolumes,
    top_routes: topRoutes,
    top_suppliers: topSuppliers,
    notify_parties: Array.isArray(raw?.notify_party_table)
      ? raw.notify_party_table
      : [],
    recent_bols: Array.isArray(raw?.recent_bols) ? raw.recent_bols : [],
    containers: Array.isArray(raw?.containers) ? raw.containers : [],
    containers_load: Array.isArray(raw?.containers_load)
      ? raw.containers_load
      : [],
    avg_teu_per_shipment: raw?.avg_teu_per_shipment ?? null,
    avg_teu_per_month: raw?.avg_teu_per_month ?? null,
    route_kpis: {
      shipmentsLast12m,
      teuLast12m: Math.round(totalTeu12m * 100) / 100,
      estSpendUsd12m:
        Math.round((normalizeNumber(raw?.total_shipping_cost) ?? 0) * 100) /
        100,
      topRouteLast12m: topRoutes[0]?.route ?? null,
      mostRecentRoute:
        buildRouteLabel(
          Array.isArray(raw?.recent_bols) ? raw.recent_bols[0] : null,
        ) ??
        topRoutes[0]?.route ??
        null,
      sampleSize: Array.isArray(raw?.recent_bols)
        ? raw.recent_bols.length
        : 0,
      topRoutesLast12m: topRoutes,
    },
  };
}

// ---------------------------------------------------------------------------
// Helpers (duplicated from importyeti-proxy/index.ts to keep this module
// self-contained — no runtime dependency on the proxy).
// ---------------------------------------------------------------------------

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

function todayUtcMidnight(): Date {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

function isPastOrToday(d: Date | null | undefined): boolean {
  if (!d || Number.isNaN(d.getTime())) return false;
  return d.getTime() <= todayUtcMidnight().getTime();
}

function parseImportYetiDate(value: unknown): Date | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const trimmed = value.trim();

  const slashDate = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (slashDate) {
    const [, first, second, year] = slashDate;
    const a = Number(first);
    const b = Number(second);
    const y = Number(year);

    const mmddValid = a >= 1 && a <= 12 && b >= 1 && b <= 31;
    const ddmmValid = b >= 1 && b <= 12 && a >= 1 && a <= 31;

    const mmddCand = mmddValid ? new Date(Date.UTC(y, a - 1, b)) : null;
    const ddmmCand = ddmmValid ? new Date(Date.UTC(y, b - 1, a)) : null;

    const validMmdd = mmddCand && !Number.isNaN(mmddCand.getTime()) ? mmddCand : null;
    const validDdmm = ddmmCand && !Number.isNaN(ddmmCand.getTime()) ? ddmmCand : null;

    if (!validMmdd && !validDdmm) return null;
    if (validMmdd && !validDdmm) return validMmdd;
    if (!validMmdd && validDdmm) return validDdmm;

    const mmddPast = isPastOrToday(validMmdd);
    const ddmmPast = isPastOrToday(validDdmm);

    if (mmddPast && !ddmmPast) return validMmdd;
    if (ddmmPast && !mmddPast) return validDdmm;
    return validDdmm;
  }

  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseImportYetiDateNoFuture(value: unknown): Date | null {
  const parsed = parseImportYetiDate(value);
  if (!parsed) return null;
  return isPastOrToday(parsed) ? parsed : null;
}

function formatMonthKey(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function estimateBolTeu(bol: any): number {
  return (
    normalizeNumber(bol?.TEU) ??
    normalizeNumber(bol?.teu) ??
    normalizeNumber(bol?.total_teu) ??
    normalizeNumber(bol?.container_teu) ??
    normalizeNumber(bol?.containers_count) ??
    normalizeNumber(bol?.container_count) ??
    0
  );
}

function buildRouteLabel(bol: any): string | null {
  const maybeString = (value: any): string | null => normalizeString(value);

  const preformatted = maybeString(bol?.shipping_route);
  if (preformatted && /→|->|—|-/u.test(preformatted)) {
    return preformatted;
  }

  const origin =
    maybeString(bol?.origin_port) ??
    maybeString(bol?.supplier_address_loc) ??
    maybeString(bol?.supplier_address_location) ??
    maybeString(bol?.origin) ??
    maybeString(bol?.origin_city) ??
    maybeString(bol?.origin_state) ??
    maybeString(bol?.origin_country) ??
    maybeString(bol?.origin_country_code) ??
    maybeString(bol?.origin_port_name) ??
    maybeString(bol?.origin_port_location) ??
    maybeString(bol?.Country) ??
    maybeString(bol?.country_code) ??
    maybeString(bol?.shipper_address_loc) ??
    maybeString(bol?.origin?.label) ??
    maybeString(bol?.origin?.city) ??
    maybeString(bol?.origin?.state) ??
    maybeString(bol?.origin?.country);

  const dest =
    maybeString(bol?.destination_port) ??
    maybeString(bol?.company_address_loc) ??
    maybeString(bol?.company_address_country) ??
    maybeString(bol?.destination) ??
    maybeString(bol?.destination_city) ??
    maybeString(bol?.destination_state) ??
    maybeString(bol?.destination_country) ??
    maybeString(bol?.destination_country_code) ??
    maybeString(bol?.destination_port_name) ??
    maybeString(bol?.destination_port_location) ??
    maybeString(bol?.entry_port) ??
    maybeString(bol?.Consignee_Address) ??
    maybeString(bol?.consignee_address_loc) ??
    maybeString(bol?.destination?.label) ??
    maybeString(bol?.destination?.city) ??
    maybeString(bol?.destination?.state) ??
    maybeString(bol?.destination?.country);

  if (origin && dest) return `${origin} → ${dest}`;
  if (origin) return origin;
  if (dest) return dest;
  return null;
}

function getLast12MonthKeys(): Set<string> {
  const now = new Date();
  const keys = new Set<string>();
  for (let i = 0; i < 12; i++) {
    const d = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1),
    );
    keys.add(formatMonthKey(d));
  }
  return keys;
}

function parseTimeSeriesToMonthlyVolumes(
  timeSeriesRaw: any,
): Map<string, MonthlyVolume> {
  const monthlyMap = new Map<string, MonthlyVolume>();

  if (!timeSeriesRaw || typeof timeSeriesRaw !== "object") {
    return monthlyMap;
  }

  const currentMonthKey = formatMonthKey(todayUtcMidnight());

  if (Array.isArray(timeSeriesRaw)) {
    for (const row of timeSeriesRaw) {
      const rawMonth =
        row?.month ?? row?.date ?? row?.period ?? row?.label;

      const d = parseImportYetiDate(rawMonth);
      if (!d) continue;

      const monthKey = formatMonthKey(d);
      if (monthKey > currentMonthKey) continue;

      const shipments =
        normalizeNumber(row?.shipments) ??
        normalizeNumber(row?.total_shipments) ??
        normalizeNumber(row?.count) ??
        0;

      const teu =
        normalizeNumber(row?.teu) ?? normalizeNumber(row?.total_teu) ?? 0;

      const weight =
        normalizeNumber(row?.weight) ??
        normalizeNumber(row?.total_weight) ??
        0;

      const fcl =
        normalizeNumber(row?.fcl_count) ??
        normalizeNumber(row?.fclShipments) ??
        shipments;

      const lcl =
        normalizeNumber(row?.lcl_count) ??
        normalizeNumber(row?.lclShipments) ??
        0;

      monthlyMap.set(monthKey, { fcl, lcl, shipments, teu, weight });
    }

    return monthlyMap;
  }

  for (const [rawKey, rawValue] of Object.entries(timeSeriesRaw)) {
    const d = parseImportYetiDate(rawKey);
    if (!d) continue;

    const monthKey = formatMonthKey(d);
    if (monthKey > currentMonthKey) continue;
    const shipments = normalizeNumber((rawValue as any)?.shipments) ?? 0;
    const teu = normalizeNumber((rawValue as any)?.teu) ?? 0;
    const weight = normalizeNumber((rawValue as any)?.weight) ?? 0;

    monthlyMap.set(monthKey, {
      fcl: shipments,
      lcl: 0,
      shipments,
      teu,
      weight,
    });
  }

  return monthlyMap;
}

function applyRecentBolsFclLclSplits(
  monthlyMap: Map<string, MonthlyVolume>,
  recentBols: any[],
) {
  if (!Array.isArray(recentBols) || recentBols.length === 0) return;

  const splitByMonth = new Map<string, { fcl: number; lcl: number }>();

  for (const bol of recentBols) {
    const d = parseImportYetiDate(
      bol?.date_formatted ??
        bol?.date ??
        bol?.shipped_on ??
        bol?.arrival_date,
    );
    if (!d || !isPastOrToday(d)) continue;

    const monthKey = formatMonthKey(d);
    const current = splitByMonth.get(monthKey) || { fcl: 0, lcl: 0 };

    if (bol?.lcl === true) current.lcl += 1;
    else current.fcl += 1;

    splitByMonth.set(monthKey, current);
  }

  for (const [monthKey, split] of splitByMonth.entries()) {
    const existing = monthlyMap.get(monthKey);
    if (!existing) {
      monthlyMap.set(monthKey, {
        fcl: split.fcl,
        lcl: split.lcl,
        shipments: split.fcl + split.lcl,
        teu: 0,
        weight: 0,
      });
      continue;
    }

    const totalSplit = split.fcl + split.lcl;
    if (totalSplit <= 0) continue;

    const sourceShipments =
      existing.shipments > 0 ? existing.shipments : totalSplit;
    const ratio = sourceShipments / totalSplit;

    existing.fcl = Math.round(split.fcl * ratio);
    existing.lcl = Math.max(0, sourceShipments - existing.fcl);
    monthlyMap.set(monthKey, existing);
  }
}

function buildTopRoutesFromRecentBols(recentBols: any[]): TopRoute[] {
  const routeStats = new Map<
    string,
    { shipments: number; teu: number; fcl: number; lcl: number }
  >();

  for (const bol of Array.isArray(recentBols) ? recentBols : []) {
    const route = buildRouteLabel(bol);
    if (!route) continue;

    const current = routeStats.get(route) || {
      shipments: 0,
      teu: 0,
      fcl: 0,
      lcl: 0,
    };

    current.shipments += 1;
    current.teu += estimateBolTeu(bol);
    if (bol?.lcl === true) current.lcl += 1;
    else current.fcl += 1;

    routeStats.set(route, current);
  }

  return Array.from(routeStats.entries())
    .sort((a, b) => b[1].shipments - a[1].shipments)
    .map(([route, stats]) => ({
      route,
      shipments: stats.shipments,
      teu: stats.teu || null,
      fclShipments: stats.fcl || null,
      lclShipments: stats.lcl || null,
    }));
}

type StructuredSupplier = {
  name: string;
  country: string | null;
  country_code: string | null;
  shipment_count: number | null;
  last_shipment_date: string | null;
};

/**
 * Returns structured supplier rows preserving country, shipment count,
 * last shipment date. Previous shape was `string[]` capped at 10 which
 * dropped every field the Suppliers tab needs (flag, count, date).
 *
 * Kept at top 30 (was 10) because the Suppliers tab now renders the
 * full list; "Show more" is the UI's job, not the parser's.
 */
function pickTopSuppliers(raw: any): StructuredSupplier[] {
  const rows = Array.isArray(raw?.suppliers_table) ? raw.suppliers_table : [];
  const seen = new Set<string>();
  const out: StructuredSupplier[] = [];
  for (const row of rows) {
    const name =
      normalizeString(row?.supplier) ??
      normalizeString(row?.supplier_name) ??
      normalizeString(row?.shipper) ??
      normalizeString(row?.name);
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    const country =
      normalizeString(row?.country) ??
      normalizeString(row?.supplier_country) ??
      null;
    const country_code =
      normalizeString(row?.country_code) ??
      normalizeString(row?.iso2) ??
      normalizeString(row?.country_iso) ??
      null;
    // ImportYeti's actual key names (verified against EAE raw payload):
    //   shipments_12m, total_shipments_supplier, most_recent_shipment
    // Keep older aliases as fallbacks for any other upstream variants.
    const shipment_count =
      normalizeNumber(row?.shipments_12m) ??
      normalizeNumber(row?.shipments) ??
      normalizeNumber(row?.shipment_count) ??
      normalizeNumber(row?.count) ??
      normalizeNumber(row?.total_shipments_supplier) ??
      null;
    // most_recent_shipment is in DD/MM/YYYY format per ImportYeti.
    // Normalize to ISO YYYY-MM-DD so the UI can humanize uniformly.
    const lastRaw =
      normalizeString(row?.most_recent_shipment) ??
      normalizeString(row?.last_shipment_date) ??
      normalizeString(row?.last_date) ??
      normalizeString(row?.last_bol_date) ??
      null;
    const lastDate = lastRaw ? parseImportYetiDateNoFuture(lastRaw) : null;
    const last_shipment_date = lastDate ? lastDate.toISOString().slice(0, 10) : null;

    out.push({ name, country, country_code, shipment_count, last_shipment_date });
    if (out.length >= 30) break;
  }
  // Sort by shipment_count desc, nulls last.
  out.sort((a, b) => (b.shipment_count ?? -1) - (a.shipment_count ?? -1));
  return out;
}

function pickPhone(raw: any): string | null {
  let fallbackPhone: string | null = null;

  if (
    Array.isArray(raw?.other_addresses_contact_info) &&
    raw.other_addresses_contact_info.length > 0
  ) {
    fallbackPhone = normalizeString(
      raw.other_addresses_contact_info[0]?.contact_info_data
        ?.phone_numbers?.[0],
    );
  }

  return (
    normalizeString(raw?.phone_number) ??
    normalizeString(raw?.company_main_phone_number) ??
    normalizeString(raw?.phone) ??
    normalizeString(raw?.phone_number_main) ??
    fallbackPhone ??
    null
  );
}
