// Rich supplier parser — reads the FULL ImportYeti `suppliers_table` array
// (preserved on the company profile) and produces fully-populated SupplierRow
// objects. Every field is real upstream data; nothing is fabricated. When a
// field is genuinely absent on a row it is left null/undefined and the UI
// renders "—".
//
// The raw suppliers_table row (verified against public/rawpayload.md) carries:
//   supplier_name, supplier_address, country, supplier_address_country,
//   country_code, vendor_address_country_code, shipments_12m,
//   total_shipments_supplier, total_teus, first_shipment, most_recent_shipment,
//   business_length, is_new_supplier, shipments_percents_company,
//   hs_code_chapters[], supplier_time_series{}, top_companies[], key
//
// City/state are NOT discrete fields upstream (only embedded in the free-text
// supplier_address string), so we surface the address verbatim rather than
// guess a city/state split.

import type { SupplierRow } from "./aggregate";

const DAY_MS = 86_400_000;
const RECENCY_DORMANT_DAYS = 365;
const HALF_YEAR_DAYS = 182;

function num(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function str(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s.length > 0 ? s : null;
}

/** Parse ImportYeti dates: DD/MM/YYYY (their format) or ISO. Returns epoch ms or null. */
export function parseIyDateMs(value: unknown): number | null {
  const s = str(value);
  if (!s) return null;
  const dmy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmy) {
    const d = Number(dmy[1]);
    const m = Number(dmy[2]);
    const y = Number(dmy[3]);
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      const ms = Date.UTC(y, m - 1, d);
      return Number.isNaN(ms) ? null : ms;
    }
  }
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : t;
}

