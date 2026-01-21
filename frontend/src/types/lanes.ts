/**
 * Trade Lane and Regional Data Types
 * For filtering suppliers and shipments by lane and geographic region
 */

/**
 * US Geographic Regions for filtering
 */
export type Region =
  | 'Southeast'
  | 'Northeast'
  | 'Southwest'
  | 'Northwest'
  | 'Midwest'
  | 'West'
  | 'International';

/**
 * Trade lane representing origin → destination shipping route
 */
export interface TradeLane {
  /** Unique identifier for the lane */
  id: string;
  /** Origin port name (e.g., "Shanghai, CN") */
  origin_port: string;
  /** Origin country code (e.g., "CN") */
  origin_country: string;
  /** Destination port name (e.g., "Los Angeles, US") */
  destination_port: string;
  /** Destination country code (e.g., "US") */
  destination_country: string;
  /** Number of shipments on this lane */
  shipment_count: number;
  /** Total TEU volume */
  teu_volume: number;
  /** Number of FCL shipments */
  fcl_count: number;
  /** Number of LCL shipments */
  lcl_count: number;
  /** Suppliers active on this lane */
  suppliers: string[];
  /** Average transit time in days (optional) */
  avg_transit_days?: number;
  /** Most recent shipment date on this lane */
  last_shipment_date?: string;
}

/**
 * Supplier associated with a specific trade lane
 */
export interface LaneSupplier {
  /** Supplier name */
  supplier_name: string;
  /** Lane identifier (e.g., "Shanghai,CN→Los Angeles,US") */
  lane: string;
  /** Number of shipments with this supplier on this lane */
  shipment_count: number;
  /** TEU volume with this supplier */
  teu_volume?: number;
  /** Percentage of total lane volume */
  market_share?: number;
}

/**
 * Regional breakdown of shipments and suppliers
 */
export interface RegionalBreakdown {
  /** Region identifier */
  region: Region;
  /** Number of shipments to/from this region */
  shipment_count: number;
  /** Total TEU volume */
  teu_volume: number;
  /** Number of FCL shipments */
  fcl_count: number;
  /** Number of LCL shipments */
  lcl_count: number;
  /** Market share percentage (0-1) */
  market_share: number;
  /** Top suppliers serving this region */
  top_suppliers: string[];
  /** Primary destination cities in this region */
  top_cities?: string[];
  /** Growth rate YoY (optional) */
  growth_rate?: number;
}

/**
 * Supplier associated with a specific region
 */
export interface RegionSupplier {
  /** Supplier name */
  supplier_name: string;
  /** Region identifier */
  region: Region;
  /** Number of shipments in this region */
  shipment_count: number;
  /** TEU volume in this region */
  teu_volume?: number;
  /** Percentage of regional volume */
  market_share?: number;
}

/**
 * Filter type for suppliers and charts
 */
export type FilterType = 'all' | 'lane' | 'region';

/**
 * Filter state for UI components
 */
export interface FilterState {
  /** Current filter type */
  type: FilterType;
  /** Selected lane (when type is 'lane') */
  selectedLane?: string | null;
  /** Selected region (when type is 'region') */
  selectedRegion?: Region | null;
}

/**
 * Aggregated lane data for a company
 */
export interface CompanyLaneData {
  /** Company identifier */
  company_id: string;
  /** All trade lanes for this company */
  lanes: TradeLane[];
  /** Regional breakdowns */
  regions: Record<Region, RegionalBreakdown>;
  /** Suppliers by lane */
  suppliers_by_lane: LaneSupplier[];
  /** Suppliers by region */
  suppliers_by_region: RegionSupplier[];
  /** Last updated timestamp */
  updated_at: string;
}

/**
 * US State to Region mapping
 */
export const STATE_TO_REGION: Record<string, Region> = {
  // Southeast
  'FL': 'Southeast',
  'GA': 'Southeast',
  'SC': 'Southeast',
  'NC': 'Southeast',
  'VA': 'Southeast',
  'AL': 'Southeast',
  'MS': 'Southeast',
  'LA': 'Southeast',
  'AR': 'Southeast',
  'TN': 'Southeast',
  'KY': 'Southeast',

  // Northeast
  'ME': 'Northeast',
  'NH': 'Northeast',
  'VT': 'Northeast',
  'MA': 'Northeast',
  'RI': 'Northeast',
  'CT': 'Northeast',
  'NY': 'Northeast',
  'NJ': 'Northeast',
  'PA': 'Northeast',
  'DE': 'Northeast',
  'MD': 'Northeast',
  'DC': 'Northeast',

  // Southwest
  'AZ': 'Southwest',
  'NM': 'Southwest',
  'TX': 'Southwest',
  'OK': 'Southwest',

  // Northwest
  'WA': 'Northwest',
  'OR': 'Northwest',
  'ID': 'Northwest',
  'MT': 'Northwest',
  'WY': 'Northwest',

  // Midwest
  'ND': 'Midwest',
  'SD': 'Midwest',
  'NE': 'Midwest',
  'KS': 'Midwest',
  'MN': 'Midwest',
  'IA': 'Midwest',
  'MO': 'Midwest',
  'WI': 'Midwest',
  'IL': 'Midwest',
  'IN': 'Midwest',
  'MI': 'Midwest',
  'OH': 'Midwest',

  // West
  'CA': 'West',
  'NV': 'West',
  'UT': 'West',
  'CO': 'West',

  // Alaska & Hawaii -> West
  'AK': 'West',
  'HI': 'West',
};

/**
 * Map state code to region
 * @param state - US state code (e.g., "CA")
 * @returns Region or 'International' if not found
 */
export function mapStateToRegion(state: string | null | undefined): Region {
  if (!state) return 'International';
  const normalized = state.toUpperCase().trim();
  return STATE_TO_REGION[normalized] || 'International';
}

/**
 * Get region display name
 */
export function getRegionDisplayName(region: Region): string {
  return region;
}

/**
 * Get region color for UI elements
 */
export function getRegionColor(region: Region): string {
  const colors: Record<Region, string> = {
    'Southeast': '#10B981', // green
    'Northeast': '#3B82F6', // blue
    'Southwest': '#F59E0B', // amber
    'Northwest': '#8B5CF6', // violet
    'Midwest': '#EF4444', // red
    'West': '#06B6D4', // cyan
    'International': '#6B7280', // gray
  };
  return colors[region];
}

/**
 * Format lane identifier
 * @param lane - Trade lane object
 * @returns Formatted string "Shanghai, CN → Los Angeles, US"
 */
export function formatLaneIdentifier(lane: TradeLane): string {
  return `${lane.origin_port} → ${lane.destination_port}`;
}

/**
 * Parse address to extract state
 * @param address - Full address string
 * @returns State code or null
 */
export function extractStateFromAddress(address: string | null | undefined): string | null {
  if (!address) return null;

  // Match common US state patterns
  // Format: "123 Street, City, ST 12345"
  const stateMatch = address.match(/,\s*([A-Z]{2})\s*(?:\d{5})?/);
  if (stateMatch) {
    return stateMatch[1];
  }

  return null;
}

/**
 * Calculate market share percentage
 */
export function calculateMarketShare(itemVolume: number, totalVolume: number): number {
  if (totalVolume === 0) return 0;
  return (itemVolume / totalVolume) * 100;
}
