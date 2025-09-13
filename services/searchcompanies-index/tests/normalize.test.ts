import { describe, it, expect } from 'vitest';
import { normalizeSearchCompaniesInput } from '../src/normalize.js';

describe('normalizeSearchCompaniesInput', () => {
  it('accepts shape 1', () => {
    const out = normalizeSearchCompaniesInput({ q: 'acme', mode: 'air', limit: 5, offset: 10 });
    expect(out.data.search.q).toBe('acme');
    expect(out.data.search.mode).toBe('air');
    expect(out.data.pagination.limit).toBe(5);
    expect(out.data.pagination.offset).toBe(10);
  });

  it('accepts shape 2', () => {
    const out = normalizeSearchCompaniesInput({ search: { q: 'oceanx', mode: 'ocean' }, pagination: { limit: 1, offset: 0 }, filters: { origin: ['CN'] } });
    expect(out.data.search.mode).toBe('ocean');
    expect(out.data.filters.origin[0]).toBe('CN');
  });

  it('accepts shape 3', () => {
    const out = normalizeSearchCompaniesInput({ data: { search: { q: 'allx', mode: 'all' }, pagination: { limit: 2, offset: 3 } } });
    expect(out.data.search.mode).toBe('all');
    expect(out.data.pagination.limit).toBe(2);
    expect(out.data.pagination.offset).toBe(3);
  });

  it('defaults missing fields', () => {
    const out = normalizeSearchCompaniesInput({});
    expect(out.data.search.mode).toBe('all');
    expect(out.data.pagination.limit).toBe(25);
    expect(out.data.pagination.offset).toBe(0);
  });

  it('throws 422 with fieldErrors for bad types', () => {
    try {
      // invalid: non-numeric pagination
      normalizeSearchCompaniesInput({ pagination: { limit: 'bad' } as any });
      throw new Error('should have thrown');
    } catch (e: any) {
      expect(e.status).toBe(422);
      expect(e.fieldErrors).toBeTruthy();
    }
  });
});

