/**
 * normalizeShipments — adapts real backend payloads into `ShipmentRow[]`.
 *
 * Primary source:  `lit_unified_shipments` rows (per-company BOL archive).
 * Fallback source: `IyCompanyProfile.recentBols` (ImportYeti snapshot) for
 *                  companies whose archive has not been materialized yet.
 *
 * Hard rules (handoff README §3):
 *  - Backend field names are NEVER renamed upstream; all adaptation is here.
 *  - Missing values are modeled-with-flag (teu, spend) or left null (ctype);
 *    nothing is invented without a `*Modeled` flag the UI can label.
 */
import type { ShipmentDataset, ShipmentRow } from "./types";

/** DB row shape of lit_unified_shipments (only the fields we read). */
export interface UnifiedShipmentDbRow {
  id: string;
  bol_number: string | null;
  house_bol: string | null;
  master_bol: string | null;
  bol_date: string | null;
  scac: string | null;
  carrier_name: string | null;
  shipper_name: string | null;
  origin_country: string | null;
  origin_country_code: string | null;
  destination_country_code: string | null;
  origin_port: string | null;
  destination_port: string | null;
  hs_code: string | null;
  product_description: string | null;
  container_count: number | null;
  teu: number | string | null; // numeric comes back as string from PostgREST
  weight_kg: number | string | null;
  lcl: boolean | null;
  load_type: string | null;
  shipping_cost_usd: number | string | null;
  container_type: string | null;
}

/** ImportYeti recentBols shape (normalized by lib/api.ts normalizeRecentBols). */
export interface RecentBolInput {
  bolNumber?: string | null;
  date?: string | null;
  dateObj?: Date | null;
  teu?: number | null;
  containersCount?: number | null;
  lcl?: boolean | null;
  shippingCost?: number | null;
  supplier?: string | null;
  supplier_country?: string | null;
  supplier_country_code?: string | null;
  origin_country?: string | null;
  hs_code?: string | null;
  product_description?: string | null;
  scac?: string | null;
  carrier_name?: string | null;
  weight_kg?: number | null;
  origin?: string | null;
  destination?: string | null;
  company_country_code?: string | null;
}

/** Modeled ocean freight $/TEU by arrival year (blended East-West average,
 *  Drewry-WCI-shaped). Used ONLY when shipping_cost_usd is absent; every
 *  consumer must label the result "Modeled" (README §4.4). */
const RATE_PER_TEU: Record<number, number> = {
  2015: 1400, 2016: 1300, 2017: 1500, 2018: 1650, 2019: 1500, 2020: 1950,
  2021: 4600, 2022: 4100, 2023: 2450, 2024: 3850, 2025: 3150, 2026: 2900,
};
const rateForYear = (y: number): number =>
  RATE_PER_TEU[y] ?? RATE_PER_TEU[y < 2015 ? 2015 : 2026];

/** Map raw container_type values (incl. stray ISO 6346 codes) to buckets. */
const CTYPE_BUCKET: Record<string, string> = {
  "20ST": "20ST", "22G0": "20ST", "22G1": "20ST", "2CG0": "20ST",
  "40ST": "40ST", "42G0": "40ST", "42G1": "40ST",
  "40HC": "40HC", "45G0": "40HC", "45G1": "40HC",
  "45HC": "45HC", L5G1: "45HC",
  LCL: "LCL", MIXED: "MIXED",
};
const TEU_PER_BOX: Record<string, number> = {
  "20ST": 1, "40ST": 2, "40HC": 2, "45HC": 2.25, MIXED: 2,
};

const bucketCtype = (raw: string | null | undefined, isLcl: boolean): string | null => {
  if (isLcl) return "LCL";
  if (!raw) return null;
  return CTYPE_BUCKET[raw.trim().toUpperCase()] ?? null;
};

const num = (v: number | string | null | undefined): number | null => {
  if (v == null) return null;
  const n = typeof v === "string" ? parseFloat(v) : v;
  return Number.isFinite(n) ? n : null;
};

