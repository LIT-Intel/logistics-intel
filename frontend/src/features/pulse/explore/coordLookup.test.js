import { describe, it, expect } from 'vitest';
import { lookupCoords } from './coordLookup';

describe('lookupCoords fallback chain', () => {
  it('returns city coord when city + state known', () => {
    const c = lookupCoords({ city: 'Los Angeles', state: 'CA', country: 'USA' });
    expect(c).toBeTruthy();
    expect(c.source).toBe('metro');
  });

  it('falls back to state centroid when city unknown', () => {
    const c = lookupCoords({ city: 'Nowhere', state: 'TX', country: 'USA' });
    expect(c.source).toBe('state');
  });

  it('falls back to country centroid when state unknown', () => {
    const c = lookupCoords({ city: 'Nowhere', state: 'XX', country: 'CHN' });
    expect(c.source).toBe('country');
  });

  it('returns null when nothing resolves', () => {
    expect(lookupCoords({ city: 'Nowhere' })).toBeNull();
  });
});
