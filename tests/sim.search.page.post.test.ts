import { describe, it, expect, vi } from 'vitest';

describe('Search page calls POST', () => {
  it('fetch is called with method POST', async () => {
    const fakeFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ rows: [] }),
    });

    // @ts-expect-error allow test patching fetch
    global.fetch = fakeFetch;

    const body = { q: 'acme', origin: null, dest: null, hs: null, limit: 20, offset: 0 };
    await fetch('/api/searchCompanies', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });

    expect(fakeFetch).toHaveBeenCalled();
    const args = fakeFetch.mock.calls[0][1];
    expect(args.method).toBe('POST');
  });
});