const clean = (s: string | null | undefined): string => (s ?? "").trim();

/** Compact country-name → ISO2 map for the snapshot fallback path (the
 *  archive path has origin_country_code natively). Top US import partners. */
const NAME_TO_ISO2: Record<string, string> = {
  china: "CN", india: "IN", vietnam: "VN", germany: "DE", japan: "JP",
  "south korea": "KR", korea: "KR", "republic of korea": "KR", taiwan: "TW",
  mexico: "MX", canada: "CA", italy: "IT", thailand: "TH", malaysia: "MY",
  indonesia: "ID", brazil: "BR", "united kingdom": "GB", france: "FR",
  spain: "ES", netherlands: "NL", turkey: "TR", türkiye: "TR", poland: "PL",
  bangladesh: "BD", cambodia: "KH", philippines: "PH", pakistan: "PK",
  "sri lanka": "LK", israel: "IL", switzerland: "CH", sweden: "SE",
  belgium: "BE", austria: "AT", portugal: "PT", "czech republic": "CZ",
  "hong kong": "HK", singapore: "SG", australia: "AU", "new zealand": "NZ",
  chile: "CL", peru: "PE", colombia: "CO", ecuador: "EC", argentina: "AR",
  "united states": "US", usa: "US", "united arab emirates": "AE",
  "saudi arabia": "SA", egypt: "EG", "south africa": "ZA", greece: "GR",
  denmark: "DK", finland: "FI", norway: "NO", hungary: "HU", romania: "RO",
  slovenia: "SI", slovakia: "SK", ukraine: "UA", morocco: "MA", tunisia: "TN",
  jordan: "JO", qatar: "QA", kuwait: "KW", oman: "OM", myanmar: "MM",
  laos: "LA", nicaragua: "NI", honduras: "HN", guatemala: "GT",
  "el salvador": "SV", "costa rica": "CR", "dominican republic": "DO",
};
const iso2FromName = (name: string | null | undefined): string | null =>
  name ? NAME_TO_ISO2[name.trim().toLowerCase()] ?? null : null;

interface PartialRow extends Omit<ShipmentRow, "mi"> {}

function finalize(partials: PartialRow[], source: ShipmentDataset["source"], now: Date): ShipmentDataset {
  const rows = partials.slice().sort((a, b) => a.ts - b.ts);
  const firstYear = rows.length ? new Date(rows[0].ts).getFullYear() : now.getFullYear();
  const lastMi = (now.getFullYear() - firstYear) * 12 + now.getMonth();
  let teuModeled = 0;
  let spendModeled = 0;
  const seen = new Map<string, number>();
  const out: ShipmentRow[] = rows.map((r) => {
    const d = new Date(r.ts);
    if (r.teuModeled) teuModeled++;
    if (r.spendModeled) spendModeled++;
    // BOL numbers can repeat across a company's archive (splits, re-files);
    // trace lookups need unique ids.
    const n = seen.get(r.id) ?? 0;
    seen.set(r.id, n + 1);
    return {
      ...r,
      id: n === 0 ? r.id : r.id + "·" + (n + 1),
      mi: (d.getFullYear() - firstYear) * 12 + d.getMonth(),
    };
  });
  return {
    rows: out,
    firstYear,
    lastMi,
    todayTs: +now,
    teuModeledShare: out.length ? teuModeled / out.length : 0,
    spendModeledShare: out.length ? spendModeled / out.length : 0,
    source,
  };
}

