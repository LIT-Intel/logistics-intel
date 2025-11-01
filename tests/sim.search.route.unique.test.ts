import fs from 'node:fs';
import path from 'node:path';

function exists(relativePath: string) {
  return fs.existsSync(path.resolve(process.cwd(), relativePath));
}

test('only one canonical /search page exists in frontend', () => {
  expect(exists('frontend/src/app/search/page.tsx')).toBe(true);
  expect(exists('frontend/src/app/unified-search/page.tsx')).toBe(false);
  expect(exists('frontend/src/pages/Search.tsx')).toBe(false);
  expect(exists('frontend/src/pages/search/index.tsx')).toBe(false);
});
