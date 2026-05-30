/**
 * Golden-path E2E smoke tests.
 *
 * These are deliberately shallow. They prove the app renders, the marketing
 * site renders, and basic anonymous routing works. They do NOT exercise
 * authenticated flows (signup, search, save, campaign, billing checkout) —
 * those depend on a Stripe-test-mode + Supabase-test-project fixture that
 * needs a separate setup pass (item 13 of the upgrade path).
 *
 * Run:
 *   npx playwright test
 *   LIT_E2E_BASE_URL=http://localhost:5173 npx playwright test
 */
import { expect, test } from "@playwright/test";

test.describe("app smoke", () => {
  test("login page renders the Supabase-backed sign-in form (not Clerk)", async ({
    page,
  }) => {
    await page.goto("/login");

    // Clerk surface — must NOT be present (was removed 2026-05-28).
    const clerkHits = await page
      .locator("[data-clerk-id], iframe[src*='clerk.com']")
      .count();
    expect(clerkHits, "Clerk widgets should not appear on /login").toBe(0);

    // Supabase-backed ModernLoginPage should render an email field.
    await expect(
      page.getByRole("textbox", { name: /email/i }),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("signup page renders the Supabase-backed signup form (not Clerk)", async ({
    page,
  }) => {
    await page.goto("/signup");
    const clerkHits = await page
      .locator("[data-clerk-id], iframe[src*='clerk.com']")
      .count();
    expect(clerkHits, "Clerk widgets should not appear on /signup").toBe(0);
    await expect(
      page.getByRole("textbox", { name: /email/i }),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("authenticated app routes redirect anonymous users to /login", async ({
    page,
  }) => {
    await page.goto("/app/dashboard");
    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
  });

  test("public pages return 200 + expected title", async ({ page }) => {
    const resp = await page.goto("/login");
    expect(resp?.status(), "/login should return 200").toBeLessThan(400);
    const title = await page.title();
    expect(title.toLowerCase()).toContain("logistic"); // covers "logistic intel", "logisticintel", etc.
  });
});
