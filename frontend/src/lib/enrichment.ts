/**
 * Progressive Enrichment System
 * Handles enrichment of company data with BOL/shipment details
 */

import { iyCompanyBols } from './api';
import type { TradeLane, RegionalBreakdown, Region, CompanyLaneData } from '@/types/lanes';
import { mapStateToRegion, extractStateFromAddress, calculateMarketShare } from '@/types/lanes';

/**
 * Enrichment result containing computed KPIs
 */
export interface EnrichmentResult {
  company_id: string;
  teu_estimate: number;
  fcl_count: number;
  lcl_count: number;
  mode: 'Ocean' | 'Air' | 'Mixed' | null;
  trend: 'up' | 'down' | 'flat';
  lanes?: TradeLane[];
  regions?: Record<Region, RegionalBreakdown>;
  enriched_at: string;
}

/**
 * Enrichment cache entry
 */
interface CacheEntry {
  data: EnrichmentResult;
  timestamp: number;
  ttl: number; // Time to live in milliseconds
}

/**
 * In-memory cache for enriched data
 */
const enrichmentCache = new Map<string, CacheEntry>();

/**
 * Cache TTL: 30 days
 */
const CACHE_TTL = 30 * 24 * 60 * 60 * 1000;

/**
 * Estimate TEU from container data
 * @param containers - Array of container types and counts
 * @returns Estimated TEU volume
 */
export function estimateTEUFromContainers(containers: any[]): number {
  if (!Array.isArray(containers) || containers.length === 0) {
    return 0;
  }

  let totalTEU = 0;

  for (const container of containers) {
    const count = container.count || 0;
    const type = (container.type || '').toLowerCase();

    // Standard container TEU mappings
    if (type.includes('20') || type.includes('20ft')) {
      totalTEU += count * 1; // 20ft = 1 TEU
    } else if (type.includes('40') || type.includes('40ft')) {
      totalTEU += count * 2; // 40ft = 2 TEU
    } else if (type.includes('45') || type.includes('45ft')) {
      totalTEU += count * 2.25; // 45ft = 2.25 TEU
    } else {
      // Default to 20ft equivalent
      totalTEU += count * 1;
    }
  }

  return Math.round(totalTEU);
}

/**
 * Estimate TEU from shipment count (rough heuristic)
 * @param shipmentCount - Number of shipments
 * @returns Estimated TEU
 */
export function estimateTEUFromShipments(shipmentCount: number): number {
  if (shipmentCount === 0) return 0;

  // Average TEU per shipment heuristic
  // Small: 1-100 shipments → avg 5 TEU per shipment
  // Medium: 101-1000 shipments → avg 8 TEU per shipment
  // Large: 1000+ shipments → avg 10 TEU per shipment

  if (shipmentCount <= 100) {
    return Math.round(shipmentCount * 5);
  } else if (shipmentCount <= 1000) {
    return Math.round(shipmentCount * 8);
  } else {
    return Math.round(shipmentCount * 10);
  }
}

/**
 * Determine primary shipping mode from BOL data
 */
export function determinePrimaryMode(bols: any[]): 'Ocean' | 'Air' | 'Mixed' | null {
  if (!Array.isArray(bols) || bols.length === 0) {
    return null;
  }

  let oceanCount = 0;
  let airCount = 0;

  for (const bol of bols) {
    const mode = (bol.mode || bol.transport_mode || '').toLowerCase();
    if (mode.includes('ocean') || mode.includes('sea') || mode.includes('vessel')) {
      oceanCount++;
    } else if (mode.includes('air') || mode.includes('flight')) {
      airCount++;
    }
  }

  const total = oceanCount + airCount;
  if (total === 0) return 'Ocean'; // Default to ocean

  const oceanRatio = oceanCount / total;

  if (oceanRatio > 0.8) return 'Ocean';
  if (oceanRatio < 0.2) return 'Air';
  return 'Mixed';
}

/**
 * Determine shipment trend from time-series data
 */
