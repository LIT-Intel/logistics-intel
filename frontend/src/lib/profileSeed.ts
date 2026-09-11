/**
 * Profile seed — instant search→profile handoff.
 *
 * Opening a company from Intelligence search used to show dashes for the
 * 10-20s the background ImportYeti pull takes: the profile page arrives
 * before the snapshot OR the lit_companies row exists, so every loader
 * misses. But the search result the user just clicked already carries the
 * header-grade data (name, domain, HQ, 12-month shipments/TEU/spend, top
 * lane, last shipment) — this module carries it across the navigation so
 * CompanyProfileV2 can paint immediately and let the snapshot stream in
 * underneath.
 *
 * sessionStorage (not router state) so the seed survives a hard refresh
 * mid-heal within the tab. Honest data only: the seed is synthesized via
 * the same `synthesizeProfileFromSavedRow` used for saved companies —
 * cadence/BOLs/suppliers stay empty until the real snapshot lands.
 */

import {
  synthesizeProfileFromSavedRow,
  type SavedCompanyKpiRow,
} from "@/lib/companyProfileFallback";
import type { IyCompanyProfile } from "@/lib/api";

const KEY_PREFIX = "lit:profile-seed:";
const TTL_MS = 10 * 60 * 1000; // stale search data must not outlive the visit
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const bareSlug = (v: unknown): string =>
  String(v ?? "")
    .replace(/^company\//i, "")
    .trim()
    .toLowerCase();

const num = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * Stash the clicked search row for the profile page. `row` is a
 * UnifiedExplorerRow (Explorer) — `row.raw` is the underlying IyShipperHit
 * when present. Best-effort: any failure (no name, storage unavailable)
 * just skips the seed and the profile falls back to today's behavior.
 */
export function stashProfileSeed(companyKey: string, row: any): void {
  try {
    const slug = bareSlug(companyKey);
    if (!slug || UUID_RE.test(slug)) return;
    const raw = (row?.raw ?? {}) as Record<string, unknown>;
    const name = String(
      row?.company_name ?? raw?.name ?? raw?.title ?? "",
    ).trim();
    if (!name) return;

    const seedRow: SavedCompanyKpiRow = {
      id: "",
      source_company_key: `company/${slug}`,
      name,
      domain: (row?.domain ?? raw?.domain ?? raw?.website ?? null) as any,
      website: (raw?.website ?? null) as any,
      phone: (raw?.phoneNumber ?? raw?.phone ?? null) as any,
      address_line1: null,
      city: (row?.city ?? raw?.city ?? null) as any,
      state: (row?.state ?? raw?.state ?? null) as any,
      country_code: (row?.country ?? raw?.countryCode ?? null) as any,
      postal_code: null,
      shipments_12m: num(
        row?.shipments ?? raw?.shipmentsLast12m ?? raw?.totalShipments,
      ),
      teu_12m: num(row?.teu ?? raw?.teusLast12m),
      fcl_shipments_12m: num(raw?.fclShipments12m ?? raw?.fcl_shipments_12m),
      lcl_shipments_12m: num(raw?.lclShipments12m ?? raw?.lcl_shipments_12m),
      est_spend_12m: num(
        raw?.estSpendUsd12m ?? raw?.estSpendLast12m ?? raw?.estSpendUsd,
      ),
      most_recent_shipment_date: (row?.last_shipment ??
        raw?.mostRecentShipment ??
        raw?.lastShipmentDate ??
        null) as any,
      top_route_12m: (row?.top_lane ??
        raw?.primaryRouteSummary ??
        raw?.primaryRoute ??
        null) as any,
      recent_route: null,
      industry: (row?.industry ?? null) as any,
      headcount: null,
      revenue: row?.revenue != null ? String(row.revenue) : null,
    };

    sessionStorage.setItem(
      KEY_PREFIX + slug,
      JSON.stringify({ t: Date.now(), row: seedRow }),
    );
  } catch {
    /* best-effort — profile page falls back to the normal load path */
  }
}

/**
 * Read the seed for a profile route id ("company/<slug>" or bare slug) and
 * synthesize an IyCompanyProfile from it. Returns null for UUID routes
 * (Command Center opens have real rows), missing seeds, or expired seeds.
 * The seed is kept (not consumed) until TTL so a mid-heal refresh stays
 * instant too — a fresh stash on the next open overwrites it.
 */
export function takeProfileSeed(routeId: unknown): IyCompanyProfile | null {
  try {
    const slug = bareSlug(routeId);
    if (!slug || UUID_RE.test(slug)) return null;
    const stored = sessionStorage.getItem(KEY_PREFIX + slug);
    if (!stored) return null;
    const parsed = JSON.parse(stored) as { t?: number; row?: SavedCompanyKpiRow };
    if (!parsed?.row || !parsed.t || Date.now() - parsed.t > TTL_MS) {
      sessionStorage.removeItem(KEY_PREFIX + slug);
      return null;
    }
    return synthesizeProfileFromSavedRow(parsed.row);
  } catch {
    return null;
  }
}
