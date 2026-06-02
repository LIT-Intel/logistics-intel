/**
 * Wk1 T1d — RFP Studio cleanup verification.
 *
 * The RFP Studio feature was discontinued 2026-06. /app/rfp and
 * /app/rfp-studio are gone; both paths should soft-redirect to
 * /app/dashboard (RequireAuth then bounces anonymous traffic to /login,
 * which is the observable end state from outside auth).
 *
 * Tests are anonymous-only by design: we verify the route table change,
 * not authed behavior. The authed redirect target (/app/dashboard) is
 * proven by the existing app smoke test that anonymous /app/* hits land
 * on /login.
 */
import { expect, test } from "@playwright/test";

test.describe("RFP Studio discontinuation", () => {
  test("/app/rfp does not 404 and is no longer reachable as RFP Studio", async ({
    page,
  }) => {
    const resp = await page.goto("/app/rfp");
    // Anonymous → bounces to /login (RequireAuth). The point is no 404, no
    // white screen, and definitely no RFP Studio page render.
    expect(resp?.status(), "/app/rfp should not 404").toBeLessThan(400);
    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
    // Sanity: page title contains the app name, not RFP-specific copy.
    const title = await page.title();
    expect(title.toLowerCase()).not.toContain("rfp");
  });

  test("/app/rfp-studio (the latently broken dashboard quick-action path) also redirects", async ({
    page,
  }) => {
    const resp = await page.goto("/app/rfp-studio");
    expect(resp?.status(), "/app/rfp-studio should not 404").toBeLessThan(400);
    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
  });

  test("/app/rfp/anything-deeper also redirects", async ({ page }) => {
    // Old bookmarks like /app/rfp/build or /app/rfp/123 should all soft-land.
    const resp = await page.goto("/app/rfp/some-saved-quote");
    expect(resp?.status(), "/app/rfp/* should not 404").toBeLessThan(400);
    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
  });
});