export function determineShipmentTrend(timeSeries: any[]): 'up' | 'down' | 'flat' {
  if (!Array.isArray(timeSeries) || timeSeries.length < 2) {
    return 'flat';
  }

  // Sort by date
  const sorted = [...timeSeries].sort((a, b) => {
    const dateA = new Date(a.date || a.month || 0).getTime();
    const dateB = new Date(b.date || b.month || 0).getTime();
    return dateA - dateB;
  });

  // Compare last 3 months vs previous 3 months
  const halfPoint = Math.floor(sorted.length / 2);
  const recentHalf = sorted.slice(halfPoint);
  const olderHalf = sorted.slice(0, halfPoint);

  const recentAvg = recentHalf.reduce((sum, item) => sum + (item.shipments || item.count || 0), 0) / recentHalf.length;
  const olderAvg = olderHalf.reduce((sum, item) => sum + (item.shipments || item.count || 0), 0) / olderHalf.length;

  const changeRatio = (recentAvg - olderAvg) / (olderAvg || 1);

  if (changeRatio > 0.1) return 'up';
  if (changeRatio < -0.1) return 'down';
  return 'flat';
}

/**
 * Extract trade lanes from BOL data
 */
export function extractTradeLanes(bols: any[]): TradeLane[] {
  if (!Array.isArray(bols) || bols.length === 0) {
    return [];
  }

  const laneMap = new Map<string, TradeLane>();

  for (const bol of bols) {
    const originPort = bol.origin_port || bol.origin || 'Unknown';
    const originCountry = bol.origin_country_code || bol.origin_country || 'Unknown';
    const destPort = bol.destination_port || bol.dest_port || bol.destination || 'Unknown';
    const destCountry = bol.dest_country_code || bol.destination_country || 'Unknown';

    const laneId = `${originPort},${originCountry}→${destPort},${destCountry}`;

    if (!laneMap.has(laneId)) {
      laneMap.set(laneId, {
        id: laneId,
        origin_port: originPort,
        origin_country: originCountry,
        destination_port: destPort,
        destination_country: destCountry,
        shipment_count: 0,
        teu_volume: 0,
        fcl_count: 0,
        lcl_count: 0,
        suppliers: [],
      });
    }

    const lane = laneMap.get(laneId)!;
    lane.shipment_count++;

    // Count FCL/LCL
    const containerType = (bol.container_type || '').toLowerCase();
    if (containerType.includes('fcl')) {
      lane.fcl_count++;
    } else if (containerType.includes('lcl')) {
      lane.lcl_count++;
    }

    // Add supplier
    const supplier = bol.supplier || bol.shipper || bol.consignor;
    if (supplier && !lane.suppliers.includes(supplier)) {
      lane.suppliers.push(supplier);
    }

    // Update last shipment date
    const shipmentDate = bol.date || bol.shipment_date || bol.bill_date;
    if (shipmentDate) {
      if (!lane.last_shipment_date || new Date(shipmentDate) > new Date(lane.last_shipment_date)) {
        lane.last_shipment_date = shipmentDate;
      }
    }
  }

  return Array.from(laneMap.values()).sort((a, b) => b.shipment_count - a.shipment_count);
}

/**
 * Extract regional breakdowns from BOL data
 */
export function extractRegionalData(bols: any[]): Record<Region, RegionalBreakdown> {
  if (!Array.isArray(bols) || bols.length === 0) {
    return {} as Record<Region, RegionalBreakdown>;
  }

  const regionMap = new Map<Region, RegionalBreakdown>();

  for (const bol of bols) {
    // Extract state from destination address
    const destAddress = bol.destination_address || bol.dest_address || '';
    const state = extractStateFromAddress(destAddress) || bol.dest_state || bol.destination_state;
    const region = mapStateToRegion(state);

    if (!regionMap.has(region)) {
      regionMap.set(region, {
        region,
        shipment_count: 0,
        teu_volume: 0,
        fcl_count: 0,
        lcl_count: 0,
        market_share: 0,
        top_suppliers: [],
      });
    }

    const regionData = regionMap.get(region)!;
    regionData.shipment_count++;

    // Count FCL/LCL
    const containerType = (bol.container_type || '').toLowerCase();
    if (containerType.includes('fcl')) {
      regionData.fcl_count++;
    } else if (containerType.includes('lcl')) {
      regionData.lcl_count++;
    }

    // Track suppliers
    const supplier = bol.supplier || bol.shipper || bol.consignor;
    if (supplier && !regionData.top_suppliers.includes(supplier)) {
      regionData.top_suppliers.push(supplier);
    }
  }

  // Calculate market shares
  const totalShipments = bols.length;
  for (const [, regionData] of regionMap) {
    regionData.market_share = (regionData.shipment_count / totalShipments) * 100;
    // Keep only top 5 suppliers
    regionData.top_suppliers = regionData.top_suppliers.slice(0, 5);
  }

  const result: Record<Region, RegionalBreakdown> = {} as any;
  for (const [region, data] of regionMap) {
    result[region] = data;
  }

  return result;
}

