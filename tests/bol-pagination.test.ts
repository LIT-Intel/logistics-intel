import { expect, it } from 'vitest';
import { bolPage, bolPageResponse } from '../supabase/functions/_shared/bol_pagination';
it('bounds page parameters without dropping the offset', () => {
  expect(bolPage({ limit: 200, offset: 50 })).toEqual({ limit: 200, offset: 50 });
  expect(bolPage({ limit: Infinity, offset: -1 })).toEqual({ limit: 250, offset: 0 });
  expect(bolPage({ limit: 9999, offset: 2.8 })).toEqual({ limit: 500, offset: 2 });
});
it('does not claim a page length is the company total', () => {
  expect(bolPageResponse(Array(50), {}, 50, 0)).toMatchObject({ total: null, returned_count: 50, has_more: true, coverage: 'unknown' });
  expect(bolPageResponse(Array(19), { total: 119 }, 50, 100)).toMatchObject({ total: 119, has_more: false });
  expect(bolPageResponse(Array(10), {}, 250, 50)).toMatchObject({ total:null,has_more:true,next_offset:60 });
});
