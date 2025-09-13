import ftest from 'firebase-functions-test';
import { describe, it, expect } from 'vitest';
import * as mod from '../index.js';

const test = ftest();
function wrap(name){ return test.wrap(mod[name]); }

describe('searchCompanies_index normalizer', () => {
  it('shape 1 ok', async () => {
    const fn = wrap('searchCompanies_index');
    const res = await fn({ q: 'acme', mode: 'air', limit: 5, offset: 1 });
    expect(res.normalized.data.search.q).toBe('acme');
    expect(res.normalized.data.search.mode).toBe('air');
    expect(res.normalized.data.pagination.limit).toBe(5);
    expect(res.normalized.data.pagination.offset).toBe(1);
  });

  it('shape 2 ok', async () => {
    const fn = wrap('searchCompanies_index');
    const res = await fn({ search: { q: 'x', mode: 'ocean' }, pagination: { limit: 2 } });
    expect(res.normalized.data.search.mode).toBe('ocean');
    expect(res.normalized.data.pagination.limit).toBe(2);
  });

  it('shape 3 ok', async () => {
    const fn = wrap('searchCompanies_index');
    const res = await fn({ data: { search: { q: 'y', mode: 'all' }, pagination: { limit: 1, offset: 0 } } });
    expect(res.normalized.data.search.mode).toBe('all');
    expect(res.normalized.data.pagination.limit).toBe(1);
  });

  it('invalid returns error with fieldErrors', async () => {
    const fn = wrap('searchCompanies_index');
    const res = await fn({ pagination: { limit: 'bad' } });
    expect(res.error).toBe('invalid_input');
  });
});

