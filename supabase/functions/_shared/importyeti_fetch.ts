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

export type EnvConfig = {
  IMPORTYETI_API_KEY: string;
  IMPORTYETI_API_BASE?: string;
};

export type FetchResult = {
  httpStatus: number;
  parsedSummary: Record<string, unknown> | null;
  previousParsedSummary: Record<string, unknown> | null;
  rawPayload: Record<string, unknown> | null;
};

const DEFAULT_BASE = "https://data.importyeti.com/v1.0";
const SNAPSHOT_TABLE = "lit_importyeti_company_snapshot";

export async function fetchAndUpsertSnapshot(
  supabase: SupabaseClient,
  companySlug: string,
  env: EnvConfig,
): Promise<FetchResult> {
  const cleanSlug = normalizeCompanyKey(companySlug);

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
    return {
      httpStatus: 404,
      parsedSummary: null,
      previousParsedSummary,
      rawPayload: null,
    };
  }
  if (!resp.ok) {
    throw new Error(`importyeti_upstream_${resp.status}`);
  }

  const text = await resp.text();
  let rawPayload: Record<string, unknown> = {};
  try {
    rawPayload = text ? JSON.parse(text) : {};
  } catch {
    rawPayload = {};
  }

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

  return {
    httpStatus: 200,
    parsedSummary,
    previousParsedSummary,
    rawPayload,
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
    .sort((a, b) => b.shipments - a.shipments)
    .slice(0, 10);

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
    .slice(0, 10)
    .map(([route, stats]) => ({
      route,
      shipments: stats.shipments,
      teu: stats.teu || null,
      fclShipments: stats.fcl || null,
      lclShipments: stats.lcl || null,
    }));
}

function pickTopSuppliers(raw: any): string[] {
  const rows = Array.isArray(raw?.suppliers_table) ? raw.suppliers_table : [];
  const values = rows
    .map(
      (row: any) =>
        normalizeString(row?.supplier) ??
        normalizeString(row?.supplier_name) ??
        normalizeString(row?.shipper) ??
        normalizeString(row?.name),
    )
    .filter((value: string | null): value is string => Boolean(value));

  return Array.from(new Set(values)).slice(0, 10);
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
