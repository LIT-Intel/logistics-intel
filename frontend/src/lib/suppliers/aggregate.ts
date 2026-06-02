// Pure aggregator extracted from CDPSupplyChain.tsx's inline deriveSuppliers.
//
// The original (200+ LOC inside a 3000-line component) was deployed in
// production with zero test coverage. /plan-eng-review's REGRESSION RULE
// flagged it: extract to a pure module, snapshot the current output, then
// add behavior tests so future refactors don't silently change the shape.
//
// Public API:
//   aggregateSuppliers(profile, recentBols, opts?) → SupplierRow[]
//
// Behavior contract (locked by snapshot test in __tests__/aggregate.test.ts):
//   1. Prefer structured serviceProviderMix.suppliers (has counts) over
//      flat topSuppliers/suppliers lists (often string-only).
//   2. When explicit list has counts, compute share% off the list's total.
//   3. When explicit list is string-only, aggregate counts from recentBols
//      filtered to the listed names. Share% then off recentBol counts.
//   4. When no list at all, aggregate from recentBols only (suppliers seen
//      in BOLs). Share% off the BOL count total.
//   5. When string-only list has no recentBol matches, surface names with
//      shipments=-1 + share=-1 sentinel so the UI can hide stats.
//
// opts.limit: cap the returned list. Defaults to 6 (legacy behavior so the
// existing TopSuppliersCard keeps showing top 6 unchanged). Pass 0 / null /
// Infinity for the full list (F1 Suppliers sub-tab needs this).

import { getBolSupplier } from "@/lib/bols/helpers";

export type SupplierRow = {
  name: string;
  country: string;
  shipments: number;
  share: number;
};

export type AggregateOptions = {
  /** Cap on returned list. Defaults to 6. Pass Infinity / 0 for full list. */
  limit?: number;
};

const DEFAULT_LIMIT = 6;

export function aggregateSuppliers(
  profile: any,
  recentBols: any[] = [],
  opts: AggregateOptions = {},
): SupplierRow[] {
  const limit = resolveLimit(opts.limit);

  const structured =
    profile?.serviceProviderMix?.suppliers ||
    profile?.service_provider_mix?.suppliers ||
    null;

  const list =
    (Array.isArray(structured) && structured.length > 0
      ? structured.map((s: any) => ({
          name: s?.providerName ?? s?.name ?? null,
          shipments: Number(s?.shipments) || 0,
          country: s?.countryCode ?? s?.country_code ?? s?.country ?? "",
        }))
      : null) ||
    profile?.topSuppliers ||
    profile?.suppliers ||
    profile?.suppliers_sample ||
    [];

  if (Array.isArray(list) && list.length > 0) {
    const hasCounts = list.some(
      (e: any) =>
        typeof e !== "string" &&
        (Number(e?.shipments) > 0 || Number(e?.count) > 0),
    );
    if (hasCounts) {
      return takeTop(rowsFromCountedList(list), limit);
    }
    // String-only list: aggregate counts from recentBols filtered to listed names.
    const nameSet = new Set(
      list
        .map((e: any) =>
          typeof e === "string" ? e : String(e?.name || e?.label || ""),
        )
        .filter(Boolean)
        .map((n: string) => n.toLowerCase()),
    );
    const aggregated = rowsFromBols(recentBols, nameSet);
    if (aggregated.length > 0) {
      return takeTop(aggregated, limit);
    }
    // Truly no counts available — surface names with sentinel values.
    return takeTop(rowsFromStringList(list), limit);
  }

  // No explicit list — aggregate purely from recentBols.
  if (!Array.isArray(recentBols) || recentBols.length === 0) return [];
  return takeTop(rowsFromBols(recentBols, null), limit);
}

// ── Internals ───────────────────────────────────────────────────────────

function resolveLimit(raw: number | undefined): number {
  if (raw === undefined) return DEFAULT_LIMIT;
  if (raw === 0 || raw === Infinity || raw === null) return Infinity;
  if (Number.isFinite(raw) && raw > 0) return raw;
  return DEFAULT_LIMIT;
}

function takeTop(rows: SupplierRow[], limit: number): SupplierRow[] {
  if (!Number.isFinite(limit)) return rows;
  return rows.slice(0, limit);
}

function rowsFromCountedList(list: any[]): SupplierRow[] {
  const totalShip = list.reduce(
    (s: number, e: any) =>
      s +
      (typeof e === "string" ? 0 : Number(e?.shipments || e?.count) || 0),
    0,
  );
  return list
    .map((e: any) => {
      const isString = typeof e === "string";
      const name = isString ? e : String(e?.name || e?.label || "");
      if (!name) return null;
      const ship = isString ? 0 : Number(e?.shipments || e?.count) || 0;
      const country = isString
        ? ""
        : String(e?.countryCode || e?.country_code || e?.country || "");
      return {
        name,
        country,
        shipments: ship,
        share: totalShip > 0 ? Math.round((ship / totalShip) * 100) : 0,
      };
    })
    .filter(Boolean)
    .sort((a, b) => b!.shipments - a!.shipments) as SupplierRow[];
}

function rowsFromBols(
  bols: any[],
  filterNames: Set<string> | null,
): SupplierRow[] {
  const counts = new Map<string, { ship: number; country: string }>();
  for (const bol of bols) {
    const supplier = getBolSupplier(bol);
    if (!supplier || supplier === "—") continue;
    if (filterNames && !filterNames.has(supplier.toLowerCase())) continue;
    const cur =
      counts.get(supplier) ||
      {
        ship: 0,
        country: bol?.supplier_country || bol?.origin_country || "",
      };
    cur.ship += 1;
    counts.set(supplier, cur);
  }
  const totalShip = Array.from(counts.values()).reduce(
    (s, v) => s + v.ship,
    0,
  );
  return Array.from(counts.entries())
    .map(([name, v]) => ({
      name,
      country: v.country,
      shipments: v.ship,
      share: totalShip > 0 ? Math.round((v.ship / totalShip) * 100) : 0,
    }))
    .sort((a, b) => b.shipments - a.shipments);
}

function rowsFromStringList(list: any[]): SupplierRow[] {
  return list
    .map((e: any) => {
      const isString = typeof e === "string";
      const name = isString ? e : String(e?.name || e?.label || "");
      if (!name) return null;
      return {
        name,
        country: isString
          ? ""
          : String(e?.countryCode || e?.country_code || e?.country || ""),
        shipments: -1,
        share: -1,
      };
    })
    .filter(Boolean) as SupplierRow[];
}

/**
 * Slugify a supplier name for use in URLs (Supplier Profile route).
 * Stable across mixed-case and whitespace; preserves alphanumerics.
 * Two suppliers with names that slugify identically (e.g. "ABC Co." and
 * "ABC Co") collide — the route receiver dedups via supplier name on the
 * loaded data, which is conservative-correct (same display name = same
 * supplier from our viewpoint).
 */
export function supplierNameToSlug(name: string): string {
  return String(name || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // strip diacritics
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}