/** Normalize `lit_unified_shipments` rows for one company. */
export function normalizeUnifiedShipments(
  dbRows: UnifiedShipmentDbRow[],
  now: Date = new Date(),
): ShipmentDataset {
  const partials: PartialRow[] = [];
  for (const r of dbRows) {
    if (!r.bol_date) continue;
    const ts = Date.parse(r.bol_date);
    if (!Number.isFinite(ts) || ts > +now) continue;
    const isLcl = r.lcl === true || clean(r.load_type).toUpperCase() === "LCL";
    const ctype = bucketCtype(r.container_type, isLcl);
    const containers = num(r.container_count) ?? 0;

    let teu = num(r.teu);
    let teuModeled = false;
    if (teu == null || teu <= 0) {
      teuModeled = true;
      teu = isLcl ? 0.5 : Math.max(1, containers) * (TEU_PER_BOX[ctype ?? ""] ?? 2);
    }

    let spend = num(r.shipping_cost_usd);
    let spendModeled = false;
    if (spend == null || spend <= 0) {
      spendModeled = true;
      spend = Math.round(teu * rateForYear(new Date(ts).getFullYear()));
    }

    const oc = clean(r.origin_country_code).toUpperCase() || iso2FromName(r.origin_country) || "XX";
    const dc = clean(r.destination_country_code).toUpperCase() || "US";
    const scac = clean(r.scac).toUpperCase();
    const hs = clean(r.hs_code);
    const product = clean(r.product_description) || (hs ? "HS " + hs : "Unclassified");

    partials.push({
      id: clean(r.bol_number) || clean(r.house_bol) || clean(r.master_bol) || r.id,
      ts,
      day: new Date(ts).getDate(),
      lane: oc + "-" + dc,
      origin: clean(r.origin_country) || oc,
      oc,
      dc,
      oPort: clean(r.origin_port),
      dPort: clean(r.destination_port),
      carrier: scac || "—",
      carrierName: clean(r.carrier_name) || scac || "Unknown carrier",
      mode: isLcl ? "LCL" : "FCL",
      ctype,
      containers,
      teu,
      teuModeled,
      spend,
      spendModeled,
      weight: num(r.weight_kg) ?? 0,
      hs,
      product,
      supplier: clean(r.shipper_name) || "Unknown shipper",
    });
  }
  return finalize(partials, "archive", now);
}

/** Normalize ImportYeti `recentBols` (fallback when the archive is empty). */
export function normalizeRecentBols(
  bols: RecentBolInput[],
  now: Date = new Date(),
): ShipmentDataset {
  const partials: PartialRow[] = [];
  let i = 0;
  for (const b of bols) {
    i++;
    const ts = b.dateObj ? +b.dateObj : b.date ? Date.parse(b.date) : NaN;
    if (!Number.isFinite(ts) || ts > +now) continue;
    const isLcl = b.lcl === true;
    const containers = b.containersCount ?? 0;

    let teu = b.teu ?? null;
    let teuModeled = false;
    if (teu == null || teu <= 0) {
      teuModeled = true;
      teu = isLcl ? 0.5 : Math.max(1, containers) * 2;
    }

    let spend = b.shippingCost ?? null;
    let spendModeled = false;
    if (spend == null || spend <= 0) {
      spendModeled = true;
      spend = Math.round(teu * rateForYear(new Date(ts).getFullYear()));
    }

    const originName = clean(b.origin_country) || clean(b.supplier_country);
    const oc = clean(b.supplier_country_code).toUpperCase() || iso2FromName(originName) || "XX";
    const dc = clean(b.company_country_code).toUpperCase() || "US";
    const scac = clean(b.scac).toUpperCase();
    const hs = clean(b.hs_code);

    partials.push({
      id: clean(b.bolNumber) || "BOL-" + i,
      ts,
      day: new Date(ts).getDate(),
      lane: oc + "-" + dc,
      origin: originName || oc,
      oc,
      dc,
      oPort: clean(b.origin),
      dPort: clean(b.destination),
      carrier: scac || "—",
      carrierName: clean(b.carrier_name) || scac || "Unknown carrier",
      mode: isLcl ? "LCL" : "FCL",
      ctype: isLcl ? "LCL" : null, // ImportYeti sample carries no container type
      containers,
      teu,
      teuModeled,
      spend,
      spendModeled,
      weight: b.weight_kg ?? 0,
      hs,
      product: clean(b.product_description) || (hs ? "HS " + hs : "Unclassified"),
      supplier: clean(b.supplier) || "Unknown shipper",
    });
  }
  return finalize(partials, "snapshot", now);
}
