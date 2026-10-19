import { describe, expect, it } from 'vitest';
import { cadenceCounts, explicitForwarder, laneCoverage } from './intelEvidence';
import { ScopedMemoryCache } from './scopedMemoryCache';

describe('shipment evidence', () => {
  it('reports missing coverage without scaling 50 BOLs to 1419 shipments', () => {
    expect(laneCoverage(50, 1419)).toEqual({ observed: 50, reported: 1419, missing: 1369, conflict: false });
    expect(laneCoverage(60, 50).conflict).toBe(true);
    expect(laneCoverage(50, null).missing).toBeNull();
  });
  it('does not identify a supplier or notify party as a forwarder', () => {
    expect(explicitForwarder({ supplier: 'Factory', notify_party: 'Buyer', shipper_name: 'Exporter', providerName: 'Unknown role' })).toBeNull();
    expect(explicitForwarder({ raw: { forwarder_name: ' DSV ' } })).toBe('DSV');
  });
  it('preserves unclassified ocean volume and real zero totals', () => {
    expect(cadenceCounts({ shipments: 100, fclShipments: 60, lclShipments: 10 })).toEqual({ total: 100, fcl: 60, lcl: 10, unknown: 30 });
    expect(cadenceCounts({ shipments: 100 }).unknown).toBe(100);
    expect(cadenceCounts({ shipments: 0, fclShipments: 10 })).toEqual({ total: 0, fcl: 0, lcl: 0, unknown: 0 });
    expect(cadenceCounts({ shipments: 8, fclShipments: 10 }).unknown).toBe(8);
  });
});

describe('account cache isolation', () => {
  it('isolates users and expires stale entries', () => {
    const cache = new ScopedMemoryCache<string[]>(100);
    cache.set('alice:org:pro', ['private account'], 0);
    expect(cache.get('alice:org:pro', 99)).toEqual(['private account']);
    expect(cache.get('bob:org:pro', 99)).toBeUndefined();
    expect(cache.get('alice:org:free', 99)).toBeUndefined();
    expect(cache.get('alice:org:pro', 100)).toBeUndefined();
  });
  it('refuses unresolved scopes and clears on logout', () => {
    const cache = new ScopedMemoryCache<number>();
    cache.set('', 1); expect(cache.get('')).toBeUndefined();
    cache.set('alice', 2); cache.clear(); expect(cache.get('alice')).toBeUndefined();
  });
});
