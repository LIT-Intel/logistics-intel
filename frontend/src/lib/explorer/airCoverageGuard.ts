/** Guard requests that would otherwise silently substitute ocean-directory data for air waybills. */
export function isAirFreightResearchQuery(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const q = value.toLowerCase();
  // Do not intercept general company names (e.g. Air Products) or airline lookups.
  return /\b(?:air\s*freight|air\s*cargo|air\s*shipments?|air\s*waybills?|awb|mawb|hawb|airfreight)\b/i.test(q)
    && /\b(?:import|export|shipment|shipper|companies|accounts|list|rank|top|volume|from|to)\b/i.test(q);
}
export const AIR_COVERAGE_EXPLANATION =
  'Verified air-waybill company rankings are not available from this Search dataset. ' +
  'Current company and BOL metrics cannot establish air shipments, exact routes or counts. ' +
  'Try an ocean-freight search or a company-name lookup; air-intelligence coverage requires a separately validated source.';
