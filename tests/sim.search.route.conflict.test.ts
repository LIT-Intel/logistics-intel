import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from 'vitest';

function exists(p: string) {
  return fs.existsSync(path.resolve(process.cwd(), p));
}

test('only one /search page is routed', () => {
  const candidates = [
    'src/app/search/page.tsx',
    'app/search/page.tsx',
    'src/app/unified-search/page.tsx',
    'app/unified-search/page.tsx',
  ].filter(exists);

  expect(candidates).toContain('src/app/search/page.tsx');
  expect(candidates.filter((p) => p.includes('search/page.tsx')).length).toBe(1);
  expect(exists('src/app/unified-search/page.tsx')).toBe(false);
  expect(exists('app/unified-search/page.tsx')).toBe(false);
});
