import { describe, expect, it } from 'vitest';
import { isAirFreightResearchQuery, AIR_COVERAGE_EXPLANATION } from './airCoverageGuard';

describe('air research source coverage', () => {
  it('blocks air-shipment rankings that directory or ocean data cannot establish', () => {
    expect(isAirFreightResearchQuery('Top 50 Georgia air freight importers from Europe and Turkey')).toBe(true);
    expect(isAirFreightResearchQuery('List air waybill shipments to Atlanta')).toBe(true);
    expect(isAirFreightResearchQuery('Rank companies by AWB volume')).toBe(true);
  });
  it('preserves company name and ocean search', () => {
    expect(isAirFreightResearchQuery('Air Products')).toBe(false);
    expect(isAirFreightResearchQuery('Companies importing ocean freight to Georgia')).toBe(false);
    expect(isAirFreightResearchQuery('Delta Air Lines')).toBe(false);
  });
  it('explains that air volume is unverified', () => {
    expect(AIR_COVERAGE_EXPLANATION).toMatch(/not available/i);
    expect(AIR_COVERAGE_EXPLANATION).toMatch(/air-waybill/i);
  });
});
