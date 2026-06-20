// IyShipperHit[] → UnifiedExplorerRow[]
//
// The Company Search tab calls searchShippers() (api.ts:2991) and gets
// back an IyShipperHit[]. ImportYeti doesn't return lat/lng — it returns
// city, state, country. To plot those rows on the Pulse Explorer map
// without a network geocoding call, we resolve each row against a
// static city/state centroid file (cityStateCoordinates.json).
//
// Resolution order:
//   1. row.latitude + row.longitude (if upstream ever adds them — none today)
//   2. cities[city:state]                — city-level centroid → mapped
//   3. cities[city] (best-effort)        — city without state → mapped
//   4. states[stateCode]                 — state-level centroid → approximate
//   5. countries[countryCode]            — country-level → approximate
//   6. nothing                           → unmapped (stays in table, no marker)
//
// Unmapped rows MUST still appear in the table per PRD §6: "If a
// company cannot be mapped, it must still appear in the results table."

import type { IyShipperHit } from '@/lib/api';
import coords from './cityStateCoordinates.json';
import type { UnifiedExplorerRow, MapStatus } from './types';

interface CoordsFile {
  cities: Record<string, [number, number]>;
  states: Record<string, [number, number]>;
  countries: Record<string, [number, number]>;
}

const COORDS = coords as unknown as CoordsFile;

/**
 * Look up a centroid for a (city, state, country) triple. Each piece
 * is optional. Returns null if no usable centroid is found.
 */
export function lookupCentroid(
  city: string | null | undefined,
  state: string | null | undefined,
  country: string | null | undefined,
): { lat: number; lng: number; mapStatus: MapStatus } | null {
  const cityKey = (city ?? '').trim().toLowerCase();
  const stateKey = (state ?? '').trim().toUpperCase();
  const countryKey = (country ?? '').trim().toUpperCase();

  // City + state (best signal)
  if (cityKey && stateKey) {
    const hit = COORDS.cities[`${cityKey}:${stateKey.toLowerCase()}`];
    if (hit) return { lng: hit[0], lat: hit[1], mapStatus: 'mapped' };
  }
  // City alone (lower confidence — there are many "Springfield"s)
  if (cityKey) {
    // Scan keys prefixed by `${cityKey}:` and pick the first match.
    for (const k of Object.keys(COORDS.cities)) {
      if (k.startsWith(`${cityKey}:`)) {
        const hit = COORDS.cities[k];
        return { lng: hit[0], lat: hit[1], mapStatus: 'mapped' };
      }
    }
  }
  // State centroid → approximate
  if (stateKey && COORDS.states[stateKey]) {
    const hit = COORDS.states[stateKey];
    return { lng: hit[0], lat: hit[1], mapStatus: 'approximate' };
  }
  // Country centroid → approximate. INTENTIONALLY skip US here — a US
  // row with no usable state would otherwise pile every such company
  // onto the geographic centroid of the country (~Oklahoma), creating
  // a phantom cluster the user reported on 2026-06-20. Better to mark
  // those rows unmapped and surface them in the results table instead.
  if (countryKey && countryKey !== 'US' && COORDS.countries[countryKey]) {
    const hit = COORDS.countries[countryKey];
    return { lng: hit[0], lat: hit[1], mapStatus: 'approximate' };
  }
  return null;
}

/**
 * Normalise a single IyShipperHit into a UnifiedExplorerRow.
 */
export function normalizeIyShipperHit(hit: IyShipperHit): UnifiedExplorerRow {
  const lookup = lookupCentroid(hit.city, hit.state, hit.countryCode);
  const stableId = hit.key || hit.companyId || hit.domain || hit.name;

  return {
    id: String(stableId),
    company_name: hit.name || hit.title || 'Unnamed account',
    domain: hit.domain ?? hit.website ?? null,
    source_company_key: hit.key ?? null,
    company_id: hit.companyId ?? null,

    city: hit.city ?? null,
    state: hit.state ?? null,
    country: hit.countryCode ?? null,
    latitude: lookup?.lat ?? null,
    longitude: lookup?.lng ?? null,

    industry: null,
    vertical: null,
    revenue: null,
    teu: typeof hit.teusLast12m === 'number' ? hit.teusLast12m : null,
    shipments: typeof hit.shipmentsLast12m === 'number'
      ? hit.shipmentsLast12m
      : (typeof hit.totalShipments === 'number' ? hit.totalShipments : null),
    last_shipment: hit.mostRecentShipment ?? hit.lastShipmentDate ?? null,
    top_origin_country: null,
    top_lane: null,
    opportunity_composite_score: null,

    source: 'importyeti',
    source_label: 'Company Search',
    mapStatus: lookup?.mapStatus ?? 'unmapped',

    raw: hit as unknown as Record<string, unknown>,
  };
}

/**
 * Batch normaliser. Splits the result into (mapped + approximate) vs
 * unmapped so callers can drive separate UI states cleanly:
 * - `rows` is everything the table should render
 * - `mapPoints` is the subset the map should plot
 * - `analytics` is a precomputed metrics block for the header bar
 */
export function normalizeCompanySearchResults(hits: IyShipperHit[]): {
  rows: UnifiedExplorerRow[];
  mapPoints: UnifiedExplorerRow[];
  unmappedCount: number;
  analytics: {
    matchingCompanies: number;
    totalShipments: number;
    mappedLocations: number;
    mostRecentShipment: string | null;
  };
} {
  const rows = hits.map(normalizeIyShipperHit);
  const mapPoints = rows.filter((r) => r.latitude != null && r.longitude != null);
  const unmappedCount = rows.length - mapPoints.length;

  let totalShipments = 0;
  let mostRecent: string | null = null;
  for (const r of rows) {
    if (typeof r.shipments === 'number' && Number.isFinite(r.shipments)) {
      totalShipments += r.shipments;
    }
    if (r.last_shipment) {
      if (!mostRecent || r.last_shipment > mostRecent) mostRecent = r.last_shipment;
    }
  }

  return {
    rows,
    mapPoints,
    unmappedCount,
    analytics: {
      matchingCompanies: rows.length,
      totalShipments,
      mappedLocations: mapPoints.length,
      mostRecentShipment: mostRecent,
    },
  };
}
