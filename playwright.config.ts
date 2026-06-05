// Playwright E2E config for LIT golden-path tests.
//
// Default targets the staging URL; set LIT_E2E_BASE_URL to point at a local
// dev server, a Vercel preview, or a custom domain. Tests live in
// tests/e2e/*.spec.ts.
//
// Run locally:
//   npx playwright install --with-deps chromium
//   LIT_E2E_BASE_URL=https://app.logisticintel.com npx playwright test
//
// CI: see .github/workflows/e2e.yml (added in a follow-up commit when
// staging is reliable enough to gate PRs on green E2E).
import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.LIT_E2E_BASE_URL ?? "https://app.logisticintel.com";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : 1,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL,
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: process.env.CI ? "retain-on-failure" : "off",
    ignoreHTTPSErrors: true,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
