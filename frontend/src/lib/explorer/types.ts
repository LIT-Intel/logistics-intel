// Shared types for the unified Intelligence Explorer (Search + Pulse).
//
// The shell renders BOTH tabs through the same map / quick-card / chip
// row / analytics bar. To make that possible without coupling those
// components to either ImportYeti's response shape OR pulse-explore's
// row shape, every row passes through a `UnifiedExplorerRow` adapter
// before it touches a shared surface.
//
// IyShipperHit  ─┐
//                ├─► normalize → UnifiedExplorerRow → map / table / quick card
// PulseRow       ─┘
//
// Per the PRD section 4 non-negotiable: we do NOT rename IyShipperHit
// or any existing pulse-explore types. The adapter is one-way and
// preserves the original row at `raw` for any tab-specific logic.

import type { ExplorerMode } from '@/components/explorer/ExplorerContext';

/** Result of looking a row up in the city/state centroid file. */
export type MapStatus =
  | 'mapped'        // exact lat/lng or city-level centroid found
  | 'approximate'   // state- or country-level centroid only
  | 'unmapped';     // no usable geography — stays in the table, no marker

/**
 * A single company row, normalised so it can be rendered by either
 * tab's table / card UI and plotted by the shared ExplorerMap.
 *
 * Field naming intentionally mirrors lit_companies / lit_company_directory
 * column names so existing components (ExploreAccountTable,
 * ExploreAccountCards) can consume it with minimal renaming.
 */
export interface UnifiedExplorerRow {
  /** Stable client-side id. Falls back to source_company_key or domain. */
  id: string;

  // Identity
  company_name: string;
  domain?: string | null;
  source_company_key?: string | null;
  company_id?: string | null;

  // Geography
  city?: string | null;
  state?: string | null;
  country?: string | null;
  /** Set by the normaliser via cityStateCoordinates.json. */
  latitude?: number | null;
  longitude?: number | null;

  // Operational metrics — both Search and Pulse can populate
  // a subset. The shared table renders the columns Pulse already
  // shows; Search results fill what it knows and leave the rest null.
  industry?: string | null;
  vertical?: string | null;
  revenue?: number | null;
  teu?: number | null;
  shipments?: number | null;
  last_shipment?: string | null;
  top_origin_country?: string | null;
  top_lane?: string | null;
  opportunity_composite_score?: number | null;

  /** Which side of the merge this row came from. */
  source: 'importyeti' | 'pulse' | 'crm' | 'local';

  /** Provenance label — used by the chip row + table source column. */
  source_label: 'Company Search' | 'Pulse Explorer' | 'CRM' | 'Database';

  /** Map-plot resolution outcome. */
  mapStatus: MapStatus;

  /**
   * Original row from the upstream API (IyShipperHit or pulse-explore
   * row). Preserved so tab-specific actions (save, refresh, open detail)
   * can use the canonical fields they expect.
   */
  raw: Record<string, unknown>;
}

/**
 * A row that has resolved to a map coordinate. Pulse's ExploreMap
 * accepts this subset directly so no second adapter is needed.
 */
export interface ExplorerCompanyMapPoint {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  city?: string | null;
  state?: string | null;
  industry?: string | null;
  source: UnifiedExplorerRow['source'];
}

export type { ExplorerMode };

/** Card-grid vs table render mode. Mode-aware. */
export type ExplorerResultsRender = 'cards' | 'table';

/**
 * Tab-specific analytics block. Pulse already computes its own totals
 * inside PulseExploreTab; Company Search computes from the
 * UnifiedExplorerRow[] in the normaliser callsite.
 */
export interface ExplorerAnalyticsMetric {
  key: string;
  label: string;
  value: string;
  hint?: string;
}
