import { expect, it, vi } from 'vitest';
import { readAllRows } from './readAllRows';
it('continues beyond the API row cap and does not publish a failed partial read', async () => {
  const source = Array.from({ length: 2419 }, (_, id) => ({ id }));
  const read = vi.fn(async (from: number, to: number) => ({ data: source.slice(from, to + 1), error: null }));
  expect(await readAllRows(read)).toEqual(source);
  expect(read.mock.calls).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
  await expect(readAllRows(async from => ({ data: from ? null : source.slice(0, 1000), error: from ? new Error('offline') : null }))).rejects.toThrow('offline');
});