/**
 * Enrich company data with BOL details
 * @param companyKey - ImportYeti company key (e.g., "company/wahoo-fitness")
 * @returns Enrichment result with KPIs
 */
export async function enrichCompanyWithSnapshot(
  companyKey: string
): Promise<EnrichmentResult | null> {
  try {
    // Check cache first
    const cached = getFromCache(companyKey);
    if (cached) {
      return cached;
    }

    // Fetch BOL data
    const response = await iyCompanyBols({
      company_id: companyKey,
      limit: 500, // Fetch up to 500 BOLs for analysis
      offset: 0,
    });

    if (!response || !response.ok || !Array.isArray(response.rows)) {
      return null;
    }

    const bols = response.rows;

    // Compute enrichment data
    const teuEstimate = estimateTEUFromContainers(bols.flatMap(b => b.containers || []));
    const fclCount = bols.filter(b => (b.container_type || '').toLowerCase().includes('fcl')).length;
    const lclCount = bols.filter(b => (b.container_type || '').toLowerCase().includes('lcl')).length;
    const mode = determinePrimaryMode(bols);
    const trend = determineShipmentTrend(bols);
    const lanes = extractTradeLanes(bols);
    const regions = extractRegionalData(bols);

    const result: EnrichmentResult = {
      company_id: companyKey,
      teu_estimate: teuEstimate,
      fcl_count: fclCount,
      lcl_count: lclCount,
      mode,
      trend,
      lanes,
      regions,
      enriched_at: new Date().toISOString(),
    };

    // Cache the result
    saveToCache(companyKey, result);

    return result;
  } catch (error) {
    console.error('Enrichment failed for', companyKey, error);
    return null;
  }
}

/**
 * Get enrichment data from cache
 */
export function getFromCache(companyKey: string): EnrichmentResult | null {
  const entry = enrichmentCache.get(companyKey);
  if (!entry) return null;

  const now = Date.now();
  if (now - entry.timestamp > entry.ttl) {
    // Cache expired
    enrichmentCache.delete(companyKey);
    return null;
  }

  return entry.data;
}

/**
 * Save enrichment data to cache
 */
export function saveToCache(companyKey: string, data: EnrichmentResult): void {
  enrichmentCache.set(companyKey, {
    data,
    timestamp: Date.now(),
    ttl: CACHE_TTL,
  });

  // Also save to localStorage for persistence
  try {
    const key = `lit_enriched_${companyKey}`;
    localStorage.setItem(key, JSON.stringify({
      data,
      timestamp: Date.now(),
    }));
  } catch (error) {
    console.warn('Failed to save to localStorage:', error);
  }
}

/**
 * Load enrichment data from localStorage
 */
export function loadFromLocalStorage(companyKey: string): EnrichmentResult | null {
  try {
    const key = `lit_enriched_${companyKey}`;
    const stored = localStorage.getItem(key);
    if (!stored) return null;

    const parsed = JSON.parse(stored);
    const age = Date.now() - parsed.timestamp;

    if (age > CACHE_TTL) {
      // Expired
      localStorage.removeItem(key);
      return null;
    }

    return parsed.data;
  } catch (error) {
    console.warn('Failed to load from localStorage:', error);
    return null;
  }
}

/**
 * Clear all enrichment caches
 */
export function clearEnrichmentCache(): void {
  enrichmentCache.clear();

  // Clear localStorage entries
  try {
    const keys = Object.keys(localStorage);
    for (const key of keys) {
      if (key.startsWith('lit_enriched_')) {
        localStorage.removeItem(key);
      }
    }
  } catch (error) {
    console.warn('Failed to clear localStorage:', error);
  }
}

/**
 * Batch enrich multiple companies
 * @param companyKeys - Array of company keys to enrich
 * @param onProgress - Progress callback
 */
export async function batchEnrichCompanies(
  companyKeys: string[],
  onProgress?: (completed: number, total: number) => void
): Promise<Map<string, EnrichmentResult | null>> {
  const results = new Map<string, EnrichmentResult | null>();

  for (let i = 0; i < companyKeys.length; i++) {
    const key = companyKeys[i];
    const result = await enrichCompanyWithSnapshot(key);
    results.set(key, result);

    if (onProgress) {
      onProgress(i + 1, companyKeys.length);
    }

    // Small delay to avoid rate limiting
    if (i < companyKeys.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  return results;
}
