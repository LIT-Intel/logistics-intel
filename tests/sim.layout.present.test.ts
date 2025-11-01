import fs from 'node:fs';
import path from 'node:path';

function exists(relativePath: string) {
  return fs.existsSync(path.resolve(process.cwd(), relativePath));
}

test('frontend layout file exists and wires AppShell', () => {
  const layoutPath = 'frontend/src/pages/Layout.jsx';
  expect(exists(layoutPath)).toBe(true);

  const contents = fs.readFileSync(path.resolve(process.cwd(), layoutPath), 'utf8');
  expect(contents).toMatch(/AppShell/);
  expect(contents).toMatch(/DebugOverlay/);
});