function msToIso(ms: number | null): string | null {
  if (ms == null) return null;
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

type SeriesPoint = { ms: number; shipments: number; teu: number };

function parseSeries(raw: unknown): SeriesPoint[] {
  if (!raw || typeof raw !== "object") return [];
  const out: SeriesPoint[] = [];
  for (const [k, v] of Object.entries(raw as Record<string, any>)) {
    const ms = parseIyDateMs(k);
    if (ms == null) continue;
    out.push({
      ms,
      shipments: num(v?.shipments) ?? 0,
      teu: num(v?.teu) ?? 0,
    });
  }
  return out.sort((a, b) => a.ms - b.ms);
}

/** TEU shipped in the trailing 12 months of the series' OWN activity window. */
function teuTrailing12m(series: SeriesPoint[]): number | null {
  if (series.length === 0) return null;
  const maxMs = series[series.length - 1].ms;
  const cutoff = maxMs - RECENCY_DORMANT_DAYS * DAY_MS;
  let sum = 0;
  let any = false;
  for (const p of series) {
    if (p.ms > cutoff) {
      sum += p.teu;
      any = true;
    }
  }
  return any ? Math.round(sum * 100) / 100 : null;
}

/**
 * Volume trend from the supplier's monthly history. Anchored on the series'
 * own latest month (robust to snapshot staleness), NOT today. Distinct from
 * recency (which is relative to today). Conservative: returns null when there
 * isn't enough signal rather than guessing.
 */
export function computeSupplierTrend(
  series: SeriesPoint[],
  opts: { isNew: boolean; dormant: boolean },
): SupplierRow["trend"] {
  if (opts.dormant) return "dormant";
  if (opts.isNew) return "new";
  if (series.length < 2) return null;
  const maxMs = series[series.length - 1].ms;
  const mid = maxMs - HALF_YEAR_DAYS * DAY_MS;
  const lo = maxMs - 2 * HALF_YEAR_DAYS * DAY_MS;
  let recent = 0;
  let prior = 0;
  for (const p of series) {
    if (p.ms > mid) recent += p.shipments;
    else if (p.ms > lo) prior += p.shipments;
  }
  if (recent === 0 && prior === 0) return null;
  if (prior === 0) return recent > 0 ? "growing" : null;
  const ratio = recent / prior;
  if (ratio >= 1.2) return "growing";
  if (ratio <= 0.8) return "declining";
  return "stable";
}

function recencyFrom(lastMs: number | null, nowMs: number): SupplierRow["recency"] {
  if (lastMs == null) return null;
  const days = (nowMs - lastMs) / DAY_MS;
  if (days < 0) return "active";
  return days <= RECENCY_DORMANT_DAYS ? "active" : "dormant";
}

function sharePercent(ship: number, denom: number): number {
  if (!(denom > 0)) return 0;
  return Math.min(100, Math.round((ship / denom) * 100));
}

export type ParseSuppliersOptions = {
  /** Company's true 12-month total, used only when the row lacks a real share %. */
  companyTotal?: number | null;
  /** Injectable now (epoch ms) for deterministic recency in tests. */
  now?: number;
};

/** True when the value looks like a real ImportYeti suppliers_table array. */
export function looksLikeSuppliersTable(table: unknown): table is any[] {
  return (
    Array.isArray(table) &&
    table.length > 0 &&
    table.some(
      (r) =>
        r &&
        typeof r === "object" &&
        (r.supplier_name != null ||
          r.shipments_12m != null ||
          r.total_teus != null ||
          r.supplier_address != null),
    )
  );
}

/**
 * Map a raw ImportYeti suppliers_table into rich SupplierRow[] sorted by
 * 12-month shipments desc. Returns [] for an empty/invalid table.
 */
export function parseSuppliersTable(
  table: unknown,
  opts: ParseSuppliersOptions = {},
): SupplierRow[] {
  if (!Array.isArray(table)) return [];
  const nowMs = typeof opts.now === "number" ? opts.now : Date.now();
  const rows: SupplierRow[] = [];

  for (const r of table) {
    if (!r || typeof r !== "object") continue;
    const name = str(r.supplier_name) ?? str(r.supplier) ?? str(r.name);
    if (!name) continue;

    const series = parseSeries(r.supplier_time_series);
    const shipments12m = num(r.shipments_12m) ?? num(r.shipments) ?? 0;
    const totalShipments = num(r.total_shipments_supplier);
    const lastMs = parseIyDateMs(r.most_recent_shipment ?? r.last_shipment_date);
    const firstMs = parseIyDateMs(r.first_shipment);
    const recency = recencyFrom(lastMs, nowMs);

    // Real share % from ImportYeti when present; otherwise fall back to the
    // company-total denominator (never the supplier-list total).
    const realShare = num(r.shipments_percents_company);
    const share =
      realShare != null
        ? Math.min(100, Math.round(realShare))
        : sharePercent(shipments12m, opts.companyTotal ?? 0);

    const country =
      str(r.supplier_address_country) ?? str(r.country) ?? "";
    const countryCode =
      str(r.country_code) ?? str(r.vendor_address_country_code) ?? null;

    const hsChapters = Array.isArray(r.hs_code_chapters)
      ? r.hs_code_chapters
          .map((c: any) => ({
            chapter: str(c?.chapter) ?? "",
            name: str(c?.name),
            shipments: num(c?.shipments),
          }))
          .filter((c: any) => c.chapter)
          .slice(0, 4)
      : undefined;

    const otherBuyers = Array.isArray(r.top_companies)
      ? r.top_companies
          .map((c: any) => ({
            name: str(c?.company_name) ?? str(c?.name) ?? "",
            shipments: num(c?.shipments_12m) ?? num(c?.shipments),
          }))
          .filter((c: any) => c.name)
          .slice(0, 6)
      : undefined;

    const row: SupplierRow = {
      name,
      country,
      shipments: shipments12m,
      share,
    };
    if (countryCode) row.country_code = countryCode;
    if (shipments12m) row.shipment_count = shipments12m;
    if (totalShipments != null) row.total_shipments = totalShipments;
    if (num(r.total_teus) != null) row.total_teu = num(r.total_teus);
    const teu12 = teuTrailing12m(series);
    if (teu12 != null) row.teu_12m = teu12;
    if (lastMs != null) row.last_shipment_date = msToIso(lastMs);
    if (firstMs != null) row.first_shipment_date = msToIso(firstMs);
    if (str(r.business_length)) row.business_length = str(r.business_length);
    if (str(r.supplier_address)) row.address = str(r.supplier_address);
    if (recency) row.recency = recency;
    const trend = computeSupplierTrend(series, {
      isNew: r.is_new_supplier === true,
      dormant: recency === "dormant",
    });
    if (trend) row.trend = trend;
    if (hsChapters && hsChapters.length) row.hs_chapters = hsChapters;
    if (otherBuyers && otherBuyers.length) row.other_buyers = otherBuyers;
    if (str(r.key)) row.iy_key = str(r.key);

    rows.push(row);
  }

  return rows.sort((a, b) => (b.shipments ?? 0) - (a.shipments ?? 0));
}
